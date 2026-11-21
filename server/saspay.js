import crypto from 'node:crypto'
import { createAnonClient } from './supabaseServer.js'

// Intégration officielle SasPay (https://api.saspay.me/api/v1) conforme à /llms.txt et /api-reference/openapi.json.
// Toutes les requêtes sont exécutées exclusivement côté serveur. La clé API n'est jamais exposée ni journalisée.

export const SASPAY_BASE_URL = 'https://api.saspay.me/api/v1'
export const SASPAY_BFF_GATE = 'kora_saspay_bff_gate_7e6d5c4b3a2f1e0d9c8b7a6f5e4d3c2b1a0f9e8d'
const WEBHOOK_TOLERANCE_SECONDS = 300

let vaultCache = null
let vaultCacheAt = 0

export async function ensureSaspayConfig() {
  const envKey = (process.env.SASPAY_API_KEY || '').trim()
  const envWh = (process.env.SASPAY_WEBHOOK_SECRET || '').trim()
  if (envKey && envWh) return getSaspayConfig()

  const now = Date.now()
  if (!vaultCache || now - vaultCacheAt > 60_000) {
    try {
      const anon = createAnonClient()
      if (anon) {
        const { data } = await anon.rpc('saspay_get_server_config', { p_gate_secret: SASPAY_BFF_GATE })
        if (data && typeof data === 'object') {
          vaultCache = data
          vaultCacheAt = now
        }
      }
    } catch { /* fallback env */ }
  }
  return getSaspayConfig()
}

// Catalogue officiel des événements webhook SasPay (/api-reference/webhooks)
export const SASPAY_WEBHOOK_EVENTS = new Set([
  'transaction.created',
  'transaction.success',
  'transaction.failed',
  'transaction.cancelled',
  'settlement.requested',
  'settlement.approved',
  'settlement.success',
  'settlement.failed',
  'settlement.cancelled',
  'wallet_transfer.requested',
  'wallet_transfer.completed',
  'wallet_transfer.rejected',
  'webhook.test'
])

