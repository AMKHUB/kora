import { useState } from 'react'
import { sb } from './supabase'
import { useApp } from './store'
import { BrandLogo, Icon } from './ui'

const COUNTRIES = ['Mali', 'Sénégal', 'Côte d’Ivoire', 'Burkina Faso', 'Guinée', 'Niger', 'Bénin', 'Togo', 'Cameroun', 'Ghana', 'Nigeria', 'Afrique du Sud', 'France', 'Belgique', 'Canada', 'États-Unis', 'Autre']

const fr = (m: string) =>
  /invalid login/i.test(m) ? 'E-mail ou mot de passe incorrect.'
    : /already registered/i.test(m) ? 'Cet e-mail possède déjà un compte.'
      : /password should be/i.test(m) ? 'Mot de passe trop court (6 caractères minimum).'
        : /rate limit/i.test(m) ? 'Trop de tentatives, réessayez dans quelques minutes.'
          : /provider|sms/i.test(m) ? 'L’envoi de SMS n’est pas encore activé sur ce serveur. Utilisez la connexion par e-mail.'
            : /otp|token/i.test(m) ? 'Code incorrect ou expiré.'
              : m

export function Auth() {
  const { toast } = useApp()
  const [mode, setMode] = useState<'email' | 'phone'>('email')
  const [signup, setSignup] = useState(false)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [pw, setPw] = useState('')
  const [phone, setPhone] = useState('')
  const [code, setCode] = useState('')
  const [sent, setSent] = useState(false)
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)

  if (!sb) {
    return (
      <div className="page auth-wrap">
        <div className="auth-card">
          <BrandLogo height={36} />
          <h1>Mode démonstration</h1>
          <p className="mu">La connexion cloud n’est pas activée sur cette instance. Vous pouvez profiter de Kora avec vos profils locaux.</p>
          <a className="btn p" href="#/">Explorer le catalogue</a>
        </div>
      </div>
    )
  }

  const db = sb
  const tel = phone.replace(/\s/g, '')

  const run = async (f: () => Promise<{ error: { message: string } | null; data?: any }>) => {
    setBusy(true); setMsg('')
    const r = await f()
    setBusy(false)
    if (r.error) setMsg(fr(r.error.message))
    return r
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (mode === 'email') {
      const r = await run(() => signup
        ? db.auth.signUp({ email, password: pw, options: { data: { name }, emailRedirectTo: location.origin } })
        : db.auth.signInWithPassword({ email, password: pw }))
      if (!r.error) {
        if (r.data?.session) {
          toast('Connexion réussie. Bienvenue sur Kora !', 'ok')
          location.hash = '#/profil'
        } else {
          setMsg('Un e-mail de confirmation vient de vous être envoyé. Validez-le puis connectez-vous.')
        }
      }
    } else if (!sent) {
      const r = await run(() => db.auth.signInWithOtp({ phone: tel, options: { data: { name } } }))
      if (!r.error) { setSent(true); setMsg('Un code de vérification vous a été envoyé par SMS.') }
    } else {
      const r = await run(() => db.auth.verifyOtp({ phone: tel, token: code.trim(), type: 'sms' }))
      if (!r.error) {
        toast('Connexion réussie.', 'ok')
        location.hash = '#/profil'
      }
    }
  }

  return (
    <div className="page auth-wrap">
      <form className="auth-card auth" onSubmit={submit}>
        <div className="auth-head">
          <BrandLogo height={38} />
          <h1>{signup ? 'Créer un compte Kora' : 'Connexion'}</h1>
          <p className="mu">Synchronisez vos profils, votre liste et votre progression sur tous vos appareils.</p>
        </div>

        <div className="chips" role="tablist">
          {([['email', 'E-mail'], ['phone', 'Téléphone']] as const).map(([k, t]) => (
            <button
              type="button"
              key={k}
              role="tab"
              aria-selected={mode === k}
              className={'chip' + (mode === k ? ' on' : '')}
              onClick={() => { setMode(k); setMsg(''); setSent(false) }}
            >
              {t}
            </button>
          ))}
        </div>

        {mode === 'email' ? (
          <>
            {signup && (
              <label>Nom complet
                <input className="field" value={name} onChange={e => setName(e.target.value)} autoComplete="name" placeholder="Ex. Aminata Traoré" />
              </label>
            )}
            <label>Adresse e-mail
              <input className="field" type="email" required value={email} onChange={e => setEmail(e.target.value)} autoComplete="email" placeholder="vous@exemple.com" />
            </label>
            <label>Mot de passe
              <input className="field" type="password" required minLength={6} value={pw} onChange={e => setPw(e.target.value)} autoComplete={signup ? 'new-password' : 'current-password'} placeholder="6 caractères minimum" />
            </label>
          </>
        ) : (
          <>
            {!sent && (
              <label>Nom (facultatif)
                <input className="field" value={name} onChange={e => setName(e.target.value)} autoComplete="name" />
              </label>
            )}
            <label>Numéro de téléphone
              <input className="field" type="tel" required inputMode="tel" placeholder="+223 70 00 00 00" value={phone} onChange={e => setPhone(e.target.value)} autoComplete="tel" disabled={sent} />
            </label>
            {sent && (
              <label>Code reçu par SMS
                <input className="field" inputMode="numeric" required value={code} onChange={e => setCode(e.target.value)} autoComplete="one-time-code" placeholder="123456" />
              </label>
            )}
          </>
        )}

        <button className="btn p wide-btn" disabled={busy}>
          {busy ? 'Patientez…' : mode === 'email' ? (signup ? 'Créer mon compte' : 'Se connecter') : sent ? 'Valider le code' : 'Recevoir le code'}
        </button>

        {msg && <p className="status-box" role="status">{msg}</p>}

        {mode === 'email' && (
          <p className="mu auth-links">
            <button type="button" className="lnk" onClick={() => { setSignup(!signup); setMsg('') }}>
              {signup ? 'J’ai déjà un compte' : 'Créer un compte gratuitement'}
            </button>
            {!signup && (
              <>
                {' · '}
                <button
                  type="button"
                  className="lnk"
                  onClick={async () => {
                    if (!email) return setMsg('Saisissez d’abord votre adresse e-mail.')
                    await db.auth.resetPasswordForEmail(email, { redirectTo: location.origin })
                    setMsg('Si ce compte existe, un e-mail de réinitialisation vient d’être envoyé.')
                  }}
                >
                  Mot de passe oublié ?
                </button>
              </>
            )}
          </p>
        )}

        <p className="mu auth-links"><a className="lnk" href="#/">Continuer en tant qu’invité</a></p>
      </form>
    </div>
  )
}

