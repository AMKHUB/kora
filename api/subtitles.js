import { getQuery, getSessionContext, getSupabaseConfig, readJsonBody, sendJson } from '../server/supabaseServer.js'

const LANG_LABELS = {
  fr: 'Français',
  en: 'English',
  bm: 'Bambara',
  wo: 'Wolof',
  ff: 'Peul',
  ar: 'Arabe',
  ja: 'Japonais'
}

/**
 * Convertit un fichier SRT ou WebVTT brut en WebVTT propre et normalisé.
 */
function normalizeToWebVtt(raw) {
  let txt = String(raw || '').replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n').trim()
  // Retirer d'éventuelles balises markdown ```vtt ... ``` renvoyées par un modèle IA
  txt = txt.replace(/^```(?:vtt|webvtt|srt)?\s*\n/i, '').replace(/\n```\s*$/i, '').trim()

  // Convertir les virgules SRT (00:01:02,340 --> 00:01:05,120) en points WebVTT
  txt = txt.replace(
    /(\d{1,2}:\d{2}(?::\d{2})?),(\d{3})\s*-->\s*(\d{1,2}:\d{2}(?::\d{2})?),(\d{3})/g,
    '$1.$2 --> $3.$4'
  )

  if (!/^WEBVTT\b/i.test(txt)) {
    txt = `WEBVTT\n\n${txt}`
  }
  return txt
}

function countCues(vtt) {
  const matches = vtt.match(/\d{1,2}:\d{2}(?::\d{2})?\.\d{3}\s*-->\s*\d{1,2}:\d{2}(?::\d{2})?\.\d{3}/g)
  return matches ? matches.length : 0
}

async function generateWithGemini(videoBuf, mime, targetLabel) {
  const key = process.env.GEMINI_API_KEY
  if (!key) return null

  const base64 = Buffer.from(videoBuf).toString('base64')
  const prompt = [
    `Listen carefully to all spoken dialogue and voice timing in this video/audio.`,
    `Generate a frame-accurate WebVTT (.vtt) subtitle file synchronized precisely to the speaker's voice.`,
    `Language of output subtitles: ${targetLabel}.`,
    `Rules:`,
    `1. Start with exactly: WEBVTT`,
    `2. Use standard timestamps: HH:MM:SS.mmm --> HH:MM:SS.mmm aligned tightly to when each phrase starts and ends in the audio.`,
    `3. Keep each cue concise (1-2 lines, max 42 chars per line) for easy reading.`,
    `4. Include brief sound cues in brackets only when narratively meaningful (e.g. [Musique], [Rires]).`,
    `5. If there is no speech in a segment, do not invent dialogue.`,
    `6. Output ONLY raw valid WebVTT text, no explanation or markdown fences.`
  ].join('\n')

  const resp = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${encodeURIComponent(key)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{
        parts: [
          { inline_data: { mime_type: mime || 'video/mp4', data: base64 } },
          { text: prompt }
        ]
      }],
      generationConfig: { temperature: 0.1 }
    })
  })
  const data = await resp.json().catch(() => ({}))
  if (!resp.ok) {
    throw new Error(data?.error?.message || `Erreur Gemini (${resp.status})`)
  }
  const text = (data?.candidates?.[0]?.content?.parts || []).map(p => p.text || '').join('\n').trim()
  return { vtt: normalizeToWebVtt(text), source: 'ai_gemini' }
}

