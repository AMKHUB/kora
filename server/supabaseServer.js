import { createClient } from '@supabase/supabase-js'
import crypto from 'node:crypto'

// Lecture exclusive des variables serveur (aucun fallback VITE_* pour garantir la séparation front/back)
export function getSupabaseConfig() {
  const url = (process.env.SUPABASE_URL || '').trim().replace(/\/$/, '')
  const key = (process.env.SUPABASE_PUBLISHABLE_KEY || '').trim()
  return { url, key, configured: Boolean(url && key) }
}

export function isBillingSimulation() {
  const raw = (process.env.BILLING_MODE || '').trim().toLowerCase()
  if (raw === 'simulation') return true
  if (raw === 'live') return false
  // Fail-safe : en production si non défini, on exige le paiement réel ('live')
  return !(process.env.VERCEL || process.env.NODE_ENV === 'production')
}

const DEFAULT_MAINTENANCE_MSG = 'Nous effectuons une mise à jour pour améliorer votre expérience cinéma sur Kora. Le service sera de retour très bientôt.'

export async function getPlatformSettings() {
  const anon = createAnonClient()
  if (anon) {
    const { data, error } = await anon
      .from('platform_settings')
      .select('billing_simulation,maintenance_mode,maintenance_message,r2_enabled')
      .eq('id', 1)
      .maybeSingle()
    if (!error && data) {
      return {
        billingSimulation: Boolean(data.billing_simulation),
        maintenanceMode: Boolean(data.maintenance_mode),
        maintenanceMessage: String(data.maintenance_message || DEFAULT_MAINTENANCE_MSG),
        r2Enabled: Boolean(data.r2_enabled)
      }
    }
  }
  return {
    billingSimulation: isBillingSimulation(),
    maintenanceMode: false,
    maintenanceMessage: DEFAULT_MAINTENANCE_MSG,
    r2Enabled: false
  }
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

// Origine canonique : priorité absolue à SITE_URL en production (empêche l'empoisonnement Host / X-Forwarded-Host)
export function getOrigin(req) {
  const configured = (process.env.SITE_URL || '').trim().replace(/\/$/, '')
  if (configured && /^https?:\/\//i.test(configured)) {
    try { return new URL(configured).origin } catch { /* fallback dev */ }
  }
  const host = String(req.headers?.host || 'localhost:3000').split(',')[0].trim()
  if (/^(localhost|127\.0\.0\.1)(:\d+)?$/i.test(host)) {
    return `http://${host}`
  }
  return `https://${host}`
}

export function getClientIp(req) {
  const xff = String(req.headers?.['x-forwarded-for'] || '').split(',')[0].trim()
  return xff || req.socket?.remoteAddress || 'unknown'
}

/* ============================================================================
   PROTECTION ANTI-CSRF (Double défense : En-tête personnalisé + Origin/Sec-Fetch)
   ============================================================================ */
export function assertCsrf(req, res) {
  if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') return true

  const secFetchSite = String(req.headers?.['sec-fetch-site'] || '').toLowerCase()
  if (secFetchSite && secFetchSite !== 'same-origin' && secFetchSite !== 'none') {
    sendJson(res, 403, { error: 'Requête cross-site refusée.' })
    return false
  }

  const ct = String(req.headers?.['content-type'] || '').toLowerCase()
  if (!ct.startsWith('application/json')) {
    sendJson(res, 415, { error: 'Type de contenu JSON requis.' })
    return false
  }

  if (String(req.headers?.['x-kora-request'] || '') !== '1') {
    sendJson(res, 403, { error: 'En-tête de sécurité manquant.' })
    return false
  }

  const allowedOrigins = new Set([getOrigin(req)])
  if (process.env.VERCEL_URL) allowedOrigins.add(`https://${process.env.VERCEL_URL}`)
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) allowedOrigins.add(`https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`)
  const host = String(req.headers?.host || '').trim()
  if (host && /^(localhost|127\.0\.0\.1)(:\d+)?$/i.test(host)) {
    allowedOrigins.add(`http://${host}`)
  }

  const originHeader = String(req.headers?.origin || '').trim()
  const refererHeader = String(req.headers?.referer || '').trim()
  if (originHeader) {
    if (!allowedOrigins.has(originHeader)) {
      sendJson(res, 403, { error: 'Origine non autorisée.' })
      return false
    }
  } else if (refererHeader) {
    try {
      if (!allowedOrigins.has(new URL(refererHeader).origin)) {
        sendJson(res, 403, { error: 'Référent non autorisé.' })
        return false
      }
    } catch {
      sendJson(res, 403, { error: 'Référent invalide.' })
      return false
    }
  }
  return true
}

