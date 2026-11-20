# Kora

Plateforme de streaming du cinéma malien, africain et de la diaspora, habillée avec l'identité visuelle officielle Kora (`brand/BRAND.md`, `brand/DESIGN.md`, `brand/tokens.json`).

**Stack** : TypeScript + React 18 (Vite) + `hls.js` pour l'interface et le lecteur vidéo adaptatif, Node/Express pour le serveur local et la sécurité, Supabase (Auth, PostgreSQL + RLS, Storage, Edge Function `play`) et déploiement Vercel.

## Lancer en local

```bash
npm install
npm run dev                  # http://localhost:5173 (API sur :3000)
npm run build && npm start   # production, http://localhost:3000
```

## Fonctionnalités clés

- **Identité visuelle Kora** : 3 thèmes officiels (Sombre `#16140F`, Cinéma OLED `#000000`, Clair `#FBF9F4`), typographies **Crimson Pro** & **Plus Jakarta Sans**, symbole K tricolore et règle d'or 60/30/10 (`#F2C334` + `#111111`).
- **Découverte & Accueil** : carrousel héro rotatif, filtres rapides, *Continuer à regarder* avec barres de progression, *Top 10 au Mali* numéroté, moteur de recommandations pondéré.
- **Recherche avancée & Explorer** : recherche instantanée + filtres combinables (type, pays, genre, langue, âge, durée, époque, tri) et historiques de recherche.
- **Fiche film & série** : badges techniques (`4K`, `HDR`, `AD`), reprise intelligente, bande-annonce, distribution cliquable, saisons/épisodes avec synopsis et progression, partage et signalement connecté à Supabase.
- **Lecteur cinéma (`hls.js`)** : lecture HLS adaptative (`.m3u8`) et MP4/WebM signés via l'Edge Function `play`, aperçu cinéma fluide avec sous-titres synchronisés, *Ignorer l'introduction*, *Épisode suivant* automatique, Picture-in-Picture, volume, réglages qualité/audio/vitesse et raccourcis clavier.
- **Foyer & Profils** : profils multiples avec avatars, mode Enfant (`Tous` & `7+`), code PIN chiffré SHA-256 via modale accessible, gestion des appareils connectés et centre de notifications.
- **Abonnements & Facturation** : 3 formules (*Gratuit*, *Premium*, *Famille & Cinéma*), facturation mensuelle ou annuelle, parcours de paiement Orange Money, Moov Money, Wave et carte bancaire, historique des factures.
- **Administration & Modération (`#/admin`)** : tableau de bord KPI, CRUD contenus + saisons/épisodes + envoi affiches/vidéos, droits de diffusion par pays, gestion des comptes & rôles, modération des signalements et journal d'audit.

## Variables d'environnement

Voir `.env.example` :
- `VITE_SUPABASE_URL` et `VITE_SUPABASE_PUBLISHABLE_KEY` : connexion au projet Supabase (clé publique protégée par RLS). Sans elles, l'application bascule sur `/api/catalog`.
- `SITE_URL` : URL publique utilisée pour les balises Open Graph.
- `PLAUSIBLE_DOMAIN` : active l'analytics sans cookie (Plausible) ; sinon Vercel Web Analytics sur Vercel.

## Documentation technique

Voir `docs/ARCHITECTURE.md` et `supabase/migrations/20261120164500_kora_full_features.sql`.
