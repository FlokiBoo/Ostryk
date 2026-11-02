'use client'

import { HMSField, NumberField } from './TimerFields'

const TYPES = [
  { key: 'EMOM', label: 'EMOM' },
  { key: 'AMRAP', label: 'AMRAP' },
  { key: 'TABATA', label: 'TABATA' },
  { key: 'FOR_TIME', label: 'FOR TIME' },
  { key: 'CUSTOM', label: 'Perso' },
]

export function defaultTimerConfig(type = 'EMOM') {
  if (type === 'EMOM') return { type: 'EMOM', roundSec: 60, rounds: 10 }
  if (type === 'AMRAP') return { type: 'AMRAP', totalSec: 720 }
  if (type === 'TABATA') return { type: 'TABATA', workSec: 20, restSec: 10, rounds: 8 }
  if (type === 'FOR_TIME') return { type: 'FOR_TIME', capSec: 0 }
  return { type: 'CUSTOM', steps: [{ type: 'ON', sec: 30 }], rounds: 1, restBetweenSec: 0 }
}

// Éditeur de configuration d'un timer lié à un exercice (label A1/B1/C1) ou à un circuit —
// contrairement à TimerModal, ne lance rien : ne fait que produire un objet config à sauvegarder.
export default function TimerConfigEditor({ value, onChange }) {
  const cfg = value || defaultTimerConfig()
  const set = (patch) => onChange({ ...cfg, ...patch })
  const setType = (type) => onChange(defaultTimerConfig(type))

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {TYPES.map(t => (
          <button key={t.key} type="button" onClick={() => setType(t.key)} style={{
            flex: '1 1 0', minWidth: 64, padding: '9px 6px', borderRadius: 10, cursor: 'pointer', fontSize: 12, fontWeight: 700,
            border: `1px solid ${cfg.type === t.key ? 'var(--green)' : 'var(--border2)'}`,
            background: cfg.type === t.key ? 'var(--green-light)' : 'var(--bg)',
            color: cfg.type === t.key ? 'var(--green)' : 'var(--text3)',
          }}>
            {t.label}
          </button>
        ))}
      </div>

      {cfg.type === 'EMOM' && (
        <>
          <HMSField label="Durée par round" seconds={cfg.roundSec} onChange={v => set({ roundSec: v })} min={1} />
          <NumberField label="Nombre de rounds" value={cfg.rounds} onChange={v => set({ rounds: v })} step={1} min={1} />
        </>
      )}

      {cfg.type === 'AMRAP' && (
        <HMSField label="Durée totale" seconds={cfg.totalSec} onChange={v => set({ totalSec: v })} min={1} />
      )}

      {cfg.type === 'FOR_TIME' && (
        <div>
          <HMSField label="Time cap (0 = sans limite)" seconds={cfg.capSec} onChange={v => set({ capSec: v })} min={0} />
          <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 6 }}>Le chrono monte ; mets-le en pause quand c&apos;est fini.</div>
        </div>
      )}

      {cfg.type === 'TABATA' && (
        <>
          <HMSField label="Travail" seconds={cfg.workSec} onChange={v => set({ workSec: v })} min={1} />
          <HMSField label="Repos" seconds={cfg.restSec} onChange={v => set({ restSec: v })} min={1} />
          <NumberField label="Nombre de rounds" value={cfg.rounds} onChange={v => set({ rounds: v })} step={1} min={1} />
        </>
      )}

      {cfg.type === 'CUSTOM' && (
        <>
          <div>
            <div style={{ fontSize: 11, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>Séquence</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 10 }}>
              {cfg.steps.map((s, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--bg)', border: '1px solid var(--border2)', borderRadius: 10, padding: '6px 8px' }}>
                  <span style={{
                    fontSize: 11, fontWeight: 800, borderRadius: 6, padding: '3px 8px', flexShrink: 0,
                    background: s.type === 'ON' ? 'var(--green-light)' : '#EFF6FF',
                    color: s.type === 'ON' ? 'var(--green)' : '#1D4ED8',
                  }}>
                    {s.type === 'ON' ? 'ON' : 'RÉCUP'}
                  </span>
                  <input type="number" value={s.sec} onChange={e => set({ steps: cfg.steps.map((st, idx) => idx === i ? { ...st, sec: Math.max(1, parseInt(e.target.value) || 1) } : st) })}
                    style={{ width: 60, boxSizing: 'border-box', padding: '6px', borderRadius: 8, border: '1px solid var(--border2)', background: 'var(--bg2)', color: 'var(--text)', fontSize: 13, fontWeight: 700, textAlign: 'center', outline: 'none', fontFamily: 'inherit' }} />
                  <span style={{ fontSize: 11, color: 'var(--text3)' }}>sec</span>
                  <div style={{ flex: 1 }} />
                  <button type="button" onClick={() => set({ steps: cfg.steps.filter((_, idx) => idx !== i) })} style={{ background: 'none', border: 'none', color: 'var(--text3)', fontSize: 15, cursor: 'pointer', padding: '0 2px' }}>×</button>
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="button" onClick={() => set({ steps: [...cfg.steps, { type: 'ON', sec: 30 }] })} style={{ flex: 1, padding: '10px 6px', borderRadius: 10, border: '1px solid var(--green)', background: 'var(--green-light)', color: 'var(--green)', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
                + ON
              </button>
              <button type="button" onClick={() => set({ steps: [...cfg.steps, { type: 'REST', sec: 15 }] })} style={{ flex: 1, padding: '10px 6px', borderRadius: 10, border: '1px solid #1D4ED8', background: '#EFF6FF', color: '#1D4ED8', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
                + Récup
              </button>
            </div>
          </div>
          <NumberField label="Nombre de rounds (répète la séquence)" value={cfg.rounds} onChange={v => set({ rounds: v })} step={1} min={1} />
          <HMSField label="Repos entre les rounds" seconds={cfg.restBetweenSec} onChange={v => set({ restBetweenSec: v })} min={0} />
        </>
      )}
    </div>
  )
}
