import {
  assertCsrf,
  createAnonClient,
  enforceRateLimit,
  getQuery,
  getSessionContext,
  readJsonBody,
  safeError,
  safeName,
  sendJson
} from '../server/supabaseServer.js'
import { fetchVastAd, fireTrackingBeacons, isSafeExternalAdUrl } from '../server/vastParser.js'

const VALID_PLACEMENTS = new Set(['preroll', 'midroll'])
const VALID_MEDIA_TYPES = new Set(['video', 'image'])
const VALID_EVENTS = new Set(['impression', 'complete', 'click', 'skip', 'vast_impression'])
const AD_ALLOWED_EXT = new Set(['mp4', 'webm', 'mov', 'jpg', 'jpeg', 'png', 'webp'])
const AD_ALLOWED_MIME = new Set([
  'video/mp4', 'video/webm', 'video/quicktime',
  'image/jpeg', 'image/png', 'image/webp'
])

const COUNTRY_NAME_TO_ISO = {
  mali: 'ML', 'sénégal': 'SN', senegal: 'SN', 'côte d’ivoire': 'CI', "cote d'ivoire": 'CI',
  'burkina faso': 'BF', 'guinée': 'GN', guinee: 'GN', niger: 'NE', 'bénin': 'BJ', benin: 'BJ',
  togo: 'TG', cameroun: 'CM', ghana: 'GH', nigeria: 'NG', 'afrique du sud': 'ZA',
  france: 'FR', belgique: 'BE', canada: 'CA', 'états-unis': 'US', 'etats-unis': 'US'
}

function resolveCountryIso(headerVal, fallbackRaw) {
  const h = String(headerVal || '').trim().toUpperCase()
  if (/^[A-Z]{2}$/.test(h)) return h
  const raw = String(fallbackRaw || '').trim()
  if (/^[A-Za-z]{2}$/.test(raw)) return raw.toUpperCase()
  return COUNTRY_NAME_TO_ISO[raw.toLowerCase()] || ''
}

function cleanCountries(raw) {
  if (Array.isArray(raw)) {
    return [...new Set(raw.map(x => String(x || '').trim().toUpperCase()).filter(x => /^[A-Z]{2}$/.test(x)))].slice(0, 40)
  }
  return [...new Set(
    String(raw || '')
      .split(/[,;\s]+/)
      .map(x => x.trim().toUpperCase())
      .filter(x => /^[A-Z]{2}$/.test(x))
  )].slice(0, 40)
}

function cleanIsoDate(raw) {
  const s = String(raw || '').trim()
  if (!s) return null
  const d = new Date(s)
  return Number.isNaN(d.getTime()) ? null : d.toISOString()
}

