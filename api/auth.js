import {
  assertCsrf,
  clearAuthCookies,
  clearPkceCookie,
  createAnonClient,
  createPkcePair,
  createUserClient,
  enforceRateLimit,
  frAuthError,
  getOrigin,
  getQuery,
  getSessionContext,
  getSupabaseConfig,
  isBillingSimulation,
  readJsonBody,
  readPkceCookie,
  safeError,
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
    return { error: data?.error_description || data?.msg || data?.message || 'oauth_failed' }
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

  if (action === 'session' && req.method === 'GET') {
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

  // Démarrage OAuth Google (PKCE + state anti-CSRF gérés 100 % côté serveur)
  if (action === 'google' && req.method === 'GET') {
    if (!enforceRateLimit(req, res, 'oauth_google', 15, 5 * 60_000)) return
    const app = q.get('app') === 'studio' ? 'studio' : 'kora'
    const { verifier, challenge, state } = createPkcePair()
    setPkceCookie(req, res, { verifier, state, app, flow: 'google' })
    const redirectTo = `${origin}/api/auth?action=callback&kstate=${encodeURIComponent(state)}`
    const authUrl = `${cfg.url}/auth/v1/authorize?provider=google&redirect_to=${encodeURIComponent(redirectTo)}&code_challenge=${encodeURIComponent(challenge)}&code_challenge_method=s256&access_type=offline&prompt=select_account`
    res.setHeader('Cache-Control', 'no-store')
    return res.redirect(302, authUrl)
  }

  // Callback serveur (Google OAuth PKCE, confirmation e-mail, réinitialisation mot de passe)
  if (action === 'callback' && req.method === 'GET') {
    res.setHeader('Cache-Control', 'no-store')
    const pkce = readPkceCookie(req)
    const app = q.get('app') === 'studio' || pkce?.app === 'studio' ? 'studio' : 'kora'
    const flow = q.get('flow') || pkce?.flow || ''
    const errDesc = q.get('error_description') || q.get('error')
    const code = q.get('code')
    const kstate = q.get('kstate')
    const tokenHash = q.get('token_hash')
    const type = q.get('type') || ''

    // Codes d'erreur fixes (jamais de texte arbitraire reflété depuis l'URL)
    const targetError = (errCode) => {
      const c = encodeURIComponent(errCode)
      if (flow === 'recovery' || type === 'recovery') {
        return app === 'studio' ? `/studio/?err=${c}&flow=recovery` : `/#/reinitialisation?status=error&err=${c}`
      }
      if (flow === 'confirm' || type === 'signup' || type === 'email') {
        return app === 'studio' ? `/studio/?err=${c}&flow=confirm` : `/#/confirmation?status=error&err=${c}`
      }
      return app === 'studio' ? `/studio/?err=${c}` : `/#/connexion?err=${c}`
    }

    if (errDesc) {
      clearPkceCookie(req, res)
      return res.redirect(302, targetError('oauth_denied'))
    }

    if (tokenHash && type) {
      const anon = createAnonClient()
      const { data, error } = await anon.auth.verifyOtp({ token_hash: tokenHash, type })
      clearPkceCookie(req, res)
      if (error || !data?.session) {
        return res.redirect(302, targetError('link_expired'))
      }
      setAuthCookies(req, res, data.session)
      if (type === 'recovery' || flow === 'recovery') {
        return res.redirect(302, app === 'studio' ? '/studio/?recovery=1' : '/#/reinitialisation?step=new')
      }
      return res.redirect(302, app === 'studio' ? '/studio/?confirmed=1' : '/#/confirmation?status=ok')
    }

    if (code) {
      if (!pkce?.verifier || (pkce.state && kstate && pkce.state !== kstate)) {
        clearPkceCookie(req, res)
        return res.redirect(302, targetError('session_expired'))
      }
      const ex = await exchangePkceCode(code, pkce.verifier)
      clearPkceCookie(req, res)
      if (ex.error || !ex.session) {
        return res.redirect(302, targetError('oauth_failed'))
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

    const dest = app === 'studio'
      ? `/studio/?auth_flow=${encodeURIComponent(flow || 'confirm')}`
      : `/?auth_flow=${encodeURIComponent(flow || 'confirm')}`
    return res.redirect(302, dest)
  }

  if (req.method !== 'POST') return sendJson(res, 405, { error: 'Méthode non autorisée.' })
  if (!assertCsrf(req, res)) return

  let body
  try { body = await readJsonBody(req) } catch (e) { return safeError(res, e.status || 400, 'Requête invalide.', e) }
  const anon = createAnonClient()

  if (action === 'login') {
    const email = String(body.email || '').trim().toLowerCase()
    const password = String(body.password || '')
    if (!email || !password) return sendJson(res, 400, { error: 'E-mail et mot de passe requis.' })
    if (!enforceRateLimit(req, res, 'login', 10, 5 * 60_000, email)) return
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
    const email = String(body.email || '').trim().toLowerCase()
    const password = String(body.password || '')
    const name = String(body.name || '').trim().slice(0, 80)
    const app = body.app === 'studio' ? 'studio' : 'kora'
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return sendJson(res, 400, { error: 'Adresse e-mail invalide.' })
    if (password.length < 8) return sendJson(res, 400, { error: 'Le mot de passe doit contenir au moins 8 caractères.' })
    if (!enforceRateLimit(req, res, 'signup', 5, 15 * 60_000, email)) return

    const emailRedirectTo = app === 'studio'
      ? `${origin}/api/auth?action=callback&flow=confirm&app=studio`
      : `${origin}/api/auth?action=callback&flow=confirm&app=kora`
    const { data, error } = await anon.auth.signUp({
      email,
      password,
      options: { data: { name: name || undefined }, emailRedirectTo }
    })
    if (error) return sendJson(res, 400, { error: frAuthError(error.message) })

    const alreadyExists = data?.user && Array.isArray(data.user.identities) && data.user.identities.length === 0
    if (alreadyExists) {
      return sendJson(res, 200, {
        alreadyExists: true,
        message: 'Un compte existe déjà avec cette adresse e-mail. Connectez-vous ou réinitialisez votre mot de passe.'
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
    const email = String(body.email || '').trim().toLowerCase()
    const app = body.app === 'studio' ? 'studio' : 'kora'
    if (!email) return sendJson(res, 400, { error: 'Saisissez votre adresse e-mail.' })
    if (!enforceRateLimit(req, res, 'resend', 4, 15 * 60_000, email)) return
    const emailRedirectTo = app === 'studio'
      ? `${origin}/api/auth?action=callback&flow=confirm&app=studio`
      : `${origin}/api/auth?action=callback&flow=confirm&app=kora`
    const { error } = await anon.auth.resend({ type: 'signup', email, options: { emailRedirectTo } })
    if (error) return sendJson(res, 400, { error: frAuthError(error.message) })
    return sendJson(res, 200, {
      ok: true,
      message: 'Si ce compte attend une confirmation, un nouvel e-mail vient d’être envoyé (vérifiez vos spams).'
    })
  }

  if (action === 'forgot') {
    const email = String(body.email || '').trim().toLowerCase()
    const app = body.app === 'studio' ? 'studio' : 'kora'
    if (!email) return sendJson(res, 400, { error: 'Saisissez votre adresse e-mail.' })
    if (!enforceRateLimit(req, res, 'forgot', 4, 15 * 60_000, email)) return
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
    if (!ctx.user || !ctx.accessToken) return sendJson(res, 401, { error: 'Session expirée. Ouvrez le lien de réinitialisation reçu par e-mail.' })
    if (!enforceRateLimit(req, res, 'update_pw', 5, 15 * 60_000, ctx.user.id)) return
    const password = String(body.password || '')
    if (password.length < 8) return sendJson(res, 400, { error: 'Le mot de passe doit contenir au moins 8 caractères.' })

    // Si l'utilisateur fournit son ancien mot de passe (changement depuis Paramètres), on le vérifie
    if (body.currentPassword && ctx.user.email) {
      const reauth = await anon.auth.signInWithPassword({ email: ctx.user.email, password: String(body.currentPassword) })
      if (reauth.error) return sendJson(res, 401, { error: 'Mot de passe actuel incorrect.' })
    }

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
    if (!resp.ok) return safeError(res, 400, frAuthError(data?.msg || data?.message), data)
    return sendJson(res, 200, { ok: true })
  }

  if (action === 'otp-send') {
    const phone = String(body.phone || '').replace(/\s/g, '')
    const name = String(body.name || '').trim().slice(0, 80)
    if (!/^\+[1-9]\d{6,15}$/.test(phone)) return sendJson(res, 400, { error: 'Numéro international invalide (ex. +22370000000).' })
    if (!enforceRateLimit(req, res, 'otp_send', 4, 15 * 60_000, phone)) return
    const { error } = await anon.auth.signInWithOtp({ phone, options: { data: { name: name || undefined } } })
    if (error) return sendJson(res, 400, { error: frAuthError(error.message) })
    return sendJson(res, 200, { ok: true, message: 'Un code de vérification vous a été envoyé par SMS.' })
  }

  if (action === 'otp-verify') {
    const phone = String(body.phone || '').replace(/\s/g, '')
    const token = String(body.code || '').trim()
    if (!phone || !/^\d{4,8}$/.test(token)) return sendJson(res, 400, { error: 'Numéro et code requis.' })
    if (!enforceRateLimit(req, res, 'otp_verify', 8, 10 * 60_000, phone)) return
    const { data, error } = await anon.auth.verifyOtp({ phone, token, type: 'sms' })
    if (error || !data?.session) return sendJson(res, 400, { error: frAuthError(error?.message) })
    setAuthCookies(req, res, data.session)
    const role = await resolveRole(data.session.access_token, data.user.id)
    return sendJson(res, 200, { user: sanitizeUser(data.user), role })
  }

  // Échange de jetons vérifié côté serveur (valide toujours refresh_token via refreshSession)
  if (action === 'verify-hash') {
    if (!enforceRateLimit(req, res, 'verify_hash', 15, 10 * 60_000)) return
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

    if (refreshToken) {
      const { data, error } = await anon.auth.refreshSession({ refresh_token: refreshToken })
      if (error || !data?.session || !data?.user) return sendJson(res, 401, { error: 'Lien invalide ou expiré.' })
      setAuthCookies(req, res, data.session)
      const role = await resolveRole(data.session.access_token, data.user.id)
      return sendJson(res, 200, { ok: true, user: sanitizeUser(data.user), role })
    }

    if (!accessToken) return sendJson(res, 400, { error: 'Jeton manquant.' })
    const { data, error } = await anon.auth.getUser(accessToken)
    if (error || !data?.user) return sendJson(res, 401, { error: 'Lien invalide ou expiré.' })
    setAuthCookies(req, res, { access_token: accessToken, expires_in: 3600 })
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
