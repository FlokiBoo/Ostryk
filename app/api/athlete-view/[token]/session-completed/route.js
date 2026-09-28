import { supabaseAdmin } from '@/lib/supabase-admin'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { sendPushToAthlete } from '@/lib/push'

// Un client en suivi 1:1 vient de terminer une séance : le coach est prévenu dans sa cloche et par
// push sur son téléphone. Côté serveur car la RLS de `notifications` refuse l'insertion depuis la
// session du sportif (elle échouait en silence : le coach n'était jamais prévenu).
//
// Push : les tokens sont rattachés à des fiches sportif ; celui du coach vit sur SON profil perso
// (ligne athletes is_coach), enregistré depuis le tableau de bord de l'app native (app/page.js).

// Même séance signalée deux fois (double appel, reprise réseau) : une seule notification.
const DEDOUBLONNAGE_MS = 12 * 60 * 60 * 1000

export async function POST(request, { params }) {
  const { token } = await params
  const { sessionId } = await request.json().catch(() => ({}))
  if (!sessionId) return NextResponse.json({ error: 'séance manquante' }, { status: 400 })

  const { data: athlete } = await supabaseAdmin.from('athletes')
    .select('id, name, auth_user_id, coach_id, is_1to1_client, is_coach').eq('token', token).single()
  if (!athlete) return NextResponse.json({ error: 'introuvable' }, { status: 404 })

  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    { cookies: { getAll() { return cookieStore.getAll() }, setAll(cookiesToSet) { cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options)) } } }
  )
  const { data: { user } } = await supabase.auth.getUser()
  if (!user || athlete.auth_user_id !== user.id) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  if (!athlete.is_1to1_client || athlete.is_coach || !athlete.coach_id) return NextResponse.json({ notified: false })

  // La séance doit vraiment être validée, pour ce sportif.
  const { data: completion } = await supabaseAdmin.from('program_completions')
    .select('program_session_id').eq('athlete_id', athlete.id).eq('program_session_id', sessionId).eq('skipped', false).maybeSingle()
  if (!completion) return NextResponse.json({ error: 'séance non validée' }, { status: 400 })

  const link = `/athletes/${athlete.id}?seance=${sessionId}`
  const { data: deja } = await supabaseAdmin.from('notifications').select('id')
    .eq('coach_id', athlete.coach_id).eq('type', 'session_validated_by_athlete').eq('link', link)
    .gte('created_at', new Date(Date.now() - DEDOUBLONNAGE_MS).toISOString()).limit(1)
  if (deja?.length) return NextResponse.json({ notified: false })

  const { data: seance } = await supabaseAdmin.from('program_sessions').select('title').eq('id', sessionId).maybeSingle()
  const title = `${athlete.name} a terminé sa séance`
  const body = seance?.title || null

  const { error } = await supabaseAdmin.from('notifications').insert({
    coach_id: athlete.coach_id, type: 'session_validated_by_athlete', title, body, link,
  })
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  const { data: profilCoach } = await supabaseAdmin.from('athletes')
    .select('id').eq('coach_id', athlete.coach_id).eq('is_coach', true).limit(1).maybeSingle()
  if (profilCoach) {
    await sendPushToAthlete(profilCoach.id, { title, body: body || 'Séance terminée', link }).catch(() => {})
  }

  return NextResponse.json({ notified: true })
}
