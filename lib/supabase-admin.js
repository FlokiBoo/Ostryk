import { createClient } from '@supabase/supabase-js'

// Client créé à la première utilisation, pas au chargement du module — voir
// lib/supabase.js pour le pourquoi (build qui casse quand une variable manque).
let client = null

function getClient() {
  if (client) return client

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    throw new Error(
      'Supabase (service role) non configuré : NEXT_PUBLIC_SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY sont requises.'
    )
  }

  client = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  return client
}

export const supabaseAdmin = new Proxy({}, {
  get(_cible, prop) {
    const valeur = getClient()[prop]
    return typeof valeur === 'function' ? valeur.bind(getClient()) : valeur
  },
})
