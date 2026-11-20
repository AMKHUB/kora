// Synchronise les icônes, favicons, logos et l'image Open Graph officiels depuis brand/ vers public/.
import { copyFileSync, existsSync, mkdirSync } from 'node:fs'
import path from 'node:path'

mkdirSync('public', { recursive: true })
mkdirSync('public/brand', { recursive: true })

const assets = [
  ['brand/web/favicon.ico', 'public/favicon.ico'],
  ['brand/logos/svg/symbole-sombre.svg', 'public/favicon.svg'],
  ['brand/web/favicon-32.png', 'public/favicon-32.png'],
  ['brand/web/apple-touch-icon.png', 'public/apple-touch-icon.png'],
  ['brand/web/icon-192.png', 'public/icon-192.png'],
  ['brand/web/icon-512.png', 'public/icon-512.png'],
  ['brand/web/icon-maskable-512.png', 'public/icon-maskable-512.png'],
  ['brand/social/og-image.png', 'public/og.png'],
  ['brand/social/og-image.png', 'public/og-image.png'],
  ['brand/logos/svg/horizontal-sombre.svg', 'public/brand/horizontal-sombre.svg'],
  ['brand/logos/svg/horizontal-noir.svg', 'public/brand/horizontal-noir.svg'],
  ['brand/logos/svg/empile-sombre.svg', 'public/brand/empile-sombre.svg'],
  ['brand/logos/svg/symbole-sombre.svg', 'public/brand/symbole-sombre.svg'],
  ['brand/logos/svg/symbole.svg', 'public/brand/symbole.svg'],
  ['brand/logos/svg/horizontal-sombre.svg', 'public/logo.svg']
]

for (const [src, dest] of assets) {
  if (existsSync(src)) {
    mkdirSync(path.dirname(dest), { recursive: true })
    copyFileSync(src, dest)
  }
}
