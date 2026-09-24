'use client'

import { useState, useEffect, useCallback } from 'react'
import { Target, Wrench, Plus } from '@phosphor-icons/react'
import { supabase } from '@/lib/supabase'
import { JOINT_TESTS } from '@/lib/jointTests'
import { scoreJoint, scoreQualitativeJoint, jointTestKey } from '@/lib/jointTestThresholds'
import NewMobilityTestModal from './NewMobilityTestModal'

const ACCENT = '#2D3A30' // = var(--vert-foret) — valeur figée pour permettre le calcul d'opacité hexa ci-dessous

function polarPoint(cx, cy, r, angleDeg) {
  const rad = (angleDeg - 90) * (Math.PI / 180)
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) }
}

// Radar articulaire (Épaule/Hanche/Cheville/Colonne) + liste simple des valeurs.
// NewMobilityTestModal (flux de saisie d'un nouveau test) s'ouvre en touchant le radar.
export default function MobilityRadarBlock({ athleteId }) {
  const [joints, setJoints] = useState(null) // { joint: score|null }
  const [showNewTest, setShowNewTest] = useState(false)

  const loadJointScores = useCallback(() => {
    if (!athleteId) return
    supabase.from('joint_test_entries').select('*').eq('athlete_id', athleteId)
      .then(({ data }) => {
        const byTest = {}
        ;(data || []).forEach(e => {
          const k = jointTestKey(e.joint, e.test_name)
          if (!byTest[k]) byTest[k] = e
        })
        const scores = {}
        JOINT_TESTS.forEach(g => {
          scores[g.joint] = g.qualitative
            ? scoreQualitativeJoint(g.joint, g.tests, byTest)
            : scoreJoint(g.joint, g.tests, byTest)
        })
        setJoints(scores)
      })
  }, [athleteId])

  useEffect(() => { loadJointScores() }, [loadJointScores])

  const closeNewTest = () => { setShowNewTest(false); loadJointScores() }

  if (!joints) return null

  const axes = JOINT_TESTS.map(g => g.joint)
  const values = axes.map(a => joints[a])
  const hasAnyData = values.some(v => v != null)

  const size = 220
  const cx = size / 2, cy = size / 2, maxR = 82
  const n = axes.length
  const angleStep = 360 / n

  const ringLevels = [25, 50, 75, 100]
  const dataPoints = axes.map((a, i) => {
    const v = values[i] ?? 0
    return polarPoint(cx, cy, (v / 100) * maxR, i * angleStep)
  })
  const polygonPath = dataPoints.map(p => `${p.x},${p.y}`).join(' ')

  const overall = values.some(v => v != null)
    ? Math.round(values.filter(v => v != null).reduce((a, b) => a + b, 0) / values.filter(v => v != null).length)
    : null

  return (
    <div style={{ background: 'var(--card-white)', border: '1px solid var(--ostryk-border)', borderRadius: 'var(--ostryk-card-radius)', padding: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--text)', display: 'flex', alignItems: 'center', gap: 6 }}><Target size={15} weight="light" color="var(--vert-foret)" /> Mobilité</div>

      {hasAnyData ? (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
          <button onClick={() => setShowNewTest(true)} title="Toucher pour lancer un nouveau test"
            style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', display: 'flex' }}>
          <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
            {ringLevels.map(lvl => {
              const pts = axes.map((_, i) => polarPoint(cx, cy, (lvl / 100) * maxR, i * angleStep))
              return (
                <polygon key={lvl} points={pts.map(p => `${p.x},${p.y}`).join(' ')}
                  fill="none" stroke="var(--border2)" strokeWidth="1" />
              )
            })}
            {axes.map((_, i) => {
              const p = polarPoint(cx, cy, maxR, i * angleStep)
              return <line key={i} x1={cx} y1={cy} x2={p.x} y2={p.y} stroke="var(--border2)" strokeWidth="1" />
            })}
            <polygon points={polygonPath} fill={`${ACCENT}33`} stroke={ACCENT} strokeWidth="2" />
            {dataPoints.map((p, i) => (
              <circle key={i} cx={p.x} cy={p.y} r="3.5" fill={ACCENT} />
            ))}
            {axes.map((a, i) => {
              const labelP = polarPoint(cx, cy, maxR + 20, i * angleStep)
              const dx = labelP.x - cx
              // Sur les axes proches de l'horizontale, le texte centré déborde du cadre SVG
              // (ex. "Poignet"/"Genou") : on ancre le texte vers l'intérieur du côté concerné.
              const anchor = Math.abs(dx) < 8 ? 'middle' : (dx > 0 ? 'end' : 'start')
              return (
                <text key={a} x={labelP.x} y={labelP.y} textAnchor={anchor} dominantBaseline="middle"
                  fontSize="11" fontWeight="700" fill="var(--text2)">
                  {a}
                </text>
              )
            })}
            <text x={cx} y={cy - 4} textAnchor="middle" fontSize="26" fontWeight="800" fill="var(--text)">
              {overall ?? '—'}
            </text>
            <text x={cx} y={cy + 14} textAnchor="middle" fontSize="10" fill="var(--text3)">/100</text>
          </svg>
          </button>
          <div style={{ fontSize: 10, color: 'var(--ostryk-text3)' }}>Toucher le radar pour lancer un nouveau test</div>

          <div style={{ width: '100%', marginTop: 8 }}>
            {axes.map((a, i) => (
              <div key={a} style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
                padding: '10px 2px', borderTop: '1px solid var(--ostryk-border)',
              }}>
                <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>{a}</span>
                {values[i] != null ? (
                  <span style={{ fontSize: 15, fontWeight: 800, color: 'var(--vert-foret)' }}>{Math.round(values[i])}</span>
                ) : (
                  <span style={{ fontSize: 13, color: 'var(--ostryk-text3)' }}>—</span>
                )}
              </div>
            ))}
          </div>

          {(() => {
            const PRIORITY_THRESHOLD = 70
            const scored = axes.map((a, i) => ({ joint: a, score: values[i] })).filter(x => x.score != null)
            const weakest = scored.filter(x => x.score < PRIORITY_THRESHOLD).sort((a, b) => a.score - b.score)
            if (!weakest.length) return null
            return (
              <div style={{ width: '100%', background: '#FEF3C7', border: '1px solid #FCD34D', borderRadius: 'var(--r)', padding: '10px 12px', marginTop: 4 }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: '#92400E', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: 3, display: 'flex', alignItems: 'center', gap: 4 }}>
                  <Wrench size={11} /> À travailler en priorité
                </div>
                <div style={{ fontSize: 12, color: '#92400E' }}>
                  {weakest.map(w => `${w.joint} (${Math.round(w.score)})`).join(' · ')}
                </div>
              </div>
            )
          })()}
        </div>
      ) : (
        <button onClick={() => setShowNewTest(true)} style={{
          background: 'var(--green-light)', border: '1px dashed #B8EAD8', borderRadius: 'var(--r)', padding: '18px 14px',
          cursor: 'pointer', fontFamily: 'inherit', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
        }}>
          <span style={{ display: 'flex', color: 'var(--vert-foret)' }}><Plus size={20} weight="light" /></span>
          <span style={{ fontWeight: 700, fontSize: 13, color: 'var(--vert-foret)' }}>Lancer ton premier test de mobilité</span>
        </button>
      )}

      {showNewTest && <NewMobilityTestModal athleteId={athleteId} onClose={closeNewTest} />}
    </div>
  )
}
