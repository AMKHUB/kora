// Client interne pour la facturation SasPay (piloté exclusivement côté serveur par /api/checkout).
// Aucune clé API SasPay (sk_test_ / sk_live_) ni secret webhook dans le front-end.

import { apiGet, apiPost } from './api'

export type BillingMode = 'simulation' | 'live'

export type SaspayNetworkOption = {
  code: string
  label: string
  provider: string
  otpPreRequired?: boolean
  otpInstructions?: string
  postOtpConfirm?: boolean
}

export type SaspayCountryOption = {
  iso: string
  name: string
  currency: string
  dialCode: string
  networks: SaspayNetworkOption[]
}

export const SASPAY_COUNTRIES: SaspayCountryOption[] = [
  {
    iso: 'ML',
    name: 'Mali',
    currency: 'XOF',
    dialCode: '+223',
    networks: [
      { code: 'orange_ml', label: 'Orange Money Mali', provider: 'Orange Money' },
      { code: 'moov_ml', label: 'Moov Money Mali', provider: 'Moov Money' },
      { code: 'mobi_cash_ml', label: 'Mobi Cash Mali', provider: 'Mobi Cash' }
    ]
  },
  {
    iso: 'SN',
    name: 'Sénégal',
    currency: 'XOF',
    dialCode: '+221',
    networks: [
      { code: 'wave_sn', label: 'Wave Sénégal', provider: 'Wave' },
      { code: 'orange_sn', label: 'Orange Money Sénégal', provider: 'Orange Money' },
      { code: 'freemoney_sn', label: 'Free Money Sénégal', provider: 'Free Money' },
      { code: 'wizall_sn', label: 'Wizall Sénégal', provider: 'Wizall', postOtpConfirm: true }
    ]
  },
  {
    iso: 'CI',
    name: 'Côte d’Ivoire',
    currency: 'XOF',
    dialCode: '+225',
    networks: [
      { code: 'wave_ci', label: 'Wave Côte d’Ivoire', provider: 'Wave' },
      {
        code: 'orange_ci',
        label: 'Orange Money CI',
        provider: 'Orange Money',
        otpPreRequired: true,
        otpInstructions: 'Composez #144*82# sur votre téléphone pour obtenir votre code OTP avant de valider.'
      },
      { code: 'mtn_ci', label: 'MTN MoMo CI', provider: 'MTN MoMo' },
      { code: 'moov_ci', label: 'Moov Money CI', provider: 'Moov Money' }
    ]
  },
  {
    iso: 'BF',
    name: 'Burkina Faso',
    currency: 'XOF',
    dialCode: '+226',
    networks: [
      {
        code: 'orange_bf',
        label: 'Orange Burkina Faso',
        provider: 'Orange Money',
        otpPreRequired: true,
        otpInstructions: 'Générez votre code OTP Orange Money par USSD sur votre téléphone avant de valider.'
      },
      { code: 'moov_bf', label: 'Moov Burkina Faso', provider: 'Moov Money' }
    ]
  },
  {
    iso: 'BJ',
    name: 'Bénin',
    currency: 'XOF',
    dialCode: '+229',
    networks: [
      { code: 'mtn_bj', label: 'MTN MoMo Bénin', provider: 'MTN MoMo' },
      { code: 'moov_bj', label: 'Moov Money Bénin', provider: 'Moov Money' },
      { code: 'celtiis_bj', label: 'Celtiis Cash Bénin', provider: 'Celtiis' }
    ]
  },
  {
    iso: 'TG',
    name: 'Togo',
    currency: 'XOF',
    dialCode: '+228',
    networks: [
      { code: 'moov_tg', label: 'Moov Money Togo', provider: 'Moov Money' },
      { code: 'togocel', label: 'Togocel Money', provider: 'Togocel' }
    ]
  },
  {
    iso: 'NE',
    name: 'Niger',
    currency: 'XOF',
    dialCode: '+227',
    networks: [
      { code: 'airtel_ne', label: 'Airtel Niger', provider: 'Airtel Money' }
    ]
  },
  {
    iso: 'CM',
    name: 'Cameroun',
    currency: 'XAF',
    dialCode: '+237',
    networks: [
      { code: 'mtn_cm', label: 'MTN MoMo Cameroun', provider: 'MTN MoMo' },
      { code: 'orange_cm', label: 'Orange Money Cameroun', provider: 'Orange Money' }
    ]
  },
  {
    iso: 'GN',
    name: 'Guinée',
    currency: 'GNF',
    dialCode: '+224',
    networks: [
      { code: 'mtn_gn', label: 'MTN MoMo Guinée', provider: 'MTN MoMo' }
    ]
  }
]

