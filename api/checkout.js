import {
  assertCsrf,
  createAnonClient,
  enforceRateLimit,
  getOrigin,
  getQuery,
  getSessionContext,
  readJsonBody,
  readRawBody,
  safeError,
  sendJson
} from '../server/supabaseServer.js'
import {
  cancelCheckoutSession,
  confirmPaymentOtp,
  createCheckoutSession,
  createWalletTransfer,
  ensureSaspayConfig,
  formatSaspayAmount,
  getCheckoutSessionStatus,
  getMyRates,
  getSaspayConfig,
  initializePayout,
  initiateSoftpay,
  listCountries,
  listNetworks,
  listWalletTransfers,
  normalizeIdempotencyKey,
  resolveSaspayNetwork,
  retryPayment,
  SASPAY_BFF_GATE,
  SASPAY_CATALOG,
  SASPAY_WEBHOOK_EVENTS,
  splitCustomerName,
  verifyPayment,
  verifyPayout,
  verifySaspayWebhook
} from '../server/saspay.js'

// Désactive le bodyParser automatique de Vercel pour préserver les octets bruts du corps sur les webhooks SasPay
export const config = {
  api: {
    bodyParser: false
  }
}

const PLAN_PRICES_XOF = {
  premium: { month: 2500, year: 25000, label: 'Premium' },
  family: { month: 4500, year: 45000, label: 'Famille & Cinéma' }
}

