import { useEffect, useRef, useState } from 'react'
import Hls from 'hls.js'
import { Episode, Item, useApp } from './store'
import { Icon, Meta, Poster } from './ui'
import { apiPost } from './api'

const fmt = (s: number) => {
  const sec = Math.max(0, Math.floor(s))
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  const x = sec % 60
  return (h ? `${h}:${String(m).padStart(2, '0')}` : String(m)) + ':' + String(x).padStart(2, '0')
}

const DEMO_SUBS: Record<string, string[]> = {
  Français: [
    '« La parole du griot traverse les générations comme le fleuve traverse le Sahel. »',
    '— Tu entends le vent du soir ? Il porte les nouvelles de Ségou.',
    '— Tant que la kora résonne, la mémoire ne s’éteint jamais.',
    '« Chaque histoire mérite d’être racontée à la lumière de son peuple. »',
    '— Demain à l’aube, nous reprendrons la route vers la rive.'
  ],
  English: [
    '“The griot’s voice crosses generations just as the river crosses the Sahel.”',
    '— Do you hear the evening wind? It carries news from Ségou.',
    '— As long as the kora plays, memory never fades.',
    '“Every story deserves to be told in the light of its people.”',
    '— Tomorrow at dawn, we set out again toward the riverbank.'
  ],
  Bambara: [
    '« Jeli ka kuma bɛ taa ka tɛmɛ tile caman na i n’a fɔ baji. »',
    '— I bɛ surɔ fɔɲɔ mɛn wa? A bɛ Sɛgu kibaruw lajɛ.',
    '— Ni kora bɛ fɔ, hakili tɛ ban abada.',
    '« Maana bɛɛ ka kan ka fɔ a ka jamana yeelen na. »',
    '— Sini sɔgɔma, an bɛna taa baji da la.'
  ]
}

function getEpisodes(it: Item, season: number): Episode[] {
  if (it.episodesBySeason?.[season]?.length) return it.episodesBySeason[season]
  return Array.from({ length: 6 }, (_, i) => ({
    number: i + 1,
    title: `Épisode ${i + 1}`,
    duration_min: it.dur || 40,
    intro_end_sec: 75
  }))
}

