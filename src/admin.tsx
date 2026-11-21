import { useEffect, useState } from 'react'
import { apiGet, apiPost, uploadFileToSignedUrl } from './api'
import { useApp } from './store'
import { Icon } from './ui'

const num = (n: unknown) => Number(n || 0).toLocaleString('fr-FR')
const STATUS: Record<string, string> = { draft: 'Brouillon', published: 'Publié', unpublished: 'Dépublié' }
const TYPES: [string, string][] = [['series', 'Série'], ['film', 'Film'], ['doc', 'Documentaire'], ['short', 'Court-métrage']]
const AGES = ['Tous', '7+', '12+', '16+', '18+']
const ACCESS_KINDS: [string, string][] = [['free', 'Gratuit'], ['premium', 'Premium'], ['rent', 'Location'], ['buy', 'Achat']]
const COUNTRIES = ['Mali', 'Sénégal', 'Côte d’Ivoire', 'Burkina Faso', 'Guinée', 'Niger', 'Nigeria', 'Ghana', 'Afrique du Sud', 'France', 'Belgique', 'Canada', 'États-Unis']

const Table = ({ head, rows, empty }: { head: string[]; rows: any[][]; empty: string }) => rows.length
  ? (
    <div className="tw">
      <table>
        <thead><tr>{head.map(h => <th key={h}>{h}</th>)}</tr></thead>
        <tbody>{rows.map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j}>{c}</td>)}</tr>)}</tbody>
      </table>
    </div>
  )
  : <p className="mu">{empty}</p>

export function Admin({ q }: { q: URLSearchParams }) {
  const { session, role } = useApp()
  if (!session) {
    return (
      <div className="page">
        <h1>Espace administrateur</h1>
        <p className="mu">Connectez-vous avec un compte administrateur ou modérateur.</p>
        <a className="btn p" href="#/connexion">Se connecter</a>
      </div>
    )
  }
  if (role !== 'admin' && role !== 'moderator') {
    return (
      <div className="page">
        <h1>Accès réservé</h1>
        <p className="mu">Ce compte ne dispose pas des droits d’administration ou de modération.</p>
        <a className="btn" href="#/">Retour à l’accueil</a>
      </div>
    )
  }

  const tabs: [string, string][] = role === 'admin'
    ? [['stats', 'Tableau de bord'], ['titles', 'Contenus & Séries'], ['rights', 'Droits par pays'], ['users', 'Comptes & Rôles'], ['reports', 'Signalements']]
    : [['reports', 'Signalements']]
  const defaultTab = role === 'admin' ? 'stats' : 'reports'
  const tab = tabs.some(([k]) => k === q.get('t')) ? (q.get('t') as string) : defaultTab
  const id = q.get('id')
  const presetType = q.get('type') || undefined

  return (
    <div className="page admin">
      <div className="page-head">
        <div>
          <h1>{role === 'admin' ? 'Espace administrateur' : 'Espace modération'}</h1>
          <p className="mu">Ajoutez vos séries avec couverture et synopsis, gérez les droits, les créateurs et les signalements.</p>
        </div>
        {role === 'admin' && (
          <div className="btns flush">
            <a className="btn p" href="#/admin?t=titles&id=new&type=series"><Icon n="plus" s={18} />Nouvelle série</a>
            <a className="btn" href="#/admin?t=titles&id=new&type=film"><Icon n="film" s={18} />Nouveau film</a>
          </div>
        )}
      </div>

      <div className="chips" role="tablist">
        {tabs.map(([k, t]) => (
          <a key={k} role="tab" aria-selected={tab === k} className={'chip' + (tab === k ? ' on' : '')} href={`#/admin?t=${k}`}>{t}</a>
        ))}
      </div>

      {tab === 'stats' && <Stats />}
      {tab === 'titles' && (id ? <Editor key={id + (presetType || '')} id={id} presetType={presetType} /> : <List />)}
      {tab === 'rights' && <RightsManager />}
      {tab === 'users' && <UsersManager />}
      {tab === 'reports' && <Reports />}
    </div>
  )
}