// Catalogue officiel des pays et réseaux SasPay (/api-reference/reference/formats)
export const SASPAY_CATALOG = {
  ML: {
    name: 'Mali',
    currency: 'XOF',
    dialCode: '+223',
    networks: [
      { code: 'orange_ml', label: 'Orange Money Mali', provider: 'Orange Money', otpPreRequired: false },
      { code: 'moov_ml', label: 'Moov Money Mali', provider: 'Moov Money', otpPreRequired: false },
      { code: 'mobi_cash_ml', label: 'Mobi Cash Mali', provider: 'Mobi Cash', otpPreRequired: false }
    ]
  },
  SN: {
    name: 'Sénégal',
    currency: 'XOF',
    dialCode: '+221',
    networks: [
      { code: 'wave_sn', label: 'Wave Sénégal', provider: 'Wave', otpPreRequired: false },
      { code: 'orange_sn', label: 'Orange Money Sénégal', provider: 'Orange Money', otpPreRequired: false },
      { code: 'freemoney_sn', label: 'Free Money Sénégal', provider: 'Free Money', otpPreRequired: false },
      { code: 'wizall_sn', label: 'Wizall Sénégal', provider: 'Wizall', otpPreRequired: false, postOtpConfirm: true }
    ]
  },
  CI: {
    name: 'Côte d’Ivoire',
    currency: 'XOF',
    dialCode: '+225',
    networks: [
      { code: 'wave_ci', label: 'Wave Côte d’Ivoire', provider: 'Wave', otpPreRequired: false },
      { code: 'orange_ci', label: 'Orange Money CI', provider: 'Orange Money', otpPreRequired: true, otpInstructions: 'Composez #144*82# sur votre téléphone pour obtenir votre code OTP avant de valider.' },
      { code: 'mtn_ci', label: 'MTN MoMo CI', provider: 'MTN MoMo', otpPreRequired: false },
      { code: 'moov_ci', label: 'Moov Money CI', provider: 'Moov Money', otpPreRequired: false }
    ]
  },
  BF: {
    name: 'Burkina Faso',
    currency: 'XOF',
    dialCode: '+226',
    networks: [
      { code: 'orange_bf', label: 'Orange Burkina Faso', provider: 'Orange Money', otpPreRequired: true, otpInstructions: 'Générez votre code OTP Orange Money par USSD avant de valider.' },
      { code: 'moov_bf', label: 'Moov Burkina Faso', provider: 'Moov Money', otpPreRequired: false }
    ]
  },
  BJ: {
    name: 'Bénin',
    currency: 'XOF',
    dialCode: '+229',
    networks: [
      { code: 'mtn_bj', label: 'MTN MoMo Bénin', provider: 'MTN MoMo', otpPreRequired: false },
      { code: 'moov_bj', label: 'Moov Money Bénin', provider: 'Moov Money', otpPreRequired: false },
      { code: 'celtiis_bj', label: 'Celtiis Cash Bénin', provider: 'Celtiis', otpPreRequired: false }
    ]
  },
  TG: {
    name: 'Togo',
    currency: 'XOF',
    dialCode: '+228',
    networks: [
      { code: 'moov_tg', label: 'Moov Money Togo', provider: 'Moov Money', otpPreRequired: false },
      { code: 'togocel', label: 'Togocel Money', provider: 'Togocel', otpPreRequired: false }
    ]
  },
  NE: {
    name: 'Niger',
    currency: 'XOF',
    dialCode: '+227',
    networks: [
      { code: 'airtel_ne', label: 'Airtel Niger', provider: 'Airtel Money', otpPreRequired: false }
    ]
  },
  GN: {
    name: 'Guinée',
    currency: 'GNF',
    dialCode: '+224',
    networks: [
      { code: 'mtn_gn', label: 'MTN MoMo Guinée', provider: 'MTN MoMo', otpPreRequired: false }
    ]
  },
  CM: {
    name: 'Cameroun',
    currency: 'XAF',
    dialCode: '+237',
    networks: [
      { code: 'mtn_cm', label: 'MTN MoMo Cameroun', provider: 'MTN MoMo', otpPreRequired: false },
      { code: 'orange_cm', label: 'Orange Money Cameroun', provider: 'Orange Money', otpPreRequired: false }
    ]
  }
}

export const GLOBAL_NETWORKS = {
  card: { code: 'card', label: 'Carte bancaire (Visa / Mastercard)', country: 'XX', currency: 'USD', requiresReturnUrl: true },
  crypto: { code: 'crypto', label: 'Crypto / Stablecoins', country: 'XX', currency: 'USD', requiresReturnUrl: true }
}

const VALID_NETWORK_CODES = new Set([
  ...Object.values(SASPAY_CATALOG).flatMap(c => c.networks.map(n => n.code)),
  'card',
  'crypto',
  'mpesa_ke',
  'mtn_gh', 'tigo_gh', 'vodafone_gh',
  'airtel_cd', 'orange_cd', 'vodacom_cd',
  'airtel_ng', 'mtn_ng', 'allbanks_ng',
  'airtel_rw', 'mtn_rw',
  'airtel_tz', 'halopesa_tz', 'mpesa_tz', 'tigo_tz',
  'airtel_ug', 'mtn_ug',
  'airtel_zm', 'mtn_zm', 'zamtel_zm',
  'airtel_mw', 'tnm_mw'
])

export function getSaspayConfig() {
  const apiKey = (process.env.SASPAY_API_KEY || vaultCache?.api_key || '').trim()
  const webhookSecret = (process.env.SASPAY_WEBHOOK_SECRET || vaultCache?.webhook_secret || '').trim()
  const appUrl = (process.env.APP_URL || process.env.SITE_URL || vaultCache?.app_url || '').trim().replace(/\/$/, '')
  const isTestKey = apiKey.startsWith('sk_test_')
  const isLiveKey = apiKey.startsWith('sk_live_')
  return {
    apiKey,
    webhookSecret,
    appUrl,
    mode: isLiveKey ? 'live' : isTestKey ? 'test' : 'unconfigured',
    configured: Boolean(apiKey && (isTestKey || isLiveKey)),
    webhookConfigured: Boolean(webhookSecret)
  }
}

