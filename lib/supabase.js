import { createBrowserClient } from '@supabase/ssr'

// Client créé à la première utilisation, pas au chargement du module : sinon
// `next build` casse au "collect page data" dès qu'une variable manque (preview
// Vercel, session Claude Code sur le web), avec un « supabaseUrl is
// required » qui ne dit pas quelle variable ni où. Ici l'erreur arrive à
// l'appel, nommée. Attention : NEXT_PUBLIC_* est inliné au build — un bundle
// construit sans ces variables reste cassé à l'exécution, le build passe juste.
let client = null

function getClient() {
  if (client) return client

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) {
    throw new Error(
      'Supabase (navigateur) non configuré : NEXT_PUBLIC_SUPABASE_URL et NEXT_PUBLIC_SUPABASE_ANON_KEY sont requises.'
    )
  }

  client = createBrowserClient(url, key)
  return client
}

export const supabase = new Proxy({}, {
  get(_cible, prop) {
    const valeur = getClient()[prop]
    return typeof valeur === 'function' ? valeur.bind(getClient()) : valeur
  },
})
