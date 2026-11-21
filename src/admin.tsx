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
    ? [['stats', 'Pilotage & Métriques'], ['titles', 'Métadonnées catalogue'], ['rights', 'Droits par pays'], ['users', 'Comptes & Rôles'], ['reports', 'Signalements']]
    : [['reports', 'Signalements']]
  const defaultTab = role === 'admin' ? 'stats' : 'reports'
  const tab = tabs.some(([k]) => k === q.get('t')) ? (q.get('t') as string) : defaultTab
  const id = q.get('id')

  return (
    <div className="page admin">
      <div className="page-head">
        <div>
          <h1>{role === 'admin' ? 'Espace administrateur' : 'Espace modération'}</h1>
          <p className="mu">Pilotage de la plateforme, gestion des métadonnées, droits de diffusion, rôles utilisateurs et signalements.</p>
        </div>
        {role === 'admin' && (
          <div className="btns flush">
            <a className="btn" href="/studio/" target="_blank" rel="noopener noreferrer"><Icon n="studio" s={18} />Ouvrir Kora Studio</a>
          </div>
        )}
      </div>

      <div className="chips" role="tablist">
        {tabs.map(([k, t]) => (
          <a key={k} role="tab" aria-selected={tab === k} className={'chip' + (tab === k ? ' on' : '')} href={`#/admin?t=${k}`}>{t}</a>
        ))}
      </div>

      {tab === 'stats' && <Stats />}
      {tab === 'titles' && (id && id !== 'new' ? <MetadataEditor key={id} id={id} /> : <List />)}
      {tab === 'rights' && <RightsManager />}
      {tab === 'users' && <UsersManager />}
      {tab === 'reports' && <Reports />}
    </div>
  )
}

