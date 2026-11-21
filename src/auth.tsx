import { useState } from 'react'
import { apiPost, authErrorMessage } from './api'
import { useApp } from './store'
import { BrandLogo, Icon } from './ui'

const COUNTRIES = ['Mali', 'Sénégal', 'Côte d’Ivoire', 'Burkina Faso', 'Guinée', 'Niger', 'Bénin', 'Togo', 'Cameroun', 'Ghana', 'Nigeria', 'Afrique du Sud', 'France', 'Belgique', 'Canada', 'États-Unis', 'Autre']

export function GoogleAuthButton({ app = 'kora', label = 'Continuer avec Google' }: { app?: 'kora' | 'studio'; label?: string }) {
  return (
    <a className="btn google-btn wide-btn" href={`/api/auth?action=google&app=${app}`}>
      <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
        <path fill="#4285F4" d="M23.49 12.27c0-.79-.07-1.54-.2-2.27H12v4.3h6.45a5.52 5.52 0 0 1-2.4 3.62v3h3.88c2.27-2.09 3.56-5.17 3.56-8.65z" />
        <path fill="#34A853" d="M12 24c3.24 0 5.95-1.07 7.93-2.91l-3.88-3c-1.07.72-2.45 1.15-4.05 1.15-3.12 0-5.76-2.11-6.7-4.94H1.3v3.1A12 12 0 0 0 12 24z" />
        <path fill="#FBBC05" d="M5.3 14.3a7.2 7.2 0 0 1 0-4.6V6.6H1.3a12 12 0 0 0 0 10.8l4-3.1z" />
        <path fill="#EA4335" d="M12 4.75c1.76 0 3.34.61 4.58 1.8l3.44-3.44C17.95 1.19 15.24 0 12 0A12 12 0 0 0 1.3 6.6l4 3.1c.94-2.83 3.58-4.95 6.7-4.95z" />
      </svg>
      <span>{label}</span>
    </a>
  )
}

export function AuthRequiredGate({ title = 'Connexion requise', desc = 'Vous pouvez parcourir le catalogue librement. Connectez-vous pour regarder des œuvres, gérer votre liste, votre profil ou votre abonnement.' }: {
  title?: string
  desc?: string
}) {
  return (
    <div className="page auth-wrap">
      <div className="auth-card auth-gate">
        <div className="gate-icon"><Icon n="lock" s={28} /></div>
        <BrandLogo height={34} />
        <h1>{title}</h1>
        <p className="mu">{desc}</p>
        <div className="btns" style={{ justifyContent: 'center' }}>
          <a className="btn p" href="#/connexion"><Icon n="user" s={18} />Se connecter / Créer un compte</a>
          <a className="btn" href="#/">Parcourir le catalogue</a>
        </div>
      </div>
    </div>
  )
}

/* ============================================================================
   PAGE DÉDIÉE : CONFIRMATION D'E-MAIL (#/confirmation)
   ============================================================================ */