function Stats() {
  const [s, setS] = useState<any>(null)
  const [logs, setLogs] = useState<any[]>([])
  const [err, setErr] = useState('')

  useEffect(() => {
    apiGet<{ stats: any; logs: any[] }>('/api/admin?action=stats').then(r => {
      if (!r.ok) setErr(r.data.error || 'Erreur de chargement.')
      else { setS(r.data.stats); setLogs(r.data.logs || []) }
    })
  }, [])

  if (err) return <p className="mu">{err}</p>
  if (!s) return <p className="mu">Chargement des statistiques…</p>

  const rows: [string, unknown][] = [
    ['Comptes', s.accounts],
    ['Abonnés Premium', s.plans?.premium || 0],
    ['Formule gratuite', s.plans?.free || 0],
    ['Contenus publiés', s.titles?.published || 0],
    ['Brouillons', s.titles?.draft || 0],
    ['Lectures enregistrées', s.views],
    ['Heures regardées', s.watch_hours],
    ['Taux de complétion', (s.completion ?? 0) + ' %'],
    ['Revenus (FCFA)', s.revenue_xof],
    ['Signalements ouverts', s.open_reports]
  ]

  return (
    <>
      <dl className="stats">
        {rows.map(([k, v]) => (
          <div key={k}><dt>{k}</dt><dd>{typeof v === 'number' ? num(v) : String(v)}</dd></div>
        ))}
      </dl>

      <section className="panel">
        <h2>Contenus les plus regardés</h2>
        <Table
          head={['Titre', 'Lectures', 'Heures']}
          rows={(s.top_titles || []).map((t: any) => [t.title, num(t.views), t.hours])}
          empty="Aucune lecture enregistrée pour l’instant."
        />
      </section>

      <section className="panel">
        <h2>Derniers comptes inscrits</h2>
        <Table
          head={['Nom', 'Contact', 'Pays', 'Rôle', 'Formule']}
          rows={(s.recent_accounts || []).map((a: any) => [a.name || '—', a.email || a.phone || '—', a.country, a.role, a.plan || 'free'])}
          empty="Aucun compte."
        />
      </section>

      {logs.length > 0 && (
        <section className="panel">
          <h2>Journal d’audit récent</h2>
          <Table
            head={['Date', 'Action', 'Entité', 'ID']}
            rows={logs.map(l => [new Date(l.created_at).toLocaleString('fr-FR'), l.action, l.entity, l.entity_id])}
            empty="Aucune action récente."
          />
        </section>
      )}
    </>
  )
}

function Reports() {
  const { toast } = useApp()
  const [rows, setRows] = useState<any[]>([])
  const [filter, setFilter] = useState<'all' | 'open' | 'closed'>('open')

  const load = () => apiGet<{ rows: any[] }>('/api/admin?action=reports').then(r => { if (r.ok) setRows(r.data.rows || []) })
  useEffect(() => { load() }, [])

  const close = async (id: number) => {
    const r = await apiPost('/api/admin?action=close-report', { id })
    if (!r.ok) { toast(r.data.error || 'Erreur.', 'err'); return }
    toast('Signalement clos.', 'ok')
    load()
  }

  const visible = rows.filter(r => filter === 'all' ? true : filter === 'open' ? r.status !== 'closed' : r.status === 'closed')

  return (
    <section className="panel">
      <div className="panel-head">
        <h2>Signalements ({visible.length})</h2>
        <div className="chips">
          {([['open', 'Ouverts'], ['closed', 'Clos'], ['all', 'Tous']] as const).map(([k, t]) => (
            <button key={k} type="button" className={'chip' + (filter === k ? ' on' : '')} onClick={() => setFilter(k)}>{t}</button>
          ))}
        </div>
      </div>
      <Table
        head={['Date', 'Contenu', 'Motif', 'Statut', '']}
        rows={visible.map(r => [
          new Date(r.created_at).toLocaleDateString('fr-FR'),
          r.titles?.title || '—',
          r.reason,
          r.status === 'closed' ? 'Clos' : 'Ouvert',
          r.status !== 'closed' ? <button type="button" className="lnk" onClick={() => close(r.id)}>Clore</button> : ''
        ])}
        empty="Aucun signalement dans cette catégorie."
      />
    </section>
  )
}

function RightsManager() {
  const { toast } = useApp()
  const [titles, setTitles] = useState<any[]>([])
  const [rights, setRights] = useState<any[]>([])
  const [titleId, setTitleId] = useState('')
  const [country, setCountry] = useState('Mali')
  const [access, setAccess] = useState('free')
  const [from, setFrom] = useState('')
  const [until, setUntil] = useState('')

  const load = async () => {
    const r = await apiGet<{ titles: any[]; rights: any[] }>('/api/admin?action=rights')
    if (r.ok) {
      setTitles(r.data.titles || [])
      setRights(r.data.rights || [])
      if (!titleId && r.data.titles?.[0]) setTitleId(String(r.data.titles[0].id))
    }
  }
  useEffect(() => { load() }, [])

  const add = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!titleId) return
    const r = await apiPost('/api/admin?action=add-right', {
      title_id: +titleId,
      country,
      access,
      available_from: from || null,
      available_until: until || null
    })
    if (!r.ok) { toast(r.data.error || 'Erreur.', 'err'); return }
    toast('Droit territorial ajouté.', 'ok')
    load()
  }

  const remove = async (id: number) => {
    const r = await apiPost('/api/admin?action=delete-right', { id })
    if (!r.ok) { toast(r.data.error || 'Erreur.', 'err'); return }
    toast('Règle supprimée.', 'info')
    load()
  }

  return (
    <section className="panel">
      <h2>Droits de diffusion par pays</h2>
      <p className="mu">Définissez les territoires autorisés et le niveau d’accès requis (contrôlé côté serveur lors de la lecture).</p>
      <form className="inline" onSubmit={add}>
        <label>Titre
          <select value={titleId} onChange={e => setTitleId(e.target.value)}>
            {titles.map(t => <option key={t.id} value={t.id}>{t.title}</option>)}
          </select>
        </label>
        <label>Pays
          <select value={country} onChange={e => setCountry(e.target.value)}>
            {COUNTRIES.map(c => <option key={c}>{c}</option>)}
          </select>
        </label>
        <label>Accès
          <select value={access} onChange={e => setAccess(e.target.value)}>
            {ACCESS_KINDS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
        </label>
        <label>Du
          <input className="field narrow" type="date" value={from} onChange={e => setFrom(e.target.value)} />
        </label>
        <label>Au
          <input className="field narrow" type="date" value={until} onChange={e => setUntil(e.target.value)} />
        </label>
        <button type="submit" className="btn p">Ajouter</button>
      </form>

      <Table
        head={['Titre', 'Pays', 'Accès', 'Début', 'Fin', '']}
        rows={rights.map(r => [
          r.titles?.title || `#${r.title_id}`,
          r.country,
          ACCESS_KINDS.find(([k]) => k === r.access)?.[1] || r.access,
          r.available_from || '—',
          r.available_until || '—',
          <button type="button" className="lnk" onClick={() => remove(r.id)}>Supprimer</button>
        ])}
        empty="Aucune restriction territoriale spécifique (tous les titres publiés sont accessibles partout par défaut)."
      />
    </section>
  )
}

