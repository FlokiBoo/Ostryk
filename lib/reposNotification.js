// Notification locale de fin de repos (écran de séance, app/components/athlete/Seance.js).
// Programmée au lancement du repos, à l'heure de fin exacte : c'est le système qui la déclenche,
// donc elle arrive même écran verrouillé ou app en arrière-plan, quand le JavaScript de la WebView
// est suspendu et ne peut plus rien faire. Annulée si le sportif passe le repos.
//
// No-op silencieux hors app native (web), sur une app installée avant l'ajout du plugin (il faut
// reconstruire les apps pour qu'il existe côté natif — l'app charge le site en ligne, le JS arrive
// donc avant le natif), ou si la permission est refusée.

// Un seul repos à la fois : identifiant fixe, pour pouvoir l'annuler même après un rechargement.
const ID_REPOS = 7301

async function plugin() {
  try {
    const { Capacitor } = await import('@capacitor/core')
    if (!Capacitor.isNativePlatform() || !Capacitor.isPluginAvailable('LocalNotifications')) return null
    const { LocalNotifications } = await import('@capacitor/local-notifications')
    return LocalNotifications
  } catch { return null }
}

export async function programmerFinRepos(finTimestamp) {
  const LocalNotifications = await plugin()
  if (!LocalNotifications) return
  try {
    let statut = await LocalNotifications.checkPermissions()
    if (statut.display === 'prompt' || statut.display === 'prompt-with-rationale') {
      statut = await LocalNotifications.requestPermissions()
    }
    if (statut.display !== 'granted') return
    await LocalNotifications.cancel({ notifications: [{ id: ID_REPOS }] })
    if (finTimestamp <= Date.now()) return
    await LocalNotifications.schedule({
      notifications: [{
        id: ID_REPOS,
        title: 'Repos terminé',
        body: "C'est reparti : tour suivant.",
        // allowWhileIdle : déclenchée même en mode économie d'énergie Android (Doze). Sans la
        // permission d'alarme exacte (réservée aux apps réveil/agenda sur le Play Store), Android
        // peut la décaler de quelques secondes.
        schedule: { at: new Date(finTimestamp), allowWhileIdle: true },
      }],
    })
  } catch { /* notification impossible : le décompte à l'écran et la vibration restent */ }
}

export async function annulerFinRepos() {
  const LocalNotifications = await plugin()
  if (!LocalNotifications) return
  try { await LocalNotifications.cancel({ notifications: [{ id: ID_REPOS }] }) } catch { /* rien à annuler */ }
}