export function EmailConfirmPage({ q }: { q: URLSearchParams }) {
  const { session, toast } = useApp()
  const status = q.get('status') || ''
  const [email, setEmail] = useState(q.get('email') || '')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(() => authErrorMessage(q.get('err')))

  const resend = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email.trim()) { setMsg('Saisissez votre adresse e-mail.'); return }
    setBusy(true); setMsg('')
    const r = await apiPost('/api/auth?action=resend', { email: email.trim(), app: 'kora' })
    setBusy(false)
    if (r.ok) {
      setMsg(r.data.message || 'E-mail de confirmation renvoyé ! Vérifiez aussi vos spams.')
      toast('E-mail de confirmation renvoyé.', 'ok')
    } else {
      setMsg(r.data.error || 'Impossible de renvoyer l’e-mail.')
    }
  }

  if (status === 'ok') {
    return (
      <div className="page auth-wrap">
        <div className="auth-card auth-gate">
          <div className="gate-icon ok-icon"><Icon n="check" s={28} /></div>
          <BrandLogo height={36} />
          <h1>Adresse e-mail confirmée</h1>
          <p className="mu">
            Votre compte Kora est désormais activé{session?.user.email ? ` (${session.user.email})` : ''}. Vous pouvez accéder au streaming, à votre liste et à Kora Studio.
          </p>
          <div className="btns" style={{ justifyContent: 'center' }}>
            <a className="btn p" href="#/"><Icon n="play" s={18} />Accéder à Kora</a>
            <a className="btn" href="/studio/"><Icon n="studio" s={18} />Ouvrir Kora Studio</a>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="page auth-wrap">
      <div className="auth-card auth">
        <div className="auth-head" style={{ justifyItems: 'center', textAlign: 'center' }}>
          <div className="gate-icon"><Icon n={status === 'error' ? 'alert' : 'bell'} s={26} /></div>
          <BrandLogo height={36} />
          <h1>{status === 'error' ? 'Lien de confirmation expiré' : 'Confirmez votre adresse e-mail'}</h1>
          <p className="mu">
            {status === 'error'
              ? 'Ce lien de confirmation n’est plus valide ou a déjà été utilisé. Renvoyez un nouvel e-mail ci-dessous.'
              : email
                ? `Un e-mail d’activation a été envoyé à ${email}. Cliquez sur le lien reçu (pensez à vérifier vos spams / indésirables).`
                : 'Consultez votre boîte de réception et cliquez sur le lien de confirmation Kora.'}
          </p>
        </div>

        {msg && <p className="status-box" role="status">{msg}</p>}

        <form className="auth" onSubmit={resend}>
          <label>Adresse e-mail
            <input
              className="field"
              type="email"
              required
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="vous@exemple.com"
              autoComplete="email"
            />
          </label>
          <button type="submit" className="btn p wide-btn" disabled={busy}>
            {busy ? 'Envoi en cours…' : 'Renvoyer l’e-mail de confirmation'}
          </button>
        </form>

        <p className="mu auth-links">
          <a className="lnk" href="#/connexion">Déjà confirmé ? Se connecter</a>
          {' · '}
          <a className="lnk" href="#/reinitialisation">Mot de passe oublié ?</a>
        </p>
      </div>
    </div>
  )
}

/* ============================================================================
   PAGE DÉDIÉE : RÉINITIALISATION DE MOT DE PASSE (#/reinitialisation)
   ============================================================================ */