/* ============================================================================
   LIMITATION DE DÉBIT (Sliding-window anti brute-force & anti-abus)
   ============================================================================ */
const RATE_BUCKETS = new Map()
let lastPrune = 0

export function enforceRateLimit(req, res, scope, max, windowMs, extraKey = '') {
  const now = Date.now()
  if (now - lastPrune > 60_000) {
    lastPrune = now
    for (const [k, hits] of RATE_BUCKETS) {
      const fresh = hits.filter(ts => now - ts < 3_600_000)
      if (!fresh.length) RATE_BUCKETS.delete(k)
      else RATE_BUCKETS.set(k, fresh)
    }
  }
  const key = `${scope}:${getClientIp(req)}:${String(extraKey || '').toLowerCase()}`
  const hits = (RATE_BUCKETS.get(key) || []).filter(ts => now - ts < windowMs)
  if (hits.length >= max) {
    const retrySec = Math.max(1, Math.ceil((windowMs - (now - hits[0])) / 1000))
    res.setHeader('Retry-After', String(retrySec))
    sendJson(res, 429, { error: `Trop de tentatives. Patientez ${retrySec} secondes avant de réessayer.` })
    return false
  }
  hits.push(now)
  RATE_BUCKETS.set(key, hits)
  return true
}

/* ============================================================================
   COOKIES SÉCURISÉS (__Host- en HTTPS, HttpOnly, SameSite=Lax)
   ============================================================================ */
function cookieNames(req) {
  const p = isSecureRequest(req) ? '__Host-' : ''
  return { at: `${p}kora_at`, rt: `${p}kora_rt`, pkce: `${p}kora_pkce` }
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
  const n = cookieNames(req)
  const atMaxAge = Math.min(3600, Math.max(300, Number(session.expires_in) || 3600))
  const rtMaxAge = 60 * 60 * 24 * 14 // 14 jours
  appendSetCookie(res, `${n.at}=${encodeURIComponent(session.access_token)}; ${cookieFlags(req, atMaxAge)}`)
  if (session.refresh_token) {
    appendSetCookie(res, `${n.rt}=${encodeURIComponent(session.refresh_token)}; ${cookieFlags(req, rtMaxAge)}`)
  }
}

export function clearAuthCookies(req, res) {
  const n = cookieNames(req)
  appendSetCookie(res, `${n.at}=; ${cookieFlags(req, 0)}`)
  appendSetCookie(res, `${n.rt}=; ${cookieFlags(req, 0)}`)
  // Nettoyage des anciens noms sans préfixe __Host-
  if (n.at !== 'kora_at') {
    appendSetCookie(res, `kora_at=; ${cookieFlags(req, 0)}`)
    appendSetCookie(res, `kora_rt=; ${cookieFlags(req, 0)}`)
  }
}

export function setPkceCookie(req, res, data) {
  const n = cookieNames(req)
  const payload = Buffer.from(JSON.stringify(data), 'utf8').toString('base64url')
  appendSetCookie(res, `${n.pkce}=${encodeURIComponent(payload)}; ${cookieFlags(req, 600)}`)
}

export function readPkceCookie(req) {
  const cookies = parseCookies(req)
  const n = cookieNames(req)
  const c = cookies[n.pkce] || cookies.kora_pkce
  if (!c) return null
  try {
    return JSON.parse(Buffer.from(c, 'base64url').toString('utf8'))
  } catch {
    return null
  }
}

export function clearPkceCookie(req, res) {
  const n = cookieNames(req)
  appendSetCookie(res, `${n.pkce}=; ${cookieFlags(req, 0)}`)
  if (n.pkce !== 'kora_pkce') appendSetCookie(res, `kora_pkce=; ${cookieFlags(req, 0)}`)
}

export function createPkcePair() {
  const verifier = crypto.randomBytes(32).toString('base64url')
  const challenge = crypto.createHash('sha256').update(verifier).digest('base64url')
  const state = crypto.randomBytes(24).toString('base64url')
  return { verifier, challenge, state }
}

