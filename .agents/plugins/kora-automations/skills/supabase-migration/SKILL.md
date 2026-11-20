---
name: supabase-migration
description: >-
  Generate and validate Supabase PostgreSQL SQL migrations with Row-Level Security (RLS)
  policies for Kora's roles (user, moderator, admin), storage buckets, and Edge Functions,
  while keeping docs/ARCHITECTURE.md in sync. Use when creating, exporting, or modifying
  Kora database tables, RLS rules, triggers, or RPC functions.
---

# Kora Supabase Migration Workflow

Use this skill whenever adding, changing, or exporting PostgreSQL schema objects for Kora.

## Context to Read First

1. Read [docs/ARCHITECTURE.md](../../../../docs/ARCHITECTURE.md) (Sections 3, 5, and 6) to align table/column names with the existing Paris Supabase project (`accounts`, `profiles`, `titles`, `seasons`, `episodes`, `people`, `title_people`, `genres`, `title_genres`, `languages`, `title_languages`, `video_assets`, `rights`, `watch_progress`, `my_list`, `ratings`, `blocks`, `plans`, `subscriptions`, `payments`, `invoices`, `purchases`, `devices`, `streams`, `downloads`, `notifications`, `reports`, `audit_log`, `campaigns`).
2. Inspect how the frontend queries Supabase in [src/store.tsx](../../../../src/store.tsx), [src/admin.tsx](../../../../src/admin.tsx), and [src/supabase.ts](../../../../src/supabase.ts).

## Migration Rules for Kora

1. **Migration placement & naming**:
   - Store SQL migrations in `supabase/migrations/<YYYYMMDDHHMMSS>_<slug>.sql`.
   - Keep migrations idempotent where appropriate or strictly ordered, with explicit column types, foreign keys, and indexes on lookup/RLS columns (`account_id`, `profile_id`, `title_id`, `status`).
2. **Mandatory Row-Level Security (RLS)**:
   - Every table in `public` **must** have `ALTER TABLE public.<table_name> ENABLE ROW LEVEL SECURITY;`.
   - Separate policies explicitly for `SELECT`, `INSERT`, `UPDATE`, and `DELETE` (avoid `FOR ALL` unless every action shares identical constraints).
   - **Role separation**:
     - `user`: can read published catalog rows (`titles.status = 'published'`) and only read/write their own `accounts`, `profiles`, `my_list`, `watch_progress`, `ratings`, `devices`, and `subscriptions` (never allow users to escalate `accounts.role`).
     - `moderator`: can read and update `reports` (`status`), without unrestricted catalog or billing mutation rights.
     - `admin`: full CRUD on catalog tables (`titles`, `seasons`, `episodes`, `people`, `rights`, `campaigns`), `admin_stats()`, and `reports`.
   - **Kid profiles**: enforce age-rating boundaries (`Tous`, `7+`) server-side where applicable, and never trust client-only checks alone for protected actions.
3. **Storage & Media**:
   - `posters` bucket (5 MB limit, public read, admin write).
   - `videos` bucket (private; playback exclusively via signed URLs minted by the `play` Edge Function after verifying auth, publication status, availability dates, country rights, and active plan).
4. **Audit & Documentation**:
   - Log admin/moderator mutations into `audit_log`.
   - Never embed `service_role` keys in `src/` or `.env.example` (frontend uses `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` only).
   - Update [docs/ARCHITECTURE.md](../../../../docs/ARCHITECTURE.md) if tables, roles, or Edge Functions change.

## Verification

- Review every new table and policy against the RLS checklist above.
- If the Supabase MCP server is connected, verify the live schema/policies or run `supabase db lint` / SQL checks before finishing.
- Run `npm run build` if any TypeScript types or Supabase queries in `src/` were updated.
