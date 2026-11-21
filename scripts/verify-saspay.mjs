import crypto from 'node:crypto'
import {
  formatSaspayAmount,
  getMyRates,
  getSaspayConfig,
  listCountries,
  resolveSaspayNetwork,
  verifySaspayWebhook
} from '../server/saspay.js'

async function main() {
  console.log('=== Vérification de l’intégration SasPay (https://api.saspay.me/api/v1) ===')

  // 1. Vérification du formatage strict des montants en chaînes décimales ("2500.00")
  const a1 = formatSaspayAmount(2500)
  const a2 = formatSaspayAmount('45000')
  const a3 = formatSaspayAmount('2537.5')
  if (a1 !== '2500.00' || a2 !== '45000.00' || a3 !== '2537.50') {
    throw new Error(`Formatage décimal incorrect : ${a1}, ${a2}, ${a3}`)
  }
  console.log(`[OK] Montants en chaînes décimales : 2500 -> "${a1}", 45000 -> "${a2}", 2537.5 -> "${a3}"`)

  // 2. Vérification de la résolution des réseaux conformes à /api-reference/reference/formats
  const rMl = resolveSaspayNetwork({ countryIso: 'ML', networkCode: 'orange_ml' })
  const rCi = resolveSaspayNetwork({ countryIso: 'CI', networkCode: 'orange_ci' })
  const rCard = resolveSaspayNetwork({ countryIso: 'ML', networkCode: 'card' })
  if (rMl.network !== 'orange_ml' || !rCi.otpPreRequired || rCard.network !== 'card') {
    throw new Error('Résolution des réseaux SasPay incorrecte.')
  }
  console.log(`[OK] Réseaux SasPay validés : ML=${rMl.network}, CI=${rCi.network} (otpPreRequired=${rCi.otpPreRequired}), Card=${rCard.network}`)

  // 3. Vérification de signature Webhook sur le corps brut + tolérance 300s
  const testSecret = 'whsec_test_kora_saspay_secret'
  const rawBody = '{"event":"webhook.test","data":{"id":"9c3f2a10-4b7e-4f1a-9d2e-9b6a7c1e4a02","status":"SUCCESS","amount":"2500.00","charged":"2537.50","net_amount":"2500.00"}}'
  const nowTs = String(Math.floor(Date.now() / 1000))
  const validSig = crypto.createHmac('sha256', testSecret).update(`${nowTs}.${rawBody}`, 'utf8').digest('hex')

  const okWebhook = verifySaspayWebhook({
    rawBody,
    signatureHeader: validSig,
    timestampHeader: nowTs,
    secret: testSecret
  })
  if (!okWebhook.valid) {
    throw new Error(`Échec validation webhook valide : ${okWebhook.reason}`)
  }

  const expiredTs = String(Math.floor(Date.now() / 1000) - 360)
  const expiredSig = crypto.createHmac('sha256', testSecret).update(`${expiredTs}.${rawBody}`, 'utf8').digest('hex')
  const expiredWebhook = verifySaspayWebhook({
    rawBody,
    signatureHeader: expiredSig,
    timestampHeader: expiredTs,
    secret: testSecret
  })
  if (expiredWebhook.valid) {
    throw new Error('Un webhook expiré (> 300s) aurait dû être rejeté.')
  }

  const tamperedWebhook = verifySaspayWebhook({
    rawBody: rawBody + ' ',
    signatureHeader: validSig,
    timestampHeader: nowTs,
    secret: testSecret
  })
  if (tamperedWebhook.valid) {
    throw new Error('Un corps brut modifié aurait dû être rejeté.')
  }
  console.log('[OK] Vérification cryptographique des webhooks (corps brut + horodatage <= 300s + timingSafeEqual)')

  // 4. Test en direct de GET /countries/ (public)
  const countriesRes = await listCountries()
  if (!countriesRes.ok || !Array.isArray(countriesRes.data)) {
    throw new Error(`Échec GET /countries/ : ${countriesRes.error || countriesRes.status}`)
  }
  console.log(`[OK] GET /countries/ en direct : ${countriesRes.data.length} pays reçus depuis https://api.saspay.me/api/v1/countries/`)

  // 5. Test de GET /pricing/my-rates/ si SASPAY_API_KEY est configurée
  const cfg = getSaspayConfig()
  if (cfg.configured) {
    const ratesRes = await getMyRates()
    if (ratesRes.ok && Array.isArray(ratesRes.data)) {
      console.log(`[OK] GET /pricing/my-rates/ (${cfg.mode}) : ${ratesRes.data.length} réseaux tarifés actifs`)
    } else {
      console.log(`[WARN] GET /pricing/my-rates/ a renvoyé ${ratesRes.status} (${ratesRes.errorCode}) : ${ratesRes.error}`)
    }
  } else {
    console.log('[INFO] SASPAY_API_KEY non définie dans cet environnement local (GET /pricing/my-rates/ sera vérifié dès configuration de sk_test_... ou sk_live_...).')
  }
}

main().catch(err => {
  console.error('[ERREUR SASPAY]', err.message || err)
  process.exit(1)
})
