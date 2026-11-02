// Copie d'une ligne program_exercises vers une autre séance : TOUTES les colonnes sont reprises,
// sauf ce qui identifie la ligne d'origine. Les copies listaient auparavant leurs champs à la main
// et oubliaient set_details (reps / charge / secondes / tempo saisis série par série), block_type,
// cardio_structure… : seule la note survivait à une duplication. Une colonne ajoutée plus tard
// sera copiée d'office.
//
// `e` doit être une ligne brute lue en base (select('*') / program_exercises(*)), pas l'objet
// transformé d'un state de page (champs vides convertis en '', clés _key, log…).
const COLONNES_PROPRES_A_LA_LIGNE = ['id', 'program_session_id', 'created_at', 'updated_at']

export function copieExercice(e, champs = {}) {
  const copie = { ...e }
  COLONNES_PROPRES_A_LA_LIGNE.forEach(k => { delete copie[k] })
  return { ...copie, ...champs }
}