// Formatage strict en chaîne décimale ("2500.00"), jamais de flottant
export function formatSaspayAmount(value) {
  const str = String(value ?? '').trim()
  if (/^\d+\.\d{2}$/.test(str)) return str
  if (/^\d+$/.test(str)) return `${str}.00`
  if (/^\d+\.\d$/.test(str)) return `${str}0`
  const num = Number(str)
  if (!Number.isFinite(num) || num <= 0) {
    throw new Error('Montant SasPay invalide.')
  }
  const cents = Math.round(num * 100)
  const whole = Math.floor(cents / 100)
  const frac = String(cents % 100).padStart(2, '0')
  return `${whole}.${frac}`
}

export function normalizeIdempotencyKey(raw, fallbackPrefix = 'kora') {
  const clean = String(raw || '').trim()
  if (/^[A-Za-z0-9._:-]{8,128}$/.test(clean)) return clean
  return `${fallbackPrefix}-${crypto.randomUUID()}`
}

// Résolution d'un couple (country ISO2, network code) à partir du choix utilisateur
export function resolveSaspayNetwork({ countryIso, networkCode, provider }) {
  const net = String(networkCode || '').trim().toLowerCase()
  const prov = String(provider || '').trim()
  const iso = String(countryIso || 'ML').trim().toUpperCase()

  if (net === 'card' || prov === 'Carte bancaire') {
    return { country: VALID_COUNTRY_ISO(iso) ? iso : 'XX', network: 'card', isGlobal: true, label: 'Carte bancaire (SasPay)' }
  }
  if (net === 'crypto') {
    return { country: VALID_COUNTRY_ISO(iso) ? iso : 'XX', network: 'crypto', isGlobal: true, label: 'Crypto (SasPay)' }
  }

  if (net && VALID_NETWORK_CODES.has(net)) {
    const inferredCountry = net.includes('_') ? net.split('_').pop().toUpperCase() : iso
    const finalCountry = SASPAY_CATALOG[inferredCountry] ? inferredCountry : (SASPAY_CATALOG[iso] ? iso : 'ML')
    const found = SASPAY_CATALOG[finalCountry]?.networks.find(n => n.code === net)
    return {
      country: finalCountry,
      network: net,
      isGlobal: false,
      label: found?.label || `${prov || net} (SasPay)`,
      otpPreRequired: Boolean(found?.otpPreRequired),
      otpInstructions: found?.otpInstructions || ''
    }
  }

  // Résolution par nom de fournisseur + pays (compatibilité Orange Money, Moov Money, Wave)
  const targetIso = SASPAY_CATALOG[iso] ? iso : 'ML'
  if (prov === 'Wave') {
    const waveIso = targetIso === 'CI' ? 'CI' : 'SN'
    const waveNet = waveIso === 'CI' ? 'wave_ci' : 'wave_sn'
    return { country: waveIso, network: waveNet, isGlobal: false, label: `Wave ${waveIso} (SasPay)` }
  }
  if (prov === 'Moov Money') {
    const moovMap = { ML: 'moov_ml', CI: 'moov_ci', BF: 'moov_bf', BJ: 'moov_bj', TG: 'moov_tg' }
    const moovIso = moovMap[targetIso] ? targetIso : 'ML'
    return { country: moovIso, network: moovMap[moovIso], isGlobal: false, label: `Moov Money ${moovIso} (SasPay)` }
  }
  const orangeMap = { ML: 'orange_ml', SN: 'orange_sn', CI: 'orange_ci', BF: 'orange_bf', CM: 'orange_cm' }
  const orangeIso = orangeMap[targetIso] ? targetIso : 'ML'
  const orangeNet = orangeMap[orangeIso]
  const found = SASPAY_CATALOG[orangeIso]?.networks.find(n => n.code === orangeNet)
  return {
    country: orangeIso,
    network: orangeNet,
    isGlobal: false,
    label: found?.label || `Orange Money ${orangeIso} (SasPay)`,
    otpPreRequired: Boolean(found?.otpPreRequired),
    otpInstructions: found?.otpInstructions || ''
  }
}

