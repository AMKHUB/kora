import { createContext, useContext, useEffect, useState, useCallback, ReactNode } from 'react'
import { apiGet, apiPost, AuthUser, consumeAuthRedirectTokens } from './api'
import { processPaymentCheckout } from './billing'

export type SessionState = { user: AuthUser }

export type Episode = {
  id?: number
  number: number
  title: string
  synopsis?: string
  duration_min: number
  intro_end_sec?: number
}

export type Item = {
  id: number
  title: string
  type: 'film' | 'serie' | 'doc' | 'court'
  year: number
  country: string
  langs: string[]
  subtitles?: string[]
  genres: string[]
  age: string
  dur: number
  seasons?: number
  episodesBySeason?: Record<number, Episode[]>
  director: string
  cast: string[]
  synopsis: string
  poster?: string
  backdrop?: string
  trailer?: string
  quality?: '4K' | 'HD'
  hdr?: boolean
  audioDesc?: boolean
  badge?: string
  isTrending?: boolean
  isNew?: boolean
  isExclusive?: boolean
}

export type Catalog = {
  items: Item[]
  hero: number
  heroes?: number[]
  rows: Record<string, number[]>
}

export type PlanId = 'free' | 'premium' | 'family'
export type ThemeMode = 'dark' | 'black' | 'light'

export type Profile = {
  id: string
  name: string
  avatar: string
  kid: boolean
  list: number[]
  hist: Record<number, number>
  epHist: Record<string, number>
  rate: Record<number, string>
  hasPin?: boolean
}

export type Invoice = {
  id: string
  date: string
  planId: PlanId
  planName: string
  billing: 'month' | 'year'
  amountXof: number
  provider: string
  reference: string
  status: 'paid' | 'pending'
}

export type DeviceInfo = {
  id: string
  name: string
  platform: string
  lastSeen: string
  current?: boolean
  revoked?: boolean
}

export type AppNotification = {
  id: string
  title: string
  body: string
  kind: 'release' | 'account' | 'info'
  link?: string
  read: boolean
  date: string
}

export type Toast = {
  id: number
  msg: string
  kind?: 'ok' | 'err' | 'info'
}

export type State = {
  profiles: Profile[]
  cur: string
  plan: PlanId
  billing: 'month' | 'year'
  cancelAtPeriodEnd: boolean
  periodEnd: string
  invoices: Invoice[]
  devices: DeviceInfo[]
  notifications: AppNotification[]
  recentSearches: string[]
  theme: ThemeMode
  subLang: string
  audioLang: string
  subSize: 'petit' | 'normal' | 'grand'
  defaultQuality: string
  autoNext: boolean
  accountName: string
  accountCountry: string
}

const KEY = 'kora-state-v3'
const DEVICE_KEY = 'kora-device-id'

export const AVATARS = [
  { id: 'gold', label: 'Or Kora', bg: '#2C2410', fg: '#F2C334', ring: '#F2C334' },
  { id: 'emerald', label: 'Forêt Mandé', bg: '#132919', fg: '#53C462', ring: '#2F9E3C' },
  { id: 'crimson', label: 'Terre rouge', bg: '#2E1312', fg: '#F26D6A', ring: '#DE1310' },
  { id: 'sahel', label: 'Sable d’ocre', bg: '#2A2116', fg: '#E8B95B', ring: '#C28E2C' },
  { id: 'indigo', label: 'Indigo Ségou', bg: '#171E2E', fg: '#8AB0F2', ring: '#4C76C9' },
  { id: 'cream', label: 'Ivoire', bg: '#26231C', fg: '#EDEBE4', ring: '#9E9C95' }
]

