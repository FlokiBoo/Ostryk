// Mesures saisies à côté des reps dans une série : la charge (kg), un temps de maintien (sec), ou
// les deux pour un maintien lesté. Portées par program_exercises.set_details[] (jsonb) : `kg`,
// `sec`, et `unites` (ordre d'affichage) quand le choix s'écarte du défaut.

export const UNITES_SERIE = {
  kg: { suffixe: 'kg', nom: 'Kg', pas: '0.5' },
  sec: { suffixe: 'sec', nom: 'Secondes', pas: '1' },
}

export const UNITES_PAR_DEFAUT = ['kg']

export const unitesParDefaut = (unites) => unites.length === 1 && unites[0] === 'kg'

// Le choix écrit par l'éditeur, sinon déduit des valeurs présentes (séries d'avant ce champ).
export function unitesDeSerie(setDetails) {
  const details = Array.isArray(setDetails) ? setDetails.filter(Boolean) : []
  const ecrites = details.map(d => d.unites).find(u => Array.isArray(u) && u.length)
  if (ecrites) {
    const connues = [...new Set(ecrites.filter(u => UNITES_SERIE[u]))]
    if (connues.length) return connues
  }
  if (!details.some(d => d.sec != null)) return UNITES_PAR_DEFAUT
  return details.some(d => d.kg != null) ? ['sec', 'kg'] : ['sec']
}

// Temps prescrit résumé pour un affichage en une ligne : "15" si tous les sets tiennent le même
// temps, "10/15/20" sinon. null quand l'exercice n'est pas un maintien ou n'a pas de temps écrit.
export function secondesPrescrites(setDetails) {
  if (!unitesDeSerie(setDetails).includes('sec')) return null
  const valeurs = setDetails.filter(Boolean).map(d => d.sec).filter(v => v != null)
  if (!valeurs.length) return null
  return [...new Set(valeurs)].length === 1 ? String(valeurs[0]) : valeurs.join('/')
}
