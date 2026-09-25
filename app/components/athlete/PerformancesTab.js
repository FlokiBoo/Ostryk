'use client'

import BadgesBlock from '@/app/components/BadgesBlock'
import MobilityRadarBlock from '@/app/components/MobilityRadarBlock'
import TrackedMovementsBlock from '@/app/components/TrackedMovementsBlock'
import SwipeCarousel from './SwipeCarousel'

// Fusionne Force (radar bordeaux + liste Lift/Gym/Cardio) et Mobilité (radar vert-forêt + liste
// des 4 articulations) dans un carrousel swipe à 2 slides. N'est plus un onglet à part : affiché
// en bas de l'onglet Stats (StatsTab.js).
export default function PerformancesTab({ athlete }) {
  const slides = [
    {
      key: 'force',
      content: (
        <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>
          <BadgesBlock athleteId={athlete.id} weight={athlete.weight} badgeStandard={athlete.badge_standard} birthDate={athlete.birth_date} />
          <TrackedMovementsBlock athleteId={athlete.id} isCoach={false} />
        </div>
      ),
    },
    {
      key: 'mobilite',
      content: (
        <div style={{ padding: 16 }}>
          <MobilityRadarBlock athleteId={athlete.id} />
        </div>
      ),
    },
  ]

  return (
    <div style={{ padding: '16px 16px 0' }}>
      <div style={{ fontFamily: 'var(--font-title)', color: 'var(--bordeaux)', fontWeight: 600, fontSize: 20, textAlign: 'center', marginBottom: 12 }}>
        Mes performances
      </div>
      <SwipeCarousel slides={slides} />
    </div>
  )
}
