'use client'

import { Plus, X, CaretUp, CaretDown } from '@phosphor-icons/react'
import { INTENSITY_TYPES, DURATION_TYPES, createEmptyStep, createEmptyBlock, createEmptyCardioStructure } from '@/lib/cardioSteps'
import { PACE_BASES } from '@/lib/raceEstimates'

const inputStyle = { boxSizing: 'border-box', border: '1px solid var(--border2)', borderRadius: 8, padding: '7px 8px', fontSize: 13, outline: 'none', fontFamily: 'inherit', background: 'var(--bg2)', color: 'var(--text)' }
const labelStyle = { fontSize: 10, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 3, display: 'block' }

function moveItem(arr, idx, dir) {
  const to = idx + dir
  if (to < 0 || to >= arr.length) return arr
  const next = [...arr]
  ;[next[idx], next[to]] = [next[to], next[idx]]
  return next
}

function StepRow({ step, onChange, onRemove, onMoveUp, onMoveDown, canRemove }) {
  const set = (patch) => onChange({ ...step, ...patch })
  const setDuration = (patch) => set({ duration: { ...step.duration, ...patch } })
  const setTarget = (patch) => set({ target: { ...(step.target || { base: '', pctLow: '', pctHigh: '' }), ...patch } })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, background: 'var(--bg)', border: '1px solid var(--border2)', borderRadius: 10, padding: '10px 12px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <input
          value={step.name}
          onChange={e => set({ name: e.target.value })}
          placeholder="Nom du step (ex. Effort, Récup)"
          style={{ ...inputStyle, flex: 1 }}
        />
        <button type="button" onClick={onMoveUp} style={{ display: 'flex', background: 'none', border: 'none', padding: 4, cursor: 'pointer', color: 'var(--text3)' }}><CaretUp size={14} /></button>
        <button type="button" onClick={onMoveDown} style={{ display: 'flex', background: 'none', border: 'none', padding: 4, cursor: 'pointer', color: 'var(--text3)' }}><CaretDown size={14} /></button>
        {canRemove && (
          <button type="button" onClick={onRemove} style={{ display: 'flex', background: 'none', border: 'none', padding: 4, cursor: 'pointer', color: 'var(--text3)' }}><X size={15} /></button>
        )}
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <div>
          <span style={labelStyle}>Intensité</span>
          <select value={step.intensity} onChange={e => set({ intensity: e.target.value })} style={{ ...inputStyle, width: 150 }}>
            {INTENSITY_TYPES.map(t => <option key={t.key} value={t.key}>{t.label}</option>)}
          </select>
        </div>
        <div>
          <span style={labelStyle}>Fin du step</span>
          <select value={step.duration.type} onChange={e => setDuration({ type: e.target.value, value: e.target.value === 'open' ? null : (step.duration.value || (e.target.value === 'time' ? 60 : 200)) })} style={{ ...inputStyle, width: 150 }}>
            {DURATION_TYPES.map(t => <option key={t.key} value={t.key}>{t.label}</option>)}
          </select>
        </div>
        {step.duration.type !== 'open' && (
          <div>
            <span style={labelStyle}>{step.duration.type === 'time' ? 'Secondes' : 'Mètres'}</span>
            <input
              type="number" min="1"
              value={step.duration.value ?? ''}
              onChange={e => setDuration({ value: e.target.value === '' ? '' : parseInt(e.target.value) || 0 })}
              style={{ ...inputStyle, width: 90 }}
            />
          </div>
        )}
      </div>

      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, flexWrap: 'wrap' }}>
        <div>
          <span style={labelStyle}>Cible d&apos;allure</span>
          <select
            value={step.target?.base || ''}
            onChange={e => e.target.value ? setTarget({ base: e.target.value }) : set({ target: null })}
            style={{ ...inputStyle, width: 150 }}
          >
            <option value="">Aucune</option>
            {PACE_BASES.map(b => <option key={b.key} value={b.key}>{b.label}</option>)}
          </select>
        </div>
        {step.target?.base && (
          <>
            <div>
              <span style={labelStyle}>%1</span>
              <input type="number" value={step.target.pctLow ?? ''} onChange={e => setTarget({ pctLow: e.target.value === '' ? '' : parseFloat(e.target.value) })} style={{ ...inputStyle, width: 64, textAlign: 'center' }} />
            </div>
            <div>
              <span style={labelStyle}>%2</span>
              <input type="number" value={step.target.pctHigh ?? ''} onChange={e => setTarget({ pctHigh: e.target.value === '' ? '' : parseFloat(e.target.value) })} style={{ ...inputStyle, width: 64, textAlign: 'center' }} />
            </div>
          </>
        )}
      </div>

      <input
        value={step.note || ''}
        onChange={e => set({ note: e.target.value })}
        placeholder="Note (optionnel)"
        style={{ ...inputStyle, width: '100%' }}
      />
    </div>
  )
}