function UsersManager() {
  const { toast } = useApp()
  const [rows, setRows] = useState<any[]>([])
  const [search, setSearch] = useState('')
  const [err, setErr] = useState('')

  const load = async () => {
    const r = await apiGet<{ rows: any[] }>('/api/admin?action=users')
    if (!r.ok) setErr(r.data.error || 'Erreur de chargement.')
    else { setRows(r.data.rows || []); setErr('') }
  }
  useEffect(() => { load() }, [])

  const changeRole = async (id: string, newRole: string) => {
    const r = await apiPost('/api/admin?action=set-role', { target_id: id, new_role: newRole })
    if (!r.ok) { toast(r.data.error || 'Erreur.', 'err'); return }
    toast('Rôle mis à jour.', 'ok')
    load()
  }

  const filtered = rows.filter(u => !search.trim() || `${u.name || ''} ${u.email || ''} ${u.phone || ''} ${u.country || ''}`.toLowerCase().includes(search.toLowerCase()))

  return (
    <section className="panel">
      <div className="panel-head">
        <h2>Comptes & Rôles ({filtered.length})</h2>
        <input className="field narrow" type="search" value={search} onChange={e => setSearch(e.target.value)} placeholder="Filtrer…" aria-label="Filtrer les comptes" />
      </div>
      {err && <p className="mu">{err}</p>}
      <Table
        head={['Nom', 'Contact', 'Pays', 'Offre', 'Rôle', 'Inscription']}
        rows={filtered.map(u => [
          u.name || '—',
          u.email || u.phone || '—',
          u.country || '—',
          u.plan_id || 'free',
          <select value={u.role} onChange={e => changeRole(u.id, e.target.value)} aria-label={`Rôle de ${u.name || u.email}`}>
            <option value="user">Utilisateur</option>
            <option value="moderator">Modérateur</option>
            <option value="admin">Administrateur</option>
          </select>,
          u.created_at ? new Date(u.created_at).toLocaleDateString('fr-FR') : '—'
        ])}
        empty="Aucun compte trouvé."
      />
    </section>
  )
}

