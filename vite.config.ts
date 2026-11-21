import { defineConfig } from 'vite'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.dirname(fileURLToPath(import.meta.url))
const escAttr = (s: string) => s.replace(/[&"'<>]/g, c => ({ '&': '&amp;', '"': '&quot;', "'": '&#39;', '<': '&lt;', '>': '&gt;' }[c] || c))
const rawSite = (process.env.SITE_URL || (process.env.VERCEL_PROJECT_PRODUCTION_URL ? 'https://' + process.env.VERCEL_PROJECT_PRODUCTION_URL : '')).trim().replace(/\/$/, '')
const site = /^https?:\/\/[a-z0-9.-]+(:\d+)?$/i.test(rawSite) ? escAttr(rawSite) : ''
const rawPl = (process.env.PLAUSIBLE_DOMAIN || '').trim()
const pl = /^[a-z0-9.-]+$/i.test(rawPl) ? escAttr(rawPl) : ''

// Analytics sans cookie : Plausible si PLAUSIBLE_DOMAIN est défini, sinon Vercel Web Analytics sur Vercel.
const analytics = pl
  ? `<script defer data-domain="${pl}" src="https://plausible.io/js/script.hash.js"></script>`
  : process.env.VERCEL ? '<script defer src="/_vercel/insights/script.js"></script>' : ''

export default defineConfig({
  esbuild: { jsx: 'automatic' },
  plugins: [
    {
      name: 'kora-html',
      transformIndexHtml: h => h.replaceAll('%SITE_URL%', site).replace('<!--ANALYTICS-->', analytics)
    }
  ],
  server: { proxy: { '/api': 'http://localhost:3000' } },
  build: {
    target: 'es2020',
    sourcemap: false,
    rollupOptions: {
      input: {
        main: path.resolve(root, 'index.html'),
        studio: path.resolve(root, 'studio.html')
      },
      output: {
        manualChunks: {
          react: ['react', 'react-dom'],
          hls: ['hls.js']
        }
      }
    }
  }
})
