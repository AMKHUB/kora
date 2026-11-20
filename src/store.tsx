import { createContext, useContext, useEffect, useState, useCallback, ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { sb } from './supabase'
import { IS_BILLING_SIMULATION, processPaymentCheckout } from './billing'

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
  pinHash?: string
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

const TYPES: Record<string, Item['type']> = { film: 'film', series: 'serie', doc: 'doc', short: 'court' }

function buildCatalogFromItems(items: Item[]): Catalog {
  const ids = (f: (i: Item) => boolean) => items.filter(f).map(i => i.id)
  const flag = (k: 'isTrending' | 'isNew' | 'isExclusive'): number[] => items.filter(t => t[k]).map(t => t.id)
  const trending = flag('isTrending')
  const excl = flag('isExclusive')
  const news = flag('isNew')
  const heroes = [...new Set([...excl, ...trending, ...items.map(i => i.id)])].slice(0, 5)
  return {
    items,
    hero: heroes[0] || items[0]?.id || 0,
    heroes,
    rows: {
      top10: [...new Set([...trending, ...excl, ...news, ...items.map(i => i.id)])].slice(0, 10),
      trending: trending.length ? trending : ids(i => i.country === 'Mali'),
      new: news.length ? news : ids(i => i.year >= 2024),
      malifilms: ids(i => i.country === 'Mali' && i.type === 'film'),
      series: ids(i => i.type === 'serie'),
      africa: ids(i => i.country !== 'Mali'),
      docs: ids(i => i.type === 'doc'),
      shorts: ids(i => i.type === 'court'),
      discover: ids(i => i.country !== 'Mali' && i.type === 'film'),
      classics: ids(i => i.year < 2000),
      pick: ids(i => !trending.includes(i.id)).slice(0, 8)
    }
  }
}

// Charge uniquement les œuvres publiées qui possèdent une vraie page de couverture (poster_url)
async function loadCatalog(): Promise<Catalog> {
  if (sb) {
    const { data, error } = await sb.from('titles')
      .select('id,type,title,synopsis_short,synopsis_long,year,duration_min,country,age_rating,poster_url,backdrop_url,trailer_url,is_trending,is_new,is_exclusive,title_genres(genres(name)),title_people(role,position,people(name)),title_languages(kind,languages(name)),seasons(number,episodes(id,number,title,synopsis,duration_min,intro_end_sec))')
      .eq('status', 'published')
      .not('poster_url', 'is', null)
      .neq('poster_url', '')
      .order('id', { ascending: false })
    if (!error) {
      const items: Item[] = (data || [])
        .filter((t: any) => typeof t.poster_url === 'string' && t.poster_url.trim().length > 0)
        .map((t: any) => {
          const episodesBySeason: Record<number, Episode[]> = {}
          for (const s of (t.seasons || [])) {
            const eps = (s.episodes || []).slice().sort((a: any, b: any) => a.number - b.number)
            if (eps.length) episodesBySeason[s.number] = eps
          }
          const langs = (t.title_languages || []).filter((x: any) => x.kind === 'audio' && x.languages?.name).map((x: any) => x.languages.name)
          const subtitles = (t.title_languages || []).filter((x: any) => x.kind === 'subtitle' && x.languages?.name).map((x: any) => x.languages.name)
          return {
            id: t.id,
            title: t.title,
            type: TYPES[t.type] || 'serie',
            year: t.year || new Date().getFullYear(),
            country: t.country || 'Mali',
            age: t.age_rating || 'Tous',
            dur: t.duration_min || 45,
            synopsis: t.synopsis_long || t.synopsis_short || '',
            poster: t.poster_url,
            backdrop: t.backdrop_url || undefined,
            trailer: t.trailer_url || undefined,
            genres: (t.title_genres || []).map((x: any) => x.genres?.name).filter(Boolean),
            langs: langs.length ? langs : ['Français'],
            subtitles: subtitles.length ? subtitles : ['Français', 'English'],
            director: (t.title_people || []).find((x: any) => x.role === 'director')?.people?.name || '',
            cast: (t.title_people || []).filter((x: any) => x.role === 'actor').sort((a: any, b: any) => a.position - b.position).map((x: any) => x.people?.name).filter(Boolean),
            seasons: (t.seasons || []).length || undefined,
            episodesBySeason: Object.keys(episodesBySeason).length ? episodesBySeason : undefined,
            quality: t.is_exclusive ? '4K' : 'HD',
            hdr: !!t.is_exclusive,
            audioDesc: false,
            badge: t.is_exclusive ? 'Original Kora' : t.is_new ? 'Nouveauté' : undefined,
            isTrending: !!t.is_trending,
            isNew: !!t.is_new,
            isExclusive: !!t.is_exclusive
          }
        })
      return buildCatalogFromItems(items)
    }
  }
  const fb = await fetch('/api/catalog').then(r => r.json()).catch(() => ({ items: [] }))
  const withCovers: Item[] = (fb.items || []).filter((i: any) => typeof i.poster === 'string' && i.poster.trim().length > 0)
  return buildCatalogFromItems(withCovers)
}

type Ctx = {
  st: State
  profile: Profile
  cat: Catalog | null
  items: Item[]
  byId: (id: number) => Item | undefined
  session: Session | null
  authReady: boolean
  role: string
  isPremium: boolean
  unreadCount: number
  toasts: Toast[]
  toast: (msg: string, kind?: Toast['kind']) => void
  dismissToast: (id: number) => void
  requireAuth: (actionLabel?: string) => boolean
  signOut: () => void
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
  const [session, setSession] = useState<Session | null>(null)
  const [authReady, setAuthReady] = useState(!sb)
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

  useEffect(() => {
    if (!sb) { setAuthReady(true); return }
    sb.auth.getSession().then(({ data }) => { setSession(data.session); setAuthReady(true) })
    const { data } = sb.auth.onAuthStateChange((ev, s) => {
      setSession(s)
      setAuthReady(true)
      if (ev === 'PASSWORD_RECOVERY') {
        location.hash = '#/connexion?recovery=1'
      } else if (ev === 'SIGNED_OUT') {
        setRole('user')
        setSt(s0 => ({ ...init, theme: s0.theme }))
      }
    })
    return () => data.subscription.unsubscribe()
  }, [])

  // Synchronisation complète du compte Supabase connecté
  useEffect(() => {
    if (!sb || !session) return
    const db = sb, uid = session.user.id
    ;(async () => {
      const [acc, prof, list, prog, rat, sub, pay, dev, notif] = await Promise.all([
        db.from('accounts').select('role,name,country').eq('id', uid).maybeSingle(),
        db.from('profiles').select('id,name,avatar,is_kid,pin_hash,subtitle_lang,audio_lang,subtitle_size,autoplay_next').order('created_at'),
        db.from('my_list').select('profile_id,title_id'),
        db.from('watch_progress').select('profile_id,title_id,episode_id,position_sec'),
        db.from('ratings').select('profile_id,title_id,value'),
        db.from('subscriptions').select('plan_id,status,current_period_end,cancel_at_period_end').eq('status', 'active').order('id', { ascending: false }).limit(1),
        db.from('payments').select('id,amount_xof,provider,provider_ref,status,created_at').order('created_at', { ascending: false }).limit(20),
        db.from('devices').select('id,name,platform,last_seen_at,revoked_at').order('last_seen_at', { ascending: false }),
        db.from('notifications').select('id,title,body,kind,link,read_at,created_at').order('created_at', { ascending: false }).limit(20).then(r => r, () => ({ data: null }))
      ])

      setRole(acc.data?.role || 'user')
      const mine = (rows: any[] | null, p: string) => (rows || []).filter(x => x.profile_id === p)

      const curDev = detectDevice()
      const mappedDevices: DeviceInfo[] = (dev.data || [])
        .filter((d: any) => !d.revoked_at)
        .map((d: any) => ({ id: d.id, name: d.name, platform: d.platform || 'Web', lastSeen: d.last_seen_at, current: d.name === curDev.name }))
      if (!mappedDevices.length) {
        mappedDevices.push(curDev)
        db.from('devices').insert({ account_id: uid, name: curDev.name, platform: curDev.platform, last_seen_at: new Date().toISOString() }).then(() => {}, () => {})
      }

      const dbPlan = (sub.data?.[0]?.plan_id as PlanId) || 'free'
      const mappedInvoices: Invoice[] = (pay.data || []).map((p: any) => ({
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

      const mappedNotifs: AppNotification[] = (notif as any)?.data?.length
        ? (notif as any).data.map((n: any) => ({ id: String(n.id), title: n.title, body: n.body, kind: n.kind || 'info', link: n.link || undefined, read: !!n.read_at, date: n.created_at }))
        : []

      setSt(s => ({
        ...s,
        accountName: acc.data?.name || s.accountName,
        accountCountry: acc.data?.country || s.accountCountry || 'Mali',
        plan: dbPlan,
        cancelAtPeriodEnd: !!sub.data?.[0]?.cancel_at_period_end,
        periodEnd: sub.data?.[0]?.current_period_end || s.periodEnd,
        invoices: mappedInvoices,
        devices: mappedDevices,
        notifications: mappedNotifs,
        ...(prof.data?.length ? {
          cur: prof.data.some((p: any) => p.id === s.cur) ? s.cur : prof.data[0].id,
          subLang: prof.data[0].subtitle_lang || s.subLang,
          audioLang: prof.data[0].audio_lang || s.audioLang,
          subSize: (prof.data[0].subtitle_size as State['subSize']) || s.subSize,
          autoNext: prof.data[0].autoplay_next ?? s.autoNext,
          profiles: prof.data.map((p: any, idx: number) => ({
            id: p.id,
            name: p.name,
            avatar: p.avatar || AVATARS[idx % AVATARS.length].id,
            kid: !!p.is_kid,
            pinHash: p.pin_hash || undefined,
            list: mine(list.data, p.id).map(x => x.title_id),
            hist: Object.fromEntries(mine(prog.data, p.id).filter(x => x.episode_id === 0).map(x => [x.title_id, x.position_sec])),
            epHist: {},
            rate: Object.fromEntries(mine(rat.data, p.id).map(x => [x.title_id, x.value]))
          }))
        } : {})
      }))
    })()
  }, [session?.user.id])

  const profile = st.profiles.find(p => p.id === st.cur) || st.profiles[0]
  const rid = sb && session && /^[0-9a-f-]{36}$/.test(profile.id) ? profile.id : ''
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
    role,
    isPremium,
    unreadCount,
    toasts,
    toast,
    dismissToast,
    requireAuth,
    reloadCatalog,
    signOut: () => {
      sb?.auth.signOut()
      toast('Vous êtes déconnecté.', 'info')
      location.hash = '#/'
    },
    toggleList: id => {
      if (!requireAuth('ajouter un titre à Ma liste')) return
      const on = profile.list.includes(id)
      upd(p => ({ ...p, list: on ? p.list.filter(x => x !== id) : [...p.list, id] }))
      toast(on ? 'Retiré de Ma liste' : 'Ajouté à Ma liste', 'ok')
      if (rid) {
        ;(on
          ? sb!.from('my_list').delete().match({ profile_id: rid, title_id: id })
          : sb!.from('my_list').insert({ profile_id: rid, title_id: id })
        ).then(() => {}, () => {})
      }
    },
    progress: (id, s, season, episode) => {
      if (!session) return
      const sec = Math.max(0, Math.floor(s))
      upd(p => ({
        ...p,
        hist: { ...p.hist, [id]: sec },
        ...(season && episode ? { epHist: { ...p.epHist, [`${id}:${season}:${episode}`]: sec } } : {})
      }))
      if (rid) {
        sb!.from('watch_progress').upsert({
          profile_id: rid,
          title_id: id,
          episode_id: 0,
          position_sec: sec,
          updated_at: new Date().toISOString()
        }).then(() => {}, () => {})
      }
    },
    removeHistory: id => {
      if (!requireAuth('modifier votre historique')) return
      upd(p => {
        const next = { ...p.hist }
        delete next[id]
        return { ...p, hist: next }
      })
      if (rid) sb!.from('watch_progress').delete().match({ profile_id: rid, title_id: id }).then(() => {}, () => {})
      toast('Retiré de l’historique.', 'info')
    },
    clearHistory: () => {
      if (!requireAuth('effacer votre historique')) return
      upd(p => ({ ...p, hist: {}, epHist: {} }))
      if (rid) sb!.from('watch_progress').delete().eq('profile_id', rid).then(() => {}, () => {})
      toast('Historique effacé.', 'info')
    },
    rate: (id, r) => {
      if (!requireAuth('évaluer un titre')) return
      const val = profile.rate?.[id] === r ? '' : r
      upd(p => ({ ...p, rate: { ...p.rate, [id]: val } }))
      if (val) toast(val === 'love' ? 'Noté « J’adore »' : val === 'like' ? 'Noté « J’aime »' : 'Nous proposerons moins ce genre', 'ok')
      if (rid) {
        ;(val
          ? sb!.from('ratings').upsert({ profile_id: rid, title_id: id, value: val, updated_at: new Date().toISOString() })
          : sb!.from('ratings').delete().match({ profile_id: rid, title_id: id })
        ).then(() => {}, () => {})
      }
    },
    addProfile: async (name, kid, avatar, pin) => {
      if (!requireAuth('créer un profil')) return
      const maxProfiles = PLANS.find(p => p.id === st.plan)?.profiles || 2
      if (st.profiles.length >= maxProfiles) {
        toast(`Votre formule permet ${maxProfiles} profils maximum. Passez à Premium ou Famille.`, 'err')
        return
      }
      const pinHash = pin ? await hashPin(pin) : undefined
      if (sb && session) {
        const { data, error } = await sb.from('profiles')
          .insert({ account_id: session.user.id, name, is_kid: kid, avatar, pin_hash: pinHash || null, max_age: kid ? '7+' : '18+' })
          .select('id').single()
        if (!error && data) {
          setSt(s => ({ ...s, profiles: [...s.profiles, { id: data.id, name, avatar, kid, pinHash, list: [], hist: {}, epHist: {}, rate: {} }] }))
          toast(`Profil « ${name} » créé.`, 'ok')
          return
        }
        toast(error?.message || 'Impossible de créer le profil.', 'err')
      }
    },
    updateProfile: async (id, patch) => {
      if (!requireAuth('modifier un profil')) return
      const pinHash = patch.pin === null ? undefined : patch.pin ? await hashPin(patch.pin) : undefined
      setSt(s => ({
        ...s,
        profiles: s.profiles.map(p => p.id === id ? {
          ...p,
          name: patch.name ?? p.name,
          kid: patch.kid ?? p.kid,
          avatar: patch.avatar ?? p.avatar,
          pinHash: patch.pin === undefined ? p.pinHash : pinHash
        } : p)
      }))
      if (sb && session && /^[0-9a-f-]{36}$/.test(id)) {
        const dbPatch: Record<string, unknown> = {}
        if (patch.name !== undefined) dbPatch.name = patch.name
        if (patch.kid !== undefined) { dbPatch.is_kid = patch.kid; dbPatch.max_age = patch.kid ? '7+' : '18+' }
        if (patch.avatar !== undefined) dbPatch.avatar = patch.avatar
        if (patch.pin !== undefined) dbPatch.pin_hash = pinHash || null
        await sb.from('profiles').update(dbPatch).eq('id', id)
      }
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
      if (sb && session && /^[0-9a-f-]{36}$/.test(id)) {
        await sb.from('profiles').delete().eq('id', id)
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
      if (!p?.pinHash) return true
      if (p.pinHash.startsWith('raw:')) return p.pinHash === 'raw:' + pin.trim()
      const hashed = await hashPin(pin)
      return hashed === p.pinHash
    },
    subscribePlan: async (planId, billing, provider, customerRef = '') => {
      if (!requireAuth('gérer votre abonnement')) return { ok: false, error: 'Connexion requise.' }
      const plan = PLANS.find(p => p.id === planId)!
      const amount = billing === 'year' ? plan.priceYear : plan.priceMonth
      let ref = `SIM-${Date.now().toString(36).toUpperCase()}`

      if (planId !== 'free' && !IS_BILLING_SIMULATION) {
        const res = await processPaymentCheckout({
          planId,
          billing,
          provider: provider as 'Orange Money' | 'Moov Money' | 'Wave' | 'Carte bancaire',
          customerRef
        })
        if (!res.ok) {
          toast(res.error, 'err')
          return { ok: false, error: res.error }
        }
        ref = res.reference
      }

      const days = billing === 'year' ? 365 : 30
      const periodEnd = new Date(Date.now() + 86400000 * days).toISOString()
      const inv: Invoice | null = amount > 0 ? {
        id: ref,
        date: new Date().toISOString(),
        planId,
        planName: plan.name,
        billing,
        amountXof: IS_BILLING_SIMULATION ? 0 : amount,
        provider: IS_BILLING_SIMULATION ? `${provider} (simulation)` : provider,
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
          : IS_BILLING_SIMULATION
            ? `Kora ${plan.name} activé gratuitement (simulation) !`
            : `Kora ${plan.name} activé !`,
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
      if (sb && session) {
        const { error } = await sb.from('accounts').update({ name, country }).eq('id', session.user.id)
        if (error) { toast(error.message, 'err'); return }
      }
      toast('Informations du compte enregistrées.', 'ok')
    },
    revokeDevice: async deviceId => {
      if (!requireAuth('gérer vos appareils')) return
      setSt(s => ({ ...s, devices: s.devices.filter(d => d.id !== deviceId) }))
      if (sb && session && /^[0-9a-f-]{36}$/.test(deviceId)) {
        await sb.from('devices').update({ revoked_at: new Date().toISOString() }).eq('id', deviceId)
      }
      toast('Appareil déconnecté.', 'info')
    },
    markNotificationsRead: id => {
      if (!session) return
      setSt(s => ({
        ...s,
        notifications: s.notifications.map(n => (!id || n.id === id) ? { ...n, read: true } : n)
      }))
      if (sb && session) {
        const q = sb.from('notifications').update({ read_at: new Date().toISOString() }).eq('account_id', session.user.id)
        ;(id && /^\d+$/.test(id) ? q.eq('id', +id) : q.is('read_at', null)).then(() => {}, () => {})
      }
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
      if (sb && session) {
        const { error } = await sb.from('reports').insert({ account_id: session.user.id, title_id: titleId, reason: clean, status: 'open' })
        if (error) { toast(error.message, 'err'); return false }
      }
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
