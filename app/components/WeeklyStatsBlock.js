'use client'

import { useState, useEffect, useRef } from 'react'
import { ChartBar, TrendUp, ClipboardText, ShareNetwork } from '@phosphor-icons/react'
import { supabase } from '@/lib/supabase'
import { shareCardImage } from '@/lib/shareCard'

function fmt(d) {
  return [d.getFullYear(), String(d.getMonth() + 1).padStart(2, '0'), String(d.getDate()).padStart(2, '0')].join('-')
}

export function getWeekRange(offset = 0) {
  const now = new Date()
  const day = now.getDay()
  const monday = new Date(now)
  monday.setDate(now.getDate() + (day === 0 ? -6 : 1 - day) + offset * 7)
  const sunday = new Date(monday)
  sunday.setDate(monday.getDate() + 6)
  return { start: fmt(monday), end: fmt(sunday) }
}

function getMonthRange(offset = 0) {
  const now = new Date()
  const first = new Date(now.getFullYear(), now.getMonth() + offset, 1)
  const last = new Date(now.getFullYear(), now.getMonth() + offset + 1, 0)
  return { start: fmt(first), end: fmt(last) }
}

function formatDur(min) {
  if (!min || min <= 0) return null
  const h = Math.floor(min / 60)
  const m = min % 60
  if (h === 0) return `${m}min`
  if (m === 0) return `${h}h`
  return `${h}h${String(m).padStart(2, '0')}`
}

function parseNum(val) {
  if (!val && val !== 0) return 0
  const str = String(val).trim()
  if (str.includes('-')) {
    const parts = str.split('-').map(s => parseFloat(s.trim())).filter(n => !isNaN(n))
    return parts.length === 2 ? (parts[0] + parts[1]) / 2 : parts[0] || 0
  }
  return parseFloat(str) || 0
}

function fmtKm(km) {
  if (!km) return null
  return km % 1 === 0 ? `${km} km` : `${km.toFixed(1)} km`
}

async function fetchStats(athleteId, start, end) {
  const [{ data: actLogs }, { data: comps }] = await Promise.all([
    supabase.from('activity_logs')
      .select('label, type, km, duration_minutes')
      .eq('athlete_id', athleteId)
      .gte('date', start)
      .lte('date', end),
    supabase.from('program_completions')
      .select('program_session_id, duration_minutes, distance_km, program_sessions(program_id, programs(activity_type))')
      .eq('athlete_id', athleteId)
      .gte('completed_at', start + 'T00:00:00')
      .lte('completed_at', end + 'T23:59:59'),
  ])

  const kmByLabel = {}, durByLabel = {}, countByLabel = {}
  ;(actLogs || []).forEach(l => {
    const key = l.label || l.type || 'Activité'
    countByLabel[key] = (countByLabel[key] || 0) + 1
    if (l.km) kmByLabel[key] = (kmByLabel[key] || 0) + parseFloat(l.km)
    if (l.duration_minutes) durByLabel[key] = (durByLabel[key] || 0) + parseInt(l.duration_minutes)
  })
  ;(comps || []).forEach(c => {
    const key = c.program_sessions?.programs?.activity_type || 'Musculation 🏋️'
    countByLabel[key] = (countByLabel[key] || 0) + 1
    if (c.duration_minutes) durByLabel[key] = (durByLabel[key] || 0) + parseInt(c.duration_minutes)
    if (c.distance_km) kmByLabel[key] = (kmByLabel[key] || 0) + parseFloat(c.distance_km)
  })
  const totalKm = Object.values(kmByLabel).reduce((s, v) => s + v, 0)
  const totalCardioMin = Object.values(durByLabel).reduce((s, v) => s + v, 0)

  let tonnage = 0
  const sessionIds = (comps || []).map(c => c.program_session_id).filter(Boolean)
  if (sessionIds.length > 0) {
    const { data: exercises } = await supabase
      .from('program_exercises')
      .select('id, sets, reps, kg')
      .in('program_session_id', sessionIds)

    if (exercises?.length) {
      const { data: logs } = await supabase
        .from('program_exercise_logs')
        .select('program_exercise_id, sets_done, reps_done, kg_done')
        .eq('athlete_id', athleteId)
        .in('program_exercise_id', exercises.map(e => e.id))

      const logsMap = {}
      ;(logs || []).forEach(l => { logsMap[l.program_exercise_id] = l })

      exercises.forEach(e => {
        const log = logsMap[e.id]
        const sets = parseNum(log?.sets_done || e.sets)
        const reps = parseNum(log?.reps_done || e.reps)
        const kg = parseNum(log?.kg_done || e.kg)
        tonnage += sets * reps * kg
      })
    }
  }

  return { kmByLabel, durByLabel, countByLabel, totalKm, totalCardioMin, tonnage }
}