function List() {
  const { reloadCatalog, toast } = useApp()
  const [rows, setRows] = useState<any[]>([])
  const [q, setQ] = useState('')
  const [typeFilter, setTypeFilter] = useState('all')

  const load = () => apiGet<{ rows: any[] }>('/api/admin?action=titles').then(r => { if (r.ok) setRows(r.data.rows || []) })
  useEffect(() => { load() }, [])

  const toggle = async (t: any) => {
    const next = t.status === 'published' ? 'unpublished' : 'published'
    const r = await apiPost('/api/admin?action=toggle-title', { id: t.id, status: next })
    if (!r.ok) { toast(r.data.error || 'Erreur.', 'err'); return }
    toast(next === 'published' ? 'Contenu publié.' : 'Contenu dépublié.', 'ok')
    load()
    reloadCatalog()
  }

  const remove = async (t: any) => {
    if (!confirm(`Supprimer définitivement « ${t.title} » ?`)) return
    const r = await apiPost('/api/admin?action=delete-title', { id: t.id })
    if (!r.ok) { toast(r.data.error || 'Erreur.', 'err'); return }
    toast('Contenu supprimé.', 'info')
    load()
    reloadCatalog()
  }

  const visible = rows.filter(t => {
    if (typeFilter !== 'all' && t.type !== typeFilter) return false
    if (q.trim() && !`${t.title} ${t.country} ${t.year}`.toLowerCase().includes(q.toLowerCase())) return false
    return true
  })

  return (
    <section className="panel">
      <div className="panel-head">
        <h2>Catalogue ({visible.length})</h2>
        <div className="inline" style={{ margin: 0 }}>
          <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)} aria-label="Filtrer par type">
            <option value="all">Tous les types</option>
            <option value="series">Séries</option>
            <option value="film">Films</option>
            <option value="doc">Documentaires</option>
            <option value="short">Courts-métrages</option>
          </select>
          <input className="field narrow" type="search" value={q} onChange={e => setQ(e.target.value)} placeholder="Filtrer un titre…" aria-label="Filtrer les contenus" />
        </div>
      </div>
      <Table
        head={['Couv.', 'Titre', 'Type', 'Année', 'Origine', 'Statut', 'Actions']}
        rows={visible.map(t => [
          t.poster_url ? <img className="mini-thumb" src={t.poster_url} alt="" /> : <span className="mini-thumb empty" />,
          t.title,
          TYPES.find(x => x[0] === t.type)?.[1],
          t.year,
          t.creator_id ? <span className="pill-spec">Kora Studio</span> : t.country,
          STATUS[t.status],
          <span className="acts">
            <a className="lnk" href={`#/admin?t=titles&id=${t.id}`}>Modifier</a>
            <button type="button" className="lnk" onClick={() => toggle(t)}>{t.status === 'published' ? 'Dépublier' : 'Publier'}</button>
            <button type="button" className="lnk" onClick={() => remove(t)}>Supprimer</button>
          </span>
        ])}
        empty="Aucun contenu dans cette catégorie. Cliquez sur « Nouvelle série » pour en ajouter une."
      />
    </section>
  )
}

type F = {
  title: string; type: string; year: string; duration_min: string; country: string; original_language: string; age_rating: string
  synopsis_short: string; synopsis_long: string
  status: string; is_trending: boolean; is_new: boolean; is_exclusive: boolean; available_from: string; available_until: string
  poster_url: string; backdrop_url: string
}
const blank = (presetType?: string): F => ({
  title: '', type: presetType || 'series', year: String(new Date().getFullYear()), duration_min: presetType === 'film' ? '95' : '45',
  country: 'Mali', original_language: 'fr', age_rating: 'Tous', synopsis_short: '', synopsis_long: '', status: 'published',
  is_trending: false, is_new: true, is_exclusive: false, available_from: '', available_until: '', poster_url: '', backdrop_url: ''
})