export async function getSessionContext(req, res) {
  const anon = createAnonClient()
  if (!anon) return { user: null, accessToken: null, sb: null, role: 'user', configured: false }

  const cookies = parseCookies(req)
  const n = cookieNames(req)
  let accessToken = cookies[n.at] || cookies.kora_at || ''
  const refreshToken = cookies[n.rt] || cookies.kora_rt || ''
  let user = null

  if (accessToken) {
    const { data, error } = await anon.auth.getUser(accessToken)
    if (!error && data?.user) user = data.user
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

/* ============================================================================
   HACHAGE PIN SERVEUR (scrypt + sel aléatoire 16 octets par profil)
   ============================================================================ */
export function hashPinServer(pin) {
  const clean = String(pin || '').trim()
  if (!/^\d{4}$/.test(clean)) return null
  const salt = crypto.randomBytes(16).toString('hex')
  const derived = crypto.scryptSync(clean, salt, 32).toString('hex')
  return `scrypt:${salt}:${derived}`
}

export function verifyPinServer(pin, stored) {
  if (!stored) return true
  const clean = String(pin || '').trim()
  if (stored.startsWith('scrypt:')) {
    const [, salt, hash] = stored.split(':')
    if (!salt || !hash) return false
    const derived = crypto.scryptSync(clean, salt, 32)
    const expected = Buffer.from(hash, 'hex')
    return derived.length === expected.length && crypto.timingSafeEqual(derived, expected)
  }
  if (stored.startsWith('raw:')) return stored === `raw:${clean}`
  // Compatibilité avec anciens SHA-256
  const legacy = crypto.createHash('sha256').update(`kora-pin:${clean}`).digest('hex')
  return legacy.length === stored.length && crypto.timingSafeEqual(Buffer.from(legacy), Buffer.from(stored))
}

/* ============================================================================
   VALIDATION FICHIERS, CHEMINS, URLs & LECTURE JSON SÉCURISÉE
   ============================================================================ */
const MAX_JSON_BYTES = 512 * 1024

export async function readRawBody(req) {
  if (Buffer.isBuffer(req.rawBody)) return req.rawBody.toString('utf8')
  if (typeof req.rawBody === 'string') return req.rawBody
  if (Buffer.isBuffer(req.body)) {
    req.rawBody = req.body
    return req.body.toString('utf8')
  }
  if (typeof req.body === 'string') {
    if (req.body.length > MAX_JSON_BYTES) throw Object.assign(new Error('Corps trop volumineux.'), { status: 413 })
    req.rawBody = Buffer.from(req.body, 'utf8')
    return req.body
  }
  return await new Promise((resolve, reject) => {
    const chunks = []
    let bytes = 0
    req.on?.('data', chunk => {
      const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk), 'utf8')
      bytes += buf.length
      if (bytes > MAX_JSON_BYTES) {
        req.destroy?.()
        reject(Object.assign(new Error('Requête trop volumineuse.'), { status: 413 }))
        return
      }
      chunks.push(buf)
    })
    req.on?.('end', () => {
      const full = Buffer.concat(chunks)
      req.rawBody = full
      resolve(full.toString('utf8'))
    })
    req.on?.('error', () => resolve(''))
  })
}

export async function readJsonBody(req) {
  if (req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) return req.body
  const raw = await readRawBody(req)
  if (!raw) return {}
  try { return JSON.parse(raw) } catch { return {} }
}

export function getQuery(req) {
  const url = new URL(req.url || '/', 'http://localhost')
  return url.searchParams
}

export function sendJson(res, status, data) {
  res.setHeader('Cache-Control', 'no-store')
  res.status(status).json(data)
}

export function safeError(res, status, publicMsg, internalErr) {
  if (internalErr) {
    console.error('[kora-api]', status, typeof internalErr === 'string' ? internalErr : internalErr?.message || internalErr)
  }
  return sendJson(res, status, { error: publicMsg })
}

export function safeName(n) {
  return String(n || 'file')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[/\\]+/g, '_')
    .replace(/\.{2,}/g, '_')
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .replace(/^\.+|\.+$/g, '')
    .slice(0, 80) || 'file'
}

const ALLOWED_POSTER_EXT = new Set(['jpg', 'jpeg', 'png', 'webp'])
const ALLOWED_POSTER_MIME = new Set(['image/jpeg', 'image/png', 'image/webp'])
const ALLOWED_VIDEO_EXT = new Set(['mp4', 'webm', 'mov'])
const ALLOWED_VIDEO_MIME = new Set(['video/mp4', 'video/webm', 'video/quicktime'])

