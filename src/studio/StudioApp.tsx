import { useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { sb } from '../supabase'
import { Icon, KoraSymbol } from '../ui'

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
  type: 'series' | 'film' | 'doc' | 'short'
  year: number
  country: string
  age_rating: string
  synopsis_short: string
  poster_url: string
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
const TYPE_LABELS: Record<string, string> = { series: 'Série', film: 'Film', doc: 'Documentaire', short: 'Court-métrage' }

const safeName = (n: string) => n.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9._-]/g, '_')

const frAuthError = (m: string) =>
  /invalid login/i.test(m) ? 'E-mail ou mot de passe incorrect.'
    : /email not confirmed/i.test(m) ? 'Votre adresse e-mail n’est pas encore confirmée. Vérifiez vos spams ou cliquez sur « Renvoyer l’e-mail de confirmation ».'
      : /already registered|user_repeated_signup/i.test(m) ? 'Cet e-mail possède déjà un compte Kora. Connectez-vous ou réinitialisez votre mot de passe.'
        : /password should be/i.test(m) ? 'Mot de passe trop court (6 caractères minimum).'
          : /rate limit|security purposes|only request this after/i.test(m) ? 'Trop d’e-mails envoyés récemment (limite anti-spam Supabase). Patientez quelques minutes puis réessayez.'
            : m

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(String(r.result || ''))
    r.onerror = reject
    r.readAsDataURL(file)
  })
}