function VALID_COUNTRY_ISO(iso) {
  return /^[A-Z]{2}$/.test(String(iso || ''))
}

export function splitCustomerName(fullName, email = '') {
  const clean = String(fullName || '').trim()
  if (clean) {
    const parts = clean.split(/\s+/)
    const firstName = parts[0].slice(0, 60) || 'Client'
    const lastName = (parts.slice(1).join(' ') || parts[0]).slice(0, 60) || 'Kora'
    return { first_name: firstName, last_name: lastName }
  }
  const local = String(email || 'client@kora.cinema').split('@')[0].replace(/[^a-zA-Z0-9]/g, ' ').trim()
  return { first_name: (local.split(/\s+/)[0] || 'Client').slice(0, 60), last_name: 'Kora' }
}

/* ============================================================================
   GESTION DU DÉBIT (300 req/min) & CLASSIFICATION DES ERREURS HTTP SASPAY
   ============================================================================ */
let rateLimitUntilMs = 0

function translateSaspayError(status, code, rawMessage, fieldErrors) {
  if (status === 401) {
    return 'Authentification SasPay refusée (401) : clé API absente, invalide ou expirée.'
  }
  if (status === 403) {
    if (code === 'ip_not_whitelisted') {
      return 'Retrait refusé (403 ip_not_whitelisted) : l’adresse IP du serveur doit être ajoutée à la whitelist IP dans le tableau de bord SasPay.'
    }
    if (code === 'api_key_scope_forbidden') {
      return 'Opération refusée (403 api_key_scope_forbidden) : le scope de la clé API SasPay ne permet pas cette action (PAYIN / PAYOUT / BOTH).'
    }
    if (code === 'payout_not_enabled') {
      return 'Les retraits (payouts) ne sont pas encore activés sur ce compte marchand SasPay.'
    }
    return rawMessage || 'Accès refusé par SasPay (403).'
  }
  if (status === 404) {
    return 'Transaction ou session SasPay introuvable (404).'
  }
  if (status === 409) {
    if (code === 'not_retryable') return 'Cette transaction est déjà dans un état final et ne peut pas être relancée (409).'
    if (code === 'not_pending') return 'Cette transaction n’est plus en attente de confirmation OTP (409).'
    return rawMessage || 'Conflit d’idempotence ou d’état sur cette transaction SasPay (409). Vérifiez son statut avant de réessayer.'
  }
  if (status === 410) {
    return 'Cette session ou ce lien de paiement SasPay a expiré (410).'
  }
  if (status === 422) {
    if (code === 'prepayment_otp_missing') {
      return 'Ce réseau exige un code OTP pré-paiement généré sur votre téléphone avant de valider (422 prepayment_otp_missing).'
    }
    if (code === 'otp_confirmation_failed') {
      return 'Code OTP invalide ou expiré. Vérifiez le code reçu et réessayez.'
    }
    if (code === 'insufficient_balance') {
      return 'Solde disponible insuffisant pour effectuer cette opération (422 insufficient_balance).'
    }
    if (code === 'currency_country_mismatch') {
      return 'La devise demandée ne correspond pas au pays du bénéficiaire (422 currency_country_mismatch : aucune conversion automatique sur les retraits).'
    }
    if (code === 'invalid_method' || code === 'no_route_available') {
      return 'Ce réseau mobile money est temporairement indisponible ou inactif pour ce pays (422).'
    }
    if (code === 'transfer_already_pending') {
      return 'Un transfert inter-wallet est déjà en attente de validation pour ce marchand (422 transfer_already_pending).'
    }
    if (code === 'same_country') {
      return 'Le pays source et le pays cible du transfert doivent être différents (422 same_country).'
    }
    if (code === 'wallet_frozen') {
      return 'Ce portefeuille est temporairement gelé pour les sorties (422 wallet_frozen).'
    }
    return rawMessage || 'Opération impossible en l’état (422).'
  }
  if (status === 429) {
    return 'Limite de débit SasPay atteinte (429). Veuillez patienter quelques secondes avant de réessayer.'
  }
  if (fieldErrors && typeof fieldErrors === 'object') {
    const first = Object.entries(fieldErrors)
      .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(', ') : String(v)}`)
      .join(' · ')
    if (first) return `Paramètres invalides (${first}).`
  }
  return rawMessage || `Erreur SasPay (${status}).`
}

export async function saspayRequest({
  method = 'GET',
  path,
  body,
  idempotencyKey,
  requireAuth = true
}) {
  const cfg = await ensureSaspayConfig()
  if (requireAuth && !cfg.configured) {
    return {
      ok: false,
      status: 503,
      errorCode: 'saspay_not_configured',
      error: 'La clé serveur SASPAY_API_KEY (sk_test_... ou sk_live_...) n’est pas encore configurée.'
    }
  }

  // Respect du backoff 429 (ne jamais boucler sur un 429)
  const now = Date.now()
  if (rateLimitUntilMs > now) {
    const waitSec = Math.max(1, Math.ceil((rateLimitUntilMs - now) / 1000))
    return {
      ok: false,
      status: 429,
      retryAfterSec: waitSec,
      errorCode: 'rate_limited',
      error: `Limite de débit SasPay active. Patientez ${waitSec}s avant un nouvel appel.`
    }
  }

  const cleanPath = path.startsWith('/') ? path : `/${path}`
  const url = `${SASPAY_BASE_URL}${cleanPath}`

  const headers = {
    Accept: 'application/json'
  }
  if (requireAuth) {
    headers.Authorization = `Bearer ${cfg.apiKey}`
  }
  if (body !== undefined) {
    headers['Content-Type'] = 'application/json'
  }
  if (idempotencyKey) {
    headers['Idempotency-Key'] = String(idempotencyKey).trim()
  }

  let resp
  try {
    resp = await fetch(url, {
      method: method.toUpperCase(),
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined
    })
  } catch {
    return {
      ok: false,
      status: 502,
      errorCode: 'network_error',
      error: 'Impossible de joindre l’API SasPay. Réessayez avec la même clé d’idempotence.'
    }
  }

  if (resp.status === 429) {
    const retryHeader = Number(resp.headers.get('retry-after') || '0')
    const waitSec = retryHeader > 0 ? Math.min(120, retryHeader) : 10
    rateLimitUntilMs = Date.now() + waitSec * 1000
  }

  const payload = await resp.json().catch(() => ({}))

  // Désencapsulation de l'enveloppe SasPay : {"success": true, "data": {...}, "code": 200}
  if (resp.ok && payload?.success !== false) {
    const data = payload && typeof payload === 'object' && 'data' in payload && payload.data !== undefined
      ? payload.data
      : payload
    return {
      ok: true,
      status: resp.status,
      data
    }
  }

  const errObj = payload?.error && typeof payload.error === 'object' ? payload.error : payload
  const errorCode = String(errObj?.code || '').trim() || `http_${resp.status}`
  const rawMessage = String(errObj?.message || payload?.detail || '').trim()
  const fieldErrors = (!errObj?.message && !payload?.detail && typeof payload === 'object') ? payload : null

  return {
    ok: false,
    status: resp.status,
    errorCode,
    error: translateSaspayError(resp.status, errorCode, rawMessage, fieldErrors),
    details: fieldErrors
  }
}

/* ============================================================================
   ENDPOINTS OFFICIELS SASPAY (CONFORMES À /api-reference/openapi.json)
   ============================================================================ */

// POST /payments/softpay/ (Idempotency-Key obligatoire)
export async function initiateSoftpay({
  idempotencyKey,
  amount,
  currency = 'XOF',
  country,
  network,
  description,
  customer,
  feeChargeMode,
  preferredGateway,
  otp,
  returnUrl,
  metadata
}) {
  const key = normalizeIdempotencyKey(idempotencyKey, 'softpay')
  const formattedAmount = formatSaspayAmount(amount)
  const netCode = String(network || '').trim()

  const payload = {
    amount: formattedAmount,
    currency: String(currency || 'XOF').trim().toUpperCase(),
    country: String(country || 'ML').trim().toUpperCase(),
    network: netCode,
    customer: {
      email: String(customer?.email || '').trim(),
      first_name: String(customer?.first_name || 'Client').trim(),
      last_name: String(customer?.last_name || 'Kora').trim(),
      phone: String(customer?.phone || '+22370000000').trim()
    }
  }

  if (description) payload.description = String(description).trim().slice(0, 200)
  if (feeChargeMode === 'ADD_ON' || feeChargeMode === 'DEDUCTED') payload.fee_charge_mode = feeChargeMode
  if (preferredGateway) payload.preferred_gateway = String(preferredGateway).trim()
  if (otp) payload.otp = String(otp).trim()
  if (metadata && typeof metadata === 'object') payload.metadata = metadata
  if (returnUrl || netCode === 'card' || netCode === 'crypto') {
    const cfg = getSaspayConfig()
    const fallbackReturn = cfg.appUrl ? `${cfg.appUrl}/#/abonnement` : 'https://kora-five-xi.vercel.app/#/abonnement'
    payload.return_url = String(returnUrl || fallbackReturn).trim()
  }

  return saspayRequest({
    method: 'POST',
    path: '/payments/softpay/',
    idempotencyKey: key,
    body: payload
  })
}

