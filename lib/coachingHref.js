import { isRunMovement } from '@/lib/raceEstimates'

// Lien « lancer le coaching » d'une séance : l'écran de séance en mode coach, sur la fiche du
// sportif — le même que « Lancer un coaching » du tableau de bord. Une séance avec de la course
// reste sur l'ancienne vue de l'espace sportif, la seule à gérer allures et distances (Seance.js
// n'afficherait que des steppers Reps/Poids).
// session.program_exercises : au moins { name } ; absent, la séance est traitée comme sans course.
export function coachingHref({ athleteId, athleteToken, session }) {
  const aCourse = (session.program_exercises || []).some(e => e.name && isRunMovement(e.name))
  return aCourse && athleteToken
    ? `/s/${athleteToken}?coach=1&session=${session.id}&focus=1`
    : `/athletes/${athleteId}?coaching=${session.id}`
}
