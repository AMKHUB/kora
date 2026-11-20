import { getQuery, getSessionContext, readJsonBody, safeName, sendJson } from '../server/supabaseServer.js'

const names = s => [...new Set(String(s || '').split(',').map(x => x.trim()).filter(Boolean))]

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

  // Modérateur : uniquement les signalements
  const modActions = new Set(['reports', 'close-report'])
  if (ctx.role !== 'admin' && !modActions.has(action)) {
    return sendJson(res, 403, { error: 'Action réservée aux administrateurs.' })
  }

  if (req.method === 'GET') {
    if (action === 'stats') {
      const [stats, logs] = await Promise.all([
        db.rpc('admin_stats'),
        db.from('audit_log').select('id,action,entity,entity_id,created_at').order('created_at', { ascending: false }).limit(15)
      ])
      if (stats.error) return sendJson(res, 400, { error: stats.error.message })
      return sendJson(res, 200, { stats: stats.data, logs: logs.data || [] })
    }

    if (action === 'reports') {
      const { data, error } = await db.from('reports').select('id,reason,status,created_at,titles(title)').order('created_at', { ascending: false })
      if (error) return sendJson(res, 400, { error: error.message })
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
      if (fb.error) return sendJson(res, 400, { error: fb.error.message })
      return sendJson(res, 200, { rows: fb.data || [] })
    }

    if (action === 'titles') {
      const { data, error } = await db.from('titles').select('id,title,type,year,country,status,poster_url,creator_id').order('id', { ascending: false })
      if (error) return sendJson(res, 400, { error: error.message })
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
      const { data: t, error } = await db.from('titles')
        .select('*, title_genres(genre_id), title_people(role,position,people(name)), video_assets(id,size_bytes), seasons(id,number, episodes(id,number,title,synopsis,duration_min,intro_end_sec,video_assets(id)))')
        .eq('id', Number(id))
        .maybeSingle()
      if (error) return sendJson(res, 400, { error: error.message })
      return sendJson(res, 200, { genres: g.data || [], langs: l.data || [], title: t })
    }

    return sendJson(res, 400, { error: 'Action inconnue.' })
  }

  if (req.method !== 'POST') return sendJson(res, 405, { error: 'Méthode non autorisée.' })
  const body = await readJsonBody(req)

  if (action === 'close-report') {
    const id = Number(body.id)
    const { error } = await db.from('reports').update({ status: 'closed' }).eq('id', id)
    if (error) return sendJson(res, 400, { error: error.message })
    await logAudit(db, uid, 'close_report', 'reports', id)
    return sendJson(res, 200, { ok: true })
  }

  if (action === 'add-right') {
    const { title_id, country, access, available_from, available_until } = body
    const { error } = await db.from('rights').insert({
      title_id: Number(title_id),
      country,
      access,
      available_from: available_from || null,
      available_until: available_until || null
    })
    if (error) return sendJson(res, 400, { error: error.message })
    await logAudit(db, uid, `add_right:${country}:${access}`, 'rights', title_id)
    return sendJson(res, 200, { ok: true })
  }

  if (action === 'delete-right') {
    const { error } = await db.from('rights').delete().eq('id', Number(body.id))
    if (error) return sendJson(res, 400, { error: error.message })
    return sendJson(res, 200, { ok: true })
  }

  if (action === 'set-role') {
    const { error } = await db.rpc('admin_set_role', { target_id: body.target_id, new_role: body.new_role })
    if (error) return sendJson(res, 400, { error: error.message })
    return sendJson(res, 200, { ok: true })
  }

  if (action === 'toggle-title') {
    const id = Number(body.id)
    const next = body.status === 'published' ? 'published' : 'unpublished'
    if (next === 'published') {
      const { data: row } = await db.from('titles').select('poster_url').eq('id', id).maybeSingle()
      if (!row?.poster_url || !row.poster_url.trim()) {
        return sendJson(res, 400, { error: 'Ajoutez une page de couverture (affiche 2:3) avant de publier ce contenu.' })
      }
    }
    const { error } = await db.from('titles').update({ status: next, updated_at: new Date().toISOString() }).eq('id', id)
    if (error) return sendJson(res, 400, { error: error.message })
    await logAudit(db, uid, `set_status:${next}`, 'titles', id)
    return sendJson(res, 200, { ok: true })
  }

  if (action === 'delete-title') {
    const id = Number(body.id)
    const { error } = await db.from('titles').delete().eq('id', id)
    if (error) return sendJson(res, 400, { error: error.message })
    await logAudit(db, uid, 'delete_title', 'titles', id)
    return sendJson(res, 200, { ok: true })
  }

  if (action === 'sign-upload') {
    const bucket = body.bucket === 'videos' ? 'videos' : 'posters'
    const folder = safeName(body.folder || 'admin')
    const kind = safeName(body.kind || (bucket === 'videos' ? 'video' : 'poster'))
    const fileName = safeName(body.fileName || 'file')
    const path = `${folder}/${kind}-${Date.now()}-${fileName}`
    const { data, error } = await db.storage.from(bucket).createSignedUploadUrl(path)
    if (error || !data?.signedUrl) {
      return sendJson(res, 400, { error: error?.message || 'Impossible de préparer le téléversement.' })
    }
    const publicUrl = bucket === 'posters' ? db.storage.from('posters').getPublicUrl(path).data.publicUrl : null
    return sendJson(res, 200, { signedUrl: data.signedUrl, path, publicUrl })
  }

  if (action === 'save-title') {
    const f = body.form || {}
    const isNew = !body.id || body.id === 'new'
    const title = String(f.title || '').trim()
    if (!title) return sendJson(res, 400, { error: 'Le titre est obligatoire.' })
    if (f.status === 'published' && !String(f.poster_url || '').trim()) {
      return sendJson(res, 400, { error: 'Une page de couverture (affiche 2:3) est obligatoire pour publier un contenu sur Kora.' })
    }
    const row = {
      title,
      type: f.type || 'series',
      year: f.year ? Number(f.year) : null,
      duration_min: f.duration_min ? Number(f.duration_min) : null,
      country: String(f.country || 'Mali').trim() || 'Mali',
      original_language: f.original_language || null,
      age_rating: f.age_rating || 'Tous',
      synopsis_short: (String(f.synopsis_short || '').trim() || String(f.synopsis_long || '').trim()).slice(0, 180),
      synopsis_long: String(f.synopsis_long || '').trim(),
      status: f.status || 'published',
      is_trending: !!f.is_trending,
      is_new: !!f.is_new,
      is_exclusive: !!f.is_exclusive,
      available_from: f.available_from || null,
      available_until: f.available_until || null,
      poster_url: String(f.poster_url || '').trim() || null,
      backdrop_url: String(f.backdrop_url || '').trim() || null,
      updated_at: new Date().toISOString()
    }
    const r = isNew
      ? await db.from('titles').insert(row).select('id').single()
      : await db.from('titles').update(row).eq('id', Number(body.id)).select('id').single()
    if (r.error) return sendJson(res, 400, { error: r.error.message })
    const tid = r.data.id

    const sel = Array.isArray(body.genres) ? body.genres : []
    await db.from('title_genres').delete().eq('title_id', tid)
    if (sel.length) await db.from('title_genres').insert(sel.map(genre_id => ({ title_id: tid, genre_id })))

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
    const seasonNum = Math.max(1, Number(body.season) || 1)
    const epTitle = String(body.title || '').trim()
    if (!titleId || !epTitle) return sendJson(res, 400, { error: 'Titre d’épisode requis.' })

    let { data: sRow } = await db.from('seasons').select('id,number').eq('title_id', titleId).eq('number', seasonNum).maybeSingle()
    if (!sRow) {
      const ins = await db.from('seasons').insert({ title_id: titleId, number: seasonNum }).select('id,number').single()
      if (ins.error) return sendJson(res, 400, { error: ins.error.message })
      sRow = ins.data
    }
    const { data: existingEps } = await db.from('episodes').select('number').eq('season_id', sRow.id)
    const nextNum = (existingEps || []).length + 1
    const { error } = await db.from('episodes').insert({
      season_id: sRow.id,
      number: nextNum,
      title: epTitle,
      synopsis: String(body.synopsis || '').trim() || null,
      duration_min: Number(body.duration_min) || 45,
      intro_end_sec: Number(body.intro_end_sec) || 75
    })
    if (error) return sendJson(res, 400, { error: error.message })
    return sendJson(res, 200, { ok: true, season: seasonNum, number: nextNum })
  }

  if (action === 'delete-episode') {
    const { error } = await db.from('episodes').delete().eq('id', Number(body.id))
    if (error) return sendJson(res, 400, { error: error.message })
    return sendJson(res, 200, { ok: true })
  }

  if (action === 'register-video') {
    const { title_id, episode_id, storage_path, size_bytes, mime } = body
    if (!storage_path || (!title_id && !episode_id)) return sendJson(res, 400, { error: 'Paramètres vidéo invalides.' })
    const col = title_id ? 'title_id' : 'episode_id'
    const val = Number(title_id || episode_id)
    await db.from('video_assets').delete().eq(col, val)
    const { error } = await db.from('video_assets').insert({
      ...(title_id ? { title_id: Number(title_id) } : { episode_id: Number(episode_id) }),
      storage_path: String(storage_path),
      size_bytes: Number(size_bytes) || 0,
      mime: String(mime || 'video/mp4'),
      status: 'ready'
    })
    if (error) return sendJson(res, 400, { error: error.message })
    return sendJson(res, 200, { ok: true })
  }

  return sendJson(res, 400, { error: 'Action inconnue.' })
}
