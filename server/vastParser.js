// Parseur VAST 2.0 / 3.0 / 4.x côté serveur (sans dépendance externe, protégé contre SSRF).

const PRIVATE_HOST_RE = /^(localhost|127\.|10\.|192\.168\.|169\.254\.|0\.0\.0\.0|\[::1\]|172\.(1[6-9]|2\d|3[01])\.)/i

export function isSafeExternalAdUrl(raw) {
  const s = String(raw || '').trim()
  if (!s || s.length > 2048) return false
  try {
    const u = new URL(s)
    if (u.protocol !== 'https:') return false
    if (!u.hostname || PRIVATE_HOST_RE.test(u.hostname)) return false
    if (u.hostname.endsWith('.local') || u.hostname.endsWith('.internal')) return false
    return true
  } catch {
    return false
  }
}

function decodeXmlEntities(str) {
  return String(str || '')
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim()
}

function parseDurationSec(raw) {
  const s = String(raw || '').trim()
  const m = s.match(/^(\d{1,2}):(\d{2}):(\d{2})(?:\.\d+)?$/)
  if (m) {
    const total = Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3])
    return Math.max(3, Math.min(120, Math.round(total)))
  }
  const num = Number(s)
  if (Number.isFinite(num) && num >= 3) return Math.min(120, Math.round(num))
  return 15
}

function parseSkipOffsetSec(attr, durationSec) {
  const s = String(attr || '').trim()
  if (!s) return Math.min(5, durationSec)
  if (s.endsWith('%')) {
    const pct = Number(s.slice(0, -1))
    if (Number.isFinite(pct) && pct >= 0 && pct <= 100) {
      return Math.max(0, Math.min(durationSec, Math.round((durationSec * pct) / 100)))
    }
  }
  const m = s.match(/^(\d{1,2}):(\d{2}):(\d{2})(?:\.\d+)?$/)
  if (m) return Math.max(0, Math.min(durationSec, Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3])))
  return Math.min(5, durationSec)
}

