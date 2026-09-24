'use client'

import { EQUIPMENT_OPTIONS } from '@/lib/movementEquipment'

// Sélection multiple du matériel d'un mouvement, en chips à bascule.
// compact : version resserrée pour les formulaires en ligne de la liste /movements.
export default function EquipmentPicker({ selected, onChange, compact = false }) {
  function toggle(opt) {
    onChange(selected.includes(opt) ? selected.filter(o => o !== opt) : [...selected, opt])
  }

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: compact ? 4 : 8 }}>
      {EQUIPMENT_OPTIONS.map(opt => {
        const on = selected.includes(opt)
        return (
          <button
            key={opt}
            type="button"
            onClick={() => toggle(opt)}
            style={{
              padding: compact ? '4px 9px' : '8px 14px', border: '1px solid',
              borderRadius: 20, fontSize: compact ? 11 : 13, fontWeight: 700, cursor: 'pointer',
              borderColor: on ? 'transparent' : 'var(--border2)',
              background: on ? 'var(--green)' : 'var(--bg)',
              color: on ? '#fff' : 'var(--text2)',
              fontFamily: 'inherit',
            }}
          >{opt}</button>
        )
      })}
    </div>
  )
}