const WELLNESS_METRICS = [
  { key: 'sommeil', label: 'Sommeil', emoji: '🌙', inverse: false },
  { key: 'stress', label: 'Stress', emoji: '😰', inverse: true },
  { key: 'courbatures', label: 'Courbatures', emoji: '💪', inverse: true },
  { key: 'forme', label: 'Forme', emoji: '⚡', inverse: false },
]

const FEEDBACK_METRICS = [
  { key: 'pleasure', label: 'Plaisir', emoji: '😄', inverse: false },
  { key: 'difficulty', label: 'Difficulté', emoji: '🔥', inverse: true },
]

function wellnessColor(val, inverse) {
  if (!val) return 'var(--text3)'
  const s = inverse ? (11 - val) : val
  if (s >= 7) return '#22c55e'
  if (s >= 4) return '#f59e0b'
  return '#ef4444'
}

async function fetchWellnessAverages(athleteId, start, end) {
  const { data } = await supabase.from('wellness')
    .select('sommeil, stress, courbatures, forme')
    .eq('athlete_id', athleteId)
    .gte('date', start).lte('date', end)

  const rows = data || []
  return WELLNESS_METRICS.map(m => {
    const vals = rows.map(r => r[m.key]).filter(v => v != null)
    const avg = vals.length ? vals.reduce((s, v) => s + v, 0) / vals.length : null
    return { ...m, avg, count: vals.length }
  })
}

async function fetchFeedbackAverages(athleteId, start, end) {
  const [{ data: comps }, { data: actLogs }] = await Promise.all([
    supabase.from('program_completions')
      .select('pleasure, difficulty')
      .eq('athlete_id', athleteId)
      .gte('completed_at', start + 'T00:00:00').lte('completed_at', end + 'T23:59:59'),
    supabase.from('activity_logs')
      .select('difficulty')
      .eq('athlete_id', athleteId)
      .gte('date', start).lte('date', end),
  ])
  const avg = (arr) => arr.length ? arr.reduce((s, v) => s + v, 0) / arr.length : null
  const pleasureVals = (comps || []).map(c => c.pleasure).filter(v => v != null)
  const difficultyVals = [...(comps || []).map(c => c.difficulty), ...(actLogs || []).map(a => a.difficulty)].filter(v => v != null)
  return {
    pleasure: avg(pleasureVals), pleasureCount: pleasureVals.length,
    difficulty: avg(difficultyVals), difficultyCount: difficultyVals.length,
  }
}

// Source : exercise_performance_history, et non program_exercise_logs. Deux raisons, qui se
// cumulaient pour rendre cette section systématiquement vide :
//   - program_exercise_logs n'a pas de colonne logged_at (c'est created_at) — la requête partait
//     donc en 400 silencieux et `logs` valait toujours null ;
//   - même avec le bon nom de colonne, cette table est upsertée sur (athlete_id,
//     program_exercise_id) : une seule ligne par exercice, portant la dernière valeur. Impossible
//     d'y trouver à la fois un "avant" et un "pendant", donc la comparaison ne renvoyait rien.
// exercise_performance_history est l'historique en ajout seul, écrit à chaque saisie (voir
// saveExerciseLog et flushQueue dans app/s/[token]/page.js) : c'est la vraie série temporelle.
async function fetchProgressions(athleteId, start, end) {
  const { data: logs } = await supabase
    .from('exercise_performance_history')
    .select('kg_done, logged_at, program_exercises(name)')
    .eq('athlete_id', athleteId)
    .lte('logged_at', end + 'T23:59:59')
    .order('logged_at', { ascending: true })

  const byExercise = {}
  ;(logs || []).forEach(l => {
    const name = l.program_exercises?.name
    const kg = parseNum(l.kg_done)
    if (!name || !kg) return
    if (!byExercise[name]) byExercise[name] = []
    byExercise[name].push({ kg, date: l.logged_at.slice(0, 10) })
  })

  const results = []
  Object.entries(byExercise).forEach(([name, entries]) => {
    const before = entries.filter(e => e.date < start)
    const during = entries.filter(e => e.date >= start && e.date <= end)
    if (!before.length || !during.length) return
    const prevKg = before[before.length - 1].kg
    const currentKg = Math.max(...during.map(e => e.kg))
    if (prevKg <= 0) return
    const pct = ((currentKg - prevKg) / prevKg) * 100
    if (pct > 0) results.push({ name, prevKg, currentKg, pct })
  })

  results.sort((a, b) => b.pct - a.pct)
  return results.slice(0, 8)
}

