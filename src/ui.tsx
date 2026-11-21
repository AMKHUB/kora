import { ReactNode, useEffect, useRef, useState } from 'react'
import { AVATARS, Item, Profile, useApp } from './store'

// Pictogrammes alignés sur brand/pictogrammes/ (Lucide, stroke-width 1.75, round caps)
const ICONS: Record<string, ReactNode> = {
  play: <path fill="currentColor" stroke="none" d="M6.5 4.8a1.4 1.4 0 0 1 2.1-1.2l11.2 6.8a1.4 1.4 0 0 1 0 2.4L8.6 19.6a1.4 1.4 0 0 1-2.1-1.2z" />,
  pause: <><rect x="6" y="4" width="4" height="16" rx="1" fill="currentColor" stroke="none" /><rect x="14" y="4" width="4" height="16" rx="1" fill="currentColor" stroke="none" /></>,
  plus: <path d="M12 5v14M5 12h14" />,
  check: <path d="M5 12.5 9.5 17 19 7.5" />,
  info: <><circle cx="12" cy="12" r="9.5" /><path d="M12 11v5M12 8h.01" /></>,
  search: <><circle cx="11" cy="11" r="7.5" /><path d="m21 21-4.35-4.35" /></>,
  home: <><path d="M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8" /><path d="M3 10a2 2 0 0 1 .7-1.5l7-6a2 2 0 0 1 2.6 0l7 6A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /></>,
  grid: <><rect x="3" y="3" width="7.5" height="7.5" rx="1.5" /><rect x="13.5" y="3" width="7.5" height="7.5" rx="1.5" /><rect x="3" y="13.5" width="7.5" height="7.5" rx="1.5" /><rect x="13.5" y="13.5" width="7.5" height="7.5" rx="1.5" /></>,
  list: <path d="M17 3a2 2 0 0 1 2 2v15a1 1 0 0 1-1.5.87L13 18.3a2 2 0 0 0-2 0l-4.5 2.57A1 1 0 0 1 5 20V5a2 2 0 0 1 2-2z" />,
  user: <><circle cx="12" cy="8.5" r="4" /><path d="M4.5 20.5a7.5 7.5 0 0 1 15 0" /></>,
  back: <path d="m15 6-6 6 6 6" />,
  share: <><path d="M4 12v7a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7" /><path d="M16 6l-4-4-4 4M12 2v13" /></>,
  down: <><path d="M12 3v12m-5-4 5 5 5-5" /><path d="M4 20h16" /></>,
  full: <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />,
  gear: <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h.01a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51h.01a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v.01a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" /></>,
  volume: <><path d="M11 5 6 9H2v6h4l5 4z" /><path d="M15.5 8.5a5 5 0 0 1 0 7M19 5a9.5 9.5 0 0 1 0 14" /></>,
  mute: <><path d="M11 5 6 9H2v6h4l5 4z" /><path d="m22 9-6 6M16 9l6 6" /></>,
  captions: <><rect x="2" y="5" width="20" height="14" rx="2" /><path d="M7 15h4M15 15h2M7 11h2M13 11h4" /></>,
  pip: <><rect x="2" y="4" width="20" height="16" rx="2" /><rect x="12" y="12" width="7" height="5" rx="1" fill="currentColor" stroke="none" /></>,
  bell: <><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 0 1-3.46 0" /></>,
  flag: <><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" /><path d="M4 22v-7" /></>,
  lock: <><rect x="4" y="11" width="16" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></>,
  shield: <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />,
  sun: <><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2m-7.07-2.93 1.41-1.41m11.32-11.32 1.41-1.41M2 12h2M20 12h2m-2.93 7.07-1.41-1.41M6.34 6.34 4.93 4.93" /></>,
  moon: <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />,
  film: <><rect x="2" y="3" width="20" height="18" rx="2" /><path d="M7 3v18M17 3v18M2 9h5M2 15h5M17 9h5M17 15h5" /></>,
  tv: <><rect x="2" y="3" width="20" height="14" rx="2" /><path d="M7 21h10" /></>,
  chevL: <path d="m15 18-6-6 6-6" />,
  chevR: <path d="m9 18 6-6-6-6" />,
  close: <path d="M18 6 6 18M6 6l12 12" />,
  card: <><rect x="2" y="5" width="20" height="14" rx="2" /><path d="M2 10h20" /></>,
  trash: <><path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14" /></>,
  sparkles: <path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z" />,
  sliders: <><path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6" /></>,
  crown: <path d="M3 18h18l-2-10-4.5 4L12 5l-2.5 7L5 8z" />,
  device: <><rect x="3" y="4" width="18" height="12" rx="2" /><path d="M8 20h8M12 16v4" /></>,
  upload: <><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><path d="m17 8-5-5-5 5M12 3v12" /></>,
  studio: <><path d="m12.3 3.5 3 4" /><path d="M20.2 6 3 11l-.9-2.4c-.3-1.1.3-2.2 1.3-2.5l13.5-4c1.1-.3 2.2.3 2.5 1.3z" /><path d="M3 11h18v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /><path d="m6.2 5.3 3.1 3.9" /></>,
  image: <><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="9" cy="9" r="2" /><path d="m21 15-3.5-3.5a2 2 0 0 0-2.8 0L6 21" /></>,
  edit: <><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" /></>
}

