import express from 'express'
import compression from 'compression'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { catalog } from './server/catalog.js'

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

// Toutes les données et tous les secrets restent côté serveur.
app.get('/api/catalog', (_req, res) => {
  res.set('Cache-Control', 'public, max-age=300')
  res.json(catalog)
})
app.get('/api/health', (_req, res) => {
  res.set('Cache-Control', 'no-store')
  res.json({ status: 'ok', service: 'kora', timestamp: new Date().toISOString() })
})
app.use('/api', (_req, res) => res.status(404).json({ error: 'not_found' }))

if (prod) {
  const html = readFileSync(path.join(dist, 'index.html'), 'utf8')
    .replaceAll('%SITE_URL%', site)
    .replace('<!--ANALYTICS-->', plausible
      ? `<script defer data-domain="${plausible}" src="https://plausible.io/js/script.hash.js"></script>` : '')
  app.use(express.static(dist, {
    index: false,
    setHeaders: (res, p) => res.set('Cache-Control',
      p.includes(`${path.sep}assets${path.sep}`) ? 'public, max-age=31536000, immutable' : 'public, max-age=3600')
  }))
  // "/" = application ; tout autre chemin = vraie 404 (l'app affiche la page 404 personnalisée)
  app.get('*', (req, res) => {
    res.set('Cache-Control', 'no-cache').status(req.path === '/' ? 200 : 404).type('html').send(html)
  })
}
app.listen(PORT, () => console.log(`Kora sur http://localhost:${PORT}`))
