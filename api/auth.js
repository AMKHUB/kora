import {
  clearAuthCookies,
  clearPkceCookie,
  createAnonClient,
  createPkcePair,
  createUserClient,
  frAuthError,
  getOrigin,
  getQuery,
  getSessionContext,
  getSupabaseConfig,
  isBillingSimulation,
  readJsonBody,
  readPkceCookie,
  sanitizeUser,
  sendJson,
  setAuthCookies,
  setPkceCookie
} from '../server/supabaseServer.js'

async function exchangePkceCode(code, verifier) {
  const { url, key } = getSupabaseConfig()
  const resp = await fetch(`${url}/auth/v1/token?grant_type=pkce`, {
    method: 'POST',
    headers: { apikey: key, 'Content-Type': 'application/json' },
    body: JSON.stringify({ auth_code: code, code_verifier: verifier })
  })
  const data = await resp.json().catch(() => ({}))
  if (!resp.ok || !data?.access_token) {
    return { error: data?.error_description || data?.msg || data?.message || 'Impossible de finaliser la connexion Google.' }
  }
  return { session: data, user: data.user }
}

async function resolveRole(accessToken, userId) {
  const sb = createUserClient(accessToken)
  if (!sb || !userId) return 'user'
  const { data } = await sb.from('accounts').select('role').eq('id', userId).maybeSingle()
  return data?.role || 'user'
}

