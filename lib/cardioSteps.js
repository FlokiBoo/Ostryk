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

// Aplatit blocs+repeat → séquence plate de steps FIT (lib/fitExport.js, Phase 3) : le format .FIT
// natif ne connaît pas les blocs, la répétition y est un step spécial en fin de bloc qui renvoie en
// arrière de N steps (durationType 'repeatUntilStepsCmplt', voir doc Garmin) — les steps du bloc ne
// sont écrits qu'UNE fois dans le fichier, c'est la montre qui boucle à l'exécution. `messageIndex`
// (0, 1, 2…) est l'identité de chaque step FIT, y compris les marqueurs de répétition eux-mêmes ;
// `repeatFromIndex` d'un marqueur pointe vers le messageIndex du premier step du bloc qu'il répète.
export function flattenCardioStepsForExport(structure) {
  const steps = []
  let index = 0
  ;(structure?.blocks || []).forEach(block => {
    const startIndex = index
    ;(block.steps || []).forEach(step => {
      steps.push({ ...step, messageIndex: index })
      index++
    })
    if ((block.repeat || 1) > 1 && index > startIndex) {
      steps.push({ isRepeatMarker: true, messageIndex: index, repeatFromIndex: startIndex, repeatCount: block.repeat })
      index++
    }
  })
  return steps
}

// Catégories cardio existantes (voir isCardioMovementName/RUN_MOVEMENT_NAMES, lib/raceEstimates.js)
// → code sport de l'enum FIT (Profile.types.sport). Pas de code FIT dédié "ski erg" : 'training'
// (entraînement générique en intérieur) est le repli le plus proche. Run (et les tests de course
// "10km Run", "400m"...) n'a pas de mot-clé propre : c'est le repli par défaut.
const CARDIO_SPORT_MATCHERS = [
  { test: name => /\brow\b/i.test(name), sport: 'rowing' },
  { test: name => /\bski\b/i.test(name), sport: 'training' },
  { test: name => /\bbike\b/i.test(name), sport: 'cycling' },
]
export function movementNameToFitSport(name) {
  const found = CARDIO_SPORT_MATCHERS.find(m => m.test(name || ''))
  return found ? found.sport : 'running'
}
