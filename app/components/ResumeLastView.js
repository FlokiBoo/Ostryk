'use client'

import { useEffect } from 'react'
import { usePathname, useSearchParams, useRouter } from 'next/navigation'
import { LAST_PATH_KEY } from '@/lib/lastPath'

const INIT_FLAG_KEY = 'ostryk_session_initialized'
// Écrans d'auth transitoires : y revenir après un redémarrage n'a pas de sens, et proxy.js
// redirigera de toute façon selon la session réelle au moment du chargement.
const SKIP_PREFIXES = ['/login', '/auth', '/update-password', '/definir-mot-de-passe', '/verify-device']
const isSkippable = (path) => SKIP_PREFIXES.some(p => path.startsWith(p))

// Retour terrain (coach) : sur iPhone, quitter l'app (bouton Home / changer d'app) sans la fermer
// peut suffire pour qu'iOS décharge la WebView de la mémoire — au retour, Capacitor recharge
// server.url depuis zéro, exactement comme un vrai relancement à froid. Impossible de distinguer
// ça d'une fermeture forcée côté JS (les deux se présentent comme "environnement JS neuf, /").
// On restaure donc le dernier écran visité à chaque démarrage à froid, via localStorage (survit à
// la recréation de la WebView, contrairement à l'état React) — tout en s'appuyant sur
// sessionStorage (qui NE survit PAS à cette recréation, mais survit à une navigation ou un
// window.location.href dans le même process) pour ne jamais intercepter une redirection
// volontaire déjà en cours (ex: déconnexion vers /login).
export default function ResumeLastView() {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const router = useRouter()

  useEffect(() => {
    // Utile uniquement pour le cold-start Capacitor (retour terrain) — en dev local, ça gêne plus
    // qu'autre chose (on retombe sur le dernier écran visité au lieu du dashboard à chaque reload).
    if (process.env.NODE_ENV !== 'production') return
    try {
      const alreadyRunning = sessionStorage.getItem(INIT_FLAG_KEY)
      sessionStorage.setItem(INIT_FLAG_KEY, '1')
      if (alreadyRunning) return
      const lastPath = localStorage.getItem(LAST_PATH_KEY)
      if (!lastPath || lastPath === pathname || isSkippable(lastPath) || isSkippable(pathname)) return
      // Réservé à l'app native. Dans un navigateur, un nouvel onglet est aussi un « démarrage à
      // froid » : on y remplaçait le dashboard par le dernier écran visité, sans historique
      // derrière — le bouton retour quittait alors le site.
      import('@capacitor/core')
        .then(({ Capacitor }) => { if (Capacitor.isNativePlatform()) router.replace(lastPath) })
        .catch(() => {})
    } catch { /* stockage indisponible (navigation privée...) : pas bloquant */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (isSkippable(pathname)) return
    try {
      const qs = searchParams?.toString()
      localStorage.setItem(LAST_PATH_KEY, qs ? `${pathname}?${qs}` : pathname)
    } catch { /* pas bloquant */ }
  }, [pathname, searchParams])

  return null
}