export const Icon = ({ n, s = 20 }: { n: string; s?: number }) => (
  <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {ICONS[n] || ICONS.info}
  </svg>
)

// Symbole K officiel (brand/logos/svg/symbole-sombre.svg)
// Règle non négociable #3 : en dessous de 24 px, afficher le symbole K seul sans le nom Kora.
export const KoraSymbol = ({ size = 28, monochrome }: { size?: number; monochrome?: 'dark' | 'light' }) => {
  const green = monochrome === 'dark' ? '#16140F' : monochrome === 'light' ? '#EDEBE4' : '#2F9E3C'
  const gold = monochrome === 'dark' ? '#16140F' : monochrome === 'light' ? '#EDEBE4' : '#F2C334'
  const red = monochrome === 'dark' ? '#16140F' : monochrome === 'light' ? '#EDEBE4' : '#DE1310'
  return (
    <svg width={size} height={size} viewBox="0 0 8 8" role="img" aria-label="Kora">
      <path d="M1.6 1.2H3V6.8H1.6Z" fill={green} />
      <path d="M5.8 1.2C5.8 2.746 4.546 4 3 4V2.7C3.828 2.7 4.5 2.028 4.5 1.2Z" fill={gold} />
      <path d="M3 4H4.6L6.6 6.8H5Z" fill={red} />
    </svg>
  )
}

// Logo horizontal officiel (brand/logos/svg/horizontal-sombre.svg & horizontal-noir.svg)
// Règle #1 : versions sombres sur #16140F et #000000
// Règle #2 : sur fond clair, horizontal-noir (monochrome noir) — JAMAIS crème #EDEBE4 sur clair
// Règle #3 : en dessous de 24 px, symbole K seul sans le nom Kora
export function BrandLogo({ height = 36, forceDark }: { height?: number; forceDark?: boolean }) {
  const { st } = useApp()
  const isLight = !forceDark && st.theme === 'light'
  if (height < 24) {
    return <KoraSymbol size={height} monochrome={isLight ? 'dark' : undefined} />
  }
  return (
    <span className="kora-brand-lockup" style={{ height }}>
      <KoraSymbol size={Math.round(height * 0.92)} monochrome={isLight ? 'dark' : undefined} />
      <span className="kora-wordmark" style={{ fontSize: Math.round(height * 0.72), color: isLight ? '#16140F' : '#EDEBE4' }}>
        Kora
      </span>
    </span>
  )
}

