import { createClient } from 'npm:@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
}
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } })

// Délivre un lien de lecture signé (1 h) ou HLS adaptatif + pistes de sous-titres WebVTT synchronisées
// après avoir vérifié : connexion, publication, dates, pays et formule (free / premium / family).
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  const { data: { user } } = await db.auth.getUser((req.headers.get('Authorization') || '').replace('Bearer ', ''))
  if (!user) return json({ error: 'Connexion requise' }, 401)

  const { titleId, episodeId } = await req.json().catch(() => ({}))
  if (!titleId) return json({ error: 'Requête invalide' }, 400)

  const { data: t } = await db.from('titles').select('id,status,creator_id,available_from,available_until').eq('id', titleId).maybeSingle()
  const { data: acc } = await db.from('accounts').select('country,role').eq('id', user.id).maybeSingle()
  const isPrivileged = acc?.role === 'admin' || (t?.creator_id && t.creator_id === user.id)
  const today = new Date().toISOString().slice(0, 10)
  if (!t || (!isPrivileged && (t.status !== 'published' || (t.available_from && t.available_from > today) || (t.available_until && t.available_until < today))))
    return json({ error: 'Contenu indisponible' }, 404)

  const { data: sub } = await db.from('subscriptions').select('plan_id').eq('account_id', user.id).eq('status', 'active').order('id', { ascending: false }).limit(1).maybeSingle()
  const plan = sub?.plan_id ?? 'free'
  const isPaid = plan === 'premium' || plan === 'family'

  const { data: rights } = await db.from('rights').select('country,access').eq('title_id', titleId)
  if (!isPrivileged && rights?.length) {
    const r = rights.find((x) => x.country === acc?.country)
    if (!r) return json({ error: 'Non disponible dans votre pays' }, 403)
    if (r.access === 'premium' && !isPaid) return json({ error: 'Réservé aux abonnés Premium ou Famille' }, 402)
  }

  const q = db.from('video_assets').select('storage_path,hls_url,mime').eq('status', 'ready')
  const { data: asset } = await (episodeId ? q.eq('episode_id', episodeId) : q.eq('title_id', titleId)).maybeSingle()

  let url = ''
  if (asset?.hls_url) {
    url = asset.hls_url
  } else if (asset?.storage_path) {
    const { data: signed } = await db.storage.from('videos').createSignedUrl(asset.storage_path, 3600)
    if (signed?.signedUrl) url = signed.signedUrl
  }

  if (!url) return json({ error: 'Aucune vidéo' }, 404)

  // Récupération des sous-titres synchronisés (WebVTT + offset_ms)
  const sq = db.from('subtitles').select('id,language_code,language_label,vtt_content,offset_ms,source').order('id')
  const { data: subtitles } = await (episodeId ? sq.eq('episode_id', episodeId) : sq.eq('title_id', titleId).is('episode_id', null))

  return json({
    url,
    mime: asset?.mime || null,
    plan,
    ads: !isPaid && !isPrivileged,
    subtitles: subtitles || []
  })
})
