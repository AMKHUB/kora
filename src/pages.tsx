import { useEffect, useMemo, useRef, useState } from 'react'
import { AVATARS, Episode, Item, PLANS, PlanId, Profile as ProfileType, ThemeMode, useApp } from './store'
import { BrandLogo, Card, Icon, Meta, Modal, PinModal, Poster, ProfileAvatar, Row } from './ui'
import { AccountBox, AccountSummary } from './auth'
import {
  confirmSaspayPaymentOtp,
  createIntentIdempotencyKey,
  processPaymentCheckout,
  retrySaspayPayment,
  SASPAY_COUNTRIES,
  verifySaspayPayment
} from './billing'

const norm = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
const hay = (i: Item) => norm([i.title, i.director, i.country, i.type, i.synopsis, ...i.cast, ...i.langs, ...i.genres].join(' '))

const TYPE_LABEL: Record<string, string> = {
  film: 'Film',
  serie: 'Série',
  doc: 'Documentaire',
  court: 'Court-métrage'
}

const fmtShort = (s: number) => {
  const m = Math.floor(s / 60)
  return m >= 60 ? `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')}` : `${m} min`
}

const fmtDate = (iso: string) => {
  try { return new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' }) } catch { return iso }
}

export function ListBtn({ id }: { id: number }) {
  const { profile, toggleList, session } = useApp()
  const on = !!session && profile.list.includes(id)
  return (
    <button type="button" className={'btn' + (on ? ' active-btn' : '')} onClick={() => toggleList(id)}>
      <Icon n={on ? 'check' : 'plus'} s={18} />
      {on ? 'Dans ma liste' : 'Ma liste'}
    </button>
  )
}

function Footer() {
  return (
    <footer className="site-foot">
      <div className="foot-brand">
        <BrandLogo height={30} />
        <p className="mu">La maison du cinéma malien, africain et de la diaspora.</p>
      </div>
      <nav className="foot-links" aria-label="Liens de pied de page">
        <a href="#/explorer">Explorer</a>
        <a href="#/abonnement">Offres & tarifs</a>
        <a href="#/profil">Mon profil</a>
        <a href="#/parametres">Paramètres</a>
        <a href="/studio/">Kora Studio (Créateurs)</a>
        <a href="#/confidentialite">Confidentialité</a>
        <a href="#/cgu">Conditions d’utilisation</a>
      </nav>
      <p className="mu foot-copy">© {new Date().getFullYear()} Kora · Bamako, Mali</p>
    </footer>
  )
}

/* ============================================================================
   ACCUEIL — Carrousel héro, filtres rapides, Top 10, Continuer, Recommandations
   ============================================================================ */
const HOME_FILTERS = [
  { id: 'all', label: 'Tout' },
  { id: 'film', label: 'Films' },
  { id: 'serie', label: 'Séries' },
  { id: 'doc', label: 'Documentaires' },
  { id: 'court', label: 'Courts-métrages' },
  { id: 'mali', label: 'Cinéma du Mali' },
  { id: 'diaspora', label: 'Diaspora' }
] as const

export function Home() {
  const { cat, items, byId, profile, session } = useApp()
  const [filter, setFilter] = useState<string>('all')
  const [heroIdx, setHeroIdx] = useState(0)
  const [paused, setPaused] = useState(false)

  const heroes = useMemo(() => {
    const raw = (cat?.heroes?.length ? cat.heroes : [cat?.hero || 0]).map(byId).filter(Boolean) as Item[]
    return raw.length ? raw : items.slice(0, 4)
  }, [cat, items, byId])

  useEffect(() => {
    if (heroes.length <= 1 || paused) return
    const h = window.setInterval(() => setHeroIdx(i => (i + 1) % heroes.length), 8500)
    return () => clearInterval(h)
  }, [heroes.length, paused])

  if (!cat) return <p className="page mu">Chargement du catalogue Kora…</p>

  if (!items.length) {
    return (
      <>
        <header className="empty-catalog-hero">
          <div className="empty-catalog-inner">
            <BrandLogo height={48} />
            <span className="pill-accent">Cinéma & Séries d’Afrique</span>
            <h1>La maison du cinéma malien, africain et de la diaspora</h1>
            <p className="mu">
              Un écrin éditorial dédié aux grandes histoires du continent. Publiez vos séries, films, couvertures, épisodes et sous-titres synchronisés depuis l’application dédiée Kora Studio.
            </p>
            <div className="btns" style={{ justifyContent: 'center' }}>
              {!session ? (
                <a className="btn p" href="#/connexion"><Icon n="user" s={18} />Se connecter</a>
              ) : (
                <a className="btn p" href="/studio/" target="_blank" rel="noopener noreferrer"><Icon n="studio" s={18} />Ouvrir Kora Studio</a>
              )}
            </div>
            <div className="empty-pillars">
              <div className="pillar-card">
                <Icon n="film" s={22} />
                <strong>Catalogue curaté</strong>
                <small className="mu">Séries, films, documentaires et courts-métrages avec affiches officielles.</small>
              </div>
              <div className="pillar-card">
                <Icon n="captions" s={22} />
                <strong>Streaming & Voix claire</strong>
                <small className="mu">Lecture fluide jusqu’en 4K et sous-titres synchronisés.</small>
              </div>
              <div className="pillar-card">
                <Icon n="studio" s={22} />
                <strong>Kora Studio</strong>
                <small className="mu">Mettez en ligne vos films, séries, saisons et affiches depuis votre espace créateur.</small>
              </div>
            </div>
          </div>
        </header>
        <Footer />
      </>
    )
  }

  const hero = heroes[heroIdx % heroes.length] || items[0]
  const cont = session ? Object.keys(profile.hist).map(Number).filter(id => byId(id) && profile.hist[id] > 10) : []
  const featuredAfrica = [...new Set([
    ...(cat.rows.series || []),
    ...(cat.rows.malifilms || []),
    ...(cat.rows.africa || [])
  ])]

  const filteredItems = filter === 'all'
    ? []
    : filter === 'mali'
      ? items.filter(i => i.country === 'Mali')
      : filter === 'diaspora'
        ? items.filter(i => i.country === 'Diaspora')
        : items.filter(i => i.type === filter)

  const heroSaved = profile.hist[hero.id] || 0

  return (
    <>
      <header
        className="hero"
        onMouseEnter={() => setPaused(true)}
        onMouseLeave={() => setPaused(false)}
      >
        <Poster item={hero} wide />
        <div className="hero-vignette" aria-hidden="true" />
        <div className="txt">
          <div className="hero-badges">
            <span className="pill-accent">{hero.badge || `${TYPE_LABEL[hero.type]} · À la une`}</span>
            <span className="pill-spec">{hero.age}</span>
          </div>
          <h1>{hero.title}</h1>
          <p className="hero-meta">
            <Meta i={hero} /> · {hero.seasons ? `${hero.seasons} saison${hero.seasons > 1 ? 's' : ''}` : `${hero.dur} min`} · {hero.langs.join(', ')}
          </p>
          <p className="clip">{hero.synopsis}</p>
          <div className="btns">
            <a className="btn p" href={session ? `#/lire/${hero.id}` : '#/connexion'}>
              <Icon n={session ? 'play' : 'lock'} s={18} />
              {!session ? 'Lire' : heroSaved > 30 ? `Reprendre (${fmtShort(heroSaved)})` : 'Lire'}
            </a>
            <a className="btn" href={`#/titre/${hero.id}`}><Icon n="info" s={18} />Plus d’infos</a>
          </div>
        </div>

        {heroes.length > 1 && (
          <div className="hero-dots" role="tablist" aria-label="Titres à la une">
            {heroes.map((h, i) => (
              <button
                key={h.id}
                type="button"
                role="tab"
                aria-selected={i === heroIdx % heroes.length}
                aria-label={`Afficher ${h.title}`}
                className={'hero-dot' + (i === heroIdx % heroes.length ? ' on' : '')}
                onClick={() => setHeroIdx(i)}
              />
            ))}
          </div>
        )}
      </header>

      <div className="home-shelves">
        <div className="home-bar">
          <div className="chips" role="tablist" aria-label="Filtres rapides">
            {HOME_FILTERS.map(f => (
              <button
                key={f.id}
                type="button"
                role="tab"
                aria-selected={filter === f.id}
                className={'chip' + (filter === f.id ? ' on' : '')}
                onClick={() => setFilter(f.id)}
              >
                {f.label}
              </button>
            ))}
          </div>
          {profile.kid && <span className="kid-banner"><Icon n="shield" s={16} />Mode Enfant actif (Tous publics & 7+)</span>}
        </div>

        {filter !== 'all' ? (
          <section className="page flush-top">
            <h2>{HOME_FILTERS.find(f => f.id === filter)?.label} ({filteredItems.length})</h2>
            {!filteredItems.length && (
              <div className="empty-box">
                <p className="mu">
                  {filter === 'serie'
                    ? 'Aucune série n’est encore publiée. Rendez-vous sur l’application Kora Studio pour mettre en ligne vos séries.'
                    : 'Aucun titre dans cette sélection pour ce profil.'}
                </p>
                {filter === 'serie' && (
                  <div className="btns">
                    <a className="btn p" href="/studio/" target="_blank" rel="noopener noreferrer"><Icon n="studio" s={18} />Publier sur Kora Studio</a>
                  </div>
                )}
              </div>
            )}
            <div className="grid flush">{filteredItems.map(i => <Card key={i.id} item={i} progressSec={profile.hist[i.id]} />)}</div>
          </section>
        ) : (
          <>
            <Row title="Continuer à regarder" ids={cont} showProgress />
            <Row title="Top 10 sur Kora" ids={cat.rows.top10 || []} ranked />
            <Row title="Tendances du moment" ids={cat.rows.trending || []} action={{ label: 'Tout explorer', href: '#/explorer' }} />
            <Row title="Nouveautés" ids={cat.rows.new || []} />
            <Row title="Séries & Films d’Afrique" ids={featuredAfrica} action={{ label: 'Explorer le catalogue', href: '#/explorer' }} />
          </>
        )}
      </div>

      <Footer />
    </>
  )
}

/* ============================================================================
   EXPLORER & RECHERCHE UNIFIÉE — Carrousel de suggestions + Multi-filtres stylés
   ============================================================================ */
const POPULAR_SUGGESTIONS: { label: string; sub: string; tone: string; filter?: { type?: string; country?: string; genre?: string; lang?: string; q?: string } }[] = [
  { label: 'Cinéma du Mali', sub: 'Films & séries maliens', tone: 'gold', filter: { country: 'Mali' } },
  { label: 'Bambara', sub: 'Version originale', tone: 'emerald', filter: { lang: 'Bambara' } },
  { label: 'Séries africaines', sub: 'Saisons & épisodes', tone: 'rose', filter: { type: 'serie' } },
  { label: 'Sénégal', sub: 'Dakar & Teranga', tone: 'amber', filter: { country: 'Sénégal' } },
  { label: 'Documentaires', sub: 'Histoire, culture & société', tone: 'cyan', filter: { type: 'doc' } },
  { label: 'Côte d’Ivoire', sub: 'Abidjan & créations', tone: 'copper', filter: { country: 'Côte d’Ivoire' } },
  { label: 'Drame & Émotion', sub: 'Grandes histoires', tone: 'violet', filter: { genre: 'Drame' } },
  { label: 'Comédie', sub: 'Humour & famille', tone: 'gold', filter: { genre: 'Comédie' } },
  { label: 'Diaspora', sub: 'Paris, Bruxelles, Montréal', tone: 'indigo', filter: { country: 'Diaspora' } },
  { label: 'Animation & Jeunesse', sub: 'Contes & légendes', tone: 'emerald', filter: { genre: 'Animation' } },
  { label: 'Wolof', sub: 'Version originale', tone: 'amber', filter: { lang: 'Wolof' } },
  { label: 'Classiques restaurés', sub: 'Patrimoine du continent', tone: 'rose', filter: { q: 'Classique' } }
]

export function Search({
  q0 = '',
  type0 = '',
  country0 = '',
  genre0 = '',
  lang0 = ''
}: {
  q0?: string
  type0?: string
  country0?: string
  genre0?: string
  lang0?: string
}) {
  const { items, st, addRecentSearch, profile } = useApp()
  const [q, setQ] = useState(q0)
  const [type, setType] = useState(type0)
  const [country, setCountry] = useState(country0)
  const [genre, setGenre] = useState(genre0)
  const [lang, setLang] = useState(lang0)
  const [age, setAge] = useState('')
  const [dur, setDur] = useState('')
  const [era, setEra] = useState('')
  const [sort, setSort] = useState('relevance')
  const [showFilters, setShowFilters] = useState(true)
  const suggestRef = useRef<HTMLDivElement>(null)

  useEffect(() => { setQ(q0) }, [q0])
  useEffect(() => { setType(type0) }, [type0])
  useEffect(() => { setCountry(country0) }, [country0])
  useEffect(() => { setGenre(genre0) }, [genre0])
  useEffect(() => { setLang(lang0) }, [lang0])

  const countries = useMemo(() => [...new Set(['Mali', 'Sénégal', 'Côte d’Ivoire', 'Burkina Faso', 'Nigeria', 'Diaspora', ...items.map(i => i.country)])].sort(), [items])
  const genres = useMemo(() => [...new Set(['Drame', 'Comédie', 'Documentaire', 'Action', 'Animation', 'Histoire', 'Musique', ...items.flatMap(i => i.genres)])].sort(), [items])
  const langs = useMemo(() => [...new Set(['Bambara', 'Français', 'Wolof', 'Peul', 'Anglais', ...items.flatMap(i => i.langs)])].sort(), [items])

  const activeFilters = [type, country, genre, lang, age, dur, era].filter(Boolean).length

  const toks = norm(q).split(/\s+/).filter(Boolean)
  const hasQuery = toks.length > 0 || activeFilters > 0

  const res = useMemo(() => {
    if (!hasQuery) return []
    const list = items.filter(i => {
      if (toks.length && !toks.every(t => hay(i).includes(t))) return false
      if (type && i.type !== type) return false
      if (country && i.country !== country) return false
      if (genre && !i.genres.includes(genre)) return false
      if (lang && !i.langs.includes(lang)) return false
      if (age && i.age !== age) return false
      if (dur === 'short' && i.dur >= 30) return false
      if (dur === 'mid' && (i.dur < 30 || i.dur > 90)) return false
      if (dur === 'long' && i.dur <= 90) return false
      if (era === '2020s' && i.year < 2020) return false
      if (era === 'classic' && i.year >= 2000) return false
      return true
    })
    if (sort === 'newest') return [...list].sort((a, b) => b.year - a.year)
    if (sort === 'oldest') return [...list].sort((a, b) => a.year - b.year)
    if (sort === 'duration') return [...list].sort((a, b) => b.dur - a.dur)
    if (sort === 'alpha') return [...list].sort((a, b) => a.title.localeCompare(b.title, 'fr'))
    return list
  }, [items, toks, type, country, genre, lang, age, dur, era, sort, hasQuery])

  const resetAll = () => {
    setType(''); setCountry(''); setGenre(''); setLang(''); setAge(''); setDur(''); setEra(''); setSort('relevance')
  }

  const applySuggestion = (s: typeof POPULAR_SUGGESTIONS[number]) => {
    resetAll()
    setQ(s.filter?.q || '')
    if (s.filter?.type) setType(s.filter.type)
    if (s.filter?.country) setCountry(s.filter.country)
    if (s.filter?.genre) setGenre(s.filter.genre)
    if (s.filter?.lang) setLang(s.filter.lang)
    addRecentSearch(s.label)
  }

  const scrollSuggestions = (dir: -1 | 1) => {
    const el = suggestRef.current
    if (!el) return
    el.scrollBy({ left: dir * Math.max(260, el.clientWidth * 0.72), behavior: 'smooth' })
  }

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Explorer</h1>
          <p className="mu">Recherchez une œuvre ou parcourez par films, séries, documentaires, genre et pays.</p>
        </div>
        <button type="button" className={'btn' + (showFilters || activeFilters ? ' active-btn' : '')} onClick={() => setShowFilters(s => !s)}>
          <Icon n="sliders" s={18} />
          Filtrer {activeFilters > 0 && `(${activeFilters})`}
        </button>
      </div>

      <div className="chips explorer-types" role="tablist" aria-label="Catégories principales">
        {([
          ['', 'Tout le catalogue'],
          ['film', 'Films'],
          ['serie', 'Séries'],
          ['doc', 'Documentaires'],
          ['court', 'Courts-métrages']
        ] as const).map(([val, label]) => (
          <button
            key={val || 'all'}
            type="button"
            role="tab"
            aria-selected={type === val}
            className={'chip' + (type === val ? ' on' : '')}
            onClick={() => setType(val)}
          >
            {label}
          </button>
        ))}
      </div>

      <form className="search-box" onSubmit={e => { e.preventDefault(); addRecentSearch(q) }}>
        <Icon n="search" s={20} />
        <input
          className="field"
          type="search"
          value={q}
          onChange={e => setQ(e.target.value)}
          onBlur={() => addRecentSearch(q)}
          placeholder="Titre, réalisateur, acteur, pays, langue, genre…"
          aria-label="Explorer le catalogue Kora"
        />
        {(q || activeFilters > 0) && (
          <button type="button" className="btn" onClick={() => { setQ(''); resetAll() }}>
            Effacer
          </button>
        )}
      </form>

      {showFilters && (
        <section className="filter-panel" aria-label="Filtres du catalogue">
          <div className="filter-panel-head">
            <span className="filter-title"><Icon n="sliders" s={16} />Filtrer le catalogue</span>
            {activeFilters > 0 && (
              <button type="button" className="lnk small-lnk" onClick={resetAll}>
                Réinitialiser ({activeFilters})
              </button>
            )}
          </div>
          <div className="filter-grid">
            <label className={'filter-item tone-gold' + (type ? ' has-val' : '')}>
              <span>Format</span>
              <select value={type} onChange={e => setType(e.target.value)}>
                <option value="">Tous les formats</option>
                <option value="film">Films</option>
                <option value="serie">Séries</option>
                <option value="doc">Documentaires</option>
                <option value="court">Courts-métrages</option>
              </select>
            </label>
            <label className={'filter-item tone-emerald' + (country ? ' has-val' : '')}>
              <span>Pays & origine</span>
              <select value={country} onChange={e => setCountry(e.target.value)}>
                <option value="">Tous les pays</option>
                {countries.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </label>
            <label className={'filter-item tone-rose' + (genre ? ' has-val' : '')}>
              <span>Genre</span>
              <select value={genre} onChange={e => setGenre(e.target.value)}>
                <option value="">Tous les genres</option>
                {genres.map(g => <option key={g} value={g}>{g}</option>)}
              </select>
            </label>
            <label className={'filter-item tone-amber' + (lang ? ' has-val' : '')}>
              <span>Langue audio</span>
              <select value={lang} onChange={e => setLang(e.target.value)}>
                <option value="">Toutes les langues</option>
                {langs.map(l => <option key={l} value={l}>{l}</option>)}
              </select>
            </label>
            <label className={'filter-item tone-cyan' + (age ? ' has-val' : '')}>
              <span>Public / Âge</span>
              <select value={age} onChange={e => setAge(e.target.value)}>
                <option value="">Tous publics</option>
                {['Tous', '7+', '12+', '16+'].map(a => <option key={a} value={a}>{a}</option>)}
              </select>
            </label>
            <label className={'filter-item tone-violet' + (dur ? ' has-val' : '')}>
              <span>Durée</span>
              <select value={dur} onChange={e => setDur(e.target.value)}>
                <option value="">Toutes durées</option>
                <option value="short">Moins de 30 min</option>
                <option value="mid">30 à 90 min</option>
                <option value="long">Plus de 90 min</option>
              </select>
            </label>
            <label className={'filter-item tone-copper' + (era ? ' has-val' : '')}>
              <span>Période</span>
              <select value={era} onChange={e => setEra(e.target.value)}>
                <option value="">Toutes époques</option>
                <option value="2020s">Années 2020</option>
                <option value="classic">Classiques (&lt; 2000)</option>
              </select>
            </label>
            <label className={'filter-item tone-indigo' + (sort !== 'relevance' ? ' has-val' : '')}>
              <span>Trier par</span>
              <select value={sort} onChange={e => setSort(e.target.value)}>
                <option value="relevance">Pertinence</option>
                <option value="newest">Plus récents</option>
                <option value="oldest">Plus anciens</option>
                <option value="duration">Durée</option>
                <option value="alpha">Ordre A–Z</option>
              </select>
            </label>
          </div>
        </section>
      )}

      <section className="suggest-sec" aria-label="Suggestions populaires">
        <div className="row-head">
          <h2>Suggestions populaires</h2>
          <div className="suggest-arrows">
            <button type="button" className="icon-btn" onClick={() => scrollSuggestions(-1)} aria-label="Défiler les suggestions vers la gauche">
              <Icon n="chevL" s={18} />
            </button>
            <button type="button" className="icon-btn" onClick={() => scrollSuggestions(1)} aria-label="Défiler les suggestions vers la droite">
              <Icon n="chevR" s={18} />
            </button>
          </div>
        </div>
        <div className="suggest-wrap">
          <div className="suggest-track" ref={suggestRef}>
            {POPULAR_SUGGESTIONS.map(s => {
              const isSelected =
                (s.filter?.country && country === s.filter.country) ||
                (s.filter?.type && type === s.filter.type) ||
                (s.filter?.genre && genre === s.filter.genre) ||
                (s.filter?.lang && lang === s.filter.lang) ||
                (s.filter?.q && q === s.filter.q)
              return (
                <button
                  key={s.label}
                  type="button"
                  className={`suggest-card tone-${s.tone}` + (isSelected ? ' on' : '')}
                  onClick={() => applySuggestion(s)}
                >
                  <span className="suggest-kicker">{s.sub}</span>
                  <strong>{s.label}</strong>
                </button>
              )
            })}
          </div>
        </div>
      </section>

      {!hasQuery ? (
        <div className="search-hints">
          {st.recentSearches.length > 0 && (
            <section>
              <h2>Recherches récentes</h2>
              <div className="chips">
                {st.recentSearches.map(r => (
                  <button key={r} type="button" className="chip" onClick={() => setQ(r)}>{r}</button>
                ))}
              </div>
            </section>
          )}
          <section>
            <h2>À découvrir maintenant</h2>
            <div className="grid flush">{items.slice(0, 12).map(i => <Card key={i.id} item={i} progressSec={profile.hist[i.id]} />)}</div>
          </section>
        </div>
      ) : (
        <section>
          <p className="mu search-count">{res.length} résultat{res.length > 1 ? 's' : ''}{q ? ` pour « ${q} »` : ''}</p>
          {!res.length && (
            <div className="empty-box">
              <p>Aucun titre ne correspond à ces critères.</p>
              <button type="button" className="btn" onClick={() => { setQ(''); resetAll() }}>Effacer les filtres</button>
            </div>
          )}
          <div className="grid flush">{res.map(i => <Card key={i.id} item={i} progressSec={profile.hist[i.id]} />)}</div>
        </section>
      )}
    </div>
  )
}

/* ============================================================================
   MA LISTE — Favoris, En cours, Mes notes
   ============================================================================ */
export function MyList() {
  const { profile, byId, items } = useApp()
  const [tab, setTab] = useState<'list' | 'cont' | 'rated'>('list')

  const saved = profile.list.map(byId).filter(Boolean) as Item[]
  const cont = Object.keys(profile.hist).map(Number).filter(id => profile.hist[id] > 10).map(byId).filter(Boolean) as Item[]
  const rated = items.filter(i => profile.rate?.[i.id] === 'love' || profile.rate?.[i.id] === 'like')
  const active = tab === 'list' ? saved : tab === 'cont' ? cont : rated

  return (
    <div className="page">
      <h1>Ma bibliothèque</h1>
      <div className="chips" role="tablist">
        <button type="button" role="tab" aria-selected={tab === 'list'} className={'chip' + (tab === 'list' ? ' on' : '')} onClick={() => setTab('list')}>Ma liste ({saved.length})</button>
        <button type="button" role="tab" aria-selected={tab === 'cont'} className={'chip' + (tab === 'cont' ? ' on' : '')} onClick={() => setTab('cont')}>En cours ({cont.length})</button>
        <button type="button" role="tab" aria-selected={tab === 'rated'} className={'chip' + (tab === 'rated' ? ' on' : '')} onClick={() => setTab('rated')}>Coups de cœur ({rated.length})</button>
      </div>

      {!active.length ? (
        <div className="empty-box">
          <p className="mu">
            {tab === 'list' ? 'Votre liste est vide. Ajoutez un film ou une série depuis sa fiche.'
              : tab === 'cont' ? 'Aucune lecture en cours pour ce profil.'
                : 'Notez vos films préférés (« J’aime » ou « J’adore ») pour les retrouver ici.'}
          </p>
          <a className="btn p" href="#/">Découvrir le catalogue</a>
        </div>
      ) : (
        <div className="grid flush">{active.map(i => <Card key={i.id} item={i} progressSec={profile.hist[i.id]} />)}</div>
      )}
    </div>
  )
}

/* ============================================================================
   FICHE DÉTAILLÉE — Film, Série, Documentaire, Court-métrage
   ============================================================================ */
export function Detail({ id }: { id: number }) {
  const { byId, items, profile, rate, toast, submitReport, session, requireAuth } = useApp()
  const it = byId(id)
  const [season, setSeason] = useState(1)
  const [reportOpen, setReportOpen] = useState(false)
  const [reason, setReason] = useState('Problème de lecture vidéo ou audio')
  const [details, setDetails] = useState('')
  const [sending, setSending] = useState(false)

  useEffect(() => { setSeason(1) }, [id])

  if (!it) return <p className="page mu">Chargement de la fiche…</p>

  const sim = items.filter(i => i.id !== id && i.genres.some(g => it.genres.includes(g))).map(i => i.id)
  const dir = items.filter(i => i.id !== id && i.director && i.director === it.director).map(i => i.id)
  const ctry = items.filter(i => i.id !== id && i.country === it.country && !dir.includes(i.id)).map(i => i.id)
  const savedPos = profile.hist[id] || 0
  const savedPct = savedPos && it.dur ? Math.min(98, Math.round((savedPos / (it.dur * 60)) * 100)) : 0

  const episodes: Episode[] = it.seasons
    ? (it.episodesBySeason?.[season] || Array.from({ length: 6 }, (_, k) => ({ number: k + 1, title: `Épisode ${k + 1}`, duration_min: it.dur })))
    : []

  const share = async () => {
    const url = location.href
    if (navigator.share) {
      try { await navigator.share({ title: `${it.title} sur Kora`, text: it.synopsis, url }); return } catch { /* annulé */ }
    }
    try {
      await navigator.clipboard.writeText(url)
      toast('Lien copié dans le presse-papiers.', 'ok')
    } catch {
      toast('Partage indisponible sur ce navigateur.', 'info')
    }
  }

  const sendReport = async (e: React.FormEvent) => {
    e.preventDefault()
    setSending(true)
    const ok = await submitReport(id, details.trim() ? `${reason} — ${details.trim()}` : reason)
    setSending(false)
    if (ok) { setReportOpen(false); setDetails('') }
  }

  return (
    <>
      <header className="hero short">
        <Poster item={it} wide />
        <div className="hero-vignette" aria-hidden="true" />
        <div className="detail-top-bar">
          <a className="icon-btn glass" href="#/" aria-label="Retour à l’accueil"><Icon n="back" s={20} /></a>
        </div>
      </header>

      <div className="page detail">
        <div className="hero-badges">
          <span className="pill-accent">{it.badge || TYPE_LABEL[it.type]}</span>
          {it.quality === '4K' && <span className="pill-spec">4K</span>}
          {it.hdr && <span className="pill-spec">HDR</span>}
          {it.audioDesc && <span className="pill-spec">AD</span>}
          <span className="pill-spec">{it.age}</span>
        </div>

        <h1>{it.title}</h1>
        <p className="hero-meta">
          <Meta i={it} /> · {it.seasons ? `${it.seasons} saison${it.seasons > 1 ? 's' : ''}` : `${it.dur} min`} · {it.langs.join(', ')}
        </p>

        {savedPct > 0 && (
          <div className="detail-prog">
            <div className="ep-prog"><span style={{ width: `${savedPct}%` }} /></div>
            <small className="mu">Reprise à {fmtShort(savedPos)} ({savedPct} %)</small>
          </div>
        )}

        <div className="btns">
          <a className="btn p" href={session ? (it.seasons ? `#/lire/${id}?s=${season}&e=1` : `#/lire/${id}`) : '#/connexion'}>
            <Icon n={session ? 'play' : 'lock'} s={18} />
            {!session ? 'Se connecter pour lire' : savedPos > 30 ? 'Reprendre la lecture' : 'Lire'}
          </a>
          <a className="btn" href={session ? `#/lire/${id}?t=1` : '#/connexion'}><Icon n="film" s={18} />Bande-annonce</a>
          <ListBtn id={id} />
          <button type="button" className="btn" onClick={share}><Icon n="share" s={18} />Partager</button>
          <button type="button" className="btn" onClick={() => { if (requireAuth('signaler un contenu')) setReportOpen(true) }}><Icon n="flag" s={18} />Signaler</button>
        </div>

        {!session && (
          <p className="mu small-note">
            Mode visiteur : vous parcourez le catalogue en lecture seule. <a className="lnk" href="#/connexion">Connectez-vous</a> pour regarder, noter ou ajouter à votre liste.
          </p>
        )}

        <div className="chips" role="group" aria-label="Évaluer ce titre">
          {[['like', 'J’aime'], ['love', 'J’adore'], ['no', 'Pas pour moi']].map(([k, t]) => (
            <button key={k} type="button" className={'chip' + (session && profile.rate?.[id] === k ? ' on' : '')} onClick={() => rate(id, k)}>
              {t}
            </button>
          ))}
        </div>

        <p className="syn">{it.synopsis}</p>

        <dl className="meta-grid">
          <dt>Réalisation</dt>
          <dd><a className="lnk" href={`#/explorer?q=${encodeURIComponent(it.director)}`}>{it.director}</a></dd>
          <dt>Distribution</dt>
          <dd className="cast-list">
            {it.cast.map((actor, idx) => (
              <span key={actor}>
                <a className="lnk" href={`#/explorer?q=${encodeURIComponent(actor)}`}>{actor}</a>
                {idx < it.cast.length - 1 ? ', ' : ''}
              </span>
            ))}
          </dd>
          <dt>Pays</dt>
          <dd><a className="lnk" href={`#/explorer?country=${encodeURIComponent(it.country)}`}>{it.country}</a></dd>
          <dt>Langues audio</dt>
          <dd>{it.langs.join(', ')}{it.audioDesc ? ' · Audiodescription' : ''}</dd>
          <dt>Sous-titres</dt>
          <dd>{(it.subtitles || ['Français', 'English']).join(', ')}</dd>
          <dt>Genres</dt>
          <dd>
            {it.genres.map((g, idx) => (
              <span key={g}>
                <a className="lnk" href={`#/explorer?genre=${encodeURIComponent(g)}`}>{g}</a>
                {idx < it.genres.length - 1 ? ', ' : ''}
              </span>
            ))}
          </dd>
        </dl>

        {it.seasons && (
          <section className="seasons-sec">
            <div className="row-head">
              <h2>Épisodes</h2>
              <div className="chips">
                {Array.from({ length: it.seasons }, (_, k) => k + 1).map(s => (
                  <button key={s} type="button" className={'chip' + (s === season ? ' on' : '')} onClick={() => setSeason(s)}>
                    Saison {s}
                  </button>
                ))}
              </div>
            </div>
            <ol className="eps">
              {episodes.map(e => {
                const epSec = profile.epHist?.[`${id}:${season}:${e.number}`] || 0
                const epPct = epSec ? Math.min(100, Math.round((epSec / (e.duration_min * 60)) * 100)) : 0
                return (
                  <li key={e.number}>
                    <a href={session ? `#/lire/${id}?s=${season}&e=${e.number}` : '#/connexion'}>
                      <span className="ep-num">{e.number}</span>
                      <div className="ep-body">
                        <strong>{e.title}</strong>
                        {e.synopsis && <p className="mu">{e.synopsis}</p>}
                        {session && epPct > 0 && <div className="ep-prog"><span style={{ width: `${epPct}%` }} /></div>}
                      </div>
                      <small className="mu">{e.duration_min} min</small>
                    </a>
                  </li>
                )
              })}
            </ol>
          </section>
        )}
      </div>

      <Row title="Du même réalisateur" ids={dir} />
      <Row title="Du même pays" ids={ctry} />
      <Row title="Dans le même esprit" ids={sim} />

      <Modal open={reportOpen} onClose={() => setReportOpen(false)} title={`Signaler « ${it.title} »`}>
        <form className="form" onSubmit={sendReport}>
          <label>Motif du signalement
            <select value={reason} onChange={e => setReason(e.target.value)}>
              <option>Problème de lecture vidéo ou audio</option>
              <option>Sous-titres décalés ou manquants</option>
              <option>Erreur dans les informations ou la fiche</option>
              <option>Classification d’âge inadaptée</option>
              <option>Problème de droits ou contenu inapproprié</option>
            </select>
          </label>
          <label>Précisions (facultatif)
            <textarea className="field" rows={3} value={details} onChange={e => setDetails(e.target.value)} placeholder="Décrivez brièvement le souci rencontré…" />
          </label>
          <div className="btns">
            <button type="button" className="btn" onClick={() => setReportOpen(false)}>Annuler</button>
            <button type="submit" className="btn p" disabled={sending}>{sending ? 'Envoi…' : 'Envoyer le signalement'}</button>
          </div>
        </form>
      </Modal>

      <Footer />
    </>
  )
}

/* ============================================================================
   PROFIL (ÉPURÉ) — Profil actif, foyer, compte et historique récent
   Les réglages avancés (thème, lecture, appareils, notifications) sont dans #/parametres
   ============================================================================ */
export function Profile() {
  const {
    st, profile, items, byId, selectProfile, addProfile, updateProfile, deleteProfile,
    removeHistory, clearHistory, unreadCount
  } = useApp()

  const [createOpen, setCreateOpen] = useState(false)
  const [newName, setNewName] = useState('')
  const [newKid, setNewKid] = useState(false)
  const [newAvatar, setNewAvatar] = useState(AVATARS[0].id)
  const [newPin, setNewPin] = useState('')
  const [pinTarget, setPinTarget] = useState<ProfileType | null>(null)
  const [editing, setEditing] = useState<ProfileType | null>(null)
  const [editName, setEditName] = useState('')
  const [editKid, setEditKid] = useState(false)
  const [editAvatar, setEditAvatar] = useState('gold')
  const [editPin, setEditPin] = useState('')

  const hist = Object.keys(profile.hist).map(Number).map(byId).filter(Boolean) as Item[]
  const activePlan = PLANS.find(p => p.id === st.plan) || PLANS[0]

  const switchProfile = (p: ProfileType) => {
    if (p.id === st.cur) return
    if (p.hasPin) setPinTarget(p)
    else selectProfile(p.id)
  }

  const openEdit = (p: ProfileType) => {
    setEditing(p)
    setEditName(p.name)
    setEditKid(p.kid)
    setEditAvatar(p.avatar)
    setEditPin('')
  }

  return (
    <div className="page profile-page">
      <div className="page-head">
        <div className="profile-hero-id">
          <ProfileAvatar profile={profile} size={58} />
          <div>
            <h1>{profile.name}</h1>
            <p className="mu">Formule <strong>Kora {activePlan.name}</strong> · {items.length} titres accessibles</p>
          </div>
        </div>
        <div className="btns flush">
          <a className="btn" href="#/parametres">
            <Icon n="gear" s={18} />
            Paramètres {unreadCount > 0 && <span className="pill-accent">{unreadCount}</span>}
          </a>
          <a className="btn p" href="#/abonnement"><Icon n="crown" s={18} />Abonnement</a>
        </div>
      </div>

      <AccountSummary />

      {/* Profils du foyer */}
      <section className="panel">
        <div className="panel-head">
          <h2>Profils du foyer ({st.profiles.length}/{activePlan.profiles})</h2>
          <button type="button" className="btn" onClick={() => setCreateOpen(true)}>
            <Icon n="plus" s={18} />Nouveau profil
          </button>
        </div>
        <div className="profile-grid">
          {st.profiles.map(p => (
            <div key={p.id} className={'profile-card' + (p.id === st.cur ? ' on' : '')}>
              <button type="button" className="profile-select" onClick={() => switchProfile(p)}>
                <ProfileAvatar profile={p} size={48} />
                <div>
                  <strong>{p.name}</strong>
                  <small className="mu">
                    {p.kid ? 'Enfant (7+ max)' : 'Adulte'}
                    {p.hasPin ? ' · PIN' : ''}
                  </small>
                </div>
              </button>
              <button type="button" className="lnk small-lnk" onClick={() => openEdit(p)}>Modifier</button>
            </div>
          ))}
        </div>
      </section>

      {/* Historique de visionnage */}
      <section className="panel">
        <div className="panel-head">
          <h2>Historique de visionnage ({hist.length})</h2>
          {hist.length > 0 && <button type="button" className="lnk" onClick={clearHistory}>Tout effacer</button>}
        </div>
        {!hist.length ? <p className="mu">Aucun visionnage enregistré pour {profile.name}.</p> : (
          <div className="hist-list">
            {hist.map(i => (
              <div key={i.id} className="hist-item">
                <Card item={i} progressSec={profile.hist[i.id]} />
                <button type="button" className="lnk small-lnk" onClick={() => removeHistory(i.id)}>Retirer</button>
              </div>
            ))}
          </div>
        )}
      </section>

      <PinModal
        profile={pinTarget}
        onCancel={() => setPinTarget(null)}
        onSuccess={() => {
          if (pinTarget) selectProfile(pinTarget.id)
          setPinTarget(null)
        }}
      />

      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="Créer un profil du foyer">
        <form
          className="form"
          onSubmit={async e => {
            e.preventDefault()
            if (!newName.trim()) return
            await addProfile(newName.trim(), newKid, newAvatar, newPin || undefined)
            setNewName(''); setNewPin(''); setNewKid(false); setCreateOpen(false)
          }}
        >
          <label>Nom du profil
            <input className="field" required value={newName} onChange={e => setNewName(e.target.value)} placeholder="Ex. Fatoumata" />
          </label>
          <label>Couleur d’avatar
            <select value={newAvatar} onChange={e => setNewAvatar(e.target.value)}>
              {AVATARS.map(a => <option key={a.id} value={a.id}>{a.label}</option>)}
            </select>
          </label>
          <label>Code PIN (facultatif)
            <input className="field narrow" inputMode="numeric" maxLength={4} value={newPin} onChange={e => setNewPin(e.target.value.replace(/\D/g, ''))} placeholder="4 chiffres" />
          </label>
          <label className="chk">
            <input type="checkbox" checked={newKid} onChange={e => setNewKid(e.target.checked)} />
            Profil enfant (catalogue limité à Tous publics et 7+)
          </label>
          <div className="btns">
            <button type="button" className="btn" onClick={() => setCreateOpen(false)}>Annuler</button>
            <button type="submit" className="btn p">Créer le profil</button>
          </div>
        </form>
      </Modal>

      <Modal open={!!editing} onClose={() => setEditing(null)} title={`Modifier « ${editing?.name || ''} »`}>
        {editing && (
          <form
            className="form"
            onSubmit={async e => {
              e.preventDefault()
              await updateProfile(editing.id, {
                name: editName.trim() || editing.name,
                kid: editKid,
                avatar: editAvatar,
                ...(editPin ? { pin: editPin } : {})
              })
              setEditing(null)
            }}
          >
            <label>Nom du profil
              <input className="field" value={editName} onChange={e => setEditName(e.target.value)} required />
            </label>
            <label>Avatar
              <select value={editAvatar} onChange={e => setEditAvatar(e.target.value)}>
                {AVATARS.map(a => <option key={a.id} value={a.id}>{a.label}</option>)}
              </select>
            </label>
            <label className="chk">
              <input type="checkbox" checked={editKid} onChange={e => setEditKid(e.target.checked)} />
              Profil enfant (limite le catalogue à Tous publics et 7+)
            </label>
            <label>Nouveau code PIN (laisser vide pour conserver)
              <input className="field narrow" inputMode="numeric" maxLength={4} value={editPin} onChange={e => setEditPin(e.target.value.replace(/\D/g, ''))} placeholder="4 chiffres" />
            </label>
            <div className="btns">
              <button type="submit" className="btn p">Enregistrer</button>
              {editing.hasPin && (
                <button type="button" className="btn" onClick={async () => { await updateProfile(editing.id, { pin: null }); setEditing(null) }}>
                  Retirer le PIN
                </button>
              )}
              {st.profiles.length > 1 && (
                <button type="button" className="btn danger" onClick={async () => { await deleteProfile(editing.id); setEditing(null) }}>
                  <Icon n="trash" s={16} />Supprimer
                </button>
              )}
            </div>
          </form>
        )}
      </Modal>

      <Footer />
    </div>
  )
}

/* ============================================================================
   PARAMÈTRES (REFONTE INSPIRÉE DE CHROME SETTINGS)
   Navigation latérale à onglets + Barre de recherche interne + Cartes en lignes
   Sans mention de rôle ni modification de mot de passe
   ============================================================================ */
type SettingsSectionId = 'account' | 'appearance' | 'playback' | 'privacy' | 'devices' | 'notifications'

const SETTINGS_NAV: { id: SettingsSectionId; label: string; icon: string; keywords: string }[] = [
  { id: 'account', label: 'Kora et vous', icon: 'user', keywords: 'compte profil nom pays abonnement foyer deconnexion' },
  { id: 'appearance', label: 'Apparence', icon: 'sun', keywords: 'theme sombre clair oled couleur taille sous-titres' },
  { id: 'playback', label: 'Lecture et langues', icon: 'film', keywords: 'qualite video 4k 1080p audio langue sous-titres episode suivant automatique' },
  { id: 'privacy', label: 'Confidentialité et sécurité', icon: 'shield', keywords: 'confidentialite cookies publicite historique effacer donnees conditions' },
  { id: 'devices', label: 'Appareils connectés', icon: 'device', keywords: 'appareils ecrans session navigateur deconnecter' },
  { id: 'notifications', label: 'Notifications', icon: 'bell', keywords: 'notifications alertes messages nouveautes' }
]

const SETTINGS_COUNTRIES = [
  'Mali', 'Sénégal', 'Côte d’Ivoire', 'Burkina Faso', 'Guinée', 'Niger', 'Bénin', 'Togo',
  'Cameroun', 'Gabon', 'RD Congo', 'Nigeria', 'Ghana', 'Afrique du Sud', 'Maroc',
  'France', 'Belgique', 'Suisse', 'Canada', 'États-Unis', 'Autre'
]

export function Settings() {
  const {
    st, set, setTheme, session, profile, signOut, updateAccount,
    clearHistory, revokeDevice, markNotificationsRead, unreadCount, toast
  } = useApp()
  const [sec, setSec] = useState<SettingsSectionId>('account')
  const [searchQ, setSearchQ] = useState('')
  const [accName, setAccName] = useState(st.accountName || '')
  const [accCountry, setAccCountry] = useState(st.accountCountry || 'Mali')
  const [consent, setConsentState] = useState(() => {
    try { return localStorage.getItem('kora-consent') === 'yes' } catch { return false }
  })

  useEffect(() => {
    setAccName(st.accountName || '')
    setAccCountry(st.accountCountry || 'Mali')
  }, [st.accountName, st.accountCountry])

  const activePlan = PLANS.find(p => p.id === st.plan) || PLANS[0]
  const u = session?.user
  const qClean = norm(searchQ.trim())

  const showSec = (id: SettingsSectionId) => {
    if (!qClean) return sec === id
    const item = SETTINGS_NAV.find(n => n.id === id)
    return Boolean(item && norm(`${item.label} ${item.keywords}`).includes(qClean))
  }

  const toggleConsent = () => {
    const next = !consent
    try { localStorage.setItem('kora-consent', next ? 'yes' : 'no') } catch { /* ignoré */ }
    setConsentState(next)
    toast(next ? 'Personnalisation publicitaire activée.' : 'Personnalisation publicitaire désactivée.', 'info')
  }

  const activeMeta = SETTINGS_NAV.find(n => n.id === sec) || SETTINGS_NAV[0]

  return (
    <div className="cr-settings-shell">
      {/* Barre supérieure façon Chrome Settings : Titre à gauche + Recherche centrée */}
      <header className="cr-topbar">
        <div className="cr-topbar-title">
          <Icon n="gear" s={22} />
          <h1>Paramètres</h1>
        </div>
        <div className="cr-search-wrap">
          <Icon n="search" s={18} />
          <input
            type="search"
            value={searchQ}
            onChange={e => setSearchQ(e.target.value)}
            placeholder="Rechercher dans les paramètres"
            aria-label="Rechercher dans les paramètres"
          />
          {searchQ && (
            <button type="button" className="cr-clear-btn" onClick={() => setSearchQ('')} aria-label="Effacer">
              ×
            </button>
          )}
        </div>
        <a className="btn cr-back-btn" href="#/profil">
          <Icon n="user" s={17} />Profil
        </a>
      </header>

      <div className="cr-layout">
        {/* Menu latéral façon Chrome Settings */}
        <aside className="cr-sidebar" aria-label="Rubriques des paramètres">
          {SETTINGS_NAV.map(item => (
            <button
              key={item.id}
              type="button"
              className={'cr-nav-item' + (!qClean && sec === item.id ? ' on' : '')}
              onClick={() => { setSearchQ(''); setSec(item.id) }}
            >
              <Icon n={item.icon} s={19} />
              <span>{item.label}</span>
              {item.id === 'notifications' && unreadCount > 0 && (
                <span className="pill-accent" style={{ marginLeft: 'auto' }}>{unreadCount}</span>
              )}
            </button>
          ))}
        </aside>

        {/* Colonne centrale façon Chrome Settings */}
        <main className="cr-main">
          {!qClean && (
            <div className="cr-sec-header">
              <h2>{activeMeta.label}</h2>
              <p className="mu">
                {sec === 'account' && 'Gérez les informations de votre compte Kora, vos profils du foyer et votre abonnement.'}
                {sec === 'appearance' && 'Personnalisez le thème visuel et la taille d’affichage des sous-titres sur vos écrans.'}
                {sec === 'playback' && 'Choisissez votre qualité vidéo, vos langues préférées et le comportement du lecteur.'}
                {sec === 'privacy' && 'Contrôlez vos préférences de confidentialité, votre historique et vos données.'}
                {sec === 'devices' && `Consultez les écrans connectés à votre compte (${st.devices.length}/${activePlan.screens} simultané${activePlan.screens > 1 ? 's' : ''}).`}
                {sec === 'notifications' && 'Retrouvez les alertes et nouveautés liées à votre compte et au catalogue.'}
              </p>
            </div>
          )}

          {/* 1. KORA ET VOUS (Compte sans mention de rôle ni mot de passe) */}
          {showSec('account') && (
            <section className="cr-section">
              {qClean && <h3 className="cr-group-title">Kora et vous</h3>}
              <div className="cr-card">
                <div className="cr-row cr-profile-row">
                  <div className="cr-row-left">
                    <ProfileAvatar profile={profile} size={46} />
                    <div className="cr-row-text">
                      <strong>{accName || profile.name}</strong>
                      <small className="mu">{u?.email || u?.phone || 'Compte connecté'}</small>
                    </div>
                  </div>
                  <div className="cr-row-ctrl">
                    <button type="button" className="btn" onClick={signOut}>
                      Se déconnecter
                    </button>
                  </div>
                </div>

                <div className="cr-row">
                  <div className="cr-row-left">
                    <span className="cr-row-icon"><Icon n="user" s={18} /></span>
                    <div className="cr-row-text">
                      <strong>Nom du titulaire</strong>
                      <small className="mu">Nom affiché sur votre compte et vos factures</small>
                    </div>
                  </div>
                  <div className="cr-row-ctrl">
                    <input
                      className="field cr-inline-input"
                      value={accName}
                      onChange={e => setAccName(e.target.value)}
                      placeholder="Votre nom"
                      aria-label="Nom du titulaire"
                    />
                  </div>
                </div>

                <div className="cr-row">
                  <div className="cr-row-left">
                    <span className="cr-row-icon"><Icon n="globe" s={18} /></span>
                    <div className="cr-row-text">
                      <strong>Pays de résidence</strong>
                      <small className="mu">Détermine le catalogue et les moyens de paiement locaux</small>
                    </div>
                  </div>
                  <div className="cr-row-ctrl">
                    <select
                      className="cr-inline-select"
                      value={accCountry}
                      onChange={e => setAccCountry(e.target.value)}
                      aria-label="Pays de résidence"
                    >
                      {SETTINGS_COUNTRIES.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                </div>

                <div className="cr-row">
                  <div className="cr-row-left">
                    <span className="cr-row-icon"><Icon n="check" s={18} /></span>
                    <div className="cr-row-text">
                      <strong>Sauvegarder vos informations</strong>
                      <small className="mu">Appliquer les modifications de nom et de pays</small>
                    </div>
                  </div>
                  <div className="cr-row-ctrl">
                    <button type="button" className="btn p" onClick={() => updateAccount(accName, accCountry)}>
                      Enregistrer
                    </button>
                  </div>
                </div>
              </div>

              <h3 className="cr-group-title">Foyer et abonnement</h3>
              <div className="cr-card">
                <a className="cr-row cr-link-row" href="#/profil">
                  <div className="cr-row-left">
                    <span className="cr-row-icon"><Icon n="user" s={18} /></span>
                    <div className="cr-row-text">
                      <strong>Profils du foyer ({st.profiles.length}/{activePlan.profiles})</strong>
                      <small className="mu">Profil actif : {profile.name} · Gérer les avatars et le mode Enfant</small>
                    </div>
                  </div>
                  <span className="cr-chev" aria-hidden="true"><Icon n="chevR" s={18} /></span>
                </a>

                <a className="cr-row cr-link-row" href="#/abonnement">
                  <div className="cr-row-left">
                    <span className="cr-row-icon"><Icon n="crown" s={18} /></span>
                    <div className="cr-row-text">
                      <strong>Formule et paiements</strong>
                      <small className="mu">Offre actuelle : Kora {activePlan.name} · Consulter les formules et factures</small>
                    </div>
                  </div>
                  <span className="cr-chev" aria-hidden="true"><Icon n="chevR" s={18} /></span>
                </a>
              </div>
            </section>
          )}

          {/* 2. APPARENCE */}
          {showSec('appearance') && (
            <section className="cr-section">
              {qClean && <h3 className="cr-group-title">Apparence</h3>}
              <div className="cr-card">
                <div className="cr-row">
                  <div className="cr-row-left">
                    <span className="cr-row-icon"><Icon n={st.theme === 'light' ? 'sun' : 'moon'} s={18} /></span>
                    <div className="cr-row-text">
                      <strong>Thème de l’interface</strong>
                      <small className="mu">Choisissez entre Sombre Kora, Cinéma OLED ou Clair éditorial</small>
                    </div>
                  </div>
                  <div className="cr-row-ctrl">
                    <select
                      className="cr-inline-select"
                      value={st.theme}
                      onChange={e => setTheme(e.target.value as ThemeMode)}
                      aria-label="Thème de l’interface"
                    >
                      <option value="dark">Sombre Kora (Recommandé)</option>
                      <option value="black">Cinéma OLED (Noir profond)</option>
                      <option value="light">Clair éditorial</option>
                    </select>
                  </div>
                </div>

                <div className="cr-row">
                  <div className="cr-row-left">
                    <span className="cr-row-icon"><Icon n="captions" s={18} /></span>
                    <div className="cr-row-text">
                      <strong>Taille des sous-titres</strong>
                      <small className="mu">Adaptez la taille du texte affiché pendant la lecture vidéo</small>
                    </div>
                  </div>
                  <div className="cr-row-ctrl">
                    <select
                      className="cr-inline-select"
                      value={st.subSize}
                      onChange={e => set({ subSize: e.target.value as any })}
                      aria-label="Taille des sous-titres"
                    >
                      <option value="petit">Petit</option>
                      <option value="normal">Normal</option>
                      <option value="grand">Grand (haute lisibilité)</option>
                    </select>
                  </div>
                </div>
              </div>
            </section>
          )}

          {/* 3. LECTURE ET LANGUES */}
          {showSec('playback') && (
            <section className="cr-section">
              {qClean && <h3 className="cr-group-title">Lecture et langues</h3>}
              <div className="cr-card">
                <div className="cr-row">
                  <div className="cr-row-left">
                    <span className="cr-row-icon"><Icon n="film" s={18} /></span>
                    <div className="cr-row-text">
                      <strong>Qualité vidéo par défaut</strong>
                      <small className="mu">Ajuste la résolution selon votre connexion Internet</small>
                    </div>
                  </div>
                  <div className="cr-row-ctrl">
                    <select
                      className="cr-inline-select"
                      value={st.defaultQuality}
                      onChange={e => set({ defaultQuality: e.target.value })}
                      aria-label="Qualité vidéo par défaut"
                    >
                      {['Auto', '4K', '1080p', '720p', '480p'].map(x => <option key={x} value={x}>{x}</option>)}
                    </select>
                  </div>
                </div>

                <div className="cr-row">
                  <div className="cr-row-left">
                    <span className="cr-row-icon"><Icon n="vol" s={18} /></span>
                    <div className="cr-row-text">
                      <strong>Langue audio préférée</strong>
                      <small className="mu">Piste audio sélectionnée à l’ouverture d’une œuvre</small>
                    </div>
                  </div>
                  <div className="cr-row-ctrl">
                    <select
                      className="cr-inline-select"
                      value={st.audioLang}
                      onChange={e => set({ audioLang: e.target.value })}
                      aria-label="Langue audio préférée"
                    >
                      {['Original', 'Bambara', 'Français', 'Wolof', 'Peul', 'Anglais'].map(x => <option key={x} value={x}>{x}</option>)}
                    </select>
                  </div>
                </div>

                <div className="cr-row">
                  <div className="cr-row-left">
                    <span className="cr-row-icon"><Icon n="captions" s={18} /></span>
                    <div className="cr-row-text">
                      <strong>Sous-titres par défaut</strong>
                      <small className="mu">Langue des sous-titres synchronisés activée au lancement</small>
                    </div>
                  </div>
                  <div className="cr-row-ctrl">
                    <select
                      className="cr-inline-select"
                      value={st.subLang}
                      onChange={e => set({ subLang: e.target.value })}
                      aria-label="Sous-titres par défaut"
                    >
                      {['Désactivés', 'Français', 'English', 'Bambara'].map(x => <option key={x} value={x}>{x}</option>)}
                    </select>
                  </div>
                </div>

                <div className="cr-row">
                  <div className="cr-row-left">
                    <span className="cr-row-icon"><Icon n="play" s={18} /></span>
                    <div className="cr-row-text">
                      <strong>Lecture automatique de l’épisode suivant</strong>
                      <small className="mu">Enchaîne automatiquement les épisodes d’une série</small>
                    </div>
                  </div>
                  <div className="cr-row-ctrl">
                    <button
                      type="button"
                      role="switch"
                      aria-checked={st.autoNext !== false}
                      className={'cr-switch' + (st.autoNext !== false ? ' on' : '')}
                      onClick={() => set({ autoNext: st.autoNext === false })}
                      aria-label="Lecture automatique de l’épisode suivant"
                    >
                      <span />
                    </button>
                  </div>
                </div>
              </div>
            </section>
          )}

          {/* 4. CONFIDENTIALITÉ ET SÉCURITÉ */}
          {showSec('privacy') && (
            <section className="cr-section">
              {qClean && <h3 className="cr-group-title">Confidentialité et sécurité</h3>}
              <div className="cr-card">
                <div className="cr-row">
                  <div className="cr-row-left">
                    <span className="cr-row-icon"><Icon n="shield" s={18} /></span>
                    <div className="cr-row-text">
                      <strong>Publicités personnalisées (formule gratuite)</strong>
                      <small className="mu">Adapter les annonces de la formule gratuite selon vos centres d’intérêt</small>
                    </div>
                  </div>
                  <div className="cr-row-ctrl">
                    <button
                      type="button"
                      role="switch"
                      aria-checked={consent}
                      className={'cr-switch' + (consent ? ' on' : '')}
                      onClick={toggleConsent}
                      aria-label="Publicités personnalisées"
                    >
                      <span />
                    </button>
                  </div>
                </div>

                <div className="cr-row">
                  <div className="cr-row-left">
                    <span className="cr-row-icon"><Icon n="trash" s={18} /></span>
                    <div className="cr-row-text">
                      <strong>Effacer l’historique de visionnage</strong>
                      <small className="mu">Supprimer les reprises de lecture du profil {profile.name}</small>
                    </div>
                  </div>
                  <div className="cr-row-ctrl">
                    <button type="button" className="btn" onClick={() => { clearHistory(); toast('Historique de visionnage effacé.', 'info') }}>
                      Effacer
                    </button>
                  </div>
                </div>

                <a className="cr-row cr-link-row" href="#/confidentialite">
                  <div className="cr-row-left">
                    <span className="cr-row-icon"><Icon n="info" s={18} /></span>
                    <div className="cr-row-text">
                      <strong>Politique de confidentialité</strong>
                      <small className="mu">Protection de vos données personnelles et de vos profils</small>
                    </div>
                  </div>
                  <span className="cr-chev" aria-hidden="true"><Icon n="chevR" s={18} /></span>
                </a>

                <a className="cr-row cr-link-row" href="#/cgu">
                  <div className="cr-row-left">
                    <span className="cr-row-icon"><Icon n="info" s={18} /></span>
                    <div className="cr-row-text">
                      <strong>Conditions générales d’utilisation</strong>
                      <small className="mu">Règles d’accès au catalogue et aux abonnements Kora</small>
                    </div>
                  </div>
                  <span className="cr-chev" aria-hidden="true"><Icon n="chevR" s={18} /></span>
                </a>
              </div>
            </section>
          )}

          {/* 5. APPAREILS CONNECTÉS */}
          {showSec('devices') && (
            <section className="cr-section">
              {qClean && <h3 className="cr-group-title">Appareils connectés</h3>}
              <div className="cr-card">
                {st.devices.map(d => (
                  <div key={d.id} className="cr-row">
                    <div className="cr-row-left">
                      <span className="cr-row-icon"><Icon n="device" s={18} /></span>
                      <div className="cr-row-text">
                        <strong>{d.name} {d.current && <span className="pill-spec">Cet appareil</span>}</strong>
                        <small className="mu">{d.platform} · Dernière activité : {fmtDate(d.lastSeen)}</small>
                      </div>
                    </div>
                    <div className="cr-row-ctrl">
                      {!d.current && (
                        <button type="button" className="btn" onClick={() => revokeDevice(d.id)}>
                          Déconnecter
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* 6. NOTIFICATIONS */}
          {showSec('notifications') && (
            <section className="cr-section">
              <div className="cr-group-head">
                {qClean ? <h3 className="cr-group-title">Notifications</h3> : <span />}
                {unreadCount > 0 && (
                  <button type="button" className="lnk small-lnk" onClick={() => markNotificationsRead()}>
                    Tout marquer comme lu
                  </button>
                )}
              </div>
              <div className="cr-card">
                {!st.notifications.length ? (
                  <div className="cr-row">
                    <span className="mu">Aucune notification pour le moment.</span>
                  </div>
                ) : (
                  st.notifications.map(n => (
                    <div key={n.id} className={'cr-row' + (n.read ? '' : ' cr-unread')}>
                      <div className="cr-row-left">
                        <span className="cr-row-icon"><Icon n="bell" s={18} /></span>
                        <div className="cr-row-text">
                          <strong>{n.title}</strong>
                          <small className="mu">{n.body} · {fmtDate(n.date)}</small>
                        </div>
                      </div>
                      <div className="cr-row-ctrl">
                        {n.link && (n.link.startsWith('#/') || n.link.startsWith('/')) && (
                          <a className="btn" href={n.link} onClick={() => markNotificationsRead(n.id)}>Voir</a>
                        )}
                        {!n.read && (
                          <button type="button" className="lnk small-lnk" onClick={() => markNotificationsRead(n.id)}>
                            Lu
                          </button>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </section>
          )}
        </main>
      </div>

      <Footer />
    </div>
  )
}

/* ============================================================================
   ABONNEMENT — Mode simulation + Mode SasPay (Softpay, Checkout hébergé, OTP, Verify)
   ============================================================================ */
const PENDING_SASPAY_KEY = 'kora-pending-saspay'

type PendingSaspayState = {
  planId: 'premium' | 'family'
  billing: 'month' | 'year'
  providerLabel: string
  paymentId?: string
  sessionId?: string
  checkoutUrl?: string
  idempotencyKey: string
  postOtpConfirm?: boolean
  status: 'PENDING' | 'FAILED' | 'SUCCESS'
}

export function Subscription() {
  const { st, subscribePlan, applyVerifiedSubscription, cancelSubscription, billingSimulation, toast } = useApp()
  const [billing, setBilling] = useState<'month' | 'year'>(st.billing || 'month')
  const [checkoutPlan, setCheckoutPlan] = useState<PlanId | null>(null)
  const [countryIso, setCountryIso] = useState('ML')
  const [networkCode, setNetworkCode] = useState('orange_ml')
  const [flowMode, setFlowMode] = useState<'softpay' | 'hosted'>('softpay')
  const [payInput, setPayInput] = useState('')
  const [preOtp, setPreOtp] = useState('')
  const [forcePreOtp, setForcePreOtp] = useState(false)
  const [otpHint, setOtpHint] = useState('')
  const [postOtp, setPostOtp] = useState('')
  const [intentKey, setIntentKey] = useState(() => createIntentIdempotencyKey('sub'))
  const [pendingTx, setPendingTx] = useState<PendingSaspayState | null>(() => {
    try {
      const raw = sessionStorage.getItem(PENDING_SASPAY_KEY)
      return raw ? JSON.parse(raw) : null
    } catch {
      return null
    }
  })
  const [payErr, setPayErr] = useState('')
  const [payInfo, setPayInfo] = useState('')
  const [busy, setBusy] = useState(false)

  const selected = PLANS.find(p => p.id === checkoutPlan)
  const currentPlan = PLANS.find(p => p.id === st.plan) || PLANS[0]
  const activeCountry = SASPAY_COUNTRIES.find(c => c.iso === countryIso) || SASPAY_COUNTRIES[0]
  const activeNet = activeCountry.networks.find(n => n.code === networkCode)
  const isCard = networkCode === 'card'
  const needsPreOtp = !isCard && flowMode === 'softpay' && (Boolean(activeNet?.otpPreRequired) || forcePreOtp)

  const savePendingTx = (next: PendingSaspayState | null) => {
    setPendingTx(next)
    try {
      if (next) sessionStorage.setItem(PENDING_SASPAY_KEY, JSON.stringify(next))
      else sessionStorage.removeItem(PENDING_SASPAY_KEY)
    } catch { /* ignoré */ }
  }

  // Au retour d'une redirection checkout_url (?saspay_return=1), on ne livre JAMAIS sur la seule redirection :
  // on appelle systématiquement GET /payments/{payment_id}/verify/ côté serveur.
  useEffect(() => {
    if (!pendingTx || (!pendingTx.paymentId && !pendingTx.sessionId)) return
    let active = true
    ;(async () => {
      setBusy(true)
      const ver = await verifySaspayPayment({
        paymentId: pendingTx.paymentId,
        sessionId: pendingTx.sessionId
      })
      if (!active) return
      setBusy(false)
      if (ver.ok && ver.status === 'SUCCESS' && ver.delivered) {
        applyVerifiedSubscription(
          pendingTx.planId,
          pendingTx.billing,
          pendingTx.providerLabel,
          ver.reference || pendingTx.paymentId || pendingTx.sessionId || 'KORA',
          ver.charged || undefined
        )
        savePendingTx(null)
        setCheckoutPlan(null)
      } else if (ver.status === 'FAILED') {
        savePendingTx({ ...pendingTx, status: 'FAILED', paymentId: ver.paymentId || pendingTx.paymentId })
      }
    })()
    return () => { active = false }
  }, [])

  const onCountryChange = (iso: string) => {
    setCountryIso(iso)
    const found = SASPAY_COUNTRIES.find(c => c.iso === iso)
    if (found && found.networks.length && networkCode !== 'card') {
      setNetworkCode(found.networks[0].code)
    }
    setForcePreOtp(false)
    setPreOtp('')
    setPayErr('')
    setIntentKey(createIntentIdempotencyKey('sub'))
  }

  const activateFreeSimulation = async (planId: PlanId) => {
    setBusy(true)
    await subscribePlan(planId, billing, 'Activation gratuite')
    setBusy(false)
  }

  const openCheckoutModal = (planId: PlanId) => {
    setPayErr('')
    setPayInfo('')
    setPreOtp('')
    setPostOtp('')
    setForcePreOtp(false)
    setIntentKey(createIntentIdempotencyKey(`sub-${planId}-${billing}`))
    setCheckoutPlan(planId)
  }

  const confirmPayment = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!checkoutPlan || checkoutPlan === 'free') return
    setBusy(true); setPayErr(''); setPayInfo('')

    if (billingSimulation) {
      const simRes = await subscribePlan(checkoutPlan, billing, activeNet?.label || 'Simulation', payInput)
      setBusy(false)
      if (simRes.ok) {
        setCheckoutPlan(null)
        setPayInput('')
      } else {
        setPayErr(simRes.error || 'Activation impossible.')
      }
      return
    }

    const providerLabel = flowMode === 'hosted'
      ? 'Paiement en ligne'
      : isCard
        ? 'Carte bancaire'
        : (activeNet?.label || 'Mobile Money')

    const res = await processPaymentCheckout({
      planId: checkoutPlan,
      billing,
      provider: activeNet?.provider || (isCard ? 'Carte bancaire' : 'Orange Money'),
      customerRef: payInput.trim(),
      countryIso,
      networkCode,
      otp: needsPreOtp ? preOtp.trim() : undefined,
      flow: flowMode,
      idempotencyKey: intentKey
    }, false)

    setBusy(false)

    if (!res.ok) {
      if (res.otpRequired) {
        setForcePreOtp(true)
        setOtpHint(res.otpInstructions || 'Obtenez votre code de confirmation auprès de votre opérateur avant de valider.')
      }
      // Si ce n'est pas une erreur réseau (502/503/429), on régénère une clé d'idempotence pour la correction des paramètres
      if (res.code && res.code !== 'network_error' && res.code !== 'rate_limited') {
        setIntentKey(createIntentIdempotencyKey(`sub-${checkoutPlan}-${billing}`))
      }
      setPayErr(res.error)
      return
    }

    const nextPending: PendingSaspayState = {
      planId: checkoutPlan,
      billing,
      providerLabel,
      paymentId: res.paymentId,
      sessionId: res.sessionId,
      checkoutUrl: res.checkoutUrl,
      idempotencyKey: res.idempotencyKey || intentKey,
      postOtpConfirm: Boolean(activeNet?.postOtpConfirm),
      status: 'PENDING'
    }
    savePendingTx(nextPending)

    if (res.checkoutUrl && res.checkoutUrl.trim().length > 0) {
      setPayInfo('Redirection vers la page de paiement sécurisée…')
      window.location.assign(res.checkoutUrl)
      return
    }

    setPayInfo('Demande envoyée sur votre téléphone. Validez sur votre mobile puis cliquez sur « Vérifier mon paiement ».')
  }

  const handleVerifyNow = async () => {
    if (!pendingTx) return
    setBusy(true); setPayErr(''); setPayInfo('Vérification de votre paiement en cours…')
    const ver = await verifySaspayPayment({
      paymentId: pendingTx.paymentId,
      sessionId: pendingTx.sessionId
    })
    setBusy(false)

    if (!ver.ok) {
      setPayInfo('')
      setPayErr(ver.error || 'Vérification impossible.')
      return
    }

    if (ver.status === 'SUCCESS' && ver.delivered) {
      applyVerifiedSubscription(
        pendingTx.planId,
        pendingTx.billing,
        pendingTx.providerLabel,
        ver.reference || pendingTx.paymentId || pendingTx.sessionId || 'KORA',
        ver.charged || undefined
      )
      savePendingTx(null)
      setCheckoutPlan(null)
      setPayInfo('')
      return
    }

    if (ver.status === 'FAILED') {
      savePendingTx({ ...pendingTx, status: 'FAILED', paymentId: ver.paymentId || pendingTx.paymentId })
      setPayInfo('')
      setPayErr('Le paiement n’a pas abouti. Vous pouvez réessayer ci-dessous sans risque de double débit.')
      return
    }

    setPayInfo('Paiement en attente de validation sur votre mobile. Votre abonnement sera activé dès confirmation.')
  }

  const handleConfirmPostOtp = async () => {
    if (!pendingTx?.paymentId || !postOtp.trim()) return
    setBusy(true); setPayErr(''); setPayInfo('Validation de votre code de confirmation…')
    const res = await confirmSaspayPaymentOtp(pendingTx.paymentId, postOtp.trim())
    setBusy(false)
    if (!res.ok) {
      setPayInfo('')
      setPayErr(res.error || 'Code de confirmation refusé.')
      return
    }
    if (res.status === 'SUCCESS' && res.delivered) {
      applyVerifiedSubscription(
        pendingTx.planId,
        pendingTx.billing,
        pendingTx.providerLabel,
        pendingTx.paymentId,
        undefined
      )
      savePendingTx(null)
      setCheckoutPlan(null)
      setPostOtp('')
      return
    }
    setPayInfo('Code transmis. Cliquez sur « Vérifier mon paiement » pour finaliser l’activation.')
  }

  const handleRetryFailed = async () => {
    if (!pendingTx?.paymentId) return
    setBusy(true); setPayErr(''); setPayInfo('Relance du paiement en cours…')
    const retryKey = createIntentIdempotencyKey(`retry-${pendingTx.paymentId.slice(0, 8)}`)
    const res = await retrySaspayPayment({
      paymentId: pendingTx.paymentId,
      idempotencyKey: retryKey
    })
    setBusy(false)
    if (!res.ok) {
      setPayInfo('')
      setPayErr(res.error || 'Impossible de relancer ce paiement.')
      return
    }
    savePendingTx({ ...pendingTx, status: 'PENDING', checkoutUrl: res.checkoutUrl || pendingTx.checkoutUrl })
    if (res.checkoutUrl) {
      window.location.assign(res.checkoutUrl)
      return
    }
    setPayInfo('Paiement relancé ! Validez sur votre téléphone puis vérifiez la confirmation.')
  }

  const pendingStatusLabel = pendingTx?.status === 'FAILED' ? 'Non abouti' : 'En attente'

  return (
    <div className="page sub-page">
      <div className="sub-hero">
        <span className="pill-accent">{billingSimulation ? 'Offre découverte · Activation gratuite' : 'Offres & Abonnements Kora'}</span>
        <h1>Choisissez votre formule</h1>
        <p className="mu">
          {billingSimulation
            ? 'Pendant notre phase de lancement, activez gratuitement votre formule Kora Premium ou Famille en un clic et profitez du catalogue sans publicité jusqu’en 4K.'
            : 'Sans engagement. Paiement sécurisé par Orange Money, Wave, Moov Money, MTN MoMo ou carte bancaire.'}
        </p>

        <div className="billing-toggle" role="group" aria-label="Fréquence de facturation">
          <button type="button" className={'chip' + (billing === 'month' ? ' on' : '')} onClick={() => setBilling('month')}>Mensuel</button>
          <button type="button" className={'chip' + (billing === 'year' ? ' on' : '')} onClick={() => setBilling('year')}>
            Annuel <span className="save-tag">2 mois offerts</span>
          </button>
        </div>
      </div>

      {billingSimulation && (
        <div className="sim-banner" role="note">
          <Icon n="sparkles" s={18} />
          <div>
            <strong>Accès découverte offert</strong> — Choisissez la formule de votre choix ci-dessous pour l’activer immédiatement sans aucun frais et profiter du cinéma africain en haute définition.
          </div>
        </div>
      )}

      {pendingTx && (
        <section className="panel" aria-live="polite">
          <div className="panel-head">
            <div>
              <h2>Paiement en cours de confirmation</h2>
              <p className="mu">
                Référence : <strong>{pendingTx.paymentId || pendingTx.sessionId}</strong> · {pendingTx.providerLabel}.
                Votre abonnement est activé automatiquement dès confirmation du paiement.
              </p>
            </div>
            <span className={pendingTx.status === 'FAILED' ? 'pill-accent' : 'pill-spec'}>
              {pendingStatusLabel}
            </span>
          </div>
          {payInfo && <p className="status-box" role="status">{payInfo}</p>}
          {payErr && <p className="err-msg" role="alert">{payErr}</p>}
          <div className="btns flush">
            <button type="button" className="btn p" disabled={busy} onClick={handleVerifyNow}>
              <Icon n="check" s={18} />
              {busy ? 'Vérification…' : 'Vérifier mon paiement'}
            </button>
            {pendingTx.checkoutUrl && (
              <a className="btn" href={pendingTx.checkoutUrl}>
                Ouvrir la page de paiement
              </a>
            )}
            {pendingTx.status === 'FAILED' && pendingTx.paymentId && (
              <button type="button" className="btn" disabled={busy} onClick={handleRetryFailed}>
                Relancer ce paiement (sans double débit)
              </button>
            )}
            <button type="button" className="btn" disabled={busy} onClick={() => { savePendingTx(null); setPayInfo(''); setPayErr('') }}>
              Fermer ce suivi
            </button>
          </div>
        </section>
      )}

      <div className="plans">
        {PLANS.map(plan => {
          const isCurrent = st.plan === plan.id
          const price = billing === 'year' ? plan.priceYear : plan.priceMonth
          return (
            <section key={plan.id} className={'plan-card' + (plan.id === 'premium' ? ' featured' : '') + (isCurrent ? ' current' : '')}>
              <div className="plan-top">
                <h2>{plan.name}</h2>
                {plan.id === 'premium' && <span className="pill-accent">Populaire</span>}
                {isCurrent && <span className="pill-spec">Votre formule</span>}
              </div>
              <p className="mu">{plan.tagline}</p>
              <p className="price">
                {price.toLocaleString('fr-FR')} FCFA
                <small>{price === 0 ? ' · pour toujours' : billing === 'year' ? ' / an' : ' / mois'}</small>
              </p>
              <ul className="plan-feats">
                {plan.features.map(f => (
                  <li key={f}><Icon n="check" s={16} /><span>{f}</span></li>
                ))}
              </ul>
              {isCurrent ? (
                <div className="plan-status">
                  {plan.id !== 'free' && (
                    st.cancelAtPeriodEnd
                      ? <button type="button" className="btn wide-btn" onClick={() => cancelSubscription(false)}>Réactiver le renouvellement</button>
                      : <button type="button" className="btn wide-btn" onClick={() => cancelSubscription(true)}>Programmer la résiliation</button>
                  )}
                </div>
              ) : plan.id === 'free' ? (
                <button type="button" className="btn wide-btn" onClick={() => subscribePlan('free', 'month', 'Aucun')}>
                  Revenir à Gratuit
                </button>
              ) : billingSimulation ? (
                <div className="plan-actions">
                  <button type="button" className="btn p wide-btn" disabled={busy} onClick={() => activateFreeSimulation(plan.id)}>
                    Activer {plan.name} gratuitement
                  </button>
                  <button type="button" className="lnk small-lnk" onClick={() => openCheckoutModal(plan.id)}>
                    Payer par Mobile Money ou Carte
                  </button>
                </div>
              ) : (
                <button type="button" className="btn p wide-btn" onClick={() => openCheckoutModal(plan.id)}>
                  Payer et activer {plan.name}
                </button>
              )}
            </section>
          )
        })}
      </div>

      {st.plan !== 'free' && (
        <section className="panel">
          <h2>Statut de votre abonnement</h2>
          <p>
            Formule actuelle : <strong>Kora {currentPlan.name}</strong> ({st.billing === 'year' ? 'facturation annuelle' : 'facturation mensuelle'}).
            {st.cancelAtPeriodEnd
              ? ` Résiliation programmée le ${fmtDate(st.periodEnd)}.`
              : ` Prochain renouvellement le ${fmtDate(st.periodEnd)}.`}
          </p>
        </section>
      )}

      {st.invoices.length > 0 && (
        <section className="panel">
          <h2>Historique des factures</h2>
          <div className="tw">
            <table>
              <thead>
                <tr><th>Référence</th><th>Date</th><th>Offre</th><th>Moyen</th><th>Montant débité</th><th>Statut</th></tr>
              </thead>
              <tbody>
                {st.invoices.map(inv => (
                  <tr key={inv.id}>
                    <td>{inv.reference}</td>
                    <td>{fmtDate(inv.date)}</td>
                    <td>Kora {inv.planName} ({inv.billing === 'year' ? 'an' : 'mois'})</td>
                    <td>{inv.provider}</td>
                    <td>{inv.amountXof.toLocaleString('fr-FR')} FCFA</td>
                    <td><span className={inv.status === 'paid' ? 'pill-ok' : 'pill-spec'}>{inv.status === 'paid' ? 'Payée' : 'En attente'}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <Modal open={!!selected} onClose={() => setCheckoutPlan(null)} title={selected ? `Paiement · Kora ${selected.name}` : ''} maxWidth={560}>
        {selected && (
          pendingTx && pendingTx.planId === selected.id ? (
            <div className="form">
              <div className="checkout-summary">
                <div>
                  <strong>Vérification du paiement</strong>
                  <small className="mu">Référence : {pendingTx.paymentId || pendingTx.sessionId}</small>
                </div>
                <span className={pendingTx.status === 'FAILED' ? 'pill-accent' : 'pill-spec'}>
                  {pendingStatusLabel}
                </span>
              </div>

              {payInfo && <p className="status-box" role="status">{payInfo}</p>}
              {payErr && <p className="err-msg" role="alert">{payErr}</p>}

              {pendingTx.postOtpConfirm && pendingTx.paymentId && (
                <label>Code de confirmation reçu par SMS
                  <div style={{ display: 'flex', gap: 8 }}>
                    <input
                      className="field"
                      inputMode="numeric"
                      placeholder="Ex. 482913"
                      value={postOtp}
                      onChange={e => setPostOtp(e.target.value)}
                    />
                    <button type="button" className="btn p" disabled={busy || !postOtp.trim()} onClick={handleConfirmPostOtp}>
                      Confirmer le code
                    </button>
                  </div>
                </label>
              )}

              <div className="btns">
                <button type="button" className="btn p" disabled={busy} onClick={handleVerifyNow}>
                  <Icon n="check" s={18} />
                  {busy ? 'Vérification…' : 'Vérifier mon paiement'}
                </button>
                {pendingTx.checkoutUrl && (
                  <a className="btn" href={pendingTx.checkoutUrl}>
                    Ouvrir la page de paiement
                  </a>
                )}
                {pendingTx.status === 'FAILED' && pendingTx.paymentId && (
                  <button type="button" className="btn" disabled={busy} onClick={handleRetryFailed}>
                    Relancer le paiement
                  </button>
                )}
                <button type="button" className="btn" disabled={busy} onClick={() => { savePendingTx(null); setPayInfo(''); setPayErr('') }}>
                  Nouveau moyen de paiement
                </button>
              </div>
            </div>
          ) : (
            <form className="form" onSubmit={confirmPayment}>
              <div className="checkout-summary">
                <div>
                  <strong>Kora {selected.name}</strong>
                  <small className="mu">{billing === 'year' ? 'Facturation annuelle (2 mois offerts)' : 'Facturation mensuelle · sans engagement'}</small>
                </div>
                <strong className="checkout-price">
                  {(billing === 'year' ? selected.priceYear : selected.priceMonth).toLocaleString('fr-FR')} FCFA
                </strong>
              </div>

              <div className="chips" role="radiogroup" aria-label="Mode de paiement">
                <button
                  type="button"
                  role="radio"
                  aria-checked={flowMode === 'softpay'}
                  className={'chip' + (flowMode === 'softpay' ? ' on' : '')}
                  onClick={() => { setFlowMode('softpay'); setPayErr('') }}
                >
                  Mobile Money / Carte direct
                </button>
                <button
                  type="button"
                  role="radio"
                  aria-checked={flowMode === 'hosted'}
                  className={'chip' + (flowMode === 'hosted' ? ' on' : '')}
                  onClick={() => { setFlowMode('hosted'); setPayErr('') }}
                >
                  Page de paiement sécurisée
                </button>
              </div>

              <div className="inline">
                <label>Pays
                  <select value={countryIso} onChange={e => onCountryChange(e.target.value)}>
                    {SASPAY_COUNTRIES.map(c => (
                      <option key={c.iso} value={c.iso}>{c.name} ({c.dialCode})</option>
                    ))}
                  </select>
                </label>

                {flowMode === 'softpay' && (
                  <label>Réseau Mobile Money ou Carte
                    <select
                      value={networkCode}
                      onChange={e => {
                        setNetworkCode(e.target.value)
                        setForcePreOtp(false)
                        setPreOtp('')
                        setPayErr('')
                        setIntentKey(createIntentIdempotencyKey(`sub-${selected.id}-${billing}`))
                      }}
                    >
                      {activeCountry.networks.map(n => (
                        <option key={n.code} value={n.code}>{n.label}</option>
                      ))}
                      <option value="card">Carte bancaire Visa / Mastercard</option>
                    </select>
                  </label>
                )}
              </div>

              {flowMode === 'softpay' && !isCard && (
                <label>Numéro Mobile Money ({activeCountry.name})
                  <input
                    className="field"
                    required
                    inputMode="tel"
                    placeholder={`${activeCountry.dialCode} 76 00 00 00`}
                    value={payInput}
                    onChange={e => setPayInput(e.target.value)}
                  />
                </label>
              )}

              {needsPreOtp && (
                <label>
                  Code de validation ({activeNet?.label || networkCode})
                  <small className="mu">{otpHint || activeNet?.otpInstructions}</small>
                  <input
                    className="field"
                    required
                    inputMode="numeric"
                    placeholder="Code de confirmation"
                    value={preOtp}
                    onChange={e => setPreOtp(e.target.value)}
                  />
                </label>
              )}

              {payInfo && <p className="status-box" role="status">{payInfo}</p>}
              {payErr && <p className="err-msg" role="alert">{payErr}</p>}

              <p className="mu small-note">
                {billingSimulation
                  ? 'Mode découverte actif : aucun débit ne sera effectué.'
                  : 'Paiement sécurisé. Votre abonnement est activé automatiquement dès confirmation par votre opérateur ou votre banque.'}
              </p>

              <div className="btns">
                <button type="button" className="btn" onClick={() => setCheckoutPlan(null)}>Annuler</button>
                <button type="submit" className="btn p" disabled={busy}>
                  <Icon n="card" s={18} />
                  {busy
                    ? 'Préparation du paiement…'
                    : `Payer ${(billing === 'year' ? selected.priceYear : selected.priceMonth).toLocaleString('fr-FR')} FCFA`}
                </button>
              </div>
            </form>
          )
        )}
      </Modal>

      <Footer />
    </div>
  )
}

export const NotFound = () => (
  <div className="page nf">
    <p className="serif big">404</p>
    <h1>Cette page n’existe pas</h1>
    <p className="mu">Le lien est peut-être ancien, ou ce titre a quitté le catalogue Kora.</p>
    <a className="btn p" href="#/">Retour à l’accueil</a>
  </div>
)
