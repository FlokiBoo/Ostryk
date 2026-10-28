import { supabaseAdmin } from '@/lib/supabase-admin'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

// Contrôle d'accès des routes /api/athlete-view/[token]/* : le sportif lui-même, ou son coach
// (aperçu ?coach=1, ou un admin). Même règle que la route principale de l'espace sportif, sans la
// vérification d'appareil, que celle-ci fait déjà au chargement de la page.
// → { athlete, role: 'athlete' | 'coach' } ou { reponse } (NextResponse d'erreur à renvoyer).
export async function accesAthlete(token, colonnes = 'id, coach_id, auth_user_id') {
  if (!token) return { reponse: NextResponse.json({ error: 'token requis' }, { status: 400 }) }
  const { data: athlete } = await supabaseAdmin.from('athletes').select(colonnes).eq('token', token).single()
  if (!athlete) return { reponse: NextResponse.json({ error: 'introuvable' }, { status: 404 }) }

  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    { cookies: { getAll() { return cookieStore.getAll() }, setAll(cookiesToSet) { cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options)) } } }
  )
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { reponse: NextResponse.json({ error: 'unauthorized' }, { status: 401 }) }

  if (athlete.auth_user_id === user.id) return { athlete, role: 'athlete' }
  const { data: coach } = await supabaseAdmin.from('coaches').select('id, is_admin').eq('id', user.id).maybeSingle()
  if (coach && (coach.is_admin || athlete.coach_id === user.id)) return { athlete, role: 'coach' }
  return { reponse: NextResponse.json({ error: 'forbidden' }, { status: 403 }) }
}
