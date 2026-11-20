import { lazy, Suspense, useEffect, useState } from 'react'
import { Provider, useApp } from './store'
import { BrandLogo, Icon, ProfileAvatar, ToastHost } from './ui'
import { Categories, Detail, Home, MyList, NotFound, Profile, Search, Settings, Subscription } from './pages'
import { Privacy, Terms } from './legal'
import { Auth } from './auth'

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

const NAV: [string, string, string][] = [
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
  const { profile, role, unreadCount, isPremium, st, setTheme } = useApp()
  const cur = seg[0] || ''

  const cycleTheme = () => {
    setTheme(st.theme === 'dark' ? 'black' : st.theme === 'black' ? 'light' : 'dark')
  }

  return (
    <nav className="nav" aria-label="Navigation principale">
      <a className="brand" href="#/" aria-label="Kora, accueil">
        <BrandLogo height={34} />
      </a>

      <div className="nav-links">
        {NAV.map(([k, t, i]) => (
          <a key={k} href={`#/${k}`} className={cur === k ? 'on' : ''} aria-current={cur === k ? 'page' : undefined}>
            <Icon n={i} s={20} />
            <span>{t}</span>
            {k === 'profil' && unreadCount > 0 && <span className="nav-dot" aria-label={`${unreadCount} notifications non lues`} />}
          </a>
        ))}
        <a href="#/parametres" className={'nav-extra' + (cur === 'parametres' ? ' on' : '')} aria-current={cur === 'parametres' ? 'page' : undefined}>
          <Icon n="gear" s={20} />
          <span>Paramètres</span>
          {unreadCount > 0 && <span className="nav-dot" aria-label={`${unreadCount} notifications non lues`} />}
        </a>
        <a href="#/abonnement" className={'nav-extra' + (cur === 'abonnement' ? ' on' : '')} aria-current={cur === 'abonnement' ? 'page' : undefined}>
          <Icon n="crown" s={20} />
          <span>{isPremium ? 'Mon offre' : 'Premium'}</span>
        </a>
        <a href="/studio/" className="nav-extra">
          <Icon n="studio" s={20} />
          <span>Kora Studio</span>
        </a>
        {(role === 'admin' || role === 'moderator') && (
          <a href="#/admin" className={'nav-extra' + (cur === 'admin' ? ' on' : '')} aria-current={cur === 'admin' ? 'page' : undefined}>
            <Icon n="shield" s={20} />
            <span>{role === 'admin' ? 'Admin' : 'Modération'}</span>
          </a>
        )}
      </div>

      <div className="nav-foot">
        <a className="nav-profile" href="#/profil" aria-label={`Profil actif : ${profile.name}`}>
          <ProfileAvatar profile={profile} size={32} />
          <div className="nav-prof-txt">
            <strong>{profile.name}</strong>
            <small className="mu">{profile.kid ? 'Enfant' : isPremium ? 'Premium' : 'Gratuit'}</small>
          </div>
        </a>
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
  if (location.pathname !== '/' && location.pathname !== '/index.html') return <NotFound />
  const [a, b, c] = seg
  switch (a) {
    case undefined: return <Home />
    case 'recherche': return <Search q0={q.get('q') || ''} />
    case 'categories': return <Categories kind={b} val={c} />
    case 'ma-liste': return <MyList />
    case 'profil': return <Profile />
    case 'parametres': return <Settings />
    case 'titre': return <Detail id={+b} />
    case 'lire': return <Suspense fallback={<p className="page mu">Chargement du lecteur…</p>}><Player key={b + location.hash} id={+b} q={q} /></Suspense>
    case 'abonnement': return <Subscription />
    case 'connexion': return <Auth />
    case 'admin': return <Suspense fallback={<p className="page mu">Chargement de l’espace administrateur…</p>}><Admin q={q} /></Suspense>
    case 'confidentialite': return <Privacy />
    case 'cgu': return <Terms />
    default: return <NotFound />
  }
}

export default function App() {
  return (
    <Provider>
      <a className="skip-link" href="#main-content">Aller au contenu principal</a>
      <Sidebar />
      <main id="main-content" className="app"><Routes /></main>
      <Consent />
      <ToastHost />
    </Provider>
  )
}
