// Historique d'un exercice pour le sportif : ce qu'il a saisi les fois précédentes sur le même
// mouvement, toutes séances et tous programmes confondus (un exercice n'a pas d'identité stable
// d'une séance à l'autre, seul son nom le relie). Construit à partir de ce que l'espace sportif a
// déjà en mémoire — aucune requête, donc disponible hors ligne.

const rempli = v => v !== null && v !== undefined && v !== ''
export const cleExercice = nom => (nom || '').trim().toLowerCase()

// → { [cleExercice]: [{ date, seance, series: [{ reps, kg, sec }], resume, note }] }, du plus récent
// au plus ancien ; les entrées sans date de validation (séance jamais terminée) passent à la fin.
export function historiqueParExercice({ programs, exerciseSets, exerciseLogs, completionDates, sessionExclueId }) {
  const out = {}
  ;(programs || []).forEach(prog => (prog.sessions || []).forEach(s => {
    if (s.id === sessionExclueId) return
    ;(s.exercises || []).forEach(e => {
      if (!e.name) return
      const series = (exerciseSets[e.id] || [])
        .filter(st => rempli(st.reps_done) || rempli(st.kg_done) || rempli(st.sec_done))
        .map(st => ({ reps: st.reps_done, kg: st.kg_done, sec: st.sec_done }))
      const log = exerciseLogs[e.id] || {}
      // Ancienne saisie globale (une ligne par exercice), d'avant les séries détaillées.
      const resume = series.length === 0 && (rempli(log.sets_done) || rempli(log.reps_done) || rempli(log.kg_done))
        ? { series: log.sets_done, reps: log.reps_done, kg: log.kg_done }
        : null
      const note = (log.note || '').trim() || null
      if (!series.length && !resume && !note) return
      ;(out[cleExercice(e.name)] ||= []).push({
        id: e.id, date: completionDates[s.id] || null, seance: s.title || prog.title || 'Séance', series, resume, note,
      })
    })
  }))
  Object.values(out).forEach(liste => liste.sort((a, b) => {
    if (a.date && b.date) return b.date.localeCompare(a.date)
    return a.date ? -1 : b.date ? 1 : 0
  }))
  return out
}
