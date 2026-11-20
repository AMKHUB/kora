import { defineConfig } from 'vite'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.dirname(fileURLToPath(import.meta.url))
const site = process.env.SITE_URL || (process.env.VERCEL_PROJECT_PRODUCTION_URL ? 'https://' + process.env.VERCEL_PROJECT_PRODUCTION_URL : '')
const pl = process.env.PLAUSIBLE_DOMAIN
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