export function validateUploadMeta(bucket, fileName, mimeType, sizeBytes, { useR2 = false } = {}) {
  const clean = safeName(fileName)
  const ext = clean.includes('.') ? clean.split('.').pop().toLowerCase() : ''
  const mime = String(mimeType || '').toLowerCase().trim()
  const size = Number(sizeBytes || 0)

  if (bucket === 'posters') {
    if (!ALLOWED_POSTER_EXT.has(ext)) return { ok: false, error: 'Format d’image non autorisé (JPG, PNG ou WebP uniquement).' }
    if (mime && !ALLOWED_POSTER_MIME.has(mime)) return { ok: false, error: 'Type MIME d’image non autorisé.' }
    if (size > 5 * 1024 * 1024) return { ok: false, error: 'Image supérieure à 5 Mo.' }
    return { ok: true, cleanName: clean }
  }
  if (bucket === 'videos') {
    if (!ALLOWED_VIDEO_EXT.has(ext)) return { ok: false, error: 'Format vidéo non autorisé (MP4, WebM ou MOV uniquement).' }
    if (mime && !ALLOWED_VIDEO_MIME.has(mime)) return { ok: false, error: 'Type MIME vidéo non autorisé.' }
    const maxBytes = useR2 ? 5 * 1024 * 1024 * 1024 : 50 * 1024 * 1024
    if (size > maxBytes) {
      return {
        ok: false,
        error: useR2
          ? 'Vidéo supérieure à 5 Go (limite maximale par fichier sur Cloudflare R2).'
          : 'Vidéo supérieure à 50 Mo. Activez le stockage Cloudflare R2 pour téléverser des films jusqu’à 5 Go.'
      }
    }
    return { ok: true, cleanName: clean }
  }
  return { ok: false, error: 'Espace de stockage inconnu.' }
}

export function isSafeMediaUrl(raw, { strictSupabaseOnly = false } = {}) {
  const s = String(raw || '').trim()
  if (!s) return true
  try {
    const u = new URL(s)
    if (u.protocol !== 'https:') return false
    if (strictSupabaseOnly) {
      const cfg = getSupabaseConfig()
      if (!cfg.url) return false
      const sbOrigin = new URL(cfg.url).origin
      return u.origin === sbOrigin && u.pathname.startsWith('/storage/v1/object/public/posters/')
    }
    return true
  } catch {
    return false
  }
}

export function isSafeStoragePath(path, creatorUid = null) {
  const s = String(path || '').trim()
  if (!s || s.includes('..') || s.startsWith('/') || s.includes('\\')) return false
  if (creatorUid) {
    return new RegExp(`^(r2:)?creator/${creatorUid}/[A-Za-z0-9._-]+$`).test(s)
  }
  return /^(r2:)?[A-Za-z0-9_-]+\/[A-Za-z0-9._/-]+$/.test(s)
}

export function frAuthError(m) {
  const s = String(m || '')
  if (/invalid login/i.test(s)) return 'E-mail ou mot de passe incorrect.'
  if (/email not confirmed/i.test(s)) return 'Votre adresse e-mail n’est pas encore confirmée. Vérifiez vos spams ou cliquez sur « Renvoyer l’e-mail de confirmation ».'
  if (/already registered|user_repeated_signup/i.test(s)) return 'Cet e-mail possède déjà un compte Kora. Connectez-vous ou réinitialisez votre mot de passe.'
  if (/password should be/i.test(s)) return 'Mot de passe trop court (8 caractères minimum).'
  if (/rate limit|security purposes|only request this after/i.test(s)) return 'Trop d’e-mails envoyés récemment. Patientez quelques minutes puis réessayez.'
  if (/provider is not enabled|unsupported provider/i.test(s)) return 'La connexion Google n’est pas encore activée sur le serveur.'
  if (/provider|sms/i.test(s)) return 'L’envoi de SMS n’est pas encore activé sur ce serveur. Utilisez la connexion par e-mail ou Google.'
  if (/otp|token|expired/i.test(s)) return 'Lien ou code incorrect ou expiré.'
  return 'Erreur d’authentification. Réessayez.'
}

const TYPES = { film: 'film', series: 'serie', doc: 'doc', short: 'court' }

export function buildCatalogPayload(rows) {
  const items = (rows || [])
    .filter(t => typeof t.poster_url === 'string' && t.poster_url.trim().length > 0 && isSafeMediaUrl(t.poster_url))
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
        backdrop: isSafeMediaUrl(t.backdrop_url) ? (t.backdrop_url || undefined) : undefined,
        trailer: isSafeMediaUrl(t.trailer_url) ? (t.trailer_url || undefined) : undefined,
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
