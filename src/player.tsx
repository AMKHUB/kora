import { useEffect, useMemo, useRef, useState } from 'react'
import Hls from 'hls.js'
import { apiPost } from './api'
import { Episode, Item, useApp } from './store'
import { Icon, Meta, Poster } from './ui'

type SubtitleTrack = {
  id: number
  language_code: string
  language_label: string
  vtt_content: string
  offset_ms: number
  source: string
}

type VttCue = {
  start: number
  end: number
  text: string
}

const fmt = (s: number) => {
  const sec = Math.max(0, Math.floor(s))
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  const x = sec % 60
  return (h ? `${h}:${String(m).padStart(2, '0')}` : String(m)) + ':' + String(x).padStart(2, '0')
}

function parseTimestamp(ts: string): number {
  const clean = ts.trim().replace(',', '.')
  const parts = clean.split(':').map(Number)
  if (parts.some(Number.isNaN)) return -1
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2]
  if (parts.length === 2) return parts[0] * 60 + parts[1]
  return -1
}

function parseWebVtt(raw: string): VttCue[] {
  if (!raw) return []
  const lines = raw.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n').split('\n')
  const cues: VttCue[] = []
  let i = 0
  while (i < lines.length) {
    const line = lines[i].trim()
    if (line.includes('-->')) {
      const [left, rightRaw] = line.split('-->')
      const right = (rightRaw || '').trim().split(/\s+/)[0]
      const start = parseTimestamp(left)
      const end = parseTimestamp(right)
      i++
      const textLines: string[] = []
      while (i < lines.length && lines[i].trim() !== '') {
        textLines.push(lines[i].replace(/<[^>]+>/g, '').trim())
        i++
      }
      const text = textLines.filter(Boolean).join('\n')
      if (start >= 0 && end > start && text) {
        cues.push({ start, end, text })
      }
    } else {
      i++
    }
  }
  return cues.sort((a, b) => a.start - b.start)
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
  const { byId, st, profile, progress, session, role, isPremium, toast } = useApp()
  const it = byId(id)
  const trailer = q.has('t')
  const seasonNum = +(q.get('s') || 1)
  const epParam = q.get('e')
  const epNum = epParam ? +epParam : (it?.seasons && !trailer ? 1 : 0)
  const episodes = it?.seasons ? getEpisodes(it, seasonNum) : []
  const currentEp = epNum ? episodes.find(e => e.number === epNum) : undefined

  const initialDuration = trailer ? 95 : ((currentEp?.duration_min || it?.dur || 90) * 60)
  const introEnd = currentEp?.intro_end_sec ?? (it?.type === 'serie' ? 75 : 0)

  const [dur, setDur] = useState(0)
  const [bufferedEnd, setBufferedEnd] = useState(0)
  const [buffering, setBuffering] = useState(false)
  const [videoReady, setVideoReady] = useState(false)
  const [src, setSrc] = useState('')
  const [tracks, setTracks] = useState<SubtitleTrack[]>([])
  const [activeTrackId, setActiveTrackId] = useState<number | 'off'>('off')
  const [syncOffsetMs, setSyncOffsetMs] = useState(0)
  const [voiceBoost, setVoiceBoost] = useState(false)
  const [streamErr, setStreamErr] = useState<{ code: number; msg: string } | null>(null)
  const [hlsLevels, setHlsLevels] = useState<string[]>([])
  const [activeBitrate, setActiveBitrate] = useState('')
  const total = src && dur ? dur : initialDuration

  const savedPos = trailer
    ? 0
    : epNum
      ? (profile.epHist?.[`${id}:${seasonNum}:${epNum}`] || 0)
      : (profile.hist[id] || 0)

  const [t, setT] = useState(() => Math.min(savedPos, Math.max(0, initialDuration - 10)))
  const [preciseTime, setPreciseTime] = useState(0)
  const [play, setPlay] = useState(true)
  const [ui, setUi] = useState(true)
  const [menu, setMenu] = useState(false)
  const [ad, setAd] = useState(isPremium || profile.kid || trailer ? 0 : 5)
  const [aud, setAud] = useState(st.audioLang)
  const [qual, setQual] = useState(st.defaultQuality || 'Auto')
  const [speed, setSpeed] = useState(1)
  const [vol, setVol] = useState(1)
  const [muted, setMuted] = useState(false)
  const [nextCountdown, setNextCountdown] = useState<number | null>(null)

  const vref = useRef<HTMLVideoElement>(null)
  const hlsRef = useRef<Hls | null>(null)
  const audioCtxRef = useRef<AudioContext | null>(null)
  const voiceFilterRef = useRef<BiquadFilterNode | null>(null)
  const compRef = useRef<DynamicsCompressorNode | null>(null)
  const stage = useRef<HTMLDivElement>(null)
  const hide = useRef(0)
  const tRef = useRef(t)
  tRef.current = t

  const nextEp = it?.seasons && epNum ? episodes.find(e => e.number === epNum + 1) : undefined

  const activeTrack = useMemo(
    () => (activeTrackId === 'off' ? null : tracks.find(tr => tr.id === activeTrackId) || null),
    [tracks, activeTrackId]
  )

  const parsedCues = useMemo(
    () => (activeTrack ? parseWebVtt(activeTrack.vtt_content) : []),
    [activeTrack?.id, activeTrack?.vtt_content]
  )

  // Demande d'URL signée + pistes de sous-titres synchronisées auprès du serveur /api/play
  useEffect(() => {
    if (!session || trailer || !it) return
    let off = false
    setStreamErr(null)
    setVideoReady(false)
    setTracks([])
    setActiveTrackId('off')
    setSyncOffsetMs(0)
    ;(async () => {
      const res = await apiPost<{ url?: string; ads?: boolean; subtitles?: SubtitleTrack[] }>('/api/play', {
        titleId: id,
        episodeId: currentEp?.id,
        seasonNum: epNum ? seasonNum : undefined,
        epNum: epNum || undefined
      })
      if (off) return
      if (res.ok && res.data?.url) {
        setSrc(res.data.url)
        if (res.data.ads === false) setAd(0)
        const loadedTracks = Array.isArray(res.data.subtitles) ? res.data.subtitles : []
        setTracks(loadedTracks)
        if (loadedTracks.length && st.subLang !== 'Désactivés') {
          const preferred = loadedTracks.find(tr =>
            tr.language_label.toLowerCase() === st.subLang.toLowerCase() ||
            tr.language_code.toLowerCase() === st.subLang.slice(0, 2).toLowerCase()
          ) || loadedTracks[0]
          setActiveTrackId(preferred.id)
          setSyncOffsetMs(preferred.offset_ms || 0)
        }
      } else if (res.status === 402) {
        setStreamErr({ code: 402, msg: 'Ce contenu est réservé aux abonnés Kora Premium ou Famille.' })
      } else if (res.status === 403) {
        setStreamErr({ code: 403, msg: 'Ce titre n’est pas disponible dans votre pays.' })
      }
    })()
    return () => { off = true }
  }, [id, epNum, seasonNum, trailer, session?.user.id])

  // Initialisation HLS.js adaptatif (ABR optimisé 3G/4G/Fibre + reprise auto sur coupure) ou flux MP4/WebM
  useEffect(() => {
    const v = vref.current
    if (!v || !src) return
    hlsRef.current?.destroy()
    hlsRef.current = null
    setHlsLevels([])
    setActiveBitrate('')

    const isHls = /\.m3u8(\?|$)/i.test(src)
    if (isHls && Hls.isSupported()) {
      const hls = new Hls({
        enableWorker: true,
        lowLatencyMode: false,
        capLevelToPlayerSize: true,
        startLevel: -1,
        maxBufferLength: 30,
        maxMaxBufferLength: 90,
        backBufferLength: 30,
        abrEwmaDefaultEstimate: 1_500_000,
        fragLoadingMaxRetry: 4,
        manifestLoadingMaxRetry: 3
      })
      hlsRef.current = hls
      hls.loadSource(src)
      hls.attachMedia(v)

      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        const lvls = hls.levels.map(l => `${l.height}p`).reverse()
        setHlsLevels(['Auto', ...new Set(lvls)])
        if (play && ad === 0) v.play().catch(() => setPlay(false))
      })
      hls.on(Hls.Events.LEVEL_SWITCHED, (_ev, data) => {
        const lvl = hls.levels[data.level]
        if (lvl?.height) setActiveBitrate(`${lvl.height}p`)
      })
      hls.on(Hls.Events.ERROR, (_ev, data) => {
        if (!data.fatal) return
        if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
          hls.startLoad()
        } else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
          hls.recoverMediaError()
        } else {
          hls.destroy()
          setStreamErr({ code: 500, msg: 'Connexion interrompue pendant la lecture. Rechargez la page.' })
        }
      })
      return () => { hls.destroy(); hlsRef.current = null }
    } else {
      v.src = src
    }
  }, [src])

  // Synchronisation haute précision sous-titres ↔ voix (requestVideoFrameCallback = calé à l'image près)
  useEffect(() => {
    const v = vref.current as (HTMLVideoElement & {
      requestVideoFrameCallback?: (cb: (_now: number, meta: { mediaTime: number }) => void) => number
      cancelVideoFrameCallback?: (id: number) => void
    }) | null
    if (!v || !src) return
    let rafId = 0
    let active = true

    if (typeof v.requestVideoFrameCallback === 'function') {
      const tick = (_now: number, meta: { mediaTime: number }) => {
        if (!active) return
        setPreciseTime(meta.mediaTime)
        rafId = v.requestVideoFrameCallback!(tick)
      }
      rafId = v.requestVideoFrameCallback(tick)
      return () => {
        active = false
        v.cancelVideoFrameCallback?.(rafId)
      }
    }

    const onTime = () => setPreciseTime(v.currentTime)
    v.addEventListener('timeupdate', onTime)
    return () => v.removeEventListener('timeupdate', onTime)
  }, [src])

  // Amélioration audio "Voix claire" (Web Audio API : normalisation dynamique + clarté vocale)
  useEffect(() => {
    const v = vref.current
    if (!v || !src) return
    if (!voiceBoost) {
      if (voiceFilterRef.current) voiceFilterRef.current.gain.value = 0
      if (compRef.current) compRef.current.ratio.value = 1
      return
    }
    try {
      if (!audioCtxRef.current) {
        const AudioCtor = window.AudioContext || (window as any).webkitAudioContext
        const ctx = new AudioCtor()
        const source = ctx.createMediaElementSource(v)
        const voiceEq = ctx.createBiquadFilter()
        voiceEq.type = 'peaking'
        voiceEq.frequency.value = 2800
        voiceEq.Q.value = 1.1
        voiceEq.gain.value = 3.5

        const comp = ctx.createDynamicsCompressor()
        comp.threshold.value = -20
        comp.knee.value = 18
        comp.ratio.value = 4
        comp.attack.value = 0.005
        comp.release.value = 0.2

        source.connect(voiceEq)
        voiceEq.connect(comp)
        comp.connect(ctx.destination)

        audioCtxRef.current = ctx
        voiceFilterRef.current = voiceEq
        compRef.current = comp
      } else {
        if (audioCtxRef.current.state === 'suspended') audioCtxRef.current.resume().catch(() => {})
        if (voiceFilterRef.current) voiceFilterRef.current.gain.value = 3.5
        if (compRef.current) compRef.current.ratio.value = 4
      }
    } catch {
      toast('Mode Voix claire non disponible sur ce flux.', 'info')
      setVoiceBoost(false)
    }
  }, [voiceBoost, src])

  // Changement de qualité HLS
  useEffect(() => {
    const hls = hlsRef.current
    if (!hls) return
    if (qual === 'Auto') { hls.currentLevel = -1; return }
    const targetH = parseInt(qual, 10)
    const idx = hls.levels.findIndex(l => l.height === targetH)
    if (idx >= 0) hls.currentLevel = idx
  }, [qual])

  // Minuterie pub + mode aperçu uniquement quand aucun fichier vidéo n'existe
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
    if (play && ad === 0) {
      if (audioCtxRef.current?.state === 'suspended') audioCtxRef.current.resume().catch(() => {})
      v.play().catch(() => setPlay(false))
    } else {
      v.pause()
    }
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
    setPreciseTime(c)
    if (vref.current && src) vref.current.currentTime = c
    setNextCountdown(null)
    wake()
  }

  const adjustSync = (deltaMs: number) => {
    setSyncOffsetMs(prev => {
      const next = Math.max(-5000, Math.min(5000, prev + deltaMs))
      toast(`Synchro sous-titres : ${(next / 1000 >= 0 ? '+' : '')}${(next / 1000).toFixed(1)} s`, 'info')
      return next
    })
  }

  const saveSyncOffset = async () => {
    if (!activeTrack || activeTrack.id < 0) return
    const r = await apiPost('/api/subtitles?action=offset', { id: activeTrack.id, offsetMs: syncOffsetMs })
    if (r.ok) {
      setTracks(list => list.map(tr => tr.id === activeTrack.id ? { ...tr, offset_ms: syncOffsetMs } : tr))
      toast('Synchronisation enregistrée pour tous les spectateurs.', 'ok')
    } else {
      toast(r.data.error || 'Impossible d’enregistrer le décalage.', 'err')
    }
  }

  const toggleSubtitles = () => {
    if (!tracks.length) {
      toast('Aucun sous-titre disponible pour cette vidéo (ajoutez-en dans Admin ou Studio).', 'info')
      return
    }
    if (activeTrackId === 'off') {
      setActiveTrackId(tracks[0].id)
      setSyncOffsetMs(tracks[0].offset_ms || 0)
    } else {
      setActiveTrackId('off')
    }
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

  // Raccourcis clavier complets : Espace/K, Flèches, J/L, M, F, C, P, [ / ] (synchro ST), Échap
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
      else if (key === 'c') { toggleSubtitles() }
      else if (key === 'p') { togglePip() }
      else if (e.key === '[') { if (activeTrack) adjustSync(-100) }
      else if (e.key === ']') { if (activeTrack) adjustSync(100) }
      else if (e.key === 'Escape') { setMenu(false) }
    }
    addEventListener('keydown', onKey)
    return () => removeEventListener('keydown', onKey)
  })

  if (!it) return <p className="page mu">Chargement du lecteur…</p>

  // Calcul du sous-titre actif synchronisé à la milliseconde près avec la voix (preciseTime + offset)
  const effectiveTime = (src ? preciseTime : t) + (syncOffsetMs / 1000)
  const activeCueText = activeTrack
    ? parsedCues.find(c => effectiveTime >= c.start && effectiveTime <= c.end)?.text || ''
    : ''

  const showSkipIntro = !trailer && introEnd > 5 && total > introEnd + 15 && t >= 5 && t < introEnd
  const qualityOptions = hlsLevels.length ? hlsLevels : ['Auto', '1080p', '720p', '480p']
  const audioOptions = ['Original', ...it.langs, ...(it.audioDesc ? ['Audiodescription (FR)'] : [])]
  const subFontSize = st.subSize === 'grand' ? '1.35rem' : st.subSize === 'petit' ? '0.9rem' : '1.08rem'
  const bufPct = total > 0 ? Math.min(100, Math.round((bufferedEnd / total) * 100)) : 0

  return (
    <div className="player">
      <div className="stage" ref={stage} onMouseMove={wake} onClick={e => { if (e.target === e.currentTarget) setPlay(p => !p); wake() }}>
        {(!src || !videoReady) && <Poster item={it} wide />}

        {!src && !streamErr && ad === 0 && (
          <div className={'demo-reel' + (play ? ' playing' : '')} aria-hidden="true">
            <span className="reel-beam" />
            <div className="reel-badge">
              <span className="dot" />
              <span>{trailer ? 'Bande-annonce' : 'Aucune vidéo téléversée · Aperçu'}</span>
            </div>
          </div>
        )}

        {src && (
          <video
            ref={vref}
            crossOrigin="anonymous"
            playsInline
            preload="auto"
            onLoadedMetadata={e => {
              const d = e.currentTarget.duration
              setDur(d)
              const startAt = savedPos > 0 && savedPos < d - 5 ? savedPos : 0
              e.currentTarget.currentTime = startAt
              setT(startAt)
              setPreciseTime(startAt)
            }}
            onLoadedData={() => { setVideoReady(true); setBuffering(false) }}
            onWaiting={() => setBuffering(true)}
            onStalled={() => setBuffering(true)}
            onPlaying={() => setBuffering(false)}
            onCanPlay={() => setBuffering(false)}
            onProgress={e => {
              const b = e.currentTarget.buffered
              if (b.length > 0) setBufferedEnd(b.end(b.length - 1))
            }}
            onTimeUpdate={e => setT(e.currentTarget.currentTime)}
            onEnded={() => setPlay(false)}
          />
        )}

        {buffering && src && !streamErr && ad === 0 && (
          <div className="player-buffer" role="status" aria-label="Mise en mémoire tampon">
            <span className="spinner" />
          </div>
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
              {activeBitrate && <span className="pill-spec" style={{ fontSize: '0.72rem' }}>{activeBitrate}</span>}
              <button
                type="button"
                className={'icon-btn' + (activeTrack ? ' active-ctl' : '')}
                onClick={toggleSubtitles}
                aria-label="Activer ou couper les sous-titres"
                title={tracks.length ? 'Sous-titres (C)' : 'Aucun sous-titre disponible'}
              >
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
              <div className="menu" role="dialog" aria-label="Réglages vidéo, audio et sous-titres">
                <label>Qualité
                  <select value={qual} onChange={e => setQual(e.target.value)}>
                    {qualityOptions.map(x => <option key={x}>{x}</option>)}
                  </select>
                </label>
                <label>Sous-titres synchronisés
                  <select
                    value={String(activeTrackId)}
                    onChange={e => {
                      if (e.target.value === 'off') setActiveTrackId('off')
                      else {
                        const tid = Number(e.target.value)
                        const tr = tracks.find(x => x.id === tid)
                        setActiveTrackId(tid)
                        setSyncOffsetMs(tr?.offset_ms || 0)
                      }
                    }}
                  >
                    <option value="off">Désactivés</option>
                    {tracks.map(tr => (
                      <option key={tr.id} value={tr.id}>
                        {tr.language_label}{tr.source.startsWith('ai_') ? ' (IA)' : ''}
                      </option>
                    ))}
                  </select>
                </label>

                {activeTrack && (
                  <div className="sync-row">
                    <span>Synchro voix : <strong>{syncOffsetMs >= 0 ? '+' : ''}{(syncOffsetMs / 1000).toFixed(1)} s</strong></span>
                    <div className="sync-btns">
                      <button type="button" className="btn" onClick={() => adjustSync(-100)} title="Avancer les sous-titres ([)">−0.1 s</button>
                      <button type="button" className="btn" onClick={() => setSyncOffsetMs(0)}>0</button>
                      <button type="button" className="btn" onClick={() => adjustSync(100)} title="Retarder les sous-titres (])">+0.1 s</button>
                    </div>
                    {role === 'admin' && (
                      <button type="button" className="lnk small-lnk" onClick={saveSyncOffset}>Enregistrer ce calage</button>
                    )}
                  </div>
                )}

                <label>Audio
                  <select value={aud} onChange={e => setAud(e.target.value)}>
                    {audioOptions.map(x => <option key={x}>{x}</option>)}
                  </select>
                </label>

                <label className="chk" style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <input type="checkbox" checked={voiceBoost} onChange={e => setVoiceBoost(e.target.checked)} />
                  <span>Voix claire (normalisation son)</span>
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
                {showSkipIntro && (
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
                <div className="scrub-wrap">
                  <div className="scrub-buf" style={{ width: `${bufPct}%` }} aria-hidden="true" />
                  <input
                    type="range"
                    min={0}
                    max={total}
                    step={0.1}
                    value={Math.min(t, total)}
                    onChange={e => seek(+e.target.value)}
                    aria-label="Position de lecture"
                  />
                </div>
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

        {activeCueText && ad === 0 && !streamErr && (
          <p className="sub" style={{ fontSize: subFontSize }} aria-live="polite">
            <span>{activeCueText}</span>
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
              <Meta i={it} /> · Audio : {aud}{voiceBoost ? ' (Voix claire)' : ''} · Sous-titres : {activeTrack ? activeTrack.language_label : 'Désactivés'}
            </p>
            {t > 4 && !trailer && (
              <p className="mu small-note">Reprise automatique enregistrée à {fmt(t)} pour le profil {profile.name}.</p>
            )}
          </div>
          <div className="btns">
            <a className="btn" href={`#/titre/${id}`}><Icon n="info" s={18} />Fiche complète</a>
            {role === 'admin' && (
              <a className="btn" href={`#/admin?t=titles&id=${id}`}><Icon n="captions" s={18} />Gérer les sous-titres</a>
            )}
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
          Raccourcis : <kbd>Espace</kbd> lecture/pause · <kbd>←</kbd>/<kbd>→</kbd> ±10 s · <kbd>M</kbd> muet · <kbd>C</kbd> sous-titres · <kbd>[</kbd>/<kbd>]</kbd> synchro voix ±0.1 s · <kbd>F</kbd> plein écran
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
