import { readFileSync } from 'node:fs'

// Hook PostToolUse : valide les fichiers de sous-titres .vtt modifiés ou créés
let raw = ''
process.stdin.setEncoding('utf8')
process.stdin.on('data', chunk => { raw += chunk })
process.stdin.on('end', () => {
  try {
    const ev = JSON.parse(raw || '{}')
    const filePath = ev?.tool_input?.Path || ev?.tool_input?.path || ev?.tool_input?.file_path || ''
    if (!/\.vtt$/i.test(filePath)) process.exit(0)

    const content = readFileSync(filePath, 'utf8').replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n')
    const errors = []
    if (!/^WEBVTT\b/.test(content.trim())) {
      errors.push('En-tête WEBVTT manquant en ligne 1.')
    }
    const cueRe = /(\d{1,2}:\d{2}(?::\d{2})?\.\d{3})\s*-->\s*(\d{1,2}:\d{2}(?::\d{2})?\.\d{3})/g
    const toSec = (t) => {
      const p = t.split(':').map(Number)
      return p.length === 3 ? p[0] * 3600 + p[1] * 60 + p[2] : p[0] * 60 + p[1]
    }
    let count = 0
    for (const m of content.matchAll(cueRe)) {
      count++
      const s = toSec(m[1])
      const e = toSec(m[2])
      if (e <= s) errors.push(`Horodatage invalide (${m[1]} --> ${m[2]}) : la fin doit être supérieure au début.`)
    }
    if (count === 0) errors.push('Aucun horodatage WebVTT valide détecté.')

    if (errors.length) {
      console.error(`[validate-vtt] Erreurs dans ${filePath}:\n- ${errors.join('\n- ')}`)
      process.exit(2)
    }
  } catch { /* ignore hook parse errors */ }
  process.exit(0)
})
