# Kora · kit de marque

Tout ce qu'il faut pour utiliser la marque, rangé par usage. Les SVG de `logos/svg/` et `tokens.json` font foi : les autres fichiers en sont tirés.

## À la racine

- `BRAND.md` : Règles de la marque à donner à un agent IA avant tout travail au nom de la marque.
- `DESIGN.md` : Fiche de direction lue par les outils de design (couleurs, polices, rayons).
- `tokens.json` : Jetons au format W3C Design Tokens (DTCG) : Figma Tokens Studio, Style Dictionary.
- `decisions.md` : Décisions validées pendant le projet, avec les mots du dev.

## Logos vectoriels (référence) · `logos/svg/`

Partout où le SVG est lu : site, app, Figma, documents.

- `empile-clair.svg`
- `empile-sombre-monochrome.svg`
- `empile-sombre.svg`
- `horizontal-blanc.svg`
- `horizontal-clair.svg`
- `horizontal-noir.svg`
- `horizontal-sombre-monochrome.svg`
- `horizontal-sombre.svg`
- `symbole-sombre-monochrome.svg`
- `symbole-sombre.svg`
- `symbole.svg`

## Logos PNG · `logos/png/`

Fond transparent, 1024 px sur le plus grand côté : présentations, outils sans SVG.

- `empile-clair.png`
- `empile-sombre-monochrome.png`
- `empile-sombre.png`
- `horizontal-blanc.png`
- `horizontal-clair.png`
- `horizontal-noir.png`
- `horizontal-sombre-monochrome.png`
- `horizontal-sombre.png`
- `symbole-sombre-monochrome.png`
- `symbole-sombre.png`
- `symbole.png`

## Logos WebP · `logos/webp/`

Même rendu que le PNG, 2 à 3 fois plus léger : pages web.

- `empile-clair.webp`
- `empile-sombre-monochrome.webp`
- `empile-sombre.webp`
- `horizontal-blanc.webp`
- `horizontal-clair.webp`
- `horizontal-noir.webp`
- `horizontal-sombre-monochrome.webp`
- `horizontal-sombre.webp`
- `symbole-sombre-monochrome.webp`
- `symbole-sombre.webp`
- `symbole.webp`

## Logos AVIF · `logos/avif/`

Encore plus léger que le WebP, pour les sites qui le servent.

- `empile-clair.avif`
- `empile-sombre-monochrome.avif`
- `empile-sombre.avif`
- `horizontal-blanc.avif`
- `horizontal-clair.avif`
- `horizontal-noir.avif`
- `horizontal-sombre-monochrome.avif`
- `horizontal-sombre.avif`
- `symbole-sombre-monochrome.avif`
- `symbole-sombre.avif`
- `symbole.avif`

## Logos PDF vectoriels · `logos/pdf/`

Pour l'imprimeur (à la place de l'EPS ou de l'AI).

- `empile-clair.pdf`
- `empile-sombre-monochrome.pdf`
- `empile-sombre.pdf`
- `horizontal-blanc.pdf`
- `horizontal-clair.pdf`
- `horizontal-noir.pdf`
- `horizontal-sombre-monochrome.pdf`
- `horizontal-sombre.pdf`
- `symbole-sombre-monochrome.pdf`
- `symbole-sombre.pdf`
- `symbole.pdf`

## Web · `web/`

Favicons, icônes PWA, site.webmanifest, bloc <head> (head.html) et jetons CSS ou Tailwind.

- `apple-touch-icon.png`
- `favicon-32.png`
- `favicon.ico`
- `favicon.svg`
- `head.html`
- `icon-192.png`
- `icon-512.png`
- `icon-maskable-512.png`
- `site.webmanifest`
- `tailwind.preset.js`
- `tailwind.theme.css`
- `tokens.css`

## iOS · `ios/`

Glisser Assets.xcassets dans Xcode : icône d'app et couleurs de marque (BrandColors.swift).

- `Assets.xcassets/AppIcon.appiconset/` : `AppIcon-1024.png`, `Contents.json`
- `Assets.xcassets/` : `BrandOnPrimary.colorset/`, `BrandOnSurface.colorset/`, `BrandOnSurfaceVariant.colorset/`, `BrandOutlineVariant.colorset/`, `BrandPrimary.colorset/`, `BrandSurface.colorset/`, `Contents.json`
- `BrandColors.swift`

## Android · `android/`

Fusionner res/ dans app/src/main/res : icône adaptative (avec version monochrome) et couleurs.

- `res/mipmap-anydpi-v26/` : `ic_launcher.xml`, `ic_launcher_round.xml`
- `res/mipmap-hdpi/` : `ic_launcher.png`, `ic_launcher_background.png`, `ic_launcher_foreground.png`, `ic_launcher_round.png`
- `res/mipmap-mdpi/` : `ic_launcher.png`, `ic_launcher_background.png`, `ic_launcher_foreground.png`, `ic_launcher_round.png`
- `res/mipmap-xhdpi/` : `ic_launcher.png`, `ic_launcher_background.png`, `ic_launcher_foreground.png`, `ic_launcher_round.png`
- `res/mipmap-xxhdpi/` : `ic_launcher.png`, `ic_launcher_background.png`, `ic_launcher_foreground.png`, `ic_launcher_round.png`
- `res/mipmap-xxxhdpi/` : `ic_launcher.png`, `ic_launcher_background.png`, `ic_launcher_foreground.png`, `ic_launcher_round.png`
- `res/values/` : `brand_colors.xml`

## Boutiques · `stores/`

Icône App Store 1024, icône et visuel de mise en avant Google Play.

- `app-store-1024.png`
- `google-play-512.png`
- `google-play-feature-1024x500.png`

## Réseaux et partage · `social/`

Image Open Graph 1200 × 630, aperçu de dépôt GitHub 1280 × 640, avatar 400 × 400 (recadrage rond prévu).

- `avatar-400.png`
- `github-social-preview.png`
- `og-image.png`

## Mises en situation · `mises-en-situation/`

Images générées par IA avec le vrai logo incrusté, en JPG, WebP et AVIF.

- `avif/` : `planche-de-marque-1.avif`
- `jpg/` : `planche-de-marque-1.jpg`
- `webp/` : `planche-de-marque-1.webp`

## Pictogrammes · `pictogrammes/`

Icônes d'interface retenues (Lucide, licence ISC incluse).

- `LICENSE-lucide.txt`
- `bookmark.svg`
- `captions.svg`
- `circle-user.svg`
- `clapperboard.svg`
- `download.svg`
- `film.svg`
- `house.svg`
- `play.svg`
- `search.svg`
- `tv-minimal-play.svg`

## Charte graphique · `charte/`

Le PDF à transmettre, et sa planche en PNG.

- `charte-graphique-planche.png`
- `charte-graphique.pdf`