function Stats() {
  const { billingSimulation, maintenanceMode, maintenanceMessage, updatePlatformSettings, toast } = useApp()
  const [s, setS] = useState<any>(null)
  const [logs, setLogs] = useState<any[]>([])
  const [r2Status, setR2Status] = useState<{ configured: boolean; accountId: string; bucket: string; maxVideoMb: number }>({
    configured: false,
    accountId: '13542688dd607875e5a443ef3b10643e',
    bucket: 'kora-videos',
    maxVideoMb: 50
  })
  const [saspayStatus, setSaspayStatus] = useState<{ configured: boolean; webhookConfigured: boolean; mode: string }>({
    configured: false,
    webhookConfigured: false,
    mode: 'unconfigured'
  })
  const [saspayTestMsg, setSaspayTestMsg] = useState('')
  const [err, setErr] = useState('')
  const [maintDraft, setMaintDraft] = useState(maintenanceMessage)
  const [ctrlBusy, setCtrlBusy] = useState(false)

  useEffect(() => { setMaintDraft(maintenanceMessage) }, [maintenanceMessage])

  useEffect(() => {
    apiGet<{ stats: any; logs: any[]; r2Status?: any; saspayStatus?: any }>('/api/admin?action=stats').then(r => {
      if (!r.ok) setErr(r.data.error || 'Erreur de chargement.')
      else {
        setS(r.data.stats)
        setLogs(r.data.logs || [])
        if (r.data.r2Status) setR2Status(r.data.r2Status)
        if (r.data.saspayStatus) setSaspayStatus(r.data.saspayStatus)
      }
    })
  }, [])

  const toggleSimulation = async () => {
    setCtrlBusy(true)
    const next = !billingSimulation
    const ok = await updatePlatformSettings({ billingSimulation: next })
    setCtrlBusy(false)
    if (ok) {
      toast(next ? 'Mode simulation activé : les utilisateurs peuvent activer un abonnement gratuitement.' : 'Mode simulation désactivé : le paiement est désormais obligatoire.', 'ok')
    }
  }

  const toggleMaintenance = async () => {
    setCtrlBusy(true)
    const next = !maintenanceMode
    const ok = await updatePlatformSettings({ maintenanceMode: next, maintenanceMessage: maintDraft })
    setCtrlBusy(false)
    if (ok) {
      toast(next ? 'Page de maintenance activée sur Kora et Kora Studio.' : 'Page de maintenance désactivée : la plateforme est ouverte au public.', 'ok')
    }
  }

  const saveMaintMessage = async () => {
    setCtrlBusy(true)
    const ok = await updatePlatformSettings({ maintenanceMessage: maintDraft })
    setCtrlBusy(false)
    if (ok) toast('Message de maintenance enregistré.', 'ok')
  }

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
      <section className="panel">
        <div className="panel-head">
          <div>
            <h2>Pilotage de la plateforme</h2>
            <p className="mu">Contrôlez en un clic le mode d’abonnement et la page de maintenance publique.</p>
          </div>
        </div>

        <div className="control-cards">
          <div className="control-card">
            <div className="control-top">
              <div>
                <strong>Mode simulation (Abonnements gratuits)</strong>
                <p className="mu">
                  {billingSimulation
                    ? 'Les visiteurs connectés peuvent activer Kora Premium ou Famille gratuitement en 1 clic.'
                    : 'Le paiement réel (Orange Money, Moov Money, Wave ou Carte) est obligatoire pour activer une formule.'}
                </p>
              </div>
              <span className={billingSimulation ? 'pill-ok' : 'pill-spec'}>
                {billingSimulation ? 'Simulation active' : 'Paiement obligatoire'}
              </span>
            </div>
            <div className="btns flush">
              <button
                type="button"
                className={'btn ' + (billingSimulation ? '' : 'p')}
                disabled={ctrlBusy}
                onClick={toggleSimulation}
              >
                <Icon n="crown" s={18} />
                {billingSimulation ? 'Désactiver la simulation (Obliger le paiement)' : 'Activer le mode simulation (Gratuit 1 clic)'}
              </button>
              <a className="btn" href="#/abonnement">Voir la page Offres</a>
            </div>
          </div>

          <div className="control-card">
            <div className="control-top">
              <div>
                <strong>Page de maintenance de la plateforme</strong>
                <p className="mu">
                  {maintenanceMode
                    ? 'La page de maintenance est actuellement affichée à tous les visiteurs (Kora & Kora Studio).'
                    : 'La plateforme est ouverte normalement à tous les spectateurs et créateurs.'}
                </p>
              </div>
              <span className={maintenanceMode ? 'pill-accent' : 'pill-ok'}>
                {maintenanceMode ? 'En maintenance' : 'En ligne'}
              </span>
            </div>

            <label style={{ display: 'grid', gap: 5, fontSize: '0.84rem', color: 'var(--mu)' }}>
              Message affiché sur la page de maintenance
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  className="field"
                  value={maintDraft}
                  onChange={e => setMaintDraft(e.target.value)}
                  placeholder="Message pour vos spectateurs…"
                />
                <button type="button" className="btn" disabled={ctrlBusy} onClick={saveMaintMessage}>Enregistrer</button>
              </div>
            </label>

            <div className="btns flush">
              <button
                type="button"
                className={'btn ' + (maintenanceMode ? 'p' : 'danger')}
                disabled={ctrlBusy}
                onClick={toggleMaintenance}
              >
                <Icon n={maintenanceMode ? 'check' : 'alert'} s={18} />
                {maintenanceMode ? 'Désactiver la maintenance (Ouvrir le site)' : 'Afficher la page de maintenance'}
              </button>
              <a className="btn" href="#/maintenance">Aperçu de la page de maintenance</a>
            </div>
          </div>

          <div className="control-card">
            <div className="control-top">
              <div>
                <strong>Stockage Vidéo Grande Capacité (Cloudflare R2)</strong>
                <p className="mu">
                  {r2Status.configured
                    ? `Connecté au compartiment « ${r2Status.bucket} » · Téléversement jusqu’à 5 Go par film ou épisode · Bande passante 0 €.`
                    : 'Prêt pour vos longs-métrages (jusqu’à 5 Go/fichier et bande passante gratuite). En attendant l’activation de votre compartiment R2, le stockage standard 50 Mo assure automatiquement le relais.'}
                </p>
              </div>
              <span className={r2Status.configured ? 'pill-ok' : 'pill-spec'}>
                {r2Status.configured ? 'Cloudflare R2 Actif (5 Go)' : 'Relais 50 Mo actif'}
              </span>
            </div>
            <div className="btns flush">
              <a
                className="btn"
                href={`https://dash.cloudflare.com/${r2Status.accountId}/r2/overview`}
                target="_blank"
                rel="noopener noreferrer"
              >
                <Icon n="upload" s={18} />
                Ouvrir Cloudflare R2 ({r2Status.bucket})
              </a>
            </div>
          </div>

          <div className="control-card">
            <div className="control-top">
              <div>
                <strong>Passerelle de Paiement SasPay (Mobile Money & Carte)</strong>
                <p className="mu">
                  {saspayStatus.configured
                    ? `Connectée (${saspayStatus.mode === 'live' ? 'Mode Production' : 'Mode Test'}) · Notifications automatiques ${saspayStatus.webhookConfigured ? 'activées' : 'en attente de configuration'}.`
                    : 'Prête pour l’encaissement (Orange Money, Wave, Moov Money, MTN MoMo, Carte) et les retraits créateurs.'}
                </p>
                <small className="mu">Adresse de notification à renseigner dans votre espace marchand SasPay : {location.origin}/api/webhooks/saspay</small>
              </div>
              <span className={saspayStatus.configured ? 'pill-ok' : 'pill-spec'}>
                {saspayStatus.configured ? (saspayStatus.mode === 'live' ? 'SasPay Production' : 'SasPay Test') : 'Configuration marchand requise'}
              </span>
            </div>
            {saspayTestMsg && <p className="status-box" role="status">{saspayTestMsg}</p>}
            <div className="btns flush">
              <button
                type="button"
                className="btn"
                disabled={ctrlBusy}
                onClick={async () => {
                  setCtrlBusy(true); setSaspayTestMsg('Vérification de la connexion avec SasPay…')
                  const cRes = await apiGet<{ countries?: any[] }>('/api/checkout?action=countries')
                  const rRes = await apiGet<{ rates?: any[]; error?: string }>('/api/checkout?action=my-rates')
                  setCtrlBusy(false)
                  const count = Array.isArray(cRes.data?.countries) ? cRes.data.countries.length : 0
                  if (rRes.ok && Array.isArray(rRes.data?.rates)) {
                    setSaspayTestMsg(`SasPay connecté : ${count} pays référencés · ${rRes.data.rates.length} réseaux actifs sur votre compte marchand.`)
                  } else if (cRes.ok) {
                    setSaspayTestMsg(`Service SasPay joignable (${count} pays disponibles). ${rRes.data?.error || 'Activez votre compte marchand pour consulter vos grilles tarifaires.'}`)
                  } else {
                    setSaspayTestMsg('Impossible de joindre SasPay.')
                  }
                }}
              >
                <Icon n="card" s={18} />
                Tester la connexion SasPay
              </button>
              <a className="btn" href="https://app.saspay.me" target="_blank" rel="noopener noreferrer">
                Tableau de bord SasPay
              </a>
            </div>
          </div>
        </div>
      </section>

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
        <div>
          <h2>Métadonnées du catalogue ({visible.length})</h2>
          <p className="mu">Modifiez les fiches éditoriales, badges et visibilité. La mise en ligne des vidéos se fait dans l’application Kora Studio.</p>
        </div>
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
            <a className="lnk" href={`#/admin?t=titles&id=${t.id}`}>Métadonnées</a>
            <button type="button" className="lnk" onClick={() => toggle(t)}>{t.status === 'published' ? 'Dépublier' : 'Publier'}</button>
            <button type="button" className="lnk" onClick={() => remove(t)}>Supprimer</button>
          </span>
        ])}
        empty="Aucun contenu dans cette catégorie. Les créateurs publient leurs œuvres depuis Kora Studio."
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
const blank = (): F => ({
  title: '', type: 'series', year: String(new Date().getFullYear()), duration_min: '45',
  country: 'Mali', original_language: 'fr', age_rating: 'Tous', synopsis_short: '', synopsis_long: '', status: 'published',
  is_trending: false, is_new: true, is_exclusive: false, available_from: '', available_until: '', poster_url: '', backdrop_url: ''
})

