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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'Méthode non autorisée' }, 405)

  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  const token = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '').trim()
  if (!token) return json({ error: 'Connexion requise' }, 401)
  const { data: { user } } = await db.auth.getUser(token)
  if (!user) return json({ error: 'Connexion requise' }, 401)

  const body = await req.json().catch(() => ({}))
  const titleId = Number(body.titleId)
  const episodeId = body.episodeId ? Number(body.episodeId) : null
  if (!Number.isInteger(titleId) || titleId <= 0) return json({ error: 'Requête invalide' }, 400)
  if (episodeId !== null && (!Number.isInteger(episodeId) || episodeId <= 0)) return json({ error: 'Épisode invalide' }, 400)

  // Anti-IDOR : vérifier que l'épisode demandé appartient bien au titre demandé
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
  const { data: acc } = await db.from('accounts').select('country,role').eq('id', user.id).maybeSingle()
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
  if (asset?.hls_url && /^https:\/\//i.test(asset.hls_url)) {
    url = asset.hls_url
  } else if (asset?.storage_path && !asset.storage_path.includes('..') && !asset.storage_path.startsWith('/')) {
    const { data: signed } = await db.storage.from('videos').createSignedUrl(asset.storage_path, 3600)
    if (signed?.signedUrl) url = signed.signedUrl
  }

  if (!url) return json({ error: 'Aucune vidéo' }, 404)

  const sq = db.from('subtitles').select('id,language_code,language_label,vtt_content,offset_ms,source').order('id')
  const { data: subtitles } = await (episodeId !== null ? sq.eq('episode_id', episodeId) : sq.eq('title_id', titleId).is('episode_id', null))

  return json({
    url,
    mime: asset?.mime || null,
    plan,
    ads: !isPaid && !isPrivileged,
    subtitles: subtitles || []
  })
})