export default async function handler(req, res) {
  const q = getQuery(req)
  const action = q.get('action') || ''
  const origin = getOrigin(req)
  const cfg = getSupabaseConfig()

  if (action === 'session') {
    const ctx = await getSessionContext(req, res)
    return sendJson(res, 200, {
      configured: cfg.configured,
      billingMode: isBillingSimulation() ? 'simulation' : 'live',
      user: sanitizeUser(ctx.user),
      role: ctx.role
    })
  }

  if (!cfg.configured) {
    return sendJson(res, 503, { error: 'Authentification serveur non configurée.' })
  }

  // Démarrage OAuth Google (PKCE géré 100 % côté serveur, aucune clé API côté client)
  if (action === 'google' && req.method === 'GET') {
    const app = q.get('app') === 'studio' ? 'studio' : 'kora'
    const { verifier, challenge } = createPkcePair()
    setPkceCookie(req, res, { verifier, app, flow: 'google' })
    const redirectTo = `${origin}/api/auth?action=callback`
    const authUrl = `${cfg.url}/auth/v1/authorize?provider=google&redirect_to=${encodeURIComponent(redirectTo)}&code_challenge=${encodeURIComponent(challenge)}&code_challenge_method=s256&access_type=offline&prompt=select_account`
    res.setHeader('Cache-Control', 'no-store')
    return res.redirect(302, authUrl)
  }

  // Callback serveur (Google OAuth PKCE, Confirmation d'e-mail token_hash, Réinitialisation mot de passe)
  if (action === 'callback' && req.method === 'GET') {
    const pkce = readPkceCookie(req)
    const app = q.get('app') === 'studio' || pkce?.app === 'studio' ? 'studio' : 'kora'
    const flow = q.get('flow') || pkce?.flow || ''
    const errDesc = q.get('error_description') || q.get('error')
    const code = q.get('code')
    const tokenHash = q.get('token_hash')
    const type = q.get('type') || ''

    const targetError = (msg) => {
      const m = encodeURIComponent(frAuthError(msg))
      if (flow === 'recovery' || type === 'recovery') {
        return app === 'studio' ? `/studio/?recovery_error=${m}` : `/#/reinitialisation?status=error&msg=${m}`
      }
      if (flow === 'confirm' || type === 'signup' || type === 'email') {
        return app === 'studio' ? `/studio/?confirm_error=${m}` : `/#/confirmation?status=error&msg=${m}`
      }
      return app === 'studio' ? `/studio/?auth_error=${m}` : `/#/connexion?error=${m}`
    }

    if (errDesc) {
      clearPkceCookie(req, res)
      return res.redirect(302, targetError(errDesc))
    }

    if (tokenHash && type) {
      const anon = createAnonClient()
      const { data, error } = await anon.auth.verifyOtp({ token_hash: tokenHash, type })
      clearPkceCookie(req, res)
      if (error || !data?.session) {
        return res.redirect(302, targetError(error?.message || 'Lien invalide ou expiré.'))
      }
      setAuthCookies(req, res, data.session)
      if (type === 'recovery' || flow === 'recovery') {
        return res.redirect(302, app === 'studio' ? '/studio/?recovery=1' : '/#/reinitialisation?step=new')
      }
      return res.redirect(302, app === 'studio' ? '/studio/?confirmed=1' : '/#/confirmation?status=ok')
    }

    if (code) {
      if (!pkce?.verifier) {
        clearPkceCookie(req, res)
        return res.redirect(302, targetError('Session de vérification expirée. Veuillez recommencer.'))
      }
      const ex = await exchangePkceCode(code, pkce.verifier)
      clearPkceCookie(req, res)
      if (ex.error || !ex.session) {
        return res.redirect(302, targetError(ex.error))
      }
      setAuthCookies(req, res, ex.session)
      if (flow === 'recovery') {
        return res.redirect(302, app === 'studio' ? '/studio/?recovery=1' : '/#/reinitialisation?step=new')
      }
      if (flow === 'confirm') {
        return res.redirect(302, app === 'studio' ? '/studio/?confirmed=1' : '/#/confirmation?status=ok')
      }
      return res.redirect(302, app === 'studio' ? '/studio/' : '/#/')
    }

    // Si Supabase renvoie des jetons dans le #fragment (non visibles côté serveur),
    // une redirection 302 sans '#' préserve le fragment côté navigateur pour que l'app l'échange via /api/auth?action=verify-hash.
    const dest = app === 'studio'
      ? `/studio/?auth_flow=${encodeURIComponent(flow || 'confirm')}`
      : `/?auth_flow=${encodeURIComponent(flow || 'confirm')}`
    return res.redirect(302, dest)
  }

  if (req.method !== 'POST') {
    return sendJson(res, 405, { error: 'Méthode non autorisée.' })
  }

  const body = await readJsonBody(req)
  const anon = createAnonClient()

  if (action === 'login') {
    const email = String(body.email || '').trim()
    const password = String(body.password || '')
    if (!email || !password) return sendJson(res, 400, { error: 'E-mail et mot de passe requis.' })
    const { data, error } = await anon.auth.signInWithPassword({ email, password })
    if (error || !data?.session) {
      const needsConfirm = /email not confirmed/i.test(error?.message || '')
      return sendJson(res, 401, { error: frAuthError(error?.message), needsConfirm })
    }
    setAuthCookies(req, res, data.session)
    const role = await resolveRole(data.session.access_token, data.user.id)
    return sendJson(res, 200, { user: sanitizeUser(data.user), role })
  }

  if (action === 'signup') {
    const email = String(body.email || '').trim()
    const password = String(body.password || '')
    const name = String(body.name || '').trim()
    const app = body.app === 'studio' ? 'studio' : 'kora'
    if (!email || password.length < 6) return sendJson(res, 400, { error: 'E-mail valide et mot de passe (6 car. min.) requis.' })
    const emailRedirectTo = app === 'studio'
      ? `${origin}/api/auth?action=callback&flow=confirm&app=studio`
      : `${origin}/api/auth?action=callback&flow=confirm&app=kora`
    const { data, error } = await anon.auth.signUp({
      email,
      password,
      options: { data: { name: name || undefined }, emailRedirectTo }
    })
    if (error) return sendJson(res, 400, { error: frAuthError(error.message) })

    // Détection user_repeated_signup : Supabase renvoie 200 avec identities: [] et n'envoie aucun e-mail !
    const alreadyExists = data?.user && Array.isArray(data.user.identities) && data.user.identities.length === 0
    if (alreadyExists) {
      return sendJson(res, 200, {
        alreadyExists: true,
        message: 'Un compte existe déjà avec cette adresse e-mail (aucun nouvel e-mail n’est envoyé). Connectez-vous ou réinitialisez votre mot de passe.'
      })
    }
    if (data?.session) {
      setAuthCookies(req, res, data.session)
      const role = await resolveRole(data.session.access_token, data.user.id)
      return sendJson(res, 200, { user: sanitizeUser(data.user), role })
    }
    return sendJson(res, 200, {
      awaitingConfirm: true,
      email,
      message: 'Un e-mail de confirmation vient d’être envoyé. Vérifiez aussi vos spams/indésirables puis cliquez sur le lien pour activer votre compte.'
    })
  }

  if (action === 'resend') {
    const email = String(body.email || '').trim()
    const app = body.app === 'studio' ? 'studio' : 'kora'
    if (!email) return sendJson(res, 400, { error: 'Saisissez votre adresse e-mail.' })
    const emailRedirectTo = app === 'studio'
      ? `${origin}/api/auth?action=callback&flow=confirm&app=studio`
      : `${origin}/api/auth?action=callback&flow=confirm&app=kora`
    const { error } = await anon.auth.resend({ type: 'signup', email, options: { emailRedirectTo } })
    if (error) return sendJson(res, 400, { error: frAuthError(error.message) })
    return sendJson(res, 200, {
      ok: true,
      message: 'E-mail de confirmation renvoyé ! Pensez aussi à vérifier votre dossier Spam / Indésirables.'
    })
  }

  if (action === 'forgot') {
    const email = String(body.email || '').trim()
    const app = body.app === 'studio' ? 'studio' : 'kora'
    if (!email) return sendJson(res, 400, { error: 'Saisissez votre adresse e-mail.' })
    const redirectTo = app === 'studio'
      ? `${origin}/api/auth?action=callback&flow=recovery&app=studio`
      : `${origin}/api/auth?action=callback&flow=recovery&app=kora`
    const { error } = await anon.auth.resetPasswordForEmail(email, { redirectTo })
    if (error) return sendJson(res, 400, { error: frAuthError(error.message) })
    return sendJson(res, 200, {
      ok: true,
      message: 'Si un compte est associé à cette adresse, un e-mail de réinitialisation vient d’être envoyé (vérifiez aussi vos spams).'
    })
  }

  if (action === 'update-password') {
    const ctx = await getSessionContext(req, res)
    if (!ctx.user || !ctx.accessToken) return sendJson(res, 401, { error: 'Session expirée ou non connectée. Ouvrez le lien de réinitialisation reçu par e-mail.' })
    const password = String(body.password || '')
    if (password.length < 6) return sendJson(res, 400, { error: 'Le mot de passe doit contenir au moins 6 caractères.' })
    const resp = await fetch(`${cfg.url}/auth/v1/user`, {
      method: 'PUT',
      headers: {
        apikey: cfg.key,
        Authorization: `Bearer ${ctx.accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ password })
    })
    const data = await resp.json().catch(() => ({}))
    if (!resp.ok) return sendJson(res, 400, { error: frAuthError(data?.msg || data?.message || 'Impossible de modifier le mot de passe.') })
    return sendJson(res, 200, { ok: true })
  }

  if (action === 'otp-send') {
    const phone = String(body.phone || '').replace(/\s/g, '')
    const name = String(body.name || '').trim()
    if (!phone) return sendJson(res, 400, { error: 'Numéro de téléphone requis.' })
    const { error } = await anon.auth.signInWithOtp({ phone, options: { data: { name: name || undefined } } })
    if (error) return sendJson(res, 400, { error: frAuthError(error.message) })
    return sendJson(res, 200, { ok: true, message: 'Un code de vérification vous a été envoyé par SMS.' })
  }

  if (action === 'otp-verify') {
    const phone = String(body.phone || '').replace(/\s/g, '')
    const token = String(body.code || '').trim()
    if (!phone || !token) return sendJson(res, 400, { error: 'Numéro et code requis.' })
    const { data, error } = await anon.auth.verifyOtp({ phone, token, type: 'sms' })
    if (error || !data?.session) return sendJson(res, 400, { error: frAuthError(error?.message) })
    setAuthCookies(req, res, data.session)
    const role = await resolveRole(data.session.access_token, data.user.id)
    return sendJson(res, 200, { user: sanitizeUser(data.user), role })
  }

  // Échange de secours si le navigateur a reçu ?code=, ?token_hash= ou #access_token= directement sur / ou /studio/
  if (action === 'verify-hash') {
    const accessToken = String(body.access_token || '')
    const refreshToken = String(body.refresh_token || '')
    const tokenHash = String(body.token_hash || '')
    const type = String(body.type || '')
    const code = String(body.code || '')

    if (tokenHash && type) {
      const { data, error } = await anon.auth.verifyOtp({ token_hash: tokenHash, type })
      if (error || !data?.session) return sendJson(res, 400, { error: frAuthError(error?.message) })
      setAuthCookies(req, res, data.session)
      const role = await resolveRole(data.session.access_token, data.user.id)
      return sendJson(res, 200, { ok: true, user: sanitizeUser(data.user), role })
    }

    if (code) {
      const pkce = readPkceCookie(req)
      if (!pkce?.verifier) return sendJson(res, 400, { error: 'Session de vérification expirée.' })
      const ex = await exchangePkceCode(code, pkce.verifier)
      clearPkceCookie(req, res)
      if (ex.error || !ex.session) return sendJson(res, 400, { error: frAuthError(ex.error) })
      setAuthCookies(req, res, ex.session)
      const role = await resolveRole(ex.session.access_token, ex.user.id)
      return sendJson(res, 200, { ok: true, user: sanitizeUser(ex.user), role })
    }

    if (!accessToken) return sendJson(res, 400, { error: 'Jeton manquant.' })
    const { data, error } = await anon.auth.getUser(accessToken)
    if (error || !data?.user) return sendJson(res, 401, { error: frAuthError(error?.message) })
    setAuthCookies(req, res, { access_token: accessToken, refresh_token: refreshToken, expires_in: Number(body.expires_in) || 3600 })
    const role = await resolveRole(accessToken, data.user.id)
    return sendJson(res, 200, { ok: true, user: sanitizeUser(data.user), role })
  }

  if (action === 'logout') {
    const ctx = await getSessionContext(req, res)
    if (ctx.accessToken) {
      await fetch(`${cfg.url}/auth/v1/logout`, {
        method: 'POST',
        headers: { apikey: cfg.key, Authorization: `Bearer ${ctx.accessToken}` }
      }).catch(() => {})
    }
    clearAuthCookies(req, res)
    clearPkceCookie(req, res)
    return sendJson(res, 200, { ok: true })
  }

  return sendJson(res, 400, { error: 'Action inconnue.' })
}
