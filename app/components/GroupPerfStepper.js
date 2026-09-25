'use client'

import { useState } from 'react'
import { Plus, Minus } from '@phosphor-icons/react'

const stepBtn = {
  width: 20, height: 20, borderRadius: '50%', border: '1px solid var(--border2)', background: 'var(--bg)',
  display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--green)', cursor: 'pointer', padding: 0, flexShrink: 0,
}

// Version compacte du Stepper (repris de l'ancien SessionPlayer.js côté athlète) pour la saisie coach en direct
// pendant une séance de groupe : icônes 12px + valeur Cinzel 13px au lieu de la version "adulte"
// 34px/20px, pour tenir plusieurs athlètes × plusieurs séries sur un même écran. Le tap sur la
// valeur (soulignée en pointillé pour signaler qu'elle est tapable) ouvre le même pavé numérique
// que les boutons +/- écrivent — une seule source de vérité (onChange).
export function CompactStepper({ value, onChange, step = 1, suffix = '', decimal = false }) {
  const [padOpen, setPadOpen] = useState(false)
  const display = value === null || value === undefined || value === '' ? '—' : `${value}${suffix}`
  const numeric = parseFloat(value) || 0

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
      <button type="button" onClick={() => onChange(Math.max(0, numeric - step))} style={stepBtn}>
        <Minus size={12} weight="bold" />
      </button>
      <button type="button" onClick={() => setPadOpen(true)} style={{
        minWidth: 42, textAlign: 'center', fontFamily: 'var(--font-title)', fontSize: 13, color: 'var(--text)',
        background: 'none', border: 'none', borderBottom: '1px dotted var(--text3)', padding: '0 2px', cursor: 'pointer', lineHeight: '18px',
      }}>
        {display}
      </button>
      <button type="button" onClick={() => onChange(numeric + step)} style={stepBtn}>
        <Plus size={12} weight="bold" />
      </button>
      {padOpen && (
        <CompactNumericKeypad
          initialValue={value ?? ''}
          decimal={decimal}
          onClose={() => setPadOpen(false)}
          onValidate={v => { onChange(v); setPadOpen(false) }}
        />
      )}
    </div>
  )
}

function CompactNumericKeypad({ initialValue, decimal, onValidate, onClose }) {
  const [buf, setBuf] = useState('')
  const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', decimal ? ',' : '', '0', '←']

  const confirm = () => {
    const v = parseFloat(buf.replace(',', '.'))
    if (buf === '' || Number.isNaN(v)) return
    onValidate(v)
  }

  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,.4)', zIndex: 900,
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
    }}>
      <div onClick={e => e.stopPropagation()} style={{ width: '100%', maxWidth: 280, background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 'var(--rl)', padding: 12 }}>
        <div style={{ fontFamily: 'var(--font-title)', fontSize: 20, textAlign: 'center', color: 'var(--text)', marginBottom: 8 }}>
          {buf === '' ? initialValue : buf}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
          {keys.map((k, i) => k === '' ? <span key={i} /> : (
            <button key={i} type="button" onClick={() => {
              if (k === '←') setBuf(b => b.slice(0, -1))
              else setBuf(b => (b.length > 6 ? b : b + k))
            }} style={{ border: 'none', background: 'var(--bg2)', borderRadius: 8, height: 40, fontSize: 16, color: 'var(--text)', cursor: 'pointer' }}>
              {k}
            </button>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
          <button type="button" onClick={onClose} style={{ flex: 1, border: 'none', background: 'var(--bg2)', color: 'var(--text2)', borderRadius: 8, height: 40, fontSize: 13, cursor: 'pointer' }}>
            Annuler
          </button>
          <button type="button" onClick={confirm} style={{ flex: 2, border: 'none', background: 'var(--green)', color: '#fff', borderRadius: 8, height: 40, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
            Confirmer
          </button>
        </div>
      </div>
    </div>
  )
}
