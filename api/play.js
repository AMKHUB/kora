import {
  assertCsrf,
  enforceRateLimit,
  getSessionContext,
  getSupabaseConfig,
  readJsonBody,
  safeError,
  sendJson
} from '../server/supabaseServer.js'
import { createR2PlaybackUrl } from '../server/r2Storage.js'

export default async function handler(req, res) {
  if (req.method !== 'POST') return sendJson(res, 405, { error: 'Méthode non autorisée.' })
  if (!assertCsrf(req, res)) return

  const ctx = await getSessionContext(req, res)
  if (!ctx.configured) return sendJson(res, 503, { error: 'Service vidéo non configuré.' })
  if (!ctx.user || !ctx.sb || !ctx.accessToken) return sendJson(res, 401, { error: 'Connexion requise pour lire.' })
  if (!enforceRateLimit(req, res, 'play', 60, 60_000, ctx.user.id)) return

  let body
  try { body = await readJsonBody(req) } catch (e) { return safeError(res, e.status || 400, 'Requête invalide.', e) }

  const titleId = Number(body.titleId)
  let episodeId = body.episodeId ? Number(body.episodeId) : undefined
  const seasonNum = body.seasonNum ? Number(body.seasonNum) : undefined
  const epNum = body.epNum ? Number(body.epNum) : undefined

  if (!Number.isInteger(titleId) || titleId <= 0) return sendJson(res, 400, { error: 'Titre invalide.' })

  if (epNum && !episodeId) {
    const { data } = await ctx.sb
      .from('episodes')
      .select('id,seasons!inner(number,title_id)')
      .eq('number', epNum)
      .eq('seasons.number', seasonNum || 1)
      .eq('seasons.title_id', titleId)
      .maybeSingle()
    episodeId = data?.id
  }

  // Pays issu des en-têtes Edge de confiance (Vercel / Cloudflare) — non falsifiable par le client
  const edgeCountry = String(req.headers?.['x-vercel-ip-country'] || req.headers?.['cf-ipcountry'] || '').trim().toUpperCase()

  const cfg = getSupabaseConfig()
  try {
    const resp = await fetch(`${cfg.url}/functions/v1/play`, {
      method: 'POST',
      headers: {
        apikey: cfg.key,
        Authorization: `Bearer ${ctx.accessToken}`,
        'Content-Type': 'application/json',
        ...(edgeCountry ? { 'x-kora-geo-country': edgeCountry } : {})
      },
      body: JSON.stringify({ titleId, episodeId })
    })
    const data = await resp.json().catch(() => ({}))
    if (resp.ok && data?.r2Path) {
      const r2Url = createR2PlaybackUrl(data.r2Path, 3600)
      if (r2Url) {
        return sendJson(res, 200, {
          url: r2Url,
          mime: data.mime || null,
          ads: data.ads,
          subtitles: Array.isArray(data.subtitles) ? data.subtitles : []
        })
      }
      return sendJson(res, 503, { error: 'Le stockage vidéo Cloudflare R2 n’est pas encore activé sur le serveur.' })
    }
    if (resp.ok && data?.url) {
      return sendJson(res, 200, {
        url: data.url,
        mime: data.mime || null,
        ads: data.ads,
        subtitles: Array.isArray(data.subtitles) ? data.subtitles : []
      })
    }
    if (resp.status === 402 || resp.status === 403) {
      return sendJson(res, resp.status, { error: data?.error || 'Accès restreint.' })
    }
  } catch (e) {
    console.error('[kora-play]', e?.message || e)
  }

  return sendJson(res, 404, { error: 'Aucune source vidéo encodée pour ce titre.' })
}
