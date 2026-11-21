import {
  assertCsrf,
  enforceRateLimit,
  getPlatformSettings,
  getQuery,
  getSessionContext,
  getSupabaseConfig,
  isSafeMediaUrl,
  isSafeStoragePath,
  readJsonBody,
  safeError,
  safeName,
  sendJson,
  validateUploadMeta
} from '../server/supabaseServer.js'
import { createR2UploadUrl, getR2Config, isR2Configured } from '../server/r2Storage.js'
import { ensureSaspayConfig } from '../server/saspay.js'

const UUID_RE = /^[0-9a-f-]{36}$/i
const VALID_ROLES = new Set(['user', 'moderator', 'admin'])
const names = s => [...new Set(String(s || '').split(',').map(x => x.trim().slice(0, 80)).filter(Boolean))].slice(0, 20)

async function peopleIds(db, list) {
  if (!list.length) return []
  const { data } = await db.from('people').select('id,name').in('name', list)
  const have = new Map((data || []).map(p => [p.name, p.id]))
  const missing = list.filter(n => !have.has(n))
  if (missing.length) {
    const { data: ins } = await db.from('people').insert(missing.map(name => ({ name }))).select('id,name')
    ;(ins || []).forEach(p => have.set(p.name, p.id))
  }
  return list.map(n => have.get(n)).filter(Boolean)
}

async function logAudit(db, actorId, action, entity, entityId) {
  try {
    await db.from('audit_log').insert({ actor_id: actorId, action, entity, entity_id: String(entityId) })
  } catch { /* optionnel */ }
}