// Rassemble tout ce que WeekRecapModal attend en props pour une semaine donnée — même calcul que
// le bouton "Récap de la semaine" ci-dessous, mais réutilisable en dehors de ce composant (voir
// WeeklyRecapPopup, qui ouvre ce même récap automatiquement le week-end plutôt que sur clic).
export async function buildWeekRecapData(athleteId, start, end) {
  const [stats, wellnessAvg, feedbackAvg, progressions] = await Promise.all([
    fetchStats(athleteId, start, end),
    fetchWellnessAverages(athleteId, start, end),
    fetchFeedbackAverages(athleteId, start, end),
    fetchProgressions(athleteId, start, end),
  ])

  const { kmByLabel = {}, durByLabel = {}, countByLabel = {}, totalKm = 0, totalCardioMin = 0, tonnage = 0 } = stats
  const bigStats = [
    tonnage > 0 && { value: Math.round(tonnage).toLocaleString('fr-FR') + ' kg', label: '🏋️ Tonnage' },
    totalKm > 0 && { value: fmtKm(Math.round(totalKm * 10) / 10), label: '🗺️ Distance' },
    totalCardioMin > 0 && { value: formatDur(totalCardioMin), label: '⏱️ Temps total' },
  ].filter(Boolean)
  const activityLabels = [...new Set([...Object.keys(kmByLabel), ...Object.keys(durByLabel), ...Object.keys(countByLabel)])]

  const d = new Date(start + 'T00:00:00')
  const e = new Date(end + 'T00:00:00')
  const fmtShort = (x) => `${x.getDate()}/${String(x.getMonth() + 1).padStart(2, '0')}`
  const periodLabel = `${fmtShort(d)} au ${fmtShort(e)}`

  return {
    periodLabel, bigStats, activityLabels, kmByLabel, durByLabel, countByLabel,
    progressions, wellnessAvg, feedbackAvg,
    hasAny: tonnage > 0 || totalKm > 0 || totalCardioMin > 0 || activityLabels.length > 0,
  }
}

