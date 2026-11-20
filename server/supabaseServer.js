import { createClient } from '@supabase/supabase-js'
import crypto from 'node:crypto'

export function getSupabaseConfig() {
  const url = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').trim().replace(/\/$/, '')
  const key = (process.env.SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY || '').trim()
  return { url, key, configured: Boolean(url && key) }
}

export function isBillingSimulation() {
  const mode = (process.env.BILLING_MODE || process.env.VITE_BILLING_MODE || 'simulation').trim().toLowerCase()
  return mode !== 'live'
}

export function createAnonClient() {
  const { url, key } = getSupabaseConfig()
  if (!url || !key) return null
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
  })
}

export function createUserClient(accessToken) {
  const { url, key } = getSupabaseConfig()
  if (!url || !key || !accessToken) return null
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { headers: { Authorization: `Bearer ${accessToken}` } }
  })
}

export function isSecureRequest(req) {
  const proto = String(req.headers?.['x-forwarded-proto'] || '')
  if (proto.includes('https')) return true
  if (process.env.VERCEL || process.env.NODE_ENV === 'production') return true
  return false
}

export function getOrigin(req) {
  const host = req.headers?.['x-forwarded-host'] || req.headers?.host
  const proto = req.headers?.['x-forwarded-proto'] || (isSecureRequest(req) ? 'https' : 'http')
  if (host) return `${String(proto).split(',')[0].trim()}://${String(host).split(',')[0].trim()}`
  return (process.env.SITE_URL || 'http://localhost:3000').replace(/\/$/, '')
}

export function parseCookies(req) {
  const raw = req.headers?.cookie || ''
  const out = {}
  for (const part of raw.split(';')) {
    const idx = part.indexOf('=')
    if (idx < 0) continue
    const k = part.slice(0, idx).trim()
    const v = part.slice(idx + 1).trim()
    if (k) {
      try { out[k] = decodeURIComponent(v) } catch { out[k] = v }
    }
  }
  return out
}

function appendSetCookie(res, cookieStr) {
  const prev = res.getHeader?.('Set-Cookie')
  if (!prev) res.setHeader('Set-Cookie', [cookieStr])
  else if (Array.isArray(prev)) res.setHeader('Set-Cookie', [...prev, cookieStr])
  else res.setHeader('Set-Cookie', [String(prev), cookieStr])
}

function cookieFlags(req, maxAge) {
  const parts = ['Path=/', 'HttpOnly', 'SameSite=Lax']
  if (isSecureRequest(req)) parts.push('Secure')
  if (typeof maxAge === 'number') parts.push(`Max-Age=${maxAge}`)
  return parts.join('; ')
}

export function setAuthCookies(req, res, session) {
  if (!session?.access_token) return
  const atMaxAge = Math.max(300, Number(session.expires_in) || 3600)
  const rtMaxAge = 60 * 60 * 24 * 30 // 30 jours
  appendSetCookie(res, `kora_at=${encodeURIComponent(session.access_token)}; ${cookieFlags(req, atMaxAge)}`)
  if (session.refresh_token) {
    appendSetCookie(res, `kora_rt=${encodeURIComponent(session.refresh_token)}; ${cookieFlags(req, rtMaxAge)}`)
  }
}

export function clearAuthCookies(req, res) {
  appendSetCookie(res, `kora_at=; ${cookieFlags(req, 0)}`)
  appendSetCookie(res, `kora_rt=; ${cookieFlags(req, 0)}`)
}

export function setPkceCookie(req, res, data) {
  const payload = Buffer.from(JSON.stringify(data), 'utf8').toString('base64url')
  appendSetCookie(res, `kora_pkce=${encodeURIComponent(payload)}; ${cookieFlags(req, 600)}`)
}

export function readPkceCookie(req) {
  const c = parseCookies(req).kora_pkce
  if (!c) return null
  try {
    return JSON.parse(Buffer.from(c, 'base64url').toString('utf8'))
  } catch {
    return null
  }
}

export function clearPkceCookie(req, res) {
  appendSetCookie(res, `kora_pkce=; ${cookieFlags(req, 0)}`)
}

export function createPkcePair() {
  const verifier = crypto.randomBytes(32).toString('base64url')
  const challenge = crypto.createHash('sha256').update(verifier).digest('base64url')
  return { verifier, challenge }
}

export async function getSessionContext(req, res) {
  const anon = createAnonClient()
  if (!anon) return { user: null, accessToken: null, sb: null, role: 'user', configured: false }

  const cookies = parseCookies(req)
  let accessToken = cookies.kora_at || ''
  const refreshToken = cookies.kora_rt || ''
  let user = null

  if (accessToken) {
    const { data, error } = await anon.auth.getUser(accessToken)
    if (!error && data?.user) {
      user = data.user
    }
  }

  if (!user && refreshToken) {
    const { data, error } = await anon.auth.refreshSession({ refresh_token: refreshToken })
    if (!error && data?.session?.access_token && data?.user) {
      accessToken = data.session.access_token
      user = data.user
      setAuthCookies(req, res, data.session)
    } else if (accessToken || refreshToken) {
      clearAuthCookies(req, res)
    }
  }

  if (!user || !accessToken) {
    return { user: null, accessToken: null, sb: null, role: 'user', configured: true }
  }

  const sb = createUserClient(accessToken)
  const { data: acc } = await sb.from('accounts').select('role').eq('id', user.id).maybeSingle()
  const role = acc?.role || 'user'
  return { user, accessToken, sb, role, configured: true }
}

export function sanitizeUser(user) {
  if (!user) return null
  return {
    id: user.id,
    email: user.email || '',
    phone: user.phone || '',
    name: user.user_metadata?.full_name || user.user_metadata?.name || '',
    provider: user.app_metadata?.provider || 'email'
  }
}

