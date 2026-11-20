# Kora : architecture, API, base de données et état d'avancement

## 1. État des fonctionnalités

| Fonctionnalité | État |
|---|---|
| Identité visuelle Kora (`brand/BRAND.md`, `DESIGN.md`, `tokens.json`) : 3 thèmes (Sombre `#16140F`, Cinéma OLED `#000000`, Clair `#FBF9F4`), Crimson Pro + Plus Jakarta Sans, logos officiels & pictogrammes | **Terminé** |
| Accueil (carrousel héro, filtres rapides, rangées défilables, Top 10 numéroté, « Continuer à regarder » avec progression, recommandations pondérées) | **Terminé** |
| Recherche avancée (titre, réalisateur, acteur, pays, langue, genre + filtres combinables : type, pays, genre, langue, âge, durée, époque, tri) | **Terminé** |
| Fiche film / série (badges `4K`/`HDR`/`AD`, saisons & épisodes détaillés avec progression, distribution cliquable, partage, notation, signalement connecté) | **Terminé** |
| Profils multiples, avatars, profil enfant (`Tous`/`7+`), code PIN chiffré SHA-256 (modale dédiée), page Profil épurée + onglet dédié **Paramètres** (`#/parametres`) : thèmes, lecture, notifications, appareils connectés | **Terminé** (synchronisé Supabase + fallback local) |
| Lecteur cinéma : `hls.js` adaptatif + `<video>` (URL signée Edge Function `play`) + aperçu cinéma synchronisé, ±10 s, volume, PiP, vitesse, qualité, sous-titres, audio/AD, plein écran, raccourcis clavier, ignorer l'intro, épisode suivant automatique | **Terminé** (prêt pour flux HLS/MP4 réels) |
| Offres & Abonnement : Gratuit, Premium, Famille & Cinéma (mensuel/annuel), drapeau `VITE_BILLING_MODE` (`simulation` : activation gratuite en 1 clic ; `live` : paiement obligatoire vérifié via `/api/checkout` pour Orange Money / Moov Money / Wave / Carte) | **Terminé** |
| Espace administrateur & modérateur (`#/admin`) : tableau de bord KPI (`admin_stats`), ajout libre de séries avec couverture 2:3 + bannière 16:9 + synopsis court/long + saisons & épisodes + vidéos, droits par pays, comptes & rôles, signalements et journal d'audit | **Terminé** |
| **Kora Studio** (2e application sur `/studio/`) : espace créateurs façon YouTube Studio avec drag-and-drop couverture/bannière/vidéos, assistant 4 étapes, gestion multi-saisons & épisodes, aperçu carte Kora en direct, chaîne créateur (`creator_channels`) et publication directe | **Terminé** |
| Sécurité HTTP : HTTPS forcé, HSTS, CSP synchronisée entre `server.js` et `vercel.json`, RLS sur toutes les tables, protection anti-élévation de rôle | **Terminé** |
| Consentement cookies, pages Confidentialité et CGU, 404 personnalisée, analytics sans cookie, favicons & image OG de marque | **Terminé** |
| Téléchargement hors connexion, notifications push, casting | **Phase 2** (application mobile Capacitor) |

## 2. Parcours principaux
1. **Découverte** : accueil, filtres rapides ou recherche avancée, fiche, « Lire », publicité courte (formule gratuite), lecteur cinéma, reprise automatique.
2. **Série** : fiche, sélection de saison et d'épisode, « Ignorer l'introduction », compte à rebours épisode suivant.
3. **Foyer** : profil enfant filtré (`Tous` et `7+`), code PIN sur les profils adultes, choix du thème (Sombre / Cinéma OLED / Clair).
4. **Abonnement** : choix mensuel ou annuel, sélection du moyen de paiement (Orange Money, Moov Money, Wave, Carte), activation immédiate et facture enregistrée.
5. **Administrateur / Modérateur** : connexion, ajout/édition de contenus et d'épisodes, import d'affiches et de vidéos, configuration des droits par pays, gestion des rôles et clôture des signalements.

## 3. Base de données PostgreSQL (Supabase, région Paris `eu-west-3`)
24 tables sécurisées par Row-Level Security (RLS) :
- `accounts`, `profiles`, `devices`, `notifications`, `audit_log`
- `titles`, `seasons`, `episodes`, `people`, `title_people`, `genres`, `title_genres`, `languages`, `title_languages`, `video_assets`, `rights`
- `watch_progress`, `my_list`, `ratings`, `blocks`, `reports`
- `plans` (`free`, `premium`, `family`), `subscriptions`, `payments`

Migrations versionnées dans `supabase/migrations/20261120164500_kora_full_features.sql` :
- Plan `family` (`Famille & Cinéma`, 4 500 FCFA/mois, 4K, 4 écrans, 6 profils)
- Trigger `trg_prevent_role_escalation` empêchant toute auto-élévation de rôle sur `accounts`
- Politiques RLS `devices`, `reports` (modérateurs + admins), `audit_log`, `notifications`
- Fonctions RPC `admin_list_accounts()` et `admin_set_role(target_id, new_role)` sécurisées par `private.is_admin()`

## 4. Stockage & Edge Functions
- Bucket public `posters` (5 Mo max, écriture réservée aux admins)
- Bucket privé `videos` (lecture exclusivement par URL signée 1 h)
- Edge Function `play` : vérifie l'authentification, le statut `published`, les dates de disponibilité, les droits territoriaux (`rights`) et la formule active avant de délivrer une URL signée.

## 5. API locale & Vercel
- `GET /api/catalog` : catalogue éditorial de repli (utilisé si Supabase n'est pas configuré ou hors ligne)
- `GET /api/health` : sonde de santé JSON (`status: "ok"`)