function extractAllTagContents(xml, tag) {
  const re = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`, 'gi')
  const out = []
  let m
  while ((m = re.exec(xml)) !== null) {
    const val = decodeXmlEntities(m[1])
    if (val) out.push(val)
  }
  return out
}

function extractTrackingUrls(xml, eventName) {
  const re = new RegExp(`<Tracking\\s+[^>]*event=["']${eventName}["'][^>]*>([\\s\\S]*?)<\\/Tracking>`, 'gi')
  const out = []
  let m
  while ((m = re.exec(xml)) !== null) {
    const val = decodeXmlEntities(m[1])
    if (isSafeExternalAdUrl(val)) out.push(val)
  }
  return out
}

function pickBestMediaFile(xml) {
  const re = /<MediaFile([^>]*)>([\s\S]*?)<\/MediaFile>/gi
  const candidates = []
  let m
  while ((m = re.exec(xml)) !== null) {
    const attrs = m[1] || ''
    const url = decodeXmlEntities(m[2])
    if (!isSafeExternalAdUrl(url)) continue
    const typeMatch = attrs.match(/type=["']([^"']+)["']/i)
    const widthMatch = attrs.match(/width=["'](\d+)["']/i)
    const bitrateMatch = attrs.match(/bitrate=["'](\d+)["']/i)
    const mime = (typeMatch?.[1] || '').toLowerCase()
    const isPlayable =
      mime === 'video/mp4' ||
      mime === 'video/webm' ||
      /\.mp4(\?|$)/i.test(url) ||
      /\.webm(\?|$)/i.test(url)
    if (!isPlayable) continue
    const width = Number(widthMatch?.[1] || 720)
    const bitrate = Number(bitrateMatch?.[1] || 1200)
    // Préfère MP4 720p-1080p optimisé pour la bande passante mobile/fibre
    const score =
      (mime === 'video/mp4' || /\.mp4(\?|$)/i.test(url) ? 100 : 50) +
      (width >= 640 && width <= 1280 ? 40 : width > 1280 ? 25 : 10) -
      Math.abs(bitrate - 1500) / 500
    candidates.push({ url, mime: mime || 'video/mp4', score })
  }
  candidates.sort((a, b) => b.score - a.score)
  return candidates[0] || null
}

function expandVastMacros(rawUrl) {
  const cb = String(Math.floor(Math.random() * 1e9))
  const ts = new Date().toISOString()
  return String(rawUrl || '')
    .trim()
    .replace(/\[CACHEBUSTING\]|\[RANDOM\]|\[CORRELATOR\]/gi, cb)
    .replace(/\[TIMESTAMP\]/gi, encodeURIComponent(ts))
}

export async function fetchVastAd(tagUrl, depth = 0, inheritedBeacons = { impression: [], complete: [], click: [] }) {
  if (depth > 2) return null
  const expanded = expandVastMacros(tagUrl)
  if (!isSafeExternalAdUrl(expanded)) return null

  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 3500)
  let xml = ''
  try {
    const resp = await fetch(expanded, {
      method: 'GET',
      redirect: 'follow',
      signal: ctrl.signal,
      headers: {
        Accept: 'application/xml, text/xml, */*',
        'User-Agent': 'KoraStreamingPlayer/1.0'
      }
    })
    if (!resp.ok) return null
    xml = await resp.text()
    if (!xml || xml.length > 512_000) return null
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }

  const impressions = [
    ...inheritedBeacons.impression,
    ...extractAllTagContents(xml, 'Impression').filter(isSafeExternalAdUrl)
  ].slice(0, 6)
  const completes = [
    ...inheritedBeacons.complete,
    ...extractTrackingUrls(xml, 'complete')
  ].slice(0, 6)
  const clicks = [
    ...inheritedBeacons.click,
    ...extractAllTagContents(xml, 'ClickTracking').filter(isSafeExternalAdUrl)
  ].slice(0, 6)

  // Support VAST Wrapper (redirection vers un autre tag VAST)
  const wrapperUri = extractAllTagContents(xml, 'VASTAdTagURI')[0]
  if (wrapperUri && isSafeExternalAdUrl(wrapperUri)) {
    return fetchVastAd(wrapperUri, depth + 1, {
      impression: impressions,
      complete: completes,
      click: clicks
    })
  }

  const media = pickBestMediaFile(xml)
  if (!media) return null

  const adTitle = extractAllTagContents(xml, 'AdTitle')[0] || 'Publicité'
  const advertiser = extractAllTagContents(xml, 'Advertiser')[0] || extractAllTagContents(xml, 'AdSystem')[0] || 'Partenaire'
  const durRaw = extractAllTagContents(xml, 'Duration')[0]
  const durationSec = parseDurationSec(durRaw)
  const linearTagMatch = xml.match(/<Linear([^>]*)>/i)
  const skipAttr = linearTagMatch?.[1]?.match(/skipoffset=["']([^"']+)["']/i)?.[1]
  const skipAfterSec = parseSkipOffsetSec(skipAttr, durationSec)
  const clickRaw = extractAllTagContents(xml, 'ClickThrough')[0] || ''
  const clickUrl = isSafeExternalAdUrl(clickRaw) ? clickRaw : ''

  return {
    mode: 'vast',
    name: adTitle.slice(0, 120),
    advertiser: advertiser.slice(0, 80),
    mediaType: 'video',
    mediaUrl: media.url,
    clickUrl,
    ctaLabel: 'En savoir plus',
    durationSec,
    skipAfterSec,
    beacons: {
      impression: impressions,
      complete: completes,
      click: clicks
    }
  }
}

export async function fireTrackingBeacons(urls) {
  if (!Array.isArray(urls) || !urls.length) return
  const safe = [...new Set(urls.filter(isSafeExternalAdUrl))].slice(0, 5)
  await Promise.allSettled(
    safe.map(async u => {
      const ctrl = new AbortController()
      const t = setTimeout(() => ctrl.abort(), 2500)
      try {
        await fetch(u, { method: 'GET', signal: ctrl.signal, redirect: 'follow' })
      } catch {
        // Ignoré silencieusement pour ne jamais ralentir la lecture
      } finally {
        clearTimeout(t)
      }
    })
  )
}