export type CheckoutRequest = {
  planId: 'premium' | 'family'
  billing: 'month' | 'year'
  provider: string
  customerRef: string
  countryIso?: string
  networkCode?: string
  otp?: string
  flow?: 'softpay' | 'hosted'
  idempotencyKey?: string
}

export type CheckoutInitResult =
  | {
      ok: true
      simulated?: boolean
      flow: 'softpay' | 'hosted'
      paymentId?: string
      sessionId?: string
      status: 'PENDING' | 'SUCCESS'
      checkoutUrl?: string
      requiresRedirect?: boolean
      idempotencyKey?: string
      reference: string
    }
  | {
      ok: false
      error: string
      code?: string
      otpRequired?: boolean
      otpInstructions?: string
    }

export type VerifyPaymentResult = {
  ok: boolean
  status: 'PENDING' | 'SUCCESS' | 'FAILED' | 'CANCELLED' | 'EXPIRED'
  delivered: boolean
  paymentId?: string
  reference?: string
  charged?: string | null
  net_amount?: string | null
  currency?: string
  canRetry?: boolean
  error?: string
}

export function createIntentIdempotencyKey(prefix = 'kora'): string {
  const uid = typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
  return `${prefix}-${uid}`
}

export async function processPaymentCheckout(req: CheckoutRequest, isSimulation: boolean): Promise<CheckoutInitResult> {
  if (isSimulation) {
    return {
      ok: true,
      simulated: true,
      flow: 'softpay',
      status: 'SUCCESS',
      reference: `SIM-${Date.now().toString(36).toUpperCase()}`
    }
  }

  const res = await apiPost<any>('/api/checkout', req)
  if (!res.ok) {
    return {
      ok: false,
      error: res.data.error || 'Paiement refusé ou passerelle SasPay non configurée côté serveur.',
      code: res.data.code,
      otpRequired: Boolean(res.data.otpRequired),
      otpInstructions: res.data.otpInstructions
    }
  }

  return {
    ok: true,
    flow: res.data.flow === 'hosted' ? 'hosted' : 'softpay',
    paymentId: res.data.paymentId,
    sessionId: res.data.sessionId,
    status: 'PENDING',
    checkoutUrl: res.data.checkoutUrl || '',
    requiresRedirect: Boolean(res.data.requiresRedirect && res.data.checkoutUrl),
    idempotencyKey: res.data.idempotencyKey || req.idempotencyKey,
    reference: res.data.paymentId || res.data.sessionId || `PAY-${Date.now().toString(36).toUpperCase()}`
  }
}

export async function verifySaspayPayment(params: { paymentId?: string; sessionId?: string }): Promise<VerifyPaymentResult> {
  const res = await apiPost<any>('/api/checkout?action=verify', params)
  if (!res.ok) {
    return {
      ok: false,
      status: 'PENDING',
      delivered: false,
      error: res.data.error || 'Impossible de vérifier le paiement auprès de SasPay.'
    }
  }
  return {
    ok: true,
    status: (res.data.status || 'PENDING') as VerifyPaymentResult['status'],
    delivered: Boolean(res.data.delivered),
    paymentId: res.data.paymentId,
    reference: res.data.reference,
    charged: res.data.charged,
    net_amount: res.data.net_amount,
    currency: res.data.currency || 'XOF',
    canRetry: Boolean(res.data.canRetry)
  }
}

export async function confirmSaspayPaymentOtp(paymentId: string, otp: string): Promise<VerifyPaymentResult> {
  const res = await apiPost<any>('/api/checkout?action=confirm-otp', { paymentId, otp })
  if (!res.ok) {
    return {
      ok: false,
      status: 'PENDING',
      delivered: false,
      error: res.data.error || 'Échec de la confirmation du code OTP.'
    }
  }
  return {
    ok: true,
    status: (res.data.status || 'PENDING') as VerifyPaymentResult['status'],
    delivered: Boolean(res.data.delivered),
    paymentId: res.data.paymentId
  }
}

export async function retrySaspayPayment(params: {
  paymentId: string
  idempotencyKey: string
  methods?: string[]
}): Promise<{ ok: boolean; checkoutUrl?: string; requiresRedirect?: boolean; error?: string }> {
  const res = await apiPost<any>('/api/checkout?action=retry', params)
  if (!res.ok) {
    return { ok: false, error: res.data.error || 'Impossible de relancer ce paiement.' }
  }
  return {
    ok: true,
    checkoutUrl: res.data.checkoutUrl || '',
    requiresRedirect: Boolean(res.data.requiresRedirect && res.data.checkoutUrl)
  }
}

export async function fetchSaspayConfig() {
  return apiGet<{
    configured: boolean
    webhookConfigured: boolean
    mode: 'test' | 'live' | 'unconfigured'
    baseUrl: string
  }>('/api/checkout?action=config')
}
