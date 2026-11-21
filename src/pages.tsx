import { useEffect, useMemo, useState } from 'react'
import { AVATARS, Episode, Item, PLANS, PlanId, Profile as ProfileType, ThemeMode, useApp } from './store'
import { BrandLogo, Card, Icon, Meta, Modal, PinModal, Poster, ProfileAvatar, Row } from './ui'
import { AccountBox, AccountSummary } from './auth'

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
        <a href="#/categories">Explorer</a>
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
  const { cat, items, byId, profile, isPremium, role, session } = useApp()
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
              Un écrin éditorial dédié aux grandes histoires du continent. Ajoutez vos séries avec page de couverture, synopsis, épisodes et sous-titres synchronisés depuis l’Espace Administrateur ou Kora Studio.
            </p>
            <div className="btns" style={{ justifyContent: 'center' }}>
              {!session ? (
                <a className="btn p" href="#/connexion"><Icon n="user" s={18} />Se connecter / Créer un compte</a>
              ) : (
                <>
                  {role === 'admin' && (
                    <a className="btn p" href="#/admin?t=titles&id=new&type=series"><Icon n="plus" s={18} />Ajouter une série (Admin)</a>
                  )}
                  <a className={'btn' + (role !== 'admin' ? ' p' : '')} href="/studio/"><Icon n="studio" s={18} />Publier sur Kora Studio</a>
                </>
              )}
              <a className="btn" href="/studio/"><Icon n="film" s={18} />Découvrir Kora Studio</a>
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
                <small className="mu">HLS adaptatif 3G/4G/4K et sous-titres synchronisés à la voix.</small>
              </div>
              <div className="pillar-card">
                <Icon n="studio" s={22} />
                <strong>Studio Créateurs</strong>
                <small className="mu">Mettez en ligne vos saisons, épisodes et couvertures comme sur YouTube Studio.</small>
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
  const src = session ? byId(cont[cont.length - 1] || 0) : undefined

  // Moteur de recommandation pondéré (genres, réalisateurs et pays appréciés)
  const seen = new Set([...cont, ...profile.list])
  const gw: Record<string, number> = {}
  const dw: Record<string, number> = {}
  items.filter(i => seen.has(i.id) || profile.rate?.[i.id] === 'like' || profile.rate?.[i.id] === 'love').forEach(i => {
    const mult = profile.rate?.[i.id] === 'love' ? 3 : profile.rate?.[i.id] === 'like' ? 2 : 1
    i.genres.forEach(g => { gw[g] = (gw[g] || 0) + mult })
    if (i.director) dw[i.director] = (dw[i.director] || 0) + mult
  })
  const reco = items
    .filter(i => !seen.has(i.id) && profile.rate?.[i.id] !== 'no')
    .map(i => [i.id, i.genres.reduce((a, g) => a + (gw[g] || 0), 0) + (dw[i.director] || 0) * 2] as const)
    .filter(x => x[1] > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(x => x[0])

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
            {hero.quality === '4K' && <span className="pill-spec">4K</span>}
            {hero.hdr && <span className="pill-spec">HDR</span>}
            {hero.audioDesc && <span className="pill-spec" title="Audiodescription disponible">AD</span>}
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
              {!session ? 'Se connecter pour lire' : heroSaved > 30 ? `Reprendre (${fmtShort(heroSaved)})` : 'Lire'}
            </a>
            {session && <ListBtn id={hero.id} />}
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
        <section className="page">
          <h2>{HOME_FILTERS.find(f => f.id === filter)?.label} ({filteredItems.length})</h2>
          {!filteredItems.length && (
            <div className="empty-box">
              <p className="mu">
                {filter === 'serie'
                  ? 'Aucune série n’est encore publiée. L’administrateur ou les créateurs peuvent ajouter leurs propres séries avec couverture et synopsis.'
                  : 'Aucun titre dans cette sélection pour ce profil.'}
              </p>
              {filter === 'serie' && (
                <div className="btns">
                  <a className="btn p" href="/studio/"><Icon n="studio" s={18} />Publier sur Kora Studio</a>
                  {role === 'admin' && <a className="btn" href="#/admin?t=titles&id=new&type=series"><Icon n="plus" s={18} />Ajouter une série (Admin)</a>}
                </div>
              )}
            </div>
          )}
          <div className="grid flush">{filteredItems.map(i => <Card key={i.id} item={i} progressSec={profile.hist[i.id]} />)}</div>
        </section>
      ) : (
        <>
          <Row title="Continuer à regarder" ids={cont} showProgress />
          <Row title="Top 10 au Mali" ids={cat.rows.top10 || []} ranked />
          <Row title="Tendances au Mali" ids={cat.rows.trending || []} action={{ label: 'Tout Mali', href: '#/categories/pays/Mali' }} />
          <Row title="Nouveautés" ids={cat.rows.new || []} />
          <Row title="Recommandés pour vous" ids={reco} />
          <Row title="Séries originales & populaires" ids={cat.rows.series || []} />
          <Row title="Films maliens" ids={cat.rows.malifilms || []} />
          <Row title="Populaire en Afrique" ids={cat.rows.africa || []} />
          <Row title="Documentaires" ids={cat.rows.docs || []} action={{ label: 'Tous les docs', href: '#/categories/genre/Documentaire' }} />
          <Row title="Courts-métrages & Animation" ids={cat.rows.shorts || []} />
          <Row title="Classiques restaurés du cinéma africain" ids={cat.rows.classics || []} />
          <Row title="Sélection de la semaine" ids={cat.rows.pick || []} />
          {src && (
            <Row
              title={`Parce que vous avez regardé ${src.title}`}
              ids={items.filter(i => i.id !== src.id && i.genres.some(g => src.genres.includes(g))).map(i => i.id)}
            />
          )}

          {!isPremium && !profile.kid && (
            <section className="promo-strip">
              <div>
                <span className="pill-accent">Kora Premium & Famille</span>
                <h2>Le cinéma africain sans publicité, jusqu’en 4K HDR</h2>
                <p className="mu">À partir de 2 500 FCFA / mois. Paiement simple par Orange Money, Moov Money, Wave ou carte bancaire.</p>
              </div>
              <a className="btn p" href="#/abonnement"><Icon n="crown" s={18} />Voir les formules</a>
            </section>
          )}
        </>
      )}

      <Footer />
    </>
  )
}

