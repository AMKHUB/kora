import { useEffect, useState } from 'react'
import { apiGet, apiPost, authErrorMessage, AuthUser, consumeAuthRedirectTokens, uploadFileToSignedUrl } from '../api'
import { GoogleAuthButton } from '../auth'
import { createIntentIdempotencyKey, SASPAY_COUNTRIES } from '../billing'
import { Icon, MaintenancePage, Select } from '../ui'

function KoraStudioIcon({ size = 34 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none" role="img" aria-label="Kora Studio">
      <defs>
        <linearGradient id="ks-nav-bg" x1="0" y1="0" x2="64" y2="64" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#1E1E26" />
          <stop offset="100%" stopColor="#0D0D11" />
        </linearGradient>
        <linearGradient id="ks-nav-ring" x1="6" y1="6" x2="58" y2="58" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#F2C334" />
          <stop offset="55%" stopColor="#FE2C55" />
          <stop offset="100%" stopColor="#2F9E3C" />
        </linearGradient>
      </defs>
      <rect x="2" y="2" width="60" height="60" rx="16" fill="url(#ks-nav-bg)" stroke="url(#ks-nav-ring)" strokeWidth="2.5" />
      <path d="M16 19.5C16 17.567 17.567 16 19.5 16H44.5C46.433 16 48 17.567 48 19.5V23H16V19.5Z" fill="#2A2A35" />
      <path d="M20 16L25 23H20.5L16 16.8V16H20Z" fill="#2F9E3C" />
      <path d="M31 16L36 23H31.5L26.5 16H31Z" fill="#F2C334" />
      <path d="M42 16L47 23H42.5L37.5 16H42Z" fill="#FE2C55" />
      <rect x="16" y="24" width="32" height="24" rx="5" fill="#17171D" stroke="rgba(255,255,255,0.14)" strokeWidth="1.5" />
      <path d="M27.5 30.2C27.5 29.05 28.75 28.34 29.74 28.92L39.4 34.72C40.36 35.3 40.36 36.7 39.4 37.28L29.74 43.08C28.75 43.66 27.5 42.95 27.5 41.8V30.2Z" fill="#F2C334" />
      <circle cx="48" cy="48" r="5" fill="#0D0D11" />
      <circle cx="48" cy="48" r="3" fill="#FE2C55" />
    </svg>
  )
}

type StudioTab = 'browse' | 'dashboard' | 'content' | 'upload' | 'channel' | 'analytics'

type EpisodeDraft = {
  localId: string
  dbId?: number
  season: number
  number: number
  title: string
  synopsis: string
  duration_min: number
  intro_end_sec: number
  file?: File
  videoPreviewUrl?: string
  hasUploadedVideo?: boolean
}

type StudioTitle = {
  id: number
  title: string
  type: 'series' | 'film' | 'doc' | 'short'
  year: number
  country: string
  original_language: string
  age_rating: string
  duration_min: number
  synopsis_short: string
  synopsis_long: string
  director: string
  cast: string
  genres: string[]
  status: 'draft' | 'published' | 'unpublished'
  poster_url: string
  backdrop_url: string
  episodes: EpisodeDraft[]
  rights_scope: 'world' | 'mali' | 'west_africa'
  access_tier: 'free' | 'premium'
  created_at: string
  channelName?: string
}

type PublicCatalogItem = {
  id: number
  title: string
  type: string
  year: number
  country: string
  age: string
  synopsis: string
  poster: string
  genres: string[]
}

type ChannelInfo = {
  channel_name: string
  bio: string
  country: string
}

const DEFAULT_CHANNEL: ChannelInfo = {
  channel_name: 'Mon Studio Kora',
  bio: 'Créations originales maliennes et africaines.',
  country: 'Mali'
}

const COUNTRIES = ['Mali', 'Sénégal', 'Côte d’Ivoire', 'Burkina Faso', 'Guinée', 'Niger', 'Ghana', 'Nigeria', 'Cameroun', 'Afrique du Sud', 'Diaspora', 'France']
const GENRES = ['Drame', 'Comédie', 'Romance', 'Action', 'Documentaire', 'Animation', 'Histoire', 'Musique', 'Jeunesse']
const LANGS: [string, string][] = [['fr', 'Français'], ['bm', 'Bambara'], ['wo', 'Wolof'], ['ff', 'Peul'], ['en', 'Anglais'], ['ar', 'Arabe']]
const AGES = ['Tous', '7+', '12+', '16+', '18+']
const TYPE_LABELS: Record<string, string> = { series: 'Série', serie: 'Série', film: 'Film', doc: 'Documentaire', short: 'Court-métrage', court: 'Court-métrage' }

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(String(r.result || ''))
    r.onerror = reject
    r.readAsDataURL(file)
  })
}