function Editor({ id, presetType }: { id: string; presetType?: string }) {
  const { reloadCatalog, toast } = useApp()
  const isNew = id === 'new'
  const [f, setF] = useState<F>(() => blank(presetType))
  const [genres, setGenres] = useState<any[]>([])
  const [sel, setSel] = useState<number[]>([])
  const [langs, setLangs] = useState<any[]>([])
  const [dir, setDir] = useState('')
  const [cast, setCast] = useState('')
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)
  const [vid, setVid] = useState<any>(null)
  const [eps, setEps] = useState<any[]>([])
  const [newEpSeason, setNewEpSeason] = useState('1')
  const [newEpTitle, setNewEpTitle] = useState('')
  const [newEpSynopsis, setNewEpSynopsis] = useState('')
  const [newEpDur, setNewEpDur] = useState('45')
  const [newEpIntro, setNewEpIntro] = useState('75')
  const [pendingPoster, setPendingPoster] = useState<File | null>(null)
  const [pendingPosterPreview, setPendingPosterPreview] = useState('')
  const [pendingBackdrop, setPendingBackdrop] = useState<File | null>(null)
  const [pendingBackdropPreview, setPendingBackdropPreview] = useState('')

  const up = (k: keyof F, v: unknown) => setF(x => ({ ...x, [k]: v }))

  const load = async () => {
    const r = await apiGet<{ genres: any[]; langs: any[]; title: any }>(`/api/admin?action=title-detail&id=${encodeURIComponent(id)}`)
    if (!r.ok) { setMsg(r.data.error || 'Impossible de charger la fiche.'); return }
    setGenres(r.data.genres || [])
    setLangs(r.data.langs || [])
    if (isNew) return
    const t = r.data.title
    if (!t) return setMsg('Contenu introuvable.')
    setF({
      title: t.title, type: t.type, year: String(t.year ?? ''), duration_min: String(t.duration_min ?? ''), country: t.country, original_language: t.original_language || 'fr', age_rating: t.age_rating,
      synopsis_short: t.synopsis_short || '', synopsis_long: t.synopsis_long || '', status: t.status, is_trending: t.is_trending, is_new: t.is_new, is_exclusive: t.is_exclusive,
      available_from: t.available_from || '', available_until: t.available_until || '', poster_url: t.poster_url || '', backdrop_url: t.backdrop_url || ''
    })
    setSel((t.title_genres || []).map((x: any) => x.genre_id))
    setDir((t.title_people || []).filter((x: any) => x.role === 'director').map((x: any) => x.people?.name).filter(Boolean).join(', '))
    setCast((t.title_people || []).filter((x: any) => x.role === 'actor').sort((a: any, b: any) => a.position - b.position).map((x: any) => x.people?.name).filter(Boolean).join(', '))
    setVid(t.video_assets?.[0] || null)
    const sortedSeasons = (t.seasons || []).sort((a: any, b: any) => a.number - b.number)
    setEps(sortedSeasons.flatMap((s: any) => (s.episodes || []).sort((a: any, b: any) => a.number - b.number).map((e: any) => ({ ...e, season: s.number }))))
  }
  useEffect(() => { load() }, [])

  const uploadImageFile = async (file: File, kind: 'poster' | 'backdrop'): Promise<string | null> => {
    const sign = await apiPost<{ signedUrl: string; publicUrl: string }>('/api/admin?action=sign-upload', {
      bucket: 'posters',
      folder: isNew ? 'covers' : id,
      kind,
      fileName: file.name
    })
    if (!sign.ok || !sign.data.signedUrl) { setMsg(sign.data.error || 'Échec préparation upload.'); return null }
    const upRes = await uploadFileToSignedUrl(sign.data.signedUrl, file)
    if (!upRes.ok) { setMsg(upRes.error || 'Échec upload image.'); return null }
    return sign.data.publicUrl
  }

  const save = async () => {
    if (!f.title.trim()) return setMsg('Le titre est obligatoire.')
    if (f.status === 'published' && !pendingPoster && !f.poster_url.trim()) {
      return setMsg('Une page de couverture (affiche 2:3) est obligatoire pour publier un contenu sur Kora.')
    }
    setBusy(true); setMsg('')

    let posterUrl = f.poster_url.trim()
    let backdropUrl = f.backdrop_url.trim()

    if (pendingPoster) {
      const url = await uploadImageFile(pendingPoster, 'poster')
      if (!url) { setBusy(false); return }
      posterUrl = url
      up('poster_url', url)
      setPendingPoster(null); setPendingPosterPreview('')
    }
    if (pendingBackdrop) {
      const url = await uploadImageFile(pendingBackdrop, 'backdrop')
      if (!url) { setBusy(false); return }
      backdropUrl = url
      up('backdrop_url', url)
      setPendingBackdrop(null); setPendingBackdropPreview('')
    }

    const r = await apiPost<{ id: number }>('/api/admin?action=save-title', {
      id: isNew ? 'new' : id,
      form: { ...f, poster_url: posterUrl, backdrop_url: backdropUrl },
      genres: sel,
      director: dir,
      cast
    })
    setBusy(false)
    if (!r.ok) return setMsg(r.data.error || 'Impossible d’enregistrer.')
    toast(f.type === 'series' ? 'Série enregistrée avec sa couverture et son synopsis.' : 'Contenu enregistré.', 'ok')
    reloadCatalog()
    if (isNew && r.data.id) location.hash = `#/admin?t=titles&id=${r.data.id}`
  }

  const del = async () => {
    if (!confirm('Supprimer définitivement ce contenu ?')) return
    const r = await apiPost('/api/admin?action=delete-title', { id })
    if (!r.ok) setMsg(r.data.error || 'Erreur de suppression.')
    else {
      toast('Contenu supprimé.', 'info')
      reloadCatalog()
      location.hash = '#/admin?t=titles'
    }
  }

  const addEpisode = async () => {
    if (isNew || !newEpTitle.trim()) return
    setBusy(true)
    const r = await apiPost<{ season: number; number: number }>('/api/admin?action=add-episode', {
      titleId: +id,
      season: +newEpSeason || 1,
      title: newEpTitle.trim(),
      synopsis: newEpSynopsis.trim(),
      duration_min: +newEpDur || 45,
      intro_end_sec: +newEpIntro || 75
    })
    setBusy(false)
    if (!r.ok) return setMsg(r.data.error || 'Erreur ajout épisode.')
    setNewEpTitle(''); setNewEpSynopsis('')
    toast(`Épisode S${r.data.season}E${r.data.number} ajouté.`, 'ok')
    reloadCatalog()
    load()
  }

  const deleteEpisode = async (epId: number) => {
    if (!confirm('Supprimer cet épisode ?')) return
    await apiPost('/api/admin?action=delete-episode', { id: epId })
    toast('Épisode supprimé.', 'info')
    reloadCatalog()
    load()
  }

  const pickImage = (file: File | undefined, kind: 'poster' | 'backdrop') => {
    if (!file) return
    const preview = URL.createObjectURL(file)
    if (kind === 'poster') { setPendingPoster(file); setPendingPosterPreview(preview) }
    else { setPendingBackdrop(file); setPendingBackdropPreview(preview) }
  }

  const uploadVideo = async (file: File | undefined, target: { title_id?: number; episode_id?: number }) => {
    if (!file) return
    setBusy(true); setMsg(`Envoi de ${file.name} (${Math.round(file.size / 1048576)} Mo), ne fermez pas cette page…`)
    const sign = await apiPost<{ signedUrl: string; path: string }>('/api/admin?action=sign-upload', {
      bucket: 'videos',
      folder: id,
      kind: target.episode_id ? `ep-${target.episode_id}` : 'film',
      fileName: file.name
    })
    if (!sign.ok || !sign.data.signedUrl) { setBusy(false); return setMsg(sign.data.error || 'Échec préparation upload vidéo.') }
    const upRes = await uploadFileToSignedUrl(sign.data.signedUrl, file)
    if (!upRes.ok) { setBusy(false); return setMsg(upRes.error || 'Échec upload vidéo.') }
    const reg = await apiPost('/api/admin?action=register-video', {
      ...target,
      storage_path: sign.data.path,
      size_bytes: file.size,
      mime: file.type
    })
    setBusy(false)
    setMsg(reg.ok ? 'Vidéo envoyée, prête à la lecture.' : (reg.data.error || 'Erreur enregistrement vidéo.'))
    load()
  }

  const chk = (k: 'is_trending' | 'is_new' | 'is_exclusive', t: string) => (
    <label className="chk"><input type="checkbox" checked={f[k]} onChange={e => up(k, e.target.checked)} />{t}</label>
  )

  const posterPreview = pendingPosterPreview || f.poster_url
  const backdropPreview = pendingBackdropPreview || f.backdrop_url

  return (
    <div className="panel form">
      <a className="lnk" href="#/admin?t=titles">← Retour aux contenus</a>
      <h2>{isNew ? (f.type === 'series' ? 'Ajouter une nouvelle série' : 'Nouveau contenu') : f.title}</h2>

      <label>Titre<input className="field" value={f.title} onChange={e => up('title', e.target.value)} placeholder="Ex. Les Chroniques de Bamako" /></label>
      <div className="inline">
        <label>Type<select value={f.type} onChange={e => up('type', e.target.value)}>{TYPES.map(([k, t]) => <option key={k} value={k}>{t}</option>)}</select></label>
        <label>Année<input className="field narrow" inputMode="numeric" value={f.year} onChange={e => up('year', e.target.value)} /></label>
        <label>Durée moy. (min)<input className="field narrow" inputMode="numeric" value={f.duration_min} onChange={e => up('duration_min', e.target.value)} /></label>
        <label>Âge<select value={f.age_rating} onChange={e => up('age_rating', e.target.value)}>{AGES.map(a => <option key={a}>{a}</option>)}</select></label>
        <label>Statut<select value={f.status} onChange={e => up('status', e.target.value)}>{Object.entries(STATUS).map(([k, t]) => <option key={k} value={k}>{t}</option>)}</select></label>
      </div>

      <div className="cover-upload-grid">
        <div className="cover-box">
          <strong>Page de couverture (Affiche 2:3 · obligatoire)</strong>
          {posterPreview ? <img className="thumb" src={posterPreview} alt="Aperçu couverture" /> : <div className="thumb placeholder">Aucune affiche</div>}
          <input type="file" accept="image/jpeg,image/png,image/webp" disabled={busy} onChange={e => pickImage(e.target.files?.[0], 'poster')} />
          <input className="field" value={f.poster_url} onChange={e => up('poster_url', e.target.value)} placeholder="…ou coller une URL d’image" aria-label="URL de la couverture" />
        </div>
        <div className="cover-box">
          <strong>Bannière large (16:9, facultatif)</strong>
          {backdropPreview ? <img className="thumb wide-thumb" src={backdropPreview} alt="Aperçu bannière" /> : <div className="thumb wide-thumb placeholder">Aucune bannière</div>}
          <input type="file" accept="image/jpeg,image/png,image/webp" disabled={busy} onChange={e => pickImage(e.target.files?.[0], 'backdrop')} />
          <input className="field" value={f.backdrop_url} onChange={e => up('backdrop_url', e.target.value)} placeholder="…ou coller une URL de bannière" aria-label="URL de la bannière" />
        </div>
      </div>

      <label>Accroche / Synopsis court (max 180 car.)
        <input className="field" maxLength={180} value={f.synopsis_short} onChange={e => up('synopsis_short', e.target.value)} placeholder="Résumé court affiché en une de l’accueil…" />
      </label>
      <label>Synopsis complet
        <textarea className="field" rows={5} value={f.synopsis_long} onChange={e => up('synopsis_long', e.target.value)} placeholder="Racontez l’histoire complète de la série ou du film…" />
      </label>

      <div className="inline">
        <label>Pays<input className="field" value={f.country} onChange={e => up('country', e.target.value)} /></label>
        <label>Langue originale<select value={f.original_language} onChange={e => up('original_language', e.target.value)}>{langs.map(l => <option key={l.code} value={l.code}>{l.name}</option>)}</select></label>
      </div>
      <label>Réalisation (noms séparés par des virgules)<input className="field" value={dir} onChange={e => setDir(e.target.value)} /></label>
      <label>Distribution (noms séparés par des virgules)<input className="field" value={cast} onChange={e => setCast(e.target.value)} /></label>
      <div className="chips" role="group" aria-label="Genres">
        {genres.map(g => (
          <button type="button" key={g.id} className={'chip' + (sel.includes(g.id) ? ' on' : '')} onClick={() => setSel(s => s.includes(g.id) ? s.filter(x => x !== g.id) : [...s, g.id])}>{g.name}</button>
        ))}
      </div>
      <div className="inline">
        {chk('is_trending', 'Tendance')}{chk('is_new', 'Nouveau')}{chk('is_exclusive', 'Exclusif')}
        <label>Disponible du<input className="field narrow" type="date" value={f.available_from} onChange={e => up('available_from', e.target.value)} /></label>
        <label>jusqu’au<input className="field narrow" type="date" value={f.available_until} onChange={e => up('available_until', e.target.value)} /></label>
      </div>
      <div className="btns">
        <button type="button" className="btn p" disabled={busy} onClick={save}>
          {busy ? 'Enregistrement…' : isNew ? 'Créer et enregistrer' : 'Enregistrer les modifications'}
        </button>
        {!isNew && <button type="button" className="btn danger" disabled={busy} onClick={del}>Supprimer</button>}
      </div>
      {msg && <p role="status">{msg}</p>}

      {isNew ? (
        <p className="mu">Enregistrez d’abord cette fiche pour ajouter les saisons, épisodes et fichiers vidéo.</p>
      ) : (
        <>
          <div className="divider" />
          {f.type === 'series' ? (
            <>
              <h3>Saisons & Épisodes ({eps.length})</h3>
              <div className="inline">
                <label>Saison<input className="field narrow" inputMode="numeric" value={newEpSeason} onChange={e => setNewEpSeason(e.target.value)} /></label>
                <label>Titre de l’épisode<input className="field" value={newEpTitle} onChange={e => setNewEpTitle(e.target.value)} placeholder="Ex. Épisode 1 — Le départ" /></label>
                <label>Durée (min)<input className="field narrow" inputMode="numeric" value={newEpDur} onChange={e => setNewEpDur(e.target.value)} /></label>
                <label>Fin intro (s)<input className="field narrow" inputMode="numeric" value={newEpIntro} onChange={e => setNewEpIntro(e.target.value)} /></label>
              </div>
              <label>Synopsis de l’épisode
                <textarea className="field" rows={2} value={newEpSynopsis} onChange={e => setNewEpSynopsis(e.target.value)} placeholder="Résumé de cet épisode…" />
              </label>
              <div className="btns">
                <button type="button" className="btn p" disabled={busy || !newEpTitle.trim()} onClick={addEpisode}>
                  <Icon n="plus" s={18} />Ajouter l’épisode
                </button>
              </div>
              <ol className="eps">
                {eps.map(e => (
                  <li key={e.id}>
                    <span className="ep-num">S{e.season}.{e.number}</span>
                    <div className="ep-body">
                      <strong>{e.title} ({e.duration_min} min)</strong>
                      {e.synopsis && <p className="mu">{e.synopsis}</p>}
                      <small className="mu">{e.video_assets?.length ? 'Vidéo prête en ligne' : 'Aucune vidéo téléversée'}</small>
                    </div>
                    <input type="file" accept="video/mp4,video/webm,video/quicktime" disabled={busy} onChange={ev => uploadVideo(ev.target.files?.[0], { episode_id: e.id })} aria-label={`Vidéo de l’épisode ${e.number}`} />
                    <button type="button" className="lnk" onClick={() => deleteEpisode(e.id)}>Supprimer</button>
                  </li>
                ))}
              </ol>
            </>
          ) : (
            <>
              <h3>Fichier vidéo du film</h3>
              <label>Vidéo (MP4, WebM ou MOV)
                <input type="file" accept="video/mp4,video/webm,video/quicktime" disabled={busy} onChange={e => uploadVideo(e.target.files?.[0], { title_id: +id })} />
              </label>
              <p className="mu">{vid ? `Vidéo en ligne (${Math.round((vid.size_bytes || 0) / 1048576)} Mo).` : 'Aucune vidéo téléversée pour le moment.'}</p>
            </>
          )}
          <div className="divider" />
          <SubtitleManager titleId={+id} episodes={f.type === 'series' ? eps : []} />
        </>
      )}
    </div>
  )
}

