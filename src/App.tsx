import { lazy, Suspense, useEffect, useState } from 'react'
import { Provider, useApp } from './store'
import { BrandLogo, Icon, MaintenancePage, ProfileAvatar, ToastHost } from './ui'
import { Categories, Detail, Home, MyList, NotFound, Profile, Search, Settings, Subscription } from './pages'
import { Privacy, Terms } from './legal'
import { Auth, AuthRequiredGate, EmailConfirmPage, ResetPasswordPage } from './auth'

const Admin = lazy(() => import('./admin').then(m => ({ default: m.Admin })))
const Player = lazy(() => import('./player').then(m => ({ default: m.Player })))

function useRoute() {
  const [h, setH] = useState(location.hash)
  useEffect(() => {
    const f = () => { setH(location.hash); window.scrollTo(0, 0) }
    addEventListener('hashchange', f)
    return () => removeEventListener('hashchange', f)
  }, [])
  const [p, q = ''] = h.replace(/^#\/?/, '').split('?')
  return { seg: p.split('/').filter(Boolean), q: new URLSearchParams(q) }
}

const PUBLIC_NAV: [string, string, string][] = [
  ['', 'Accueil', 'home'],
  ['recherche', 'Recherche', 'search'],
  ['categories', 'Explorer', 'grid'],
  ['connexion', 'Connexion', 'user']
]

const MEMBER_NAV: [string, string, string][] = [
  ['', 'Accueil', 'home'],
  ['recherche', 'Recherche', 'search'],
  ['categories', 'Explorer', 'grid'],
  ['ma-liste', 'Ma liste', 'list'],
  ['profil', 'Profil', 'user']
]

function Consent() {
  const [open, setOpen] = useState(() => {
    try { return !localStorage.getItem('kora-consent') } catch { return false }
  })
  if (!open) return null
  const ch = (v: string) => {
    try { localStorage.setItem('kora-consent', v) } catch { /* ignoré */ }
    setOpen(false)
  }
  return (
    <div className="consent" role="dialog" aria-label="Cookies et publicité">
      <p>
        Kora mesure son audience sans cookie. Avec votre accord, nous adaptons les publicités de la formule gratuite.{' '}
        <a href="#/confidentialite">En savoir plus</a>
      </p>
      <div className="consent-acts">
        <button type="button" className="btn" onClick={() => ch('no')}>Refuser</button>
        <button type="button" className="btn p" onClick={() => ch('yes')}>Accepter</button>
      </div>
    </div>
  )
}

function Sidebar() {
  const { seg } = useRoute()
  const { session, profile, role, unreadCount, isPremium, st, setTheme } = useApp()
  const cur = seg[0] || ''
  const nav = session ? MEMBER_NAV : PUBLIC_NAV

  const cycleTheme = () => {
    setTheme(st.theme === 'dark' ? 'black' : st.theme === 'black' ? 'light' : 'dark')
  }

  return (
    <nav className="nav" aria-label="Navigation principale">
      <a className="brand" href="#/" aria-label="Kora, accueil">
        <BrandLogo height={34} />
      </a>

      <div className="nav-links">
        {nav.map(([k, t, i]) => (
          <a key={k} href={`#/${k}`} className={cur === k ? 'on' : ''} aria-current={cur === k ? 'page' : undefined}>
            <Icon n={i} s={20} />
            <span>{t}</span>
            {session && k === 'profil' && unreadCount > 0 && <span className="nav-dot" aria-label={`${unreadCount} notifications non lues`} />}
          </a>
        ))}

        {session && (
          <>
            <a href="#/parametres" className={'nav-extra' + (cur === 'parametres' ? ' on' : '')} aria-current={cur === 'parametres' ? 'page' : undefined}>
              <Icon n="gear" s={20} />
              <span>Paramètres</span>
              {unreadCount > 0 && <span className="nav-dot" aria-label={`${unreadCount} notifications non lues`} />}
            </a>
            <a href="#/abonnement" className={'nav-extra' + (cur === 'abonnement' ? ' on' : '')} aria-current={cur === 'abonnement' ? 'page' : undefined}>
              <Icon n="crown" s={20} />
              <span>{isPremium ? 'Mon offre' : 'Premium'}</span>
            </a>
          </>
        )}

        <a href="/studio/" className="nav-extra">
          <Icon n="studio" s={20} />
          <span>Kora Studio</span>
        </a>

        {session && (role === 'admin' || role === 'moderator') && (
          <a href="#/admin" className={'nav-extra' + (cur === 'admin' ? ' on' : '')} aria-current={cur === 'admin' ? 'page' : undefined}>
            <Icon n="shield" s={20} />
            <span>{role === 'admin' ? 'Admin' : 'Modération'}</span>
          </a>
        )}
      </div>

      <div className="nav-foot">
        {session ? (
          <a className="nav-profile" href="#/profil" aria-label={`Profil actif : ${profile.name}`}>
            <ProfileAvatar profile={profile} size={32} />
            <div className="nav-prof-txt">
              <strong>{profile.name}</strong>
              <small className="mu">{profile.kid ? 'Enfant' : isPremium ? 'Premium' : 'Gratuit'}</small>
            </div>
          </a>
        ) : (
          <a className="btn p" style={{ flex: 1, minHeight: 38, padding: '6px 12px', fontSize: '0.88rem' }} href="#/connexion">
            Se connecter
          </a>
        )}
        <button
          type="button"
          className="icon-btn"
          onClick={cycleTheme}
          title={`Thème : ${st.theme === 'dark' ? 'Sombre' : st.theme === 'black' ? 'Cinéma OLED' : 'Clair'}`}
          aria-label="Changer de thème"
        >
          <Icon n={st.theme === 'light' ? 'sun' : 'moon'} s={18} />
        </button>
      </div>
    </nav>
  )
}

function Routes() {
  const { seg, q } = useRoute()
  const { session, authReady, role, maintenanceMode, maintenanceMessage, updatePlatformSettings, toast } = useApp()
  if (location.pathname !== '/' && location.pathname !== '/index.html') return <NotFound />
  const [a, b, c] = seg

  const disableMaint = async () => {
    const ok = await updatePlatformSettings({ maintenanceMode: false })
    if (ok) toast('Mode maintenance désactivé : Kora est de nouveau ouvert au public.', 'ok')
  }

  // Page d'aperçu de maintenance ou blocage automatique des visiteurs lorsque la maintenance est activée
  if (a === 'maintenance') {
    return (
      <MaintenancePage
        message={maintenanceMessage}
        isAdmin={role === 'admin'}
        isPreview={role === 'admin'}
        onDisable={role === 'admin' ? disableMaint : undefined}
      />
    )
  }

  const isAuthRoute = a === 'connexion' || a === 'confirmation' || a === 'reinitialisation' || a === 'mot-de-passe-oublie'
  if (authReady && maintenanceMode && role !== 'admin' && !isAuthRoute) {
    return <MaintenancePage message={maintenanceMessage} />
  }

  const protectedRoute = (title: string, desc: string, node: JSX.Element) => {
    if (!authReady) return <p className="page mu">Vérification de votre session…</p>
    if (!session) return <AuthRequiredGate title={title} desc={desc} />
    return node
  }

  switch (a) {
    case undefined: return <Home />
    case 'recherche': return <Search q0={q.get('q') || ''} />
    case 'categories': return <Categories kind={b} val={c} />
    case 'titre': return <Detail id={+b} />
    case 'connexion': return q.has('recovery') ? <ResetPasswordPage q={new URLSearchParams('step=new')} /> : <Auth q={q} />
    case 'confirmation': return <EmailConfirmPage q={q} />
    case 'reinitialisation':
    case 'mot-de-passe-oublie': return <ResetPasswordPage q={q} />
    case 'confidentialite': return <Privacy />
    case 'cgu': return <Terms />
    case 'ma-liste':
      return protectedRoute('Ma bibliothèque', 'Connectez-vous pour enregistrer des œuvres dans votre liste et suivre vos lectures.', <MyList />)
    case 'profil':
      return protectedRoute('Mon profil & foyer', 'Connectez-vous pour accéder à vos profils du foyer et à votre historique.', <Profile />)
    case 'parametres':
      return protectedRoute('Paramètres du compte', 'Connectez-vous pour personnaliser vos préférences de lecture, appareils et sécurité.', <Settings />)
    case 'abonnement':
      return protectedRoute('Abonnement Kora', 'Connectez-vous pour activer ou gérer votre formule Kora.', <Subscription />)
    case 'lire':
      return protectedRoute(
        'Connexion requise pour lire',
        'Vous pouvez parcourir librement le catalogue. Connectez-vous pour lancer la lecture des séries et films.',
        <Suspense fallback={<p className="page mu">Chargement du lecteur…</p>}><Player key={b + location.hash} id={+b} q={q} /></Suspense>
      )
    case 'admin':
      return protectedRoute(
        'Espace administrateur',
        'Connectez-vous avec un compte administrateur ou modérateur pour gérer le catalogue.',
        <Suspense fallback={<p className="page mu">Chargement de l’espace administrateur…</p>}><Admin q={q} /></Suspense>
      )
    default: return <NotFound />
  }
}

function AdminMaintenanceBar() {
  const { maintenanceMode, role, updatePlatformSettings, toast } = useApp()
  if (!maintenanceMode || role !== 'admin') return null
  return (
    <div className="maint-admin-bar" role="status">
      <span><strong>Mode maintenance actif</strong> — Les visiteurs voient actuellement la page de maintenance.</span>
      <div className="btns flush">
        <a className="btn" href="#/maintenance">Aperçu de la page</a>
        <button
          type="button"
          className="btn p"
          onClick={async () => {
            const ok = await updatePlatformSettings({ maintenanceMode: false })
            if (ok) toast('Maintenance désactivée. La plateforme est ouverte.', 'ok')
          }}
        >
          Désactiver la maintenance
        </button>
      </div>
    </div>
  )
}

export default function App() {
  return (
    <Provider>
      <a className="skip-link" href="#main-content">Aller au contenu principal</a>
      <Sidebar />
      <main id="main-content" className="app">
        <AdminMaintenanceBar />
        <Routes />
      </main>
      <Consent />
      <ToastHost />
    </Provider>
  )
}
