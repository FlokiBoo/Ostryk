// Suivi nutrition : constantes et calculs partagés entre l'onglet Nutrition du sportif, les routes
// /api/athlete-view/[token]/nutrition/* et le bloc nutrition de la fiche coach.

export const REPAS = [
  { key: 'petit_dejeuner', label: 'Petit-déjeuner', au: 'au petit-déjeuner' },
  { key: 'dejeuner', label: 'Déjeuner', au: 'au déjeuner' },
  { key: 'collation', label: 'Collation', au: 'à la collation' },
  { key: 'diner', label: 'Dîner', au: 'au dîner' },
]
export const REPAS_KEYS = REPAS.map(r => r.key)

// Repas proposé par défaut selon l'heure : le sportif note le plus souvent ce qu'il vient de manger.
export function repasDuMoment(date = new Date()) {
  const h = date.getHours()
  if (h < 11) return 'petit_dejeuner'
  if (h < 15) return 'dejeuner'
  if (h < 18) return 'collation'
  return 'diner'
}

// Date locale AAAA-MM-JJ (pas toISOString : à 23h30 en France, l'UTC est déjà le lendemain).
export function jourLocal(date = new Date()) {
  return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')].join('-')
}

const nombre = v => (v === null || v === undefined || v === '' || Number.isNaN(Number(v)) ? null : Number(v))
const arrondi = v => (v === null ? null : Math.round(v * 10) / 10)

// Valeurs pour 100 g → valeurs pour la quantité mangée.
export function valeursPourQuantite(pour100, quantiteG) {
  const q = Number(quantiteG) || 0
  const f = v => { const n = nombre(v); return n === null ? null : arrondi((n * q) / 100) }
  return { kcal: f(pour100.kcal), proteines: f(pour100.proteines), glucides: f(pour100.glucides), lipides: f(pour100.lipides) }
}

// Quand une étiquette ne donne pas les kcal, on les déduit des macros (4/4/9) plutôt que de
// laisser un trou dans les totaux de la journée.
export function kcalEstimees({ kcal, proteines, glucides, lipides }) {
  if (nombre(kcal) !== null) return nombre(kcal)
  if ([proteines, glucides, lipides].every(v => nombre(v) === null)) return null
  return Math.round((nombre(proteines) || 0) * 4 + (nombre(glucides) || 0) * 4 + (nombre(lipides) || 0) * 9)
}

export function totaux(entrees) {
  const t = { kcal: 0, proteines: 0, glucides: 0, lipides: 0 }
  for (const e of entrees || []) for (const k of Object.keys(t)) t[k] += Number(e[k]) || 0
  for (const k of Object.keys(t)) t[k] = Math.round(t[k])
  return t
}

// Ligne `aliments` → forme commune utilisée par la recherche et le formulaire d'ajout.
export function depuisAliment(a) {
  return {
    source: 'aliment', id: a.id, nom: a.name, marque: a.marque || null,
    statut: a.statut || 'verifie', portion_g: a.portion_g != null ? Number(a.portion_g) : null,
    pour100: { kcal: kcalEstimees({ kcal: a.kcal_100g, proteines: a.proteines_100g, glucides: a.glucides_100g, lipides: a.lipides_100g }), proteines: nombre(a.proteines_100g), glucides: nombre(a.glucides_100g), lipides: nombre(a.lipides_100g) },
  }
}

export function depuisCiqual(c) {
  return {
    source: 'ciqual', id: c.id, nom: c.name, marque: null, statut: 'verifie', portion_g: null,
    pour100: { kcal: kcalEstimees({ kcal: c.kcal, proteines: c.protein, glucides: c.carbs, lipides: c.fat }), proteines: nombre(c.protein), glucides: nombre(c.carbs), lipides: nombre(c.fat) },
  }
}
