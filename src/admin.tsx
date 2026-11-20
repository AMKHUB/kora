import { useEffect, useState } from 'react'
import { sb } from './supabase'
import { useApp } from './store'
import { Icon } from './ui'

const num = (n: unknown) => Number(n || 0).toLocaleString('fr-FR')
const safe = (n: string) => n.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9._-]/g, '_')
const STATUS: Record<string, string> = { draft: 'Brouillon', published: 'Publié', unpublished: 'Dépublié' }
const TYPES: [string, string][] = [['film', 'Film'], ['series', 'Série'], ['doc', 'Documentaire'], ['short', 'Court-métrage']]
const AGES = ['Tous', '7+', '12+', '16+', '18+']
const ACCESS_KINDS: [string, string][] = [['free', 'Gratuit'], ['premium', 'Premium'], ['rent', 'Location'], ['buy', 'Achat']]
const COUNTRIES = ['Mali', 'Sénégal', 'Côte d’Ivoire', 'Burkina Faso', 'Guinée', 'Niger', 'Nigeria', 'Ghana', 'Afrique du Sud', 'France', 'Belgique', 'Canada', 'États-Unis']
const db = () => sb!

async function logAudit(actorId: string, action: string, entity: string, entityId: string) {
  try {
    await db().from('audit_log').insert({ actor_id: actorId, action, entity, entity_id: entityId })
  } catch { /* optionnel selon les politiques RLS */ }
}

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
  if (!sb) return <p className="page mu">Base de données Supabase non configurée sur cette instance.</p>
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
    ? [['stats', 'Tableau de bord'], ['titles', 'Contenus'], ['rights', 'Droits par pays'], ['users', 'Comptes & Rôles'], ['reports', 'Signalements']]
    : [['reports', 'Signalements']]
  const defaultTab = role === 'admin' ? 'stats' : 'reports'
  const tab = tabs.some(([k]) => k === q.get('t')) ? (q.get('t') as string) : defaultTab
  const id = q.get('id')

  return (
    <div className="page admin">
      <div className="page-head">
        <div>
          <h1>{role === 'admin' ? 'Espace administrateur' : 'Espace modération'}</h1>
          <p className="mu">Gestion du catalogue, des droits territoriaux, des comptes et des signalements Kora.</p>
        </div>
        {role === 'admin' && <a className="btn p" href="#/admin?t=titles&id=new"><Icon n="plus" s={18} />Nouveau contenu</a>}
      </div>

      <div className="chips" role="tablist">
        {tabs.map(([k, t]) => (
          <a key={k} role="tab" aria-selected={tab === k} className={'chip' + (tab === k ? ' on' : '')} href={`#/admin?t=${k}`}>{t}</a>
        ))}
      </div>

      {tab === 'stats' && <Stats />}
      {tab === 'titles' && (id ? <Editor key={id} id={id} /> : <List />)}
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
    db().rpc('admin_stats').then(({ data, error }) => error ? setErr(error.message) : setS(data))
    db().from('audit_log').select('id,action,entity,entity_id,created_at').order('created_at', { ascending: false }).limit(15)
      .then(({ data }) => setLogs(data || []))
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
  const { session, toast } = useApp()
  const [rows, setRows] = useState<any[]>([])
  const [filter, setFilter] = useState<'all' | 'open' | 'closed'>('open')

  const load = () => db().from('reports').select('id,reason,status,created_at,titles(title)').order('created_at', { ascending: false }).then(({ data }) => setRows(data || []))
  useEffect(() => { load() }, [])

  const close = async (id: number) => {
    await db().from('reports').update({ status: 'closed' }).eq('id', id)
    if (session) await logAudit(session.user.id, 'close_report', 'reports', String(id))
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
  const { session, toast } = useApp()
  const [titles, setTitles] = useState<any[]>([])
  const [rights, setRights] = useState<any[]>([])
  const [titleId, setTitleId] = useState('')
  const [country, setCountry] = useState('Mali')
  const [access, setAccess] = useState('free')
  const [from, setFrom] = useState('')
  const [until, setUntil] = useState('')

  const load = async () => {
    const [t, r] = await Promise.all([
      db().from('titles').select('id,title').order('title'),
      db().from('rights').select('id,title_id,country,access,available_from,available_until,titles(title)').order('id', { ascending: false })
    ])
    setTitles(t.data || [])
    setRights(r.data || [])
    if (!titleId && t.data?.[0]) setTitleId(String(t.data[0].id))
  }
  useEffect(() => { load() }, [])

  const add = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!titleId) return
    const { error } = await db().from('rights').insert({
      title_id: +titleId,
      country,
      access,
      available_from: from || null,
      available_until: until || null
    })
    if (error) { toast(error.message, 'err'); return }
    if (session) await logAudit(session.user.id, `add_right:${country}:${access}`, 'rights', titleId)
    toast('Droit territorial ajouté.', 'ok')
    load()
  }

  const remove = async (id: number) => {
    const { error } = await db().from('rights').delete().eq('id', id)
    if (error) { toast(error.message, 'err'); return }
    toast('Règle supprimée.', 'info')
    load()
  }

  return (
    <section className="panel">
      <h2>Droits de diffusion par pays</h2>
      <p className="mu">Définissez les territoires autorisés et le niveau d’accès requis (contrôlé par la fonction serveur « play »).</p>
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
    const rpc = await db().rpc('admin_list_accounts')
    if (!rpc.error && rpc.data) {
      setRows(rpc.data)
      setErr('')
    } else {
      const fallback = await db().from('accounts').select('id,name,phone,country,role,created_at').order('created_at', { ascending: false }).limit(100)
      if (fallback.error) setErr(fallback.error.message)
      else setRows(fallback.data || [])
    }
  }
  useEffect(() => { load() }, [])

  const changeRole = async (id: string, newRole: string) => {
    const res = await db().rpc('admin_set_role', { target_id: id, new_role: newRole })
    if (res.error) {
      toast('Appliquez la migration supabase/migrations/20261120164500_kora_full_features.sql pour modifier les rôles depuis l’interface.', 'err')
      return
    }
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
  const { session, reloadCatalog, toast } = useApp()
  const [rows, setRows] = useState<any[]>([])
  const [q, setQ] = useState('')
  const load = () => db().from('titles').select('id,title,type,year,country,status').order('id', { ascending: false }).then(({ data }) => setRows(data || []))
  useEffect(() => { load() }, [])

  const toggle = async (t: any) => {
    const next = t.status === 'published' ? 'unpublished' : 'published'
    await db().from('titles').update({ status: next, updated_at: new Date().toISOString() }).eq('id', t.id)
    if (session) await logAudit(session.user.id, `set_status:${next}`, 'titles', String(t.id))
    toast(next === 'published' ? 'Contenu publié.' : 'Contenu dépublié.', 'ok')
    load()
    reloadCatalog()
  }

  const visible = rows.filter(t => !q.trim() || `${t.title} ${t.country} ${t.year}`.toLowerCase().includes(q.toLowerCase()))

  return (
    <section className="panel">
      <div className="panel-head">
        <h2>Catalogue ({visible.length})</h2>
        <input className="field narrow" type="search" value={q} onChange={e => setQ(e.target.value)} placeholder="Filtrer un titre…" aria-label="Filtrer les contenus" />
      </div>
      <Table
        head={['N°', 'Titre', 'Type', 'Année', 'Pays', 'Statut', 'Actions']}
        rows={visible.map(t => [
          t.id,
          t.title,
          TYPES.find(x => x[0] === t.type)?.[1],
          t.year,
          t.country,
          STATUS[t.status],
          <span className="acts">
            <a className="lnk" href={`#/admin?t=titles&id=${t.id}`}>Modifier</a>
            <button type="button" className="lnk" onClick={() => toggle(t)}>{t.status === 'published' ? 'Dépublier' : 'Publier'}</button>
          </span>
        ])}
        empty="Aucun contenu."
      />
    </section>
  )
}