function MetadataEditor({ id }: { id: string }) {
  const { reloadCatalog, toast } = useApp()
  const [f, setF] = useState<F>(blank)
  const [genres, setGenres] = useState<any[]>([])
  const [sel, setSel] = useState<number[]>([])
  const [langs, setLangs] = useState<any[]>([])
  const [dir, setDir] = useState('')
  const [cast, setCast] = useState('')
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)
  const [pendingPoster, setPendingPoster] = useState<File | null>(null)
  const [pendingPosterPreview, setPendingPosterPreview] = useState('')
  const [pendingBackdrop, setPendingBackdrop] = useState<File | null>(null)
  const [pendingBackdropPreview, setPendingBackdropPreview] = useState('')

  const up = (k: keyof F, v: unknown) => setF(x => ({ ...x, [k]: v }))

  useEffect(() => {
    apiGet<{ genres: any[]; langs: any[]; title: any }>(`/api/admin?action=title-detail&id=${encodeURIComponent(id)}`).then(r => {
      if (!r.ok) { setMsg(r.data.error || 'Impossible de charger les métadonnées.'); return }
      setGenres(r.data.genres || [])
      setLangs(r.data.langs || [])
      const t = r.data.title
      if (!t) { setMsg('Contenu introuvable.'); return }
      setF({
        title: t.title, type: t.type, year: String(t.year ?? ''), duration_min: String(t.duration_min ?? ''), country: t.country, original_language: t.original_language || 'fr', age_rating: t.age_rating,
        synopsis_short: t.synopsis_short || '', synopsis_long: t.synopsis_long || '', status: t.status, is_trending: t.is_trending, is_new: t.is_new, is_exclusive: t.is_exclusive,
        available_from: t.available_from || '', available_until: t.available_until || '', poster_url: t.poster_url || '', backdrop_url: t.backdrop_url || ''
      })
      setSel((t.title_genres || []).map((x: any) => x.genre_id))
      setDir((t.title_people || []).filter((x: any) => x.role === 'director').map((x: any) => x.people?.name).filter(Boolean).join(', '))
      setCast((t.title_people || []).filter((x: any) => x.role === 'actor').sort((a: any, b: any) => a.position - b.position).map((x: any) => x.people?.name).filter(Boolean).join(', '))
    })
  }, [id])

  const uploadImageFile = async (file: File, kind: 'poster' | 'backdrop'): Promise<string | null> => {
    const sign = await apiPost<{ signedUrl: string; publicUrl: string }>('/api/admin?action=sign-upload', {
      bucket: 'posters',
      folder: id,
      kind,
      fileName: file.name,
      mime: file.type,
      sizeBytes: file.size
    })
    if (!sign.ok || !sign.data.signedUrl) { setMsg(sign.data.error || 'Échec préparation envoi.'); return null }
    const upRes = await uploadFileToSignedUrl(sign.data.signedUrl, file)
    if (!upRes.ok) { setMsg(upRes.error || 'Échec envoi image.'); return null }
    return sign.data.publicUrl
  }

  const save = async () => {
    if (!f.title.trim()) return setMsg('Le titre est obligatoire.')
    if (f.status === 'published' && !pendingPoster && !f.poster_url.trim()) {
      return setMsg('Une affiche 2:3 est obligatoire pour publier un contenu sur Kora.')
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
      id,
      form: { ...f, poster_url: posterUrl, backdrop_url: backdropUrl },
      genres: sel,
      director: dir,
      cast
    })
    setBusy(false)
    if (!r.ok) return setMsg(r.data.error || 'Impossible d’enregistrer les métadonnées.')
    toast('Métadonnées mises à jour.', 'ok')
    reloadCatalog()
  }

  const del = async () => {
    if (!confirm('Supprimer définitivement ce contenu et ses métadonnées ?')) return
    const r = await apiPost('/api/admin?action=delete-title', { id })
    if (!r.ok) setMsg(r.data.error || 'Erreur de suppression.')
    else {
      toast('Contenu supprimé.', 'info')
      reloadCatalog()
      location.hash = '#/admin?t=titles'
    }
  }

  const pickImage = (file: File | undefined, kind: 'poster' | 'backdrop') => {
    if (!file) return
    const preview = URL.createObjectURL(file)
    if (kind === 'poster') { setPendingPoster(file); setPendingPosterPreview(preview) }
    else { setPendingBackdrop(file); setPendingBackdropPreview(preview) }
  }

  const chk = (k: 'is_trending' | 'is_new' | 'is_exclusive', t: string) => (
    <label className="chk"><input type="checkbox" checked={f[k]} onChange={e => up(k, e.target.checked)} />{t}</label>
  )

  const posterPreview = pendingPosterPreview || f.poster_url
  const backdropPreview = pendingBackdropPreview || f.backdrop_url

  return (
    <div className="panel form">
      <a className="lnk" href="#/admin?t=titles">← Retour aux métadonnées du catalogue</a>
      <h2>Métadonnées · {f.title || `#${id}`}</h2>
      <p className="mu">Modifiez ici les métadonnées éditoriales, les visuels et la fenêtre de disponibilité. Les fichiers vidéo, épisodes et sous-titres sont gérés dans l’application séparée <a className="lnk" href="/studio/" target="_blank" rel="noopener noreferrer">Kora Studio</a>.</p>

      <label>Titre<input className="field" value={f.title} onChange={e => up('title', e.target.value)} /></label>
      <div className="inline">
        <label>Type<select value={f.type} onChange={e => up('type', e.target.value)}>{TYPES.map(([k, t]) => <option key={k} value={k}>{t}</option>)}</select></label>
        <label>Année<input className="field narrow" inputMode="numeric" value={f.year} onChange={e => up('year', e.target.value)} /></label>
        <label>Durée moy. (min)<input className="field narrow" inputMode="numeric" value={f.duration_min} onChange={e => up('duration_min', e.target.value)} /></label>
        <label>Âge<select value={f.age_rating} onChange={e => up('age_rating', e.target.value)}>{AGES.map(a => <option key={a}>{a}</option>)}</select></label>
        <label>Statut<select value={f.status} onChange={e => up('status', e.target.value)}>{Object.entries(STATUS).map(([k, t]) => <option key={k} value={k}>{t}</option>)}</select></label>
      </div>

      <div className="cover-upload-grid">
        <div className="cover-box">
          <strong>Affiche 2:3 (Couverture)</strong>
          {posterPreview ? <img className="thumb" src={posterPreview} alt="Aperçu couverture" /> : <div className="thumb placeholder">Aucune affiche</div>}
          <input type="file" accept="image/jpeg,image/png,image/webp" disabled={busy} onChange={e => pickImage(e.target.files?.[0], 'poster')} />
          <input className="field" value={f.poster_url} onChange={e => up('poster_url', e.target.value)} placeholder="URL de l’affiche" aria-label="URL de la couverture" />
        </div>
        <div className="cover-box">
          <strong>Bannière grand écran 16:9</strong>
          {backdropPreview ? <img className="thumb wide-thumb" src={backdropPreview} alt="Aperçu bannière" /> : <div className="thumb wide-thumb placeholder">Aucune bannière</div>}
          <input type="file" accept="image/jpeg,image/png,image/webp" disabled={busy} onChange={e => pickImage(e.target.files?.[0], 'backdrop')} />
          <input className="field" value={f.backdrop_url} onChange={e => up('backdrop_url', e.target.value)} placeholder="URL de la bannière" aria-label="URL de la bannière" />
        </div>
      </div>

      <label>Accroche / Synopsis court (max 180 car.)
        <input className="field" maxLength={180} value={f.synopsis_short} onChange={e => up('synopsis_short', e.target.value)} />
      </label>
      <label>Synopsis complet
        <textarea className="field" rows={4} value={f.synopsis_long} onChange={e => up('synopsis_long', e.target.value)} />
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
          {busy ? 'Enregistrement…' : 'Enregistrer les métadonnées'}
        </button>
        <button type="button" className="btn danger" disabled={busy} onClick={del}>Supprimer du catalogue</button>
      </div>
      {msg && <p role="status">{msg}</p>}
    </div>
  )
}
