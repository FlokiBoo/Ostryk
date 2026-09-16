// Structure cardio prescrite par le coach pour un exercice cardio (program_exercises.cardio_structure,
// JSONB) — remplace le texte libre par une séquence de blocs de steps typés, pour pouvoir l'exporter
// en .FIT (montres Garmin). target.base/pctLow/pctHigh réutilise exactement PACE_BASES (voir
// lib/raceEstimates.js) : même mécanisme de cible relative à l'athlète que pace_base/pct_low/pct_high
// sur l'exercice, juste une cible par step au lieu d'une seule par exercice — ce qui permet une cible
// différente en effort vs récup, ce que le modèle actuel ne peut pas exprimer.
//
// Forme :
// {
//   blocks: [
//     {
//       repeat: 4,               // 1 = pas de répétition
//       steps: [
//         {
//           name: 'Effort',
//           intensity: 'active',  // warmup | active | rest | cooldown
//           duration: { type: 'time', value: 180 },        // secondes, OU
//           // duration: { type: 'distance', value: 400 }, // mètres, OU
//           // duration: { type: 'open' },                 // l'athlète valide lui-même
//           target: { base: 'VMA', pctLow: 90, pctHigh: 92 }, // ou null
//           note: '',
//         },
//       ],
//     },
//   ],
// }

export const INTENSITY_TYPES = [
  { key: 'warmup', label: 'Échauffement' },
  { key: 'active', label: 'Effort' },
  { key: 'rest', label: 'Récupération' },
  { key: 'cooldown', label: 'Retour au calme' },
]

export const DURATION_TYPES = [
  { key: 'time', label: 'Temps' },
  { key: 'distance', label: 'Distance' },
  { key: 'open', label: 'Libre (validée par l\'athlète)' },
]

export function createEmptyStep(intensity = 'active') {
  return {
    name: '',
    intensity,
    duration: { type: 'time', value: intensity === 'rest' ? 60 : 180 },
    target: null,
    note: '',
  }
}

export function createEmptyBlock() {
  return { repeat: 1, steps: [createEmptyStep()] }
}

export function createEmptyCardioStructure() {
  return { blocks: [createEmptyBlock()] }
}

// true si la structure contient au moins un step réel (un exercice cardio_structure vide/null
// doit retomber sur l'affichage texte libre existant plutôt que sur un bloc vide).
export function hasCardioSteps(structure) {
  return !!structure?.blocks?.some(b => (b.steps || []).length > 0)
}