export function ProfileAvatar({ profile, size = 36 }: { profile: Pick<Profile, 'name' | 'avatar' | 'kid'>; size?: number }) {
  const av = AVATARS.find(a => a.id === profile.avatar) || AVATARS[0]
  const initials = (profile.name || 'K').trim().slice(0, 2).toUpperCase()
  return (
    <span
      className="avatar"
      style={{
        width: size,
        height: size,
        background: av.bg,
        color: av.fg,
        borderColor: av.ring,
        fontSize: Math.round(size * 0.38)
      }}
      aria-hidden="true"
    >
      {initials}
    </span>
  )
}

// Affiches cinématographiques illustrées (thèmes Sahel, Djenné, Fleuve Niger, Bogolan, Nuits de Bamako, Cinéma d'or)
// Utilisées lorsqu'aucune affiche réelle (poster_url) n'est encore chargée depuis Supabase Storage.
const ART_PALETTES = [
  { sky1: '#231A10', sky2: '#5B3915', accent: '#F2C334', warm: '#C66B2B', deep: '#16140F' }, // Or du Mandé / Ségou
  { sky1: '#141724', sky2: '#2D273B', accent: '#F2C334', warm: '#D95436', deep: '#11100D' }, // Nuits de Bamako
  { sky1: '#12221D', sky2: '#234436', accent: '#E8B84B', warm: '#2F9E3C', deep: '#0E1714' }, // Fleuve Bani / Vert
  { sky1: '#291815', sky2: '#68301E', accent: '#F2C334', warm: '#DE1310', deep: '#17100E' }, // Terre rouge Sahel
  { sky1: '#1C1B17', sky2: '#3B3424', accent: '#E6BC5A', warm: '#906D03', deep: '#14120E' }, // Manuscrits / Patrimoine
  { sky1: '#161D26', sky2: '#2C4257', accent: '#F2C334', warm: '#D47B3A', deep: '#10141A' }  // Océan / Dakar / Lagos
]