export default function StudioApp() {
  const [session, setSession] = useState<Session | null>(null)
  const [authReady, setAuthReady] = useState(!sb)
  const [recoveryMode, setRecoveryMode] = useState(() => new URLSearchParams(location.search).has('recovery'))
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
    if (!sb) { setPublicItems([]); setPublicLoading(false); return }
    setPublicLoading(true)
    const { data } = await sb
      .from('titles')
      .select('id,title,type,year,country,age_rating,synopsis_short,poster_url,title_genres(genres(name))')
      .eq('status', 'published')
      .not('poster_url', 'is', null)
      .neq('poster_url', '')
      .order('id', { ascending: false })
    const mapped: PublicCatalogItem[] = (data || [])
      .filter((t: any) => typeof t.poster_url === 'string' && t.poster_url.trim().length > 0)
      .map((t: any) => ({
        id: t.id,
        title: t.title,
        type: t.type,
        year: t.year || new Date().getFullYear(),
        country: t.country || 'Mali',
        age_rating: t.age_rating || 'Tous',
        synopsis_short: t.synopsis_short || '',
        poster_url: t.poster_url,
        genres: (t.title_genres || []).map((x: any) => x.genres?.name).filter(Boolean)
      }))
    setPublicItems(mapped)
    setPublicLoading(false)
  }

  useEffect(() => {
    loadPublicCatalog()
    if (!sb) return
    sb.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setAuthReady(true)
      if (data.session) setTab(t => t === 'browse' ? 'dashboard' : t)
    })
    const { data } = sb.auth.onAuthStateChange((event, s) => {
      setSession(s)
      setAuthReady(true)
      if (event === 'PASSWORD_RECOVERY') {
        setRecoveryMode(true)
        setAuthModal(true)
      } else if (event === 'SIGNED_IN' && s) {
        setAuthModal(false)
        setTab(t => t === 'browse' ? 'dashboard' : t)
      } else if (event === 'SIGNED_OUT') {
        setTitles([])
        setChannel(DEFAULT_CHANNEL)
        setEditing(null)
        setTab('browse')
      }
    })
    return () => data.subscription.unsubscribe()
  }, [])

  const loadCloudCreatorData = async (uid: string) => {
    if (!sb) return
    const [ch, ti] = await Promise.all([
      sb.from('creator_channels').select('channel_name,bio,country').eq('account_id', uid).maybeSingle(),
      sb.from('titles')
        .select('id,title,type,year,country,original_language,age_rating,duration_min,synopsis_short,synopsis_long,status,poster_url,backdrop_url,created_at,title_genres(genres(name)),title_people(role,position,people(name)),seasons(number,episodes(id,number,title,synopsis,duration_min,intro_end_sec,video_assets(id)))')
        .eq('creator_id', uid)
        .order('id', { ascending: false })
    ])
    if (ch.data) setChannel({ channel_name: ch.data.channel_name, bio: ch.data.bio || '', country: ch.data.country || 'Mali' })
    if (ti.data) {
      const mapped: StudioTitle[] = ti.data.map((t: any) => ({
        id: t.id,
        title: t.title,
        type: t.type,
        year: t.year || new Date().getFullYear(),
        country: t.country || 'Mali',
        original_language: t.original_language || 'fr',
        age_rating: t.age_rating || 'Tous',
        duration_min: t.duration_min || 45,
        synopsis_short: t.synopsis_short || '',
        synopsis_long: t.synopsis_long || '',
        director: (t.title_people || []).filter((x: any) => x.role === 'director').map((x: any) => x.people?.name).filter(Boolean).join(', '),
        cast: (t.title_people || []).filter((x: any) => x.role === 'actor').sort((a: any, b: any) => a.position - b.position).map((x: any) => x.people?.name).filter(Boolean).join(', '),
        genres: (t.title_genres || []).map((x: any) => x.genres?.name).filter(Boolean),
        status: t.status,
        poster_url: t.poster_url || '',
        backdrop_url: t.backdrop_url || '',
        episodes: (t.seasons || []).sort((a: any, b: any) => a.number - b.number).flatMap((s: any) =>
          (s.episodes || []).sort((a: any, b: any) => a.number - b.number).map((e: any) => ({
            localId: `db-${e.id}`,
            dbId: e.id,
            season: s.number,
            number: e.number,
            title: e.title,
            synopsis: e.synopsis || '',
            duration_min: e.duration_min || 45,
            intro_end_sec: e.intro_end_sec || 75,
            hasUploadedVideo: !!(e.video_assets?.length)
          }))
        ),
        rights_scope: 'world',
        access_tier: 'free',
        created_at: t.created_at
      }))
      setTitles(mapped)
    }
  }

  useEffect(() => {
    if (session?.user.id) loadCloudCreatorData(session.user.id)
    else setTitles([])
  }, [session?.user.id])

  const requireStudioAuth = (actionLabel?: string): boolean => {
    if (session) return true
    notify(actionLabel ? `Connectez-vous pour ${actionLabel}.` : 'Connectez-vous pour accéder à Kora Studio.', 'info')
    setAuthModal(true)
    return false
  }

  const openTab = (next: StudioTab) => {
    if (next !== 'browse' && !session) {
      setTab(next)
      return
    }
    setTab(next)
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
    if (!sb || !requireStudioAuth('modifier la visibilité')) return
    const next: StudioTitle['status'] = t.status === 'published' ? 'draft' : 'published'
    if (next === 'published' && !t.poster_url.trim()) {
      notify('Ajoutez d’abord une page de couverture (affiche 2:3) avant de publier sur Kora.', 'err')
      return
    }
    const { error } = await sb.from('titles').update({ status: next, updated_at: new Date().toISOString() }).eq('id', t.id)
    if (error) { notify(error.message, 'err'); return }
    await Promise.all([loadCloudCreatorData(session!.user.id), loadPublicCatalog()])
    notify(next === 'published' ? `« ${t.title} » est publié sur Kora !` : `« ${t.title} » repassé en brouillon.`)
  }

  const deleteTitle = async (t: StudioTitle) => {
    if (!sb || !requireStudioAuth('supprimer une œuvre')) return
    if (!confirm(`Supprimer définitivement « ${t.title} » ?`)) return
    const { error } = await sb.from('titles').delete().eq('id', t.id)
    if (error) { notify(error.message, 'err'); return }
    await Promise.all([loadCloudCreatorData(session!.user.id), loadPublicCatalog()])
    notify('Contenu supprimé.', 'info')
  }

  const saveChannel = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!sb || !requireStudioAuth('enregistrer votre chaîne')) return
    const { error } = await sb.from('creator_channels').upsert({
      account_id: session!.user.id,
      channel_name: channel.channel_name.trim() || 'Mon Studio Kora',
      bio: channel.bio.trim(),
      country: channel.country,
      updated_at: new Date().toISOString()
    })
    if (error) { notify(error.message, 'err'); return }
    notify('Chaîne créateur enregistrée.')
  }

  const publishedCount = titles.filter(t => t.status === 'published').length
  const totalEpisodes = titles.reduce((a, t) => a + (t.episodes?.length || 0), 0)

  const navItems: [StudioTab, string, string, boolean][] = [
    ['browse', 'Catalogue public', 'grid', false],
    ['dashboard', 'Tableau de bord', 'home', true],
    ['content', 'Mes séries & vidéos', 'film', true],
    ['upload', 'Mettre en ligne', 'upload', true],
    ['channel', 'Ma chaîne', 'user', true],
    ['analytics', 'Statistiques & Revenus', 'sparkles', true]
  ]

  const filteredPublic = publicItems.filter(it => {
    const q = publicSearch.trim().toLowerCase()
    if (!q) return true
    return `${it.title} ${it.country} ${it.genres.join(' ')} ${it.synopsis_short}`.toLowerCase().includes(q)
  })

  const needsAuthOnCurrentTab = tab !== 'browse' && !session

  return (
    <div className="studio-shell">
      <header className="studio-topbar">
        <a className="studio-logo" href="/studio/" onClick={e => { e.preventDefault(); setTab(session ? 'dashboard' : 'browse') }}>
          <KoraSymbol size={28} />
          <span className="kora-wordmark" style={{ fontSize: 22, color: '#EDEBE4' }}>Kora</span>
          <span className="studio-tag">Studio</span>
        </a>

        <div className="studio-top-acts">
          {session && (
            <button type="button" className="btn p" onClick={startNewUpload}>
              <Icon n="upload" s={18} />
              <span>Mettre en ligne</span>
            </button>
          )}
          <a className="btn" href="/">
            <Icon n="tv" s={18} />
            <span>Voir Kora</span>
          </a>
          {sb && (
            session
              ? <button type="button" className="btn" onClick={() => sb?.auth.signOut()}>Déconnexion</button>
              : <button type="button" className="btn p" onClick={() => setAuthModal(true)}><Icon n="user" s={18} />Se connecter</button>
          )}
        </div>
      </header>

      <div className="studio-mobile-tabs" role="tablist">
        {navItems.map(([k, label, _icon, locked]) => (
          <button key={k} type="button" role="tab" aria-selected={tab === k} className={'chip' + (tab === k ? ' on' : '')} onClick={() => openTab(k)}>
            {locked && !session ? '🔒 ' : ''}{label}
          </button>
        ))}
      </div>

      <div className="studio-body">
        <aside className="studio-nav" aria-label="Navigation Kora Studio">
          <div className="studio-channel-mini">
            <span className="studio-channel-badge">{session ? (channel.channel_name || 'KS').slice(0, 2).toUpperCase() : 'K'}</span>
            <div style={{ minWidth: 0 }}>
              <strong style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {session ? channel.channel_name : 'Visiteur (lecture seule)'}
              </strong>
              <small className="mu">{session ? (session.user.email || 'Connecté') : 'Connexion requise pour publier'}</small>
            </div>
          </div>

          {navItems.map(([k, label, icon, locked]) => (
            <button key={k} type="button" className={tab === k ? 'on' : ''} onClick={() => openTab(k)}>
              <Icon n={locked && !session ? 'lock' : icon} s={19} />
              <span>{label}</span>
            </button>
          ))}
          <a href="/"><Icon n="back" s={19} /><span>Retour sur Kora</span></a>
        </aside>

        <main className="studio-main">
          {!authReady ? (
            <p className="mu">Vérification de votre session…</p>
          ) : tab === 'browse' ? (
            <section>
              {!session && (
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
                {session && (
                  <button type="button" className="btn p" onClick={startNewUpload}>
                    <Icon n="upload" s={18} />Publier une série
                  </button>
                )}
              </div>

              {publicItems.length > 0 && (
                <div className="sbar" style={{ marginBottom: 20 }}>
                  <Icon n="search" s={18} />
                  <input
                    className="field"
                    value={publicSearch}
                    onChange={e => setPublicSearch(e.target.value)}
                    placeholder="Rechercher dans le catalogue Kora…"
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
                  {!session ? (
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
                    <a key={it.id} className="card" href={`/#/titre/${it.id}`}>
                      <div className="poster">
                        <img src={it.poster_url} alt={it.title} loading="lazy" />
                      </div>
                      <span className="ct">{it.title}</span>
                      <span className="cm">{it.country} · {it.year} · {TYPE_LABELS[it.type]}</span>
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
                onSuccess={(msg) => {
                  setRecoveryMode(false)
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
                      <h1>Tableau de bord de la chaîne</h1>
                      <p className="mu">{channel.channel_name} · Publiez vos séries, épisodes et films comme sur YouTube Studio.</p>
                    </div>
                    <button type="button" className="btn p" onClick={startNewUpload}>
                      <Icon n="upload" s={18} />Uploader une nouvelle série
                    </button>
                  </div>

                  <dl className="stats">
                    <div><dt>Séries & Œuvres</dt><dd>{titles.length}</dd></div>
                    <div><dt>En ligne sur Kora</dt><dd>{publishedCount}</dd></div>
                    <div><dt>Épisodes mis en ligne</dt><dd>{totalEpisodes}</dd></div>
                    <div><dt>Brouillons</dt><dd>{titles.length - publishedCount}</dd></div>
                  </dl>

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

              {tab === 'upload' && session && (
                <UploadWizard
                  key={editing ? `edit-${editing.id}` : 'new'}
                  initial={editing}
                  channel={channel}
                  session={session}
                  onSaved={async (saved) => {
                    await Promise.all([loadCloudCreatorData(session.user.id), loadPublicCatalog()])
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
                      <select value={channel.country} onChange={e => setChannel(c => ({ ...c, country: e.target.value }))}>
                        {COUNTRIES.map(c => <option key={c}>{c}</option>)}
                      </select>
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
                <section className="panel">
                  <h1>Statistiques & Monétisation Créateurs</h1>
                  <p className="mu">Suivez l’audience de vos séries et vos revenus estimés sur Kora (partage publicitaire formule gratuite + temps de visionnage Premium).</p>
                  <dl className="stats">
                    <div><dt>Œuvres publiées</dt><dd>{publishedCount}</dd></div>
                    <div><dt>Épisodes disponibles</dt><dd>{totalEpisodes}</dd></div>
                    <div><dt>Partage revenus Kora</dt><dd>70 %</dd></div>
                    <div><dt>Paiement créateurs</dt><dd>FCFA</dd></div>
                  </dl>
                  <p className="mu">Versements disponibles par <strong>Orange Money</strong>, <strong>Moov Money</strong>, <strong>Wave</strong> ou virement bancaire dès l’activation du mode facturation en production.</p>
                </section>
              )}
            </>
          )}
        </main>
      </div>

      {authModal && (
        <div className="modal-backdrop" onClick={e => { if (e.target === e.currentTarget) setAuthModal(false) }}>
          <div className="modal" role="dialog" aria-modal="true" aria-label="Connexion Kora Studio" style={{ maxWidth: 440 }}>
            <div className="modal-head">
              <h2>{recoveryMode ? 'Nouveau mot de passe' : 'Connexion Kora Studio'}</h2>
              <button type="button" className="icon-btn" onClick={() => setAuthModal(false)} aria-label="Fermer"><Icon n="close" s={18} /></button>
            </div>
            <StudioAuthForm
              recovery={recoveryMode}
              onSuccess={(msg) => {
                setRecoveryMode(false)
                setAuthModal(false)
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
   FORMULAIRE AUTHENTIFICATION KORA STUDIO (avec renvoi confirmation & reset)
   ============================================================================ */
function StudioAuthForm({ recovery, onSuccess, onBrowse }: {
  recovery?: boolean
  onSuccess: (msg: string) => void
  onBrowse?: () => void
}) {
  const [signup, setSignup] = useState(false)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [pw, setPw] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const [awaitingConfirm, setAwaitingConfirm] = useState(false)

  if (!sb) return <p className="mu">Authentification Supabase non configurée.</p>
  const db = sb

  if (recovery) {
    const saveNewPw = async (e: React.FormEvent) => {
      e.preventDefault()
      if (pw.length < 6) { setMsg('Le mot de passe doit contenir au moins 6 caractères.'); return }
      setBusy(true); setMsg('')
      const { error } = await db.auth.updateUser({ password: pw })
      setBusy(false)
      if (error) setMsg(frAuthError(error.message))
      else onSuccess('Nouveau mot de passe enregistré !')
    }
    return (
      <form className="auth" onSubmit={saveNewPw}>
        <p className="mu">Définissez un nouveau mot de passe pour votre compte Kora Studio.</p>
        <label>Nouveau mot de passe
          <input className="field" type="password" required minLength={6} value={pw} onChange={e => setPw(e.target.value)} autoComplete="new-password" placeholder="6 caractères minimum" />
        </label>
        <button type="submit" className="btn p wide-btn" disabled={busy}>{busy ? 'Enregistrement…' : 'Valider le mot de passe'}</button>
        {msg && <p className="status-box" role="status">{msg}</p>}
      </form>
    )
  }

  const resendConfirmation = async () => {
    if (!email.trim()) { setMsg('Saisissez votre adresse e-mail.'); return }
    setBusy(true); setMsg('')
    const { error } = await db.auth.resend({
      type: 'signup',
      email: email.trim(),
      options: { emailRedirectTo: `${location.origin}/studio/` }
    })
    setBusy(false)
    if (error) setMsg(frAuthError(error.message))
    else setMsg('E-mail de confirmation renvoyé ! Vérifiez aussi votre dossier Spam / Indésirables.')
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    const cleanEmail = email.trim()
    setBusy(true); setMsg(''); setAwaitingConfirm(false)
    if (signup) {
      const r = await db.auth.signUp({
        email: cleanEmail,
        password: pw,
        options: {
          data: { name: name.trim() || 'Mon Studio Kora' },
          emailRedirectTo: `${location.origin}/studio/`
        }
      })
      setBusy(false)
      if (r.error) {
        setMsg(frAuthError(r.error.message))
      } else {
        const alreadyExists = r.data?.user && Array.isArray(r.data.user.identities) && r.data.user.identities.length === 0
        if (alreadyExists) {
          setSignup(false)
          setMsg('Un compte existe déjà avec cette adresse e-mail (aucun nouvel e-mail n’est envoyé). Connectez-vous ci-dessous ou cliquez sur « Mot de passe oublié ? ».')
        } else if (r.data?.session) {
          onSuccess('Compte créateur prêt ! Bienvenue sur Kora Studio.')
        } else {
          setAwaitingConfirm(true)
          setMsg('Un e-mail de confirmation vient d’être envoyé. Vérifiez aussi vos spams/indésirables puis cliquez sur le lien pour activer votre compte.')
        }
      }
    } else {
      const r = await db.auth.signInWithPassword({ email: cleanEmail, password: pw })
      setBusy(false)
      if (r.error) {
        setMsg(frAuthError(r.error.message))
        if (/email not confirmed/i.test(r.error.message)) setAwaitingConfirm(true)
      } else {
        onSuccess('Connecté à Kora Studio !')
      }
    }
  }

  return (
    <form className="auth" onSubmit={submit}>
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
            <button
              type="button"
              className="lnk"
              onClick={async () => {
                if (!email.trim()) { setMsg('Saisissez d’abord votre adresse e-mail.'); return }
                setBusy(true)
                const { error } = await db.auth.resetPasswordForEmail(email.trim(), { redirectTo: `${location.origin}/studio/?recovery=1` })
                setBusy(false)
                setMsg(error ? frAuthError(error.message) : 'Si ce compte existe, un e-mail de réinitialisation vient d’être envoyé (vérifiez aussi vos spams).')
              }}
            >
              Mot de passe oublié ?
            </button>
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
function UploadWizard({ initial, channel, session, onSaved, onCancel }: {
  initial: StudioTitle | null
  channel: ChannelInfo
  session: Session
  onSaved: (t: StudioTitle) => Promise<void>
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

  const publish = async () => {
    if (!sb) { setStatusMsg('Base Supabase non configurée.'); return }
    if (!title.trim()) { setStatusMsg('Donnez un titre à votre série ou film.'); setStep(2); return }
    const hasCover = !!posterFile || (posterUrl.trim().length > 0 && posterUrl.startsWith('http'))
    if (status === 'published' && !hasCover) {
      setStatusMsg('Une page de couverture (affiche 2:3) est obligatoire pour publier sur Kora.')
      setStep(1)
      return
    }

    setBusy(true); setProgressPct(15); setStatusMsg('Préparation de la mise en ligne…')

    try {
      const uid = session.user.id
      let finalPoster = posterUrl.startsWith('http') ? posterUrl : ''
      let finalBackdrop = backdropUrl.startsWith('http') ? backdropUrl : ''

      if (posterFile) {
        setStatusMsg('Envoi de la page de couverture…'); setProgressPct(30)
        const p = `creator/${uid}/poster-${Date.now()}-${safeName(posterFile.name)}`
        const { error } = await sb.storage.from('posters').upload(p, posterFile, { contentType: posterFile.type })
        if (error) throw new Error(`Échec envoi couverture : ${error.message}`)
        finalPoster = sb.storage.from('posters').getPublicUrl(p).data.publicUrl
      }
      if (backdropFile) {
        setStatusMsg('Envoi de la bannière…'); setProgressPct(45)
        const p = `creator/${uid}/backdrop-${Date.now()}-${safeName(backdropFile.name)}`
        const { error } = await sb.storage.from('posters').upload(p, backdropFile, { contentType: backdropFile.type })
        if (error) throw new Error(`Échec envoi bannière : ${error.message}`)
        finalBackdrop = sb.storage.from('posters').getPublicUrl(p).data.publicUrl
      }

      if (status === 'published' && !finalPoster) {
        throw new Error('La page de couverture est obligatoire pour publier.')
      }

      setStatusMsg('Enregistrement de la fiche et du synopsis…'); setProgressPct(60)
      const payload = {
        creator_id: uid,
        title: title.trim(),
        type,
        year: +year || new Date().getFullYear(),
        duration_min: +dur || 45,
        country: country.trim() || 'Mali',
        original_language: origLang || 'fr',
        age_rating: age,
        synopsis_short: (synShort.trim() || synLong.trim()).slice(0, 180),
        synopsis_long: synLong.trim() || synShort.trim(),
        status,
        is_new: true,
        poster_url: finalPoster || null,
        backdrop_url: finalBackdrop || null,
        updated_at: new Date().toISOString()
      }

      const res = initial
        ? await sb.from('titles').update(payload).eq('id', initial.id).select('id').single()
        : await sb.from('titles').insert(payload).select('id').single()
      if (res.error) throw new Error(res.error.message)
      const tid = res.data.id as number

      // Genres
      const { data: gRows } = await sb.from('genres').select('id,name').in('name', genres)
      await sb.from('title_genres').delete().eq('title_id', tid)
      if (gRows?.length) await sb.from('title_genres').insert(gRows.map((g: any) => ({ title_id: tid, genre_id: g.id })))

      // Réalisateur & distribution
      const dirNames = director.split(',').map(x => x.trim()).filter(Boolean)
      const castNames = cast.split(',').map(x => x.trim()).filter(Boolean)
      const allPeople = [...new Set([...dirNames, ...castNames])]
      if (allPeople.length) {
        const { data: existingP } = await sb.from('people').select('id,name').in('name', allPeople)
        const mapP = new Map<string, number>((existingP || []).map((x: any) => [x.name, x.id]))
        const missing = allPeople.filter(n => !mapP.has(n))
        if (missing.length) {
          const { data: insP } = await sb.from('people').insert(missing.map(name => ({ name }))).select('id,name')
          ;(insP || []).forEach((x: any) => mapP.set(x.name, x.id))
        }
        await sb.from('title_people').delete().eq('title_id', tid)
        const links = [
          ...dirNames.map(n => ({ title_id: tid, person_id: mapP.get(n)!, role: 'director', position: 0 })),
          ...castNames.map((n, idx) => ({ title_id: tid, person_id: mapP.get(n)!, role: 'actor', position: idx + 1 }))
        ].filter(l => l.person_id)
        if (links.length) await sb.from('title_people').insert(links)
      }

      // Langue audio principale
      await sb.from('title_languages').delete().eq('title_id', tid)
      await sb.from('title_languages').insert({ title_id: tid, language_code: origLang || 'fr', kind: 'audio' })

      // Droits par pays si sélectionnés
      await sb.from('rights').delete().eq('title_id', tid)
      if (rightsScope === 'mali') {
        await sb.from('rights').insert({ title_id: tid, country: 'Mali', access: accessTier })
      } else if (rightsScope === 'west_africa') {
        await sb.from('rights').insert(['Mali', 'Sénégal', 'Côte d’Ivoire', 'Burkina Faso', 'Guinée', 'Niger'].map(c => ({ title_id: tid, country: c, access: accessTier })))
      }

      // Vidéo film OU Saisons & Épisodes (avec vidéos par épisode)
      if (type === 'series') {
        setStatusMsg('Création des saisons et envoi des épisodes…'); setProgressPct(75)
        const seasonNums = [...new Set(episodes.map(e => e.season))].sort((a, b) => a - b)
        const { data: existingSeasons } = await sb.from('seasons').select('id,number').eq('title_id', tid)
        const sMap = new Map<number, number>((existingSeasons || []).map((s: any) => [s.number, s.id]))
        for (const sn of seasonNums) {
          if (!sMap.has(sn)) {
            const { data: insS } = await sb.from('seasons').insert({ title_id: tid, number: sn }).select('id,number').single()
            if (insS) sMap.set(sn, insS.id)
          }
        }
        for (let i = 0; i < episodes.length; i++) {
          const ep = episodes[i]
          const sid = sMap.get(ep.season)
          if (!sid) continue
          let epId = ep.dbId
          if (epId) {
            await sb.from('episodes').update({ title: ep.title, synopsis: ep.synopsis || null, duration_min: ep.duration_min, intro_end_sec: ep.intro_end_sec }).eq('id', epId)
          } else {
            const { data: insE } = await sb.from('episodes').insert({
              season_id: sid, number: ep.number, title: ep.title,
              synopsis: ep.synopsis || null, duration_min: ep.duration_min, intro_end_sec: ep.intro_end_sec
            }).select('id').single()
            epId = insE?.id
          }
          if (epId && ep.file) {
            setStatusMsg(`Envoi vidéo S${ep.season}E${ep.number} (${ep.file.name})…`)
            const vPath = `creator/${uid}/ep-${epId}-${Date.now()}-${safeName(ep.file.name)}`
            const { error: ve } = await sb.storage.from('videos').upload(vPath, ep.file, { contentType: ep.file.type })
            if (!ve) {
              await sb.from('video_assets').delete().eq('episode_id', epId)
              await sb.from('video_assets').insert({ episode_id: epId, storage_path: vPath, size_bytes: ep.file.size, mime: ep.file.type, status: 'ready' })
            }
          }
          setProgressPct(75 + Math.round(((i + 1) / Math.max(1, episodes.length)) * 22))
        }
      } else if (mainVideoFile) {
        setStatusMsg(`Envoi de la vidéo ${mainVideoFile.name}…`); setProgressPct(80)
        const vPath = `creator/${uid}/vid-${tid}-${Date.now()}-${safeName(mainVideoFile.name)}`
        const { error: ve } = await sb.storage.from('videos').upload(vPath, mainVideoFile, { contentType: mainVideoFile.type })
        if (ve) throw new Error(/exceed|size|large/i.test(ve.message) ? 'Vidéo supérieure à 50 Mo (limite du plan Supabase gratuit).' : ve.message)
        await sb.from('video_assets').delete().eq('title_id', tid)
        await sb.from('video_assets').insert({ title_id: tid, storage_path: vPath, size_bytes: mainVideoFile.size, mime: mainVideoFile.type, status: 'ready' })
      }

      setProgressPct(100)
      setBusy(false)
      await onSaved({
        id: tid, title: title.trim(), type, year: +year, country, original_language: origLang, age_rating: age,
        duration_min: +dur, synopsis_short: synShort, synopsis_long: synLong, director, cast, genres, status,
        poster_url: finalPoster, backdrop_url: finalBackdrop, episodes, rights_scope: rightsScope, access_tier: accessTier,
        created_at: new Date().toISOString(), channelName: channel.channel_name
      })
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
                  <select value={type} onChange={e => setType(e.target.value as StudioTitle['type'])}>
                    <option value="series">Série (avec saisons & épisodes)</option>
                    <option value="film">Film</option>
                    <option value="doc">Documentaire</option>
                    <option value="short">Court-métrage</option>
                  </select>
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
                <label>Pays<select value={country} onChange={e => setCountry(e.target.value)}>{COUNTRIES.map(c => <option key={c}>{c}</option>)}</select></label>
                <label>Langue originale<select value={origLang} onChange={e => setOrigLang(e.target.value)}>{LANGS.map(([c, n]) => <option key={c} value={c}>{n}</option>)}</select></label>
                <label>Année<input className="field narrow" inputMode="numeric" value={year} onChange={e => setYear(e.target.value)} /></label>
                <label>Âge<select value={age} onChange={e => setAge(e.target.value)}>{AGES.map(a => <option key={a}>{a}</option>)}</select></label>
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
                <p className="mu">Importez le fichier vidéo (MP4, WebM, MOV) et le synopsis de chaque épisode, comme une playlist sur YouTube Studio.</p>
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
                          <strong>Déposez ou choisissez la vidéo de l’épisode (MP4, WebM, MOV)</strong>
                          <span className="mu">Limite 50 Mo sur le stockage Supabase gratuit</span>
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
                  <span className="mu">MP4, WebM ou MOV · 50 Mo max sur le plan Supabase gratuit</span>
                  {mainVideoFile && <span className="pill-ok">{mainVideoFile.name} ({Math.max(1, Math.round(mainVideoFile.size / 1048576))} Mo)</span>}
                </div>
                {mainVideoPreview && (
                  <div className="preview-banner">
                    <video src={mainVideoPreview} controls playsInline />
                  </div>
                )}
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
                  <select value={rightsScope} onChange={e => setRightsScope(e.target.value as any)}>
                    <option value="world">Monde entier & Diaspora</option>
                    <option value="west_africa">Afrique de l’Ouest uniquement</option>
                    <option value="mali">Mali uniquement</option>
                  </select>
                </label>
                <label>Modèle d’accès
                  <select value={accessTier} onChange={e => setAccessTier(e.target.value as any)}>
                    <option value="free">Gratuit avec publicité (partage revenus pub)</option>
                    <option value="premium">Réservé Kora Premium & Famille</option>
                  </select>
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

        {/* Colonne droite : Aperçu en direct de la carte Kora */}
        <aside className="preview-card-box" aria-label="Aperçu sur Kora">
          <strong style={{ fontSize: '0.88rem', color: 'var(--mu)' }}>Aperçu en direct sur Kora</strong>
          <div className="preview-poster">
            {posterUrl ? <img src={posterUrl} alt="Aperçu couverture" /> : (
              <div style={{ padding: 14 }}>
                <span className="pill-accent">{TYPE_LABELS[type]}</span>
                <p className="serif" style={{ fontSize: '1.2rem', marginTop: 10 }}>{title || 'Titre de votre série'}</p>
                <small className="mu">Couverture obligatoire</small>
              </div>
            )}
          </div>
          <div>
            <strong style={{ display: 'block', fontSize: '1.05rem' }}>{title || 'Sans titre'}</strong>
            <small className="mu">{country} · {year} · {genres[0] || 'Drame'} · {age}</small>
            <p className="mu" style={{ fontSize: '0.84rem', marginTop: 6 }}>
              {synShort || synLong.slice(0, 120) || 'Votre synopsis apparaîtra ici sur la fiche et en page d’accueil.'}
            </p>
            {type === 'series' && (
              <p className="mu" style={{ fontSize: '0.82rem', marginTop: 8 }}>
                <strong>{Math.max(1, ...episodes.map(e => e.season))}</strong> saison(s) · <strong>{episodes.length}</strong> épisode(s)
              </p>
            )}
          </div>
        </aside>
      </div>
    </section>
  )
}