export default async function handler(req, res) {
  await ensureSaspayConfig()
  const q = getQuery(req)
  const action = q.get('action') || ''
  const hasWebhookSig = Boolean(req.headers?.['x-webhook-signature'] || req.headers?.['x-webhook-timestamp'])

  /* ==========================================================================
     1. WEBHOOK SASPAY (Corps brut + X-Webhook-Signature + X-Webhook-Timestamp)
     ========================================================================== */
  if (action === 'webhook' || hasWebhookSig) {
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST')
      return sendJson(res, 405, { error: 'Méthode non autorisée.' })
    }

    let rawBody = ''
    try {
      rawBody = await readRawBody(req)
    } catch (e) {
      return safeError(res, e.status || 400, 'Impossible de lire le corps brut du webhook.', e)
    }

    const sigHeader = req.headers?.['x-webhook-signature']
    const tsHeader = req.headers?.['x-webhook-timestamp']
    const ver = verifySaspayWebhook({
      rawBody,
      signatureHeader: sigHeader,
      timestampHeader: tsHeader
    })

    if (!ver.valid) {
      return sendJson(res, 403, { error: ver.reason || 'Signature webhook SasPay invalide.' })
    }

    let payload
    try {
      payload = JSON.parse(rawBody)
    } catch {
      return sendJson(res, 400, { error: 'Corps JSON du webhook invalide.' })
    }

    const eventType = String(req.headers?.['x-webhook-event'] || payload?.event || '').trim()
    if (!SASPAY_WEBHOOK_EVENTS.has(eventType)) {
      return sendJson(res, 400, { error: `Événement webhook inconnu : ${eventType}` })
    }

    if (eventType === 'webhook.test') {
      return sendJson(res, 200, { received: true, event: 'webhook.test' })
    }

    const data = payload?.data && typeof payload.data === 'object' ? payload.data : {}
    const txId = String(data.id || '').trim()
    const eventKey = `${eventType}:${txId || 'noid'}:${String(data.status || '')}`
    const anon = createAnonClient()

    if (eventType.startsWith('transaction.') && txId && anon) {
      // Conformément à la règle SasPay : on ne livre que lorsque GET /payments/{payment_id}/verify/ renvoie SUCCESS
      let verifiedStatus = String(data.status || '').toUpperCase()
      let chargedAmount = data.charged ? String(data.charged) : null
      let netAmount = data.net_amount ? String(data.net_amount) : null
      let feeAmount = data.fee ? String(data.fee) : null
      let feeChargeMode = data.fee_charge_mode ? String(data.fee_charge_mode) : null
      let currency = data.currency ? String(data.currency) : 'XOF'
      let externalRef = data.reference ? String(data.reference) : null

      if (eventType === 'transaction.success' && getSaspayConfig().configured) {
        const check = await verifyPayment(txId)
        if (check.ok && check.data) {
          verifiedStatus = String(check.data.status || '').toUpperCase()
          chargedAmount = check.data.debited_amount ? String(check.data.debited_amount) : chargedAmount
          netAmount = check.data.net_amount ? String(check.data.net_amount) : netAmount
          feeAmount = check.data.client_fee ? String(check.data.client_fee) : feeAmount
          feeChargeMode = check.data.fee_charge_mode ? String(check.data.fee_charge_mode) : feeChargeMode
          currency = check.data.currency ? String(check.data.currency) : currency
          externalRef = check.data.external_reference || check.data.reference || externalRef
        }
      } else if (eventType === 'transaction.failed') {
        verifiedStatus = 'FAILED'
      } else if (eventType === 'transaction.cancelled') {
        verifiedStatus = 'CANCELLED'
      }

      await anon.rpc('saspay_apply_verified_transaction', {
        p_gate_secret: SASPAY_BFF_GATE,
        p_payment_id: txId,
        p_saspay_status: verifiedStatus,
        p_charged_amount: chargedAmount,
        p_net_amount: netAmount,
        p_fee_amount: feeAmount,
        p_fee_charge_mode: feeChargeMode,
        p_currency: currency,
        p_external_reference: externalRef,
        p_event_key: eventKey,
        p_raw_payload: payload
      })
    }

    // Les événements settlement.* et wallet_transfer.* sont accusés en 200 OK de façon idempotente
    // sans dépendre d'une forme figée de data sur settlement.* (conformément à la documentation SasPay).
    return sendJson(res, 200, { received: true, event: eventType })
  }

  /* ==========================================================================
     2. REQUÊTES GET (Catalogue pays/réseaux, tarifs my-rates, vérification)
     ========================================================================== */
  if (req.method === 'GET') {
    if (action === 'config') {
      const cfg = getSaspayConfig()
      return sendJson(res, 200, {
        configured: cfg.configured,
        webhookConfigured: cfg.webhookConfigured,
        mode: cfg.mode,
        baseUrl: cfg.baseUrl,
        catalog: SASPAY_CATALOG
      })
    }

    if (action === 'countries') {
      if (!enforceRateLimit(req, res, 'saspay_countries', 30, 60_000)) return
      const r = await listCountries()
      return sendJson(res, r.ok ? 200 : r.status, r.ok ? { countries: r.data } : { error: r.error, code: r.errorCode })
    }

    const ctx = await getSessionContext(req, res)
    if (!ctx.user || !ctx.sb) return sendJson(res, 401, { error: 'Connexion requise.' })

    if (action === 'my-rates') {
      if (!enforceRateLimit(req, res, 'saspay_rates', 20, 60_000, ctx.user.id)) return
      const r = await getMyRates()
      return sendJson(res, r.ok ? 200 : r.status, r.ok ? { rates: r.data } : { error: r.error, code: r.errorCode })
    }

    if (action === 'networks') {
      if (!enforceRateLimit(req, res, 'saspay_networks', 20, 60_000, ctx.user.id)) return
      const r = await listNetworks({ page: q.get('page') || 1, pageSize: q.get('page_size') || 100 })
      return sendJson(res, r.ok ? 200 : r.status, r.ok ? r.data : { error: r.error, code: r.errorCode })
    }

    if (action === 'payouts') {
      const { data, error } = await ctx.sb
        .from('saspay_payouts')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(30)
      if (error) return safeError(res, 400, 'Impossible de charger les retraits.', error)
      return sendJson(res, 200, { payouts: data || [] })
    }

    if (action === 'wallet-transfers') {
      if (ctx.role !== 'admin') return sendJson(res, 403, { error: 'Réservé aux administrateurs.' })
      const r = await listWalletTransfers({
        page: q.get('page') || 1,
        status: q.get('status') || undefined,
        fromCountry: q.get('from_country') || undefined,
        toCountry: q.get('to_country') || undefined
      })
      return sendJson(res, r.ok ? 200 : r.status, r.ok ? r.data : { error: r.error, code: r.errorCode })
    }

    return sendJson(res, 400, { error: 'Action GET inconnue.' })
  }

  /* ==========================================================================
     3. REQUÊTES POST AUTHENTIFIÉES (Softpay, Checkout Session, Verify, OTP, Retry, Payouts)
     ========================================================================== */
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST')
    return sendJson(res, 405, { error: 'Méthode non autorisée.' })
  }
  if (!assertCsrf(req, res)) return

  const ctx = await getSessionContext(req, res)
  if (!ctx.user || !ctx.sb) return sendJson(res, 401, { error: 'Connexion requise pour effectuer un paiement.' })
  if (!enforceRateLimit(req, res, 'checkout', 25, 10 * 60_000, ctx.user.id)) return

  let body
  try { body = await readJsonBody(req) } catch (e) { return safeError(res, e.status || 400, 'Requête invalide.', e) }

  // 3A. Vérification officielle GET /payments/{payment_id}/verify/ (seul SUCCESS livre l'abonnement)
  if (action === 'verify') {
    let paymentId = String(body.paymentId || '').trim()
    const sessionId = String(body.sessionId || '').trim()

    if (!paymentId && sessionId) {
      const sessRes = await getCheckoutSessionStatus(sessionId)
      if (!sessRes.ok) {
        return sendJson(res, sessRes.status, { error: sessRes.error, code: sessRes.errorCode })
      }
      const sessData = sessRes.data || {}
      if (sessData.transaction_id) {
        paymentId = String(sessData.transaction_id)
      } else {
        return sendJson(res, 200, {
          status: sessData.status === 'PAID' ? 'PENDING' : (sessData.status || 'PENDING'),
          delivered: false,
          message: 'Session en attente de paiement sur la page hébergée SasPay.'
        })
      }
    }

    if (!paymentId) {
      return sendJson(res, 400, { error: 'Identifiant de paiement SasPay requis pour la vérification.' })
    }

    const verRes = await verifyPayment(paymentId)
    if (!verRes.ok) {
      return sendJson(res, verRes.status, { error: verRes.error, code: verRes.errorCode })
    }

    const tx = verRes.data || {}
    const status = String(tx.status || 'PENDING').toUpperCase()
    const charged = tx.debited_amount ? String(tx.debited_amount) : (tx.requested_amount ? String(tx.requested_amount) : null)
    const netAmount = tx.net_amount ? String(tx.net_amount) : null
    const feeAmount = tx.client_fee ? String(tx.client_fee) : null
    const feeMode = tx.fee_charge_mode ? String(tx.fee_charge_mode) : null

    const { data: applied, error: rpcErr } = await ctx.sb.rpc('saspay_apply_verified_transaction', {
      p_gate_secret: SASPAY_BFF_GATE,
      p_payment_id: paymentId,
      p_saspay_status: status,
      p_charged_amount: charged,
      p_net_amount: netAmount,
      p_fee_amount: feeAmount,
      p_fee_charge_mode: feeMode,
      p_currency: tx.currency || 'XOF',
      p_external_reference: tx.external_reference || tx.reference || null,
      p_event_key: null,
      p_raw_payload: null,
      p_session_id: sessionId || null
    })

    if (rpcErr) {
      return safeError(res, 500, 'Erreur lors de la mise à jour de l’abonnement après vérification.', rpcErr)
    }

    return sendJson(res, 200, {
      paymentId,
      reference: tx.reference || paymentId,
      status,
      delivered: status === 'SUCCESS' && Boolean(applied?.delivered),
      charged,
      net_amount: netAmount,
      currency: tx.currency || 'XOF',
      fee_charge_mode: feeMode,
      canRetry: status === 'FAILED'
    })
  }

  // 3B. Confirmation OTP post-push : POST /payments/{payment_id}/confirm-otp/ puis GET /payments/{payment_id}/verify/
  if (action === 'confirm-otp') {
    const paymentId = String(body.paymentId || '').trim()
    const otp = String(body.otp || '').trim()
    const otpRes = await confirmPaymentOtp(paymentId, otp)
    if (!otpRes.ok) {
      return sendJson(res, otpRes.status, { error: otpRes.error, code: otpRes.errorCode })
    }

    // Même après confirm-otp, on vérifie systématiquement avec GET /payments/{payment_id}/verify/ avant de livrer
    const verRes = await verifyPayment(paymentId)
    const tx = verRes.ok ? (verRes.data || {}) : (otpRes.data || {})
    const status = String(tx.status || 'PENDING').toUpperCase()

    let delivered = false
    if (status === 'SUCCESS') {
      const { data: applied } = await ctx.sb.rpc('saspay_apply_verified_transaction', {
        p_gate_secret: SASPAY_BFF_GATE,
        p_payment_id: paymentId,
        p_saspay_status: 'SUCCESS',
        p_charged_amount: tx.debited_amount ? String(tx.debited_amount) : null,
        p_net_amount: tx.net_amount ? String(tx.net_amount) : null,
        p_fee_amount: tx.client_fee ? String(tx.client_fee) : null,
        p_fee_charge_mode: tx.fee_charge_mode ? String(tx.fee_charge_mode) : null,
        p_currency: tx.currency || 'XOF',
        p_external_reference: tx.external_reference || tx.reference || null,
        p_event_key: null,
        p_raw_payload: null
      })
      delivered = Boolean(applied?.delivered)
    }

    return sendJson(res, 200, {
      paymentId,
      status,
      delivered
    })
  }

  // 3C. Relance d'un paiement échoué : POST /payments/{payment_id}/retry/ (avec Idempotency-Key)
  if (action === 'retry') {
    const paymentId = String(body.paymentId || '').trim()
    const idempotencyKey = normalizeIdempotencyKey(body.idempotencyKey, `retry-${paymentId}`)
    const retryRes = await retryPayment(paymentId, {
      idempotencyKey,
      methods: Array.isArray(body.methods) ? body.methods : undefined,
      customer: body.customer,
      preferredGateway: body.preferredGateway
    })
    if (!retryRes.ok) {
      return sendJson(res, retryRes.status, { error: retryRes.error, code: retryRes.errorCode })
    }
    const checkoutUrl = String(retryRes.data?.checkout_url || '').trim()
    return sendJson(res, 200, {
      paymentId: retryRes.data?.id || paymentId,
      status: 'PENDING',
      checkoutUrl,
      requiresRedirect: Boolean(checkoutUrl),
      idempotencyKey
    })
  }

  // 3D. Annulation d'une session de checkout hébergée : POST /checkout-sessions/{id}/cancel/
  if (action === 'cancel-session') {
    const sessionId = String(body.sessionId || '').trim()
    const cancelRes = await cancelCheckoutSession(sessionId)
    if (!cancelRes.ok) {
      return sendJson(res, cancelRes.status, { error: cancelRes.error, code: cancelRes.errorCode })
    }
    return sendJson(res, 200, { ok: true, sessionId })
  }

  // 3E. Initialisation d'un retrait (Payout) : POST /payouts/initialize/ (avec Idempotency-Key + IP whitelistée)
  if (action === 'payout-init') {
    const idempotencyKey = normalizeIdempotencyKey(body.idempotencyKey, `payout-${ctx.user.id.slice(0, 8)}`)
    const country = String(body.country || 'ML').trim().toUpperCase()
    const currency = String(body.currency || SASPAY_CATALOG[country]?.currency || 'XOF').trim().toUpperCase()
    const method = String(body.method || 'orange_ml').trim().toLowerCase()
    const recipientMsisdn = String(body.msisdn || body.recipientMsisdn || '').trim()
    let amountDecimal
    try {
      amountDecimal = formatSaspayAmount(body.amount)
    } catch (e) {
      return sendJson(res, 400, { error: e.message || 'Montant de retrait invalide.' })
    }

    if (!recipientMsisdn) {
      return sendJson(res, 400, { error: 'Le numéro mobile money du bénéficiaire (msisdn) est obligatoire.' })
    }

    const names = splitCustomerName(ctx.user.user_metadata?.full_name || ctx.user.user_metadata?.name, ctx.user.email)
    const description = String(body.description || 'Reversement revenus créateur Kora Studio').trim().slice(0, 180)

    const pRes = await initializePayout({
      idempotencyKey,
      amount: amountDecimal,
      currency,
      country,
      customer: {
        email: ctx.user.email || 'createur@kora.cinema',
        first_name: names.first_name,
        last_name: names.last_name,
        phone: recipientMsisdn
      },
      method,
      recipientMsisdn,
      description,
      feeChargeMode: body.feeChargeMode,
      metadata: { account_id: ctx.user.id, source: 'kora_studio' }
    })

    if (!pRes.ok) {
      return sendJson(res, pRes.status, {
        error: pRes.error,
        code: pRes.errorCode
      })
    }

    const payoutId = String(pRes.data?.id || '').trim()
    const { data: saved } = await ctx.sb.rpc('saspay_upsert_payout', {
      p_gate_secret: SASPAY_BFF_GATE,
      p_account_id: ctx.user.id,
      p_saspay_payout_id: payoutId,
      p_idempotency_key: idempotencyKey,
      p_amount: amountDecimal,
      p_currency: currency,
      p_country: country,
      p_method: method,
      p_recipient_msisdn: recipientMsisdn,
      p_description: description,
      p_status: 'PENDING'
    })

    return sendJson(res, 201, {
      payoutId,
      status: 'PENDING',
      idempotencyKey,
      payout: saved
    })
  }

  // 3F. Vérification d'un retrait : GET /payouts/{payout_id}/verify/
  if (action === 'payout-verify') {
    const payoutId = String(body.payoutId || '').trim()
    const vRes = await verifyPayout(payoutId)
    if (!vRes.ok) {
      return sendJson(res, vRes.status, { error: vRes.error, code: vRes.errorCode })
    }
    const tx = vRes.data || {}
    const status = String(tx.status || 'PENDING').toUpperCase()
    const { data: existing } = await ctx.sb
      .from('saspay_payouts')
      .select('idempotency_key,amount,currency,country,method,recipient_msisdn,description')
      .eq('saspay_payout_id', payoutId)
      .maybeSingle()

    if (existing) {
      await ctx.sb.rpc('saspay_upsert_payout', {
        p_gate_secret: SASPAY_BFF_GATE,
        p_account_id: ctx.user.id,
        p_saspay_payout_id: payoutId,
        p_idempotency_key: existing.idempotency_key,
        p_amount: tx.requested_amount ? String(tx.requested_amount) : existing.amount,
        p_currency: tx.currency || existing.currency,
        p_country: existing.country,
        p_method: existing.method,
        p_recipient_msisdn: existing.recipient_msisdn,
        p_description: existing.description,
        p_status: status,
        p_debited_amount: tx.debited_amount ? String(tx.debited_amount) : null,
        p_net_amount: tx.net_amount ? String(tx.net_amount) : null,
        p_fee_charge_mode: tx.fee_charge_mode ? String(tx.fee_charge_mode) : null,
        p_reference: tx.reference || null,
        p_external_reference: tx.external_reference || null
      })
    }

    return sendJson(res, 200, {
      payoutId,
      status,
      reference: tx.reference || payoutId,
      debited_amount: tx.debited_amount || null,
      net_amount: tx.net_amount || null,
      currency: tx.currency || 'XOF'
    })
  }

  // 3G. Transfert inter-wallet : POST /wallet-transfers/ (Admin uniquement, avec Idempotency-Key)
  if (action === 'wallet-transfer') {
    if (ctx.role !== 'admin') return sendJson(res, 403, { error: 'Action réservée aux administrateurs.' })
    const idempotencyKey = normalizeIdempotencyKey(body.idempotencyKey, 'wtransfer')
    const wRes = await createWalletTransfer({
      idempotencyKey,
      fromCountry: body.fromCountry,
      toCountry: body.toCountry,
      fromAmount: body.fromAmount
    })
    if (!wRes.ok) {
      return sendJson(res, wRes.status, { error: wRes.error, code: wRes.errorCode })
    }
    return sendJson(res, 201, { transfer: wRes.data, idempotencyKey })
  }

  /* ==========================================================================
     4. INITIALISATION D'UN PAIEMENT D'ABONNEMENT (Softpay ou Checkout hébergé)
     ========================================================================== */
  const { planId, billing, provider, customerRef, countryIso, networkCode, otp, flow } = body || {}
  const planSpec = PLAN_PRICES_XOF[planId]
  const amountXof = planSpec?.[billing]
  if (!amountXof) {
    return sendJson(res, 400, { error: 'Formule ou périodicité invalide.' })
  }

  const amountDecimal = formatSaspayAmount(amountXof)
  const origin = getOrigin(req)
  const returnUrl = `${origin}/#/abonnement?saspay_return=1`
  const description = `Abonnement Kora ${planSpec.label} (${billing === 'year' ? 'Annuel' : 'Mensuel'})`
  const names = splitCustomerName(ctx.user.user_metadata?.full_name || ctx.user.user_metadata?.name, ctx.user.email)
  const email = ctx.user.email || 'client@kora.cinema'
  const cleanPhone = String(customerRef || ctx.user.phone || '').replace(/\s+/g, '').trim()

  // Cas 1 : Session de checkout hébergée par SasPay (POST /checkout-sessions/)
  if (flow === 'hosted' || action === 'checkout-session') {
    const sessRes = await createCheckoutSession({
      amount: amountDecimal,
      currency: 'XOF',
      description,
      country: countryIso || 'ML',
      customerEmail: email,
      customerName: `${names.first_name} ${names.last_name}`.trim(),
      customerPhone: cleanPhone || undefined,
      returnUrl,
      metadata: {
        account_id: ctx.user.id,
        plan_id: planId,
        billing
      }
    })

    if (!sessRes.ok) {
      return sendJson(res, sessRes.status, { error: sessRes.error, code: sessRes.errorCode })
    }

    const sessId = String(sessRes.data?.id || '').trim()
    const checkoutUrl = String(sessRes.data?.checkout_url || '').trim()

    await ctx.sb.rpc('saspay_register_pending_payment', {
      p_payment_id: sessId,
      p_idempotency_key: null,
      p_plan_id: planId,
      p_billing_cycle: billing,
      p_amount_xof: amountXof,
      p_amount_decimal: amountDecimal,
      p_currency: 'XOF',
      p_country_iso: countryIso || 'ML',
      p_network_code: 'hosted_checkout',
      p_provider_label: 'SasPay Checkout',
      p_checkout_url: checkoutUrl
    })

    return sendJson(res, 201, {
      flow: 'hosted',
      sessionId: sessId,
      slug: sessRes.data?.slug || '',
      status: 'PENDING',
      checkoutUrl,
      requiresRedirect: Boolean(checkoutUrl),
      amount: amountDecimal,
      currency: 'XOF'
    })
  }

  // Cas 2 : Paiement direct Softpay (POST /payments/softpay/ avec Idempotency-Key)
  const route = resolveSaspayNetwork({ countryIso, networkCode, provider })
  if (!route.isGlobal && !cleanPhone) {
    return sendJson(res, 400, { error: 'Saisissez votre numéro de téléphone mobile money.' })
  }

  const idempotencyKey = normalizeIdempotencyKey(body.idempotencyKey, `sub-${ctx.user.id.slice(0, 8)}-${planId}-${billing}`)
  const softRes = await initiateSoftpay({
    idempotencyKey,
    amount: amountDecimal,
    currency: 'XOF',
    country: route.country,
    network: route.network,
    description,
    customer: {
      email,
      first_name: names.first_name,
      last_name: names.last_name,
      phone: cleanPhone || '+22370000000'
    },
    otp: otp ? String(otp).trim() : undefined,
    returnUrl: route.isGlobal ? returnUrl : undefined,
    metadata: {
      account_id: ctx.user.id,
      plan_id: planId,
      billing
    }
  })

  if (!softRes.ok) {
    return sendJson(res, softRes.status, {
      error: softRes.error,
      code: softRes.errorCode,
      otpRequired: softRes.errorCode === 'prepayment_otp_missing',
      otpInstructions: route.otpInstructions || ''
    })
  }

  const paymentId = String(softRes.data?.id || '').trim()
  const checkoutUrl = String(softRes.data?.checkout_url || '').trim()

  await ctx.sb.rpc('saspay_register_pending_payment', {
    p_payment_id: paymentId,
    p_idempotency_key: idempotencyKey,
    p_plan_id: planId,
    p_billing_cycle: billing,
    p_amount_xof: amountXof,
    p_amount_decimal: amountDecimal,
    p_currency: 'XOF',
    p_country_iso: route.country,
    p_network_code: route.network,
    p_provider_label: route.label,
    p_checkout_url: checkoutUrl
  })

  return sendJson(res, 201, {
    flow: 'softpay',
    paymentId,
    status: String(softRes.data?.status || 'PENDING').toUpperCase(),
    checkoutUrl,
    requiresRedirect: Boolean(checkoutUrl),
    idempotencyKey,
    network: route.network,
    country: route.country,
    amount: amountDecimal,
    currency: 'XOF'
  })
}