export const PLANS: {
  id: PlanId
  name: string
  tagline: string
  priceMonth: number
  priceYear: number
  screens: number
  profiles: number
  quality: string
  ads: boolean
  downloads: boolean
  features: string[]
}[] = [
  {
    id: 'free',
    name: 'Gratuit',
    tagline: 'Découvrez le cinéma africain librement',
    priceMonth: 0,
    priceYear: 0,
    screens: 1,
    profiles: 2,
    quality: 'HD 720p',
    ads: true,
    downloads: false,
    features: [
      'Accès au catalogue public avec publicité courte',
      'Qualité vidéo jusqu’à HD 720p',
      '1 écran à la fois · 2 profils (dont profil enfant)',
      'Sous-titres Français, English et Bambara'
    ]
  },
  {
    id: 'premium',
    name: 'Premium',
    tagline: 'L’expérience cinéma sans interruption',
    priceMonth: 2500,
    priceYear: 25000,
    screens: 2,
    profiles: 4,
    quality: 'Full HD 1080p',
    ads: false,
    downloads: true,
    features: [
      'Zéro publicité sur tous les films, séries et docs',
      'Qualité Full HD 1080p & son stéréo / 5.1',
      '2 écrans simultanés · 4 profils personnalisés',
      'Téléchargements hors connexion sur mobile',
      'Accès prioritaire aux exclusivités Kora'
    ]
  },
  {
    id: 'family',
    name: 'Famille & Cinéma',
    tagline: 'Pour tout le foyer en Ultra HD 4K',
    priceMonth: 4500,
    priceYear: 45000,
    screens: 4,
    profiles: 6,
    quality: '4K Ultra HD + HDR',
    ads: false,
    downloads: true,
    features: [
      'Qualité 4K Ultra HD & HDR sur les œuvres restaurées et originales',
      '4 écrans simultanés · 6 profils avec code PIN sécurisé',
      'Zéro publicité · Contrôle parental renforcé',
      'Téléchargements illimités sur mobile',
      'Avant-premières et sélections festivals (FESPACO)'
    ]
  }
]

function detectDevice(): DeviceInfo {
  let id = 'dev-local'
  try {
    id = localStorage.getItem(DEVICE_KEY) || (crypto.randomUUID?.() || 'dev-' + Date.now())
    localStorage.setItem(DEVICE_KEY, id)
  } catch { /* ignoré */ }
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent : ''
  const os = /Windows/i.test(ua) ? 'Windows' : /Mac OS/i.test(ua) ? 'macOS' : /Android/i.test(ua) ? 'Android' : /iPhone|iPad/i.test(ua) ? 'iOS' : /Linux/i.test(ua) ? 'Linux' : 'Appareil web'
  const br = /Edg\//i.test(ua) ? 'Edge' : /Chrome\//i.test(ua) ? 'Chrome' : /Firefox\//i.test(ua) ? 'Firefox' : /Safari/i.test(ua) ? 'Safari' : 'Navigateur'
  return { id, name: `${br} sur ${os}`, platform: os, lastSeen: new Date().toISOString(), current: true }
}

export async function hashPin(pin: string): Promise<string> {
  const clean = pin.trim()
  if (typeof crypto !== 'undefined' && crypto.subtle) {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`kora-pin:${clean}`))
    return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('')
  }
  return 'raw:' + clean
}

const init: State = {
  profiles: [
    { id: 'p1', name: 'Moi', avatar: 'gold', kid: false, list: [], hist: {}, epHist: {}, rate: {} }
  ],
  cur: 'p1',
  plan: 'free',
  billing: 'month',
  cancelAtPeriodEnd: false,
  periodEnd: new Date(Date.now() + 86400000 * 30).toISOString(),
  invoices: [],
  devices: [detectDevice()],
  notifications: [],
  recentSearches: [],
  theme: 'dark',
  subLang: 'Français',
  audioLang: 'Original',
  subSize: 'normal',
  defaultQuality: 'Auto',
  autoNext: true,
  accountName: '',
  accountCountry: 'Mali'
}

