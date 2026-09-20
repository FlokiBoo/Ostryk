'use client'

import { FRONT_MUSCLES, BACK_MUSCLES, FRONT_VIEWBOX, BACK_VIEWBOX } from '@/app/data/bodyMap'

const NEUTRAL = '#E8C9AE'
const STROKE = '#C9A47E'

// Groupes musculaires numérotés — mêmes clés que MUSCLE_MAP (CelebrationModal). Ordre du haut du
// corps vers le bas (cou -> pieds), pas l'ordre de création historique — la numérotation `n` suit
// ce même ordre, pas les clés (renumérotée en même temps que le tri).
export const MUSCLE_GROUPS = [
  { n: 1, key: 'cou', label: 'Cou', color: '#F43F5E' },
  { n: 2, key: 'deltoïde-antérieur', label: 'Deltoïde antérieur', color: '#FB923C' },
  { n: 3, key: 'deltoïde-latéral', label: 'Deltoïde latéral', color: '#F97316' },
  { n: 4, key: 'deltoïde-postérieur', label: 'Deltoïde postérieur', color: '#C2410C' },
  { n: 5, key: 'pectoraux', label: 'Pectoraux', color: '#EF4444' },
  { n: 6, key: 'grand dorsal', label: 'Grand dorsal', color: '#14B8A6' },
  { n: 7, key: 'trapèzes', label: 'Trapèzes', color: '#10B981' },
  { n: 8, key: 'biceps', label: 'Biceps', color: '#F59E0B' },
  { n: 9, key: 'triceps', label: 'Triceps', color: '#EAB308' },
  { n: 10, key: 'avant-bras', label: 'Avant-bras', color: '#CA8A04' },
  { n: 11, key: 'abdominaux', label: 'Abdominaux', color: '#84CC16' },
  { n: 12, key: 'obliques', label: 'Obliques', color: '#22C55E' },
  { n: 13, key: 'lombaires', label: 'Lombaires', color: '#06B6D4' },
  { n: 14, key: 'psoas', label: 'Psoas', color: '#92400E' },
  { n: 15, key: 'fessiers', label: 'Fessiers', color: '#0EA5E9' },
  { n: 16, key: 'quadriceps', label: 'Quadriceps', color: '#3B82F6' },
  { n: 17, key: 'adducteurs', label: 'Adducteurs', color: '#6366F1' },
  { n: 18, key: 'ischio-jambiers', label: 'Ischio-jambiers', color: '#8B5CF6' },
  { n: 19, key: 'mollets', label: 'Mollets', color: '#D946EF' },
  { n: 20, key: 'tibial', label: 'Tibial', color: '#EC4899' },
  { n: 21, key: 'pieds', label: 'Pieds', color: '#78716C' },
]

export const COLOR_BY_GROUP = Object.fromEntries(MUSCLE_GROUPS.map(g => [g.key, g.color]))

// Articulations — liste plate (pas de couleur/schéma anatomique associé, contrairement aux
// muscles ci-dessus), même ordre haut du corps -> bas. Stockée à part de `muscles` sur `movements`
// (colonne `joints`, même convention texte libre : voir SessionBlockEditor).
export const JOINT_GROUPS = [
  { key: 'cou', label: 'Cou' },
  { key: 'épaules', label: 'Épaules' },
  { key: 'coudes', label: 'Coudes' },
  { key: 'poignets', label: 'Poignets' },
  { key: 'mains', label: 'Mains' },
  { key: 'colonne-vertébrale', label: 'Colonne vertébrale' },
  { key: 'hanches', label: 'Hanches' },
  { key: 'genoux', label: 'Genoux' },
  { key: 'chevilles', label: 'Chevilles' },
  { key: 'pieds', label: 'Pieds' },
]

function BodySVG({ view, width }) {
  const isFront = view === 'front'
  const list = isFront ? FRONT_MUSCLES : BACK_MUSCLES
  const viewBox = isFront ? FRONT_VIEWBOX : BACK_VIEWBOX

  return (
    <svg viewBox={viewBox} style={{ width, height: 'auto' }}>
      {list.map(m => (
        <path
          key={m.id}
          d={m.path}
          fill={m.group ? (COLOR_BY_GROUP[m.group] || NEUTRAL) : NEUTRAL}
          stroke={STROKE}
          strokeWidth="0.15"
          strokeLinejoin="round"
        />
      ))}
      <text x={isFront ? 17.5 : 54.5} y="91.5" textAnchor="middle" fontSize="2.4" fill={STROKE} fontWeight="700" fontFamily="sans-serif" letterSpacing="0.3">
        {isFront ? 'AVANT' : 'ARRIÈRE'}
      </text>
    </svg>
  )
}

export default function MuscleAnatomyDiagram() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'center', gap: 16 }}>
        <BodySVG view="front" width={150} />
        <BodySVG view="back" width={150} />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 16px' }}>
        {MUSCLE_GROUPS.map(g => (
          <div key={g.key} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ width: 18, height: 18, borderRadius: '50%', background: g.color, color: '#fff', fontSize: 10, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              {g.n}
            </span>
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{g.label}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
