import {
  assertCsrf,
  enforceRateLimit,
  getQuery,
  getSessionContext,
  getSupabaseConfig,
  readJsonBody,
  safeError,
  sendJson
} from '../server/supabaseServer.js'

const LANG_LABELS = {
  fr: 'Français',
  en: 'English',
  bm: 'Bambara',
  wo: 'Wolof',
  ff: 'Peul',
  ar: 'Arabe',
  ja: 'Japonais'
}

const MAX_AI_VIDEO_BYTES = 20 * 1024 * 1024

function normalizeToWebVtt(raw) {
  let txt = String(raw || '').replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n').trim()
  txt = txt.replace(/^```(?:vtt|webvtt|srt)?\s*\n/i, '').replace(/\n```\s*$/i, '').trim()
  txt = txt.replace(
    /(\d{1,2}:\d{2}(?::\d{2})?),(\d{3})\s*-->\s*(\d{1,2}:\d{2}(?::\d{2})?),(\d{3})/g,
    '$1.$2 --> $3.$4'
  )
  if (!/^WEBVTT\b/i.test(txt)) txt = `WEBVTT\n\n${txt}`
  return txt
}

function countCues(vtt) {
  const matches = vtt.match(/\d{1,2}:\d{2}(?::\d{2})?\.\d{3}\s*-->\s*\d{1,2}:\d{2}(?::\d{2})?\.\d{3}/g)
  return matches ? matches.length : 0
}

async function readStreamWithLimit(response, maxBytes) {
  const cl = Number(response.headers.get('content-length') || 0)
  if (cl > maxBytes) throw Object.assign(new Error('too_large'), { code: 'TOO_LARGE' })
  if (!response.body) {
    const ab = await response.arrayBuffer()
    if (ab.byteLength > maxBytes) throw Object.assign(new Error('too_large'), { code: 'TOO_LARGE' })
    return Buffer.from(ab)
  }
  const reader = response.body.getReader()
  const chunks = []
  let total = 0
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    total += value.byteLength
    if (total > maxBytes) {
      await reader.cancel().catch(() => {})
      throw Object.assign(new Error('too_large'), { code: 'TOO_LARGE' })
    }
    chunks.push(Buffer.from(value))
  }
  return Buffer.concat(chunks)
}

async function generateWithGemini(videoBuf, mime, targetLabel) {
  const key = process.env.GEMINI_API_KEY
  if (!key) return null

  const prompt = [
    'Listen carefully to all spoken dialogue and voice timing in this video/audio.',
    'Generate a frame-accurate WebVTT (.vtt) subtitle file synchronized precisely to the speaker voice.',
    `Language of output subtitles: ${targetLabel}.`,
    'Rules:',
    '1. Start with exactly: WEBVTT',
    '2. Use standard timestamps: HH:MM:SS.mmm --> HH:MM:SS.mmm aligned tightly to when each phrase starts and ends in the audio.',
    '3. Keep each cue concise (1-2 lines, max 42 chars per line).',
    '4. Output ONLY raw valid WebVTT text, no explanation or markdown fences.'
  ].join('\n')

  const resp = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${encodeURIComponent(key)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{
        parts: [
          { inline_data: { mime_type: mime || 'video/mp4', data: videoBuf.toString('base64') } },
          { text: prompt }
        ]
      }],
      generationConfig: { temperature: 0.1 }
    })
  })
  const data = await resp.json().catch(() => ({}))
  if (!resp.ok) throw new Error('upstream_ai_error')
  const text = (data?.candidates?.[0]?.content?.parts || []).map(p => p.text || '').join('\n').trim()
  return { vtt: normalizeToWebVtt(text), source: 'ai_gemini' }
}

