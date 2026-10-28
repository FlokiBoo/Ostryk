import ciqualFoods from '@/lib/data/ciqual.json'

const norm = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()
const normalizedNames = ciqualFoods.map(f => norm(f.name))

// Les mots peuvent apparaître dans un ordre différent de celui du libellé CIQUAL
// (ex. "flocons avoine" doit trouver "Flocons d'avoine") : on exige juste que chaque
// mot de la recherche apparaisse quelque part, puis on classe par pertinence.
export function rechercherCiqual(query, limite = 10) {
  const q = norm(query || '')
  if (!q) return []
  const tokens = q.split(/\s+/).filter(Boolean)
  const startsWith = [], contains = [], allTokens = []

  for (let i = 0; i < ciqualFoods.length; i++) {
    const n = normalizedNames[i]
    if (n.startsWith(q)) startsWith.push(ciqualFoods[i])
    else if (n.includes(q)) contains.push(ciqualFoods[i])
    else if (tokens.length > 1 && tokens.every(t => n.includes(t))) allTokens.push(ciqualFoods[i])
  }
  return [...startsWith, ...contains, ...allTokens].slice(0, limite)
}

export function ciqualParId(id) {
  return ciqualFoods.find(f => f.id === id) || null
}