function BlockCard({ block, blockIdx, onChange, onRemove, onMoveUp, onMoveDown, canRemove }) {
  const set = (patch) => onChange({ ...block, ...patch })
  const setSteps = (steps) => set({ steps })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, border: '1px solid var(--border2)', borderRadius: 12, padding: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.04em', color: 'var(--text3)' }}>BLOC {blockIdx + 1}</span>
        <div style={{ flex: 1 }} />
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text3)' }}>
          Répéter
          <input
            type="number" min="1"
            value={block.repeat}
            onChange={e => set({ repeat: Math.max(1, parseInt(e.target.value) || 1) })}
            style={{ ...inputStyle, width: 54, textAlign: 'center' }}
          />
          fois
        </label>
        <button type="button" onClick={onMoveUp} style={{ display: 'flex', background: 'none', border: 'none', padding: 4, cursor: 'pointer', color: 'var(--text3)' }}><CaretUp size={14} /></button>
        <button type="button" onClick={onMoveDown} style={{ display: 'flex', background: 'none', border: 'none', padding: 4, cursor: 'pointer', color: 'var(--text3)' }}><CaretDown size={14} /></button>
        {canRemove && (
          <button type="button" onClick={onRemove} style={{ display: 'flex', background: 'none', border: 'none', padding: 4, cursor: 'pointer', color: 'var(--text3)' }}><X size={15} /></button>
        )}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {block.steps.map((step, stepIdx) => (
          <StepRow
            key={stepIdx}
            step={step}
            canRemove={block.steps.length > 1}
            onChange={patch => setSteps(block.steps.map((s, i) => i === stepIdx ? patch : s))}
            onRemove={() => setSteps(block.steps.filter((_, i) => i !== stepIdx))}
            onMoveUp={() => setSteps(moveItem(block.steps, stepIdx, -1))}
            onMoveDown={() => setSteps(moveItem(block.steps, stepIdx, 1))}
          />
        ))}
      </div>

      <button
        type="button"
        onClick={() => setSteps([...block.steps, createEmptyStep()])}
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '8px 6px', borderRadius: 8, border: '1px solid var(--border2)', background: 'var(--bg)', color: 'var(--text3)', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}
      >
        <Plus size={13} weight="bold" /> Step
      </button>
    </div>
  )
}

// Éditeur de la structure cardio (program_exercises.cardio_structure) d'un exercice cardio — blocs
// de steps typés (intensité, durée temps/distance/libre, cible d'allure optionnelle), sur le
// modèle de TimerConfigEditor.js : composant contrôlé (value/onChange), ne sauvegarde rien
// lui-même. Voir lib/cardioSteps.js pour la forme exacte de `value`.
export default function CardioStepEditor({ value, onChange }) {
  const structure = value || createEmptyCardioStructure()
  const setBlocks = (blocks) => onChange({ ...structure, blocks })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {structure.blocks.map((block, blockIdx) => (
        <BlockCard
          key={blockIdx}
          block={block}
          blockIdx={blockIdx}
          canRemove={structure.blocks.length > 1}
          onChange={patch => setBlocks(structure.blocks.map((b, i) => i === blockIdx ? patch : b))}
          onRemove={() => setBlocks(structure.blocks.filter((_, i) => i !== blockIdx))}
          onMoveUp={() => setBlocks(moveItem(structure.blocks, blockIdx, -1))}
          onMoveDown={() => setBlocks(moveItem(structure.blocks, blockIdx, 1))}
        />
      ))}
      <button
        type="button"
        onClick={() => setBlocks([...structure.blocks, createEmptyBlock()])}
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '10px 6px', borderRadius: 10, border: '1px solid var(--green)', background: 'var(--green-light)', color: 'var(--green)', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}
      >
        <Plus size={14} weight="bold" /> Bloc
      </button>
    </div>
  )
}