// GET /payments/{payment_id}/verify/
export async function verifyPayment(paymentId) {
  const id = String(paymentId || '').trim()
  if (!id) return { ok: false, status: 400, errorCode: 'missing_payment_id', error: 'Identifiant de paiement manquant.' }
  return saspayRequest({
    method: 'GET',
    path: `/payments/${encodeURIComponent(id)}/verify/`
  })
}

// POST /payments/{payment_id}/confirm-otp/
export async function confirmPaymentOtp(paymentId, otp) {
  const id = String(paymentId || '').trim()
  const cleanOtp = String(otp || '').trim()
  if (!id || !cleanOtp) {
    return { ok: false, status: 400, errorCode: 'missing_otp', error: 'Identifiant de paiement et code OTP requis.' }
  }
  return saspayRequest({
    method: 'POST',
    path: `/payments/${encodeURIComponent(id)}/confirm-otp/`,
    body: { otp: cleanOtp }
  })
}

// POST /payments/{payment_id}/retry/ (Idempotency-Key obligatoire)
export async function retryPayment(paymentId, { idempotencyKey, methods, customer, preferredGateway } = {}) {
  const id = String(paymentId || '').trim()
  if (!id) return { ok: false, status: 400, errorCode: 'missing_payment_id', error: 'Identifiant de paiement manquant.' }
  const key = normalizeIdempotencyKey(idempotencyKey, `retry-${id}`)
  const body = {}
  if (Array.isArray(methods) && methods.length) body.methods = methods.map(m => String(m).trim())
  if (customer && typeof customer === 'object') body.customer = customer
  if (preferredGateway) body.preferred_gateway = String(preferredGateway).trim()

  return saspayRequest({
    method: 'POST',
    path: `/payments/${encodeURIComponent(id)}/retry/`,
    idempotencyKey: key,
    body
  })
}