function loadPrefs(): State {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return init
    const parsed = JSON.parse(raw)
    return {
      ...init,
      theme: parsed.theme || 'dark',
      subLang: parsed.subLang || 'Français',
      audioLang: parsed.audioLang || 'Original',
      subSize: parsed.subSize || 'normal',
      defaultQuality: parsed.defaultQuality || 'Auto',
      autoNext: parsed.autoNext ?? true,
      recentSearches: Array.isArray(parsed.recentSearches) ? parsed.recentSearches : []
    }
  } catch {
    return init
  }
}

async function loadCatalog(): Promise<Catalog> {
  const res = await apiGet<Catalog>('/api/catalog')
  if (res.ok && Array.isArray(res.data?.items)) {
    const items = res.data.items.filter((i: any) => typeof i.poster === 'string' && i.poster.trim().length > 0)
    return { ...res.data, items }
  }
  return { items: [], hero: 0, heroes: [], rows: {} }
}

type Ctx = {
  st: State
  profile: Profile
  cat: Catalog | null
  items: Item[]
  byId: (id: number) => Item | undefined
  session: SessionState | null
  authReady: boolean
  authConfigured: boolean
  billingSimulation: boolean
  maintenanceMode: boolean
  maintenanceMessage: string
  role: string
  isPremium: boolean
  unreadCount: number
  toasts: Toast[]
  toast: (msg: string, kind?: Toast['kind']) => void
  dismissToast: (id: number) => void
  requireAuth: (actionLabel?: string) => boolean
  refreshSession: () => Promise<void>
  updatePlatformSettings: (patch: { billingSimulation?: boolean; maintenanceMode?: boolean; maintenanceMessage?: string }) => Promise<boolean>
  signOut: () => Promise<void>
  reloadCatalog: () => void
  toggleList: (id: number) => void
  progress: (id: number, s: number, season?: number, episode?: number) => void
  removeHistory: (id: number) => void
  clearHistory: () => void
  rate: (id: number, r: string) => void
  addProfile: (name: string, kid: boolean, avatar: string, pin?: string) => Promise<void>
  updateProfile: (id: string, patch: { name?: string; kid?: boolean; avatar?: string; pin?: string | null }) => Promise<void>
  deleteProfile: (id: string) => Promise<void>
  selectProfile: (id: string) => void
  verifyProfilePin: (profileId: string, pin: string) => Promise<boolean>
  subscribePlan: (planId: PlanId, billing: 'month' | 'year', provider: string, customerRef?: string) => Promise<{ ok: boolean; error?: string }>
  applyVerifiedSubscription: (planId: PlanId, billing: 'month' | 'year', provider: string, reference: string, chargedAmount?: string | number) => void
  cancelSubscription: (cancel: boolean) => void
  updateAccount: (name: string, country: string) => Promise<void>
  revokeDevice: (deviceId: string) => Promise<void>
  markNotificationsRead: (id?: string) => void
  addRecentSearch: (q: string) => void
  submitReport: (titleId: number, reason: string) => Promise<boolean>
  setTheme: (t: ThemeMode) => void
  set: (p: Partial<State>) => void
}

const C = createContext<Ctx>(null!)
export const useApp = () => useContext(C)

