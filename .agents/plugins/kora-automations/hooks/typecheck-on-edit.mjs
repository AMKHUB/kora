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

const targetPath = payload?.toolCall?.args?.Path || ''
if (payload?.error || !/\.(ts|tsx)$/i.test(targetPath)) {
  process.stdout.write('{}')
  process.exit(0)
}

const pluginDir = path.dirname(fileURLToPath(import.meta.url))
const projectRoot = payload?.cwd || path.resolve(pluginDir, '../../../..')
const tscBin = path.join(projectRoot, 'node_modules', 'typescript', 'bin', 'tsc')

if (!existsSync(tscBin)) {
  process.stdout.write('{}')
  process.exit(0)
}

const res = spawnSync(process.execPath, [tscBin, '--noEmit'], {
  cwd: projectRoot,
  encoding: 'utf8',
  timeout: 25000
})

process.stdout.write('{}')
if (res.status !== 0) {
  const details = [res.stdout, res.stderr].filter(Boolean).join('\n').trim()
  if (details) process.stderr.write(`TypeScript check failed after editing ${path.basename(targetPath)}:\n${details}\n`)
  process.exit(res.status || 1)
}