export default async function handler(req, res) {
  const ctx = await getSessionContext(req, res)
  if (!ctx.configured) return sendJson(res, 503, { error: 'Base de données non configurée.' })
  if (!ctx.user || !ctx.sb) return sendJson(res, 401, { error: 'Connexion requise.' })
  if (ctx.role !== 'admin' && ctx.role !== 'moderator') return sendJson(res, 403, { error: 'Accès réservé aux administrateurs et modérateurs.' })

  const db = ctx.sb
  const uid = ctx.user.id
  const q = getQuery(req)
  const action = q.get('action') || ''

  const modActions = new Set(['reports', 'close-report'])
  if (ctx.role !== 'admin' && !modActions.has(action)) {
    return sendJson(res, 403, { error: 'Action réservée aux administrateurs.' })
  }

  if (req.method === 'GET') {
    if (action === 'stats') {
      const [stats, logs, ps] = await Promise.all([
        db.rpc('admin_stats'),
        db.from('audit_log').select('id,action,entity,entity_id,created_at').order('created_at', { ascending: false }).limit(15),
        getPlatformSettings()
      ])
      if (stats.error) return safeError(res, 400, 'Impossible de charger les statistiques.', stats.error)
      const r2 = getR2Config()
      const r2Active = r2.configured || Boolean(ps?.r2Enabled)
      const sp = await ensureSaspayConfig()
      return sendJson(res, 200, {
        stats: stats.data,
        logs: logs.data || [],
        platformSettings: ps,
        r2Status: {
          configured: r2Active,
          accountId: r2.accountId,
          bucket: r2.bucket,
          maxVideoMb: r2Active ? 5120 : 50
        },
        saspayStatus: {
          configured: sp.configured,
          webhookConfigured: sp.webhookConfigured,
          mode: sp.mode
        }
      })
    }

    if (action === 'reports') {
      const { data, error } = await db.from('reports').select('id,reason,status,created_at,titles(title)').order('created_at', { ascending: false })
      if (error) return safeError(res, 400, 'Impossible de charger les signalements.', error)
      return sendJson(res, 200, { rows: data || [] })
    }

    if (action === 'rights') {
      const [t, r] = await Promise.all([
        db.from('titles').select('id,title').order('title'),
        db.from('rights').select('id,title_id,country,access,available_from,available_until,titles(title)').order('id', { ascending: false })
      ])
      return sendJson(res, 200, { titles: t.data || [], rights: r.data || [] })
    }

    if (action === 'users') {
      const rpc = await db.rpc('admin_list_accounts')
      if (!rpc.error && rpc.data) return sendJson(res, 200, { rows: rpc.data })
      const fb = await db.from('accounts').select('id,name,phone,country,role,created_at').order('created_at', { ascending: false }).limit(100)
      if (fb.error) return safeError(res, 400, 'Impossible de charger les comptes.', fb.error)
      return sendJson(res, 200, { rows: fb.data || [] })
    }

    if (action === 'titles') {
      const { data, error } = await db.from('titles').select('id,title,type,year,country,status,poster_url,creator_id').order('id', { ascending: false })
      if (error) return safeError(res, 400, 'Impossible de charger les contenus.', error)
      return sendJson(res, 200, { rows: data || [] })
    }

    if (action === 'title-detail') {
      const id = q.get('id')
      const [g, l] = await Promise.all([
        db.from('genres').select('id,name').order('name'),
        db.from('languages').select('code,name').order('name')
      ])
      if (!id || id === 'new') {
        return sendJson(res, 200, { genres: g.data || [], langs: l.data || [], title: null })
      }
      const numId = Number(id)
      if (!Number.isInteger(numId) || numId <= 0) return sendJson(res, 400, { error: 'Identifiant invalide.' })
      const { data: t, error } = await db.from('titles')
        .select('*, title_genres(genre_id), title_people(role,position,people(name)), video_assets(id,size_bytes), seasons(id,number, episodes(id,number,title,synopsis,duration_min,intro_end_sec,video_assets(id)))')
        .eq('id', numId)
        .maybeSingle()
      if (error) return safeError(res, 400, 'Impossible de charger la fiche.', error)
      return sendJson(res, 200, { genres: g.data || [], langs: l.data || [], title: t })
    }

    return sendJson(res, 400, { error: 'Action inconnue.' })
  }

  if (req.method !== 'POST') return sendJson(res, 405, { error: 'Méthode non autorisée.' })
  if (!assertCsrf(req, res)) return
  if (!enforceRateLimit(req, res, 'admin_write', 60, 5 * 60_000, uid)) return

  let body
  try { body = await readJsonBody(req) } catch (e) { return safeError(res, e.status || 400, 'Requête invalide.', e) }

  if (action === 'platform-settings') {
    const patch = { id: 1, updated_at: new Date().toISOString() }
    if (typeof body.billingSimulation === 'boolean') patch.billing_simulation = body.billingSimulation
    if (typeof body.maintenanceMode === 'boolean') patch.maintenance_mode = body.maintenanceMode
    if (typeof body.maintenanceMessage === 'string') {
      patch.maintenance_message = body.maintenanceMessage.trim().slice(0, 400) || 'Nous effectuons une mise à jour pour améliorer votre expérience cinéma sur Kora. Le service sera de retour très bientôt.'
    }
    const { error } = await db.from('platform_settings').upsert(patch)
    if (error) return safeError(res, 400, 'Impossible de mettre à jour les réglages de la plateforme.', error)
    await logAudit(db, uid, `platform_settings:sim=${patch.billing_simulation ?? 'unchanged'}:maint=${patch.maintenance_mode ?? 'unchanged'}`, 'platform_settings', 1)
    const ps = await getPlatformSettings()
    return sendJson(res, 200, { ok: true, platformSettings: ps })
  }

  if (action === 'close-report') {
    const id = Number(body.id)
    if (!Number.isInteger(id) || id <= 0) return sendJson(res, 400, { error: 'Identifiant invalide.' })
    const { error } = await db.from('reports').update({ status: 'closed' }).eq('id', id)
    if (error) return safeError(res, 400, 'Impossible de clore le signalement.', error)
    await logAudit(db, uid, 'close_report', 'reports', id)
    return sendJson(res, 200, { ok: true })
  }

  if (action === 'add-right') {
    const titleId = Number(body.title_id)
    if (!Number.isInteger(titleId) || titleId <= 0) return sendJson(res, 400, { error: 'Titre invalide.' })
    const access = ['free', 'premium', 'rent', 'buy'].includes(body.access) ? body.access : 'free'
    const country = String(body.country || 'Mali').trim().slice(0, 60)
    const { error } = await db.from('rights').insert({
      title_id: titleId,
      country,
      access,
      available_from: body.available_from || null,
      available_until: body.available_until || null
    })
    if (error) return safeError(res, 400, 'Impossible d’ajouter ce droit.', error)
    await logAudit(db, uid, `add_right:${country}:${access}`, 'rights', titleId)
    return sendJson(res, 200, { ok: true })
  }

  if (action === 'delete-right') {
    const id = Number(body.id)
    if (!Number.isInteger(id) || id <= 0) return sendJson(res, 400, { error: 'Identifiant invalide.' })
    const { error } = await db.from('rights').delete().eq('id', id)
    if (error) return safeError(res, 400, 'Impossible de supprimer ce droit.', error)
    return sendJson(res, 200, { ok: true })
  }

  if (action === 'set-role') {
    const targetId = String(body.target_id || '')
    const newRole = String(body.new_role || '')
    if (!UUID_RE.test(targetId) || !VALID_ROLES.has(newRole)) {
      return sendJson(res, 400, { error: 'Compte ou rôle invalide.' })
    }
    const { error } = await db.rpc('admin_set_role', { target_id: targetId, new_role: newRole })
    if (error) return safeError(res, 400, 'Impossible de modifier ce rôle.', error)
    await logAudit(db, uid, `set_role:${newRole}`, 'accounts', targetId)
    return sendJson(res, 200, { ok: true })
  }

  if (action === 'toggle-title') {
    const id = Number(body.id)
    if (!Number.isInteger(id) || id <= 0) return sendJson(res, 400, { error: 'Identifiant invalide.' })
    const next = body.status === 'published' ? 'published' : 'unpublished'
    if (next === 'published') {
      const { data: row } = await db.from('titles').select('poster_url').eq('id', id).maybeSingle()
      if (!row?.poster_url || !row.poster_url.trim()) {
        return sendJson(res, 400, { error: 'Ajoutez une page de couverture (affiche 2:3) avant de publier ce contenu.' })
      }
    }
    const { error } = await db.from('titles').update({ status: next, updated_at: new Date().toISOString() }).eq('id', id)
    if (error) return safeError(res, 400, 'Impossible de changer le statut.', error)
    await logAudit(db, uid, `set_status:${next}`, 'titles', id)
    return sendJson(res, 200, { ok: true })
  }

  if (action === 'delete-title') {
    const id = Number(body.id)
    if (!Number.isInteger(id) || id <= 0) return sendJson(res, 400, { error: 'Identifiant invalide.' })
    const { error } = await db.from('titles').delete().eq('id', id)
    if (error) return safeError(res, 400, 'Impossible de supprimer ce contenu.', error)
    await logAudit(db, uid, 'delete_title', 'titles', id)
    return sendJson(res, 200, { ok: true })
  }

  if (action === 'sign-upload') {
    const bucket = body.bucket === 'videos' ? 'videos' : 'posters'
    const ps = bucket === 'videos' && !isR2Configured() ? await getPlatformSettings() : null
    const useR2 = bucket === 'videos' && (isR2Configured() || Boolean(ps?.r2Enabled))
    const meta = validateUploadMeta(bucket, body.fileName, body.mime, body.sizeBytes, { useR2 })
    if (!meta.ok) return sendJson(res, 400, { error: meta.error })

    const folderRaw = String(body.folder || 'admin').trim()
    const folder = /^[a-zA-Z0-9_-]{1,64}$/.test(folderRaw) ? folderRaw : 'admin'
    const kind = safeName(body.kind || (bucket === 'videos' ? 'video' : 'poster')).replace(/\./g, '')
    const path = `${folder}/${kind}-${Date.now()}-${meta.cleanName}`

    if (useR2) {
      if (isR2Configured()) {
        const r2 = createR2UploadUrl(path, 7200)
        if (r2?.signedUrl) {
          return sendJson(res, 200, { signedUrl: r2.signedUrl, path: r2.storagePath, publicUrl: null, provider: 'r2' })
        }
      }
      const cfg = getSupabaseConfig()
      const efResp = await fetch(`${cfg.url}/functions/v1/play`, {
        method: 'POST',
        headers: {
          apikey: cfg.key,
          Authorization: `Bearer ${ctx.accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ action: 'sign-r2-upload', objectKey: path })
      })
      const efData = await efResp.json().catch(() => ({}))
      if (efResp.ok && efData?.signedUrl) {
        return sendJson(res, 200, { signedUrl: efData.signedUrl, path: efData.storagePath, publicUrl: null, provider: 'r2' })
      }
      return sendJson(res, 500, { error: efData?.error || 'Impossible de préparer l’envoi du fichier.' })
    }

    const { data, error } = await db.storage.from(bucket).createSignedUploadUrl(path)
    if (error || !data?.signedUrl) {
      return safeError(res, 400, 'Impossible de préparer le téléversement.', error)
    }
    const publicUrl = bucket === 'posters' ? db.storage.from('posters').getPublicUrl(path).data.publicUrl : null
    return sendJson(res, 200, { signedUrl: data.signedUrl, path, publicUrl, provider: 'supabase' })
  }

  if (action === 'save-title') {
    const f = body.form || {}
    const isNew = !body.id || body.id === 'new'
    const title = String(f.title || '').trim().slice(0, 160)
    const posterUrl = String(f.poster_url || '').trim()
    const backdropUrl = String(f.backdrop_url || '').trim()

    if (!title) return sendJson(res, 400, { error: 'Le titre est obligatoire.' })
    if (f.status === 'published' && !posterUrl) {
      return sendJson(res, 400, { error: 'Une page de couverture (affiche 2:3) est obligatoire pour publier un contenu sur Kora.' })
    }
    if (posterUrl && !isSafeMediaUrl(posterUrl)) {
      return sendJson(res, 400, { error: 'L’URL de couverture doit être une URL HTTPS valide.' })
    }
    if (backdropUrl && !isSafeMediaUrl(backdropUrl)) {
      return sendJson(res, 400, { error: 'L’URL de bannière doit être une URL HTTPS valide.' })
    }

    const row = {
      title,
      type: ['series', 'film', 'doc', 'short'].includes(f.type) ? f.type : 'series',
      year: f.year ? Math.max(1900, Math.min(2100, Number(f.year))) : null,
      duration_min: f.duration_min ? Math.max(1, Math.min(600, Number(f.duration_min))) : null,
      country: String(f.country || 'Mali').trim().slice(0, 60) || 'Mali',
      original_language: f.original_language ? String(f.original_language).slice(0, 8) : null,
      age_rating: ['Tous', '7+', '12+', '16+', '18+'].includes(f.age_rating) ? f.age_rating : 'Tous',
      synopsis_short: (String(f.synopsis_short || '').trim() || String(f.synopsis_long || '').trim()).slice(0, 180),
      synopsis_long: String(f.synopsis_long || '').trim().slice(0, 4000),
      status: ['draft', 'published', 'unpublished'].includes(f.status) ? f.status : 'published',
      is_trending: !!f.is_trending,
      is_new: !!f.is_new,
      is_exclusive: !!f.is_exclusive,
      available_from: f.available_from || null,
      available_until: f.available_until || null,
      poster_url: posterUrl || null,
      backdrop_url: backdropUrl || null,
      updated_at: new Date().toISOString()
    }

    const editId = isNew ? null : Number(body.id)
    if (!isNew && (!Number.isInteger(editId) || editId <= 0)) return sendJson(res, 400, { error: 'Identifiant invalide.' })

    const r = isNew
      ? await db.from('titles').insert(row).select('id').single()
      : await db.from('titles').update(row).eq('id', editId).select('id').single()
    if (r.error) return safeError(res, 400, 'Impossible d’enregistrer cette œuvre.', r.error)
    const tid = r.data.id

    const sel = Array.isArray(body.genres) ? body.genres.filter(x => Number.isInteger(Number(x))).slice(0, 15) : []
    await db.from('title_genres').delete().eq('title_id', tid)
    if (sel.length) await db.from('title_genres').insert(sel.map(genre_id => ({ title_id: tid, genre_id: Number(genre_id) })))

    await db.from('title_people').delete().eq('title_id', tid)
    const [di, ci] = await Promise.all([peopleIds(db, names(body.director)), peopleIds(db, names(body.cast))])
    const links = [
      ...di.map(person_id => ({ title_id: tid, person_id, role: 'director', position: 0 })),
      ...ci.map((person_id, i) => ({ title_id: tid, person_id, role: 'actor', position: i + 1 }))
    ]
    if (links.length) await db.from('title_people').insert(links)

    await logAudit(db, uid, isNew ? 'create_title' : 'update_title', 'titles', tid)
    return sendJson(res, 200, { id: tid })
  }

  if (action === 'add-episode') {
    const titleId = Number(body.titleId)
    const seasonNum = Math.max(1, Math.min(99, Number(body.season) || 1))
    const epTitle = String(body.title || '').trim().slice(0, 120)
    if (!Number.isInteger(titleId) || titleId <= 0 || !epTitle) return sendJson(res, 400, { error: 'Titre d’épisode requis.' })

    let { data: sRow } = await db.from('seasons').select('id,number').eq('title_id', titleId).eq('number', seasonNum).maybeSingle()
    if (!sRow) {
      const ins = await db.from('seasons').insert({ title_id: titleId, number: seasonNum }).select('id,number').single()
      if (ins.error) return safeError(res, 400, 'Impossible de créer la saison.', ins.error)
      sRow = ins.data
    }
    const { data: existingEps } = await db.from('episodes').select('number').eq('season_id', sRow.id)
    const nextNum = (existingEps || []).length + 1
    const { error } = await db.from('episodes').insert({
      season_id: sRow.id,
      number: nextNum,
      title: epTitle,
      synopsis: String(body.synopsis || '').trim().slice(0, 1000) || null,
      duration_min: Math.max(1, Math.min(300, Number(body.duration_min) || 45)),
      intro_end_sec: Math.max(0, Math.min(600, Number(body.intro_end_sec) || 75))
    })
    if (error) return safeError(res, 400, 'Impossible d’ajouter l’épisode.', error)
    return sendJson(res, 200, { ok: true, season: seasonNum, number: nextNum })
  }

  if (action === 'delete-episode') {
    const id = Number(body.id)
    if (!Number.isInteger(id) || id <= 0) return sendJson(res, 400, { error: 'Identifiant invalide.' })
    const { error } = await db.from('episodes').delete().eq('id', id)
    if (error) return safeError(res, 400, 'Impossible de supprimer cet épisode.', error)
    return sendJson(res, 200, { ok: true })
  }

  if (action === 'register-video') {
    const { title_id, episode_id, storage_path, size_bytes, mime } = body
    if (!isSafeStoragePath(storage_path) || (!title_id && !episode_id)) {
      return sendJson(res, 400, { error: 'Paramètres vidéo invalides.' })
    }
    const col = title_id ? 'title_id' : 'episode_id'
    const val = Number(title_id || episode_id)
    if (!Number.isInteger(val) || val <= 0) return sendJson(res, 400, { error: 'Cible vidéo invalide.' })
    await db.from('video_assets').delete().eq(col, val)
    const { error } = await db.from('video_assets').insert({
      ...(title_id ? { title_id: val } : { episode_id: val }),
      storage_path: String(storage_path),
      size_bytes: Math.max(0, Number(size_bytes) || 0),
      mime: String(mime || 'video/mp4').slice(0, 40),
      status: 'ready'
    })
    if (error) return safeError(res, 400, 'Impossible d’enregistrer la vidéo.', error)
    return sendJson(res, 200, { ok: true })
  }

  return sendJson(res, 400, { error: 'Action inconnue.' })
}
