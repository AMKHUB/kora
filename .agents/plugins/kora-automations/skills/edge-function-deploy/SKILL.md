---
name: edge-function-deploy
description: >-
  Design, audit, test, and deploy Supabase Edge Functions (Deno/TypeScript) for
  Kora, including the signed video playback function (play) and payment webhooks
  (Orange Money, Moov Money, Wave, Stripe).
---

# Kora Supabase Edge Function Workflow

Kora's sensitive server-side operations run inside Supabase Edge Functions (`Deno.serve`):
- **`play`**: verifies user session, `titles.status = 'published'`, availability dates (`available_from`, `available_until`), territorial rights (`public.rights` vs `accounts.country`), and active subscription plan (`public.subscriptions`) before minting a 1-hour signed URL from the private `videos` bucket.
- **Payment Webhooks (`webhooks-*`)**: verify provider signatures (Orange Money, Moov Money, Wave, Stripe), record idempotent rows in `public.payments`, and activate/renew `public.subscriptions`.

## Rules for Kora Edge Functions

1. **CORS & Preflight**:
   - Always handle `req.method === 'OPTIONS'` and return JSON responses with explicit `Content-Type: application/json` and CORS headers.
2. **Authentication & Least Privilege**:
   - Extract the user JWT from `Authorization: Bearer <token>` and validate via `db.auth.getUser(token)`.
   - Never trust client-supplied `account_id`, `role`, or `plan_id` in the request body; always look them up server-side from `public.accounts` and `public.subscriptions`.
3. **Status Codes Alignment with Frontend (`src/player.tsx`)**:
   - `401`: Connexion requise
   - `402`: Réservé aux abonnés Kora Premium ou Famille (`r.access === 'premium' && plan === 'free'`)
   - `403`: Non disponible dans votre pays (`rights` table mismatch)
   - `404`: Contenu indisponible ou aucune vidéo téléversée
4. **Deployment & Verification**:
   - Deploy via `supabase_mcp` (`deploy_edge_function`) and verify active status with `list_edge_functions` / `get_edge_function`.
   - If the Edge Function introduces a new external media or payment domain, run the `csp-sync` skill to update both `server.js` and `vercel.json`.
