'use client'

import WeeklyStatsBlock from '@/app/components/WeeklyStatsBlock'
import ProgressBlock from '@/app/components/ProgressBlock'
import PerformancesTab from './PerformancesTab'

// Onglet unique "Stats" : régularité (distance/temps/bien-être, progressions de charge) puis
// performances (badges + records, mobilité) — l'ancien onglet Performances y a été fusionné, un
// sportif ne savait pas lequel des deux ouvrir pour voir s'il progresse. "Objectifs" vit sur
// l'accueil. id="stats-records" : cible du "+ → Ajouter un record" (voir app/s/[token]/page.js).
export default function StatsTab({ athlete, activityRefreshKey }) {
  return (
    <>
      <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <WeeklyStatsBlock athleteId={athlete.id} refreshKey={activityRefreshKey} />
        <ProgressBlock athleteId={athlete.id} />
      </div>
      <div id="stats-records" style={{ scrollMarginTop: 16 }}>
        <PerformancesTab athlete={athlete} />
      </div>
    </>
  )
}