/* ============================================================================
   RECHERCHE AVANCÉE — Multi-filtres (type, pays, genre, langue, âge, durée, tri)
   ============================================================================ */
export function Search({ q0 }: { q0: string }) {
  const { items, st, addRecentSearch, profile } = useApp()
  const [q, setQ] = useState(q0)
  const [type, setType] = useState('')
  const [country, setCountry] = useState('')
  const [genre, setGenre] = useState('')
  const [lang, setLang] = useState('')
  const [age, setAge] = useState('')
  const [dur, setDur] = useState('')
  const [era, setEra] = useState('')
  const [sort, setSort] = useState('relevance')
  const [showFilters, setShowFilters] = useState(false)

  useEffect(() => { setQ(q0) }, [q0])

  const countries = useMemo(() => [...new Set(items.map(i => i.country))].sort(), [items])
  const genres = useMemo(() => [...new Set(items.flatMap(i => i.genres))].sort(), [items])
  const langs = useMemo(() => [...new Set(items.flatMap(i => i.langs))].sort(), [items])

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

  const resetAll = () => { setType(''); setCountry(''); setGenre(''); setLang(''); setAge(''); setDur(''); setEra(''); setSort('relevance') }

  return (
    <div className="page">
      <div className="page-head">
        <h1>Rechercher</h1>
        <button type="button" className={'btn' + (activeFilters ? ' active-btn' : '')} onClick={() => setShowFilters(s => !s)}>
          <Icon n="sliders" s={18} />
          Filtres {activeFilters > 0 && `(${activeFilters})`}
        </button>
      </div>

      <form className="search-box" onSubmit={e => { e.preventDefault(); addRecentSearch(q) }}>
        <Icon n="search" s={20} />
        <input
          className="field"
          autoFocus
          type="search"
          value={q}
          onChange={e => setQ(e.target.value)}
          onBlur={() => addRecentSearch(q)}
          placeholder="Titre, réalisateur, acteur, pays, langue, genre…"
          aria-label="Rechercher dans le catalogue Kora"
        />
      </form>

      {showFilters && (
        <section className="filter-panel" aria-label="Filtres avancés">
          <div className="inline">
            <label>Type
              <select value={type} onChange={e => setType(e.target.value)}>
                <option value="">Tous</option>
                <option value="film">Films</option>
                <option value="serie">Séries</option>
                <option value="doc">Documentaires</option>
                <option value="court">Courts-métrages</option>
              </select>
            </label>
            <label>Pays
              <select value={country} onChange={e => setCountry(e.target.value)}>
                <option value="">Tous</option>
                {countries.map(c => <option key={c}>{c}</option>)}
              </select>
            </label>
            <label>Genre
              <select value={genre} onChange={e => setGenre(e.target.value)}>
                <option value="">Tous</option>
                {genres.map(g => <option key={g}>{g}</option>)}
              </select>
            </label>
            <label>Langue
              <select value={lang} onChange={e => setLang(e.target.value)}>
                <option value="">Toutes</option>
                {langs.map(l => <option key={l}>{l}</option>)}
              </select>
            </label>
            <label>Âge
              <select value={age} onChange={e => setAge(e.target.value)}>
                <option value="">Tous</option>
                {['Tous', '7+', '12+', '16+'].map(a => <option key={a}>{a}</option>)}
              </select>
            </label>
            <label>Durée
              <select value={dur} onChange={e => setDur(e.target.value)}>
                <option value="">Toutes</option>
                <option value="short">Moins de 30 min</option>
                <option value="mid">30 à 90 min</option>
                <option value="long">Plus de 90 min</option>
              </select>
            </label>
            <label>Époque
              <select value={era} onChange={e => setEra(e.target.value)}>
                <option value="">Toutes</option>
                <option value="2020s">Années 2020</option>
                <option value="classic">Classiques (&lt; 2000)</option>
              </select>
            </label>
            <label>Trier par
              <select value={sort} onChange={e => setSort(e.target.value)}>
                <option value="relevance">Pertinence</option>
                <option value="newest">Plus récents</option>
                <option value="oldest">Plus anciens</option>
                <option value="duration">Durée</option>
                <option value="alpha">Ordre alphabétique</option>
              </select>
            </label>
          </div>
          {activeFilters > 0 && <button type="button" className="lnk" onClick={resetAll}>Réinitialiser les filtres</button>}
        </section>
      )}

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
            <h2>Suggestions populaires</h2>
            <div className="chips">
              {['Bambara', 'Mali', 'Sénégal', 'Documentaire', 'Animation', 'Classique', 'Boubacar Dembélé', 'Diaspora', 'Wolof'].map(s => (
                <button key={s} type="button" className="chip" onClick={() => { setQ(s); addRecentSearch(s) }}>{s}</button>
              ))}
            </div>
          </section>
          <section>
            <h2>À découvrir maintenant</h2>
            <div className="grid flush">{items.slice(0, 10).map(i => <Card key={i.id} item={i} progressSec={profile.hist[i.id]} />)}</div>
          </section>
        </div>
      ) : (
        <section>
          <p className="mu search-count">{res.length} résultat{res.length > 1 ? 's' : ''}{q ? ` pour « ${q} »` : ''}</p>
          {!res.length && (
            <div className="empty-box">
              <p>Aucun titre ne correspond à ces critères.</p>
              <button type="button" className="btn" onClick={() => { setQ(''); resetAll() }}>Effacer la recherche</button>
            </div>
          )}
          <div className="grid flush">{res.map(i => <Card key={i.id} item={i} progressSec={profile.hist[i.id]} />)}</div>
        </section>
      )}
    </div>
  )
}

