import { readFileSync } from 'node:fs'
import path from 'node:path'

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
const base = path.basename(targetPath)

const isProtectedEnv = /^\.env(\..+)?$/i.test(base) && base.toLowerCase() !== '.env.example'
const isLockFile = base.toLowerCase() === 'package-lock.json'

if (isProtectedEnv) {
  process.stdout.write(JSON.stringify({
    decision: 'deny',
    reason: `Direct edits to ${base} are blocked by Kora's protect-sensitive-files hook. Update .env.example or ask the user to edit secrets manually.`
  }))
} else if (isLockFile) {
  process.stdout.write(JSON.stringify({
    decision: 'deny',
    reason: 'Direct edits to package-lock.json are blocked. Use npm install / npm uninstall instead.'
  }))
} else {
  process.stdout.write(JSON.stringify({ decision: 'allow' }))
}
