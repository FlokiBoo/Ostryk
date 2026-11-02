'use client'

import { useState, useEffect, useRef } from 'react'
import { beep, unlockAudio } from '@/lib/audioBeep'
import { vibrate, vibrateTriple } from '@/lib/vibrate'
import { speak, unlockSpeech } from '@/lib/speak'

function fmt(sec) {
  const s = Math.max(0, Math.ceil(sec))
  const m = Math.floor(s / 60)
  const r = s % 60
  return `${m}:${String(r).padStart(2, '0')}`
}

function buildCustomSegments(steps, rounds, restBetweenSec) {
  const segments = []
  for (let r = 0; r < rounds; r++) {
    steps.forEach(s => segments.push({ type: s.type, sec: s.sec, round: r + 1 }))
    if (r < rounds - 1 && restBetweenSec > 0) segments.push({ type: 'ROUNDREST', sec: restBetweenSec, round: r + 1 })
  }
  return segments
}

// Timer qui se lance automatiquement à partir d'une config déjà décidée par le coach (pas d'écran
// de réglage) — pensé pour être embarqué dans SplitTimerSession, jamais démonté pendant qu'il
// tourne (sinon le chrono perdrait son état), donc pas de position fixed ici : c'est au parent de
// gérer la mise en page.
// decompteDepart : secondes de « Prêt » avant le départ (téléphone posé à distance).
// compact : une seule ligne (panneau réduit en bandeau), sans démonter le chrono.
export default function EmbeddedTimer({ config, label, decompteDepart = 0, compact = false }) {
  const [running, setRunning] = useState(true)
  const [, forceTick] = useState(0)
  const elapsedBaseRef = useRef(0)
  const runStartRef = useRef(null)
  const lastBeepKeyRef = useRef(null)
  const prevPhaseKeyRef = useRef(null)

  useEffect(() => {
    runStartRef.current = Date.now()
    unlockAudio()
    unlockSpeech()
  }, [])

  useEffect(() => {
    if (!running) return
    const id = setInterval(() => forceTick(t => t + 1), 100)
    return () => clearInterval(id)
  }, [running])

  const getElapsed = () => elapsedBaseRef.current + (runStartRef.current ? (Date.now() - runStartRef.current) / 1000 : 0)

  const toggle = () => {
    if (running) {
      elapsedBaseRef.current = getElapsed()
      runStartRef.current = null
    } else {
      runStartRef.current = Date.now()
    }
    setRunning(r => !r)
  }

  const reset = () => {
    elapsedBaseRef.current = 0
    runStartRef.current = running ? Date.now() : null
    lastBeepKeyRef.current = null
    prevPhaseKeyRef.current = null
    forceTick(t => t + 1)
  }

  const compute = () => {
    const elapsed = getElapsed() - decompteDepart
    if (elapsed < 0) return { finished: false, remaining: -elapsed, phaseLabel: 'Prêt', phaseKey: 'pret', isWork: false }
    if (config.type === 'FOR_TIME') {
      // Chrono montant ; time cap facultatif (0 = sans limite), bips sur ses 5 dernières secondes.
      if (config.capSec && elapsed >= config.capSec) return { finished: true, remaining: 0, display: config.capSec, phaseLabel: 'Time cap' }
      return { finished: false, display: elapsed, remaining: config.capSec ? config.capSec - elapsed : Infinity, phaseLabel: config.capSec ? `Time cap ${fmt(config.capSec)}` : 'Sans time cap', phaseKey: 'fortime' }
    }
    if (config.type === 'EMOM') {
      const total = config.roundSec * config.rounds
      if (elapsed >= total) return { finished: true, remaining: 0, phaseLabel: 'Terminé' }
      const roundIndex = Math.floor(elapsed / config.roundSec)
      const remaining = config.roundSec - (elapsed % config.roundSec)
      return { finished: false, remaining, phaseLabel: `Round ${roundIndex + 1}/${config.rounds}`, phaseKey: `r${roundIndex}` }
    }
    if (config.type === 'AMRAP') {
      const remaining = config.totalSec - elapsed
      if (remaining <= 0) return { finished: true, remaining: 0, phaseLabel: 'Terminé' }
      return { finished: false, remaining, phaseLabel: 'AMRAP', phaseKey: 'amrap' }
    }
    if (config.type === 'CUSTOM') {
      const segments = buildCustomSegments(config.steps, config.rounds, config.restBetweenSec)
      const total = segments.reduce((s, seg) => s + seg.sec, 0)
      if (!segments.length || elapsed >= total) return { finished: true, remaining: 0, phaseLabel: 'Terminé' }
      let acc = 0
      for (let i = 0; i < segments.length; i++) {
        const seg = segments[i]
        if (elapsed < acc + seg.sec) {
          const remaining = acc + seg.sec - elapsed
          const lbl = seg.type === 'ON' ? 'ON' : seg.type === 'REST' ? 'RÉCUP' : 'REPOS'
          return { finished: false, remaining, phaseLabel: `${lbl} — Round ${seg.round}/${config.rounds}`, phaseKey: `s${i}`, isWork: seg.type === 'ON' }
        }
        acc += seg.sec
      }
      return { finished: true, remaining: 0, phaseLabel: 'Terminé' }
    }
    // TABATA
    const cycle = config.workSec + config.restSec
    const total = cycle * config.rounds
    if (elapsed >= total) return { finished: true, remaining: 0, phaseLabel: 'Terminé' }
    const roundIndex = Math.floor(elapsed / cycle)
    const pos = elapsed % cycle
    const isWork = pos < config.workSec
    const remaining = isWork ? config.workSec - pos : cycle - pos
    return { finished: false, remaining, phaseLabel: `${isWork ? 'TRAVAIL' : 'REPOS'} — Round ${roundIndex + 1}/${config.rounds}`, phaseKey: `r${roundIndex}-${isWork ? 'w' : 'r'}`, isWork }
  }

  const state = compute()

  useEffect(() => {
    if (!running) return
    if (state.finished) {
      if (lastBeepKeyRef.current !== 'finished') { beep(1200, 0.35); vibrateTriple(); speak('Stop'); lastBeepKeyRef.current = 'finished'; setRunning(false) }
      return
    }
    const remInt = Math.ceil(state.remaining)
    const key = `${state.phaseKey}-${remInt}`
    if (lastBeepKeyRef.current === key) return
    if (remInt <= 5 && remInt >= 1) { beep(660, 0.08); vibrate('light'); speak(String(remInt), 'fr-FR'); lastBeepKeyRef.current = key }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.remaining, state.finished, running])

  useEffect(() => {
    if (!running || !state.phaseKey) return
    if (prevPhaseKeyRef.current !== null && prevPhaseKeyRef.current !== state.phaseKey) {
      beep(1000, 0.18); vibrateTriple(); speak(state.isWork === false ? 'Stop' : 'Go')
    }
    prevPhaseKeyRef.current = state.phaseKey
  }, [state.phaseKey, state.isWork, running])

  const accent = state.phaseKey === 'pret' ? 'var(--text3)'
    : (config.type === 'TABATA' || config.type === 'CUSTOM') && state.isWork === false ? '#1D4ED8' : 'var(--green)'
  const affiche = fmt(state.display ?? state.remaining)
  const nomType = config.type === 'CUSTOM' ? 'PERSO' : config.type === 'FOR_TIME' ? 'FOR TIME' : config.type

  if (compact) {
    return (
      <div style={{ height: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '0 12px', background: 'var(--bg2)' }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: accent, letterSpacing: '0.08em', textTransform: 'uppercase' }}>{nomType}</span>
        <span style={{ fontSize: 12, color: 'var(--text3)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{state.phaseLabel}</span>
        <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 26, fontWeight: 700, color: accent }}>{affiche}</span>
        {!state.finished && (
          <button onClick={toggle} aria-label={running ? 'Pause' : 'Reprendre'} style={{ width: 36, height: 36, borderRadius: 18, border: 'none', background: 'var(--green)', color: '#fff', fontSize: 14, cursor: 'pointer' }}>
            {running ? '⏸' : '▶'}
          </button>
        )}
      </div>
    )
  }

  // cqmin (le plus petit des deux côtés du panneau qui contient ce timer, voir SplitTimerSession)
  // plutôt que du vh/vw : grossit avec le panneau lui-même — plein écran, ou téléphone tourné en
  // paysage où le panneau devient beaucoup plus large — sans dépendre de l'orientation en soi.
  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 16, gap: 8, background: 'var(--bg2)' }}>
      {label && <div style={{ fontSize: 'clamp(12px, 2.4cqmin, 20px)', fontWeight: 700, color: 'var(--text3)' }}>{label}</div>}
      <div style={{ fontSize: 'clamp(13px, 2.6cqmin, 22px)', color: accent, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase' }}>{nomType}</div>
      <div style={{ fontSize: 'clamp(15px, 3.2cqmin, 30px)', color: 'var(--text3)', fontWeight: 600 }}>{state.phaseLabel}</div>
      {/* min(cqw, cqh) plutôt que cqmin seul : en paysage plein écran, la largeur disponible permet
          des chiffres bien plus grands, lisibles de loin. */}
      <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 'clamp(48px, min(26cqw, 46cqh), 360px)', fontWeight: 700, color: accent, margin: '4px 0', lineHeight: 1 }}>
        {affiche}
      </div>
      <div style={{ display: 'flex', gap: 10, width: '100%', maxWidth: 'min(90cqw, 480px)' }}>
        {!state.finished && (
          <button onClick={toggle} style={{ flex: 1, padding: '12px 10px', borderRadius: 10, border: 'none', cursor: 'pointer', fontSize: 'clamp(14px, 2.6cqmin, 20px)', fontWeight: 700, fontFamily: 'inherit', background: 'var(--green)', color: '#fff' }}>
            {running ? '⏸ Pause' : '▶ Reprendre'}
          </button>
        )}
        <button onClick={reset} style={{ flex: 1, padding: '12px 10px', borderRadius: 10, border: '1px solid var(--border2)', background: 'transparent', color: 'var(--text)', fontSize: 'clamp(14px, 2.6cqmin, 20px)', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
          Reset
        </button>
      </div>
    </div>
  )
}
