// Export .FIT (fichier structuré lu par les montres Garmin et compatibles) d'un exercice cardio
// prescrit — construit entièrement côté navigateur (pas de route API), sur le même principe que
// lib/shareCard.js pour le téléchargement (Blob → <a download>). @garmin/fitsdk (SDK officiel,
// vérifié fonctionner tel quel dans un bundle navigateur — aucun accès Node/Buffer, uniquement
// ArrayBuffer/Uint8Array) encode le fichier.
//
// Point non documenté du SDK, trouvé par test empirique (voir commit) : l'Encoder ne reconnaît que
// les noms de champ de premier niveau du Profile FIT (ex. `durationValue`, `customTargetValueLow`),
// jamais les noms de sous-champs "amicaux" que renvoie le Decoder en lecture (ex. `durationTime`,
// `customTargetSpeedLow`) — un sous-champ passé par son nom est silencieusement ignoré, sans erreur.
// Toutes les valeurs ci-dessous sont donc déjà à l'échelle brute attendue par le champ de premier
// niveau (millisecondes, centimètres, mm/s...), jamais la valeur "lisible" (secondes, mètres, m/s).

import { Encoder, Profile } from '@garmin/fitsdk'
import { flattenCardioStepsForExport, movementNameToFitSport } from './cardioSteps'
import { computePaceForBasePct } from './raceEstimates'

const KMH_TO_MPS = 1 / 3.6

// Résout la cible d'allure d'un step (base + %bas-haut, relative à l'athlète via `known` =
// buildKnownRaces()) en vitesse absolue m/s — même mécanisme que l'allure affichée ailleurs côté
// athlète (app/s/[token]/page.js). Retourne null si la donnée athlète manque (pas de cible écrite
// dans ce cas, plutôt qu'une cible fausse).
function resolveTargetSpeedMps(target, known) {
  if (!target?.base) return null
  const lowKmh = computePaceForBasePct(target.base, target.pctLow, known)
  const highKmh = computePaceForBasePct(target.base, target.pctHigh, known)
  if (lowKmh == null || highKmh == null) return null
  const a = lowKmh * KMH_TO_MPS
  const b = highKmh * KMH_TO_MPS
  return { low: Math.min(a, b), high: Math.max(a, b) }
}

// `structure` : program_exercises.cardio_structure (voir lib/cardioSteps.js). `known` :
// buildKnownRaces() de l'athlète connecté (déjà chargé côté client pour l'affichage d'allure
// existant, voir lib/raceEstimates.js) — les cibles sans référence calculable pour cet athlète
// sont écrites en step "libre" (targetType 'open') plutôt qu'omises, pour ne pas produire un
// fichier qui semble incomplet.
export function buildCardioFitFile({ exerciseName, structure, known }) {
  const flatSteps = flattenCardioStepsForExport(structure)
  if (!flatSteps.length) return null

  const encoder = new Encoder()

  encoder.onMesg(Profile.MesgNum.FILE_ID, {
    type: 'workout',
    manufacturer: 'development',
    product: 0,
    timeCreated: new Date(),
  })

  encoder.onMesg(Profile.MesgNum.WORKOUT, {
    sport: movementNameToFitSport(exerciseName),
    capabilities: 0,
    numValidSteps: flatSteps.length,
    // 15 caractères : longueur usuelle affichée sur les montres/dans Garmin Connect pour un nom
    // de workout — un nom plus long est tronqué à l'affichage de toute façon.
    wktName: (exerciseName || 'Séance').slice(0, 15),
  })

  flatSteps.forEach(step => {
    if (step.isRepeatMarker) {
      encoder.onMesg(Profile.MesgNum.WORKOUT_STEP, {
        messageIndex: step.messageIndex,
        durationType: 'repeatUntilStepsCmplt',
        durationValue: step.repeatFromIndex, // messageIndex du premier step du bloc répété
        targetType: 'open',
        targetValue: step.repeatCount,
      })
      return
    }

    const mesg = {
      messageIndex: step.messageIndex,
      intensity: step.intensity || 'active',
    }
    if (step.name) mesg.wktStepName = step.name.slice(0, 15)
    if (step.note) mesg.notes = step.note

    if (step.duration?.type === 'time' && step.duration.value > 0) {
      mesg.durationType = 'time'
      mesg.durationValue = Math.round(step.duration.value * 1000) // s → ms
    } else if (step.duration?.type === 'distance' && step.duration.value > 0) {
      mesg.durationType = 'distance'
      mesg.durationValue = Math.round(step.duration.value * 100) // m → cm
    } else {
      mesg.durationType = 'open'
    }

    const speed = resolveTargetSpeedMps(step.target, known)
    if (speed) {
      mesg.targetType = 'speed'
      mesg.targetValue = 0 // 0 = cible personnalisée (pas une zone prédéfinie sur la montre)
      mesg.customTargetValueLow = Math.round(speed.low * 1000) // m/s → mm/s
      mesg.customTargetValueHigh = Math.round(speed.high * 1000)
    } else {
      mesg.targetType = 'open'
    }

    encoder.onMesg(Profile.MesgNum.WORKOUT_STEP, mesg)
  })

  return encoder.close()
}

// Déclenche le téléchargement — même pattern que shareCardImage (lib/shareCard.js) :
// Blob → URL.createObjectURL → <a download> caché → click() → revokeObjectURL.
export function downloadFitFile(bytes, filename) {
  const blob = new Blob([bytes], { type: 'application/octet-stream' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename.toLowerCase().endsWith('.fit') ? filename : `${filename}.fit`
  a.click()
  URL.revokeObjectURL(url)
}