export default function WeeklyStatsBlock({ athleteId, refreshKey }) {
  const [mode, setMode] = useState('week')
  const [offset, setOffset] = useState(0)
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(false)
  const [showRecap, setShowRecap] = useState(false)
  const [view, setView] = useState('stats')
  const [progressions, setProgressions] = useState(null)
  const [wellnessAvg, setWellnessAvg] = useState(null)
  const [feedbackAvg, setFeedbackAvg] = useState(null)
  const cacheRef = useRef({})

  const openRecap = () => {
    setShowRecap(true)
    if (progressions === null) fetchProgressions(athleteId, stats.start, stats.end).then(setProgressions)
  }

  const toggleView = () => setView(v => v === 'stats' ? 'progression' : 'stats')

  const changeMode = (m) => { setMode(m); setOffset(0) }

  // Semaine par défaut, fixe — le client bascule manuellement sur "Mois" via le toggle ci-dessous.
  // Les deux vues restent en cache pour que l'aller-retour manuel s'affiche instantanément, sans
  // repasser par un état de chargement qui ferait sauter la page.
  useEffect(() => {
    if (!athleteId) return
    const { start, end } = mode === 'week' ? getWeekRange(offset) : getMonthRange(offset)
    const key = `${mode}:${offset}:${refreshKey}`
    const cached = cacheRef.current[key]

    setView('stats')
    setProgressions(null)
    if (cached) {
      setStats(cached.stats)
      setWellnessAvg(cached.wellnessAvg)
      setFeedbackAvg(cached.feedbackAvg)
      setLoading(false)
    } else {
      setLoading(true)
      setWellnessAvg(null)
      setFeedbackAvg(null)
    }

    let cancelled = false
    Promise.all([
      fetchStats(athleteId, start, end),
      fetchWellnessAverages(athleteId, start, end),
      fetchFeedbackAverages(athleteId, start, end),
    ]).then(([s, w, f]) => {
      if (cancelled) return
      const statsWithRange = { ...s, start, end }
      cacheRef.current[key] = { stats: statsWithRange, wellnessAvg: w, feedbackAvg: f }
      setStats(statsWithRange)
      setWellnessAvg(w)
      setFeedbackAvg(f)
      setLoading(false)
    })
    return () => { cancelled = true }
  }, [athleteId, mode, offset, refreshKey])

  useEffect(() => {
    if (view === 'progression' && stats && progressions === null) {
      fetchProgressions(athleteId, stats.start, stats.end).then(setProgressions)
    }
  }, [view, stats, progressions, athleteId])

  if (!stats && !loading) return null

  // Pendant un rechargement (changement de mode auto ou manuel), on garde l'ancien
  // contenu affiché plutôt que de le faire disparaître puis réapparaître — évite le
  // saut de mise en page que provoquait le cycle automatique semaine/mois.
  const showLoader = loading && !stats

  const periodLabel = (() => {
    if (!stats) return ''
    if (mode === 'week') {
      const d = new Date(stats.start + 'T00:00:00')
      const e = new Date(stats.end + 'T00:00:00')
      const fmtShort = (x) => `${x.getDate()}/${String(x.getMonth() + 1).padStart(2, '0')}`
      return `${fmtShort(d)} au ${fmtShort(e)}`
    }
    const d = new Date(stats.start + 'T00:00:00')
    return d.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })
  })()

  const { kmByLabel = {}, durByLabel = {}, countByLabel = {}, totalKm = 0, totalCardioMin = 0, tonnage = 0 } = stats || {}
  const totalMin = totalCardioMin
  const hasAny = tonnage > 0 || totalKm > 0 || totalMin > 0 || Object.keys(countByLabel).length > 0

  const bigStats = [
    tonnage > 0 && { value: Math.round(tonnage).toLocaleString('fr-FR') + ' kg', label: '🏋️ Tonnage' },
    totalKm > 0 && { value: fmtKm(Math.round(totalKm * 10) / 10), label: '🗺️ Distance' },
    totalMin > 0 && { value: formatDur(totalMin), label: '⏱️ Temps total' },
  ].filter(Boolean)

  const activityLabels = [...new Set([...Object.keys(kmByLabel), ...Object.keys(durByLabel), ...Object.keys(countByLabel)])]
  const hasBreakdown = activityLabels.length > 0

  return (
    <div style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 'var(--rl)', overflow: 'hidden' }}>

      {/* Header avec toggle */}
      <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.4px', flex: 1, display: 'flex', alignItems: 'center', gap: 5 }}>
          <ChartBar size={13} /> {mode === 'week' ? 'Ma semaine' : 'Mon mois'}
        </div>

        <div style={{ position: 'relative', display: 'flex', width: 100, flexShrink: 0, background: 'var(--bg2)', borderRadius: 20, padding: 2, border: '1px solid var(--border)' }}>
          <div style={{
            position: 'absolute', top: 2, bottom: 2, left: 2, width: 'calc(50% - 2px)',
            background: 'var(--bg)', border: '1px solid var(--border2)', borderRadius: 18,
            transform: mode === 'week' ? 'translateX(0)' : 'translateX(100%)',
            transition: 'transform .35s cubic-bezier(.4,0,.2,1)',
          }} />
          <button
            onClick={() => changeMode('week')}
            style={{
              position: 'relative', flex: 1, background: 'none', border: 'none', borderRadius: 18,
              padding: '3px 0', fontSize: 11, fontWeight: 700, cursor: 'pointer', zIndex: 1,
              color: mode === 'week' ? 'var(--text)' : 'var(--text3)', transition: 'color .35s',
            }}
          >Sem.</button>
          <button
            onClick={() => changeMode('month')}
            style={{
              position: 'relative', flex: 1, background: 'none', border: 'none', borderRadius: 18,
              padding: '3px 0', fontSize: 11, fontWeight: 700, cursor: 'pointer', zIndex: 1,
              color: mode === 'month' ? 'var(--text)' : 'var(--text3)', transition: 'color .35s',
            }}
          >Mois</button>
        </div>

        {hasAny && (
          <button onClick={toggleView} style={{
            background: 'var(--green-light)', color: 'var(--green)', border: '1px solid #B8EAD8',
            borderRadius: 20, padding: '3px 10px', fontSize: 11, fontWeight: 700, cursor: 'pointer',
            display: 'flex', alignItems: 'center', gap: 4, whiteSpace: 'nowrap', flexShrink: 0,
          }}>
            {view === 'stats' ? <><TrendUp size={12} /> Progression ›</> : '‹ Stats'}
          </button>
        )}
      </div>

      {/* Navigation période */}
      <div style={{ padding: '8px 14px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 8 }}>
        <button
          onClick={() => setOffset(o => o - 1)}
          style={{ background: 'none', border: 'none', fontSize: 18, color: 'var(--text2)', cursor: 'pointer', padding: '2px 6px', lineHeight: 1 }}
        >‹</button>
        <div style={{ flex: 1, textAlign: 'center', fontSize: 12, fontWeight: 700, color: 'var(--text2)', textTransform: 'capitalize' }}>
          {periodLabel}
        </div>
        <button
          onClick={() => setOffset(o => Math.min(0, o + 1))}
          disabled={offset >= 0}
          style={{ background: 'none', border: 'none', fontSize: 18, color: offset >= 0 ? 'var(--border2)' : 'var(--text2)', cursor: offset >= 0 ? 'default' : 'pointer', padding: '2px 6px', lineHeight: 1 }}
        >›</button>
      </div>

      {showLoader && (
        <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text3)', fontSize: 13 }}>…</div>
      )}

      {!showLoader && !hasAny && (
        <div style={{ padding: '16px 14px', textAlign: 'center', color: 'var(--text3)', fontSize: 13 }}>
          Aucune activité {mode === 'week' ? 'cette semaine' : 'ce mois-ci'}
        </div>
      )}

      {!showLoader && hasAny && view === 'stats' && (
        <>
          {bigStats.length > 0 && (
            <div style={{ display: 'flex', gap: 8, padding: '14px 14px 0' }}>
              {bigStats.map((stat, i) => (
                <div key={i} style={{ flex: 1, background: 'var(--green-light)', border: '1px solid #B8EAD8', borderRadius: 14, padding: '12px 6px', textAlign: 'center' }}>
                  <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--green)', lineHeight: 1.1 }}>{stat.value}</div>
                  <div style={{ fontSize: 9, color: 'var(--green)', fontWeight: 700, marginTop: 4, textTransform: 'uppercase', letterSpacing: '0.3px' }}>{stat.label}</div>
                </div>
              ))}
            </div>
          )}

          {wellnessAvg && wellnessAvg.some(m => m.avg != null) && (
            <div style={{ padding: '14px 14px 0' }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: 8 }}>
                Bien-être moyen
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                {wellnessAvg.map(m => (
                  <div key={m.key} style={{ flex: 1, background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 10, padding: '8px 2px', textAlign: 'center' }}>
                    <div style={{ fontSize: 14, lineHeight: 1 }}>{m.emoji}</div>
                    <div style={{ fontSize: 15, fontWeight: 800, color: wellnessColor(m.avg, m.inverse), marginTop: 3 }}>
                      {m.avg != null ? m.avg.toFixed(1) : '—'}
                    </div>
                    <div style={{ fontSize: 8, color: 'var(--text3)', fontWeight: 700, marginTop: 1, textTransform: 'uppercase', letterSpacing: '0.1px' }}>{m.label}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {feedbackAvg && (feedbackAvg.pleasure != null || feedbackAvg.difficulty != null) && (
            <div style={{ padding: '14px 14px 0' }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: 8 }}>
                Ressenti moyen
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                {FEEDBACK_METRICS.map(m => (
                  <div key={m.key} style={{ flex: 1, background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 10, padding: '8px 2px', textAlign: 'center' }}>
                    <div style={{ fontSize: 14, lineHeight: 1 }}>{m.emoji}</div>
                    <div style={{ fontSize: 15, fontWeight: 800, color: wellnessColor(feedbackAvg[m.key], m.inverse), marginTop: 3 }}>
                      {feedbackAvg[m.key] != null ? feedbackAvg[m.key].toFixed(1) : '—'}
                    </div>
                    <div style={{ fontSize: 8, color: 'var(--text3)', fontWeight: 700, marginTop: 1, textTransform: 'uppercase', letterSpacing: '0.1px' }}>{m.label}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {hasBreakdown && (
            <div style={{ padding: '14px 14px 0' }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: 8 }}>
                Activités pratiquées
              </div>
              {(() => {
                const n = activityLabels.length
                const size = n <= 3
                  ? { min: 92, emoji: 22, name: 12, badge: 11 }
                  : n <= 6
                    ? { min: 74, emoji: 18, name: 11, badge: 10 }
                    : { min: 60, emoji: 15, name: 10, badge: 9 }
                return (
                  <div style={{ display: 'grid', gridTemplateColumns: `repeat(auto-fill, minmax(${size.min}px, 1fr))`, gap: 8 }}>
                    {activityLabels.map(label => {
                      const emojiMatch = label.match(/\p{Emoji}/u)
                      const emoji = emojiMatch ? emojiMatch[0] : '🏅'
                      const name = label.replace(/\s*\p{Emoji}\s*/gu, '').trim() || label
                      return (
                        <div key={label} style={{
                          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                          gap: 2, background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 12, padding: '10px 6px', textAlign: 'center', overflow: 'hidden',
                        }}>
                          <div style={{ fontSize: size.emoji, lineHeight: 1 }}>{emoji}</div>
                          <div style={{ fontWeight: 700, fontSize: size.name, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '100%', marginTop: 2 }}>{name}</div>
                          {kmByLabel[label] > 0 && (
                            <span style={{ color: 'var(--green)', fontSize: size.badge, fontWeight: 700 }}>
                              {fmtKm(Math.round(kmByLabel[label] * 10) / 10)}
                            </span>
                          )}
                          {durByLabel[label] > 0 && (
                            <span style={{ color: 'var(--text3)', fontSize: size.badge, fontWeight: 700 }}>
                              {formatDur(durByLabel[label])}
                            </span>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )
              })()}
            </div>
          )}

          <div style={{ padding: '14px 14px 12px' }}>
            <button onClick={openRecap} style={{
              width: '100%', background: 'var(--green-light)', color: 'var(--green)', border: '1px solid #B8EAD8',
              borderRadius: 20, padding: '9px', fontSize: 13, fontWeight: 700, cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            }}>
              <ClipboardText size={14} /> Récap {mode === 'week' ? 'de la semaine' : 'du mois'}
            </button>
          </div>
        </>
      )}

      {!showLoader && hasAny && view === 'progression' && (
        <div style={{ padding: '12px 14px' }}>
          {progressions === null ? (
            <div style={{ textAlign: 'center', color: 'var(--text3)', fontSize: 13, padding: '20px 0' }}>…</div>
          ) : progressions.length === 0 ? (
            <div style={{ textAlign: 'center', color: 'var(--text3)', fontSize: 13, padding: '20px 0' }}>
              Aucune progression de charge détectée sur cette période.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {progressions.map(p => (
                <div key={p.name} style={{ display: 'flex', alignItems: 'center', gap: 12, background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 14, padding: '12px 14px' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</div>
                    <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2 }}>{p.prevKg} kg → {p.currentKg} kg</div>
                  </div>
                  <span style={{ background: 'var(--green-light)', color: 'var(--green)', borderRadius: 20, padding: '5px 10px', fontSize: 13, fontWeight: 800, flexShrink: 0 }}>
                    +{Math.round(p.pct)}%
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {showRecap && (
        <WeekRecapModal
          mode={mode}
          periodLabel={periodLabel}
          bigStats={bigStats}
          activityLabels={activityLabels}
          kmByLabel={kmByLabel}
          durByLabel={durByLabel}
          countByLabel={countByLabel}
          progressions={progressions}
          wellnessAvg={wellnessAvg}
          feedbackAvg={feedbackAvg}
          initialPage={0}
          onClose={() => setShowRecap(false)}
        />
      )}
    </div>
  )
}

export function WeekRecapModal({ mode, periodLabel, bigStats, activityLabels, kmByLabel, durByLabel, countByLabel, progressions, wellnessAvg, feedbackAvg, initialPage = 0, onClose, onShare }) {
  const [page, setPage] = useState(initialPage)
  const [sharing, setSharing] = useState(false)
  const touchStartX = useRef(0)
  const cardRef = useRef(null)

  const onTouchStart = (e) => { touchStartX.current = e.touches[0].clientX }
  const onTouchEnd = (e) => {
    const delta = e.changedTouches[0].clientX - touchStartX.current
    if (delta < -40) setPage(1)
    else if (delta > 40) setPage(0)
  }

  const share = async () => {
    setSharing(true)
    onShare?.()
    const statLine = bigStats.map(s => `${s.value} ${s.label}`).join(' · ')
    await shareCardImage(cardRef.current, {
      filename: 'bilan.png',
      title: `Récap ${mode === 'week' ? 'de la semaine' : 'du mois'}`,
      text: `${periodLabel}${statLine ? ' — ' + statLine : ''}`,
    })
    setSharing(false)
  }

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16 }}>
      <div onClick={e => e.stopPropagation()} style={{
        background: 'var(--bg)', borderRadius: 20, padding: '24px 20px', maxWidth: 420, width: '100%',
        boxShadow: '0 20px 60px rgba(0,0,0,0.4)', maxHeight: '90svh', overflow: 'hidden', display: 'flex', flexDirection: 'column',
      }}>
      <div ref={cardRef} style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 18 }}>
          <button onClick={() => setPage(0)} style={{
            visibility: page === 1 ? 'visible' : 'hidden', background: 'none', border: 'none', fontSize: 22, color: 'var(--text3)', cursor: 'pointer', padding: '2px 6px', lineHeight: 1,
          }}>‹</button>
          <div style={{ flex: 1, textAlign: 'center' }}>
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 8 }}>{page === 0 ? <ChartBar size={44} /> : <TrendUp size={44} />}</div>
            <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--text)' }}>
              {page === 0 ? `Récap ${mode === 'week' ? 'de la semaine' : 'du mois'}` : 'Progressions'}
            </div>
            <div style={{ fontSize: 13, color: 'var(--text3)', fontWeight: 600, textTransform: 'capitalize', marginTop: 2 }}>{periodLabel}</div>
          </div>
          <button onClick={() => setPage(1)} style={{
            visibility: page === 0 ? 'visible' : 'hidden', background: 'none', border: 'none', fontSize: 22, color: 'var(--text3)', cursor: 'pointer', padding: '2px 6px', lineHeight: 1,
          }}>›</button>
        </div>

        <div
          onTouchStart={onTouchStart}
          onTouchEnd={onTouchEnd}
          style={{ overflow: 'hidden', flex: 1, minHeight: 0 }}
        >
          <div style={{
            display: 'flex', width: '200%', transform: `translateX(${page === 0 ? '0' : '-50%'})`,
            transition: 'transform .25s ease', overflowY: 'auto',
          }}>
            <div style={{ width: '50%', paddingRight: 4 }}>
              {bigStats.length > 0 && (
                <div style={{ display: 'flex', gap: 8, marginBottom: 18 }}>
                  {bigStats.map((stat, i) => (
                    <div key={i} style={{ flex: 1, background: 'var(--green-light)', border: '1px solid #B8EAD8', borderRadius: 12, padding: '12px 8px', textAlign: 'center' }}>
                      <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--green)', lineHeight: 1.1 }}>{stat.value}</div>
                      <div style={{ fontSize: 9, color: 'var(--green)', fontWeight: 700, marginTop: 3, textTransform: 'uppercase', letterSpacing: '0.3px' }}>{stat.label}</div>
                    </div>
                  ))}
                </div>
              )}

              {wellnessAvg && wellnessAvg.some(m => m.avg != null) && (
                <>
                  <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: 10 }}>
                    Bien-être moyen
                  </div>
                  <div style={{ display: 'flex', gap: 3, marginBottom: 18 }}>
                    {wellnessAvg.map(m => (
                      <div key={m.key} style={{ flex: 1, minWidth: 0, background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 8, padding: '4px 1px', textAlign: 'center' }}>
                        <div style={{ fontSize: 10, lineHeight: 1 }}>{m.emoji}</div>
                        <div style={{ fontSize: 11, fontWeight: 800, color: wellnessColor(m.avg, m.inverse), marginTop: 1 }}>
                          {m.avg != null ? m.avg.toFixed(1) : '—'}
                        </div>
                        <div style={{ fontSize: 6.5, color: 'var(--text3)', fontWeight: 700, marginTop: 0, textTransform: 'uppercase', letterSpacing: '0.1px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.label}</div>
                      </div>
                    ))}
                  </div>
                </>
              )}

              {feedbackAvg && (feedbackAvg.pleasure != null || feedbackAvg.difficulty != null) && (
                <>
                  <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: 10 }}>
                    Ressenti moyen
                  </div>
                  <div style={{ display: 'flex', gap: 3, marginBottom: 18 }}>
                    {FEEDBACK_METRICS.map(m => (
                      <div key={m.key} style={{ flex: 1, minWidth: 0, background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 8, padding: '4px 1px', textAlign: 'center' }}>
                        <div style={{ fontSize: 10, lineHeight: 1 }}>{m.emoji}</div>
                        <div style={{ fontSize: 11, fontWeight: 800, color: wellnessColor(feedbackAvg[m.key], m.inverse), marginTop: 1 }}>
                          {feedbackAvg[m.key] != null ? feedbackAvg[m.key].toFixed(1) : '—'}
                        </div>
                        <div style={{ fontSize: 6.5, color: 'var(--text3)', fontWeight: 700, marginTop: 0, textTransform: 'uppercase', letterSpacing: '0.1px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.label}</div>
                      </div>
                    ))}
                  </div>
                </>
              )}

              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: 10 }}>
                Activités pratiquées
              </div>

              {(() => {
                const n = activityLabels.length
                const size = n <= 3
                  ? { min: 92, emoji: 22, name: 11, badge: 9.5 }
                  : n <= 6
                    ? { min: 74, emoji: 17, name: 9.5, badge: 8.5 }
                    : { min: 60, emoji: 14, name: 8.5, badge: 7.5 }
                return (
                  <div style={{ display: 'grid', gridTemplateColumns: `repeat(auto-fill, minmax(${size.min}px, 1fr))`, gap: 6, marginBottom: 8 }}>
                    {activityLabels.map(label => {
                      const emojiMatch = label.match(/\p{Emoji}/u)
                      const emoji = emojiMatch ? emojiMatch[0] : '🏅'
                      const name = label.replace(/\s*\p{Emoji}\s*/gu, '').trim() || label
                      return (
                        <div key={label} style={{
                          aspectRatio: '1', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                          gap: 2, background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 10, padding: '4px 3px', textAlign: 'center', overflow: 'hidden',
                        }}>
                          <div style={{ fontSize: size.emoji, lineHeight: 1 }}>{emoji}</div>
                          <div style={{ fontWeight: 700, fontSize: size.name, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '100%' }}>{name}</div>
                          {kmByLabel[label] > 0 && (
                            <span style={{ color: 'var(--green)', fontSize: size.badge, fontWeight: 700 }}>
                              {fmtKm(Math.round(kmByLabel[label] * 10) / 10)}
                            </span>
                          )}
                          {durByLabel[label] > 0 && (
                            <span style={{ color: 'var(--text3)', fontSize: size.badge, fontWeight: 700 }}>
                              {formatDur(durByLabel[label])}
                            </span>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )
              })()}
            </div>

            <div style={{ width: '50%', paddingLeft: 4 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: 10 }}>
                Charges en progression
              </div>

              {progressions === null ? (
                <div style={{ textAlign: 'center', color: 'var(--text3)', fontSize: 13, padding: '20px 0' }}>…</div>
              ) : progressions.length === 0 ? (
                <div style={{ textAlign: 'center', color: 'var(--text3)', fontSize: 13, padding: '20px 0' }}>
                  Aucune progression de charge détectée sur cette période.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 8 }}>
                  {progressions.map(p => (
                    <div key={p.name} style={{ display: 'flex', alignItems: 'center', gap: 12, background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 14, padding: '12px 14px' }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</div>
                        <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2 }}>{p.prevKg} kg → {p.currentKg} kg</div>
                      </div>
                      <span style={{ background: 'var(--green-light)', color: 'var(--green)', borderRadius: 20, padding: '5px 10px', fontSize: 13, fontWeight: 800, flexShrink: 0 }}>
                        +{Math.round(p.pct)}%
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'center', gap: 6, margin: '14px 0 4px' }}>
          {[0, 1].map(i => (
            <button key={i} onClick={() => setPage(i)} style={{
              width: 7, height: 7, borderRadius: '50%', border: 'none', padding: 0, cursor: 'pointer',
              background: page === i ? 'var(--green)' : 'var(--border2)',
            }} />
          ))}
        </div>
      </div>

        <div style={{ display: 'flex', gap: 8, marginTop: 6, flexShrink: 0 }}>
          <button onClick={share} disabled={sharing} style={{
            flex: 1, background: 'var(--bg2)', color: 'var(--text)', border: '1px solid var(--border2)', borderRadius: 20,
            padding: '13px 0', fontSize: 15, fontWeight: 700, cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
          }}>
            {sharing ? '…' : <><ShareNetwork size={16} /> Partager</>}
          </button>
          <button onClick={onClose} style={{
          flex: 2, background: 'var(--green)', color: '#fff', border: 'none', borderRadius: 20,
          padding: '13px 0', fontSize: 15, fontWeight: 700, cursor: 'pointer',
        }}>
          Fermer
        </button>
      </div>
      </div>
    </div>
  )
}