export function Provider({ children }: { children: ReactNode }) {
  const [st, setSt] = useState<State>(loadPrefs)
  const [cat, setCat] = useState<Catalog | null>(null)
  const [session, setSession] = useState<SessionState | null>(null)
  const [authReady, setAuthReady] = useState(false)
  const [authConfigured, setAuthConfigured] = useState(true)
  const [billingSimulation, setBillingSimulation] = useState(true)
  const [maintenanceMode, setMaintenanceMode] = useState(false)
  const [maintenanceMessage, setMaintenanceMessage] = useState('Nous effectuons une mise à jour pour améliorer votre expérience cinéma sur Kora. Le service sera de retour très bientôt.')
  const [role, setRole] = useState('user')
  const [toasts, setToasts] = useState<Toast[]>([])

  const toast = useCallback((msg: string, kind: Toast['kind'] = 'info') => {
    const id = Date.now() + Math.floor(Math.random() * 1000)
    setToasts(list => [...list.slice(-3), { id, msg, kind }])
    window.setTimeout(() => setToasts(list => list.filter(t => t.id !== id)), 3800)
  }, [])

  const dismissToast = useCallback((id: number) => {
    setToasts(list => list.filter(t => t.id !== id))
  }, [])

  const requireAuth = useCallback((actionLabel?: string) => {
    if (session) return true
    toast(actionLabel ? `Connectez-vous pour ${actionLabel}.` : 'Connectez-vous pour accéder à cette fonctionnalité.', 'info')
    location.hash = '#/connexion'
    return false
  }, [session, toast])

  // Appliquer le thème de marque sur <html> et <meta name="theme-color">
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', st.theme)
    const meta = document.querySelector('meta[name="theme-color"]')
    if (meta) {
      meta.setAttribute('content', st.theme === 'light' ? '#FBF9F4' : st.theme === 'black' ? '#000000' : '#16140F')
    }
  }, [st.theme])

  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify({
        theme: st.theme,
        subLang: st.subLang,
        audioLang: st.audioLang,
        subSize: st.subSize,
        defaultQuality: st.defaultQuality,
        autoNext: st.autoNext,
        recentSearches: st.recentSearches
      }))
    } catch { /* stockage indisponible */ }
  }, [st.theme, st.subLang, st.audioLang, st.subSize, st.defaultQuality, st.autoNext, st.recentSearches])

  const reloadCatalog = useCallback(() => {
    loadCatalog().then(setCat).catch(() => setCat({ items: [], hero: 0, rows: {} }))
  }, [])

  useEffect(() => { reloadCatalog() }, [reloadCatalog])

  const refreshSession = useCallback(async () => {
    const r = await apiGet<{
      configured: boolean
      billingMode: string
      maintenanceMode?: boolean
      maintenanceMessage?: string
      user: AuthUser | null
      role: string
    }>('/api/auth?action=session')
    if (r.ok) {
      setAuthConfigured(!!r.data.configured)
      setBillingSimulation(r.data.billingMode !== 'live')
      setMaintenanceMode(!!r.data.maintenanceMode)
      if (r.data.maintenanceMessage) setMaintenanceMessage(r.data.maintenanceMessage)
      setSession(r.data.user ? { user: r.data.user } : null)
      setRole(r.data.role || 'user')
    } else {
      setSession(null)
      setRole('user')
    }
    setAuthReady(true)
  }, [])

  const updatePlatformSettings = useCallback(async (patch: { billingSimulation?: boolean; maintenanceMode?: boolean; maintenanceMessage?: string }) => {
    const r = await apiPost<{ platformSettings?: { billingSimulation: boolean; maintenanceMode: boolean; maintenanceMessage: string } }>('/api/admin?action=platform-settings', patch)
    if (!r.ok) {
      toast(r.data.error || 'Impossible de modifier ce réglage.', 'err')
      return false
    }
    if (r.data.platformSettings) {
      setBillingSimulation(r.data.platformSettings.billingSimulation)
      setMaintenanceMode(r.data.platformSettings.maintenanceMode)
      setMaintenanceMessage(r.data.platformSettings.maintenanceMessage)
    }
    return true
  }, [toast])

  useEffect(() => {
    let active = true
    ;(async () => {
      const consumed = await consumeAuthRedirectTokens()
      if (!active) return
      await refreshSession()
      if (!active) return
      if (consumed.handled) {
        if (consumed.errCode) {
          const enc = encodeURIComponent(consumed.errCode)
          location.hash = consumed.flow === 'recovery'
            ? `#/reinitialisation?status=error&err=${enc}`
            : `#/confirmation?status=error&err=${enc}`
        } else if (consumed.flow === 'recovery') {
          location.hash = '#/reinitialisation?step=new'
        } else if (consumed.flow === 'confirm') {
          location.hash = '#/confirmation?status=ok'
        } else {
          location.hash = '#/'
        }
      }
    })()
    return () => { active = false }
  }, [refreshSession])

  // Synchronisation complète du compte connecté via l'API interne /api/me
  useEffect(() => {
    if (!session) return
    const curDev = detectDevice()
    ;(async () => {
      const res = await apiGet<any>('/api/me?action=sync')
      if (!res.ok || !res.data) return
      const d = res.data
      setRole(d.account?.role || role || 'user')
      const mine = (rows: any[] | null, p: string) => (rows || []).filter(x => x.profile_id === p)

      const mappedDevices: DeviceInfo[] = (d.devices || []).map((dv: any) => ({
        id: dv.id, name: dv.name, platform: dv.platform || 'Web', lastSeen: dv.last_seen_at, current: dv.name === curDev.name
      }))
      if (!mappedDevices.length) {
        mappedDevices.push(curDev)
        apiPost('/api/me?action=register-device', { name: curDev.name, platform: curDev.platform })
      }

      const dbPlan = (d.subscription?.plan_id as PlanId) || 'free'
      const mappedInvoices: Invoice[] = (d.payments || []).map((p: any) => ({
        id: String(p.id),
        date: p.created_at,
        planId: p.amount_xof >= 4500 ? 'family' : 'premium',
        planName: p.amount_xof >= 4500 ? 'Famille & Cinéma' : 'Premium',
        billing: p.amount_xof >= 20000 ? 'year' : 'month',
        amountXof: p.amount_xof,
        provider: p.provider || 'Orange Money',
        reference: p.provider_ref || `KORA-${p.id}`,
        status: p.status === 'paid' ? 'paid' : 'pending'
      }))

      const mappedNotifs: AppNotification[] = (d.notifications || []).map((n: any) => ({
        id: String(n.id), title: n.title, body: n.body, kind: n.kind || 'info', link: n.link || undefined, read: !!n.read_at, date: n.created_at
      }))

      setSt(s => ({
        ...s,
        accountName: d.account?.name || s.accountName,
        accountCountry: d.account?.country || s.accountCountry || 'Mali',
        plan: dbPlan,
        cancelAtPeriodEnd: !!d.subscription?.cancel_at_period_end,
        periodEnd: d.subscription?.current_period_end || s.periodEnd,
        invoices: mappedInvoices,
        devices: mappedDevices,
        notifications: mappedNotifs,
        ...(d.profiles?.length ? {
          cur: d.profiles.some((p: any) => p.id === s.cur) ? s.cur : d.profiles[0].id,
          subLang: d.profiles[0].subtitle_lang || s.subLang,
          audioLang: d.profiles[0].audio_lang || s.audioLang,
          subSize: (d.profiles[0].subtitle_size as State['subSize']) || s.subSize,
          autoNext: d.profiles[0].autoplay_next ?? s.autoNext,
          profiles: d.profiles.map((p: any, idx: number) => ({
            id: p.id,
            name: p.name,
            avatar: p.avatar || AVATARS[idx % AVATARS.length].id,
            kid: !!p.is_kid,
            hasPin: !!p.has_pin,
            list: mine(d.my_list, p.id).map((x: any) => x.title_id),
            hist: Object.fromEntries(mine(d.watch_progress, p.id).filter((x: any) => x.episode_id === 0).map((x: any) => [x.title_id, x.position_sec])),
            epHist: {},
            rate: Object.fromEntries(mine(d.ratings, p.id).map((x: any) => [x.title_id, x.value]))
          }))
        } : {})
      }))
    })()
  }, [session?.user.id])

  const profile = st.profiles.find(p => p.id === st.cur) || st.profiles[0]
  const rid = session && /^[0-9a-f-]{36}$/i.test(profile.id) ? profile.id : ''
  const upd = (f: (p: Profile) => Profile) =>
    setSt(s => ({ ...s, profiles: s.profiles.map(p => p.id === s.cur ? f(p) : p) }))
  const items = (cat?.items || []).filter(i => !session || !profile.kid || i.age === 'Tous' || i.age === '7+')
  const isPremium = !!session && (st.plan === 'premium' || st.plan === 'family')
  const unreadCount = session ? st.notifications.filter(n => !n.read).length : 0

  const v: Ctx = {
    st,
    profile,
    cat,
    items,
    byId: id => items.find(i => i.id === id),
    session,
    authReady,
    authConfigured,
    billingSimulation,
    maintenanceMode,
    maintenanceMessage,
    role,
    isPremium,
    unreadCount,
    toasts,
    toast,
    dismissToast,
    requireAuth,
    refreshSession,
    updatePlatformSettings,
    reloadCatalog,
    signOut: async () => {
      await apiPost('/api/auth?action=logout')
      setSession(null)
      setRole('user')
      setSt(s0 => ({ ...init, theme: s0.theme }))
      toast('Vous êtes déconnecté.', 'info')
      location.hash = '#/'
    },
    toggleList: id => {
      if (!requireAuth('ajouter un titre à Ma liste')) return
      const on = profile.list.includes(id)
      upd(p => ({ ...p, list: on ? p.list.filter(x => x !== id) : [...p.list, id] }))
      toast(on ? 'Retiré de Ma liste' : 'Ajouté à Ma liste', 'ok')
      if (rid) apiPost('/api/me?action=toggle-list', { profileId: rid, titleId: id, remove: on })
    },
    progress: (id, s, season, episode) => {
      if (!session) return
      const sec = Math.max(0, Math.floor(s))
      upd(p => ({
        ...p,
        hist: { ...p.hist, [id]: sec },
        ...(season && episode ? { epHist: { ...p.epHist, [`${id}:${season}:${episode}`]: sec } } : {})
      }))
      if (rid) apiPost('/api/me?action=progress', { profileId: rid, titleId: id, positionSec: sec })
    },
    removeHistory: id => {
      if (!requireAuth('modifier votre historique')) return
      upd(p => {
        const next = { ...p.hist }
        delete next[id]
        return { ...p, hist: next }
      })
      if (rid) apiPost('/api/me?action=remove-history', { profileId: rid, titleId: id })
      toast('Retiré de l’historique.', 'info')
    },
    clearHistory: () => {
      if (!requireAuth('effacer votre historique')) return
      upd(p => ({ ...p, hist: {}, epHist: {} }))
      if (rid) apiPost('/api/me?action=remove-history', { profileId: rid })
      toast('Historique effacé.', 'info')
    },
    rate: (id, r) => {
      if (!requireAuth('évaluer un titre')) return
      const val = profile.rate?.[id] === r ? '' : r
      upd(p => ({ ...p, rate: { ...p.rate, [id]: val } }))
      if (val) toast(val === 'love' ? 'Noté « J’adore »' : val === 'like' ? 'Noté « J’aime »' : 'Nous proposerons moins ce genre', 'ok')
      if (rid) apiPost('/api/me?action=rate', { profileId: rid, titleId: id, value: val })
    },
    addProfile: async (name, kid, avatar, pin) => {
      if (!requireAuth('créer un profil')) return
      const maxProfiles = PLANS.find(p => p.id === st.plan)?.profiles || 2
      if (st.profiles.length >= maxProfiles) {
        toast(`Votre formule permet ${maxProfiles} profils maximum. Passez à Premium ou Famille.`, 'err')
        return
      }
      const res = await apiPost<{ id: string; has_pin?: boolean }>('/api/me?action=add-profile', { name, isKid: kid, avatar, pin: pin || undefined })
      if (res.ok && res.data.id) {
        setSt(s => ({ ...s, profiles: [...s.profiles, { id: res.data.id, name, avatar, kid, hasPin: !!res.data.has_pin, list: [], hist: {}, epHist: {}, rate: {} }] }))
        toast(`Profil « ${name} » créé.`, 'ok')
      } else {
        toast(res.data.error || 'Impossible de créer le profil.', 'err')
      }
    },
    updateProfile: async (id, patch) => {
      if (!requireAuth('modifier un profil')) return
      if (/^[0-9a-f-]{36}$/i.test(id)) {
        const res = await apiPost('/api/me?action=update-profile', {
          id,
          patch: {
            ...(patch.name !== undefined ? { name: patch.name } : {}),
            ...(patch.kid !== undefined ? { kid: patch.kid } : {}),
            ...(patch.avatar !== undefined ? { avatar: patch.avatar } : {}),
            ...(patch.pin !== undefined ? { pin: patch.pin } : {})
          }
        })
        if (!res.ok) { toast(res.data.error || 'Impossible de mettre à jour le profil.', 'err'); return }
      }
      setSt(s => ({
        ...s,
        profiles: s.profiles.map(p => p.id === id ? {
          ...p,
          name: patch.name ?? p.name,
          kid: patch.kid ?? p.kid,
          avatar: patch.avatar ?? p.avatar,
          hasPin: patch.pin === undefined ? p.hasPin : Boolean(patch.pin)
        } : p)
      }))
      toast('Profil mis à jour.', 'ok')
    },
    deleteProfile: async id => {
      if (!requireAuth('supprimer un profil')) return
      if (st.profiles.length <= 1) {
        toast('Vous devez conserver au moins un profil.', 'err')
        return
      }
      setSt(s => {
        const next = s.profiles.filter(p => p.id !== id)
        return { ...s, profiles: next, cur: s.cur === id ? next[0].id : s.cur }
      })
      if (/^[0-9a-f-]{36}$/i.test(id)) {
        await apiPost('/api/me?action=delete-profile', { id })
      }
      toast('Profil supprimé.', 'info')
    },
    selectProfile: id => {
      if (!requireAuth('changer de profil')) return
      setSt(s => ({ ...s, cur: id }))
      const p = st.profiles.find(x => x.id === id)
      if (p) toast(`Profil actif : ${p.name}`, 'ok')
    },
    verifyProfilePin: async (profileId, pin) => {
      const p = st.profiles.find(x => x.id === profileId)
      if (!p?.hasPin) return true
      const res = await apiPost<{ valid?: boolean }>('/api/me?action=verify-pin', { profileId, pin })
      if (!res.ok) {
        if (res.status === 429) toast(res.data.error || 'Trop de tentatives PIN.', 'err')
        return false
      }
      return Boolean(res.data.valid)
    },
    applyVerifiedSubscription: (planId, billing, provider, reference, chargedAmount) => {
      const plan = PLANS.find(p => p.id === planId) || PLANS[1]
      const fallbackAmount = billing === 'year' ? plan.priceYear : plan.priceMonth
      const numericCharged = chargedAmount !== undefined && chargedAmount !== null
        ? Math.round(Number(chargedAmount) || fallbackAmount)
        : fallbackAmount
      const days = billing === 'year' ? 365 : 30
      const periodEnd = new Date(Date.now() + 86400000 * days).toISOString()
      const inv: Invoice = {
        id: reference,
        date: new Date().toISOString(),
        planId,
        planName: plan.name,
        billing,
        amountXof: numericCharged,
        provider,
        reference,
        status: 'paid'
      }
      setSt(s => ({
        ...s,
        plan: planId,
        billing,
        cancelAtPeriodEnd: false,
        periodEnd,
        invoices: s.invoices.some(i => i.reference === reference) ? s.invoices : [inv, ...s.invoices]
      }))
      toast(`Paiement vérifié (SUCCESS) — Kora ${plan.name} est activé !`, 'ok')
    },
    subscribePlan: async (planId, billing, provider, customerRef = '') => {
      if (!requireAuth('gérer votre abonnement')) return { ok: false, error: 'Connexion requise.' }
      const plan = PLANS.find(p => p.id === planId)!
      const amount = billing === 'year' ? plan.priceYear : plan.priceMonth
      const ref = `SIM-${Date.now().toString(36).toUpperCase()}`

      if (planId !== 'free' && !billingSimulation) {
        return { ok: false, error: 'Veuillez finaliser et vérifier le paiement SasPay (statut SUCCESS requis).' }
      }

      if (planId !== 'free' && billingSimulation) {
        const chk = await apiPost('/api/me?action=check-simulation')
        if (!chk.ok) {
          setBillingSimulation(false)
          toast(chk.data.error || 'Paiement requis pour activer cette formule.', 'err')
          return { ok: false, error: chk.data.error }
        }
      }

      const days = billing === 'year' ? 365 : 30
      const periodEnd = new Date(Date.now() + 86400000 * days).toISOString()
      const inv: Invoice | null = amount > 0 ? {
        id: ref,
        date: new Date().toISOString(),
        planId,
        planName: plan.name,
        billing,
        amountXof: 0,
        provider: `${provider} (simulation)`,
        reference: ref,
        status: 'paid'
      } : null
      setSt(s => ({
        ...s,
        plan: planId,
        billing,
        cancelAtPeriodEnd: false,
        periodEnd,
        invoices: inv ? [inv, ...s.invoices] : s.invoices
      }))
      toast(
        planId === 'free'
          ? 'Formule gratuite activée.'
          : `Kora ${plan.name} activé gratuitement (simulation) !`,
        'ok'
      )
      return { ok: true }
    },
    cancelSubscription: cancel => {
      if (!requireAuth('gérer votre abonnement')) return
      setSt(s => ({ ...s, cancelAtPeriodEnd: cancel }))
      toast(cancel ? 'Résiliation programmée en fin de période.' : 'Abonnement réactivé.', 'info')
    },
    updateAccount: async (name, country) => {
      if (!requireAuth('modifier votre compte')) return
      setSt(s => ({ ...s, accountName: name, accountCountry: country }))
      const res = await apiPost('/api/me?action=update-account', { name, country })
      if (!res.ok) { toast(res.data.error || 'Erreur de sauvegarde.', 'err'); return }
      toast('Informations du compte enregistrées.', 'ok')
    },
    revokeDevice: async deviceId => {
      if (!requireAuth('gérer vos appareils')) return
      setSt(s => ({ ...s, devices: s.devices.filter(d => d.id !== deviceId) }))
      if (/^[0-9a-f-]{36}$/i.test(deviceId)) {
        await apiPost('/api/me?action=revoke-device', { deviceId })
      }
      toast('Appareil déconnecté.', 'info')
    },
    markNotificationsRead: id => {
      if (!session) return
      setSt(s => ({
        ...s,
        notifications: s.notifications.map(n => (!id || n.id === id) ? { ...n, read: true } : n)
      }))
      apiPost('/api/me?action=read-notifications', { id })
    },
    addRecentSearch: q => {
      const clean = q.trim()
      if (!clean || clean.length < 2) return
      setSt(s => ({ ...s, recentSearches: [clean, ...s.recentSearches.filter(x => x.toLowerCase() !== clean.toLowerCase())].slice(0, 6) }))
    },
    submitReport: async (titleId, reason) => {
      if (!requireAuth('signaler un contenu')) return false
      const clean = reason.trim()
      if (!clean) return false
      const res = await apiPost('/api/me?action=report', { titleId, reason: clean })
      if (!res.ok) { toast(res.data.error || 'Erreur d’envoi.', 'err'); return false }
      toast('Signalement transmis à l’équipe Kora. Merci.', 'ok')
      return true
    },
    setTheme: theme => setSt(s => ({ ...s, theme })),
    set: p => {
      if (!session) return
      setSt(s => ({ ...s, ...p }))
    }
  }

  return <C.Provider value={v}>{children}</C.Provider>
}
