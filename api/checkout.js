// Endpoint serveur de paiement pour Kora (actif lorsque VITE_BILLING_MODE=live).
// En production réelle, cet endpoint initialise une session auprès d'Orange Money, Moov Money, Wave ou Stripe
// et ne valide jamais un abonnement côté client sans webhook signé par le prestataire.
const PLAN_PRICES_XOF = {
  premium: { month: 2500, year: 25000 },
  family: { month: 4500, year: 45000 }
}

export default function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ error: 'Méthode non autorisée' })
  }
  const { planId, billing, provider } = req.body || {}
  const amountXof = PLAN_PRICES_XOF[planId]?.[billing]
  if (!amountXof) {
    return res.status(400).json({ error: 'Formule ou périodicité invalide.' })
  }
  if (!['Orange Money', 'Moov Money', 'Wave', 'Carte bancaire'].includes(provider)) {
    return res.status(400).json({ error: 'Moyen de paiement non pris en charge.' })
  }

  // En attendant les clés marchands (ORANGE_MONEY_API_KEY, WAVE_API_KEY, STRIPE_SECRET_KEY),
  // le serveur refuse toute activation sans preuve de paiement vérifiée.
  return res.status(501).json({
    error: `Paiement obligatoire (${amountXof.toLocaleString('fr-FR')} FCFA via ${provider}). Configurez les clés marchands et webhooks côté serveur pour activer les paiements réels.`,
    amount_xof: amountXof,
    currency: 'XOF',
    provider
  })
}
