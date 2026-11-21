import crypto from 'node:crypto'

// Intégration native Cloudflare R2 (S3-compatible AWS Signature V4 sans dépendance lourde).
// Compte Cloudflare détecté : 13542688dd607875e5a443ef3b10643e · Bucket par défaut : kora-videos

const DEFAULT_ACCOUNT_ID = '13542688dd607875e5a443ef3b10643e'
const DEFAULT_BUCKET = 'kora-videos'

export function getR2Config() {
  const accountId = (process.env.R2_ACCOUNT_ID || DEFAULT_ACCOUNT_ID).trim()
  const accessKeyId = (process.env.R2_ACCESS_KEY_ID || '').trim()
  const secretAccessKey = (process.env.R2_SECRET_ACCESS_KEY || '').trim()
  const bucket = (process.env.R2_BUCKET_NAME || DEFAULT_BUCKET).trim()
  const publicBaseUrl = (process.env.R2_PUBLIC_BASE_URL || '').trim().replace(/\/$/, '')
  return {
    accountId,
    accessKeyId,
    secretAccessKey,
    bucket,
    publicBaseUrl,
    configured: Boolean(accountId && accessKeyId && secretAccessKey && bucket)
  }
}

export function isR2Configured() {
  return getR2Config().configured
}

function hmac(key, data) {
  return crypto.createHmac('sha256', key).update(data, 'utf8').digest()
}

function sha256Hex(data) {
  return crypto.createHash('sha256').update(data, 'utf8').digest('hex')
}

function encodeRfc3986(str) {
  return encodeURIComponent(str).replace(/[!'()*]/g, c => `%${c.charCodeAt(0).toString(16).toUpperCase()}`)
}

function encodeS3Path(pathStr) {
  return String(pathStr).split('/').map(encodeRfc3986).join('/')
}

export function createR2PresignedUrl({ method = 'GET', objectKey, expiresInSec = 3600 }) {
  const cfg = getR2Config()
  if (!cfg.configured) return null

  const cleanKey = String(objectKey || '').replace(/^r2:/, '').replace(/^\/+/, '')
  const host = `${cfg.accountId}.r2.cloudflarestorage.com`
  const region = 'auto'
  const service = 's3'

  const now = new Date()
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '')
  const dateStamp = amzDate.slice(0, 8)
  const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`
  const canonicalUri = `/${encodeRfc3986(cfg.bucket)}/${encodeS3Path(cleanKey)}`

  const queryParams = [
    ['X-Amz-Algorithm', 'AWS4-HMAC-SHA256'],
    ['X-Amz-Credential', `${cfg.accessKeyId}/${credentialScope}`],
    ['X-Amz-Date', amzDate],
    ['X-Amz-Expires', String(Math.min(86400, Math.max(60, expiresInSec)))],
    ['X-Amz-SignedHeaders', 'host']
  ]
  const canonicalQuery = queryParams
    .map(([k, v]) => `${encodeRfc3986(k)}=${encodeRfc3986(v)}`)
    .sort()
    .join('&')

  const canonicalHeaders = `host:${host}\n`
  const signedHeaders = 'host'
  const payloadHash = 'UNSIGNED-PAYLOAD'

  const canonicalRequest = [
    method.toUpperCase(),
    canonicalUri,
    canonicalQuery,
    canonicalHeaders,
    signedHeaders,
    payloadHash
  ].join('\n')

  const stringToSign = [
    'AWS4-HMAC-SHA256',
    amzDate,
    credentialScope,
    sha256Hex(canonicalRequest)
  ].join('\n')

  const kDate = hmac(`AWS4${cfg.secretAccessKey}`, dateStamp)
  const kRegion = hmac(kDate, region)
  const kService = hmac(kRegion, service)
  const kSigning = hmac(kService, 'aws4_request')
  const signature = crypto.createHmac('sha256', kSigning).update(stringToSign, 'utf8').digest('hex')

  return `https://${host}${canonicalUri}?${canonicalQuery}&X-Amz-Signature=${signature}`
}

export function createR2UploadUrl(objectKey, expiresInSec = 7200) {
  const cleanKey = String(objectKey || '').replace(/^r2:/, '').replace(/^\/+/, '')
  const signedUrl = createR2PresignedUrl({ method: 'PUT', objectKey: cleanKey, expiresInSec })
  if (!signedUrl) return null
  return {
    signedUrl,
    storagePath: `r2:${cleanKey}`,
    provider: 'r2'
  }
}

export function createR2PlaybackUrl(storagePath, expiresInSec = 7200) {
  const cfg = getR2Config()
  const cleanKey = String(storagePath || '').replace(/^r2:/, '').replace(/^\/+/, '')
  if (!cleanKey) return null
  if (cfg.publicBaseUrl && /^https:\/\//i.test(cfg.publicBaseUrl)) {
    return `${cfg.publicBaseUrl}/${encodeS3Path(cleanKey)}`
  }
  return createR2PresignedUrl({ method: 'GET', objectKey: cleanKey, expiresInSec })
}