export function AccountBox() {
  const { session, role, signOut, st, updateAccount, toast } = useApp()
  const [name, setName] = useState(st.accountName || '')
  const [country, setCountry] = useState(st.accountCountry || 'Mali')
  const [pw, setPw] = useState('')
  const [msg, setMsg] = useState('')

  if (!sb) {
    return (
      <section className="panel">
        <h2>Compte local</h2>
        <p className="mu">Vos préférences, profils et historiques sont sauvegardés sur cet appareil.</p>
      </section>
    )
  }

  if (!session) {
    return (
      <section className="panel account-cta">
        <div>
          <h2>Synchronisez votre foyer Kora</h2>
          <p className="mu">Connectez-vous pour retrouver vos profils, votre liste et votre abonnement sur tous vos écrans.</p>
        </div>
        <a className="btn p" href="#/connexion"><Icon n="user" s={18} />Se connecter ou créer un compte</a>
      </section>
    )
  }

  const u = session.user
  return (
    <section className="panel">
      <div className="panel-head">
        <div>
          <h2>Compte</h2>
          <p className="mu">{u.email || u.phone} · Rôle : <strong>{role === 'admin' ? 'Administrateur' : role === 'moderator' ? 'Modérateur' : 'Membre'}</strong></p>
        </div>
        <div className="btns flush">
          {(role === 'admin' || role === 'moderator') && (
            <a className="btn p" href="#/admin"><Icon n="shield" s={18} />{role === 'admin' ? 'Espace administrateur' : 'Modération'}</a>
          )}
          <button type="button" className="btn" onClick={signOut}>Se déconnecter</button>
        </div>
      </div>

      <div className="inline">
        <label>Nom du compte
          <input className="field" value={name} onChange={e => setName(e.target.value)} placeholder="Votre nom" />
        </label>
        <label>Pays de résidence (droits catalogue)
          <select value={country} onChange={e => setCountry(e.target.value)}>
            {COUNTRIES.map(c => <option key={c}>{c}</option>)}
          </select>
        </label>
        <button type="button" className="btn" onClick={() => updateAccount(name, country)}>Enregistrer</button>
      </div>

      {u.email && (
        <div className="inline">
          <label>Nouveau mot de passe
            <input className="field narrow" type="password" minLength={6} autoComplete="new-password" placeholder="6 car. min." value={pw} onChange={e => setPw(e.target.value)} />
          </label>
          <button
            type="button"
            className="btn"
            onClick={async () => {
              if (pw.length < 6) { setMsg('Le mot de passe doit contenir au moins 6 caractères.'); return }
              const { error } = await sb!.auth.updateUser({ password: pw })
              if (error) setMsg(fr(error.message))
              else { toast('Mot de passe mis à jour.', 'ok'); setMsg(''); setPw('') }
            }}
          >
            Modifier le mot de passe
          </button>
        </div>
      )}
      {msg && <p role="status" className="mu">{msg}</p>}
    </section>
  )
}