// POST /checkout-sessions/ (Attention : Idempotency-Key non pris en charge sur cet endpoint selon OpenAPI)
export async function createCheckoutSession({
  amount,
  currency = 'XOF',
  description,
  country,
  customerEmail,
  customerName,
  customerPhone,
  returnUrl,
  metadata,
  feeChargeMode,
  expiresAt
}) {
  const payload = {
    amount: formatSaspayAmount(amount),
    currency: String(currency || 'XOF').trim().toUpperCase(),
    customer_email: String(customerEmail || '').trim(),
    customer_name: String(customerName || 'Client Kora').trim()
  }
  if (description) payload.description = String(description).trim().slice(0, 200)
  if (country && VALID_COUNTRY_ISO(country)) payload.country = String(country).trim().toUpperCase()
  if (customerPhone) payload.customer_phone = String(customerPhone).trim()
  if (returnUrl) payload.return_url = String(returnUrl).trim()
  if (metadata && typeof metadata === 'object') payload.metadata = metadata
  if (feeChargeMode === 'ADD_ON' || feeChargeMode === 'DEDUCTED') payload.fee_charge_mode = feeChargeMode
  if (expiresAt) payload.expires_at = String(expiresAt).trim()

  return saspayRequest({
    method: 'POST',
    path: '/checkout-sessions/',
    body: payload
  })
}