export function Poster({ item, wide }: { item: Item; wide?: boolean }) {
  const pal = ART_PALETTES[item.id % ART_PALETTES.length]
  const scene = item.id % 6
  const gid = `g-${item.id}-${wide ? 'w' : 'p'}`
  const imgSrc = wide ? (item.backdrop || item.poster) : item.poster

  return (
    <div className={'poster' + (wide ? ' wide' : '')}>
      <svg viewBox={wide ? '0 0 640 360' : '0 0 240 360'} preserveAspectRatio="xMidYMid slice" aria-hidden="true">
        <defs>
          <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={pal.sky1} />
            <stop offset="62%" stopColor={pal.sky2} />
            <stop offset="100%" stopColor={pal.deep} />
          </linearGradient>
          <radialGradient id={gid + 'r'} cx="68%" cy="32%" r="55%">
            <stop offset="0%" stopColor={pal.accent} stopOpacity="0.45" />
            <stop offset="100%" stopColor={pal.accent} stopOpacity="0" />
          </radialGradient>
        </defs>
        <rect width="100%" height="100%" fill={`url(#${gid})`} />
        <rect width="100%" height="100%" fill={`url(#${gid}r)`} />

        {wide ? (
          <>
            {/* Composition cinématique 16:9 */}
            {scene === 0 && (
              <>
                <circle cx="460" cy="115" r="56" fill={pal.accent} opacity="0.88" />
                {/* Silhouette architecturale soudano-sahélienne (Djenné/Ségou) */}
                <path d="M270 280V170l14-26 14 26v110h16V150l16-34 16 34v130h20V126l22-46 22 46v154h18V160l14-28 14 28v120h24V185l12-22 12 22v95h90v80H220v-80z" fill={pal.deep} opacity="0.88" />
                <path d="M0 282 Q160 264 320 282 T640 278 V360 H0Z" fill={pal.deep} />
                <g stroke={pal.accent} strokeOpacity="0.35" strokeWidth="1.5">
                  <line x1="362" y1="150" x2="414" y2="150" />
                  <line x1="358" y1="175" x2="418" y2="175" />
                  <line x1="354" y1="200" x2="422" y2="200" />
                </g>
              </>
            )}
            {scene === 1 && (
              <>
                <circle cx="490" cy="105" r="44" fill={pal.accent} opacity="0.82" />
                {/* Lumières de ville & ondes radio / Bamako */}
                <g fill="none" stroke={pal.accent} strokeOpacity="0.28" strokeWidth="2">
                  <circle cx="490" cy="105" r="78" />
                  <circle cx="490" cy="105" r="118" />
                  <circle cx="490" cy="105" r="160" />
                </g>
                <path d="M0 275h70v-45h42v45h28v-68h50v68h36v-36h48v36h56v-86h54v86h44v-54h66v54h86v85H0z" fill={pal.deep} opacity="0.9" />
                <g fill={pal.accent} opacity="0.7">
                  <rect x="155" y="220" width="8" height="10" /><rect x="172" y="220" width="8" height="10" />
                  <rect x="345" y="206" width="9" height="12" /><rect x="364" y="206" width="9" height="12" />
                  <rect x="466" y="236" width="8" height="10" /><rect x="484" y="236" width="8" height="10" />
                </g>
              </>
            )}
            {scene === 2 && (
              <>
                <circle cx="430" cy="126" r="52" fill={pal.accent} opacity="0.9" />
                {/* Fleuve & pirogue */}
                <path d="M0 218 Q180 198 340 220 T640 210 V360 H0Z" fill={pal.deep} opacity="0.82" />
                <path d="M360 222 Q430 214 500 222 L485 232 Q430 236 375 232 Z" fill={pal.warm} />
                <g stroke={pal.accent} strokeOpacity="0.45" strokeWidth="2">
                  <line x1="380" y1="252" x2="480" y2="252" />
                  <line x1="355" y1="270" x2="505" y2="270" />
                  <line x1="395" y1="288" x2="465" y2="288" />
                </g>
              </>
            )}
            {scene === 3 && (
              <>
                <circle cx="480" cy="130" r="64" fill={pal.warm} opacity="0.7" />
                <circle cx="480" cy="130" r="38" fill={pal.accent} opacity="0.9" />
                {/* Dunes & route du Sahel */}
                <path d="M0 250 Q160 190 340 235 T640 215 V360 H0Z" fill={pal.deep} opacity="0.78" />
                <path d="M0 295 Q210 250 430 286 T640 270 V360 H0Z" fill={pal.deep} />
              </>
            )}
            {scene === 4 && (
              <>
                {/* Cordes de kora dorées & motif bogolan */}
                <g stroke={pal.accent} strokeOpacity="0.32" strokeWidth="1.5">
                  {[0, 1, 2, 3, 4, 5, 6].map(n => <line key={n} x1={320 + n * 38} y1="0" x2={240 + n * 38} y2="360" />)}
                </g>
                <circle cx="470" cy="180" r="96" fill="none" stroke={pal.accent} strokeOpacity="0.35" strokeWidth="2" />
                <circle cx="470" cy="180" r="56" fill={pal.accent} opacity="0.22" />
                <path d="M0 280h640v80H0z" fill={pal.deep} opacity="0.88" />
              </>
            )}
            {scene === 5 && (
              <>
                {/* Baobab du crépuscule */}
                <circle cx="470" cy="135" r="62" fill={pal.accent} opacity="0.85" />
                <path d="M445 270 C445 225 452 195 440 165 C418 158 390 162 378 148 C400 132 426 140 446 146 C444 126 436 112 454 106 C468 112 468 130 472 146 C495 136 520 130 542 146 C528 160 502 158 486 168 C478 198 484 228 492 270 Z" fill={pal.deep} />
                <path d="M0 268 Q220 254 440 268 T640 260 V360 H0Z" fill={pal.deep} />
              </>
            )}
          </>
        ) : (
          <>
            {/* Composition affiche 2:3 */}
            <circle cx={scene % 2 === 0 ? 120 : 155} cy={104} r={scene === 3 ? 52 : 44} fill={pal.accent} opacity="0.88" />
            {scene === 0 && <path d="M24 238V172l14-24 14 24v66h18V148l16-30 16 30v90h18V130l20-38 20 38v108h18V166l14-24 14 24v72h34v122H0V238z" fill={pal.deep} opacity="0.92" />}
            {scene === 1 && (
              <>
                <g fill="none" stroke={pal.accent} strokeOpacity="0.3" strokeWidth="1.5">
                  <circle cx="155" cy="104" r="64" /><circle cx="155" cy="104" r="92" />
                </g>
                <path d="M0 242h44v-36h34v36h26v-54h40v54h28v-28h36v28h32v118H0z" fill={pal.deep} opacity="0.92" />
              </>
            )}
            {scene === 2 && (
              <>
                <path d="M0 214 Q80 198 140 216 T240 208 V360 H0Z" fill={pal.deep} opacity="0.9" />
                <path d="M68 214 Q120 206 172 214 L160 224 Q120 228 80 224 Z" fill={pal.warm} />
              </>
            )}
            {scene === 3 && (
              <>
                <path d="M0 226 Q75 180 155 218 T240 206 V360 H0Z" fill={pal.deep} opacity="0.84" />
                <path d="M0 258 Q110 226 240 250 V360 H0Z" fill={pal.deep} />
              </>
            )}
            {scene === 4 && (
              <>
                <g stroke={pal.accent} strokeOpacity="0.35" strokeWidth="1.4">
                  {[0, 1, 2, 3, 4].map(n => <line key={n} x1={40 + n * 40} y1="0" x2={20 + n * 40} y2="360" />)}
                </g>
                <path d="M0 245h240v115H0z" fill={pal.deep} opacity="0.92" />
              </>
            )}
            {scene === 5 && (
              <>
                <path d="M98 238 C100 198 106 176 96 154 C76 148 56 150 48 138 C64 126 86 132 102 138 C100 120 96 108 112 104 C124 110 122 124 126 138 C144 130 166 126 184 138 C172 150 150 148 136 158 C130 182 136 204 142 238 Z" fill={pal.deep} />
                <path d="M0 236 Q120 224 240 236 V360 H0Z" fill={pal.deep} />
              </>
            )}
            {/* Bandeau bas Bogolan discret */}
            <g stroke={pal.accent} strokeOpacity="0.22" strokeWidth="1.2">
              <line x1="16" y1="252" x2="224" y2="252" />
            </g>
          </>
        )}
      </svg>

      {imgSrc && <img src={imgSrc} alt="" loading="lazy" />}
      {!wide && !imgSrc && (
        <div className="poster-caption">
          {item.badge && <span className="poster-tag">{item.badge}</span>}
          <span className="pt">{item.title}</span>
          <span className="poster-sub">{item.country} · {item.year}</span>
        </div>
      )}
    </div>
  )
}