export default async function handler(req, res) {
  const q = getQuery(req)
  const action = q.get('action') || ''
  const ctx = await getSessionContext(req, res)

  // ============================================================================
  // 1. DÉCISION PUBLICITAIRE HYBRIDE (Direct Kora -> VAST de secours -> Autopromo)
  // ============================================================================
  if (req.method === 'POST' && action === 'decision') {
    if (!assertCsrf(req, res)) return
    if (!enforceRateLimit(req, res, 'ads-decision', 90, 60_000, ctx.user?.id || '')) return

    let body
    try { body = await readJsonBody(req) } catch (e) { return safeError(res, e.status || 400, 'Requête invalide.', e) }

    const placement = VALID_PLACEMENTS.has(body.placement) ? body.placement : 'preroll'
    const isKid = Boolean(body.isKid)
    const isTrailer = Boolean(body.isTrailer)

    if (isKid || isTrailer) {
      return sendJson(res, 200, { mode: 'none', midrollEnabled: false, midrollIntervalMin: 20 })
    }

    const db = ctx.sb || createAnonClient()
    if (!db) {
      return sendJson(res, 200, {
        mode: placement === 'preroll' ? 'house' : 'none',
        durationSec: 5,
        skipAfterSec: 0,
        midrollEnabled: false,
        midrollIntervalMin: 20
      })
    }

    // Vérifie si l'utilisateur est abonné payant ou administrateur/modérateur -> 0 publicité
    if (ctx.user) {
      if (ctx.role === 'admin' || ctx.role === 'moderator') {
        return sendJson(res, 200, { mode: 'none', midrollEnabled: false, midrollIntervalMin: 20 })
      }
      const { data: sub } = await db
        .from('subscriptions')
        .select('plan_id,current_period_end')
        .eq('account_id', ctx.user.id)
        .eq('status', 'active')
        .order('id', { ascending: false })
        .limit(1)
        .maybeSingle()
      const valid = Boolean(sub && (!sub.current_period_end || new Date(sub.current_period_end).getTime() > Date.now()))
      if (valid && (sub.plan_id === 'premium' || sub.plan_id === 'family')) {
        return sendJson(res, 200, { mode: 'none', midrollEnabled: false, midrollIntervalMin: 20 })
      }
    }

    // Lecture configuration publicitaire globale
    const { data: cfgRows } = await db.rpc('get_ad_runtime_config')
    const cfg = Array.isArray(cfgRows) ? cfgRows[0] : cfgRows
    const adsEnabled = cfg ? cfg.ads_enabled !== false : true
    const midrollEnabled = Boolean(cfg?.midroll_enabled)
    const midrollIntervalMin = Math.max(5, Math.min(60, Number(cfg?.midroll_interval_min || 20)))
    const vastTagUrl = String(cfg?.vast_tag_url || '').trim()

    if (!adsEnabled) {
      return sendJson(res, 200, { mode: 'none', midrollEnabled: false, midrollIntervalMin })
    }

    const country = resolveCountryIso(
      req.headers?.['x-vercel-ip-country'] || req.headers?.['cf-ipcountry'],
      body.country
    )

    // Priorité 1 : Campagne directe Kora
    const { data: directRows } = await db.rpc('select_active_ad', {
      p_placement: placement,
      p_country: country || null
    })
    const direct = Array.isArray(directRows) ? directRows[0] : directRows
    if (direct && direct.media_url && /^https:\/\//i.test(direct.media_url)) {
      return sendJson(res, 200, {
        mode: 'direct',
        campaignId: Number(direct.id),
        name: direct.name,
        advertiser: direct.advertiser,
        placement: direct.placement,
        mediaType: direct.media_type === 'image' ? 'image' : 'video',
        mediaUrl: direct.media_url,
        clickUrl: isSafeExternalAdUrl(direct.click_url) ? direct.click_url : '',
        ctaLabel: direct.cta_label || 'En savoir plus',
        durationSec: Math.max(3, Math.min(120, Number(direct.duration_sec || 15))),
        skipAfterSec: Math.max(0, Math.min(60, Number(direct.skip_after_sec ?? 5))),
        midrollEnabled,
        midrollIntervalMin
      })
    }

    // Priorité 2 : Secours programmatique VAST
    if (vastTagUrl && isSafeExternalAdUrl(vastTagUrl)) {
      const vast = await fetchVastAd(vastTagUrl)
      if (vast) {
        return sendJson(res, 200, {
          ...vast,
          placement,
          midrollEnabled,
          midrollIntervalMin
        })
      }
    }

    // Priorité 3 : Autopromo courte Kora Premium (uniquement en pre-roll)
    if (placement === 'preroll') {
      return sendJson(res, 200, {
        mode: 'house',
        durationSec: 5,
        skipAfterSec: 0,
        midrollEnabled,
        midrollIntervalMin
      })
    }

    return sendJson(res, 200, { mode: 'none', midrollEnabled, midrollIntervalMin })
  }

  // ============================================================================
  // 2. ENREGISTREMENT DES VUES, CLICS, COMPLÉTIONS & BALISES VAST
  // ============================================================================
  if (req.method === 'POST' && action === 'event') {
    if (!assertCsrf(req, res)) return
    if (!enforceRateLimit(req, res, 'ads-event', 120, 60_000, ctx.user?.id || '')) return

    let body
    try { body = await readJsonBody(req) } catch (e) { return safeError(res, e.status || 400, 'Requête invalide.', e) }

    const eventType = VALID_EVENTS.has(body.eventType) ? body.eventType : 'impression'
    const placement = VALID_PLACEMENTS.has(body.placement) ? body.placement : 'preroll'
    const campaignId = Number.isInteger(Number(body.campaignId)) && Number(body.campaignId) > 0 ? Number(body.campaignId) : null
    const titleId = Number.isInteger(Number(body.titleId)) && Number(body.titleId) > 0 ? Number(body.titleId) : null
    const country = resolveCountryIso(
      req.headers?.['x-vercel-ip-country'] || req.headers?.['cf-ipcountry'],
      body.country
    )

    const db = ctx.sb || createAnonClient()
    if (db) {
      await db.rpc('record_ad_event', {
        p_campaign_id: campaignId,
        p_title_id: titleId,
        p_event_type: eventType,
        p_placement: placement,
        p_country: country || null
      }).catch(() => {})
    }

    if (Array.isArray(body.beacons) && body.beacons.length) {
      await fireTrackingBeacons(body.beacons)
    }

    return sendJson(res, 200, { ok: true })
  }

  // ============================================================================
  // 3. GESTION ADMINISTRATEUR DES PUBLICITÉS (RÉGIE DIRECTE + VAST)
  // ============================================================================
  if (!ctx.configured) return sendJson(res, 503, { error: 'Service indisponible.' })
  if (!ctx.user || !ctx.sb) return sendJson(res, 401, { error: 'Connexion requise.' })
  if (ctx.role !== 'admin') return sendJson(res, 403, { error: 'Action réservée aux administrateurs.' })

  const db = ctx.sb

  if (req.method === 'GET' && action === 'admin-list') {
    const [{ data: campaigns, error: cErr }, { data: cfgRows }, { count: vastCount }] = await Promise.all([
      db.from('ad_campaigns').select('*').order('created_at', { ascending: false }),
      db.rpc('get_ad_runtime_config'),
      db.from('ad_events').select('id', { count: 'exact', head: true }).eq('event_type', 'vast_impression')
    ])
    if (cErr) return safeError(res, 400, 'Impossible de charger les campagnes publicitaires.', cErr)

    const list = campaigns || []
    const totalImpressions = list.reduce((acc, c) => acc + Number(c.impressions_count || 0), 0)
    const totalClicks = list.reduce((acc, c) => acc + Number(c.clicks_count || 0), 0)
    const totalCompletions = list.reduce((acc, c) => acc + Number(c.completions_count || 0), 0)
    const estRevenueXof = Math.round(
      list.reduce((acc, c) => acc + (Number(c.impressions_count || 0) / 1000) * Number(c.cpm_xof || 0), 0)
    )

    const cfg = Array.isArray(cfgRows) ? cfgRows[0] : cfgRows
    return sendJson(res, 200, {
      config: {
        ads_enabled: cfg ? cfg.ads_enabled !== false : true,
        midroll_enabled: Boolean(cfg?.midroll_enabled),
        midroll_interval_min: Number(cfg?.midroll_interval_min || 20),
        vast_tag_url: String(cfg?.vast_tag_url || '')
      },
      campaigns: list,
      summary: {
        activeCampaigns: list.filter(c => c.active).length,
        totalImpressions,
        totalClicks,
        totalCompletions,
        vastImpressions: Number(vastCount || 0),
        ctrPct: totalImpressions > 0 ? Number(((totalClicks / totalImpressions) * 100).toFixed(2)) : 0,
        completionPct: totalImpressions > 0 ? Number(((totalCompletions / totalImpressions) * 100).toFixed(1)) : 0,
        estRevenueXof,
        creatorShareXof: Math.round(estRevenueXof * 0.7)
      }
    })
  }

  if (req.method !== 'POST') return sendJson(res, 405, { error: 'Méthode non autorisée.' })
  if (!assertCsrf(req, res)) return
  if (!enforceRateLimit(req, res, 'admin-ads', 60, 60_000, ctx.user.id)) return

  let body
  try { body = await readJsonBody(req) } catch (e) { return safeError(res, e.status || 400, 'Requête invalide.', e) }

  if (action === 'admin-config') {
    const patch = { updated_at: new Date().toISOString() }
    if (typeof body.ads_enabled === 'boolean') patch.ads_enabled = body.ads_enabled
    if (typeof body.midroll_enabled === 'boolean') patch.midroll_enabled = body.midroll_enabled
    if (body.midroll_interval_min !== undefined) {
      patch.midroll_interval_min = Math.max(5, Math.min(60, Math.round(Number(body.midroll_interval_min) || 20)))
    }
    if (body.vast_tag_url !== undefined) {
      const cleanVast = String(body.vast_tag_url || '').trim()
      if (cleanVast && !isSafeExternalAdUrl(cleanVast)) {
        return sendJson(res, 400, { error: 'Le lien publicitaire de secours doit être une adresse HTTPS valide.' })
      }
      patch.vast_tag_url = cleanVast
    }
    const { error } = await db.from('platform_settings').update(patch).eq('id', 1)
    if (error) return safeError(res, 400, 'Impossible d’enregistrer les réglages publicitaires.', error)
    return sendJson(res, 200, { ok: true })
  }

  if (action === 'admin-test-vast') {
    const url = String(body.vast_tag_url || '').trim()
    if (!isSafeExternalAdUrl(url)) {
      return sendJson(res, 400, { error: 'Adresse HTTPS invalide.' })
    }
    const result = await fetchVastAd(url)
    if (!result) {
      return sendJson(res, 400, { error: 'Aucune annonce vidéo valide n’a été trouvée à cette adresse.' })
    }
    return sendJson(res, 200, {
      ok: true,
      advertiser: result.advertiser,
      name: result.name,
      durationSec: result.durationSec,
      skipAfterSec: result.skipAfterSec
    })
  }

  if (action === 'admin-sign-upload') {
    const fileName = String(body.fileName || '')
    const mime = String(body.mime || '').toLowerCase()
    const size = Number(body.sizeBytes || 0)
    const ext = fileName.split('.').pop()?.toLowerCase() || ''
    if (!AD_ALLOWED_EXT.has(ext) || (mime && !AD_ALLOWED_MIME.has(mime))) {
      return sendJson(res, 400, { error: 'Format non pris en charge (MP4, WebM, MOV, JPG, PNG ou WebP).' })
    }
    if (!Number.isFinite(size) || size <= 0 || size > 50 * 1024 * 1024) {
      return sendJson(res, 400, { error: 'Le spot publicitaire dépasse la taille maximale autorisée.' })
    }
    const path = `spots/${Date.now()}-${safeName(fileName)}`
    const { data, error } = await db.storage.from('ads').createSignedUploadUrl(path)
    if (error || !data?.signedUrl) {
      return safeError(res, 400, 'Impossible de préparer l’envoi du spot.', error)
    }
    const publicUrl = db.storage.from('ads').getPublicUrl(path).data.publicUrl
    return sendJson(res, 200, { signedUrl: data.signedUrl, path, publicUrl })
  }

  if (action === 'admin-save') {
    const id = Number(body.id) > 0 ? Number(body.id) : null
    const name = String(body.name || '').trim().slice(0, 140)
    const advertiser = String(body.advertiser || '').trim().slice(0, 100)
    const mediaUrl = String(body.media_url || '').trim()
    const clickUrl = String(body.click_url || '').trim()
    if (!name || !advertiser) {
      return sendJson(res, 400, { error: 'Le nom de campagne et l’annonceur sont obligatoires.' })
    }
    if (!isSafeExternalAdUrl(mediaUrl)) {
      return sendJson(res, 400, { error: 'Veuillez importer un spot vidéo/image ou indiquer un lien HTTPS valide.' })
    }
    if (clickUrl && !isSafeExternalAdUrl(clickUrl)) {
      return sendJson(res, 400, { error: 'Le lien de destination doit commencer par https://.' })
    }

    const maxImp = body.max_impressions === '' || body.max_impressions === null || body.max_impressions === undefined
      ? null
      : Math.max(1, Math.round(Number(body.max_impressions)))

    const row = {
      name,
      advertiser,
      placement: VALID_PLACEMENTS.has(body.placement) ? body.placement : 'preroll',
      media_type: VALID_MEDIA_TYPES.has(body.media_type) ? body.media_type : 'video',
      media_url: mediaUrl,
      storage_path: body.storage_path ? String(body.storage_path).trim().slice(0, 260) : null,
      click_url: clickUrl,
      cta_label: String(body.cta_label || 'En savoir plus').trim().slice(0, 40) || 'En savoir plus',
      duration_sec: Math.max(3, Math.min(120, Math.round(Number(body.duration_sec) || 15))),
      skip_after_sec: Math.max(0, Math.min(60, Math.round(Number(body.skip_after_sec ?? 5)))),
      target_countries: cleanCountries(body.target_countries),
      cpm_xof: Math.max(0, Math.round(Number(body.cpm_xof) || 1500)),
      max_impressions: Number.isFinite(maxImp) ? maxImp : null,
      priority: Math.max(1, Math.min(100, Math.round(Number(body.priority) || 10))),
      active: body.active !== false,
      starts_at: cleanIsoDate(body.starts_at),
      ends_at: cleanIsoDate(body.ends_at),
      updated_at: new Date().toISOString()
    }

    if (id) {
      const { error } = await db.from('ad_campaigns').update(row).eq('id', id)
      if (error) return safeError(res, 400, 'Impossible de modifier la campagne.', error)
      return sendJson(res, 200, { ok: true, id })
    }
    const { data, error } = await db.from('ad_campaigns').insert({ ...row, created_by: ctx.user.id }).select('id').single()
    if (error) return safeError(res, 400, 'Impossible de créer la campagne.', error)
    return sendJson(res, 200, { ok: true, id: data.id })
  }

  if (action === 'admin-toggle') {
    const id = Number(body.id)
    if (!Number.isInteger(id) || id <= 0) return sendJson(res, 400, { error: 'Campagne invalide.' })
    const { error } = await db.from('ad_campaigns').update({ active: Boolean(body.active), updated_at: new Date().toISOString() }).eq('id', id)
    if (error) return safeError(res, 400, 'Mise à jour impossible.', error)
    return sendJson(res, 200, { ok: true })
  }

  if (action === 'admin-delete') {
    const id = Number(body.id)
    if (!Number.isInteger(id) || id <= 0) return sendJson(res, 400, { error: 'Campagne invalide.' })
    const { error } = await db.from('ad_campaigns').delete().eq('id', id)
    if (error) return safeError(res, 400, 'Suppression impossible.', error)
    return sendJson(res, 200, { ok: true })
  }

  return sendJson(res, 400, { error: 'Action inconnue.' })
}