async function generateWithWhisper(videoBuf, mime, langCode) {
  const groqKey = process.env.GROQ_API_KEY
  const openaiKey = process.env.OPENAI_API_KEY
  if (!groqKey && !openaiKey) return null

  const endpoint = groqKey
    ? 'https://api.groq.com/openai/v1/audio/transcriptions'
    : 'https://api.openai.com/openai/v1/audio/transcriptions'
  const apiKey = groqKey || openaiKey
  const model = groqKey ? 'whisper-large-v3-turbo' : 'whisper-1'

  const fd = new FormData()
  fd.append('file', new Blob([videoBuf], { type: mime || 'video/mp4' }), 'video.mp4')
  fd.append('model', model)
  fd.append('response_format', 'vtt')
  if (langCode && langCode !== 'auto') fd.append('language', langCode)

  const resp = await fetch(endpoint, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}` },
    body: fd
  })
  const text = await resp.text()
  if (!resp.ok) throw new Error('upstream_ai_error')
  return { vtt: normalizeToWebVtt(text), source: 'ai_whisper' }
}

async function assertCanManageTitle(db, userId, role, titleId, episodeId) {
  if (role === 'admin') {
    if (episodeId) {
      const { data } = await db.from('episodes').select('id, seasons!inner(title_id)').eq('id', episodeId).eq('seasons.title_id', titleId).maybeSingle()
      return Boolean(data)
    }
    return true
  }
  const { data: t } = await db.from('titles').select('creator_id').eq('id', titleId).maybeSingle()
  if (!t || t.creator_id !== userId) return false
  if (episodeId) {
    const { data: ep } = await db.from('episodes').select('id, seasons!inner(title_id)').eq('id', episodeId).eq('seasons.title_id', titleId).maybeSingle()
    return Boolean(ep)
  }
  return true
}

export default async function handler(req, res) {
  const ctx = await getSessionContext(req, res)
  if (!ctx.configured) return sendJson(res, 503, { error: 'Base de données non configurée.' })
  if (!ctx.user || !ctx.sb) return sendJson(res, 401, { error: 'Connexion requise.' })

  const db = ctx.sb
  const q = getQuery(req)
  const action = q.get('action') || ''

  if (req.method === 'GET') {
    const titleId = q.get('titleId') ? Number(q.get('titleId')) : null
    const episodeId = q.get('episodeId') ? Number(q.get('episodeId')) : null
    if ((!titleId || !Number.isInteger(titleId)) && (!episodeId || !Number.isInteger(episodeId))) {
      return sendJson(res, 400, { error: 'Identifiant cible requis.' })
    }
    const query = db.from('subtitles').select('id,title_id,episode_id,language_code,language_label,vtt_content,offset_ms,source,updated_at').order('id')
    const { data, error } = await (episodeId ? query.eq('episode_id', episodeId) : query.eq('title_id', titleId).is('episode_id', null))
    if (error) return safeError(res, 400, 'Impossible de charger les sous-titres.', error)
    return sendJson(res, 200, { tracks: data || [] })
  }

  if (req.method !== 'POST') return sendJson(res, 405, { error: 'Méthode non autorisée.' })
  if (!assertCsrf(req, res)) return

  let body
  try { body = await readJsonBody(req) } catch (e) { return safeError(res, e.status || 400, 'Requête invalide.', e) }

  if (action === 'save') {
    if (!enforceRateLimit(req, res, 'sub_save', 30, 15 * 60_000, ctx.user.id)) return
    const titleId = body.titleId ? Number(body.titleId) : null
    const episodeId = body.episodeId ? Number(body.episodeId) : null
    const languageCode = String(body.languageCode || 'fr').trim().toLowerCase().slice(0, 8)
    const languageLabel = String(body.languageLabel || LANG_LABELS[languageCode] || languageCode.toUpperCase()).trim().slice(0, 32)
    const offsetMs = Math.max(-10000, Math.min(10000, Math.round(Number(body.offsetMs) || 0)))
    const vtt = normalizeToWebVtt(body.content || '')

    if (!titleId || !Number.isInteger(titleId) || titleId <= 0) return sendJson(res, 400, { error: 'Contenu cible manquant.' })
    if (!(await assertCanManageTitle(db, ctx.user.id, ctx.role, titleId, episodeId))) {
      return sendJson(res, 403, { error: 'Vous n’êtes pas autorisé à modifier les sous-titres de ce contenu.' })
    }
    if (countCues(vtt) === 0) {
      return sendJson(res, 400, { error: 'Format invalide : aucun horodatage WebVTT ou SRT détecté (ex. 00:00:01.000 --> 00:00:04.000).' })
    }

    const delQ = db.from('subtitles').delete().eq('language_code', languageCode)
    await (episodeId ? delQ.eq('episode_id', episodeId) : delQ.eq('title_id', titleId).is('episode_id', null))

    const { data, error } = await db.from('subtitles').insert({
      title_id: titleId,
      episode_id: episodeId,
      language_code: languageCode,
      language_label: languageLabel,
      vtt_content: vtt,
      offset_ms: offsetMs,
      source: 'upload',
      updated_at: new Date().toISOString()
    }).select('id,language_code,language_label,offset_ms,source').single()

    if (error) return safeError(res, 400, 'Impossible d’enregistrer les sous-titres.', error)
    return sendJson(res, 200, { track: data, cues: countCues(vtt) })
  }

  if (action === 'offset') {
    const id = Number(body.id)
    const offsetMs = Math.max(-10000, Math.min(10000, Math.round(Number(body.offsetMs) || 0)))
    if (!Number.isInteger(id) || id <= 0) return sendJson(res, 400, { error: 'Piste invalide.' })
    const { error } = await db.from('subtitles').update({ offset_ms: offsetMs, updated_at: new Date().toISOString() }).eq('id', id)
    if (error) return safeError(res, 400, 'Impossible de modifier le calage.', error)
    return sendJson(res, 200, { ok: true, offset_ms: offsetMs })
  }

  if (action === 'delete') {
    const id = Number(body.id)
    if (!Number.isInteger(id) || id <= 0) return sendJson(res, 400, { error: 'Piste invalide.' })
    const { error } = await db.from('subtitles').delete().eq('id', id)
    if (error) return safeError(res, 400, 'Impossible de supprimer cette piste.', error)
    return sendJson(res, 200, { ok: true })
  }

  if (action === 'generate') {
    if (!enforceRateLimit(req, res, 'sub_ai_generate', 5, 60 * 60_000, ctx.user.id)) return
    const titleId = Number(body.titleId)
    const episodeId = body.episodeId ? Number(body.episodeId) : null
    const languageCode = String(body.languageCode || 'fr').trim().toLowerCase().slice(0, 8)
    const languageLabel = String(body.languageLabel || LANG_LABELS[languageCode] || 'Français').trim().slice(0, 32)

    if (!Number.isInteger(titleId) || titleId <= 0) return sendJson(res, 400, { error: 'Contenu invalide.' })

    // Vérification propriétaire / admin AVANT tout appel IA ou téléchargement (Finding #4)
    if (!(await assertCanManageTitle(db, ctx.user.id, ctx.role, titleId, episodeId))) {
      return sendJson(res, 403, { error: 'Action réservée au créateur du titre ou à un administrateur.' })
    }

    if (!process.env.GEMINI_API_KEY && !process.env.GROQ_API_KEY && !process.env.OPENAI_API_KEY) {
      return sendJson(res, 501, {
        error: 'La transcription vocale IA automatique n’est pas encore activée sur ce serveur. Importez un fichier .vtt ou .srt en attendant.'
      })
    }

    const cfg = getSupabaseConfig()
    const playResp = await fetch(`${cfg.url}/functions/v1/play`, {
      method: 'POST',
      headers: {
        apikey: cfg.key,
        Authorization: `Bearer ${ctx.accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ titleId, episodeId })
    })
    const playData = await playResp.json().catch(() => ({}))
    if (!playResp.ok || !playData?.url) {
      return sendJson(res, 404, { error: 'Aucune vidéo prête trouvée pour ce contenu. Téléversez d’abord la vidéo.' })
    }

    // Protection SSRF : l'URL téléchargée doit impérativement pointer vers notre stockage vidéo Supabase ou Cloudflare R2
    try {
      const targetUrl = new URL(playData.url)
      const sbOrigin = new URL(cfg.url).origin
      const isSbVideo = targetUrl.origin === sbOrigin && targetUrl.pathname.startsWith('/storage/v1/object/sign/videos/')
      const isR2Video = targetUrl.protocol === 'https:' && targetUrl.hostname.endsWith('.r2.cloudflarestorage.com') && targetUrl.pathname.startsWith('/kora-videos/')
      if (!isSbVideo && !isR2Video) {
        return sendJson(res, 400, { error: 'Source vidéo non prise en charge pour la transcription directe.' })
      }
    } catch {
      return sendJson(res, 400, { error: 'URL vidéo invalide.' })
    }

    let videoBuf
    try {
      const mediaResp = await fetch(playData.url)
      if (!mediaResp.ok) return sendJson(res, 502, { error: 'Impossible de lire le fichier vidéo.' })
      videoBuf = await readStreamWithLimit(mediaResp, MAX_AI_VIDEO_BYTES)
    } catch (e) {
      if (e?.code === 'TOO_LARGE') {
        return sendJson(res, 413, { error: 'Vidéo supérieure à 20 Mo : importez un fichier .vtt / .srt pour les longs métrages.' })
      }
      return safeError(res, 502, 'Impossible de lire le fichier vidéo.', e)
    }

    try {
      const mime = playData.mime || 'video/mp4'
      const result = process.env.GEMINI_API_KEY
        ? await generateWithGemini(videoBuf, mime, languageLabel)
        : await generateWithWhisper(videoBuf, mime, languageCode)

      if (!result || countCues(result.vtt) === 0) {
        return sendJson(res, 422, { error: 'Aucune parole exploitable détectée dans la piste audio de cette vidéo.' })
      }

      const delQ = db.from('subtitles').delete().eq('language_code', languageCode)
      await (episodeId ? delQ.eq('episode_id', episodeId) : delQ.eq('title_id', titleId).is('episode_id', null))

      const { data, error } = await db.from('subtitles').insert({
        title_id: titleId,
        episode_id: episodeId,
        language_code: languageCode,
        language_label: languageLabel,
        vtt_content: result.vtt,
        offset_ms: 0,
        source: result.source,
        updated_at: new Date().toISOString()
      }).select('id,language_code,language_label,offset_ms,source').single()

      if (error) return safeError(res, 400, 'Impossible d’enregistrer les sous-titres générés.', error)
      return sendJson(res, 200, { track: data, cues: countCues(result.vtt) })
    } catch (err) {
      return safeError(res, 502, 'Erreur lors de la synchronisation audio IA. Réessayez plus tard.', err)
    }
  }

  return sendJson(res, 400, { error: 'Action inconnue.' })
}
