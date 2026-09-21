'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import Toast from '@/app/components/Toast'

// Exporté pour que l'appelant puisse dire ce qu'il manque encore (voir AddActivityWizard, qui
// bloque son "Suivant" tant que les quatre ne sont pas renseignés).
export const WELLNESS_METRICS = [
  { key: 'sommeil',     label: 'Sommeil',     emoji: '🌙', inverse: false },
  { key: 'stress',      label: 'Stress',      emoji: '😰', inverse: true  },
  { key: 'courbatures', label: 'Courbatures', emoji: '💪', inverse: true  },
  { key: 'forme',       label: 'Forme',       emoji: '⚡', inverse: false },
]
const METRICS = WELLNESS_METRICS

function scoreColor(val, inverse) {
  if (!val) return 'var(--text3)'
  const s = inverse ? (11 - val) : val
  if (s >= 7) return '#22c55e'
  if (s >= 4) return '#f59e0b'
  return '#ef4444'
}

// Résumé compact une ligne (lecture seule)
function WellnessSummary({ data, suffix = '' }) {
  const filled = METRICS.filter(m => data?.[m.key + suffix])
  if (!filled.length) return (
    <span style={{ fontSize: 12, color: 'var(--text3)', fontStyle: 'italic' }}>Non rempli</span>
  )
  return (
    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
      {METRICS.map(m => {
        const v = data?.[m.key + suffix]
        if (!v) return null
        return (
          <span key={m.key} style={{ fontSize: 13, fontWeight: 700, color: scoreColor(v, m.inverse) }}>
            {m.emoji} {v}
          </span>
        )
      })}
    </div>
  )
}

// `hideValidate` : masque le bouton "Valider mon bien-être du jour" quand l'écran appelant porte
// déjà sa propre validation (wizard d'ajout d'activité) — deux validations à la suite pour la même
// chose perdaient le sportif (retour testeur).
// `onChange` : remonte la ligne courante à chaque saisie, pour que cet appelant sache ce qui
// manque encore. Doit être stable (useCallback), il est dans les dépendances de l'effet de
// chargement — une fonction recréée à chaque rendu relancerait le fetch en boucle.
export default function WellnessBlock({ athleteId, date, mode, athleteName, hideValidate = false, onChange }) {
  const [row, setRow] = useState(null) // null = loading, {} = no data, {...} = data
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState(null)
  const suffix = mode === 'coach' ? '_coach' : ''

  useEffect(() => {
    setRow(null)
    supabase.from('wellness').select('*')
      .eq('athlete_id', athleteId).eq('date', date).maybeSingle()
      .then(({ data }) => { setRow(data || {}); onChange?.(data || {}) })
  }, [athleteId, date, onChange])

  const set = async (key, val) => {
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      alert('Tu es hors ligne. Cette action nécessite une connexion internet — réessaie une fois reconnecté.')
      return
    }
    const field = key + suffix
    // Toggle : reclique sur la même valeur = effacer
    const newVal = row?.[field] === val ? null : val
    const updated = { ...(row || {}), athlete_id: athleteId, date, [field]: newVal }
    setRow(updated)
    onChange?.(updated)
    setSaving(true)
    await supabase.from('wellness')
      .upsert({ athlete_id: athleteId, date, [field]: newVal }, { onConflict: 'athlete_id,date' })
    setSaving(false)
  }

  const toggleValidated = async () => {
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      alert('Tu es hors ligne. Cette action nécessite une connexion internet — réessaie une fois reconnecté.')
      return
    }
    const newVal = !row?.validated
    const updated = { ...(row || {}), athlete_id: athleteId, date, validated: newVal }
    setRow(updated)
    onChange?.(updated)
    setSaving(true)
    await supabase.from('wellness')
      .upsert({ athlete_id: athleteId, date, validated: newVal }, { onConflict: 'athlete_id,date' })
    setSaving(false)
    setToast(newVal ? 'Bien-être validé' : 'Validation annulée')
  }

  if (row === null) return null

  const vals = {}
  METRICS.forEach(m => { vals[m.key] = row[m.key + suffix] ?? null })

  return (
    <div style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 'var(--rl)', padding: '10px 12px' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: mode === 'coach' ? 8 : 2 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
          {mode === 'coach' ? 'Mon évaluation' : 'Bien-être du jour'}
        </div>
        {saving && <div style={{ fontSize: 10, color: 'var(--text3)' }}>…</div>}
      </div>

      {mode !== 'coach' && (
        <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 8 }}>
          Une seule saisie par jour, valable pour toutes tes séances — normal si elle est déjà remplie.
        </div>
      )}

      {/* Vue sportif en lecture seule (côté coach uniquement) */}
      {mode === 'coach' && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, padding: '6px 8px', background: 'var(--bg2)', borderRadius: 'var(--r)' }}>
          <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text3)', flexShrink: 0 }}>
            {athleteName || 'Sportif'} :
          </span>
          <WellnessSummary data={row} suffix="" />
        </div>
      )}

      {/* Sélecteurs 1–10 */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {METRICS.map(m => (
          <div key={m.key} style={{ display: 'flex', alignItems: 'flex-start', gap: 6 }}>
            <div style={{ width: 80, fontSize: 12, fontWeight: 600, color: 'var(--text2)', flexShrink: 0, whiteSpace: 'nowrap', paddingTop: 5 }}>
              {m.emoji} {m.label}
            </div>
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', flex: 1 }}>
              {[1,2,3,4,5,6,7,8,9,10].map(n => {
                const active = vals[m.key] === n
                return (
                  <button key={n} onClick={() => set(m.key, n)} style={{
                    width: 27, height: 27, borderRadius: 6,
                    border: active ? 'none' : '1px solid var(--border2)',
                    background: active ? scoreColor(n, m.inverse) : 'var(--bg2)',
                    color: active ? '#fff' : 'var(--text3)',
                    fontSize: 11, fontWeight: 700, cursor: 'pointer', flexShrink: 0,
                  }}>{n}</button>
                )
              })}
            </div>
          </div>
        ))}
      </div>

      {mode !== 'coach' && !hideValidate && (
        <button onClick={toggleValidated} style={{
          marginTop: 10, width: '100%', padding: '10px', borderRadius: 'var(--r)',
          border: row?.validated ? '1px solid var(--border2)' : 'none',
          background: row?.validated ? 'var(--bg2)' : 'var(--green)',
          color: row?.validated ? 'var(--text2)' : '#fff',
          fontSize: 13, fontWeight: 700, cursor: 'pointer',
        }}>
          {row?.validated ? '✓ Validé' : 'Valider mon bien-être du jour'}
        </button>
      )}
      <Toast message={toast} show={!!toast} onDone={() => setToast(null)} />
    </div>
  )
}