export default function StudioApp() {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [role, setRole] = useState('user')
  const [maintenanceMode, setMaintenanceMode] = useState(false)
  const [maintenanceMessage, setMaintenanceMessage] = useState('')
  const [authReady, setAuthReady] = useState(false)
  const [recoveryMode, setRecoveryMode] = useState(() => new URLSearchParams(location.search).has('recovery'))
  const [authNotice, setAuthNotice] = useState(() => authErrorMessage(new URLSearchParams(location.search).get('err')))
  const [tab, setTab] = useState<StudioTab>('browse')
  const [channel, setChannel] = useState<ChannelInfo>(DEFAULT_CHANNEL)
  const [titles, setTitles] = useState<StudioTitle[]>([])
  const [publicItems, setPublicItems] = useState<PublicCatalogItem[]>([])
  const [publicLoading, setPublicLoading] = useState(true)
  const [publicSearch, setPublicSearch] = useState('')
  const [editing, setEditing] = useState<StudioTitle | null>(null)
  const [toast, setToast] = useState<{ msg: string; kind: 'ok' | 'err' | 'info' } | null>(null)
  const [authModal, setAuthModal] = useState(false)

  const notify = (msg: string, kind: 'ok' | 'err' | 'info' = 'ok') => {
    setToast({ msg, kind })
    window.setTimeout(() => setToast(null), 4000)
  }

  const loadPublicCatalog = async () => {
    setPublicLoading(true)
    const r = await apiGet<{ items: PublicCatalogItem[] }>('/api/catalog')
    if (r.ok && Array.isArray(r.data?.items)) {
      setPublicItems(r.data.items.filter(it => typeof it.poster === 'string' && it.poster.trim().length > 0))
    } else {
      setPublicItems([])
    }
    setPublicLoading(false)
  }

  const loadCloudCreatorData = async () => {
    const r = await apiGet<{ channel: ChannelInfo | null; titles: StudioTitle[] }>('/api/studio?action=data')
    if (r.ok) {
      if (r.data.channel) setChannel(r.data.channel)
      setTitles(r.data.titles || [])
    }
  }

  const refreshSession = async () => {
    const r = await apiGet<{ user: AuthUser | null; role?: string; maintenanceMode?: boolean; maintenanceMessage?: string }>('/api/auth?action=session')
    const u = r.ok ? r.data.user : null
    setUser(u)
    setRole(r.ok ? (r.data.role || 'user') : 'user')
    setMaintenanceMode(Boolean(r.ok && r.data.maintenanceMode))
    if (r.ok && r.data.maintenanceMessage) setMaintenanceMessage(r.data.maintenanceMessage)
    setAuthReady(true)
    if (u) {
      setTab(t => t === 'browse' ? 'dashboard' : t)
      await loadCloudCreatorData()
    } else {
      setTitles([])
      setChannel(DEFAULT_CHANNEL)
    }
  }

  useEffect(() => {
    let active = true
    loadPublicCatalog()
    ;(async () => {
      const qs = new URLSearchParams(location.search)
      const confirmedFlag = qs.has('confirmed')
      const recoveryFlag = qs.has('recovery')
      const errCode = qs.get('err')
      const consumed = await consumeAuthRedirectTokens()
      if (!active) return
      await refreshSession()
      if (!active) return

      if (consumed.handled) {
        if (consumed.errCode) {
          setAuthNotice(authErrorMessage(consumed.errCode))
          setAuthModal(true)
        } else if (consumed.flow === 'recovery') {
          setRecoveryMode(true)
          setAuthModal(true)
        } else if (consumed.flow === 'confirm') {
          notify('Votre adresse e-mail est confirmée ! Bienvenue sur Kora Studio.', 'ok')
        }
      } else if (confirmedFlag) {
        history.replaceState(null, '', location.pathname)
        notify('Votre adresse e-mail est confirmée ! Bienvenue sur Kora Studio.', 'ok')
      } else if (recoveryFlag) {
        history.replaceState(null, '', location.pathname)
        setRecoveryMode(true)
        setAuthModal(true)
      } else if (errCode) {
        history.replaceState(null, '', location.pathname)
        setAuthNotice(authErrorMessage(errCode))
        setAuthModal(true)
      }
    })()
    return () => { active = false }
  }, [])

  const signOut = async () => {
    await apiPost('/api/auth?action=logout')
    setUser(null)
    setTitles([])
    setChannel(DEFAULT_CHANNEL)
    setEditing(null)
    setTab('browse')
    notify('Vous êtes déconnecté.', 'info')
  }

  const requireStudioAuth = (actionLabel?: string): boolean => {
    if (user) return true
    notify(actionLabel ? `Connectez-vous pour ${actionLabel}.` : 'Connectez-vous pour accéder à Kora Studio.', 'info')
    setAuthModal(true)
    return false
  }

  const startNewUpload = () => {
    if (!requireStudioAuth('mettre en ligne une série ou vidéo')) return
    setEditing(null)
    setTab('upload')
  }

  const openEditor = (t: StudioTitle) => {
    if (!requireStudioAuth('modifier une œuvre')) return
    setEditing(t)
    setTab('upload')
  }

  const togglePublish = async (t: StudioTitle) => {
    if (!requireStudioAuth('modifier la visibilité')) return
    const next: StudioTitle['status'] = t.status === 'published' ? 'draft' : 'published'
    if (next === 'published' && !t.poster_url.trim()) {
      notify('Ajoutez d’abord une page de couverture (affiche 2:3) avant de publier sur Kora.', 'err')
      return
    }
    const r = await apiPost('/api/studio?action=toggle-publish', { id: t.id, status: next })
    if (!r.ok) { notify(r.data.error || 'Erreur de publication.', 'err'); return }
    await Promise.all([loadCloudCreatorData(), loadPublicCatalog()])
    notify(next === 'published' ? `« ${t.title} » est publié sur Kora !` : `« ${t.title} » repassé en brouillon.`)
  }

  const deleteTitle = async (t: StudioTitle) => {
    if (!requireStudioAuth('supprimer une œuvre')) return
    if (!confirm(`Supprimer définitivement « ${t.title} » ?`)) return
    const r = await apiPost('/api/studio?action=delete-title', { id: t.id })
    if (!r.ok) { notify(r.data.error || 'Erreur de suppression.', 'err'); return }
    await Promise.all([loadCloudCreatorData(), loadPublicCatalog()])
    notify('Contenu supprimé.', 'info')
  }

  const saveChannel = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!requireStudioAuth('enregistrer votre chaîne')) return
    const r = await apiPost('/api/studio?action=channel', channel)
    if (!r.ok) { notify(r.data.error || 'Erreur de sauvegarde.', 'err'); return }
    notify('Chaîne créateur enregistrée.')
  }

  const publishedCount = titles.filter(t => t.status === 'published').length
  const totalEpisodes = titles.reduce((a, t) => a + (t.episodes?.length || 0), 0)

  const navItems: [StudioTab, string, string, boolean][] = [
    ['dashboard', 'Accueil', 'home', true],
    ['content', 'Publications', 'film', true],
    ['analytics', 'Analytique & Revenus', 'sparkles', true],
    ['channel', 'Ma chaîne', 'user', true],
    ['browse', 'Inspiration', 'grid', false]
  ]

  const filteredPublic = publicItems.filter(it => {
    const q = publicSearch.trim().toLowerCase()
    if (!q) return true
    return `${it.title} ${it.country} ${(it.genres || []).join(' ')} ${it.synopsis}`.toLowerCase().includes(q)
  })

  const needsAuthOnCurrentTab = tab !== 'browse' && !user

  return (
    <div className="tt-shell">
      <header className="tt-topbar">
        <a className="tt-brand" href="/studio/" onClick={e => { e.preventDefault(); setTab(user ? 'dashboard' : 'browse') }}>
          <KoraStudioIcon size={34} />
          <span className="tt-brand-name">
            Kora Studio
            <span className="tt-brand-pill">Créateurs</span>
          </span>
        </a>

        <div className="tt-top-right">
          {user && (
            <button type="button" className="btn accent" onClick={startNewUpload} aria-label="Téléverser">
              <Icon n="upload" s={17} />
              <span className="tt-btn-text">Téléverser</span>
            </button>
          )}
          <a className="btn" href="/" target="_blank" rel="noopener noreferrer" aria-label="Ouvrir Kora Spectateurs">
            <Icon n="tv" s={17} />
            <span className="tt-btn-text">Kora Spectateurs</span>
          </a>
          {user
            ? <button type="button" className="btn" onClick={signOut}>Déconnexion</button>
            : <button type="button" className="btn p" onClick={() => setAuthModal(true)}><Icon n="user" s={17} /><span>Connexion</span></button>}
        </div>
      </header>

      <div className="tt-mobile-tabs" role="tablist">
        <button type="button" className={'chip' + (tab === 'upload' ? ' on' : '')} onClick={startNewUpload}>+ Téléverser</button>
        {navItems.map(([k, label, _icon, locked]) => (
          <button key={k} type="button" role="tab" aria-selected={tab === k} className={'chip' + (tab === k ? ' on' : '')} onClick={() => setTab(k)}>
            {locked && !user ? '🔒 ' : ''}{label}
          </button>
        ))}
      </div>

      <div className="tt-layout">
        <aside className="tt-sidebar" aria-label="Navigation Kora Studio">
          <button type="button" className="tt-upload-cta" onClick={startNewUpload}>
            <Icon n="plus" s={20} />
            <span>Téléverser</span>
          </button>

          <div className="tt-nav-group">
            <span className="tt-nav-label">Gestion</span>
            {navItems.slice(0, 3).map(([k, label, icon, locked]) => (
              <button key={k} type="button" className={'tt-nav-item' + (tab === k ? ' on' : '')} onClick={() => setTab(k)}>
                <Icon n={locked && !user ? 'lock' : icon} s={19} />
                <span>{label}</span>
              </button>
            ))}
          </div>

          <div className="tt-nav-group">
            <span className="tt-nav-label">Création</span>
            {navItems.slice(3).map(([k, label, icon, locked]) => (
              <button key={k} type="button" className={'tt-nav-item' + (tab === k ? ' on' : '')} onClick={() => setTab(k)}>
                <Icon n={locked && !user ? 'lock' : icon} s={19} />
                <span>{label}</span>
              </button>
            ))}
          </div>

          <div className="tt-side-foot">
            <div className="tt-creator-chip">
              <span className="tt-avatar">{user ? (channel.channel_name || 'KS').slice(0, 2).toUpperCase() : 'KS'}</span>
              <div style={{ minWidth: 0 }}>
                <strong style={{ display: 'block', fontSize: '0.86rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {user ? channel.channel_name : 'Mode découverte'}
                </strong>
                <small className="mu" style={{ display: 'block', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {user ? (user.email || 'Créateur actif') : 'Connectez-vous'}
                </small>
              </div>
            </div>
            <a className="tt-nav-item" href="/" target="_blank" rel="noopener noreferrer">
              <Icon n="tv" s={18} />
              <span>Ouvrir Kora Spectateurs</span>
            </a>
          </div>
        </aside>

        <main className="tt-main">
          {!authReady ? (
            <p className="mu">Vérification de votre session…</p>
          ) : maintenanceMode && role !== 'admin' ? (
            <MaintenancePage
              message={maintenanceMessage}
              studio
              onLoginClick={() => setAuthModal(true)}
            />
          ) : tab === 'browse' ? (
            <section>
              {!user && (
                <div className="auth-banner">
                  <div>
                    <strong>Navigation en lecture seule</strong> — Vous pouvez uniquement parcourir le catalogue publié. Connectez-vous pour accéder à votre espace créateur, créer une chaîne et mettre en ligne vos séries.
                  </div>
                  <button type="button" className="btn p" onClick={() => setAuthModal(true)}>
                    <Icon n="user" s={18} />Se connecter / Créer un compte
                  </button>
                </div>
              )}

              <div className="page-head">
                <div>
                  <h1>Catalogue publié sur Kora ({publicItems.length})</h1>
                  <p className="mu">Seules les séries et œuvres ajoutées avec une page de couverture officielle apparaissent ici.</p>
                </div>
                {user && (
                  <button type="button" className="btn p" onClick={startNewUpload}>
                    <Icon n="upload" s={18} />Publier une série
                  </button>
                )}
              </div>

              {publicItems.length > 0 && (
                <div className="search-box">
                  <Icon n="search" s={18} />
                  <input
                    className="field"
                    value={publicSearch}
                    onChange={e => setPublicSearch(e.target.value)}
                    placeholder="Rechercher une œuvre publiée…"
                    aria-label="Rechercher dans le catalogue public"
                  />
                </div>
              )}

              {publicLoading ? (
                <p className="mu">Chargement du catalogue…</p>
              ) : !filteredPublic.length ? (
                <div className="empty-box">
                  <div className="drop-icon"><Icon n="film" s={26} /></div>
                  <h3>{publicItems.length ? 'Aucun résultat pour cette recherche' : 'Aucune série publiée pour le moment'}</h3>
                  <p className="mu">
                    {publicItems.length
                      ? 'Essayez un autre mot-clé.'
                      : 'Les œuvres d’exemple sans couverture ont été retirées. Connectez-vous pour publier la première série avec sa page de couverture et son synopsis.'}
                  </p>
                  {!user ? (
                    <button type="button" className="btn p" onClick={() => setAuthModal(true)}>
                      <Icon n="user" s={18} />Se connecter pour publier
                    </button>
                  ) : (
                    <button type="button" className="btn p" onClick={startNewUpload}>
                      <Icon n="upload" s={18} />Mettre en ligne la première série
                    </button>
                  )}
                </div>
              ) : (
                <div className="grid">
                  {filteredPublic.map(it => (
                    <a key={it.id} className="card" href={`/#/titre/${it.id}`} target="_blank" rel="noopener noreferrer">
                      <div className="card-media">
                        <div className="poster">
                          <img src={it.poster} alt={it.title} loading="lazy" />
                        </div>
                      </div>
                      <div className="card-info">
                        <b>{it.title}</b>
                        <small>{it.country} · {it.year} · {TYPE_LABELS[it.type] || it.type}</small>
                      </div>
                    </a>
                  ))}
                </div>
              )}
            </section>
          ) : needsAuthOnCurrentTab ? (
            <section className="panel" style={{ maxWidth: 480, margin: '24px auto' }}>
              <div style={{ textAlign: 'center', display: 'grid', justifyItems: 'center', gap: 10, marginBottom: 16 }}>
                <div className="drop-icon"><Icon n="lock" s={24} /></div>
                <h1>Connexion requise pour Kora Studio</h1>
                <p className="mu">
                  Tant que vous n’êtes pas connecté, vous pouvez uniquement parcourir le catalogue public. Connectez-vous pour gérer votre chaîne et mettre en ligne vos séries.
                </p>
              </div>
              <StudioAuthForm
                recovery={recoveryMode}
                initialMsg={authNotice}
                onSuccess={async (msg) => {
                  setRecoveryMode(false)
                  setAuthNotice('')
                  await refreshSession()
                  notify(msg)
                }}
                onBrowse={() => setTab('browse')}
              />
            </section>
          ) : (
            <>
              {tab === 'dashboard' && (
                <>
                  <div className="page-head">
                    <div>
                      <h1>Bonjour, {channel.channel_name}</h1>
                      <p className="mu">Gérez vos publications, mettez en ligne vos films et séries et suivez vos performances.</p>
                    </div>
                    <button type="button" className="btn accent" onClick={startNewUpload}>
                      <Icon n="upload" s={18} />Téléverser une œuvre
                    </button>
                  </div>

                  <div className="tt-kpi-grid">
                    <div className="tt-kpi">
                      <span className="tt-kpi-label">Œuvres créées</span>
                      <strong className="tt-kpi-val">{titles.length}</strong>
                      <span className="tt-kpi-sub">Catalogue studio</span>
                    </div>
                    <div className="tt-kpi">
                      <span className="tt-kpi-label">En ligne sur Kora</span>
                      <strong className="tt-kpi-val">{publishedCount}</strong>
                      <span className="tt-kpi-sub">Visibles par les spectateurs</span>
                    </div>
                    <div className="tt-kpi">
                      <span className="tt-kpi-label">Épisodes publiés</span>
                      <strong className="tt-kpi-val">{totalEpisodes}</strong>
                      <span className="tt-kpi-sub">Séries & Saisons</span>
                    </div>
                    <div className="tt-kpi">
                      <span className="tt-kpi-label">Brouillons</span>
                      <strong className="tt-kpi-val">{Math.max(0, titles.length - publishedCount)}</strong>
                      <span className="tt-kpi-sub">En attente de publication</span>
                    </div>
                  </div>

                  <section className="panel">
                    <div className="panel-head">
                      <h2>Vos créations récentes</h2>
                      {titles.length > 0 && <button type="button" className="lnk" onClick={() => setTab('content')}>Tout gérer</button>}
                    </div>
                    {!titles.length ? (
                      <div className="empty-box">
                        <div className="drop-icon"><Icon n="upload" s={26} /></div>
                        <h3>Publiez votre première série sur Kora</h3>
                        <p className="mu">Glissez vos fichiers vidéo, ajoutez votre page de couverture, votre synopsis et organisez vos saisons et épisodes en quelques minutes.</p>
                        <button type="button" className="btn p" onClick={startNewUpload}>
                          <Icon n="upload" s={18} />Commencer la mise en ligne
                        </button>
                      </div>
                    ) : (
                      <div className="studio-content-grid">
                        {titles.slice(0, 5).map(t => (
                          <div key={t.id} className="studio-row-card">
                            <div className="studio-row-thumb">
                              {t.poster_url ? <img src={t.poster_url} alt="" /> : <span>2:3</span>}
                            </div>
                            <div className="studio-row-info">
                              <strong>{t.title}</strong>
                              <div className="studio-row-meta">
                                <span className={t.status === 'published' ? 'pill-ok' : 'pill-spec'}>{t.status === 'published' ? 'Publié sur Kora' : 'Brouillon'}</span>
                                <span>{TYPE_LABELS[t.type]}</span>
                                <span>{t.country} · {t.year}</span>
                                {t.type === 'series' && <span>{t.episodes.length} épisode{t.episodes.length > 1 ? 's' : ''}</span>}
                              </div>
                              <p className="mu" style={{ fontSize: '0.86rem' }}>{t.synopsis_short || t.synopsis_long.slice(0, 140)}</p>
                            </div>
                            <div className="btns flush">
                              <button type="button" className="btn" onClick={() => openEditor(t)}><Icon n="edit" s={16} />Modifier</button>
                              {t.status === 'published' && <a className="btn" href={`/#/titre/${t.id}`}>Voir sur Kora</a>}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </section>
                </>
              )}

              {tab === 'content' && (
                <section>
                  <div className="page-head">
                    <div>
                      <h1>Contenus de la chaîne ({titles.length})</h1>
                      <p className="mu">Gérez vos séries, couvertures, synopsis, épisodes et leur visibilité sur Kora.</p>
                    </div>
                    <button type="button" className="btn p" onClick={startNewUpload}><Icon n="plus" s={18} />Nouvelle mise en ligne</button>
                  </div>
                  {!titles.length ? (
                    <div className="empty-box">
                      <p className="mu">Aucune série ou vidéo mise en ligne pour le moment.</p>
                      <button type="button" className="btn p" onClick={startNewUpload}>Mettre en ligne maintenant</button>
                    </div>
                  ) : (
                    <div className="studio-content-grid">
                      {titles.map(t => (
                        <div key={t.id} className="studio-row-card">
                          <div className="studio-row-thumb">
                            {t.poster_url ? <img src={t.poster_url} alt="" /> : <span>2:3</span>}
                          </div>
                          <div className="studio-row-info">
                            <strong>{t.title}</strong>
                            <div className="studio-row-meta">
                              <span className={t.status === 'published' ? 'pill-ok' : 'pill-spec'}>{t.status === 'published' ? 'Publié' : 'Brouillon'}</span>
                              <span>{TYPE_LABELS[t.type]}</span>
                              <span>{t.age_rating}</span>
                              {t.type === 'series' && <span>{t.episodes.length} épisode{t.episodes.length > 1 ? 's' : ''}</span>}
                            </div>
                          </div>
                          <div className="btns flush">
                            <button type="button" className="btn" onClick={() => openEditor(t)}>Éditer & Épisodes</button>
                            <button type="button" className="btn" onClick={() => togglePublish(t)}>{t.status === 'published' ? 'Passer en brouillon' : 'Publier'}</button>
                            <button type="button" className="btn danger" onClick={() => deleteTitle(t)}><Icon n="trash" s={16} /></button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </section>
              )}

              {tab === 'upload' && user && (
                <UploadWizard
                  key={editing ? `edit-${editing.id}` : 'new'}
                  initial={editing}
                  channel={channel}
                  onSaved={async (saved) => {
                    await Promise.all([loadCloudCreatorData(), loadPublicCatalog()])
                    notify(saved.status === 'published' ? `« ${saved.title} » est publié sur Kora !` : `« ${saved.title} » enregistré en brouillon.`)
                    setEditing(null)
                    setTab('content')
                  }}
                  onCancel={() => { setEditing(null); setTab('content') }}
                />
              )}

              {tab === 'channel' && (
                <section className="panel form">
                  <h1>Personnalisation de votre chaîne</h1>
                  <p className="mu">Ces informations identifient votre studio auprès des spectateurs sur Kora.</p>
                  <form className="form" onSubmit={saveChannel}>
                    <label>Nom de la chaîne / du studio
                      <input className="field" required value={channel.channel_name} onChange={e => setChannel(c => ({ ...c, channel_name: e.target.value }))} placeholder="Ex. Bamako Ciné Prod" />
                    </label>
                    <label>Pays d’origine
                      <Select value={channel.country} onChange={e => setChannel(c => ({ ...c, country: e.target.value }))}>
                        {COUNTRIES.map(c => <option key={c}>{c}</option>)}
                      </Select>
                    </label>
                    <label>Présentation / Biographie
                      <textarea className="field" rows={4} value={channel.bio} onChange={e => setChannel(c => ({ ...c, bio: e.target.value }))} placeholder="Présentez votre maison de production, vos réalisations et votre univers…" />
                    </label>
                    <div className="btns">
                      <button type="submit" className="btn p">Enregistrer la chaîne</button>
                    </div>
                  </form>
                </section>
              )}

              {tab === 'analytics' && (
                <>
                  <div className="page-head">
                    <div>
                      <h1>Analytique & Revenus Créateurs</h1>
                      <p className="mu">Suivez vos publications et demandez vos reversements Mobile Money directement depuis Kora Studio.</p>
                    </div>
                  </div>
                  <div className="tt-kpi-grid">
                    <div className="tt-kpi">
                      <span className="tt-kpi-label">Œuvres publiées</span>
                      <strong className="tt-kpi-val">{publishedCount}</strong>
                      <span className="tt-kpi-sub">Catalogue actif</span>
                    </div>
                    <div className="tt-kpi">
                      <span className="tt-kpi-label">Épisodes disponibles</span>
                      <strong className="tt-kpi-val">{totalEpisodes}</strong>
                      <span className="tt-kpi-sub">Disponibles en lecture</span>
                    </div>
                    <div className="tt-kpi">
                      <span className="tt-kpi-label">Partage revenus</span>
                      <strong className="tt-kpi-val">70 %</strong>
                      <span className="tt-kpi-sub">Publicité & Premium</span>
                    </div>
                    <div className="tt-kpi">
                      <span className="tt-kpi-label">Versements</span>
                      <strong className="tt-kpi-val">Mobile Money</strong>
                      <span className="tt-kpi-sub">Retraits directs</span>
                    </div>
                  </div>

                  <CreatorPayoutSection notify={notify} />
                </>
              )}
            </>
          )}
        </main>
      </div>

      <nav className="tt-bottom-dock" aria-label="Navigation mobile Kora Studio">
        <button type="button" className={tab === 'browse' ? 'on' : ''} onClick={() => setTab('browse')}>
          <Icon n="grid" s={19} />
          <span>Catalogue</span>
        </button>
        <button type="button" className={tab === 'dashboard' ? 'on' : ''} onClick={() => setTab('dashboard')}>
          <Icon n="home" s={19} />
          <span>Studio</span>
        </button>
        <button type="button" className="tt-dock-plus" onClick={startNewUpload} aria-label="Téléverser une œuvre">
          <Icon n="plus" s={22} />
        </button>
        <button type="button" className={tab === 'content' ? 'on' : ''} onClick={() => setTab('content')}>
          <Icon n="film" s={19} />
          <span>Contenu</span>
        </button>
        <button type="button" className={tab === 'analytics' ? 'on' : ''} onClick={() => setTab('analytics')}>
          <Icon n="sparkles" s={19} />
          <span>Revenus</span>
        </button>
      </nav>

      {authModal && (
        <div className="modal-backdrop" onClick={e => { if (e.target === e.currentTarget) setAuthModal(false) }}>
          <div className="modal" role="dialog" aria-modal="true" aria-label="Connexion Kora Studio" style={{ maxWidth: 440 }}>
            <div className="modal-head">
              <h2>{recoveryMode ? 'Nouveau mot de passe' : 'Connexion Kora Studio'}</h2>
              <button type="button" className="icon-btn" onClick={() => setAuthModal(false)} aria-label="Fermer"><Icon n="close" s={18} /></button>
            </div>
            <StudioAuthForm
              recovery={recoveryMode}
              initialMsg={authNotice}
              onSuccess={async (msg) => {
                setRecoveryMode(false)
                setAuthNotice('')
                setAuthModal(false)
                await refreshSession()
                notify(msg)
              }}
            />
          </div>
        </div>
      )}

      {toast && (
        <div className="toast-host" role="status">
          <div className={'toast ' + toast.kind}><span>{toast.msg}</span></div>
        </div>
      )}
    </div>
  )
}

/* ============================================================================
   FORMULAIRE AUTHENTIFICATION KORA STUDIO (Google Auth + E-mail + Confirmation)
   ============================================================================ */
function StudioAuthForm({ recovery, initialMsg = '', onSuccess, onBrowse }: {
  recovery?: boolean
  initialMsg?: string
  onSuccess: (msg: string) => Promise<void> | void
  onBrowse?: () => void
}) {
  const [signup, setSignup] = useState(false)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [pw, setPw] = useState('')
  const [pw2, setPw2] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(initialMsg)
  const [awaitingConfirm, setAwaitingConfirm] = useState(false)

  if (recovery) {
    const saveNewPw = async (e: React.FormEvent) => {
      e.preventDefault()
      if (pw.length < 6) { setMsg('Le mot de passe doit contenir au moins 6 caractères.'); return }
      if (pw !== pw2) { setMsg('Les deux mots de passe ne correspondent pas.'); return }
      setBusy(true); setMsg('')
      const r = await apiPost('/api/auth?action=update-password', { password: pw })
      setBusy(false)
      if (!r.ok) setMsg(r.data.error || 'Impossible de modifier le mot de passe.')
      else await onSuccess('Nouveau mot de passe enregistré !')
    }
    return (
      <form className="auth" onSubmit={saveNewPw}>
        <p className="mu">Définissez un nouveau mot de passe pour votre compte Kora Studio.</p>
        <label>Nouveau mot de passe
          <input className="field" type="password" required minLength={6} value={pw} onChange={e => setPw(e.target.value)} autoComplete="new-password" placeholder="6 caractères minimum" />
        </label>
        <label>Confirmer le mot de passe
          <input className="field" type="password" required minLength={6} value={pw2} onChange={e => setPw2(e.target.value)} autoComplete="new-password" placeholder="Retapez le mot de passe" />
        </label>
        <button type="submit" className="btn p wide-btn" disabled={busy}>{busy ? 'Enregistrement…' : 'Valider le mot de passe'}</button>
        {msg && <p className="status-box" role="status">{msg}</p>}
      </form>
    )
  }

  const resendConfirmation = async () => {
    if (!email.trim()) { setMsg('Saisissez votre adresse e-mail.'); return }
    setBusy(true); setMsg('')
    const r = await apiPost('/api/auth?action=resend', { email: email.trim(), app: 'studio' })
    setBusy(false)
    setMsg(r.ok ? (r.data.message || 'E-mail de confirmation renvoyé !') : (r.data.error || 'Impossible de renvoyer.'))
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    const cleanEmail = email.trim()
    setBusy(true); setMsg(''); setAwaitingConfirm(false)
    if (signup) {
      const r = await apiPost('/api/auth?action=signup', {
        email: cleanEmail,
        password: pw,
        name: name.trim() || 'Mon Studio Kora',
        app: 'studio'
      })
      setBusy(false)
      if (!r.ok) {
        setMsg(r.data.error || 'Inscription impossible.')
      } else if (r.data.alreadyExists) {
        setSignup(false)
        setMsg(r.data.message || 'Un compte existe déjà avec cette adresse e-mail.')
      } else if (r.data.user) {
        await onSuccess('Compte créateur prêt ! Bienvenue sur Kora Studio.')
      } else {
        setAwaitingConfirm(true)
        setMsg(r.data.message || 'Un e-mail de confirmation vient d’être envoyé. Vérifiez aussi vos spams.')
      }
    } else {
      const r = await apiPost('/api/auth?action=login', { email: cleanEmail, password: pw })
      setBusy(false)
      if (!r.ok) {
        setMsg(r.data.error || 'Connexion impossible.')
        if (r.data.needsConfirm) setAwaitingConfirm(true)
      } else {
        await onSuccess('Connecté à Kora Studio !')
      }
    }
  }

  return (
    <form className="auth" onSubmit={submit}>
      <GoogleAuthButton app="studio" />

      <div className="auth-sep" aria-hidden="true"><span>ou par e-mail</span></div>

      {signup && (
        <label>Nom de votre chaîne / studio
          <input className="field" value={name} onChange={e => setName(e.target.value)} placeholder="Ex. Bamako Ciné Prod" />
        </label>
      )}
      <label>Adresse e-mail
        <input className="field" type="email" required value={email} onChange={e => setEmail(e.target.value)} autoComplete="email" placeholder="vous@exemple.com" />
      </label>
      <label>Mot de passe
        <input className="field" type="password" required minLength={6} value={pw} onChange={e => setPw(e.target.value)} autoComplete={signup ? 'new-password' : 'current-password'} placeholder="6 caractères minimum" />
      </label>
      <button type="submit" className="btn p wide-btn" disabled={busy}>
        {busy ? 'Patientez…' : signup ? 'Créer mon compte créateur' : 'Se connecter'}
      </button>

      {msg && <p className="status-box" role="status">{msg}</p>}

      {awaitingConfirm && (
        <button type="button" className="btn wide-btn" disabled={busy} onClick={resendConfirmation}>
          Renvoyer l’e-mail de confirmation
        </button>
      )}

      <p className="mu auth-links">
        <button type="button" className="lnk" onClick={() => { setSignup(s => !s); setMsg(''); setAwaitingConfirm(false) }}>
          {signup ? 'J’ai déjà un compte Kora' : 'Nouveau ? Créer un compte créateur'}
        </button>
        {!signup && (
          <>
            {' · '}
            <a className="lnk" href={`/#/reinitialisation${email.trim() ? `?email=${encodeURIComponent(email.trim())}` : ''}`}>
              Mot de passe oublié ?
            </a>
          </>
        )}
      </p>

      {onBrowse && (
        <p className="mu auth-links">
          <button type="button" className="lnk" onClick={onBrowse}>Retourner parcourir le catalogue</button>
        </p>
      )}
    </form>
  )
}

/* ============================================================================
   ASSISTANT DE MISE EN LIGNE (4 ÉTAPES FAÇON YOUTUBE STUDIO)
   ============================================================================ */
function UploadWizard({ initial, channel, onSaved, onCancel }: {
  initial: StudioTitle | null
  channel: ChannelInfo
  onSaved: (t: { title: string; status: string }) => Promise<void>
  onCancel: () => void
}) {
  const [step, setStep] = useState(1)
  const [title, setTitle] = useState(initial?.title || '')
  const [type, setType] = useState<StudioTitle['type']>(initial?.type || 'series')
  const [year, setYear] = useState(String(initial?.year || new Date().getFullYear()))
  const [country, setCountry] = useState(initial?.country || channel.country || 'Mali')
  const [origLang, setOrigLang] = useState(initial?.original_language || 'fr')
  const [age, setAge] = useState(initial?.age_rating || 'Tous')
  const [dur, setDur] = useState(String(initial?.duration_min || 45))
  const [synShort, setSynShort] = useState(initial?.synopsis_short || '')
  const [synLong, setSynLong] = useState(initial?.synopsis_long || '')
  const [director, setDirector] = useState(initial?.director || channel.channel_name || '')
  const [cast, setCast] = useState(initial?.cast || '')
  const [genres, setGenres] = useState<string[]>(initial?.genres || ['Drame'])
  const [status, setStatus] = useState<StudioTitle['status']>(initial?.status || 'published')
  const [rightsScope, setRightsScope] = useState<StudioTitle['rights_scope']>(initial?.rights_scope || 'world')
  const [accessTier, setAccessTier] = useState<StudioTitle['access_tier']>(initial?.access_tier || 'free')

  const [posterUrl, setPosterUrl] = useState(initial?.poster_url || '')
  const [posterFile, setPosterFile] = useState<File | null>(null)
  const [backdropUrl, setBackdropUrl] = useState(initial?.backdrop_url || '')
  const [backdropFile, setBackdropFile] = useState<File | null>(null)
  const [mainVideoFile, setMainVideoFile] = useState<File | null>(null)
  const [mainVideoPreview, setMainVideoPreview] = useState('')
  const [subFile, setSubFile] = useState<File | null>(null)
  const [subLang, setSubLang] = useState('fr')
  const [aiSubBusy, setAiSubBusy] = useState(false)
  const [aiSubMsg, setAiSubMsg] = useState('')
  const [dragOver, setDragOver] = useState<string | null>(null)

  const [episodes, setEpisodes] = useState<EpisodeDraft[]>(
    initial?.episodes?.length
      ? initial.episodes
      : [{ localId: 'ep-1', season: 1, number: 1, title: 'Épisode 1', synopsis: '', duration_min: 45, intro_end_sec: 75 }]
  )

  const [busy, setBusy] = useState(false)
  const [progressPct, setProgressPct] = useState(0)
  const [statusMsg, setStatusMsg] = useState('')

  const handleCoverFile = async (file: File | undefined, kind: 'poster' | 'backdrop') => {
    if (!file || !file.type.startsWith('image/')) return
    const dataUrl = await readFileAsDataUrl(file)
    if (kind === 'poster') { setPosterFile(file); setPosterUrl(dataUrl) }
    else { setBackdropFile(file); setBackdropUrl(dataUrl) }
  }

  const handleMainVideo = (file: File | undefined) => {
    if (!file || !file.type.startsWith('video/')) return
    setMainVideoFile(file)
    setMainVideoPreview(URL.createObjectURL(file))
  }

  const addEpisodeRow = (seasonNum?: number) => {
    const targetSeason = seasonNum ?? (episodes.length ? episodes[episodes.length - 1].season : 1)
    const countInSeason = episodes.filter(e => e.season === targetSeason).length
    setEpisodes(list => [...list, {
      localId: 'ep-' + Date.now() + '-' + list.length,
      season: targetSeason,
      number: countInSeason + 1,
      title: `Épisode ${countInSeason + 1}`,
      synopsis: '',
      duration_min: +dur || 45,
      intro_end_sec: 75
    }])
  }

  const addNewSeason = () => {
    const nextSeason = episodes.length ? Math.max(...episodes.map(e => e.season)) + 1 : 1
    addEpisodeRow(nextSeason)
  }

  const updateEpisode = (localId: string, patch: Partial<EpisodeDraft>) => {
    setEpisodes(list => list.map(e => e.localId === localId ? { ...e, ...patch } : e))
  }

  const removeEpisode = (localId: string) => {
    setEpisodes(list => list.filter(e => e.localId !== localId))
  }

  const uploadSignedAsset = async (bucket: 'posters' | 'videos', prefix: string, file: File) => {
    const sign = await apiPost<{ signedUrl: string; path: string; publicUrl?: string }>('/api/studio?action=sign-upload', {
      bucket, prefix, fileName: file.name, mime: file.type, sizeBytes: file.size
    })
    if (!sign.ok || !sign.data.signedUrl) throw new Error(sign.data.error || 'Impossible de préparer le téléversement.')
    const up = await uploadFileToSignedUrl(sign.data.signedUrl, file)
    if (!up.ok) throw new Error(up.error || 'Échec du téléversement.')
    return { path: sign.data.path, publicUrl: sign.data.publicUrl || '' }
  }

  const publish = async () => {
    if (!title.trim()) { setStatusMsg('Donnez un titre à votre série ou film.'); setStep(2); return }
    const hasCover = !!posterFile || (posterUrl.trim().length > 0 && posterUrl.startsWith('http'))
    if (status === 'published' && !hasCover) {
      setStatusMsg('Une page de couverture (affiche 2:3) est obligatoire pour publier sur Kora.')
      setStep(1)
      return
    }

    setBusy(true); setProgressPct(15); setStatusMsg('Préparation de la mise en ligne…')

    try {
      let finalPoster = posterUrl.startsWith('http') ? posterUrl : ''
      let finalBackdrop = backdropUrl.startsWith('http') ? backdropUrl : ''

      if (posterFile) {
        setStatusMsg('Envoi de la page de couverture…'); setProgressPct(28)
        const res = await uploadSignedAsset('posters', 'poster', posterFile)
        finalPoster = res.publicUrl
      }
      if (backdropFile) {
        setStatusMsg('Envoi de la bannière…'); setProgressPct(42)
        const res = await uploadSignedAsset('posters', 'backdrop', backdropFile)
        finalBackdrop = res.publicUrl
      }

      if (status === 'published' && !finalPoster) {
        throw new Error('La page de couverture est obligatoire pour publier.')
      }

      // Upload des vidéos (film ou épisodes) avant enregistrement final côté serveur
      let mainVideoAsset: { storage_path: string; size_bytes: number; mime: string } | undefined
      const epPayloads = []

      if (type === 'series') {
        for (let i = 0; i < episodes.length; i++) {
          const ep = episodes[i]
          let videoAsset: { storage_path: string; size_bytes: number; mime: string } | undefined
          if (ep.file) {
            setStatusMsg(`Envoi vidéo S${ep.season}E${ep.number} (${ep.file.name})…`)
            const up = await uploadSignedAsset('videos', `ep-s${ep.season}e${ep.number}`, ep.file)
            videoAsset = { storage_path: up.path, size_bytes: ep.file.size, mime: ep.file.type }
          }
          epPayloads.push({
            localId: ep.localId,
            dbId: ep.dbId,
            season: ep.season,
            number: ep.number,
            title: ep.title,
            synopsis: ep.synopsis,
            duration_min: ep.duration_min,
            intro_end_sec: ep.intro_end_sec,
            videoAsset
          })
          setProgressPct(45 + Math.round(((i + 1) / Math.max(1, episodes.length)) * 35))
        }
      } else if (mainVideoFile) {
        setStatusMsg(`Envoi de la vidéo ${mainVideoFile.name}…`); setProgressPct(65)
        const up = await uploadSignedAsset('videos', 'film', mainVideoFile)
        mainVideoAsset = { storage_path: up.path, size_bytes: mainVideoFile.size, mime: mainVideoFile.type }
      }

      setStatusMsg('Enregistrement de la fiche et du synopsis…'); setProgressPct(88)
      const saveRes = await apiPost('/api/studio?action=save-title', {
        id: initial?.id,
        title: title.trim(),
        type,
        year: +year || new Date().getFullYear(),
        duration_min: +dur || 45,
        country: country.trim() || 'Mali',
        original_language: origLang || 'fr',
        age_rating: age,
        synopsis_short: synShort,
        synopsis_long: synLong,
        director,
        cast,
        genres,
        status,
        rights_scope: rightsScope,
        access_tier: accessTier,
        poster_url: finalPoster,
        backdrop_url: finalBackdrop,
        episodes: epPayloads,
        mainVideoAsset
      })
      if (!saveRes.ok) throw new Error(saveRes.data.error || 'Erreur lors de la sauvegarde.')

      // Si un fichier de sous-titres .vtt/.srt a été joint, on l'enregistre et le synchronise automatiquement
      if (subFile && saveRes.data?.id) {
        setStatusMsg('Synchronisation des sous-titres…'); setProgressPct(95)
        const vttText = await subFile.text()
        const label = LANGS.find(([c]) => c === subLang)?.[1] || 'Français'
        const firstEpId = type === 'series' ? saveRes.data.episodes?.[0]?.dbId : undefined
        await apiPost('/api/subtitles?action=save', {
          titleId: saveRes.data.id,
          episodeId: firstEpId,
          languageCode: subLang,
          languageLabel: label,
          content: vttText,
          offsetMs: 0,
          source: 'upload'
        })
      }

      setProgressPct(100)
      setBusy(false)
      await onSaved({ title: title.trim(), status })
    } catch (err: any) {
      setBusy(false)
      setStatusMsg(err?.message || 'Erreur lors de la mise en ligne.')
    }
  }

  return (
    <section>
      <div className="page-head">
        <div>
          <h1>{initial ? `Modifier « ${initial.title} »` : 'Mettre en ligne sur Kora Studio'}</h1>
          <p className="mu">Importez vos vidéos, votre page de couverture (obligatoire pour publier), votre synopsis et vos épisodes étape par étape.</p>
        </div>
        <button type="button" className="btn" onClick={onCancel}>Annuler</button>
      </div>

      <div className="stepper" role="tablist" aria-label="Étapes de mise en ligne">
        {([
          [1, 'Couverture & Fichiers'],
          [2, 'Détails & Synopsis'],
          [3, type === 'series' ? 'Saisons & Épisodes' : 'Vidéo principale'],
          [4, 'Visibilité & Publier']
        ] as [number, string][]).map(([n, label]) => (
          <button
            key={n}
            type="button"
            role="tab"
            aria-selected={step === n}
            className={'step-btn' + (step === n ? ' on' : step > n ? ' done' : '')}
            onClick={() => setStep(n)}
          >
            <span className="step-n">{step > n ? '✓' : n}</span>
            <span>{label}</span>
          </button>
        ))}
      </div>

      <div className="wizard-grid">
        <div className="panel form" style={{ maxWidth: 'none' }}>
          {step === 1 && (
            <>
              <h2>1. Page de couverture & bannière</h2>
              <div className="inline">
                <label>Format de l’œuvre
                  <Select value={type} onChange={e => setType(e.target.value as StudioTitle['type'])}>
                    <option value="series">Série (avec saisons & épisodes)</option>
                    <option value="film">Film</option>
                    <option value="doc">Documentaire</option>
                    <option value="short">Court-métrage</option>
                  </Select>
                </label>
              </div>

              <div
                className={'dropzone' + (dragOver === 'poster' ? ' drag' : '')}
                onDragOver={e => { e.preventDefault(); setDragOver('poster') }}
                onDragLeave={() => setDragOver(null)}
                onDrop={e => { e.preventDefault(); setDragOver(null); handleCoverFile(e.dataTransfer.files?.[0], 'poster') }}
              >
                <input type="file" accept="image/jpeg,image/png,image/webp" onChange={e => handleCoverFile(e.target.files?.[0], 'poster')} aria-label="Téléverser la page de couverture" />
                <div className="drop-icon"><Icon n="image" s={24} /></div>
                <strong>Glissez-déposez votre page de couverture (Affiche 2:3 · obligatoire)</strong>
                <span className="mu">JPG, PNG ou WebP · 5 Mo max · cliquez ou déposez ici</span>
                {posterFile && <span className="pill-ok">{posterFile.name}</span>}
              </div>

              <div
                className={'dropzone compact' + (dragOver === 'backdrop' ? ' drag' : '')}
                onDragOver={e => { e.preventDefault(); setDragOver('backdrop') }}
                onDragLeave={() => setDragOver(null)}
                onDrop={e => { e.preventDefault(); setDragOver(null); handleCoverFile(e.dataTransfer.files?.[0], 'backdrop') }}
              >
                <input type="file" accept="image/jpeg,image/png,image/webp" onChange={e => handleCoverFile(e.target.files?.[0], 'backdrop')} aria-label="Téléverser la bannière 16:9" />
                <strong>Bannière grand écran 16:9 (facultatif)</strong>
                <span className="mu">Affichée en haut de la fiche et en carrousel d’accueil</span>
                {backdropFile && <span className="pill-ok">{backdropFile.name}</span>}
              </div>

              {!busy && statusMsg && <p className="err-msg" role="alert">{statusMsg}</p>}

              <div className="btns">
                <button type="button" className="btn p" onClick={() => { setStatusMsg(''); setStep(2) }}>Continuer vers Détails & Synopsis →</button>
              </div>
            </>
          )}

          {step === 2 && (
            <>
              <h2>2. Titre, synopsis & métadonnées</h2>
              <label>Titre de votre {TYPE_LABELS[type].toLowerCase()} *
                <input className="field" required value={title} onChange={e => setTitle(e.target.value)} placeholder="Ex. Les Étoiles du Niger" />
              </label>
              <label>Accroche courte ({synShort.length}/180)
                <input className="field" maxLength={180} value={synShort} onChange={e => setSynShort(e.target.value)} placeholder="Une phrase forte qui donne envie de regarder…" />
              </label>
              <label>Synopsis complet
                <textarea className="field" rows={5} value={synLong} onChange={e => setSynLong(e.target.value)} placeholder="Décrivez l’univers, les personnages et les enjeux de votre œuvre…" />
              </label>
              <div className="inline">
                <label>Pays<Select value={country} onChange={e => setCountry(e.target.value)}>{COUNTRIES.map(c => <option key={c}>{c}</option>)}</Select></label>
                <label>Langue originale<Select value={origLang} onChange={e => setOrigLang(e.target.value)}>{LANGS.map(([c, n]) => <option key={c} value={c}>{n}</option>)}</Select></label>
                <label>Année<input className="field narrow" inputMode="numeric" value={year} onChange={e => setYear(e.target.value)} /></label>
                <label>Âge<Select value={age} onChange={e => setAge(e.target.value)}>{AGES.map(a => <option key={a}>{a}</option>)}</Select></label>
                <label>Durée (min)<input className="field narrow" inputMode="numeric" value={dur} onChange={e => setDur(e.target.value)} /></label>
              </div>
              <label>Réalisation<input className="field" value={director} onChange={e => setDirector(e.target.value)} placeholder="Nom du réalisateur ou de la réalisatrice" /></label>
              <label>Distribution (séparée par des virgules)<input className="field" value={cast} onChange={e => setCast(e.target.value)} placeholder="Ex. Awa Diakité, Moussa Keïta" /></label>
              <div>
                <small className="mu" style={{ display: 'block', marginBottom: 6 }}>Genres</small>
                <div className="chips">
                  {GENRES.map(g => (
                    <button key={g} type="button" className={'chip' + (genres.includes(g) ? ' on' : '')} onClick={() => setGenres(gs => gs.includes(g) ? gs.filter(x => x !== g) : [...gs, g])}>
                      {g}
                    </button>
                  ))}
                </div>
              </div>
              {!busy && statusMsg && <p className="err-msg" role="alert">{statusMsg}</p>}
              <div className="btns">
                <button type="button" className="btn" onClick={() => setStep(1)}>← Retour</button>
                <button type="button" className="btn p" onClick={() => { setStatusMsg(''); setStep(3) }}>
                  Continuer vers {type === 'series' ? 'Saisons & Épisodes' : 'la vidéo'} →
                </button>
              </div>
            </>
          )}

          {step === 3 && (
            type === 'series' ? (
              <>
                <div className="panel-head">
                  <h2>3. Saisons & Épisodes ({episodes.length})</h2>
                  <div className="btns flush">
                    <button type="button" className="btn" onClick={() => addEpisodeRow()}><Icon n="plus" s={16} />+ Épisode</button>
                    <button type="button" className="btn" onClick={addNewSeason}><Icon n="plus" s={16} />+ Nouvelle saison</button>
                  </div>
                </div>
                <p className="mu">Importez la vidéo et le synopsis de chaque épisode de votre série.</p>
                {episodes.map(ep => (
                  <div key={ep.localId} className="ep-studio-item">
                    <div className="ep-studio-head">
                      <span className="pill-accent">Saison {ep.season} · Épisode {ep.number}</span>
                      {episodes.length > 1 && <button type="button" className="lnk small-lnk" onClick={() => removeEpisode(ep.localId)}>Supprimer</button>}
                    </div>
                    <div className="inline" style={{ margin: 0 }}>
                      <label>Titre de l’épisode
                        <input className="field" value={ep.title} onChange={e => updateEpisode(ep.localId, { title: e.target.value })} />
                      </label>
                      <label>Durée (min)
                        <input className="field narrow" inputMode="numeric" value={ep.duration_min} onChange={e => updateEpisode(ep.localId, { duration_min: +e.target.value || 45 })} />
                      </label>
                      <label>Fin d’intro (sec)
                        <input className="field narrow" inputMode="numeric" value={ep.intro_end_sec} onChange={e => updateEpisode(ep.localId, { intro_end_sec: +e.target.value || 0 })} />
                      </label>
                    </div>
                    <label>Synopsis de l’épisode
                      <textarea className="field" rows={2} value={ep.synopsis} onChange={e => updateEpisode(ep.localId, { synopsis: e.target.value })} placeholder="Résumé de cet épisode…" />
                    </label>
                    <div className="dropzone compact">
                      <input
                        type="file"
                        accept="video/mp4,video/webm,video/quicktime"
                        onChange={e => {
                          const f = e.target.files?.[0]
                          if (f) updateEpisode(ep.localId, { file: f, videoPreviewUrl: URL.createObjectURL(f) })
                        }}
                        aria-label={`Fichier vidéo S${ep.season} E${ep.number}`}
                      />
                      {ep.file ? (
                        <span className="pill-ok">Vidéo sélectionnée : {ep.file.name} ({Math.max(1, Math.round(ep.file.size / 1048576))} Mo)</span>
                      ) : ep.hasUploadedVideo ? (
                        <span className="pill-ok">Vidéo déjà en ligne · cliquez pour remplacer</span>
                      ) : (
                        <>
                          <strong>Déposez ou choisissez la vidéo de l’épisode</strong>
                          <span className="mu">Formats acceptés : MP4, WebM ou MOV</span>
                        </>
                      )}
                    </div>
                  </div>
                ))}
                <div className="btns">
                  <button type="button" className="btn" onClick={() => setStep(2)}>← Retour</button>
                  <button type="button" className="btn p" onClick={() => setStep(4)}>Continuer vers Visibilité →</button>
                </div>
              </>
            ) : (
              <>
                <h2>3. Fichier vidéo principal</h2>
                <div
                  className={'dropzone' + (dragOver === 'video' ? ' drag' : '')}
                  onDragOver={e => { e.preventDefault(); setDragOver('video') }}
                  onDragLeave={() => setDragOver(null)}
                  onDrop={e => { e.preventDefault(); setDragOver(null); handleMainVideo(e.dataTransfer.files?.[0]) }}
                >
                  <input type="file" accept="video/mp4,video/webm,video/quicktime" onChange={e => handleMainVideo(e.target.files?.[0])} aria-label="Téléverser le fichier vidéo" />
                  <div className="drop-icon"><Icon n="upload" s={26} /></div>
                  <strong>Glissez-déposez votre fichier vidéo ici</strong>
                  <span className="mu">Formats acceptés : MP4, WebM ou MOV</span>
                  {mainVideoFile && <span className="pill-ok">{mainVideoFile.name} ({Math.max(1, Math.round(mainVideoFile.size / 1048576))} Mo)</span>}
                </div>
                {mainVideoPreview && (
                  <div className="preview-banner">
                    <video src={mainVideoPreview} controls playsInline />
                  </div>
                )}

                <div className="ep-studio-item">
                  <div className="ep-studio-head">
                    <strong>Sous-titres synchronisés</strong>
                    <Select value={subLang} onChange={e => setSubLang(e.target.value)} aria-label="Langue des sous-titres" style={{ minHeight: 36 }}>
                      {LANGS.map(([c, n]) => <option key={c} value={c}>{n}</option>)}
                    </Select>
                  </div>
                  <div className="btns flush">
                    <label className="btn" style={{ cursor: 'pointer' }}>
                      <Icon n="upload" s={16} />
                      <span>{subFile ? `Fichier : ${subFile.name}` : 'Importer des sous-titres'}</span>
                      <input type="file" accept=".vtt,.srt,text/vtt,text/plain" style={{ display: 'none' }} onChange={e => setSubFile(e.target.files?.[0] || null)} />
                    </label>
                    {initial?.id && (
                      <button
                        type="button"
                        className="btn p"
                        disabled={aiSubBusy}
                        onClick={async () => {
                          setAiSubBusy(true); setAiSubMsg('Analyse de la voix et génération des sous-titres…')
                          const label = LANGS.find(([c]) => c === subLang)?.[1] || 'Français'
                          const r = await apiPost<{ cues: number }>('/api/subtitles?action=generate', {
                            titleId: initial.id,
                            languageCode: subLang,
                            languageLabel: label
                          })
                          setAiSubBusy(false)
                          setAiSubMsg(r.ok ? `Sous-titres ${label} synchronisés (${r.data.cues} répliques) !` : (r.data.error || 'Erreur IA.'))
                        }}
                      >
                        <Icon n="sparkles" s={16} />
                        {aiSubBusy ? 'Synchronisation…' : 'Synchroniser depuis la voix (IA)'}
                      </button>
                    )}
                  </div>
                  {aiSubMsg && <p className="status-box" role="status">{aiSubMsg}</p>}
                </div>

                <div className="btns">
                  <button type="button" className="btn" onClick={() => setStep(2)}>← Retour</button>
                  <button type="button" className="btn p" onClick={() => setStep(4)}>Continuer vers Visibilité →</button>
                </div>
              </>
            )
          )}

          {step === 4 && (
            <>
              <h2>4. Visibilité, droits & publication</h2>
              <div className="vis-cards" role="radiogroup" aria-label="Visibilité de publication">
                <button type="button" role="radio" aria-checked={status === 'published'} className={'vis-card' + (status === 'published' ? ' on' : '')} onClick={() => setStatus('published')}>
                  <strong>Publique (En ligne sur Kora)</strong>
                  <small className="mu">Visible immédiatement dans le catalogue Kora avec couverture et synopsis.</small>
                </button>
                <button type="button" role="radio" aria-checked={status === 'draft'} className={'vis-card' + (status === 'draft' ? ' on' : '')} onClick={() => setStatus('draft')}>
                  <strong>Brouillon (Privé)</strong>
                  <small className="mu">Visible uniquement dans votre espace Kora Studio jusqu’à publication.</small>
                </button>
              </div>

              <div className="inline">
                <label>Territoires de diffusion
                  <Select value={rightsScope} onChange={e => setRightsScope(e.target.value as any)}>
                    <option value="world">Monde entier & Diaspora</option>
                    <option value="west_africa">Afrique de l’Ouest uniquement</option>
                    <option value="mali">Mali uniquement</option>
                  </Select>
                </label>
                <label>Modèle d’accès
                  <Select value={accessTier} onChange={e => setAccessTier(e.target.value as any)}>
                    <option value="free">Gratuit avec publicité (partage revenus pub)</option>
                    <option value="premium">Réservé Kora Premium & Famille</option>
                  </Select>
                </label>
              </div>

              {busy && (
                <div>
                  <p className="mu">{statusMsg}</p>
                  <div className="upload-bar"><span style={{ width: `${progressPct}%` }} /></div>
                </div>
              )}
              {!busy && statusMsg && <p className="err-msg" role="alert">{statusMsg}</p>}

              <div className="btns">
                <button type="button" className="btn" onClick={() => setStep(3)} disabled={busy}>← Retour</button>
                <button type="button" className="btn p" onClick={publish} disabled={busy}>
                  <Icon n="upload" s={18} />
                  {busy ? 'Mise en ligne…' : status === 'published' ? 'Publier sur Kora' : 'Enregistrer en brouillon'}
                </button>
              </div>
            </>
          )}
        </div>

        {/* Colonne droite : Simulateur mobile / aperçu TikTok Studio en direct */}
        <aside className="tt-phone-preview" aria-label="Aperçu en direct">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <strong style={{ fontSize: '0.88rem' }}>Aperçu spectateur en direct</strong>
            <span className="pill-accent">{TYPE_LABELS[type]}</span>
          </div>
          <div className="tt-phone-frame">
            <div className="tt-phone-notch" aria-hidden="true" />
            <div className="tt-phone-screen">
              {mainVideoPreview ? (
                <video src={mainVideoPreview} muted loop autoPlay playsInline />
              ) : posterUrl ? (
                <img src={posterUrl} alt="Aperçu couverture" />
              ) : null}
              <div className="tt-phone-scrim" aria-hidden="true" />
              <div className="tt-phone-meta">
                <span className="pill-spec" style={{ justifySelf: 'start' }}>{country} · {year} · {age}</span>
                <strong>{title || 'Titre de votre œuvre'}</strong>
                <p>{synShort || synLong.slice(0, 110) || 'Votre synopsis et votre affiche apparaîtront ici sur l’application Kora.'}</p>
              </div>
            </div>
          </div>
          <div className="tt-spec-strip" style={{ marginTop: 0 }}>
            <div className="tt-spec-box">
              <strong>Visibilité</strong>
              <span>{status === 'published' ? 'Publique sur Kora' : 'Brouillon privé'}</span>
            </div>
            <div className="tt-spec-box">
              <strong>Format & Épisodes</strong>
              <span>{type === 'series' ? `${Math.max(1, ...episodes.map(e => e.season))} saison(s) · ${episodes.length} ép.` : `${dur} min`}</span>
            </div>
          </div>
        </aside>
      </div>
    </section>
  )
}

function CreatorPayoutSection({ notify }: { notify: (msg: string, kind?: 'ok' | 'err' | 'info') => void }) {
  const [countryIso, setCountryIso] = useState('ML')
  const [method, setMethod] = useState('orange_ml')
  const [msisdn, setMsisdn] = useState('')
  const [amount, setAmount] = useState('10000.00')
  const [desc, setDesc] = useState('Reversement revenus créateur Kora Studio')
  const [idempKey, setIdempKey] = useState(() => createIntentIdempotencyKey('payout'))
  const [payouts, setPayouts] = useState<any[]>([])
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')

  const activeCountry = SASPAY_COUNTRIES.find(c => c.iso === countryIso) || SASPAY_COUNTRIES[0]

  const loadPayouts = async () => {
    const r = await apiGet<{ payouts: any[] }>('/api/checkout?action=payouts')
    if (r.ok) setPayouts(r.data.payouts || [])
  }

  useEffect(() => { loadPayouts() }, [])

  const onCountryChange = (iso: string) => {
    setCountryIso(iso)
    const c = SASPAY_COUNTRIES.find(x => x.iso === iso)
    if (c && c.networks.length) setMethod(c.networks[0].code)
    setIdempKey(createIntentIdempotencyKey('payout'))
  }

  const submitPayout = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!msisdn.trim()) return
    setBusy(true); setMsg('')
    const r = await apiPost('/api/checkout?action=payout-init', {
      country: countryIso,
      currency: activeCountry.currency,
      method,
      msisdn: msisdn.trim(),
      amount: amount.trim(),
      description: desc.trim(),
      idempotencyKey: idempKey
    })
    setBusy(false)
    if (!r.ok) {
      if (r.data.code && r.data.code !== 'network_error' && r.data.code !== 'rate_limited') {
        setIdempKey(createIntentIdempotencyKey('payout'))
      }
      setMsg(r.data.error || 'Retrait impossible.')
      return
    }
    setIdempKey(createIntentIdempotencyKey('payout'))
    setMsisdn('')
    setMsg(`Demande de retrait enregistrée (${r.data.payoutId}). Cliquez sur « Vérifier » pour suivre son avancement.`)
    notify('Demande de retrait enregistrée !', 'ok')
    loadPayouts()
  }

  const verifyOne = async (payoutId: string) => {
    setBusy(true)
    const r = await apiPost('/api/checkout?action=payout-verify', { payoutId })
    setBusy(false)
    if (!r.ok) {
      notify(r.data.error || 'Vérification impossible.', 'err')
      return
    }
    const label = r.data.status === 'SUCCESS' ? 'Validé' : r.data.status === 'FAILED' ? 'Refusé' : 'En cours'
    notify(`Statut du retrait : ${label}`, r.data.status === 'SUCCESS' ? 'ok' : 'info')
    loadPayouts()
  }

  return (
    <section className="panel form" style={{ maxWidth: 'none', marginTop: 18 }}>
      <div>
        <h2>Retrait de revenus Mobile Money</h2>
        <p className="mu">
          Demandez un reversement direct vers votre numéro Mobile Money dans la devise de votre pays.
        </p>
      </div>

      <form className="form" style={{ maxWidth: 'none' }} onSubmit={submitPayout}>
        <div className="inline">
          <label>Pays du bénéficiaire
            <Select value={countryIso} onChange={e => onCountryChange(e.target.value)}>
              {SASPAY_COUNTRIES.map(c => (
                <option key={c.iso} value={c.iso}>{c.name} ({c.currency})</option>
              ))}
            </Select>
          </label>
          <label>Opérateur Mobile Money
            <Select value={method} onChange={e => { setMethod(e.target.value); setIdempKey(createIntentIdempotencyKey('payout')) }}>
              {activeCountry.networks.map(n => (
                <option key={n.code} value={n.code}>{n.label}</option>
              ))}
            </Select>
          </label>
          <label>Montant ({activeCountry.currency})
            <input
              className="field narrow"
              required
              value={amount}
              onChange={e => { setAmount(e.target.value); setIdempKey(createIntentIdempotencyKey('payout')) }}
              placeholder="10000.00"
            />
          </label>
        </div>

        <div className="inline">
          <label>Numéro Mobile Money du bénéficiaire
            <input
              className="field"
              required
              inputMode="tel"
              placeholder={`${activeCountry.dialCode} 76 00 00 00`}
              value={msisdn}
              onChange={e => { setMsisdn(e.target.value); setIdempKey(createIntentIdempotencyKey('payout')) }}
            />
          </label>
          <label>Motif
            <input className="field" value={desc} onChange={e => setDesc(e.target.value)} />
          </label>
        </div>

        {msg && <p className="status-box" role="status">{msg}</p>}

        <div className="btns">
          <button type="submit" className="btn p" disabled={busy}>
            <Icon n="sparkles" s={18} />
            {busy ? 'Initialisation du retrait…' : `Demander le retrait (${amount} ${activeCountry.currency})`}
          </button>
        </div>
      </form>

      {payouts.length > 0 && (
        <div className="tw" style={{ marginTop: 12 }}>
          <table>
            <thead>
              <tr><th>Référence</th><th>Pays / Réseau</th><th>Numéro</th><th>Montant</th><th>Net reçu</th><th>Statut</th><th>Action</th></tr>
            </thead>
            <tbody>
              {payouts.map(p => (
                <tr key={p.id}>
                  <td>{p.saspay_payout_id || p.idempotency_key}</td>
                  <td>{p.country} · {p.method}</td>
                  <td>{p.recipient_msisdn}</td>
                  <td>{p.amount} {p.currency}</td>
                  <td>{p.net_amount ? `${p.net_amount} ${p.currency}` : '—'}</td>
                  <td>
                    <span className={p.status === 'SUCCESS' ? 'pill-ok' : p.status === 'FAILED' ? 'pill-accent' : 'pill-spec'}>
                      {p.status === 'SUCCESS' ? 'Validé' : p.status === 'FAILED' ? 'Refusé' : 'En cours'}
                    </span>
                  </td>
                  <td>
                    {p.saspay_payout_id && (
                      <button type="button" className="lnk" disabled={busy} onClick={() => verifyOne(p.saspay_payout_id)}>
                        Vérifier
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