async function generateWithWhisper(videoBuf, mime, langCode) {
  const groqKey = process.env.GROQ_API_KEY
  const openaiKey = process.env.OPENAI_API_KEY
  if (!groqKey && !openaiKey) return null

  const endpoint = groqKey
    ? 'https://api.groq.com/openai/v1/audio/transcriptions'
    : 'https://api.openai.com/v1/audio/transcriptions'
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
  if (!resp.ok) {
    throw new Error(`Erreur Whisper (${resp.status}) : ${text.slice(0, 180)}`)
  }
  return { vtt: normalizeToWebVtt(text), source: 'ai_whisper' }
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
    if (!titleId && !episodeId) return sendJson(res, 400, { error: 'titleId ou episodeId requis.' })
    const query = db.from('subtitles').select('id,title_id,episode_id,language_code,language_label,vtt_content,offset_ms,source,updated_at').order('id')
    const { data, error } = await (episodeId ? query.eq('episode_id', episodeId) : query.eq('title_id', titleId).is('episode_id', null))
    if (error) return sendJson(res, 400, { error: error.message })
    return sendJson(res, 200, { tracks: data || [] })
  }

  if (req.method !== 'POST') return sendJson(res, 405, { error: 'Méthode non autorisée.' })
  const body = await readJsonBody(req)

  if (action === 'save') {
    const titleId = body.titleId ? Number(body.titleId) : null
    const episodeId = body.episodeId ? Number(body.episodeId) : null
    const languageCode = String(body.languageCode || 'fr').trim().toLowerCase()
    const languageLabel = String(body.languageLabel || LANG_LABELS[languageCode] || languageCode.toUpperCase()).trim()
    const offsetMs = Math.max(-10000, Math.min(10000, Math.round(Number(body.offsetMs) || 0)))
    const vtt = normalizeToWebVtt(body.content || '')

    if (!titleId && !episodeId) return sendJson(res, 400, { error: 'Contenu cible manquant.' })
    if (countCues(vtt) === 0) {
      return sendJson(res, 400, { error: 'Format invalide : aucun horodatage WebVTT ou SRT détecté (ex. 00:00:01.000 --> 00:00:04.000).' })
    }

    // Remplace la piste existante de la même langue si elle existe déjà
    const delQ = db.from('subtitles').delete().eq('language_code', languageCode)
    await (episodeId ? delQ.eq('episode_id', episodeId) : delQ.eq('title_id', titleId).is('episode_id', null))

    const { data, error } = await db.from('subtitles').insert({
      title_id: titleId,
      episode_id: episodeId,
      language_code: languageCode,
      language_label: languageLabel,
      vtt_content: vtt,
      offset_ms: offsetMs,
      source: body.source || 'upload',
      updated_at: new Date().toISOString()
    }).select('id,language_code,language_label,offset_ms,source').single()

    if (error) return sendJson(res, 400, { error: error.message })
    return sendJson(res, 200, { track: data, cues: countCues(vtt) })
  }

  if (action === 'offset') {
    const id = Number(body.id)
    const offsetMs = Math.max(-10000, Math.min(10000, Math.round(Number(body.offsetMs) || 0)))
    if (!id) return sendJson(res, 400, { error: 'Piste invalide.' })
    const { error } = await db.from('subtitles').update({ offset_ms: offsetMs, updated_at: new Date().toISOString() }).eq('id', id)
    if (error) return sendJson(res, 400, { error: error.message })
    return sendJson(res, 200, { ok: true, offset_ms: offsetMs })
  }

  if (action === 'delete') {
    const id = Number(body.id)
    if (!id) return sendJson(res, 400, { error: 'Piste invalide.' })
    const { error } = await db.from('subtitles').delete().eq('id', id)
    if (error) return sendJson(res, 400, { error: error.message })
    return sendJson(res, 200, { ok: true })
  }

  if (action === 'generate') {
    const titleId = Number(body.titleId)
    const episodeId = body.episodeId ? Number(body.episodeId) : null
    const languageCode = String(body.languageCode || 'fr').trim().toLowerCase()
    const languageLabel = String(body.languageLabel || LANG_LABELS[languageCode] || 'Français').trim()

    if (!titleId) return sendJson(res, 400, { error: 'titleId requis.' })
    if (!process.env.GEMINI_API_KEY && !process.env.GROQ_API_KEY && !process.env.OPENAI_API_KEY) {
      return sendJson(res, 501, {
        error: 'Clé IA serveur non configurée. Ajoutez GEMINI_API_KEY (gratuit sur Google AI Studio) ou GROQ_API_KEY dans les variables d’environnement Vercel pour activer la synchronisation vocale automatique, ou importez un fichier .vtt / .srt.'
      })
    }

    // Récupère l'URL signée via la fonction serveur play
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

    const mediaResp = await fetch(playData.url)
    if (!mediaResp.ok) return sendJson(res, 502, { error: 'Impossible de lire le fichier vidéo pour la transcription.' })
    const buf = await mediaResp.arrayBuffer()
    if (buf.byteLength > 20 * 1024 * 1024) {
      return sendJson(res, 413, { error: 'Vidéo > 20 Mo : pour les longs films, importez un fichier .vtt/.srt ou utilisez le script FFmpeg + Whisper du skill subtitle-audio-sync.' })
    }

    try {
      const mime = playData.mime || mediaResp.headers.get('content-type') || 'video/mp4'
      const result = process.env.GEMINI_API_KEY
        ? await generateWithGemini(buf, mime, languageLabel)
        : await generateWithWhisper(buf, mime, languageCode)

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

      if (error) return sendJson(res, 400, { error: error.message })
      return sendJson(res, 200, { track: data, cues: countCues(result.vtt) })
    } catch (err) {
      return sendJson(res, 502, { error: err?.message || 'Erreur lors de la synchronisation audio IA.' })
    }
  }

  return sendJson(res, 400, { error: 'Action inconnue.' })
}
