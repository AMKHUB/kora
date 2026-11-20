import { getQuery, getSessionContext, readJsonBody, sendJson } from '../server/supabaseServer.js'

const UUID_RE = /^[0-9a-f-]{36}$/i

export default async function handler(req, res) {
  const ctx = await getSessionContext(req, res)
  if (!ctx.configured) return sendJson(res, 503, { error: 'Base de données non configurée.' })
  if (!ctx.user || !ctx.sb) return sendJson(res, 401, { error: 'Connexion requise.' })

  const db = ctx.sb
  const uid = ctx.user.id
  const action = getQuery(req).get('action') || ''

  if (req.method === 'GET' && action === 'sync') {
    const deviceName = getQuery(req).get('deviceName') || ''
    const devicePlatform = getQuery(req).get('devicePlatform') || 'Web'

    const [acc, prof, list, prog, rat, sub, pay, dev, notif] = await Promise.all([
      db.from('accounts').select('role,name,country').eq('id', uid).maybeSingle(),
      db.from('profiles').select('id,name,avatar,is_kid,pin_hash,subtitle_lang,audio_lang,subtitle_size,autoplay_next').order('created_at'),
      db.from('my_list').select('profile_id,title_id'),
      db.from('watch_progress').select('profile_id,title_id,episode_id,position_sec'),
      db.from('ratings').select('profile_id,title_id,value'),
      db.from('subscriptions').select('plan_id,status,current_period_end,cancel_at_period_end').eq('status', 'active').order('id', { ascending: false }).limit(1),
      db.from('payments').select('id,amount_xof,provider,provider_ref,status,created_at').order('created_at', { ascending: false }).limit(20),
      db.from('devices').select('id,name,platform,last_seen_at,revoked_at').order('last_seen_at', { ascending: false }),
      db.from('notifications').select('id,title,body,kind,link,read_at,created_at').order('created_at', { ascending: false }).limit(20).then(r => r, () => ({ data: [] }))
    ])

    const activeDevices = (dev.data || []).filter(d => !d.revoked_at)
    if (!activeDevices.length && deviceName) {
      db.from('devices').insert({ account_id: uid, name: deviceName, platform: devicePlatform, last_seen_at: new Date().toISOString() }).then(() => {}, () => {})
    }

    return sendJson(res, 200, {
      account: acc.data || { role: ctx.role, name: '', country: 'Mali' },
      profiles: prof.data || [],
      my_list: list.data || [],
      watch_progress: prog.data || [],
      ratings: rat.data || [],
      subscription: sub.data?.[0] || null,
      payments: pay.data || [],
      devices: activeDevices,
      notifications: notif?.data || []
    })
  }

  if (req.method !== 'POST') return sendJson(res, 405, { error: 'Méthode non autorisée.' })
  const body = await readJsonBody(req)

  if (action === 'toggle-list') {
    const { profileId, titleId, remove } = body
    if (!UUID_RE.test(String(profileId || '')) || !titleId) return sendJson(res, 400, { error: 'Paramètres invalides.' })
    const r = remove
      ? await db.from('my_list').delete().match({ profile_id: profileId, title_id: +titleId })
      : await db.from('my_list').insert({ profile_id: profileId, title_id: +titleId })
    if (r.error) return sendJson(res, 400, { error: r.error.message })
    return sendJson(res, 200, { ok: true })
  }

  if (action === 'progress') {
    const { profileId, titleId, positionSec } = body
    if (!UUID_RE.test(String(profileId || '')) || !titleId) return sendJson(res, 400, { error: 'Paramètres invalides.' })
    const { error } = await db.from('watch_progress').upsert({
      profile_id: profileId,
      title_id: +titleId,
      episode_id: 0,
      position_sec: Math.max(0, Math.floor(+positionSec || 0)),
      updated_at: new Date().toISOString()
    })
    if (error) return sendJson(res, 400, { error: error.message })
    return sendJson(res, 200, { ok: true })
  }

  if (action === 'remove-history') {
    const { profileId, titleId } = body
    if (!UUID_RE.test(String(profileId || ''))) return sendJson(res, 400, { error: 'Profil invalide.' })
    const r = titleId
      ? await db.from('watch_progress').delete().match({ profile_id: profileId, title_id: +titleId })
      : await db.from('watch_progress').delete().eq('profile_id', profileId)
    if (r.error) return sendJson(res, 400, { error: r.error.message })
    return sendJson(res, 200, { ok: true })
  }

  if (action === 'rate') {
    const { profileId, titleId, value } = body
    if (!UUID_RE.test(String(profileId || '')) || !titleId) return sendJson(res, 400, { error: 'Paramètres invalides.' })
    const r = value
      ? await db.from('ratings').upsert({ profile_id: profileId, title_id: +titleId, value: String(value), updated_at: new Date().toISOString() })
      : await db.from('ratings').delete().match({ profile_id: profileId, title_id: +titleId })
    if (r.error) return sendJson(res, 400, { error: r.error.message })
    return sendJson(res, 200, { ok: true })
  }

  if (action === 'add-profile') {
    const { name, isKid, avatar, pinHash } = body
    if (!String(name || '').trim()) return sendJson(res, 400, { error: 'Nom requis.' })
    const { data, error } = await db.from('profiles')
      .insert({
        account_id: uid,
        name: String(name).trim(),
        is_kid: !!isKid,
        avatar: String(avatar || 'kora'),
        pin_hash: pinHash || null,
        max_age: isKid ? '7+' : '18+'
      })
      .select('id')
      .single()
    if (error) return sendJson(res, 400, { error: error.message })
    return sendJson(res, 200, { id: data.id })
  }

  if (action === 'update-profile') {
    const { id, patch } = body
    if (!UUID_RE.test(String(id || '')) || !patch) return sendJson(res, 400, { error: 'Paramètres invalides.' })
    const dbPatch = {}
    if (patch.name !== undefined) dbPatch.name = String(patch.name).trim()
    if (patch.kid !== undefined) { dbPatch.is_kid = !!patch.kid; dbPatch.max_age = patch.kid ? '7+' : '18+' }
    if (patch.avatar !== undefined) dbPatch.avatar = String(patch.avatar)
    if (patch.pinHash !== undefined) dbPatch.pin_hash = patch.pinHash || null
    const { error } = await db.from('profiles').update(dbPatch).eq('id', id)
    if (error) return sendJson(res, 400, { error: error.message })
    return sendJson(res, 200, { ok: true })
  }

  if (action === 'delete-profile') {
    const { id } = body
    if (!UUID_RE.test(String(id || ''))) return sendJson(res, 400, { error: 'Profil invalide.' })
    const { error } = await db.from('profiles').delete().eq('id', id)
    if (error) return sendJson(res, 400, { error: error.message })
    return sendJson(res, 200, { ok: true })
  }

  if (action === 'update-account') {
    const { name, country } = body
    const { error } = await db.from('accounts').update({
      name: String(name || '').trim(),
      country: String(country || 'Mali').trim()
    }).eq('id', uid)
    if (error) return sendJson(res, 400, { error: error.message })
    return sendJson(res, 200, { ok: true })
  }

  if (action === 'revoke-device') {
    const { deviceId } = body
    if (!UUID_RE.test(String(deviceId || ''))) return sendJson(res, 400, { error: 'Appareil invalide.' })
    const { error } = await db.from('devices').update({ revoked_at: new Date().toISOString() }).eq('id', deviceId)
    if (error) return sendJson(res, 400, { error: error.message })
    return sendJson(res, 200, { ok: true })
  }

  if (action === 'read-notifications') {
    const { id } = body
    const q = db.from('notifications').update({ read_at: new Date().toISOString() }).eq('account_id', uid)
    const r = id && /^\d+$/.test(String(id)) ? await q.eq('id', +id) : await q.is('read_at', null)
    if (r.error) return sendJson(res, 400, { error: r.error.message })
    return sendJson(res, 200, { ok: true })
  }

  if (action === 'report') {
    const { titleId, reason } = body
    if (!titleId || !String(reason || '').trim()) return sendJson(res, 400, { error: 'Motif requis.' })
    const { error } = await db.from('reports').insert({
      account_id: uid,
      title_id: +titleId,
      reason: String(reason).trim(),
      status: 'open'
    })
    if (error) return sendJson(res, 400, { error: error.message })
    return sendJson(res, 200, { ok: true })
  }

  return sendJson(res, 400, { error: 'Action inconnue.' })
}
