import { createServerClient } from '@supabase/ssr'
import { NextResponse } from 'next/server'

export async function proxy(request) {
  const { pathname } = request.nextUrl

  // Routes publiques (dont la vue sportif — accès par lien personnel)
  if (
    pathname.startsWith('/login') ||
    pathname.startsWith('/auth') ||
    pathname.startsWith('/update-password') ||
    pathname.startsWith('/definir-mot-de-passe') ||
    pathname.startsWith('/s/') ||
    pathname.startsWith('/api/athlete-view') ||
    pathname.startsWith('/api/manifest') ||
    pathname.startsWith('/api/stripe/webhook') ||
    pathname.startsWith('/api/signup') ||
    pathname.startsWith('/rejoindre/') ||
    pathname.startsWith('/api/rejoindre/') ||
    pathname.startsWith('/confidentialite') ||
    pathname.startsWith('/cgu') ||
    pathname.startsWith('/suppression-compte') ||
    pathname.startsWith('/offres') ||
    pathname.startsWith('/api/offers') ||
    pathname.startsWith('/api/strava/connect') ||
    pathname.startsWith('/api/strava/callback') ||
    pathname.startsWith('/api/strava/webhook')
  ) {
    return NextResponse.next()
  }

  let response = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() { return request.cookies.getAll() },
        setAll(cookiesToSet) {
          // Une seule réponse recréée après avoir mis à jour TOUTES les cookies de la requête,
          // puis TOUTES les cookies y sont appliquées — recréer la réponse à chaque itération
          // (comme avant) écrasait les cookies déjà posées lors des itérations précédentes,
          // corrompant la session dès qu'un refresh Supabase posait plusieurs cookies d'un coup
          // (ex: token chunké sb-*-auth-token.0/.1) → déconnexions intempestives.
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          response = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options))
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  const athleteToken = user.app_metadata?.athlete_token
  const needsPassword = user.app_metadata?.needs_password
  // Une route API attend du JSON en réponse à un fetch() — jamais une redirection vers une page
  // HTML (le fetch la suit silencieusement, .json() plante ensuite sur le HTML reçu). Rediriger
  // un appel /api/... ici a déjà cassé la messagerie et la vérification d'appareil pour de vrais
  // comptes athlète : chaque route API fait de toute façon sa propre vérification d'appartenance
  // (voir CLAUDE.md, pattern "defense in depth"), donc ces deux redirections ne doivent jamais
  // s'appliquer aux chemins /api/.
  const isApiRoute = pathname.startsWith('/api/')

  // Forcer la création de mot de passe à la première connexion (athlète ou coach invité)
  if (needsPassword && !isApiRoute) {
    if (!pathname.startsWith('/definir-mot-de-passe')) {
      return NextResponse.redirect(new URL('/definir-mot-de-passe', request.url))
    }
    return response
  }

  // Validation d'un nouvel appareil (limite 2 appareils/compte sportif) : accessible même
  // en dehors de l'espace /s/[token] scopé, sinon boucle de redirection.
  if (pathname.startsWith('/verify-device')) {
    return response
  }

  // Si c'est un compte client (pas le coach), le cantonner à son espace
  if (athleteToken && !isApiRoute && !pathname.startsWith(`/s/${athleteToken}`)) {
    return NextResponse.redirect(new URL(`/s/${athleteToken}`, request.url))
  }

  return response
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|manifest.json|sw.js|icon.svg|.*\\.png$).*)'],
}
