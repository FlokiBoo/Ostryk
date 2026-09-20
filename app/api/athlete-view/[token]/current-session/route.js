import { supabaseAdmin } from '@/lib/supabase-admin'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

// Mémorise sur le compte la séance que le sportif vient d'ouvrir (athletes.current_session_id) :
// tant qu'il ne l'a pas validée, c'est elle que la carte "Séance du jour" affiche, sur n'importe
// lequel de ses appareils. `sessionId: null` relâche l'ancre (séance validée ou sautée).
// Volontairement réservé au sportif lui-même : un coach qui prévisualise la séance d'un client ne
// la "fait" pas et ne doit pas déplacer son ancre.
export async function POST(request, { params }) {
  const { token } = await params
  const { sessionId } = await request.json()
  if (sessionId !== null && typeof sessionId !== 'string') {
    return NextResponse.json({ error: 'paramètres invalides' }, { status: 400 })
  }

  const { data: athlete } = await supabaseAdmin.from('athletes').select('id, auth_user_id').eq('token', token).single()
  if (!athlete) return NextResponse.json({ error: 'introuvable' }, { status: 404 })

  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    { cookies: { getAll() { return cookieStore.getAll() }, setAll(cookiesToSet) { cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options)) } } }
  )
  const { data: { user } } = await supabase.auth.getUser()
  if (!user || athlete.auth_user_id !== user.id) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  // La séance doit appartenir à un programme du sportif — sinon on ancrerait son écran d'accueil
  // sur la séance de quelqu'un d'autre.
  if (sessionId) {
    const { data: session } = await supabaseAdmin.from('program_sessions')
      .select('id, programs(athlete_id)').eq('id', sessionId).maybeSingle()
    if (!session || session.programs?.athlete_id !== athlete.id) {
      return NextResponse.json({ error: 'forbidden' }, { status: 403 })
    }
  }

  const { error } = await supabaseAdmin.from('athletes')
    .update({ current_session_id: sessionId })
    .eq('id', athlete.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  return NextResponse.json({ success: true })
}