export function Player({ id, q }: { id: number; q: URLSearchParams }) {
  const { byId, st, profile, progress, session, isPremium, toast } = useApp()
  const it = byId(id)
  const trailer = q.has('t')
  const seasonNum = +(q.get('s') || 1)
  const epParam = q.get('e')
  const epNum = epParam ? +epParam : (it?.seasons && !trailer ? 1 : 0)
  const episodes = it?.seasons ? getEpisodes(it, seasonNum) : []
  const currentEp = epNum ? episodes.find(e => e.number === epNum) : undefined

  const initialDuration = trailer ? 95 : ((currentEp?.duration_min || it?.dur || 90) * 60)
  const introEnd = currentEp?.intro_end_sec || 85

  const [dur, setDur] = useState(0)
  const [src, setSrc] = useState('')
  const [streamErr, setStreamErr] = useState<{ code: number; msg: string } | null>(null)
  const [hlsLevels, setHlsLevels] = useState<string[]>([])
  const total = src && dur ? dur : initialDuration

  const savedPos = trailer
    ? 0
    : epNum
      ? (profile.epHist?.[`${id}:${seasonNum}:${epNum}`] || 0)
      : (profile.hist[id] || 0)

  const [t, setT] = useState(() => Math.min(savedPos, Math.max(0, initialDuration - 10)))
  const [play, setPlay] = useState(true)
  const [ui, setUi] = useState(true)
  const [menu, setMenu] = useState(false)
  const [ad, setAd] = useState(isPremium || profile.kid || trailer ? 0 : 5)
  const [sub, setSub] = useState(st.subLang)
  const [aud, setAud] = useState(st.audioLang)
  const [qual, setQual] = useState(st.defaultQuality || 'Auto')
  const [speed, setSpeed] = useState(1)
  const [vol, setVol] = useState(1)
  const [muted, setMuted] = useState(false)
  const [nextCountdown, setNextCountdown] = useState<number | null>(null)

  const vref = useRef<HTMLVideoElement>(null)
  const hlsRef = useRef<Hls | null>(null)
  const stage = useRef<HTMLDivElement>(null)
  const hide = useRef(0)
  const tRef = useRef(t)
  tRef.current = t

  const nextEp = it?.seasons && epNum ? episodes.find(e => e.number === epNum + 1) : undefined

  // Demande d'URL signée auprès du serveur /api/play (vérification pays, dates, droits, formule)
  useEffect(() => {
    if (!session || trailer || !it) return
    let off = false
    setStreamErr(null)
    ;(async () => {
      const res = await apiPost<{ url?: string; ads?: boolean }>('/api/play', {
        titleId: id,
        episodeId: currentEp?.id,
        seasonNum: epNum ? seasonNum : undefined,
        epNum: epNum || undefined
      })
      if (off) return
      if (res.ok && res.data?.url) {
        setSrc(res.data.url)
        if (res.data.ads === false) setAd(0)
      } else if (res.status === 402) {
        setStreamErr({ code: 402, msg: 'Ce contenu est réservé aux abonnés Kora Premium ou Famille.' })
      } else if (res.status === 403) {
        setStreamErr({ code: 403, msg: 'Ce titre n’est pas disponible dans votre pays.' })
      }
    })()
    return () => { off = true }
  }, [id, epNum, seasonNum, trailer, session?.user.id])

  // Initialisation HLS.js ou flux MP4/WebM direct
  useEffect(() => {
    const v = vref.current
    if (!v || !src) return
    hlsRef.current?.destroy()
    hlsRef.current = null
    setHlsLevels([])

    const isHls = /\.m3u8(\?|$)/i.test(src)
    if (isHls && Hls.isSupported()) {
      const hls = new Hls({ enableWorker: true, lowLatencyMode: false })
      hlsRef.current = hls
      hls.loadSource(src)
      hls.attachMedia(v)
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        const lvls = hls.levels.map(l => `${l.height}p`).reverse()
        setHlsLevels(['Auto', ...new Set(lvls)])
        if (play && ad === 0) v.play().catch(() => setPlay(false))
      })
      return () => { hls.destroy(); hlsRef.current = null }
    } else {
      v.src = src
    }
  }, [src])

  // Changement de qualité HLS
  useEffect(() => {
    const hls = hlsRef.current
    if (!hls) return
    if (qual === 'Auto') { hls.currentLevel = -1; return }
    const targetH = parseInt(qual, 10)
    const idx = hls.levels.findIndex(l => l.height === targetH)
    if (idx >= 0) hls.currentLevel = idx
  }, [qual])

  // Minuterie pub + lecture aperçu cinéma lorsqu'aucun fichier vidéo n'est attaché
  useEffect(() => {
    const h = window.setInterval(() => {
      if (ad > 0) setAd(a => Math.max(0, a - 1))
      else if (play && !src && !streamErr) {
        setT(x => {
          const next = Math.min(total, x + speed)
          if (next >= total) setPlay(false)
          return next
        })
      }
    }, 1000)
    return () => clearInterval(h)
  }, [play, ad, total, speed, src, streamErr])

  // Synchronisation lecture, vitesse et volume sur <video>
  useEffect(() => {
    const v = vref.current
    if (!v || !src) return
    if (play && ad === 0) v.play().catch(() => setPlay(false))
    else v.pause()
  }, [play, ad, src])

  useEffect(() => { if (vref.current) vref.current.playbackRate = speed }, [speed, src])
  useEffect(() => {
    if (vref.current) {
      vref.current.volume = muted ? 0 : vol
      vref.current.muted = muted
    }
  }, [vol, muted, src])

  // Sauvegarde automatique de la progression toutes les 5 secondes
  useEffect(() => {
    if (!trailer && ad === 0 && t > 4 && !streamErr) {
      progress(id, Math.floor(t), epNum ? seasonNum : undefined, epNum || undefined)
    }
  }, [Math.floor(t / 5)])

  // Compte à rebours épisode suivant automatique
  useEffect(() => {
    if (!nextEp || st.autoNext === false || trailer || ad > 0) return
    if (t >= total - 1 && nextCountdown === null) setNextCountdown(8)
  }, [t >= total - 1, nextEp?.number])

  useEffect(() => {
    if (nextCountdown === null) return
    if (nextCountdown <= 0 && nextEp) {
      location.hash = `#/lire/${id}?s=${seasonNum}&e=${nextEp.number}`
      return
    }
    const idt = window.setTimeout(() => setNextCountdown(c => (c === null ? null : c - 1)), 1000)
    return () => clearTimeout(idt)
  }, [nextCountdown])

  const wake = () => {
    setUi(true)
    clearTimeout(hide.current)
    hide.current = window.setTimeout(() => { if (!menu) setUi(false) }, 3500)
  }
  useEffect(() => { wake(); return () => clearTimeout(hide.current) }, [menu])

  const seek = (n: number) => {
    const c = Math.max(0, Math.min(total, n))
    setT(c)
    if (vref.current && src) vref.current.currentTime = c
    setNextCountdown(null)
    wake()
  }

  const fs = () => {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {})
    else stage.current?.requestFullscreen?.().catch(() => {})
  }

  const togglePip = async () => {
    const v = vref.current
    if (!v || !src) { toast('Mode Picture-in-Picture actif uniquement avec un flux vidéo réel.', 'info'); return }
    try {
      if (document.pictureInPictureElement) await document.exitPictureInPicture()
      else await v.requestPictureInPicture()
    } catch { toast('Picture-in-Picture non pris en charge par ce navigateur.', 'info') }
  }

  // Raccourcis clavier complets : Espace/K, Flèches, J/L, M, F, C, P, Échap
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!it || (e.target as HTMLElement).matches?.('input,select,textarea,button')) return
      const key = e.key.toLowerCase()
      if (e.key === ' ' || key === 'k') { e.preventDefault(); setPlay(p => !p); wake() }
      else if (e.key === 'ArrowRight' || key === 'l') { e.preventDefault(); seek(tRef.current + 10) }
      else if (e.key === 'ArrowLeft' || key === 'j') { e.preventDefault(); seek(tRef.current - 10) }
      else if (e.key === 'ArrowUp') { e.preventDefault(); setMuted(false); setVol(v => Math.min(1, +(v + 0.1).toFixed(1))); wake() }
      else if (e.key === 'ArrowDown') { e.preventDefault(); setVol(v => Math.max(0, +(v - 0.1).toFixed(1))); wake() }
      else if (key === 'm') { setMuted(m => !m); wake() }
      else if (key === 'f') { fs() }
      else if (key === 'c') { setSub(s => s === 'Désactivés' ? 'Français' : 'Désactivés'); wake() }
      else if (key === 'p') { togglePip() }
      else if (e.key === 'Escape') { setMenu(false) }
    }
    addEventListener('keydown', onKey)
    return () => removeEventListener('keydown', onKey)
  })

  if (!it) return <p className="page mu">Chargement du lecteur…</p>

  const subLines = DEMO_SUBS[sub] || DEMO_SUBS.Français
  const activeSubLine = subLines[Math.floor(t / 7) % subLines.length]
  const qualityOptions = hlsLevels.length ? hlsLevels : ['Auto', '4K', '1080p', '720p', '480p', '360p']
  const audioOptions = ['Original', ...it.langs, ...(it.audioDesc ? ['Audiodescription (FR)'] : [])]
  const subOptions = ['Désactivés', ...(it.subtitles || ['Français', 'English'])]
  const subFontSize = st.subSize === 'grand' ? '1.35rem' : st.subSize === 'petit' ? '0.9rem' : '1.08rem'

  return (
    <div className="player">
      <div className="stage" ref={stage} onMouseMove={wake} onClick={e => { if (e.target === e.currentTarget) setPlay(p => !p); wake() }}>
        <Poster item={it} wide />
        {!src && !streamErr && ad === 0 && (
          <div className={'demo-reel' + (play ? ' playing' : '')} aria-hidden="true">
            <span className="reel-beam" />
            <div className="reel-badge">
              <span className="dot" />
              <span>{trailer ? 'Bande-annonce' : 'Mode aperçu cinéma'} · {qual === 'Auto' ? (it.quality || 'HD') : qual}</span>
            </div>
          </div>
        )}

        {src && (
          <video
            ref={vref}
            playsInline
            preload="metadata"
            onLoadedMetadata={e => { setDur(e.currentTarget.duration); e.currentTarget.currentTime = t }}
            onTimeUpdate={e => setT(e.currentTarget.currentTime)}
            onEnded={() => setPlay(false)}
          />
        )}

        {streamErr ? (
          <div className="ad">
            <b>{streamErr.code === 402 ? 'Accès Premium requis' : 'Contenu restreint'}</b>
            <span>{streamErr.msg}</span>
            <div className="btns">
              {streamErr.code === 402 && <a className="btn p" href="#/abonnement">Découvrir Kora Premium</a>}
              <a className="btn" href={`#/titre/${id}`}>Retour à la fiche</a>
            </div>
          </div>
        ) : ad > 0 ? (
          <div className="ad" role="status">
            <span className="ad-pill">Sponsorisé · Formule gratuite</span>
            <b>Votre séance commence dans {ad} s</b>
            <span>Soutenez le cinéma africain et regardez sans publicité en Full HD & 4K.</span>
            <a className="btn p" href="#/abonnement">Passer à Kora Premium</a>
          </div>
        ) : (
          <div className={'ctl' + (ui || !play ? '' : ' off')}>
            <div className="top">
              <a className="icon-btn" href={`#/titre/${id}`} aria-label="Retour à la fiche"><Icon n="back" /></a>
              <div className="player-title">
                <b>{trailer ? 'Bande-annonce · ' : ''}{it.title}</b>
                {currentEp && <small>Saison {seasonNum} · Épisode {currentEp.number} — {currentEp.title}</small>}
              </div>
              <button type="button" className="icon-btn" onClick={() => setSub(s => s === 'Désactivés' ? 'Français' : 'Désactivés')} aria-label="Activer ou couper les sous-titres" title="Sous-titres (C)">
                <Icon n="captions" />
              </button>
              <button type="button" className="icon-btn" onClick={togglePip} aria-label="Picture-in-Picture" title="Picture-in-Picture (P)">
                <Icon n="pip" />
              </button>
              <button type="button" className="icon-btn" onClick={() => setMenu(m => !m)} aria-label="Réglages du lecteur" aria-expanded={menu}>
                <Icon n="gear" />
              </button>
            </div>

            {menu && (
              <div className="menu" role="dialog" aria-label="Réglages vidéo et audio">
                <label>Qualité
                  <select value={qual} onChange={e => setQual(e.target.value)}>
                    {qualityOptions.map(x => <option key={x}>{x}</option>)}
                  </select>
                </label>
                <label>Sous-titres
                  <select value={sub} onChange={e => setSub(e.target.value)}>
                    {subOptions.map(x => <option key={x}>{x}</option>)}
                  </select>
                </label>
                <label>Audio
                  <select value={aud} onChange={e => setAud(e.target.value)}>
                    {audioOptions.map(x => <option key={x}>{x}</option>)}
                  </select>
                </label>
                <label>Vitesse
                  <select value={speed} onChange={e => setSpeed(+e.target.value)}>
                    {[0.75, 1, 1.25, 1.5, 2].map(x => <option key={x} value={x}>{x}×</option>)}
                  </select>
                </label>
              </div>
            )}

            <div className="mid">
              <button type="button" className="skip-btn" onClick={() => seek(t - 10)} aria-label="Reculer de 10 secondes">−10 s</button>
              <button type="button" className="big" onClick={() => setPlay(p => !p)} aria-label={play ? 'Pause' : 'Lecture'}>
                <Icon n={play ? 'pause' : 'play'} s={30} />
              </button>
              <button type="button" className="skip-btn" onClick={() => seek(t + 10)} aria-label="Avancer de 10 secondes">+10 s</button>
            </div>

            <div>
              <div className="skips">
                {!trailer && t >= 5 && t < introEnd && (
                  <button type="button" className="btn" onClick={() => seek(introEnd)}>Ignorer l’introduction</button>
                )}
                {nextEp && (
                  <a className="btn p" href={`#/lire/${id}?s=${seasonNum}&e=${nextEp.number}`}>
                    Épisode suivant : E{nextEp.number}
                  </a>
                )}
              </div>

              <div className="bar">
                <span>{fmt(t)}</span>
                <input
                  type="range"
                  min={0}
                  max={total}
                  value={Math.min(t, total)}
                  onChange={e => seek(+e.target.value)}
                  aria-label="Position de lecture"
                />
                <span>{fmt(total)}</span>
                <div className="vol-box">
                  <button type="button" className="icon-btn" onClick={() => setMuted(m => !m)} aria-label={muted ? 'Activer le son' : 'Couper le son'}>
                    <Icon n={muted || vol === 0 ? 'mute' : 'volume'} s={18} />
                  </button>
                  <input
                    className="vol-range"
                    type="range"
                    min={0}
                    max={1}
                    step={0.05}
                    value={muted ? 0 : vol}
                    onChange={e => { setMuted(false); setVol(+e.target.value) }}
                    aria-label="Volume"
                  />
                </div>
                <button type="button" className="icon-btn" onClick={fs} aria-label="Plein écran (F)"><Icon n="full" s={18} /></button>
              </div>
            </div>
          </div>
        )}

        {sub !== 'Désactivés' && ad === 0 && !streamErr && (
          <p className="sub" style={{ fontSize: subFontSize }}>
            <span>{activeSubLine}</span>
          </p>
        )}

        {nextCountdown !== null && nextEp && (
          <div className="next-overlay" role="dialog" aria-label="Épisode suivant">
            <small className="mu">Épisode suivant dans {nextCountdown} s</small>
            <strong>S{seasonNum} E{nextEp.number} · {nextEp.title}</strong>
            <div className="btns">
              <button type="button" className="btn" onClick={() => setNextCountdown(null)}>Annuler</button>
              <a className="btn p" href={`#/lire/${id}?s=${seasonNum}&e=${nextEp.number}`}>Regarder maintenant</a>
            </div>
          </div>
        )}
      </div>

      <div className="page player-meta">
        <div className="player-info-row">
          <div>
            <h1>{it.title}{currentEp ? ` — S${seasonNum} E${currentEp.number}` : ''}</h1>
            <p className="mu">
              <Meta i={it} /> · Audio : {aud} · Sous-titres : {sub}
            </p>
            {t > 4 && !trailer && (
              <p className="mu small-note">Reprise automatique enregistrée à {fmt(t)} pour le profil {profile.name}.</p>
            )}
          </div>
          <div className="btns">
            <a className="btn" href={`#/titre/${id}`}><Icon n="info" s={18} />Fiche complète</a>
            <button
              type="button"
              className="btn"
              onClick={() => toast(isPremium ? 'Téléchargement hors ligne bientôt disponible sur l’application mobile Kora.' : 'Le téléchargement hors ligne est inclus avec Kora Premium.', 'info')}
            >
              <Icon n="down" s={18} />Télécharger
            </button>
          </div>
        </div>

        <p className="kbd-hint mu">
          Raccourcis clavier : <kbd>Espace</kbd> lecture/pause · <kbd>←</kbd>/<kbd>→</kbd> ±10 s · <kbd>M</kbd> muet · <kbd>C</kbd> sous-titres · <kbd>F</kbd> plein écran
        </p>

        {it.seasons && episodes.length > 0 && (
          <section className="ep-drawer">
            <h2>Épisodes — Saison {seasonNum}</h2>
            <ol className="eps">
              {episodes.map(e => {
                const active = e.number === epNum
                const pos = profile.epHist?.[`${id}:${seasonNum}:${e.number}`] || 0
                const pct = pos ? Math.min(100, Math.round((pos / (e.duration_min * 60)) * 100)) : 0
                return (
                  <li key={e.number} className={active ? 'active-ep' : ''}>
                    <a href={`#/lire/${id}?s=${seasonNum}&e=${e.number}`}>
                      <span className="ep-num">{e.number}</span>
                      <div className="ep-body">
                        <strong>{e.title} {active && <em className="ep-playing">En lecture</em>}</strong>
                        {e.synopsis && <p className="mu">{e.synopsis}</p>}
                        {pct > 0 && <div className="ep-prog"><span style={{ width: `${pct}%` }} /></div>}
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
    </div>
  )
}