// GET /checkout-sessions/{id}/status/
export async function getCheckoutSessionStatus(sessionId) {
  const id = String(sessionId || '').trim()
  if (!id) return { ok: false, status: 400, errorCode: 'missing_session_id', error: 'Identifiant de session manquant.' }
  return saspayRequest({
    method: 'GET',
    path: `/checkout-sessions/${encodeURIComponent(id)}/status/`
  })
}

// POST /checkout-sessions/{id}/cancel/
export async function cancelCheckoutSession(sessionId) {
  const id = String(sessionId || '').trim()
  if (!id) return { ok: false, status: 400, errorCode: 'missing_session_id', error: 'Identifiant de session manquant.' }
  return saspayRequest({
    method: 'POST',
    path: `/checkout-sessions/${encodeURIComponent(id)}/cancel/`
  })
}

// POST /payouts/initialize/ (Idempotency-Key obligatoire + IP serveur whitelistée)
export async function initializePayout({
  idempotencyKey,
  amount,
  currency,
  country,
  customer,
  method,
  recipientMsisdn,
  description,
  metadata,
  feeChargeMode,
  preferredGateway
}) {
  const key = normalizeIdempotencyKey(idempotencyKey, 'payout')
  const iso = String(country || '').trim().toUpperCase()
  const curr = String(currency || '').trim().toUpperCase()

  // Vérification préventive : pas de conversion automatique sur les retraits
  const catalogCountry = SASPAY_CATALOG[iso]
  if (catalogCountry && catalogCountry.currency !== curr) {
    return {
      ok: false,
      status: 422,
      errorCode: 'currency_country_mismatch',
      error: `La devise ${curr} ne correspond pas au pays ${iso} (${catalogCountry.currency} attendu : aucune conversion automatique sur les retraits).`
    }
  }

  const payload = {
    amount: formatSaspayAmount(amount),
    currency: curr,
    country: iso,
    customer: {
      ...(customer?.email ? { email: String(customer.email).trim() } : {}),
      ...(customer?.first_name ? { first_name: String(customer.first_name).trim() } : {}),
      ...(customer?.last_name ? { last_name: String(customer.last_name).trim() } : {}),
      phone: String(customer?.phone || recipientMsisdn || '').trim()
    },
    method: String(method || '').trim(),
    recipient: {
      msisdn: String(recipientMsisdn || '').trim()
    }
  }
  if (description) payload.description = String(description).trim().slice(0, 200)
  if (metadata && typeof metadata === 'object') payload.metadata = metadata
  if (feeChargeMode === 'ADD_ON' || feeChargeMode === 'DEDUCTED') payload.fee_charge_mode = feeChargeMode
  if (preferredGateway) payload.preferred_gateway = String(preferredGateway).trim()

  return saspayRequest({
    method: 'POST',
    path: '/payouts/initialize/',
    idempotencyKey: key,
    body: payload
  })
}