export function ResetPasswordPage({ q }: { q: URLSearchParams }) {
  const { toast } = useApp()
  const step = q.get('step') || ''
  const status = q.get('status') || ''
  const [email, setEmail] = useState(q.get('email') || '')
  const [pw, setPw] = useState('')
  const [pw2, setPw2] = useState('')
  const [done, setDone] = useState(false)
  const [sent, setSent] = useState(false)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(() => authErrorMessage(q.get('err')))

  if (done) {
    return (
      <div className="page auth-wrap">
        <div className="auth-card auth-gate">
          <div className="gate-icon ok-icon"><Icon n="check" s={28} /></div>
          <BrandLogo height={36} />
          <h1>Mot de passe mis à jour</h1>
          <p className="mu">Votre nouveau mot de passe est enregistré. Vous êtes connecté à votre compte Kora.</p>
          <div className="btns" style={{ justifyContent: 'center' }}>
            <a className="btn p" href="#/">Accéder à Kora</a>
            <a className="btn" href="#/profil">Mon profil</a>
          </div>
        </div>
      </div>
    )
  }

  // Étape 2 : définition du nouveau mot de passe après clic sur le lien reçu par e-mail
  if (step === 'new') {
    const saveNewPw = async (e: React.FormEvent) => {
      e.preventDefault()
      if (pw.length < 8) { setMsg('Le mot de passe doit contenir au moins 8 caractères.'); return }
      if (pw !== pw2) { setMsg('Les deux mots de passe ne correspondent pas.'); return }
      setBusy(true); setMsg('')
      const r = await apiPost('/api/auth?action=update-password', { password: pw })
      setBusy(false)
      if (!r.ok) setMsg(r.data.error || 'Impossible de mettre à jour le mot de passe.')
      else {
        toast('Nouveau mot de passe enregistré !', 'ok')
        setDone(true)
      }
    }

    return (
      <div className="page auth-wrap">
        <form className="auth-card auth" onSubmit={saveNewPw}>
          <div className="auth-head" style={{ justifyItems: 'center', textAlign: 'center' }}>
            <div className="gate-icon"><Icon n="lock" s={26} /></div>
            <BrandLogo height={36} />
            <h1>Nouveau mot de passe</h1>
            <p className="mu">Choisissez un nouveau mot de passe sécurisé pour votre compte Kora.</p>
          </div>
          <label>Nouveau mot de passe
            <input className="field" type="password" required minLength={8} value={pw} onChange={e => setPw(e.target.value)} autoComplete="new-password" placeholder="8 caractères minimum" />
          </label>
          <label>Confirmer le mot de passe
            <input className="field" type="password" required minLength={8} value={pw2} onChange={e => setPw2(e.target.value)} autoComplete="new-password" placeholder="Retapez votre mot de passe" />
          </label>
          <button type="submit" className="btn p wide-btn" disabled={busy}>
            {busy ? 'Enregistrement…' : 'Enregistrer le nouveau mot de passe'}
          </button>
          {msg && <p className="status-box" role="status">{msg}</p>}
        </form>
      </div>
    )
  }

  // Étape 1 : demande d'e-mail de réinitialisation
  const requestReset = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email.trim()) { setMsg('Saisissez votre adresse e-mail.'); return }
    setBusy(true); setMsg('')
    const r = await apiPost('/api/auth?action=forgot', { email: email.trim(), app: 'kora' })
    setBusy(false)
    if (!r.ok) {
      setMsg(r.data.error || 'Impossible d’envoyer l’e-mail de réinitialisation.')
    } else {
      setSent(true)
      setMsg(r.data.message || 'Un e-mail de réinitialisation vient d’être envoyé.')
    }
  }

  return (
    <div className="page auth-wrap">
      <form className="auth-card auth" onSubmit={requestReset}>
        <div className="auth-head" style={{ justifyItems: 'center', textAlign: 'center' }}>
          <div className="gate-icon"><Icon n={status === 'error' ? 'alert' : 'lock'} s={26} /></div>
          <BrandLogo height={36} />
          <h1>Réinitialiser mon mot de passe</h1>
          <p className="mu">
            {status === 'error'
              ? 'Votre lien de réinitialisation a expiré ou a déjà été utilisé. Demandez-en un nouveau ci-dessous.'
              : 'Indiquez l’adresse e-mail de votre compte Kora pour recevoir un lien sécurisé de réinitialisation.'}
          </p>
        </div>

        <label>Adresse e-mail
          <input className="field" type="email" required value={email} onChange={e => setEmail(e.target.value)} autoComplete="email" placeholder="vous@exemple.com" />
        </label>

        <button type="submit" className="btn p wide-btn" disabled={busy}>
          {busy ? 'Envoi en cours…' : sent ? 'Renvoyer le lien de réinitialisation' : 'Envoyer le lien de réinitialisation'}
        </button>

        {msg && <p className="status-box" role="status">{msg}</p>}

        <p className="mu auth-links">
          <a className="lnk" href="#/connexion">← Retour à la connexion</a>
          {' · '}
          <a className="lnk" href="#/">Parcourir le catalogue</a>
        </p>
      </form>
    </div>
  )
}

/* ============================================================================
   CONNEXION & INSCRIPTION (#/connexion) — Google Auth + E-mail + Téléphone
   ============================================================================ */
