import express from 'express'
import compression from 'compression'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import catalogHandler from './api/catalog.js'
import checkoutHandler from './api/checkout.js'
import authHandler from './api/auth.js'
import meHandler from './api/me.js'
import playHandler from './api/play.js'
import studioHandler from './api/studio.js'
import adminHandler from './api/admin.js'

const dist = path.join(path.dirname(fileURLToPath(import.meta.url)), 'dist')
const PORT = process.env.PORT || 3000
const prod = process.env.NODE_ENV === 'production'
const site = (process.env.SITE_URL || '').replace(/\/$/, '')
const plausible = process.env.PLAUSIBLE_DOMAIN
const app = express()
app.disable('x-powered-by')
app.set('trust proxy', 1)

const CSP = [
  "default-src 'self'",
  "script-src 'self' https://plausible.io",
  "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://plausible.io",
  "img-src 'self' data: blob: https://*.supabase.co",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com data:",
  "media-src 'self' blob: https://*.supabase.co",
  "frame-ancestors 'none'",
  "base-uri 'self'"
].join('; ')

// HTTPS forcé en production (derrière un proxy/CDN qui envoie X-Forwarded-Proto)
app.use((req, res, next) => {
  if (prod && req.headers['x-forwarded-proto'] === 'http')
    return res.redirect(301, `https://${req.headers.host}${req.originalUrl}`)
  if (prod) res.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains')
  res.set({
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
    'Content-Security-Policy': CSP
  })
  next()
})
app.use(compression())
app.use(express.json({ limit: '512kb' }))

// Toutes les clés API et appels base de données restent exclusivement côté serveur.
app.get('/api/catalog', (req, res) => catalogHandler(req, res))
app.get('/api/health', (_req, res) => {
  res.set('Cache-Control', 'no-store')
  res.json({ status: 'ok', service: 'kora', timestamp: new Date().toISOString() })
})
app.all('/api/auth', (req, res) => authHandler(req, res))
app.all('/api/me', (req, res) => meHandler(req, res))
app.post('/api/play', (req, res) => playHandler(req, res))
app.all('/api/studio', (req, res) => studioHandler(req, res))
app.all('/api/admin', (req, res) => adminHandler(req, res))
app.post('/api/checkout', (req, res) => checkoutHandler(req, res))
app.use('/api', (_req, res) => res.status(404).json({ error: 'not_found' }))

if (prod) {
  const html = readFileSync(path.join(dist, 'index.html'), 'utf8')
    .replaceAll('%SITE_URL%', site)
    .replace('<!--ANALYTICS-->', plausible
      ? `<script defer data-domain="${plausible}" src="https://plausible.io/js/script.hash.js"></script>` : '')
  const studioPath = path.join(dist, 'studio.html')
  const studioHtml = existsSync(studioPath) ? readFileSync(studioPath, 'utf8') : html

  app.use(express.static(dist, {
    index: false,
    setHeaders: (res, p) => res.set('Cache-Control',
      p.includes(`${path.sep}assets${path.sep}`) ? 'public, max-age=31536000, immutable' : 'public, max-age=3600')
  }))
  // 2e application : Kora Studio (/studio ou /studio/)
  app.get(['/studio', '/studio/'], (_req, res) => {
    res.set('Cache-Control', 'no-cache').status(200).type('html').send(studioHtml)
  })
  // "/" = application principale ; tout autre chemin = vraie 404
  app.get('*', (req, res) => {
    res.set('Cache-Control', 'no-cache').status(req.path === '/' ? 200 : 404).type('html').send(html)
  })
}
app.listen(PORT, () => console.log(`Kora sur http://localhost:${PORT} (Studio sur /studio/)`))