/* ============================================================================
   CATÉGORIES — Pays, Genres, Langues
   ============================================================================ */
const CATS: [string, string, string[]][] = [
  ['pays', 'Pays & Territoires', ['Mali', 'Sénégal', 'Côte d’Ivoire', 'Burkina Faso', 'Nigeria', 'Ghana', 'Afrique du Sud', 'Diaspora']],
  ['genre', 'Genres', ['Drame', 'Comédie', 'Romance', 'Action', 'Documentaire', 'Animation', 'Histoire', 'Musique', 'Jeunesse']],
  ['langue', 'Langues originales', ['Bambara', 'Français', 'Anglais', 'Wolof', 'Peul', 'Arabe']]
]

export function Categories({ kind, val }: { kind?: string; val?: string }) {
  const { items, profile } = useApp()
  const v = val && decodeURIComponent(val)
  const countFor = (k: string, x: string) => items.filter(i => k === 'pays' ? i.country === x : k === 'genre' ? i.genres.includes(x) : i.langs.includes(x)).length
  const res = items.filter(i => kind === 'pays' ? i.country === v : kind === 'genre' ? i.genres.includes(v!) : kind === 'langue' ? i.langs.includes(v!) : false)

  return (
    <div className="page">
      <h1>Explorer le catalogue</h1>
      <p className="mu">Parcourez les cinémas du continent par pays, genre ou langue originale.</p>

      {kind && v && (
        <section className="cat-result">
          <div className="row-head">
            <h2>{v} ({res.length})</h2>
            <a className="lnk" href="#/categories">Toutes les catégories</a>
          </div>
          {!res.length && <p className="mu">Aucun contenu disponible pour ce profil.</p>}
          <div className="grid flush">{res.map(i => <Card key={i.id} item={i} progressSec={profile.hist[i.id]} />)}</div>
        </section>
      )}

      {CATS.map(([k, t, vs]) => (
        <section key={k} className="cat-group">
          <h2>{t}</h2>
          <div className="cat-cards">
            {vs.map(x => {
              const n = countFor(k, x)
              return (
                <a
                  key={x}
                  className={'cat-card' + (k === kind && x === v ? ' on' : '')}
                  href={`#/categories/${k}/${encodeURIComponent(x)}`}
                >
                  <strong>{x}</strong>
                  <small className="mu">{n} titre{n > 1 ? 's' : ''}</small>
                </a>
              )
            })}
          </div>
        </section>
      ))}
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
          <dd><a className="lnk" href={`#/recherche?q=${encodeURIComponent(it.director)}`}>{it.director}</a></dd>
          <dt>Distribution</dt>
          <dd className="cast-list">
            {it.cast.map((actor, idx) => (
              <span key={actor}>
                <a className="lnk" href={`#/recherche?q=${encodeURIComponent(actor)}`}>{actor}</a>
                {idx < it.cast.length - 1 ? ', ' : ''}
              </span>
            ))}
          </dd>
          <dt>Pays</dt>
          <dd><a className="lnk" href={`#/categories/pays/${encodeURIComponent(it.country)}`}>{it.country}</a></dd>
          <dt>Langues audio</dt>
          <dd>{it.langs.join(', ')}{it.audioDesc ? ' · Audiodescription' : ''}</dd>
          <dt>Sous-titres</dt>
          <dd>{(it.subtitles || ['Français', 'English']).join(', ')}</dd>
          <dt>Genres</dt>
          <dd>
            {it.genres.map((g, idx) => (
              <span key={g}>
                <a className="lnk" href={`#/categories/genre/${encodeURIComponent(g)}`}>{g}</a>
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
   PARAMÈTRES — Thème, Préférences de lecture, Compte, Notifications, Appareils
   ============================================================================ */
export function Settings() {
  const { st, set, setTheme, revokeDevice, markNotificationsRead, unreadCount } = useApp()
  const activePlan = PLANS.find(p => p.id === st.plan) || PLANS[0]
  const consent = (() => { try { return localStorage.getItem('kora-consent') === 'yes' } catch { return false } })()

  return (
    <div className="page settings-page">
      <div className="page-head">
        <div>
          <h1>Paramètres</h1>
          <p className="mu">Apparence, préférences de lecture, notifications, appareils et sécurité du compte.</p>
        </div>
        <a className="btn" href="#/profil"><Icon n="back" s={18} />Retour au profil</a>
      </div>

      {/* Apparence & Thème Kora */}
      <section className="panel">
        <h2>Apparence & thème Kora</h2>
        <p className="mu">Choisissez l’ambiance conforme à la charte Kora (mode sombre recommandé pour le cinéma).</p>
        <div className="theme-grid" role="radiogroup" aria-label="Thème de l’interface">
          {([
            ['dark', 'Sombre Kora', 'Obsidienne chaude #16140F & or #F2C334'],
            ['black', 'Cinéma OLED', 'Noir absolu #000000 pour les écrans sombres'],
            ['light', 'Clair éditorial', 'Crème papier #FBF9F4 & or profond #906D03']
          ] as [ThemeMode, string, string][]).map(([id, label, desc]) => (
            <button
              key={id}
              type="button"
              role="radio"
              aria-checked={st.theme === id}
              className={'theme-card' + (st.theme === id ? ' on' : '')}
              onClick={() => setTheme(id)}
            >
              <span className={'swatch swatch-' + id} aria-hidden="true" />
              <div>
                <strong>{label}</strong>
                <small className="mu">{desc}</small>
              </div>
            </button>
          ))}
        </div>
      </section>

      {/* Préférences de lecture & accessibilité */}
      <section className="panel">
        <h2>Lecture & accessibilité</h2>
        <div className="inline">
          <label>Sous-titres par défaut
            <select value={st.subLang} onChange={e => set({ subLang: e.target.value })}>
              {['Désactivés', 'Français', 'English', 'Bambara'].map(x => <option key={x}>{x}</option>)}
            </select>
          </label>
          <label>Langue audio préférée
            <select value={st.audioLang} onChange={e => set({ audioLang: e.target.value })}>
              {['Original', 'Bambara', 'Français', 'Wolof', 'Peul', 'Anglais'].map(x => <option key={x}>{x}</option>)}
            </select>
          </label>
          <label>Taille des sous-titres
            <select value={st.subSize} onChange={e => set({ subSize: e.target.value as any })}>
              <option value="petit">Petit</option>
              <option value="normal">Normal</option>
              <option value="grand">Grand (haute lisibilité)</option>
            </select>
          </label>
          <label>Qualité vidéo par défaut
            <select value={st.defaultQuality} onChange={e => set({ defaultQuality: e.target.value })}>
              {['Auto', '4K', '1080p', '720p', '480p'].map(x => <option key={x}>{x}</option>)}
            </select>
          </label>
          <label className="chk">
            <input type="checkbox" checked={st.autoNext !== false} onChange={e => set({ autoNext: e.target.checked })} />
            Enchaîner l’épisode suivant automatiquement
          </label>
        </div>
      </section>

      {/* Compte & sécurité */}
      <AccountBox />

      {/* Notifications */}
      <section className="panel">
        <div className="panel-head">
          <h2>Notifications {unreadCount > 0 && <span className="pill-accent">{unreadCount} nouvelle{unreadCount > 1 ? 's' : ''}</span>}</h2>
          {unreadCount > 0 && <button type="button" className="lnk" onClick={() => markNotificationsRead()}>Tout marquer comme lu</button>}
        </div>
        {!st.notifications.length ? <p className="mu">Aucune notification.</p> : (
          <ul className="notif-list">
            {st.notifications.map(n => (
              <li key={n.id} className={n.read ? 'read' : 'unread'}>
                <div>
                  <strong>{n.title}</strong>
                  <p className="mu">{n.body}</p>
                  <small className="mu">{fmtDate(n.date)}</small>
                </div>
                <div className="notif-acts">
                  {n.link && (n.link.startsWith('#/') || n.link.startsWith('/')) && <a className="btn" href={n.link} onClick={() => markNotificationsRead(n.id)}>Voir</a>}
                  {!n.read && <button type="button" className="lnk" onClick={() => markNotificationsRead(n.id)}>Lu</button>}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Appareils connectés */}
      <section className="panel">
        <h2>Appareils connectés ({st.devices.length}/{activePlan.screens} écran{activePlan.screens > 1 ? 's' : ''} simultané{activePlan.screens > 1 ? 's' : ''})</h2>
        <ul className="device-list">
          {st.devices.map(d => (
            <li key={d.id}>
              <div className="device-info">
                <Icon n="device" s={20} />
                <div>
                  <strong>{d.name} {d.current && <span className="pill-spec">Cet appareil</span>}</strong>
                  <small className="mu">{d.platform} · Dernière activité : {fmtDate(d.lastSeen)}</small>
                </div>
              </div>
              {!d.current && <button type="button" className="btn" onClick={() => revokeDevice(d.id)}>Déconnecter</button>}
            </li>
          ))}
        </ul>
      </section>

      {/* Confidentialité & mentions */}
      <section className="panel">
        <h2>Confidentialité & données</h2>
        <p className="mu">
          Publicité personnalisée (formule gratuite) : <strong>{consent ? 'acceptée' : 'refusée'}</strong>.{' '}
          <button type="button" className="lnk" onClick={() => { localStorage.removeItem('kora-consent'); location.reload() }}>Modifier mon choix</button>
        </p>
        <div className="btns">
          <a className="btn" href="#/confidentialite">Politique de confidentialité</a>
          <a className="btn" href="#/cgu">Conditions d’utilisation</a>
        </div>
      </section>

      <Footer />
    </div>
  )
}

/* ============================================================================
   ABONNEMENT — Mode simulation (activation directe) + Mode live (paiement obligatoire)
   ============================================================================ */
const PROVIDERS = [
  { id: 'Orange Money', hint: 'Saisissez votre numéro Orange Money Mali / Sénégal / CI (+223…)', placeholder: '+223 76 00 00 00', kind: 'phone' },
  { id: 'Moov Money', hint: 'Validez depuis votre mobile Moov Money', placeholder: '+223 66 00 00 00', kind: 'phone' },
  { id: 'Wave', hint: 'Confirmation instantanée dans votre application Wave', placeholder: '+221 77 000 00 00', kind: 'phone' },
  { id: 'Carte bancaire', hint: 'Visa ou Mastercard (paiement sécurisé 3D-Secure)', placeholder: '4532 •••• •••• 1234', kind: 'card' }
] as const

export function Subscription() {
  const { st, subscribePlan, cancelSubscription, billingSimulation } = useApp()
  const [billing, setBilling] = useState<'month' | 'year'>(st.billing || 'month')
  const [checkoutPlan, setCheckoutPlan] = useState<PlanId | null>(null)
  const [provider, setProvider] = useState<string>(PROVIDERS[0].id)
  const [payInput, setPayInput] = useState('')
  const [payErr, setPayErr] = useState('')
  const [busy, setBusy] = useState(false)

  const selected = PLANS.find(p => p.id === checkoutPlan)
  const activeProv = PROVIDERS.find(p => p.id === provider) || PROVIDERS[0]
  const currentPlan = PLANS.find(p => p.id === st.plan) || PLANS[0]

  const activateFreeSimulation = async (planId: PlanId) => {
    setBusy(true)
    await subscribePlan(planId, billing, 'Activation gratuite')
    setBusy(false)
  }

  const confirmPayment = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!checkoutPlan) return
    setBusy(true); setPayErr('')
    const res = await subscribePlan(checkoutPlan, billing, provider, payInput)
    setBusy(false)
    if (res.ok) {
      setCheckoutPlan(null)
      setPayInput('')
    } else {
      setPayErr(res.error || 'Paiement refusé.')
    }
  }

  return (
    <div className="page sub-page">
      <div className="sub-hero">
        <span className="pill-accent">{billingSimulation ? 'Mode simulation · Activation gratuite' : 'Offres Kora'}</span>
        <h1>Choisissez votre formule</h1>
        <p className="mu">
          {billingSimulation
            ? 'En phase de test, vous pouvez activer Premium ou Famille gratuitement en 1 clic. En production (BILLING_MODE=live), le paiement réel devient obligatoire.'
            : 'Sans engagement. Paiement sécurisé par Orange Money, Moov Money, Wave ou carte bancaire.'}
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
            <strong>Mode simulation actif</strong> — Activez n’importe quelle formule sans payer pour tester Kora sans publicité et en 4K. Pour obliger le paiement lors du lancement final, définissez <code>BILLING_MODE=live</code> côté serveur sur Vercel.
          </div>
        </div>
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
                    Activer {plan.name} gratuitement (simulation)
                  </button>
                  <button type="button" className="lnk small-lnk" onClick={() => { setPayErr(''); setCheckoutPlan(plan.id) }}>
                    Aperçu du parcours de paiement
                  </button>
                </div>
              ) : (
                <button type="button" className="btn p wide-btn" onClick={() => { setPayErr(''); setCheckoutPlan(plan.id) }}>
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
                <tr><th>Référence</th><th>Date</th><th>Offre</th><th>Moyen</th><th>Montant</th><th>Statut</th></tr>
              </thead>
              <tbody>
                {st.invoices.map(inv => (
                  <tr key={inv.id}>
                    <td>{inv.reference}</td>
                    <td>{fmtDate(inv.date)}</td>
                    <td>Kora {inv.planName} ({inv.billing === 'year' ? 'an' : 'mois'})</td>
                    <td>{inv.provider}</td>
                    <td>{inv.amountXof.toLocaleString('fr-FR')} FCFA</td>
                    <td><span className="pill-ok">Payée</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <Modal open={!!selected} onClose={() => setCheckoutPlan(null)} title={selected ? `Paiement Kora ${selected.name}` : ''} maxWidth={520}>
        {selected && (
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

            <div className="chips" role="radiogroup" aria-label="Moyen de paiement">
              {PROVIDERS.map(p => (
                <button
                  key={p.id}
                  type="button"
                  role="radio"
                  aria-checked={provider === p.id}
                  className={'chip' + (provider === p.id ? ' on' : '')}
                  onClick={() => { setProvider(p.id); setPayInput(''); setPayErr('') }}
                >
                  {p.id}
                </button>
              ))}
            </div>

            <p className="mu small-note">{activeProv.hint}</p>

            <label>{activeProv.kind === 'phone' ? 'Numéro de téléphone' : 'Numéro de carte'}
              <input
                className="field"
                required
                inputMode={activeProv.kind === 'phone' ? 'tel' : 'numeric'}
                placeholder={activeProv.placeholder}
                value={payInput}
                onChange={e => setPayInput(e.target.value)}
              />
            </label>

            {payErr && <p className="err-msg" role="alert">{payErr}</p>}

            <p className="mu small-note">
              {billingSimulation
                ? 'Mode simulation : aucun débit réel n’est effectué.'
                : 'Mode production : paiement vérifié côté serveur obligatoire avant activation.'}
            </p>

            <div className="btns">
              <button type="button" className="btn" onClick={() => setCheckoutPlan(null)}>Annuler</button>
              <button type="submit" className="btn p" disabled={busy}>
                <Icon n="card" s={18} />
                {busy ? 'Validation en cours…' : `Confirmer (${(billing === 'year' ? selected.priceYear : selected.priceMonth).toLocaleString('fr-FR')} FCFA)`}
              </button>
            </div>
          </form>
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
