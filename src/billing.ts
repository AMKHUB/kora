// Gestion du mode de facturation Kora (piloté côté serveur par BILLING_MODE = 'simulation' | 'live').
// Aucune clé API ni variable d'environnement sensible dans le front-end.

import { apiPost } from './api'

export type BillingMode = 'simulation' | 'live'

export type CheckoutRequest = {
  planId: 'premium' | 'family'
  billing: 'month' | 'year'
  provider: 'Orange Money' | 'Moov Money' | 'Wave' | 'Carte bancaire'
  customerRef: string
}

export type CheckoutResult =
  | { ok: true; reference: string; redirectUrl?: string }
  | { ok: false; error: string }

export async function processPaymentCheckout(req: CheckoutRequest, isSimulation: boolean): Promise<CheckoutResult> {
  if (isSimulation) {
    return { ok: true, reference: `SIM-${Date.now().toString(36).toUpperCase()}` }
  }
  const res = await apiPost<{ reference?: string; redirectUrl?: string }>('/api/checkout', req)
  if (!res.ok) {
    return {
      ok: false,
      error: res.data.error || 'Paiement requis : la passerelle de paiement n’est pas encore activée côté serveur.'
    }
  }
  return {
    ok: true,
    reference: res.data.reference || `PAY-${Date.now().toString(36).toUpperCase()}`,
    redirectUrl: res.data.redirectUrl
  }
}
