import { supabaseAdmin } from '@/lib/supabase-admin'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { isIsoDate, planFrom } from '@/lib/programSchedule'

// "Décaler" depuis l'accueil : la séance passe à la date choisie et les séances suivantes non
// faites du programme se recalent derrière elle (voir lib/programSchedule.js). L'ordre des séances
// n'est pas modifié — c'est la différence avec postpone-session, qui la repousse dans la liste.
export async function POST(request, { params }) {
  const { token } = await params
  const { sessionId, date } = await request.json()
  if (!sessionId || !isIsoDate(date)) return NextResponse.json({ error: 'paramètres invalides' }, { status: 400 })

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

  const { data: target } = await supabaseAdmin.from('program_sessions').select('id, program_id, session_type').eq('id', sessionId).single()
  if (!target) return NextResponse.json({ error: 'séance introuvable' }, { status: 404 })
  if (target.session_type === 'recurrent') return NextResponse.json({ error: 'une séance récurrente ne se décale pas' }, { status: 400 })

  const { data: program } = await supabaseAdmin.from('programs')
    .select('id, athlete_id, athlete_days_of_week, recommended_sessions_per_week').eq('id', target.program_id).single()
  if (!program || program.athlete_id !== athlete.id) return NextResponse.json({ error: 'forbidden' }, { status: 403 })

  const { data: sessions } = await supabaseAdmin.from('program_sessions')
    .select('id, order_index, session_type, week_number, day_of_week').eq('program_id', target.program_id).order('order_index')
  const { data: completions } = await supabaseAdmin.from('program_completions')
    .select('program_session_id, skipped').eq('athlete_id', athlete.id).in('program_session_id', sessions.map(s => s.id))
  // Même définition de "faite" que l'accueil : une séance sautée reste à faire.
  const doneIds = new Set((completions || []).filter(c => !c.skipped).map(c => c.program_session_id))
  if (doneIds.has(sessionId)) return NextResponse.json({ error: 'séance déjà faite' }, { status: 400 })

  const progression = sessions.filter(s => s.session_type !== 'recurrent')
  const from = progression.findIndex(s => s.id === sessionId)
  const upcoming = progression.slice(from).filter(s => !doneIds.has(s.id))
  const plan = planFrom(upcoming, date, {
    athleteDays: program.athlete_days_of_week,
    sessionsPerWeek: program.recommended_sessions_per_week,
  })

  for (const p of plan) {
    const { error } = await supabaseAdmin.from('program_sessions').update({ date: p.date }).eq('id', p.id)
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  }

  return NextResponse.json({ dates: plan })
}
