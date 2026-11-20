import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
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

const targetPath = (payload?.toolCall?.args?.Path || '').replace(/\\/g, '/')
if (payload?.error || (!targetPath.includes('/brand/') && !targetPath.endsWith('scripts/make-icons.mjs'))) {
  process.stdout.write('{}')
  process.exit(0)
}

const pluginDir = path.dirname(fileURLToPath(import.meta.url))
const projectRoot = payload?.cwd || path.resolve(pluginDir, '../../../..')
const scriptPath = path.join(projectRoot, 'scripts', 'make-icons.mjs')

if (!existsSync(scriptPath)) {
  process.stdout.write('{}')
  process.exit(0)
}

const res = spawnSync(process.execPath, [scriptPath], {
  cwd: projectRoot,
  encoding: 'utf8',
  timeout: 15000
})

process.stdout.write('{}')
if (res.status !== 0) {
  process.stderr.write(`Brand assets sync failed:\n${res.stderr || res.stdout}\n`)
  process.exit(res.status || 1)
}