export async function readJsonBody(req) {
  if (req.body && typeof req.body === 'object') return req.body
  if (typeof req.body === 'string') {
    try { return JSON.parse(req.body) } catch { return {} }
  }
  return await new Promise((resolve) => {
    let raw = ''
    req.on?.('data', chunk => { raw += chunk; if (raw.length > 1024 * 1024) raw = raw.slice(0, 1024 * 1024) })
    req.on?.('end', () => {
      try { resolve(raw ? JSON.parse(raw) : {}) } catch { resolve({}) }
    })
    req.on?.('error', () => resolve({}))
  })
}

export function getQuery(req) {
  const url = new URL(req.url || '/', 'http://localhost')
  return url.searchParams
}

export function sendJson(res, status, data) {
  res.setHeader('Cache-Control', 'no-store')
  res.status(status).json(data)
}

export function safeName(n) {
  return String(n || 'file').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9._-]/g, '_')
}

export function frAuthError(m) {
  const s = String(m || '')
  if (/invalid login/i.test(s)) return 'E-mail ou mot de passe incorrect.'
  if (/email not confirmed/i.test(s)) return 'Votre adresse e-mail n’est pas encore confirmée. Vérifiez vos spams ou cliquez sur « Renvoyer l’e-mail de confirmation ».'
  if (/already registered|user_repeated_signup/i.test(s)) return 'Cet e-mail possède déjà un compte Kora. Connectez-vous ou réinitialisez votre mot de passe.'
  if (/password should be/i.test(s)) return 'Mot de passe trop court (6 caractères minimum).'
  if (/rate limit|security purposes|only request this after/i.test(s)) return 'Trop d’e-mails envoyés récemment (limite anti-spam Supabase). Patientez quelques minutes puis réessayez.'
  if (/provider is not enabled|unsupported provider/i.test(s)) return 'La connexion Google n’est pas encore activée dans Supabase (Authentication → Providers → Google).'
  if (/provider|sms/i.test(s)) return 'L’envoi de SMS n’est pas encore activé sur ce serveur. Utilisez la connexion par e-mail ou Google.'
  if (/otp|token|expired/i.test(s)) return 'Lien ou code incorrect ou expiré.'
  return s || 'Erreur d’authentification.'
}

const TYPES = { film: 'film', series: 'serie', doc: 'doc', short: 'court' }

export function buildCatalogPayload(rows) {
  const items = (rows || [])
    .filter(t => typeof t.poster_url === 'string' && t.poster_url.trim().length > 0)
    .map(t => {
      const episodesBySeason = {}
      for (const s of (t.seasons || [])) {
        const eps = (s.episodes || []).slice().sort((a, b) => a.number - b.number)
        if (eps.length) episodesBySeason[s.number] = eps
      }
      const langs = (t.title_languages || []).filter(x => x.kind === 'audio' && x.languages?.name).map(x => x.languages.name)
      const subtitles = (t.title_languages || []).filter(x => x.kind === 'subtitle' && x.languages?.name).map(x => x.languages.name)
      return {
        id: t.id,
        title: t.title,
        type: TYPES[t.type] || 'serie',
        year: t.year || new Date().getFullYear(),
        country: t.country || 'Mali',
        age: t.age_rating || 'Tous',
        dur: t.duration_min || 45,
        synopsis: t.synopsis_long || t.synopsis_short || '',
        poster: t.poster_url,
        backdrop: t.backdrop_url || undefined,
        trailer: t.trailer_url || undefined,
        genres: (t.title_genres || []).map(x => x.genres?.name).filter(Boolean),
        langs: langs.length ? langs : ['Français'],
        subtitles: subtitles.length ? subtitles : ['Français', 'English'],
        director: (t.title_people || []).find(x => x.role === 'director')?.people?.name || '',
        cast: (t.title_people || []).filter(x => x.role === 'actor').sort((a, b) => a.position - b.position).map(x => x.people?.name).filter(Boolean),
        seasons: (t.seasons || []).length || undefined,
        episodesBySeason: Object.keys(episodesBySeason).length ? episodesBySeason : undefined,
        quality: t.is_exclusive ? '4K' : 'HD',
        hdr: !!t.is_exclusive,
        audioDesc: false,
        badge: t.is_exclusive ? 'Original Kora' : t.is_new ? 'Nouveauté' : undefined,
        isTrending: !!t.is_trending,
        isNew: !!t.is_new,
        isExclusive: !!t.is_exclusive
      }
    })

  const ids = f => items.filter(f).map(i => i.id)
  const flag = k => items.filter(t => t[k]).map(t => t.id)
  const trending = flag('isTrending')
  const excl = flag('isExclusive')
  const news = flag('isNew')
  const heroes = [...new Set([...excl, ...trending, ...items.map(i => i.id)])].slice(0, 5)

  return {
    items,
    hero: heroes[0] || items[0]?.id || 0,
    heroes,
    rows: {
      top10: [...new Set([...trending, ...excl, ...news, ...items.map(i => i.id)])].slice(0, 10),
      trending: trending.length ? trending : ids(i => i.country === 'Mali'),
      new: news.length ? news : ids(i => i.year >= 2024),
      malifilms: ids(i => i.country === 'Mali' && i.type === 'film'),
      series: ids(i => i.type === 'serie'),
      africa: ids(i => i.country !== 'Mali'),
      docs: ids(i => i.type === 'doc'),
      shorts: ids(i => i.type === 'court'),
      discover: ids(i => i.country !== 'Mali' && i.type === 'film'),
      classics: ids(i => i.year < 2000),
      pick: ids(i => !trending.includes(i.id)).slice(0, 8)
    }
  }
}
