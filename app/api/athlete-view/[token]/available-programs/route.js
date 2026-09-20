import { supabaseAdmin } from '@/lib/supabase-admin'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

async function authenticate(token) {
  const { data: athlete } = await supabaseAdmin.from('athletes').select('*').eq('token', token).single()
  if (!athlete) return { error: NextResponse.json({ error: 'introuvable' }, { status: 404 }) }

  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    { cookies: { getAll() { return cookieStore.getAll() }, setAll(cookiesToSet) { cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options)) } } }
  )
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: NextResponse.json({ error: 'unauthorized' }, { status: 401 }) }

  const isOwner = athlete.auth_user_id === user.id
  const { data: coach } = await supabaseAdmin.from('coaches').select('id, is_admin').eq('id', user.id).single()
  const isCoach = !!coach && (coach.is_admin || athlete.coach_id === user.id)
  if (!isOwner && !isCoach) return { error: NextResponse.json({ error: 'forbidden' }, { status: 403 }) }

  return { athlete, user }
}

export async function GET(request, { params }) {
  const { token } = await params
  const { athlete, error } = await authenticate(token)
  if (error) return error

  const { data: progs } = await supabaseAdmin
    .from('programs')
    .select('id, title, description, activity_type, coach_id, previous_phase_program_id, previous_phase:previous_phase_program_id(title), program_sessions(id)')
    .is('athlete_id', null)
    .eq('available_to_clients', true)
    .order('title')

  // Visible : modèles Owner (coach_id null) + modèles de son propre coach, moins ceux que
  // son coach a choisi de masquer parmi les modèles Owner.
  const { data: hidden } = await supabaseAdmin
    .from('coach_hidden_content')
    .select('content_id')
    .eq('coach_id', athlete.coach_id)
    .eq('content_type', 'program')
  const hiddenIds = new Set((hidden || []).map(h => h.content_id))

  const list = (progs || [])
    .filter(p => (p.coach_id === null || p.coach_id === athlete.coach_id) && !(p.coach_id === null && hiddenIds.has(p.id)))
    .map(p => ({
      id: p.id, title: p.title, description: p.description, activity_type: p.activity_type,
      sessionCount: (p.program_sessions || []).length,
      previousPhaseTitle: p.previous_phase?.title || null,
    }))

  return NextResponse.json({ programs: list }, { headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' } })
}

export async function POST(request, { params }) {
  const { token } = await params
  const { athlete, error } = await authenticate(token)
  if (error) return error

  const { programId } = await request.json()
  if (!programId) return NextResponse.json({ error: 'programId requis' }, { status: 400 })

  const { data: template } = await supabaseAdmin.from('programs').select('*').eq('id', programId).is('athlete_id', null).eq('available_to_clients', true).single()
  if (!template) return NextResponse.json({ error: 'programme introuvable ou non disponible' }, { status: 404 })
  if (template.coach_id !== null && template.coach_id !== athlete.coach_id) {
    return NextResponse.json({ error: 'programme introuvable ou non disponible' }, { status: 404 })
  }

  const { data: sessions } = await supabaseAdmin
    .from('program_sessions')
    .select('*, program_exercises(*)')
    .eq('program_id', template.id)
    .order('order_index')

  const { data: newProg, error: progErr } = await supabaseAdmin.from('programs')
    .insert({
      athlete_id: athlete.id, title: template.title, coach_id: template.coach_id,
      source_program_id: template.id, activity_type: template.activity_type,
      free_sessions_count: template.free_sessions_count ?? 3,
      is_self_service: true,
    })
    .select().single()
  if (progErr || !newProg) return NextResponse.json({ error: progErr?.message || 'création impossible' }, { status: 400 })

  if (athlete.coach_id) {
    await supabaseAdmin.from('notifications').insert({
      coach_id: athlete.coach_id, type: 'client_selected_program',
      title: `${athlete.name} a choisi un programme`,
      body: template.title,
      link: `/programs/${athlete.id}`,
    })
  }

  for (const sess of (sessions || [])) {
    const { data: newSess } = await supabaseAdmin.from('program_sessions')
      .insert({
        program_id: newProg.id, order_index: sess.order_index, title: sess.title || '', source_session_id: sess.id,
        activation: sess.activation || null, coach_notes: sess.coach_notes || null,
        activation_videos: sess.activation_videos || [], circuits: sess.circuits || [],
        session_type: sess.session_type || null, recurring_daily_target: sess.recurring_daily_target ?? null,
        week_number: sess.week_number, day_of_week: sess.day_of_week ?? null, hidden_until_run: !!sess.hidden_until_run,
      })
      .select().single()
    if (!newSess) continue

    const exos = (sess.program_exercises || []).sort((a, b) => a.order_index - b.order_index)
    if (exos.length > 0) {
      await supabaseAdmin.from('program_exercises').insert(
        exos.map(e => ({
          program_session_id: newSess.id,
          order_index: e.order_index,
          name: e.name,
          sets: e.sets,
          reps: e.reps,
          kg: e.kg,
          rest: e.rest,
          note: e.note,
          materiel: e.materiel || null,
          video_url: e.video_url,
          superset_group: e.superset_group,
          focus_muscles: e.focus_muscles || null,
          pace_base: e.pace_base || null,
          pct_low: e.pct_low,
          pct_high: e.pct_high,
          source_exercise_id: e.id,
        }))
      )
    }
  }

  return NextResponse.json({ success: true, programId: newProg.id })
}
