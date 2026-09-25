// Report d'une séance à une date choisie par le sportif ("Décaler" sur l'accueil) : la séance prend
// la date choisie et toutes les séances suivantes non faites du programme se recalent derrière elle,
// en gardant le rythme du programme. Écrit dans program_sessions.date (déjà utilisée par les séances
// libres), qui prime ensuite sur day_of_week / athlete_days_of_week pour l'affichage.
//
// Dates manipulées en "AAAA-MM-JJ" et calculées en UTC pur : aucune dépendance au fuseau du serveur.
// Jours de la semaine : 0 = lundi … 6 = dimanche (convention de lib/weekDays.js).

function toUtc(iso) {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d))
}
export function addDays(iso, n) {
  const d = toUtc(iso)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}
function weekday(iso) {
  return (toUtc(iso).getUTCDay() + 6) % 7
}
// Prochaine occurrence du jour `wd` strictement après `iso`.
function nextWeekdayAfter(iso, wd) {
  const n = (wd - weekday(iso) + 7) % 7
  return addDays(iso, n === 0 ? 7 : n)
}

export const isIsoDate = (v) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(toUtc(v).getTime())

// upcoming : séances non faites du programme, dans l'ordre (hors récurrentes), la séance décalée
// en tête. Écart entre deux séances consécutives, par ordre de priorité :
//  1. grille du coach (week_number + day_of_week sur les deux) : l'écart exact prévu au programme ;
//  2. jour fixé par le coach sur la suivante : sa prochaine occurrence ;
//  3. jours choisis par le sportif (athlete_days_of_week) : le prochain de ces jours ;
//  4. sinon 7 / séances conseillées par semaine, 2 jours par défaut.
export function planFrom(upcoming, date, { athleteDays = [], sessionsPerWeek = null } = {}) {
  if (!upcoming.length) return []
  const days = [...new Set(athleteDays || [])]
  const fallbackGap = sessionsPerWeek ? Math.max(1, Math.round(7 / sessionsPerWeek)) : 2
  const plan = [{ id: upcoming[0].id, date }]
  let prev = upcoming[0]
  let prevDate = date
  for (const s of upcoming.slice(1)) {
    let next
    const grid = s.week_number != null && s.day_of_week != null && prev.week_number != null && prev.day_of_week != null
    const gap = grid ? (s.week_number - prev.week_number) * 7 + (s.day_of_week - prev.day_of_week) : 0
    if (gap > 0) next = addDays(prevDate, gap)
    else if (s.day_of_week != null) next = nextWeekdayAfter(prevDate, s.day_of_week)
    else if (days.length) next = days.map(d => nextWeekdayAfter(prevDate, d)).sort()[0]
    else next = addDays(prevDate, fallbackGap)
    plan.push({ id: s.id, date: next })
    prev = s
    prevDate = next
  }
  return plan
}