export const Meta = ({ i }: { i: Item }) => (
  <>{i.country} · {i.year} · {i.genres[0] || 'Cinéma'} · {i.age}</>
)

export function Card({ item, rank, progressSec }: { item: Item; rank?: number; progressSec?: number }) {
  const pct = progressSec && item.dur ? Math.min(98, Math.max(4, Math.round((progressSec / (item.dur * 60)) * 100))) : 0
  return (
    <a className={'card' + (rank ? ' ranked' : '')} href={`#/titre/${item.id}`}>
      {rank && <span className="rank-num" aria-label={`Numéro ${rank}`}>{rank}</span>}
      <div className="card-media">
        <Poster item={item} />
        {item.quality === '4K' && <span className="q-badge">4K</span>}
        {item.badge && !rank && <span className="card-tag">{item.badge}</span>}
        <div className="card-hover-veil" aria-hidden="true">
          <span className="card-play"><Icon n="play" s={16} /></span>
          <span className="card-hover-meta">
            <strong>{item.title}</strong>
            <small>{item.year} · {item.age} · {item.genres[0] || 'Cinéma'}</small>
          </span>
        </div>
        {pct > 0 && (
          <span className="card-prog" aria-label={`Regardé à ${pct} %`}>
            <span style={{ width: `${pct}%` }} />
          </span>
        )}
      </div>
      <div className="card-info">
        <b>{item.title}</b>
        <small><Meta i={item} /></small>
      </div>
    </a>
  )
}