type F = {
  title: string; type: string; year: string; duration_min: string; country: string; original_language: string; age_rating: string; synopsis_long: string
  status: string; is_trending: boolean; is_new: boolean; is_exclusive: boolean; available_from: string; available_until: string; poster_url: string
}
const blank: F = {
  title: '', type: 'film', year: String(new Date().getFullYear()), duration_min: '', country: 'Mali', original_language: 'bm', age_rating: 'Tous', synopsis_long: '', status: 'draft',
  is_trending: false, is_new: false, is_exclusive: false, available_from: '', available_until: '', poster_url: ''
}
const names = (s: string) => [...new Set(s.split(',').map(x => x.trim()).filter(Boolean))]

async function peopleIds(list: string[]): Promise<number[]> {
  if (!list.length) return []
  const { data } = await db().from('people').select('id,name').in('name', list)
  const have = new Map<string, number>((data || []).map((p: any) => [p.name, p.id]))
  const missing = list.filter(n => !have.has(n))
  if (missing.length) {
    const { data: ins } = await db().from('people').insert(missing.map(name => ({ name }))).select('id,name')
    ;(ins || []).forEach((p: any) => have.set(p.name, p.id))
  }
  return list.map(n => have.get(n) as number)
}

function Editor({ id }: { id: string }) {
  const { session, reloadCatalog, toast } = useApp()
  const isNew = id === 'new'
  const [f, setF] = useState<F>(blank)
  const [genres, setGenres] = useState<any[]>([])
  const [sel, setSel] = useState<number[]>([])
  const [langs, setLangs] = useState<any[]>([])
  const [dir, setDir] = useState('')
  const [cast, setCast] = useState('')
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)
  const [vid, setVid] = useState<any>(null)
  const [seasonsList, setSeasonsList] = useState<any[]>([])
  const [eps, setEps] = useState<any[]>([])
  const [newEpSeason, setNewEpSeason] = useState('1')
  const [newEpTitle, setNewEpTitle] = useState('')
  const [newEpDur, setNewEpDur] = useState('45')

  const up = (k: keyof F, v: unknown) => setF(x => ({ ...x, [k]: v }))

  const load = async () => {
    const [g, l] = await Promise.all([db().from('genres').select('id,name').order('name'), db().from('languages').select('code,name').order('name')])
    setGenres(g.data || []); setLangs(l.data || [])
    if (isNew) return
    const { data: t } = await db().from('titles').select('*, title_genres(genre_id), title_people(role,position,people(name)), video_assets(id,size_bytes), seasons(id,number, episodes(id,number,title,duration_min,video_assets(id)))').eq('id', id).maybeSingle()
    if (!t) return setMsg('Contenu introuvable.')
    setF({
      title: t.title, type: t.type, year: String(t.year ?? ''), duration_min: String(t.duration_min ?? ''), country: t.country, original_language: t.original_language || '', age_rating: t.age_rating,
      synopsis_long: t.synopsis_long || '', status: t.status, is_trending: t.is_trending, is_new: t.is_new, is_exclusive: t.is_exclusive, available_from: t.available_from || '', available_until: t.available_until || '', poster_url: t.poster_url || ''
    })
    setSel(t.title_genres.map((x: any) => x.genre_id))
    setDir(t.title_people.filter((x: any) => x.role === 'director').map((x: any) => x.people.name).join(', '))
    setCast(t.title_people.filter((x: any) => x.role === 'actor').sort((a: any, b: any) => a.position - b.position).map((x: any) => x.people.name).join(', '))
    setVid(t.video_assets?.[0] || null)
    const sortedSeasons = (t.seasons || []).sort((a: any, b: any) => a.number - b.number)
    setSeasonsList(sortedSeasons)
    setEps(sortedSeasons.flatMap((s: any) => (s.episodes || []).sort((a: any, b: any) => a.number - b.number).map((e: any) => ({ ...e, season: s.number }))))
  }
  useEffect(() => { load() }, [])

  const save = async () => {
    if (!f.title.trim()) return setMsg('Le titre est obligatoire.')
    setBusy(true); setMsg('')
    const row = {
      title: f.title.trim(), type: f.type, year: f.year ? +f.year : null, duration_min: f.duration_min ? +f.duration_min : null, country: f.country.trim() || 'Mali',
      original_language: f.original_language || null, age_rating: f.age_rating, synopsis_short: f.synopsis_long.slice(0, 180), synopsis_long: f.synopsis_long, status: f.status,
      is_trending: f.is_trending, is_new: f.is_new, is_exclusive: f.is_exclusive, available_from: f.available_from || null, available_until: f.available_until || null,
      poster_url: f.poster_url || null, updated_at: new Date().toISOString()
    }
    const r = isNew ? await db().from('titles').insert(row).select('id').single() : await db().from('titles').update(row).eq('id', id).select('id').single()
    if (r.error) { setBusy(false); return setMsg(r.error.message) }
    const tid = r.data.id as number
    await db().from('title_genres').delete().eq('title_id', tid)
    if (sel.length) await db().from('title_genres').insert(sel.map(genre_id => ({ title_id: tid, genre_id })))
    await db().from('title_people').delete().eq('title_id', tid)
    const [di, ci] = await Promise.all([peopleIds(names(dir)), peopleIds(names(cast))])
    const links = [...di.map(person_id => ({ title_id: tid, person_id, role: 'director', position: 0 })), ...ci.map((person_id, i) => ({ title_id: tid, person_id, role: 'actor', position: i + 1 }))]
    if (links.length) await db().from('title_people').insert(links)
    if (session) await logAudit(session.user.id, isNew ? 'create_title' : 'update_title', 'titles', String(tid))
    setBusy(false)
    toast('Contenu enregistré.', 'ok')
    reloadCatalog()
    if (isNew) location.hash = `#/admin?t=titles&id=${tid}`
  }

  const del = async () => {
    if (!confirm('Supprimer définitivement ce contenu ?')) return
    const { error } = await db().from('titles').delete().eq('id', id)
    if (error) setMsg(error.message)
    else {
      if (session) await logAudit(session.user.id, 'delete_title', 'titles', id)
      toast('Contenu supprimé.', 'info')
      reloadCatalog()
      location.hash = '#/admin?t=titles'
    }
  }

  const addEpisode = async () => {
    if (isNew || !newEpTitle.trim()) return
    setBusy(true)
    const sNum = Math.max(1, +newEpSeason || 1)
    let seasonRow = seasonsList.find(s => s.number === sNum)
    if (!seasonRow) {
      const { data, error } = await db().from('seasons').insert({ title_id: +id, number: sNum }).select('id,number').single()
      if (error) { setBusy(false); return setMsg(error.message) }
      seasonRow = data
    }
    const nextNum = eps.filter(e => e.season === sNum).length + 1
    const { error } = await db().from('episodes').insert({
      season_id: seasonRow.id,
      number: nextNum,
      title: newEpTitle.trim(),
      duration_min: +newEpDur || 45,
      intro_end_sec: 75
    })
    setBusy(false)
    if (error) return setMsg(error.message)
    setNewEpTitle('')
    toast(`Épisode S${sNum}E${nextNum} ajouté.`, 'ok')
    load()
  }

  const uploadPoster = async (file?: File) => {
    if (!file) return
    setBusy(true); setMsg('Envoi de l’affiche…')
    const path = `${id}/${Date.now()}-${safe(file.name)}`
    const { error } = await db().storage.from('posters').upload(path, file, { contentType: file.type })
    if (error) { setBusy(false); return setMsg(error.message) }
    const url = db().storage.from('posters').getPublicUrl(path).data.publicUrl
    await db().from('titles').update({ poster_url: url }).eq('id', id)
    up('poster_url', url); setBusy(false); setMsg('Affiche envoyée.')
    reloadCatalog()
  }

  const uploadVideo = async (file: File | undefined, target: { title_id?: number; episode_id?: number }) => {
    if (!file) return
    setBusy(true); setMsg(`Envoi de ${file.name} (${Math.round(file.size / 1048576)} Mo), ne fermez pas cette page…`)
    const path = `${id}/${Date.now()}-${safe(file.name)}`
    const { error } = await db().storage.from('videos').upload(path, file, { contentType: file.type })
    if (error) { setBusy(false); return setMsg(/exceed|size|large/i.test(error.message) ? 'Fichier trop volumineux : limite de 50 Mo sur le plan Supabase gratuit.' : error.message) }
    const col = target.title_id ? 'title_id' : 'episode_id'
    await db().from('video_assets').delete().eq(col, (target.title_id ?? target.episode_id) as number)
    const { error: e2 } = await db().from('video_assets').insert({ ...target, storage_path: path, size_bytes: file.size, mime: file.type, status: 'ready' })
    setBusy(false); setMsg(e2 ? e2.message : 'Vidéo envoyée, prête à la lecture.'); load()
  }

  const chk = (k: 'is_trending' | 'is_new' | 'is_exclusive', t: string) => (
    <label className="chk"><input type="checkbox" checked={f[k]} onChange={e => up(k, e.target.checked)} />{t}</label>
  )

  return (
    <div className="panel form">
      <a className="lnk" href="#/admin?t=titles">← Retour aux contenus</a>
      <h2>{isNew ? 'Nouveau contenu' : f.title}</h2>
      <label>Titre<input className="field" value={f.title} onChange={e => up('title', e.target.value)} /></label>
      <div className="inline">
        <label>Type<select value={f.type} onChange={e => up('type', e.target.value)}>{TYPES.map(([k, t]) => <option key={k} value={k}>{t}</option>)}</select></label>
        <label>Année<input className="field narrow" inputMode="numeric" value={f.year} onChange={e => up('year', e.target.value)} /></label>
        <label>Durée (min)<input className="field narrow" inputMode="numeric" value={f.duration_min} onChange={e => up('duration_min', e.target.value)} /></label>
        <label>Âge<select value={f.age_rating} onChange={e => up('age_rating', e.target.value)}>{AGES.map(a => <option key={a}>{a}</option>)}</select></label>
        <label>Statut<select value={f.status} onChange={e => up('status', e.target.value)}>{Object.entries(STATUS).map(([k, t]) => <option key={k} value={k}>{t}</option>)}</select></label>
      </div>
      <div className="inline">
        <label>Pays<input className="field" value={f.country} onChange={e => up('country', e.target.value)} /></label>
        <label>Langue originale<select value={f.original_language} onChange={e => up('original_language', e.target.value)}>{langs.map(l => <option key={l.code} value={l.code}>{l.name}</option>)}</select></label>
      </div>
      <label>Synopsis<textarea className="field" rows={5} value={f.synopsis_long} onChange={e => up('synopsis_long', e.target.value)} /></label>
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
        <button type="button" className="btn p" disabled={busy} onClick={save}>Enregistrer</button>
        {!isNew && <button type="button" className="btn danger" disabled={busy} onClick={del}>Supprimer</button>}
      </div>
      {msg && <p role="status">{msg}</p>}

      {isNew ? (
        <p className="mu">Enregistrez d’abord le contenu pour pouvoir téléverser l’affiche, la vidéo ou les épisodes.</p>
      ) : (
        <>
          <div className="divider" />
          <h3>Médias & Fichiers</h3>
          {f.poster_url && <img className="thumb" src={f.poster_url} alt="Affiche actuelle" />}
          <label>Affiche (JPG, PNG ou WebP, 5 Mo max)
            <input type="file" accept="image/jpeg,image/png,image/webp" disabled={busy} onChange={e => uploadPoster(e.target.files?.[0])} />
          </label>

          {f.type === 'series' ? (
            <>
              <h3>Épisodes ({eps.length})</h3>
              <div className="inline">
                <label>Saison<input className="field narrow" inputMode="numeric" value={newEpSeason} onChange={e => setNewEpSeason(e.target.value)} /></label>
                <label>Titre de l’épisode<input className="field" value={newEpTitle} onChange={e => setNewEpTitle(e.target.value)} placeholder="Ex. L’Aube sur Bamako" /></label>
                <label>Durée (min)<input className="field narrow" inputMode="numeric" value={newEpDur} onChange={e => setNewEpDur(e.target.value)} /></label>
                <button type="button" className="btn" disabled={busy} onClick={addEpisode}>Ajouter l’épisode</button>
              </div>
              <ol className="eps">
                {eps.map(e => (
                  <li key={e.id}>
                    <span className="ep-num">S{e.season}.{e.number}</span>
                    <strong>{e.title}</strong>
                    <small className="mu">{e.video_assets?.length ? 'vidéo prête' : 'sans vidéo'}</small>
                    <input type="file" accept="video/mp4,video/webm,video/quicktime" disabled={busy} onChange={ev => uploadVideo(ev.target.files?.[0], { episode_id: e.id })} aria-label={`Vidéo de l’épisode ${e.number}`} />
                  </li>
                ))}
              </ol>
            </>
          ) : (
            <>
              <label>Fichier vidéo du film (MP4, WebM ou MOV)
                <input type="file" accept="video/mp4,video/webm,video/quicktime" disabled={busy} onChange={e => uploadVideo(e.target.files?.[0], { title_id: +id })} />
              </label>
              <p className="mu">{vid ? `Vidéo en ligne (${Math.round((vid.size_bytes || 0) / 1048576)} Mo).` : 'Aucune vidéo téléversée pour le moment.'}</p>
            </>
          )}
        </>
      )}
    </div>
  )
}
