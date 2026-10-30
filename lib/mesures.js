// Suivi corporel (table mesures_corporelles) : champs partagés par l'écran du sportif, la route
// /api/athlete-view/[token]/mesures et le tableau de bord de la fiche client.

export const CHAMPS_MESURES = [
  { key: 'poids_kg', label: 'Poids', unite: 'kg', min: 20, max: 300 },
  { key: 'masse_grasse_pct', label: 'Masse grasse', unite: '%', min: 2, max: 70 },
  { key: 'tour_taille_cm', label: 'Tour de taille', unite: 'cm', min: 30, max: 250 },
  { key: 'tour_hanches_cm', label: 'Tour de hanches', unite: 'cm', min: 30, max: 250 },
  { key: 'tour_poitrine_cm', label: 'Tour de poitrine', unite: 'cm', min: 30, max: 250 },
  { key: 'tour_bras_cm', label: 'Tour de bras', unite: 'cm', min: 10, max: 100 },
  { key: 'tour_cuisse_cm', label: 'Tour de cuisse', unite: 'cm', min: 20, max: 150 },
  { key: 'tour_mollet_cm', label: 'Tour de mollet', unite: 'cm', min: 15, max: 100 },
]

// Saisie libre ("72,5") → nombre arrondi au dixième, ou null si vide / hors bornes plausibles.
export function valeurMesure(champ, v) {
  if (v === null || v === undefined || String(v).trim() === '') return null
  const n = Number(String(v).replace(',', '.'))
  if (!Number.isFinite(n) || n < champ.min || n > champ.max) return undefined
  return Math.round(n * 10) / 10
}

// Série datée d'un champ, du plus ancien au plus récent, sans les jours où il n'a pas été mesuré.
export function serie(mesures, key) {
  return (mesures || [])
    .filter(m => m[key] !== null && m[key] !== undefined)
    .map(m => ({ date: m.date, valeur: Number(m[key]) }))
    .sort((a, b) => a.date.localeCompare(b.date))
}