export function Row({ title, ids, ranked, showProgress, action }: {
  title: string
  ids: number[]
  ranked?: boolean
  showProgress?: boolean
  action?: { label: string; href: string }
}) {
  const { byId, profile } = useApp()
  const scroller = useRef<HTMLDivElement>(null)
  const list = ids.map(byId).filter(Boolean) as Item[]
  if (!list.length) return null

  const nudge = (dir: number) => {
    const el = scroller.current
    if (el) el.scrollBy({ left: dir * Math.max(360, el.clientWidth * 0.78), behavior: 'smooth' })
  }

  return (
    <section className="rowsec">
      <div className="row-head">
        <h2>
          {title}
          {action && <a className="row-more" href={action.href}>{action.label} ›</a>}
        </h2>
      </div>
      <div className="row-wrap">
        <button type="button" className="row-paddle left" onClick={() => nudge(-1)} aria-label={`Défiler ${title} vers la gauche`}>
          <Icon n="chevL" s={24} />
        </button>
        <div className="row" ref={scroller}>
          {list.map((i, idx) => (
            <Card
              key={i.id}
              item={i}
              rank={ranked ? idx + 1 : undefined}
              progressSec={showProgress ? profile.hist[i.id] : undefined}
            />
          ))}
        </div>
        <button type="button" className="row-paddle right" onClick={() => nudge(1)} aria-label={`Défiler ${title} vers la droite`}>
          <Icon n="chevR" s={24} />
        </button>
      </div>
    </section>
  )
}

export function Modal({ open, onClose, title, children, maxWidth = 480 }: {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
  maxWidth?: number
}) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    addEventListener('keydown', onKey)
    return () => removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null
  return (
    <div className="modal-backdrop" onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={title} style={{ maxWidth }}>
        <div className="modal-head">
          <h2>{title}</h2>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Fermer"><Icon n="close" s={18} /></button>
        </div>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  )
}

export function PinModal({ profile, onCancel, onSuccess }: {
  profile: Profile | null
  onCancel: () => void
  onSuccess: () => void
}) {
  const { verifyProfilePin } = useApp()
  const [pin, setPin] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => { setPin(''); setErr('') }, [profile?.id])

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!profile) return
    setBusy(true); setErr('')
    const ok = await verifyProfilePin(profile.id, pin)
    setBusy(false)
    if (ok) onSuccess()
    else { setErr('Code PIN incorrect.'); setPin('') }
  }

  return (
    <Modal open={!!profile} onClose={onCancel} title={`Déverrouiller ${profile?.name || ''}`} maxWidth={380}>
      <form className="pin-form" onSubmit={submit}>
        <p className="mu">Saisissez le code PIN à 4 chiffres pour accéder à ce profil.</p>
        <input
          className="field pin-input"
          type="password"
          inputMode="numeric"
          maxLength={4}
          autoFocus
          value={pin}
          onChange={e => setPin(e.target.value.replace(/\D/g, ''))}
          placeholder="••••"
          aria-label="Code PIN à 4 chiffres"
        />
        {err && <p className="err-msg" role="alert">{err}</p>}
        <div className="btns">
          <button type="button" className="btn" onClick={onCancel}>Annuler</button>
          <button type="submit" className="btn p" disabled={busy || pin.length < 4}>Valider</button>
        </div>
      </form>
    </Modal>
  )
}

