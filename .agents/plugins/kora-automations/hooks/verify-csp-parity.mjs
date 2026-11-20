import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

function readStdin() {
  try {
    return readFileSync(0, 'utf8')
  } catch {
    return ''
  }
}

const raw = readStdin()
let payload = {}
try {
  payload = raw.trim() ? JSON.parse(raw) : {}
} catch {
  payload = {}
}

const targetPath = payload?.toolCall?.args?.Path || ''
const base = path.basename(targetPath).toLowerCase()
if (payload?.error || (base !== 'server.js' && base !== 'vercel.json')) {
  process.stdout.write('{}')
  process.exit(0)
}

const pluginDir = path.dirname(fileURLToPath(import.meta.url))
const projectRoot = payload?.cwd || path.resolve(pluginDir, '../../../..')

try {
  const serverTxt = readFileSync(path.join(projectRoot, 'server.js'), 'utf8')
  const vercelJson = JSON.parse(readFileSync(path.join(projectRoot, 'vercel.json'), 'utf8'))

  const vercelHeaders = vercelJson?.headers?.find(h => h.source === '/(.*)')?.headers || []
  const vercelCsp = (vercelHeaders.find(h => h.key.toLowerCase() === 'content-security-policy')?.value || '').trim()

  // Extract CSP directives from server.js (array join or literal string)
  const arrMatch = serverTxt.match(/const\s+CSP\s*=\s*\[([\s\S]*?)\]\.join\(['"];\s*['"]\)/)
  let serverCsp = ''
  if (arrMatch) {
    const parts = [...arrMatch[1].matchAll(/"([^"]+)"|'([^']+)'/g)].map(m => m[1] || m[2])
    serverCsp = parts.join('; ').trim()
  } else {
    const strMatch = serverTxt.match(/'Content-Security-Policy'\s*:\s*"([^"]+)"/)
    serverCsp = (strMatch?.[1] || '').trim()
  }

  process.stdout.write('{}')
  if (serverCsp && vercelCsp && serverCsp !== vercelCsp) {
    process.stderr.write(
      `CSP parity check failed between server.js and vercel.json!\n` +
      `  server.js  : ${serverCsp}\n` +
      `  vercel.json: ${vercelCsp}\n` +
      `Run the csp-sync skill to keep both files identical.\n`
    )
    process.exit(1)
  }
} catch (err) {
  process.stdout.write('{}')
  process.stderr.write(`CSP parity hook warning: ${err.message}\n`)
  process.exit(1)
}
