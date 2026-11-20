---
name: csp-sync
description: >-
  Keep Content-Security-Policy and HTTP security headers synchronized between
  server.js (Express) and vercel.json (Vercel production). Use when integrating
  video CDNs (Mux, Cloudflare Stream), payment providers (Stripe, Orange Money,
  Wave, Moov Money), analytics, or Supabase domains.
---

# Kora CSP & Security Header Sync

Kora defines its HTTP security headers and `Content-Security-Policy` in two places:
- Express server: [server.js](../../../../server.js)
- Vercel deployment config: [vercel.json](../../../../vercel.json)

Whenever a new external origin (HLS video CDN, DRM license server, payment SDK/webhook redirect, font/analytics host, or Supabase region URL) is added or removed, both files **must** remain aligned.

## Procedure

1. **Read both configurations**:
   - Read [server.js](../../../../server.js) (security header middleware).
   - Read [vercel.json](../../../../vercel.json) (`headers` array).
2. **Audit parity across all shared headers**:
   - `Strict-Transport-Security`: `max-age=31536000; includeSubDomains`
   - `X-Content-Type-Options`: `nosniff`
   - `Referrer-Policy`: `strict-origin-when-cross-origin`
   - `Permissions-Policy`: `camera=(), microphone=(), geolocation=()`
   - `Content-Security-Policy`: compare each directive (`default-src`, `script-src`, `connect-src`, `img-src`, `style-src`, `media-src`, `frame-ancestors`, `base-uri`, plus `frame-src` if adding embedded payment checkouts).
3. **Apply minimal origin grants**:
   - Never add wildcard `*` sources or `'unsafe-eval'`.
   - Scope each new origin to only the directive it needs (e.g., `media-src` and `connect-src` for HLS `.m3u8`/`.ts` segments; `script-src`/`frame-src`/`connect-src` for payment widgets).
   - Keep `frame-ancestors 'none'` and `base-uri 'self'` intact.
   - Note any intentional Vercel-only additions (such as `/_vercel/insights/script.js`, which is same-origin `'self'`).
4. **Validate**:
   - Parse `vercel.json` as valid JSON (`node -e "JSON.parse(require('fs').readFileSync('vercel.json','utf8'))"`).
   - Check `server.js` syntax (`node --check server.js`).
   - Run `npm run build` to verify the Vite build still succeeds.