export function ToastHost() {
  const { toasts, dismissToast } = useApp()
  if (!toasts.length) return null
  return (
    <div className="toast-host" role="status" aria-live="polite">
      {toasts.map(t => (
        <div key={t.id} className={'toast ' + (t.kind || 'info')}>
          <span>{t.msg}</span>
          <button type="button" onClick={() => dismissToast(t.id)} aria-label="Fermer la notification"><Icon n="close" s={14} /></button>
        </div>
      ))}
    </div>
  )
}

export function MaintenancePage({
  message,
  isAdmin = false,
  isPreview = false,
  studio = false,
  onDisable,
  onLoginClick
}: {
  message?: string
  isAdmin?: boolean
  isPreview?: boolean
  studio?: boolean
  onDisable?: () => void
  onLoginClick?: () => void
}) {
  return (
    <div className="maint-stage">
      <div className="maint-card">
        <div className="maint-halo" aria-hidden="true">
          <svg width="96" height="96" viewBox="0 0 96 96" fill="none">
            <circle cx="48" cy="48" r="44" stroke="#F2C334" strokeOpacity="0.24" strokeWidth="1.5" strokeDasharray="5 5" />
            <circle cx="48" cy="48" r="34" fill="#201C14" stroke="#F2C334" strokeOpacity="0.55" strokeWidth="1.5" />
            <g transform="translate(30, 30)">
              <rect x="4.5" y="4.5" width="7" height="27" rx="3.5" fill="#2F9E3C" />
              <path d="M 15 17.5 L 28.5 29" stroke="#DE1310" strokeWidth="7" strokeLinecap="round" />
              <path d="M 13.5 18 Q 16 11 28.5 7" stroke="#F2C334" strokeWidth="7" strokeLinecap="round" fill="none" />
            </g>
          </svg>
        </div>

        <span className="pill-accent">
          {isPreview ? 'Aperçu administrateur · Page de maintenance' : 'Intervention programmée · Kora'}
        </span>

        <h1>Kora prépare votre prochaine séance</h1>

        <p className="maint-msg">
          {message || 'Nous effectuons une mise à jour pour améliorer votre expérience cinéma sur Kora. Le service sera de retour très bientôt.'}
        </p>

        <div className="maint-pillars">
          <div>
            <strong>Catalogue préservé</strong>
            <small className="mu">Vos séries, votre liste et vos profils restent intacts.</small>
          </div>
          <div>
            <strong>Streaming & Audio</strong>
            <small className="mu">Optimisation de la diffusion vidéo et des sous-titres.</small>
          </div>
          <div>
            <strong>Retour imminent</strong>
            <small className="mu">Merci pour votre patience et votre fidélité.</small>
          </div>
        </div>

        <div className="btns" style={{ justifyContent: 'center' }}>
          <button type="button" className="btn p" onClick={() => location.reload()}>
            Actualiser l’état du service
          </button>
          {isAdmin && onDisable && (
            <button type="button" className="btn" onClick={onDisable}>
              <Icon n="check" s={18} />Désactiver la maintenance (Ouvrir le site)
            </button>
          )}
          {isPreview && (
            <a className="btn" href={studio ? '/studio/' : '#/admin'}>
              Retour à l’espace administrateur
            </a>
          )}
        </div>

        {!isAdmin && (
          <p className="mu" style={{ fontSize: '0.82rem', marginTop: 8 }}>
            {onLoginClick ? (
              <button type="button" className="lnk small-lnk" onClick={onLoginClick}>Accès équipe & administrateur</button>
            ) : (
              <a className="lnk small-lnk" href="#/connexion">Accès équipe & administrateur</a>
            )}
          </p>
        )}
      </div>
    </div>
  )
}
