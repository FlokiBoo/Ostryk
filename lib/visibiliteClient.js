// Réglage du coach (programs.visible_client, program_sessions.visible_client). Seul un `false`
// explicite masque : une ligne lue sans la colonne reste visible.
export const estVisibleClient = (ligne) => ligne?.visible_client !== false

// Ce que le client a le droit de recevoir. Un programme dont toutes les séances sont masquées
// disparaît aussi : il s'afficherait sinon comme un programme vide, ou comme déjà terminé.
export function programmesPourClient(programmes) {
  return (programmes || []).filter(estVisibleClient).flatMap(p => {
    const seances = p.program_sessions || []
    const visibles = seances.filter(estVisibleClient)
    if (seances.length > 0 && visibles.length === 0) return []
    return [{ ...p, program_sessions: visibles }]
  })
}
