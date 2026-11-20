import { useState } from 'react'
import { sb } from './supabase'
import { useApp } from './store'
import { BrandLogo, Icon } from './ui'

const COUNTRIES = ['Mali', 'Sénégal', 'Côte d’Ivoire', 'Burkina Faso', 'Guinée', 'Niger', 'Bénin', 'Togo', 'Cameroun', 'Ghana', 'Nigeria', 'Afrique du Sud', 'France', 'Belgique', 'Canada', 'États-Unis', 'Autre']

const fr = (m: string) =>
  /invalid login/i.test(m) ? 'E-mail ou mot de passe incorrect.'
    : /email not confirmed/i.test(m) ? 'Votre adresse e-mail n’est pas encore confirmée. Vérifiez vos spams ou cliquez sur « Renvoyer l’e-mail de confirmation ».'
      : /already registered|user_repeated_signup/i.test(m) ? 'Cet e-mail possède déjà un compte Kora. Connectez-vous ou réinitialisez votre mot de passe.'
        : /password should be/i.test(m) ? 'Mot de passe trop court (6 caractères minimum).'
          : /rate limit|security purposes|only request this after/i.test(m) ? 'Trop d’e-mails envoyés récemment (limite anti-spam Supabase). Patientez quelques minutes puis réessayez.'
            : /provider|sms/i.test(m) ? 'L’envoi de SMS n’est pas encore activé sur ce serveur. Utilisez la connexion par e-mail.'
              : /otp|token/i.test(m) ? 'Code incorrect ou expiré.'
                : m

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

export function Auth({ recovery = false }: { recovery?: boolean }) {
  const { toast } = useApp()
  const [mode, setMode] = useState<'email' | 'phone'>('email')
  const [signup, setSignup] = useState(false)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [pw, setPw] = useState('')
  const [phone, setPhone] = useState('')
  const [code, setCode] = useState('')
  const [sent, setSent] = useState(false)
  const [awaitingConfirm, setAwaitingConfirm] = useState(false)
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)

  if (!sb) {
    return (
      <div className="page auth-wrap">
        <div className="auth-card">
          <BrandLogo height={36} />
          <h1>Authentification non configurée</h1>
          <p className="mu">Configurez VITE_SUPABASE_URL et VITE_SUPABASE_PUBLISHABLE_KEY pour activer la connexion.</p>
          <a className="btn p" href="#/">Retour au catalogue</a>
        </div>
      </div>
    )
  }

  const db = sb
  const tel = phone.replace(/\s/g, '')

  // Mode réinitialisation de mot de passe (après clic sur le lien reçu par e-mail)
  if (recovery) {
    const saveNewPw = async (e: React.FormEvent) => {
      e.preventDefault()
      if (pw.length < 6) { setMsg('Le mot de passe doit contenir au moins 6 caractères.'); return }
      setBusy(true); setMsg('')
      const { error } = await db.auth.updateUser({ password: pw })
      setBusy(false)
      if (error) setMsg(fr(error.message))
      else {
        toast('Nouveau mot de passe enregistré !', 'ok')
        location.hash = '#/profil'
      }
    }
    return (
      <div className="page auth-wrap">
        <form className="auth-card auth" onSubmit={saveNewPw}>
          <div className="auth-head">
            <BrandLogo height={38} />
            <h1>Nouveau mot de passe</h1>
            <p className="mu">Choisissez un nouveau mot de passe pour votre compte Kora.</p>
          </div>
          <label>Nouveau mot de passe
            <input className="field" type="password" required minLength={6} value={pw} onChange={e => setPw(e.target.value)} autoComplete="new-password" placeholder="6 caractères minimum" />
          </label>
          <button className="btn p wide-btn" disabled={busy}>{busy ? 'Enregistrement…' : 'Valider le mot de passe'}</button>
          {msg && <p className="status-box" role="status">{msg}</p>}
        </form>
      </div>
    )
  }

  const run = async (f: () => Promise<{ error: { message: string } | null; data?: any }>) => {
    setBusy(true); setMsg('')
    const r = await f()
    setBusy(false)
    if (r.error) setMsg(fr(r.error.message))
    return r
  }

  const resendConfirmation = async () => {
    if (!email.trim()) { setMsg('Saisissez votre adresse e-mail.'); return }
    setBusy(true); setMsg('')
    const { error } = await db.auth.resend({
      type: 'signup',
      email: email.trim(),
      options: { emailRedirectTo: `${location.origin}/` }
    })
    setBusy(false)
    if (error) setMsg(fr(error.message))
    else setMsg('E-mail de confirmation renvoyé ! Pensez aussi à vérifier votre dossier Spam / Indésirables.')
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setAwaitingConfirm(false)
    if (mode === 'email') {
      const cleanEmail = email.trim()
      if (signup) {
        const r = await run(() => db.auth.signUp({
          email: cleanEmail,
          password: pw,
          options: { data: { name: name.trim() }, emailRedirectTo: `${location.origin}/` }
        }))
        if (!r.error) {
          // IMPORTANT : Supabase renvoie 200 avec identities: [] si l'e-mail existe déjà (et n'envoie aucun e-mail !)
          const alreadyExists = r.data?.user && Array.isArray(r.data.user.identities) && r.data.user.identities.length === 0
          if (alreadyExists) {
            setSignup(false)
            setMsg('Un compte existe déjà avec cette adresse e-mail (aucun nouvel e-mail n’est envoyé). Connectez-vous ci-dessous ou cliquez sur « Mot de passe oublié ? ».')
          } else if (r.data?.session) {
            toast('Compte créé ! Bienvenue sur Kora.', 'ok')
            location.hash = '#/'
          } else {
            setAwaitingConfirm(true)
            setMsg('Un e-mail de confirmation vient d’être envoyé. Vérifiez aussi vos spams/indésirables puis cliquez sur le lien pour activer votre compte.')
          }
        }
      } else {
        const r = await run(() => db.auth.signInWithPassword({ email: cleanEmail, password: pw }))
        if (!r.error) {
          toast('Connexion réussie. Bienvenue sur Kora !', 'ok')
          location.hash = '#/'
        } else if (/email not confirmed/i.test(r.error.message)) {
          setAwaitingConfirm(true)
        }
      }
    } else if (!sent) {
      const r = await run(() => db.auth.signInWithOtp({ phone: tel, options: { data: { name } } }))
      if (!r.error) { setSent(true); setMsg('Un code de vérification vous a été envoyé par SMS.') }
    } else {
      const r = await run(() => db.auth.verifyOtp({ phone: tel, token: code.trim(), type: 'sms' }))
      if (!r.error) {
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
                <button
                  type="button"
                  className="lnk"
                  onClick={async () => {
                    if (!email.trim()) return setMsg('Saisissez d’abord votre adresse e-mail.')
                    setBusy(true)
                    const { error } = await db.auth.resetPasswordForEmail(email.trim(), { redirectTo: `${location.origin}/#/connexion?recovery=1` })
                    setBusy(false)
                    setMsg(error ? fr(error.message) : 'Si ce compte existe, un e-mail de réinitialisation vient d’être envoyé (vérifiez aussi vos spams).')
                  }}
                >
                  Mot de passe oublié ?
                </button>
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
  if (!sb || !session) return null
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
  const [pw, setPw] = useState('')
  const [msg, setMsg] = useState('')

  if (!sb || !session) return null
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
