# Kora · kit de marque pour agents

> À lire avant de produire quoi que ce soit au nom de la marque (écran, post, document, code).
> Les valeurs exactes sont dans `tokens.json`, les logos dans `logos/`.

## Règles non négociables

1. Utiliser les versions sombres (horizontal-sombre, empile-sombre, symbole-sombre) par défaut sur #16140F et #000000.
2. Sur fond clair, utiliser horizontal-noir (monochrome) au lieu de horizontal-clair.
3. En dessous de 24 px ou 25 mm print, afficher le symbole K seul sans le nom Kora.

## Concept

Cordes — Un K en trois pièces — fût vert, bras d'or en arc, jambe rouge — comme les cordes et la caisse d'une kora : la tradition qui se projette à l'écran.

## Couleurs

| Token | Nom | HEX | Rôle | Part | CMJN | Règle |
|---|---|---|---|---|---|---|
| `surface` | fond | `#FBF9F4` | Fond de page ; découpes du logo | 60 % | 0 1 3 2 |  |
| `onSurface` | texte | `#242119` | Texte principal ; encre du logo | 30 % | 0 8 31 86 |  |
| `onSurfaceVariant` | texte secondaire | `#75726A` | Texte secondaire, légendes | dans les 30 % | 0 3 9 54 |  |
| `primary` | couleur de marque | `#906D03` | Couleur de marque : boutons, liens ; couleur principale du logo | 10 % | 0 24 98 44 |  |
| `onPrimary` | texte sur la couleur de marque | `#FFFFFF` | Texte et icônes posés sur la couleur de marque | sur la couleur de marque | 0 0 0 0 |  |
| `outlineVariant` | filets et bordures | `#E3DED1` | Séparateurs décoratifs (sans exigence de contraste) | dans les 30 % | 0 2 8 11 |  |

CMJN approché, converti directement du RVB : à faire recaler par l'imprimeur avec son profil d'impression.

### Règle de couleur validée

60 / 30 / 10 : 60 % fond sombre (#16140F), 30 % surfaces et texte crème (#EDEBE4 et #9E9C95), 10 % accent or (#F2C334) réservé aux CTA et états actifs ; vert (#2F9E3C) et rouge (#DE1310) limités au symbole K et aux états ponctuels ; texte clair sur fond or interdit (texte #111111 obligatoire).

Cette règle prime sur les contrastes calculés.

### Texte : combinaisons calculées (WCAG)

- Autorisé (≥ 4,5:1) : `onSurface` sur `surface` : 15,3:1 · `onSurfaceVariant` sur `surface` : 4,6:1 · `primary` sur `surface` : 4,6:1
- Interdit pour du texte (< 3:1) : `onPrimary` sur `surface` : 1,1:1 · `outlineVariant` sur `surface` : 1,3:1
- Entre 3:1 et 4,5:1 : grands titres (≥ 24 px) seulement.

## Typographie

| Token | Famille | Graisses | Usage | Source |
|---|---|---|---|---|
| `titre` | Crimson Pro | 700, 800 | titres | [Google Fonts](https://fonts.googleapis.com/css2?family=Crimson+Pro:wght@700;800&family=Plus+Jakarta+Sans:wght@400;600&display=swap) |
| `corps` | Plus Jakarta Sans | 400, 600 | texte courant | [Google Fonts](https://fonts.googleapis.com/css2?family=Crimson+Pro:wght@700;800&family=Plus+Jakarta+Sans:wght@400;600&display=swap) |

- Échelle : base 16 px, ratio 1,55 → 13 px / 16 px / 26 px / 48 px

## Logos

| Fichier | Quand l'utiliser |
|---|---|
| `logos/svg/symbole-sombre.svg` | Symbole seul : petits formats, sur fond sombre (fond inclus) |
| `logos/svg/symbole-sombre-monochrome.svg` | Symbole seul monochrome clair, sur fond sombre (fond inclus) |
| `logos/svg/symbole.svg` | Symbole seul : petits formats, sur fond clair |
| `logos/svg/empile-sombre.svg` | Format carré, sur fond sombre (fond inclus) |
| `logos/svg/empile-sombre-monochrome.svg` | Format carré monochrome clair, sur fond sombre (fond inclus) |
| `logos/svg/empile-clair.svg` | Format carré, sur fond clair |
| `logos/svg/horizontal-blanc.svg` | Une seule couleur, en blanc (fond foncé inclus) |
| `logos/svg/horizontal-noir.svg` | Une seule couleur, en noir : impression, tampon |
| `logos/svg/horizontal-sombre.svg` | Logo principal, sur fond sombre (fond inclus) |
| `logos/svg/horizontal-sombre-monochrome.svg` | Une seule couleur claire, sur fond sombre (fond inclus) |
| `logos/svg/horizontal-clair.svg` | Logo principal, sur fond clair |

- **Unité** : épaisseur du fût du K (1,4 module)
- **Zone de protection** : X = épaisseur du fût sur les 4 côtés
- **Tailles minimales** : 25 mm print ; 16 px symbole

## Interdits

- Ne jamais poser le logotype crème #EDEBE4 sur fond clair ou blanc (contraste 1,19:1).
- Ne pas poser le symbole K tricolore directement sur un fond vert, rouge ou or uni sans cartouche sombre #16140F.

## Fichiers du kit

- `BRAND.md` : ce document.
- `tokens.json` : couleurs, polices, tailles au format W3C Design Tokens.
- `logos/` : SVG vectoriels, zone de protection incluse dans le cadre.
