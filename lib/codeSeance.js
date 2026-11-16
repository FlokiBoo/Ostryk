// Codes de séance (SA1, SA2, SB1…) et d'exercice (A1, A2, B1…).
//
// La séance porte sa lettre et son numéro en base (program_sessions.seance_lettre / seance_numero),
// saisis librement par le coach. Le code d'exercice, lui, n'est stocké nulle part : il se déduit de
// la position, bloc par bloc — même découpage que l'éditeur (groupExercisesIntoBlocks) et que
// l'espace sportif (construireBlocs) : une super série = une lettre, ses exercices = 1, 2, 3…
// Les exercices d'échauffement / retour au calme n'ont pas de code.

export function codeSeance(s) {
  const lettre = (s?.seance_lettre || '').trim()
  if (!lettre) return null
  return `S${lettre}${s.seance_numero ?? ''}`
}

export function normaliserLettre(v) {
  return (v || '').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 2)
}

const HORS_CODE = ['warmup', 'cooldown']

// rows : lignes program_exercises triées par order_index. Renvoie un tableau aligné sur rows
// (code ou null).
export function codesExercices(rows) {
  const codes = []
  let lettre = -1
  let rang = 0
  let precedent = null
  rows.forEach(r => {
    if (HORS_CODE.includes(r.block_type)) { codes.push(null); precedent = null; return }
    const memeBloc = precedent && r.superset_group && precedent.superset_group === r.superset_group && precedent.block_type === r.block_type
    if (memeBloc) rang += 1
    else { lettre += 1; rang = 1 }
    codes.push(`${String.fromCharCode(65 + lettre)}${rang}`)
    precedent = r
  })
  return codes
}

// { A1: 'Squat', A2: 'Pompes', … }
export function nomsParCode(rows) {
  const codes = codesExercices(rows)
  const map = {}
  rows.forEach((r, i) => { if (codes[i]) map[codes[i]] = { nom: (r.name || '').trim(), id: r.id } })
  return map
}

export const memeNom = (a, b) => (a || '').trim().toLowerCase() === (b || '').trim().toLowerCase()