// GET /payouts/{payout_id}/verify/
export async function verifyPayout(payoutId) {
  const id = String(payoutId || '').trim()
  if (!id) return { ok: false, status: 400, errorCode: 'missing_payout_id', error: 'Identifiant de retrait manquant.' }
  return saspayRequest({
    method: 'GET',
    path: `/payouts/${encodeURIComponent(id)}/verify/`
  })
}

// POST /wallet-transfers/ (Idempotency-Key obligatoire)
export async function createWalletTransfer({ idempotencyKey, fromCountry, toCountry, fromAmount }) {
  const key = normalizeIdempotencyKey(idempotencyKey, 'wtransfer')
  return saspayRequest({
    method: 'POST',
    path: '/wallet-transfers/',
    idempotencyKey: key,
    body: {
      from_country: String(fromCountry || '').trim().toUpperCase(),
      to_country: String(toCountry || '').trim().toUpperCase(),
      from_amount: formatSaspayAmount(fromAmount)
    }
  })
}

// GET /wallet-transfers/
export async function listWalletTransfers({ page = 1, pageSize = 20, status, fromCountry, toCountry } = {}) {
  const qs = new URLSearchParams({ page: String(page), page_size: String(Math.min(100, pageSize)) })
  if (status) qs.set('status', String(status))
  if (fromCountry) qs.set('from_country', String(fromCountry))
  if (toCountry) qs.set('to_country', String(toCountry))
  return saspayRequest({
    method: 'GET',
    path: `/wallet-transfers/?${qs.toString()}`
  })
}

// GET /countries/ (public)
export async function listCountries() {
  return saspayRequest({
    method: 'GET',
    path: '/countries/',
    requireAuth: false
  })
}

// GET /networks/ (authentifié, paginé)
export async function listNetworks({ page = 1, pageSize = 100 } = {}) {
  return saspayRequest({
    method: 'GET',
    path: `/networks/?page=${Number(page) || 1}&page_size=${Math.min(100, Number(pageSize) || 100)}`
  })
}

// GET /pricing/my-rates/ (authentifié)
export async function getMyRates() {
  return saspayRequest({
    method: 'GET',
    path: '/pricing/my-rates/'
  })
}

/* ============================================================================
   VÉRIFICATION CRYPTOGRAPHIQUE DES WEBHOOKS SASPAY
   ============================================================================ */
export function verifySaspayWebhook({ rawBody, signatureHeader, timestampHeader, secret }) {
  const signingSecret = String(secret || process.env.SASPAY_WEBHOOK_SECRET || vaultCache?.webhook_secret || '').trim()
  if (!signingSecret) {
    return { valid: false, reason: 'SASPAY_WEBHOOK_SECRET non configuré.' }
  }
  const sig = String(signatureHeader || '').trim().toLowerCase()
  const tsRaw = String(timestampHeader || '').trim()
  if (!sig || !tsRaw || !/^\d+$/.test(tsRaw)) {
    return { valid: false, reason: 'En-têtes X-Webhook-Signature ou X-Webhook-Timestamp manquants ou invalides.' }
  }

  const ts = Number(tsRaw)
  const now = Math.floor(Date.now() / 1000)
  if (Math.abs(now - ts) > WEBHOOK_TOLERANCE_SECONDS) {
    return { valid: false, reason: 'Horodatage X-Webhook-Timestamp hors tolérance (> 300 secondes).' }
  }

  const bodyStr = Buffer.isBuffer(rawBody) ? rawBody.toString('utf8') : String(rawBody ?? '')
  const expected = crypto
    .createHmac('sha256', signingSecret)
    .update(`${tsRaw}.${bodyStr}`, 'utf8')
    .digest('hex')

  const a = Buffer.from(sig, 'utf8')
  const b = Buffer.from(expected, 'utf8')
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return { valid: false, reason: 'Signature X-Webhook-Signature invalide.' }
  }

  return { valid: true }
}
