---
name: catalog-sync
description: >-
  Synchronize Kora's local fallback catalog (server/catalog.js) with the Supabase
  PostgreSQL catalog tables (titles, seasons, episodes, people, title_people,
  genres, title_genres, languages, title_languages, rights). Use when adding new
  films, series, documentaries, short films, or episodes to Kora.
---

# Kora Catalog Synchronization (`server/catalog.js` ↔ Supabase)

Kora uses a dual-source catalog architecture:
1. **Primary Cloud Catalog**: Supabase PostgreSQL (`public.titles`, `seasons`, `episodes`, `people`, `title_people`, `genres`, `title_genres`, `languages`, `title_languages`, `rights`) queried in [src/store.tsx](../../../../src/store.tsx).
2. **Fallback Editorial Catalog**: [server/catalog.js](../../../../server/catalog.js) served via `/api/catalog` ([api/catalog.js](../../../../api/catalog.js) and [server.js](../../../../server.js)) and merged for rich episode synopses and technical badges (`4K`, `HDR`, `AD`).

## Procedure

1. **Inspect Both Sources**:
   - Read [server/catalog.js](../../../../server/catalog.js) (`T` array and `SERIES_EPISODES` map).
   - If the Supabase MCP server (`supabase_mcp`) is connected, query `public.titles`, `public.seasons`, and `public.episodes` to compare IDs, titles, types (`film`, `series`, `doc`, `short`), years, countries, and episode counts.
2. **Maintain Type & Language Mapping**:
   - `server/catalog.js` uses `'serie'` and `'court'`; Supabase `public.title_type` enum uses `'series'` and `'short'` (mapped via `TYPES` in [src/store.tsx](../../../../src/store.tsx)).
   - Language codes in `public.languages`: `bm` (Bambara), `fr` (Français), `en` (Anglais), `wo` (Wolof), `ff` (Peul), `ar` (Arabe).
3. **Generate Idempotent Seed / Sync SQL**:
   - Use `INSERT INTO ... ON CONFLICT DO UPDATE` so existing IDs and watch progress references (`watch_progress`, `my_list`, `ratings`) are never broken.
   - Ensure every series has matching rows in `public.seasons` and `public.episodes` (`number`, `title`, `synopsis`, `duration_min`, `intro_end_sec`).
4. **Verify**:
   - Run `node --check server/catalog.js`.
   - Run `npm run build` to verify TypeScript and Vite bundle compilation.