export function Auth({ q }: { q: URLSearchParams }) {
  const { authConfigured, refreshSession, toast } = useApp()
  const [mode, setMode] = useState<'email' | 'phone'>('email')
  const [signup, setSignup] = useState(false)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [pw, setPw] = useState('')
  const [phone, setPhone] = useState('')
  const [code, setCode] = useState('')
  const [sent, setSent] = useState(false)
  const [awaitingConfirm, setAwaitingConfirm] = useState(false)
  const [msg, setMsg] = useState(() => authErrorMessage(q.get('err')))
  const [busy, setBusy] = useState(false)

  if (!authConfigured) {
    return (
      <div className="page auth-wrap">
        <div className="auth-card">
          <BrandLogo height={36} />
          <h1>Authentification non configurée</h1>
          <p className="mu">Le serveur d’authentification n’est pas encore configuré sur cette instance.</p>
          <a className="btn p" href="#/">Retour au catalogue</a>
        </div>
      </div>
    )
  }

  const resendConfirmation = async () => {
    if (!email.trim()) { setMsg('Saisissez votre adresse e-mail.'); return }
    setBusy(true); setMsg('')
    const r = await apiPost('/api/auth?action=resend', { email: email.trim(), app: 'kora' })
    setBusy(false)
    setMsg(r.ok ? (r.data.message || 'E-mail de confirmation renvoyé !') : (r.data.error || 'Erreur d’envoi.'))
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setAwaitingConfirm(false)
    setBusy(true); setMsg('')

    if (mode === 'email') {
      const cleanEmail = email.trim()
      if (signup) {
        const r = await apiPost('/api/auth?action=signup', { email: cleanEmail, password: pw, name: name.trim(), app: 'kora' })
        setBusy(false)
        if (!r.ok) {
          setMsg(r.data.error || 'Inscription impossible.')
        } else if (r.data.alreadyExists) {
          setSignup(false)
          setMsg(r.data.message || 'Un compte existe déjà avec cette adresse e-mail.')
        } else if (r.data.user) {
          await refreshSession()
          toast('Compte créé ! Bienvenue sur Kora.', 'ok')
          location.hash = '#/'
        } else {
          location.hash = `#/confirmation?email=${encodeURIComponent(cleanEmail)}`
        }
      } else {
        const r = await apiPost('/api/auth?action=login', { email: cleanEmail, password: pw })
        setBusy(false)
        if (!r.ok) {
          setMsg(r.data.error || 'Connexion impossible.')
          if (r.data.needsConfirm) setAwaitingConfirm(true)
        } else {
          await refreshSession()
          toast('Connexion réussie. Bienvenue sur Kora !', 'ok')
          location.hash = '#/'
        }
      }
    } else if (!sent) {
      const r = await apiPost('/api/auth?action=otp-send', { phone, name: name.trim() })
      setBusy(false)
      if (!r.ok) setMsg(r.data.error || 'Envoi SMS impossible.')
      else { setSent(true); setMsg(r.data.message || 'Un code vous a été envoyé par SMS.') }
    } else {
      const r = await apiPost('/api/auth?action=otp-verify', { phone, code })
      setBusy(false)
      if (!r.ok) setMsg(r.data.error || 'Code invalide.')
      else {
        await refreshSession()
        toast('Connexion réussie.', 'ok')
        location.hash = '#/'
      }
    }
  }

  return (
    <div className="page auth-wrap">
      <form className="auth-card auth" onSubmit={submit}>
        <div className="auth-head">
          <BrandLogo height={38} />
          <h1>{signup ? 'Créer un compte Kora' : 'Connexion'}</h1>
          <p className="mu">Connectez-vous pour regarder les œuvres, gérer votre liste ou publier sur Kora Studio.</p>
        </div>

        <GoogleAuthButton app="kora" />

        <div className="auth-sep" aria-hidden="true"><span>ou par e-mail / téléphone</span></div>

        <div className="chips" role="tablist">
          {([['email', 'E-mail'], ['phone', 'Téléphone']] as const).map(([k, t]) => (
            <button
              type="button"
              key={k}
              role="tab"
              aria-selected={mode === k}
              className={'chip' + (mode === k ? ' on' : '')}
              onClick={() => { setMode(k); setMsg(''); setSent(false); setAwaitingConfirm(false) }}
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
              <input className="field" type="password" required minLength={signup ? 8 : 6} value={pw} onChange={e => setPw(e.target.value)} autoComplete={signup ? 'new-password' : 'current-password'} placeholder={signup ? '8 caractères minimum' : 'Votre mot de passe'} />
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

        {awaitingConfirm && mode === 'email' && (
          <button type="button" className="btn wide-btn" disabled={busy} onClick={resendConfirmation}>
            Renvoyer l’e-mail de confirmation
          </button>
        )}

        {mode === 'email' && (
          <p className="mu auth-links">
            <button type="button" className="lnk" onClick={() => { setSignup(!signup); setMsg(''); setAwaitingConfirm(false) }}>
              {signup ? 'J’ai déjà un compte' : 'Créer un compte gratuitement'}
            </button>
            {!signup && (
              <>
                {' · '}
                <a className="lnk" href={`#/reinitialisation${email.trim() ? `?email=${encodeURIComponent(email.trim())}` : ''}`}>
                  Mot de passe oublié ?
                </a>
              </>
            )}
          </p>
        )}

        <p className="mu auth-links"><a className="lnk" href="#/">Parcourir le catalogue (lecture seule)</a></p>
      </form>
    </div>
  )
}

export function AccountSummary() {
  const { session, role, signOut } = useApp()
  if (!session) return null
  const u = session.user
  return (
    <section className="panel account-cta">
      <div>
        <h2>Mon compte</h2>
        <p className="mu">{u.email || u.phone} · <strong>{role === 'admin' ? 'Administrateur' : role === 'moderator' ? 'Modérateur' : 'Membre'}</strong></p>
      </div>
      <div className="btns flush">
        {(role === 'admin' || role === 'moderator') && (
          <a className="btn p" href="#/admin"><Icon n="shield" s={18} />{role === 'admin' ? 'Admin' : 'Modération'}</a>
        )}
        <a className="btn" href="/studio/"><Icon n="studio" s={18} />Kora Studio</a>
        <button type="button" className="btn" onClick={signOut}>Déconnexion</button>
      </div>
    </section>
  )
}

export function AccountBox() {
  const { session, role, signOut, st, updateAccount, toast } = useApp()
  const [name, setName] = useState(st.accountName || '')
  const [country, setCountry] = useState(st.accountCountry || 'Mali')
  const [curPw, setCurPw] = useState('')
  const [pw, setPw] = useState('')
  const [msg, setMsg] = useState('')

  if (!session) return null
  const u = session.user

  return (
    <section className="panel">
      <div className="panel-head">
        <div>
          <h2>Compte & Sécurité</h2>
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
          <label>Mot de passe actuel
            <input className="field narrow" type="password" autoComplete="current-password" placeholder="Requis" value={curPw} onChange={e => setCurPw(e.target.value)} />
          </label>
          <label>Nouveau mot de passe
            <input className="field narrow" type="password" minLength={8} autoComplete="new-password" placeholder="8 car. min." value={pw} onChange={e => setPw(e.target.value)} />
          </label>
          <button
            type="button"
            className="btn"
            onClick={async () => {
              if (!curPw) { setMsg('Saisissez votre mot de passe actuel pour confirmer.'); return }
              if (pw.length < 8) { setMsg('Le nouveau mot de passe doit contenir au moins 8 caractères.'); return }
              const r = await apiPost('/api/auth?action=update-password', { currentPassword: curPw, password: pw })
              if (!r.ok) setMsg(r.data.error || 'Impossible de modifier le mot de passe.')
              else { toast('Mot de passe mis à jour.', 'ok'); setMsg(''); setCurPw(''); setPw('') }
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
