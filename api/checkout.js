import {
  assertCsrf,
  enforceRateLimit,
  getSessionContext,
  readJsonBody,
  safeError,
  sendJson
} from '../server/supabaseServer.js'

// Endpoint serveur de paiement pour Kora (actif lorsque BILLING_MODE=live).
// En production réelle, initialise une session auprès d'Orange Money, Moov Money, Wave ou Stripe
// et ne valide jamais un abonnement côté client sans webhook signé par le prestataire.
const PLAN_PRICES_XOF = {
  premium: { month: 2500, year: 25000 },
  family: { month: 4500, year: 45000 }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return sendJson(res, 405, { error: 'Méthode non autorisée.' })
  }
  if (!assertCsrf(req, res)) return

  const ctx = await getSessionContext(req, res)
  if (!ctx.user) return sendJson(res, 401, { error: 'Connexion requise pour effectuer un paiement.' })
  if (!enforceRateLimit(req, res, 'checkout', 10, 10 * 60_000, ctx.user.id)) return

  let body
  try { body = await readJsonBody(req) } catch (e) { return safeError(res, e.status || 400, 'Requête invalide.', e) }

  const { planId, billing, provider } = body || {}
  const amountXof = PLAN_PRICES_XOF[planId]?.[billing]
  if (!amountXof) return sendJson(res, 400, { error: 'Formule ou périodicité invalide.' })
  if (!['Orange Money', 'Moov Money', 'Wave', 'Carte bancaire'].includes(provider)) {
    return sendJson(res, 400, { error: 'Moyen de paiement non pris en charge.' })
  }

  return sendJson(res, 501, {
    error: `Paiement obligatoire (${amountXof.toLocaleString('fr-FR')} FCFA via ${provider}). Configurez les clés marchands et webhooks côté serveur pour activer les paiements réels.`,
    amount_xof: amountXof,
    currency: 'XOF',
    provider
  })
}
