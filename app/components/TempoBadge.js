'use client'

import { useState } from 'react'
import { Timer, X } from '@phosphor-icons/react'

// Un tempo "3010" se lit chiffre par chiffre : excentrique / pause basse / concentrique / pause
// haute. "X" veut dire "le plus vite possible" sur cette phase (utilisé en concentrique explosif).
const TEMPO_PHASES = [
  { label: 'Descente (excentrique)' },
  { label: 'Pause en bas' },
  { label: 'Montée (concentrique)' },
  { label: 'Pause en haut' },
]

function describeDigit(d) {
  if (d == null) return null
  return d.toUpperCase() === 'X' ? 'Le plus vite possible' : `${d} seconde${d === '1' ? '' : 's'}`
}

// Résume les tempos saisis par set (program_exercises.set_details[].tempo) en une seule chaîne à
// afficher : un tempo unique si tous les sets saisis sont identiques, sinon le détail par set pour
// ne pas faire croire à l'athlète qu'un seul tempo s'applique à toute la série.
export function getTempoDisplay(setDetails) {
  if (!Array.isArray(setDetails)) return null
  const tempos = setDetails.map(d => d?.tempo || null)
  if (!tempos.some(Boolean)) return null
  const distinct = [...new Set(tempos.filter(Boolean))]
  if (distinct.length === 1 && tempos.every(t => t === distinct[0] || !t)) return distinct[0]
  return tempos.map((t, i) => t ? `S${i + 1} ${t}` : null).filter(Boolean).join(' · ')
}

// Badge "Tempo 3010" affiché sous le nom de l'exercice — au tap, explique la lecture du tempo
// (une saisie par exercice, rarement consultée : on évite d'occuper l'écran en permanence avec le
// détail des 4 phases).
export default function TempoBadge({ tempo }) {
  const [open, setOpen] = useState(false)
  if (!tempo) return null
  const digits = /^\d{4}$/.test(tempo) || /^[\dX]{4}$/i.test(tempo) ? tempo.split('') : null

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 5, marginTop: 6,
          background: '#EFF6FF', border: '1px solid #BFDBFE', color: '#1D4ED8',
          borderRadius: 20, padding: '4px 10px', fontSize: 12, fontWeight: 700, cursor: 'pointer',
        }}
      >
        <Timer size={13} weight="bold" /> Tempo {tempo}
      </button>
      {open && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 300, display: 'flex', alignItems: 'flex-end' }}>
          <div onClick={() => setOpen(false)} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.45)' }} />
          <div style={{
            position: 'relative', width: '100%', background: 'var(--card-white, #fff)', borderRadius: '16px 16px 0 0',
            padding: '18px 18px calc(18px + env(safe-area-inset-bottom))', maxHeight: '70vh', overflowY: 'auto',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <span style={{ fontSize: 17, fontWeight: 700 }}>Tempo {tempo}</span>
              <button onClick={() => setOpen(false)} style={{ background: 'none', border: 'none', padding: 4, cursor: 'pointer', color: 'var(--text)' }}>
                <X size={18} />
              </button>
            </div>
            {digits ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {TEMPO_PHASES.map((phase, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{
                      minWidth: 32, height: 32, borderRadius: '50%', background: '#EFF6FF', color: '#1D4ED8',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 800, flexShrink: 0,
                    }}>
                      {digits[i]}
                    </span>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 600 }}>{phase.label}</div>
                      <div style={{ fontSize: 12, color: 'var(--text2)' }}>{describeDigit(digits[i])}</div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ fontSize: 13, color: 'var(--text2)' }}>{tempo}</div>
            )}
          </div>
        </div>
      )}
    </>
  )
}
