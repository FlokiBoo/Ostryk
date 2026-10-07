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

// Série faite sur un maintien : il n'y a pas de colonne dédiée aux secondes, reps_done (texte)
// porte "5×10s", ou "10s" sans répétitions. parseInt() y lit toujours le premier nombre.
export function ecrireMaintien(reps, sec) {
  if (sec === null || sec === undefined) return reps === null || reps === undefined ? '' : String(reps)
  return `${reps === null || reps === undefined ? '' : `${reps}×`}${sec}s`
}

export function lireMaintien(texte) {
  const m = String(texte ?? '').replace(',', '.').match(/^\s*(?:(\d+)\s*[×x]\s*)?(\d+(?:\.\d+)?)\s*s\s*$/i)
  if (!m) return null
  return { reps: m[1] ? parseInt(m[1], 10) : null, sec: parseFloat(m[2]) }
}
