// Gestion du mode de facturation Kora :
// - 'simulation' (par défaut en développement/test) : permet d'activer gratuitement un abonnement sans paiement réel.
// - 'live' (production finale) : interdit toute activation gratuite côté client et impose un paiement vérifié côté serveur
//   (Orange Money, Moov Money, Wave ou Carte bancaire via Stripe / passerelle agrégateur).

export type BillingMode = 'simulation' | 'live'

export const BILLING_MODE: BillingMode =
  (import.meta.env.VITE_BILLING_MODE as BillingMode) === 'live' ? 'live' : 'simulation'

export const IS_BILLING_SIMULATION = BILLING_MODE === 'simulation'

export type CheckoutRequest = {
  planId: 'premium' | 'family'
  billing: 'month' | 'year'
  provider: 'Orange Money' | 'Moov Money' | 'Wave' | 'Carte bancaire'
  customerRef: string
}

export type CheckoutResult =
  | { ok: true; reference: string; redirectUrl?: string }
  | { ok: false; error: string }

/**
 * En mode 'live', appelle l'endpoint serveur /api/checkout (qui vérifie la transaction auprès du prestataire
 * avant d'activer la ligne dans public.subscriptions via webhook signé).
 * En mode 'simulation', renvoie une confirmation locale sans débit réel.
 */
export async function processPaymentCheckout(req: CheckoutRequest): Promise<CheckoutResult> {
  if (IS_BILLING_SIMULATION) {
    return { ok: true, reference: `SIM-${Date.now().toString(36).toUpperCase()}` }
  }
  try {
    const res = await fetch('/api/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req)
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      return {
        ok: false,
        error: data.error || 'Paiement requis : la passerelle de paiement n’est pas encore activée côté serveur.'
      }
    }
    return { ok: true, reference: data.reference || `PAY-${Date.now().toString(36).toUpperCase()}`, redirectUrl: data.redirectUrl }
  } catch {
    return {
      ok: false,
      error: 'Impossible de joindre le serveur de paiement. Réessayez dans quelques instants.'
    }
  }
}
