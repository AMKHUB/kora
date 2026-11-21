import {
  assertCsrf,
  enforceRateLimit,
  getPlatformSettings,
  getQuery,
  getSessionContext,
  hashPinServer,
  readJsonBody,
  safeError,
  sendJson,
  verifyPinServer
} from '../server/supabaseServer.js'

const UUID_RE = /^[0-9a-f-]{36}$/i
const VALID_RATINGS = new Set(['', 'like', 'love', 'no'])
const VALID_AVATARS = new Set(['gold', 'emerald', 'crimson', 'sahel', 'indigo', 'cream'])
const PLAN_MAX_PROFILES = { free: 2, premium: 4, family: 6 }

export default async function handler(req, res) {
  const ctx = await getSessionContext(req, res)
  if (!ctx.configured) return sendJson(res, 503, { error: 'Base de données non configurée.' })
  if (!ctx.user || !ctx.sb) return sendJson(res, 401, { error: 'Connexion requise.' })

  const db = ctx.sb
  const uid = ctx.user.id
  const action = getQuery(req).get('action') || ''

  // GET pur (aucune écriture en base sur GET — Finding #19)
  if (req.method === 'GET' && action === 'sync') {
    const [acc, prof, list, prog, rat, sub, pay, dev, notif] = await Promise.all([
      db.from('accounts').select('role,name,country').eq('id', uid).maybeSingle(),
      db.from('profiles').select('id,name,avatar,is_kid,pin_hash,subtitle_lang,audio_lang,subtitle_size,autoplay_next').eq('account_id', uid).order('created_at'),
      db.from('my_list').select('profile_id,title_id'),
      db.from('watch_progress').select('profile_id,title_id,episode_id,position_sec'),
      db.from('ratings').select('profile_id,title_id,value'),
      db.from('subscriptions').select('plan_id,status,current_period_end,cancel_at_period_end').eq('account_id', uid).eq('status', 'active').order('id', { ascending: false }).limit(1),
      db.from('payments').select('id,amount_xof,provider,provider_ref,status,created_at').eq('account_id', uid).order('created_at', { ascending: false }).limit(20),
      db.from('devices').select('id,name,platform,last_seen_at,revoked_at').eq('account_id', uid).order('last_seen_at', { ascending: false }),
      db.from('notifications').select('id,title,body,kind,link,read_at,created_at').eq('account_id', uid).order('created_at', { ascending: false }).limit(20).then(r => r, () => ({ data: [] }))
    ])

    // Ne jamais renvoyer pin_hash au navigateur : uniquement has_pin (booléen) !
    const safeProfiles = (prof.data || []).map(({ pin_hash, ...rest }) => ({
      ...rest,
      has_pin: Boolean(pin_hash)
    }))

    return sendJson(res, 200, {
      account: acc.data || { role: ctx.role, name: '', country: 'Mali' },
      profiles: safeProfiles,
      my_list: list.data || [],
      watch_progress: prog.data || [],
      ratings: rat.data || [],
      subscription: sub.data?.[0] || null,
      payments: pay.data || [],
      devices: (dev.data || []).filter(d => !d.revoked_at),
      notifications: notif?.data || []
    })
  }

  if (req.method !== 'POST') return sendJson(res, 405, { error: 'Méthode non autorisée.' })
  if (!assertCsrf(req, res)) return

  let body
  try { body = await readJsonBody(req) } catch (e) { return safeError(res, e.status || 400, 'Requête invalide.', e) }

  if (action === 'register-device') {
    const name = String(body.name || '').trim().slice(0, 80)
    const platform = String(body.platform || 'Web').trim().slice(0, 40)
    if (!name) return sendJson(res, 400, { error: 'Nom d’appareil requis.' })
    const { data: existing } = await db.from('devices').select('id,name').eq('account_id', uid).is('revoked_at', null)
    if ((existing || []).some(d => d.name === name)) return sendJson(res, 200, { ok: true })
    if ((existing || []).length >= 10) return sendJson(res, 200, { ok: true })
    await db.from('devices').insert({ account_id: uid, name, platform, last_seen_at: new Date().toISOString() })
    return sendJson(res, 200, { ok: true })
  }

  if (action === 'verify-pin') {
    const { profileId, pin } = body
    if (!UUID_RE.test(String(profileId || ''))) return sendJson(res, 400, { error: 'Profil invalide.' })
    if (!enforceRateLimit(req, res, 'verify_pin', 6, 5 * 60_000, `${uid}:${profileId}`)) return
    const { data: prof } = await db.from('profiles').select('pin_hash').eq('id', profileId).eq('account_id', uid).maybeSingle()
    if (!prof) return sendJson(res, 404, { error: 'Profil introuvable.' })
    const valid = verifyPinServer(pin, prof.pin_hash)
    return sendJson(res, 200, { valid })
  }

  if (action === 'toggle-list') {
    const titleId = Number(body.titleId)
    if (!UUID_RE.test(String(body.profileId || '')) || !Number.isInteger(titleId) || titleId <= 0) {
      return sendJson(res, 400, { error: 'Paramètres invalides.' })
    }
    const r = body.remove
      ? await db.from('my_list').delete().match({ profile_id: body.profileId, title_id: titleId })
      : await db.from('my_list').insert({ profile_id: body.profileId, title_id: titleId })
    if (r.error) return safeError(res, 400, 'Impossible de mettre à jour Ma liste.', r.error)
    return sendJson(res, 200, { ok: true })
  }

  if (action === 'progress') {
    const titleId = Number(body.titleId)
    if (!UUID_RE.test(String(body.profileId || '')) || !Number.isInteger(titleId) || titleId <= 0) {
      return sendJson(res, 400, { error: 'Paramètres invalides.' })
    }
    const { error } = await db.from('watch_progress').upsert({
      profile_id: body.profileId,
      title_id: titleId,
      episode_id: 0,
      position_sec: Math.max(0, Math.min(86400, Math.floor(Number(body.positionSec) || 0))),
      updated_at: new Date().toISOString()
    })
    if (error) return safeError(res, 400, 'Impossible d’enregistrer la progression.', error)
    return sendJson(res, 200, { ok: true })
  }

  if (action === 'remove-history') {
    if (!UUID_RE.test(String(body.profileId || ''))) return sendJson(res, 400, { error: 'Profil invalide.' })
    const titleId = body.titleId ? Number(body.titleId) : null
    const r = titleId && Number.isInteger(titleId) && titleId > 0
      ? await db.from('watch_progress').delete().match({ profile_id: body.profileId, title_id: titleId })
      : await db.from('watch_progress').delete().eq('profile_id', body.profileId)
    if (r.error) return safeError(res, 400, 'Impossible de modifier l’historique.', r.error)
    return sendJson(res, 200, { ok: true })
  }

  if (action === 'rate') {
    const titleId = Number(body.titleId)
    const val = String(body.value || '')
    if (!UUID_RE.test(String(body.profileId || '')) || !Number.isInteger(titleId) || titleId <= 0 || !VALID_RATINGS.has(val)) {
      return sendJson(res, 400, { error: 'Paramètres invalides.' })
    }
    const r = val
      ? await db.from('ratings').upsert({ profile_id: body.profileId, title_id: titleId, value: val, updated_at: new Date().toISOString() })
      : await db.from('ratings').delete().match({ profile_id: body.profileId, title_id: titleId })
    if (r.error) return safeError(res, 400, 'Impossible d’enregistrer l’évaluation.', r.error)
    return sendJson(res, 200, { ok: true })
  }

  if (action === 'add-profile') {
    if (!enforceRateLimit(req, res, 'add_profile', 10, 10 * 60_000, uid)) return
    const name = String(body.name || '').trim().slice(0, 40)
    if (!name) return sendJson(res, 400, { error: 'Nom requis.' })

    // Vérification côté serveur du quota de profils selon l'offre active
    const [existingProf, activeSub] = await Promise.all([
      db.from('profiles').select('id').eq('account_id', uid),
      db.from('subscriptions').select('plan_id').eq('account_id', uid).eq('status', 'active').order('id', { ascending: false }).limit(1).maybeSingle()
    ])
    const maxAllowed = PLAN_MAX_PROFILES[activeSub.data?.plan_id || 'free'] || 2
    if ((existingProf.data || []).length >= maxAllowed) {
      return sendJson(res, 403, { error: `Limite de ${maxAllowed} profils atteinte pour votre formule actuelle.` })
    }

    const avatar = VALID_AVATARS.has(String(body.avatar)) ? String(body.avatar) : 'gold'
    const pinHash = body.pin ? hashPinServer(body.pin) : null
    if (body.pin && !pinHash) return sendJson(res, 400, { error: 'Le code PIN doit contenir exactement 4 chiffres.' })

    const { data, error } = await db.from('profiles')
      .insert({
        account_id: uid,
        name,
        is_kid: !!body.isKid,
        avatar,
        pin_hash: pinHash,
        max_age: body.isKid ? '7+' : '18+'
      })
      .select('id')
      .single()
    if (error) return safeError(res, 400, 'Impossible de créer le profil.', error)
    return sendJson(res, 200, { id: data.id, has_pin: Boolean(pinHash) })
  }

  if (action === 'update-profile') {
    const { id, patch } = body
    if (!UUID_RE.test(String(id || '')) || !patch || typeof patch !== 'object') {
      return sendJson(res, 400, { error: 'Paramètres invalides.' })
    }
    const { data: current } = await db.from('profiles').select('pin_hash,is_kid').eq('id', id).eq('account_id', uid).maybeSingle()
    if (!current) return sendJson(res, 404, { error: 'Profil introuvable.' })

    const dbPatch = {}
    if (patch.name !== undefined) {
      const cleanName = String(patch.name).trim().slice(0, 40)
      if (!cleanName) return sendJson(res, 400, { error: 'Nom requis.' })
      dbPatch.name = cleanName
    }
    if (patch.kid !== undefined) {
      dbPatch.is_kid = !!patch.kid
      dbPatch.max_age = patch.kid ? '7+' : '18+'
    }
    if (patch.avatar !== undefined && VALID_AVATARS.has(String(patch.avatar))) {
      dbPatch.avatar = String(patch.avatar)
    }
    if (patch.pin !== undefined) {
      if (patch.pin === null || patch.pin === '') {
        dbPatch.pin_hash = null
      } else {
        const hashed = hashPinServer(patch.pin)
        if (!hashed) return sendJson(res, 400, { error: 'Le code PIN doit contenir exactement 4 chiffres.' })
        dbPatch.pin_hash = hashed
      }
    }

    const { error } = await db.from('profiles').update(dbPatch).eq('id', id).eq('account_id', uid)
    if (error) return safeError(res, 400, 'Impossible de mettre à jour le profil.', error)
    return sendJson(res, 200, { ok: true })
  }

  if (action === 'delete-profile') {
    const id = String(body.id || '')
    if (!UUID_RE.test(id)) return sendJson(res, 400, { error: 'Profil invalide.' })
    const { data: all } = await db.from('profiles').select('id').eq('account_id', uid)
    if ((all || []).length <= 1) return sendJson(res, 400, { error: 'Vous devez conserver au moins un profil.' })
    const { error } = await db.from('profiles').delete().eq('id', id).eq('account_id', uid)
    if (error) return safeError(res, 400, 'Impossible de supprimer ce profil.', error)
    return sendJson(res, 200, { ok: true })
  }

  if (action === 'update-account') {
    const name = String(body.name || '').trim().slice(0, 80)
    const country = String(body.country || 'Mali').trim().slice(0, 60)
    const { error } = await db.from('accounts').update({ name, country }).eq('id', uid)
    if (error) return safeError(res, 400, 'Impossible de mettre à jour le compte.', error)
    return sendJson(res, 200, { ok: true })
  }

  if (action === 'revoke-device') {
    const deviceId = String(body.deviceId || '')
    if (!UUID_RE.test(deviceId)) return sendJson(res, 400, { error: 'Appareil invalide.' })
    const { error } = await db.from('devices').update({ revoked_at: new Date().toISOString() }).eq('id', deviceId).eq('account_id', uid)
    if (error) return safeError(res, 400, 'Impossible de révoquer cet appareil.', error)
    return sendJson(res, 200, { ok: true })
  }

  if (action === 'read-notifications') {
    const id = body.id
    const q = db.from('notifications').update({ read_at: new Date().toISOString() }).eq('account_id', uid)
    const r = id && /^\d+$/.test(String(id)) ? await q.eq('id', +id) : await q.is('read_at', null)
    if (r.error) return safeError(res, 400, 'Impossible de marquer comme lu.', r.error)
    return sendJson(res, 200, { ok: true })
  }

  if (action === 'report') {
    if (!enforceRateLimit(req, res, 'report', 5, 15 * 60_000, uid)) return
    const titleId = Number(body.titleId)
    const reason = String(body.reason || '').trim().slice(0, 500)
    if (!Number.isInteger(titleId) || titleId <= 0 || !reason) return sendJson(res, 400, { error: 'Motif requis.' })
    const { error } = await db.from('reports').insert({ account_id: uid, title_id: titleId, reason, status: 'open' })
    if (error) return safeError(res, 400, 'Impossible d’envoyer le signalement.', error)
    return sendJson(res, 200, { ok: true })
  }

  if (action === 'check-simulation') {
    const ps = await getPlatformSettings()
    if (!ps.billingSimulation) {
      return sendJson(res, 402, { error: 'L’activation gratuite est désactivée. Un paiement est requis pour souscrire à cette formule.' })
    }
    return sendJson(res, 200, { ok: true })
  }

  return sendJson(res, 400, { error: 'Action inconnue.' })
}
