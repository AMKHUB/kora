# DESIGN — Kora

> Généré par Brand Designer. Décisions validées par le dev ; voir `decisions.md`.

## Couleur de marque

`#906D03` (option « Palette 1 · #F2B705 »)

## Palette (3 thèmes)

| Rôle | Clair | Sombre | Black |
|---|---|---|---|
| surface | #FBF9F4 | #16140F | #000000 |
| onSurface | #242119 | #EDEBE4 | #E0DFDA |
| onSurfaceVariant | #75726A | #9E9C95 | #94928D |
| primary | #906D03 | #F2C334 | #F2C94C |
| onPrimary | #FFFFFF | #111111 | #111111 |
| outlineVariant | #E3DED1 | #47453D | #33312D |

## Polices

- Titres : **Crimson Pro** (sérif éditorial)
- Texte : **Plus Jakarta Sans** (sans-serif humaniste)

| Niveau | Taille | Graisse |
|---|---|---|
| Hero / Display | 48 | 800 |
| Titre section | 26 | 700 |
| Corps | 16 | 400 |
| Légende | 13 | 400 |

Google Fonts : https://fonts.googleapis.com/css2?family=Crimson+Pro:wght@700;800&family=Plus+Jakarta+Sans:wght@400;600&display=swap

## Usage de la couleur

60 / 30 / 10 : 60 % fond sombre (#16140F), 30 % surfaces et texte crème (#EDEBE4 et #9E9C95), 10 % accent or (#F2C334) réservé aux CTA et états actifs ; vert (#2F9E3C) et rouge (#DE1310) limités au symbole K et aux états ponctuels ; texte clair sur fond or interdit (texte #111111 obligatoire).

## Construction du logo

- grille : 8 × 8
- unite x : épaisseur du fût du K (1,4 module)
- tailles min : 25 mm print ; 16 px symbole
- zone protection : X = épaisseur du fût sur les 4 côtés

## Rayons

```json
{
  "carte": 8,
  "petit": 4
}
```

## Mouvement

Transitions nettes de 180 à 240 ms en cubic-bezier(0.22, 1, 0.36, 1), désactivées sous prefers-reduced-motion.

## Règles

- Utiliser les versions sombres (horizontal-sombre, empile-sombre, symbole-sombre) par défaut sur #16140F et #000000.
- Sur fond clair, utiliser horizontal-noir (monochrome) au lieu de horizontal-clair.
- En dessous de 24 px ou 25 mm print, afficher le symbole K seul sans le nom Kora.

## Interdits

- Ne jamais poser le logotype crème #EDEBE4 sur fond clair ou blanc (contraste 1,19:1).
- Ne pas poser le symbole K tricolore directement sur un fond vert, rouge ou or uni sans cartouche sombre #16140F.
