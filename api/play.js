import { getSessionContext, getSupabaseConfig, readJsonBody, sendJson } from '../server/supabaseServer.js'

export default async function handler(req, res) {
  if (req.method !== 'POST') return sendJson(res, 405, { error: 'Méthode non autorisée.' })
  const ctx = await getSessionContext(req, res)
  if (!ctx.configured) return sendJson(res, 503, { error: 'Service vidéo non configuré.' })
  if (!ctx.user || !ctx.sb || !ctx.accessToken) return sendJson(res, 401, { error: 'Connexion requise pour lire.' })

  const body = await readJsonBody(req)
  const titleId = Number(body.titleId)
  let episodeId = body.episodeId ? Number(body.episodeId) : undefined
  const seasonNum = body.seasonNum ? Number(body.seasonNum) : undefined
  const epNum = body.epNum ? Number(body.epNum) : undefined

  if (!titleId) return sendJson(res, 400, { error: 'Titre invalide.' })

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

  // Appel côté serveur de l'Edge Function Supabase « play » avec le JWT de l'utilisateur
  const cfg = getSupabaseConfig()
  try {
    const resp = await fetch(`${cfg.url}/functions/v1/play`, {
      method: 'POST',
      headers: {
        apikey: cfg.key,
        Authorization: `Bearer ${ctx.accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ titleId, episodeId })
    })
    const data = await resp.json().catch(() => ({}))
    if (resp.ok && data?.url) {
      return sendJson(res, 200, { url: data.url, ads: data.ads })
    }
    if (resp.status === 402 || resp.status === 403) {
      return sendJson(res, resp.status, { error: data?.error || 'Accès restreint.' })
    }
  } catch { /* fallback ci-dessous si Edge Function indisponible */ }

  return sendJson(res, 404, { error: 'Aucune source vidéo encodée pour ce titre.' })
}
