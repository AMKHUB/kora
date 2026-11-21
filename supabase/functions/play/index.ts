import { createClient } from 'npm:@supabase/supabase-js@2'

const ALLOWED_ORIGIN = Deno.env.get('ALLOWED_ORIGIN') || 'https://kora-five-xi.vercel.app'
const cors = {
  'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info, x-kora-geo-country',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  Vary: 'Origin'
}
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), {
    status: s,
    headers: { ...cors, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }
  })

const ISO_TO_COUNTRY: Record<string, string> = {
  ML: 'Mali', SN: 'Sénégal', CI: 'Côte d’Ivoire', BF: 'Burkina Faso',
  GN: 'Guinée', NE: 'Niger', BJ: 'Bénin', TG: 'Togo', CM: 'Cameroun',
  GH: 'Ghana', NG: 'Nigeria', ZA: 'Afrique du Sud', FR: 'France',
  BE: 'Belgique', CA: 'Canada', US: 'États-Unis'
}

const enc = new TextEncoder()

function toHex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('')
}

async function sha256Hex(text: string): Promise<string> {
  return toHex(await crypto.subtle.digest('SHA-256', enc.encode(text)))
}

async function hmacRaw(key: ArrayBuffer | Uint8Array, data: string): Promise<ArrayBuffer> {
  const k = await crypto.subtle.importKey('raw', key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  return crypto.subtle.sign('HMAC', k, enc.encode(data))
}

function encodeRfc3986(str: string): string {
  return encodeURIComponent(str).replace(/[!'()*]/g, c => `%${c.charCodeAt(0).toString(16).toUpperCase()}`)
}

function encodeS3Path(pathStr: string): string {
  return String(pathStr).split('/').map(encodeRfc3986).join('/')
}

async function signR2S3Url(
  cfg: { account_id: string; bucket_name: string; access_key_id: string; secret_access_key: string },
  method: 'GET' | 'PUT',
  objectKey: string,
  expiresInSec = 7200
): Promise<string> {
  const cleanKey = String(objectKey || '').replace(/^r2:/, '').replace(/^\/+/, '')
  const host = `${cfg.account_id}.r2.cloudflarestorage.com`
  const region = 'auto'
  const service = 's3'
  const now = new Date()
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '')
  const dateStamp = amzDate.slice(0, 8)
  const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`
  const canonicalUri = `/${encodeRfc3986(cfg.bucket_name)}/${encodeS3Path(cleanKey)}`

  const queryParams = [
    ['X-Amz-Algorithm', 'AWS4-HMAC-SHA256'],
    ['X-Amz-Credential', `${cfg.access_key_id}/${credentialScope}`],
    ['X-Amz-Date', amzDate],
    ['X-Amz-Expires', String(Math.min(86400, Math.max(60, expiresInSec)))],
    ['X-Amz-SignedHeaders', 'host']
  ]
  const canonicalQuery = queryParams
    .map(([k, v]) => `${encodeRfc3986(k)}=${encodeRfc3986(v)}`)
    .sort()
    .join('&')

  const canonicalRequest = [
    method,
    canonicalUri,
    canonicalQuery,
    `host:${host}\n`,
    'host',
    'UNSIGNED-PAYLOAD'
  ].join('\n')

  const stringToSign = [
    'AWS4-HMAC-SHA256',
    amzDate,
    credentialScope,
    await sha256Hex(canonicalRequest)
  ].join('\n')

  const kDate = await hmacRaw(enc.encode(`AWS4${cfg.secret_access_key}`), dateStamp)
  const kRegion = await hmacRaw(kDate, region)
  const kService = await hmacRaw(kRegion, service)
  const kSigning = await hmacRaw(kService, 'aws4_request')
  const signature = toHex(await hmacRaw(kSigning, stringToSign))

  return `https://${host}${canonicalUri}?${canonicalQuery}&X-Amz-Signature=${signature}`
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'Méthode non autorisée' }, 405)

  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  const token = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '').trim()
  if (!token) return json({ error: 'Connexion requise' }, 401)
  const { data: { user } } = await db.auth.getUser(token)
  if (!user) return json({ error: 'Connexion requise' }, 401)

  const body = await req.json().catch(() => ({}))
  const { data: acc } = await db.from('accounts').select('country,role').eq('id', user.id).maybeSingle()

  if (body.action === 'sign-r2-upload') {
    const cleanKey = String(body.objectKey || '').replace(/^r2:/, '').replace(/^\/+/, '').trim()
    if (!cleanKey || cleanKey.includes('..') || cleanKey.includes('\\')) {
      return json({ error: 'Chemin de stockage invalide' }, 400)
    }
    const isAdmin = acc?.role === 'admin'
    const ownerRe = new RegExp(`^creator/${user.id}/[A-Za-z0-9._-]+$`)
    const adminRe = /^[A-Za-z0-9_-]+\/[A-Za-z0-9._/-]+$/
    if (!isAdmin && !ownerRe.test(cleanKey)) {
      return json({ error: 'Chemin créateur non autorisé' }, 403)
    }
    if (isAdmin && !adminRe.test(cleanKey)) {
      return json({ error: 'Chemin administrateur non autorisé' }, 400)
    }
    const { data: r2Cfg } = await db.from('private_r2_config').select('account_id,bucket_name,access_key_id,secret_access_key').eq('id', 1).maybeSingle()
    if (!r2Cfg?.access_key_id || !r2Cfg?.secret_access_key) {
      return json({ error: 'Cloudflare R2 non configuré' }, 503)
    }
    const signedUrl = await signR2S3Url(r2Cfg, 'PUT', cleanKey, 7200)
    return json({ signedUrl, storagePath: `r2:${cleanKey}`, provider: 'r2' })
  }

  const titleId = Number(body.titleId)
  const episodeId = body.episodeId ? Number(body.episodeId) : null
  if (!Number.isInteger(titleId) || titleId <= 0) return json({ error: 'Requête invalide' }, 400)
  if (episodeId !== null && (!Number.isInteger(episodeId) || episodeId <= 0)) return json({ error: 'Épisode invalide' }, 400)

  if (episodeId !== null) {
    const { data: epCheck } = await db
      .from('episodes')
      .select('id, seasons!inner(title_id)')
      .eq('id', episodeId)
      .eq('seasons.title_id', titleId)
      .maybeSingle()
    if (!epCheck) return json({ error: 'Épisode introuvable pour ce titre' }, 404)
  }

  const { data: t } = await db.from('titles').select('id,status,creator_id,available_from,available_until').eq('id', titleId).maybeSingle()
  const isPrivileged = acc?.role === 'admin' || (t?.creator_id && t.creator_id === user.id)
  const today = new Date().toISOString().slice(0, 10)
  if (!t || (!isPrivileged && (t.status !== 'published' || (t.available_from && t.available_from > today) || (t.available_until && t.available_until < today))))
    return json({ error: 'Contenu indisponible' }, 404)

  const { data: sub } = await db
    .from('subscriptions')
    .select('plan_id,current_period_end')
    .eq('account_id', user.id)
    .eq('status', 'active')
    .order('id', { ascending: false })
    .limit(1)
    .maybeSingle()

  const subValid = !!sub && (!sub.current_period_end || new Date(sub.current_period_end).getTime() > Date.now())
  const plan = subValid ? (sub.plan_id ?? 'free') : 'free'
  const isPaid = plan === 'premium' || plan === 'family'

  const geoCode = (req.headers.get('x-kora-geo-country') || '').trim().toUpperCase()
  const effectiveCountry = ISO_TO_COUNTRY[geoCode] || acc?.country || 'Mali'

  const { data: rights } = await db
    .from('rights')
    .select('country,access,available_from,available_until')
    .eq('title_id', titleId)

  if (!isPrivileged && rights?.length) {
    const r = rights.find((x) => x.country === effectiveCountry) || rights.find((x) => x.country === '*')
    if (!r) return json({ error: 'Non disponible dans votre pays' }, 403)
    if ((r.available_from && r.available_from > today) || (r.available_until && r.available_until < today)) {
      return json({ error: 'Contenu indisponible sur cette période' }, 403)
    }
    if (r.access === 'premium' && !isPaid) return json({ error: 'Réservé aux abonnés Premium ou Famille' }, 402)
    if (r.access === 'rent' || r.access === 'buy') return json({ error: 'Location ou achat requis pour ce titre' }, 402)
  }

  const q = db.from('video_assets').select('storage_path,hls_url,mime').eq('status', 'ready')
  const { data: asset } = await (episodeId !== null ? q.eq('episode_id', episodeId) : q.eq('title_id', titleId)).maybeSingle()

  let url = ''
  let r2Path = ''
  if (asset?.hls_url && /^https:\/\//i.test(asset.hls_url)) {
    url = asset.hls_url
  } else if (asset?.storage_path && asset.storage_path.startsWith('r2:') && !asset.storage_path.includes('..')) {
    r2Path = asset.storage_path
    const { data: r2Cfg } = await db.from('private_r2_config').select('account_id,bucket_name,access_key_id,secret_access_key').eq('id', 1).maybeSingle()
    if (r2Cfg?.access_key_id && r2Cfg?.secret_access_key) {
      url = await signR2S3Url(r2Cfg, 'GET', asset.storage_path, 7200)
    }
  } else if (asset?.storage_path && !asset.storage_path.includes('..') && !asset.storage_path.startsWith('/')) {
    const { data: signed } = await db.storage.from('videos').createSignedUrl(asset.storage_path, 3600)
    if (signed?.signedUrl) url = signed.signedUrl
  }

  if (!url && !r2Path) return json({ error: 'Aucune vidéo' }, 404)

  const sq = db.from('subtitles').select('id,language_code,language_label,vtt_content,offset_ms,source').order('id')
  const { data: subtitles } = await (episodeId !== null ? sq.eq('episode_id', episodeId) : sq.eq('title_id', titleId).is('episode_id', null))

  return json({
    url: url || null,
    r2Path: r2Path || null,
    mime: asset?.mime || null,
    plan,
    ads: !isPaid && !isPrivileged,
    subtitles: subtitles || []
  })
})
