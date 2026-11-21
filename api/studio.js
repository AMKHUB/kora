import {
  assertCsrf,
  enforceRateLimit,
  getQuery,
  getSessionContext,
  isSafeMediaUrl,
  isSafeStoragePath,
  readJsonBody,
  safeError,
  safeName,
  sendJson,
  validateUploadMeta
} from '../server/supabaseServer.js'

export default async function handler(req, res) {
  const ctx = await getSessionContext(req, res)
  if (!ctx.configured) return sendJson(res, 503, { error: 'Base de données non configurée.' })
  if (!ctx.user || !ctx.sb) return sendJson(res, 401, { error: 'Connexion requise pour accéder à Kora Studio.' })

  const db = ctx.sb
  const uid = ctx.user.id
  const action = getQuery(req).get('action') || ''

  if (req.method === 'GET' && action === 'data') {
    const [ch, ti] = await Promise.all([
      db.from('creator_channels').select('channel_name,bio,country').eq('account_id', uid).maybeSingle(),
      db.from('titles')
        .select('id,title,type,year,country,original_language,age_rating,duration_min,synopsis_short,synopsis_long,status,poster_url,backdrop_url,created_at,title_genres(genres(name)),title_people(role,position,people(name)),seasons(number,episodes(id,number,title,synopsis,duration_min,intro_end_sec,video_assets(id)))')
        .eq('creator_id', uid)
        .order('id', { ascending: false })
    ])
    const titles = (ti.data || []).map(t => ({
      id: t.id,
      title: t.title,
      type: t.type,
      year: t.year || new Date().getFullYear(),
      country: t.country || 'Mali',
      original_language: t.original_language || 'fr',
      age_rating: t.age_rating || 'Tous',
      duration_min: t.duration_min || 45,
      synopsis_short: t.synopsis_short || '',
      synopsis_long: t.synopsis_long || '',
      director: (t.title_people || []).filter(x => x.role === 'director').map(x => x.people?.name).filter(Boolean).join(', '),
      cast: (t.title_people || []).filter(x => x.role === 'actor').sort((a, b) => a.position - b.position).map(x => x.people?.name).filter(Boolean).join(', '),
      genres: (t.title_genres || []).map(x => x.genres?.name).filter(Boolean),
      status: t.status,
      poster_url: t.poster_url || '',
      backdrop_url: t.backdrop_url || '',
      episodes: (t.seasons || []).sort((a, b) => a.number - b.number).flatMap(s =>
        (s.episodes || []).sort((a, b) => a.number - b.number).map(e => ({
          localId: `db-${e.id}`,
          dbId: e.id,
          season: s.number,
          number: e.number,
          title: e.title,
          synopsis: e.synopsis || '',
          duration_min: e.duration_min || 45,
          intro_end_sec: e.intro_end_sec || 75,
          hasUploadedVideo: !!(e.video_assets?.length)
        }))
      ),
      rights_scope: 'world',
      access_tier: 'free',
      created_at: t.created_at
    }))
    return sendJson(res, 200, {
      channel: ch.data ? { channel_name: ch.data.channel_name, bio: ch.data.bio || '', country: ch.data.country || 'Mali' } : null,
      titles
    })
  }

  if (req.method !== 'POST') return sendJson(res, 405, { error: 'Méthode non autorisée.' })
  if (!assertCsrf(req, res)) return

  let body
  try { body = await readJsonBody(req) } catch (e) { return safeError(res, e.status || 400, 'Requête invalide.', e) }

  if (action === 'channel') {
    if (!enforceRateLimit(req, res, 'studio_channel', 15, 10 * 60_000, uid)) return
    const { error } = await db.from('creator_channels').upsert({
      account_id: uid,
      channel_name: String(body.channel_name || '').trim().slice(0, 80) || 'Mon Studio Kora',
      bio: String(body.bio || '').trim().slice(0, 800),
      country: String(body.country || 'Mali').trim().slice(0, 60),
      updated_at: new Date().toISOString()
    })
    if (error) return safeError(res, 400, 'Impossible d’enregistrer la chaîne.', error)
    return sendJson(res, 200, { ok: true })
  }

  if (action === 'sign-upload') {
    if (!enforceRateLimit(req, res, 'studio_upload', 30, 15 * 60_000, uid)) return
    const bucket = body.bucket === 'videos' ? 'videos' : 'posters'
    const meta = validateUploadMeta(bucket, body.fileName, body.mime, body.sizeBytes)
    if (!meta.ok) return sendJson(res, 400, { error: meta.error })

    const prefix = safeName(body.prefix || (bucket === 'videos' ? 'vid' : 'poster')).replace(/\./g, '')
    const path = `creator/${uid}/${prefix}-${Date.now()}-${meta.cleanName}`
    const { data, error } = await db.storage.from(bucket).createSignedUploadUrl(path)
    if (error || !data?.signedUrl) {
      return safeError(res, 400, 'Impossible de préparer le téléversement.', error)
    }
    const publicUrl = bucket === 'posters' ? db.storage.from('posters').getPublicUrl(path).data.publicUrl : null
    return sendJson(res, 200, { signedUrl: data.signedUrl, path, publicUrl })
  }

  if (action === 'save-title') {
    if (!enforceRateLimit(req, res, 'studio_save', 20, 15 * 60_000, uid)) return
    const title = String(body.title || '').trim().slice(0, 160)
    const status = body.status === 'published' ? 'published' : 'draft'
    const posterUrl = String(body.poster_url || '').trim()
    const backdropUrl = String(body.backdrop_url || '').trim()

    if (!title) return sendJson(res, 400, { error: 'Le titre est obligatoire.' })
    if (status === 'published' && !posterUrl) {
      return sendJson(res, 400, { error: 'Une page de couverture (affiche 2:3) est obligatoire pour publier sur Kora.' })
    }
    if (posterUrl && !isSafeMediaUrl(posterUrl, { strictSupabaseOnly: true })) {
      return sendJson(res, 400, { error: 'URL de couverture non autorisée. Téléversez une image JPG, PNG ou WebP.' })
    }
    if (backdropUrl && !isSafeMediaUrl(backdropUrl, { strictSupabaseOnly: true })) {
      return sendJson(res, 400, { error: 'URL de bannière non autorisée.' })
    }

    // Validation stricte anti-IDOR des chemins vidéo (un créateur ne peut référencer que creator/<uid>/...)
    const rawEpisodes = Array.isArray(body.episodes) ? body.episodes : []
    if (rawEpisodes.length > 100) return sendJson(res, 400, { error: 'Maximum 100 épisodes par envoi.' })
    if (body.mainVideoAsset?.storage_path && !isSafeStoragePath(body.mainVideoAsset.storage_path, uid)) {
      return sendJson(res, 403, { error: 'Chemin de fichier vidéo non autorisé.' })
    }
    for (const ep of rawEpisodes) {
      if (ep?.videoAsset?.storage_path && !isSafeStoragePath(ep.videoAsset.storage_path, uid)) {
        return sendJson(res, 403, { error: 'Chemin de fichier vidéo d’épisode non autorisé.' })
      }
    }

    const payload = {
      creator_id: uid,
      title,
      type: ['series', 'film', 'doc', 'short'].includes(body.type) ? body.type : 'series',
      year: Math.max(1900, Math.min(2100, Number(body.year) || new Date().getFullYear())),
      duration_min: Math.max(1, Math.min(600, Number(body.duration_min) || 45)),
      country: String(body.country || 'Mali').trim().slice(0, 60) || 'Mali',
      original_language: String(body.original_language || 'fr').trim().slice(0, 8) || 'fr',
      age_rating: ['Tous', '7+', '12+', '16+', '18+'].includes(body.age_rating) ? body.age_rating : 'Tous',
      synopsis_short: (String(body.synopsis_short || '').trim() || String(body.synopsis_long || '').trim()).slice(0, 180),
      synopsis_long: (String(body.synopsis_long || '').trim() || String(body.synopsis_short || '').trim()).slice(0, 4000),
      status,
      is_new: true,
      poster_url: posterUrl || null,
      backdrop_url: backdropUrl || null,
      updated_at: new Date().toISOString()
    }

    const editId = body.id ? Number(body.id) : null
    if (editId !== null && (!Number.isInteger(editId) || editId <= 0)) {
      return sendJson(res, 400, { error: 'Identifiant de contenu invalide.' })
    }

    const resTitle = editId
      ? await db.from('titles').update(payload).eq('id', editId).eq('creator_id', uid).select('id').single()
      : await db.from('titles').insert(payload).select('id').single()
    if (resTitle.error) return safeError(res, 400, 'Impossible d’enregistrer cette œuvre.', resTitle.error)
    const tid = resTitle.data.id

    const genres = Array.isArray(body.genres) ? body.genres.slice(0, 10) : []
    if (genres.length) {
      const { data: gRows } = await db.from('genres').select('id,name').in('name', genres)
      await db.from('title_genres').delete().eq('title_id', tid)
      if (gRows?.length) await db.from('title_genres').insert(gRows.map(g => ({ title_id: tid, genre_id: g.id })))
    }

    const dirNames = String(body.director || '').split(',').map(x => x.trim().slice(0, 80)).filter(Boolean).slice(0, 5)
    const castNames = String(body.cast || '').split(',').map(x => x.trim().slice(0, 80)).filter(Boolean).slice(0, 20)
    const allPeople = [...new Set([...dirNames, ...castNames])]
    if (allPeople.length) {
      const { data: existingP } = await db.from('people').select('id,name').in('name', allPeople)
      const mapP = new Map((existingP || []).map(x => [x.name, x.id]))
      const missing = allPeople.filter(n => !mapP.has(n))
      if (missing.length) {
        const { data: insP } = await db.from('people').insert(missing.map(name => ({ name }))).select('id,name')
        ;(insP || []).forEach(x => mapP.set(x.name, x.id))
      }
      await db.from('title_people').delete().eq('title_id', tid)
      const links = [
        ...dirNames.map(n => ({ title_id: tid, person_id: mapP.get(n), role: 'director', position: 0 })),
        ...castNames.map((n, idx) => ({ title_id: tid, person_id: mapP.get(n), role: 'actor', position: idx + 1 }))
      ].filter(l => l.person_id)
      if (links.length) await db.from('title_people').insert(links)
    }

    await db.from('title_languages').delete().eq('title_id', tid)
    await db.from('title_languages').insert({ title_id: tid, language_code: payload.original_language, kind: 'audio' })

    // Droits territoriaux & paywall (inclut '*' pour monde entier Premium — Finding #8 !)
    await db.from('rights').delete().eq('title_id', tid)
    const accessTier = body.access_tier === 'premium' ? 'premium' : 'free'
    if (body.rights_scope === 'mali') {
      await db.from('rights').insert({ title_id: tid, country: 'Mali', access: accessTier })
    } else if (body.rights_scope === 'west_africa') {
      await db.from('rights').insert(['Mali', 'Sénégal', 'Côte d’Ivoire', 'Burkina Faso', 'Guinée', 'Niger'].map(c => ({ title_id: tid, country: c, access: accessTier })))
    } else if (accessTier === 'premium') {
      await db.from('rights').insert({ title_id: tid, country: '*', access: 'premium' })
    }

    const episodeMap = []
    if (payload.type === 'series' && rawEpisodes.length) {
      const seasonNums = [...new Set(rawEpisodes.map(e => Math.max(1, Number(e.season) || 1)))].sort((a, b) => a - b)
      const { data: existingSeasons } = await db.from('seasons').select('id,number').eq('title_id', tid)
      const sMap = new Map((existingSeasons || []).map(s => [s.number, s.id]))
      for (const sn of seasonNums) {
        if (!sMap.has(sn)) {
          const { data: insS } = await db.from('seasons').insert({ title_id: tid, number: sn }).select('id,number').single()
          if (insS) sMap.set(sn, insS.id)
        }
      }
      for (const ep of rawEpisodes) {
        const sid = sMap.get(Math.max(1, Number(ep.season) || 1))
        if (!sid) continue
        let epId = ep.dbId ? Number(ep.dbId) : null
        if (epId && Number.isInteger(epId) && epId > 0) {
          await db.from('episodes').update({
            title: String(ep.title || 'Épisode').slice(0, 120),
            synopsis: String(ep.synopsis || '').trim().slice(0, 1000) || null,
            duration_min: Math.max(1, Math.min(300, Number(ep.duration_min) || 45)),
            intro_end_sec: Math.max(0, Math.min(600, Number(ep.intro_end_sec) || 75))
          }).eq('id', epId).eq('season_id', sid)
        } else {
          const { data: insE } = await db.from('episodes').insert({
            season_id: sid,
            number: Math.max(1, Number(ep.number) || 1),
            title: String(ep.title || 'Épisode').slice(0, 120),
            synopsis: String(ep.synopsis || '').trim().slice(0, 1000) || null,
            duration_min: Math.max(1, Math.min(300, Number(ep.duration_min) || 45)),
            intro_end_sec: Math.max(0, Math.min(600, Number(ep.intro_end_sec) || 75))
          }).select('id').single()
          epId = insE?.id || null
        }
        if (epId) {
          episodeMap.push({ localId: ep.localId, dbId: epId })
          if (ep.videoAsset?.storage_path) {
            await db.from('video_assets').delete().eq('episode_id', epId)
            await db.from('video_assets').insert({
              episode_id: epId,
              storage_path: ep.videoAsset.storage_path,
              size_bytes: Math.max(0, Number(ep.videoAsset.size_bytes) || 0),
              mime: String(ep.videoAsset.mime || 'video/mp4').slice(0, 40),
              status: 'ready'
            })
          }
        }
      }
    } else if (body.mainVideoAsset?.storage_path) {
      await db.from('video_assets').delete().eq('title_id', tid)
      await db.from('video_assets').insert({
        title_id: tid,
        storage_path: body.mainVideoAsset.storage_path,
        size_bytes: Math.max(0, Number(body.mainVideoAsset.size_bytes) || 0),
        mime: String(body.mainVideoAsset.mime || 'video/mp4').slice(0, 40),
        status: 'ready'
      })
    }

    return sendJson(res, 200, { id: tid, episodes: episodeMap })
  }

  if (action === 'toggle-publish') {
    const id = Number(body.id)
    if (!Number.isInteger(id) || id <= 0) return sendJson(res, 400, { error: 'Identifiant invalide.' })
    const next = body.status === 'published' ? 'published' : 'draft'
    const { data: row } = await db.from('titles').select('poster_url').eq('id', id).eq('creator_id', uid).maybeSingle()
    if (!row) return sendJson(res, 404, { error: 'Contenu introuvable.' })
    if (next === 'published' && (!row.poster_url || !row.poster_url.trim())) {
      return sendJson(res, 400, { error: 'Ajoutez d’abord une page de couverture (affiche 2:3) avant de publier.' })
    }
    const { error } = await db.from('titles').update({ status: next, updated_at: new Date().toISOString() }).eq('id', id).eq('creator_id', uid)
    if (error) return safeError(res, 400, 'Impossible de modifier la visibilité.', error)
    return sendJson(res, 200, { ok: true })
  }

  if (action === 'delete-title') {
    const id = Number(body.id)
    if (!Number.isInteger(id) || id <= 0) return sendJson(res, 400, { error: 'Identifiant invalide.' })
    const { error } = await db.from('titles').delete().eq('id', id).eq('creator_id', uid)
    if (error) return safeError(res, 400, 'Impossible de supprimer ce contenu.', error)
    return sendJson(res, 200, { ok: true })
  }

  return sendJson(res, 400, { error: 'Action inconnue.' })
}