const SUB_LANGS: [string, string][] = [
  ['fr', 'Français'], ['en', 'English'], ['bm', 'Bambara'], ['wo', 'Wolof'], ['ff', 'Peul'], ['ar', 'Arabe'], ['ja', 'Japonais']
]

function SubtitleManager({ titleId, episodes }: { titleId: number; episodes: any[] }) {
  const { toast } = useApp()
  const [epId, setEpId] = useState<string>(episodes[0] ? String(episodes[0].id) : '')
  const [lang, setLang] = useState('fr')
  const [offsetMs, setOffsetMs] = useState('0')
  const [tracks, setTracks] = useState<any[]>([])
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState('')

  const targetEpId = episodes.length && epId ? Number(epId) : undefined

  const load = async () => {
    const qs = targetEpId ? `episodeId=${targetEpId}` : `titleId=${titleId}`
    const r = await apiGet<{ tracks: any[] }>(`/api/subtitles?${qs}`)
    if (r.ok) setTracks(r.data.tracks || [])
  }

  useEffect(() => {
    if (episodes.length && !epId) setEpId(String(episodes[0].id))
  }, [episodes.length])

  useEffect(() => { load() }, [titleId, targetEpId])

  const uploadSubFile = async (file: File | undefined) => {
    if (!file) return
    setBusy(true); setStatus('Conversion et synchronisation de la piste…')
    const content = await file.text()
    const label = SUB_LANGS.find(([c]) => c === lang)?.[1] || lang.toUpperCase()
    const r = await apiPost<{ cues: number }>('/api/subtitles?action=save', {
      titleId,
      episodeId: targetEpId,
      languageCode: lang,
      languageLabel: label,
      content,
      offsetMs: Number(offsetMs) || 0,
      source: 'upload'
    })
    setBusy(false)
    if (!r.ok) { setStatus(r.data.error || 'Fichier sous-titre invalide.'); return }
    setStatus(`Piste ${label} synchronisée (${r.data.cues} répliques).`)
    toast(`Sous-titres ${label} enregistrés.`, 'ok')
    load()
  }

  const generateAiSubs = async () => {
    setBusy(true); setStatus('Analyse de la voix et génération des sous-titres synchronisés (IA)…')
    const label = SUB_LANGS.find(([c]) => c === lang)?.[1] || 'Français'
    const r = await apiPost<{ cues: number }>('/api/subtitles?action=generate', {
      titleId,
      episodeId: targetEpId,
      languageCode: lang,
      languageLabel: label
    })
    setBusy(false)
    if (!r.ok) { setStatus(r.data.error || 'Synchronisation IA indisponible.'); return }
    setStatus(`Sous-titres ${label} synchronisés à la voix par IA (${r.data.cues} répliques) !`)
    toast(`Sous-titres ${label} générés et synchronisés !`, 'ok')
    load()
  }

  const removeTrack = async (id: number) => {
    const r = await apiPost('/api/subtitles?action=delete', { id })
    if (r.ok) { toast('Piste supprimée.', 'info'); load() }
  }

  return (
    <div className="form" style={{ maxWidth: 'none' }}>
      <h3>Sous-titres synchronisés avec la voix (WebVTT / SRT / IA)</h3>
      <p className="mu">Importez un fichier <code>.vtt</code> ou <code>.srt</code>, ou lancez la transcription vocale IA pour caler automatiquement les répliques sur le son de la vidéo.</p>

      <div className="inline">
        {episodes.length > 0 && (
          <label>Épisode cible
            <select value={epId} onChange={e => setEpId(e.target.value)}>
              {episodes.map(e => <option key={e.id} value={e.id}>S{e.season}E{e.number} — {e.title}</option>)}
            </select>
          </label>
        )}
        <label>Langue
          <select value={lang} onChange={e => setLang(e.target.value)}>
            {SUB_LANGS.map(([c, l]) => <option key={c} value={c}>{l}</option>)}
          </select>
        </label>
        <label>Décalage voix (ms)
          <input className="field narrow" inputMode="numeric" value={offsetMs} onChange={e => setOffsetMs(e.target.value)} placeholder="0" />
        </label>
      </div>

      <div className="btns">
        <label className="btn" style={{ cursor: 'pointer' }}>
          <Icon n="upload" s={16} />
          <span>Importer .vtt / .srt</span>
          <input type="file" accept=".vtt,.srt,text/vtt,text/plain" disabled={busy} style={{ display: 'none' }} onChange={e => uploadSubFile(e.target.files?.[0])} />
        </label>
        <button type="button" className="btn p" disabled={busy} onClick={generateAiSubs}>
          <Icon n="sparkles" s={16} />
          {busy ? 'Synchronisation en cours…' : 'Synchroniser automatiquement depuis la voix (IA)'}
        </button>
      </div>

      {status && <p className="status-box" role="status">{status}</p>}

      {tracks.length > 0 ? (
        <Table
          head={['Langue', 'Source', 'Calage voix', 'Actions']}
          rows={tracks.map(tr => [
            tr.language_label,
            tr.source === 'ai_gemini' ? 'IA Gemini (voix)' : tr.source === 'ai_whisper' ? 'IA Whisper (voix)' : 'Fichier .vtt/.srt',
            `${tr.offset_ms >= 0 ? '+' : ''}${(tr.offset_ms / 1000).toFixed(2)} s`,
            <button type="button" className="lnk" onClick={() => removeTrack(tr.id)}>Supprimer</button>
          ])}
          empty="Aucune piste."
        />
      ) : (
        <p className="mu">Aucune piste de sous-titres enregistrée pour cette vidéo.</p>
      )}
    </div>
  )
}
