import { supabaseAdmin } from '@/lib/supabase-admin'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { sendPushToAthlete } from '@/lib/push'

export const dynamic = 'force-dynamic'

function today() {
  const n = new Date()
  return [n.getFullYear(), String(n.getMonth() + 1).padStart(2, '0'), String(n.getDate()).padStart(2, '0')].join('-')
}

// Un leader de groupe fait ici ce que la fiche coach /groups/[groupId]/session/[sessionId] fait
// pour le coach — présence, contenu de la séance, ressenti — mais depuis son propre espace
// athlète (il n'a pas accès à /groups/...). On vérifie donc son statut de leader nous-mêmes via
// supabaseAdmin plutôt que de compter sur des policies RLS pensées pour un compte coach.
async function authenticateLeader(token, sessionId) {
  const { data: athlete } = await supabaseAdmin.from('athletes').select('id, auth_user_id').eq('token', token).single()
  if (!athlete) return { error: NextResponse.json({ error: 'introuvable' }, { status: 404 }) }

  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    { cookies: { getAll() { return cookieStore.getAll() }, setAll(cookiesToSet) { cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options)) } } }
  )
  const { data: { user } } = await supabase.auth.getUser()
  if (!user || athlete.auth_user_id !== user.id) return { error: NextResponse.json({ error: 'unauthorized' }, { status: 401 }) }

  const { data: session } = await supabaseAdmin.from('program_sessions').select('*, programs(group_id)').eq('id', sessionId).single()
  const groupId = session?.programs?.group_id
  if (!groupId) return { error: NextResponse.json({ error: "cette séance n'appartient pas à un groupe" }, { status: 400 }) }

  const { data: leaderRow } = await supabaseAdmin.from('group_members')
    .select('athlete_id').eq('group_id', groupId).eq('athlete_id', athlete.id).eq('is_leader', true).maybeSingle()
  if (!leaderRow) return { error: NextResponse.json({ error: 'forbidden' }, { status: 403 }) }

  return { athlete, session, groupId }
}

export async function GET(request, { params }) {
  const { token } = await params
  const { searchParams } = new URL(request.url)
  const sessionId = searchParams.get('sessionId')
  const runDate = searchParams.get('date') || today()
  if (!sessionId) return NextResponse.json({ error: 'sessionId requis' }, { status: 400 })

  const { error, session, groupId } = await authenticateLeader(token, sessionId)
  if (error) return error

  const [{ data: group }, { data: gm }, { data: exos }, { data: existingRun }] = await Promise.all([
    supabaseAdmin.from('groups').select('*').eq('id', groupId).single(),
    supabaseAdmin.from('group_members').select('athlete_id, athletes(id, name)').eq('group_id', groupId),
    supabaseAdmin.from('program_exercises').select('*').eq('program_session_id', sessionId).order('order_index'),
    supabaseAdmin.from('group_session_runs').select('*').eq('group_id', groupId).eq('source_session_id', sessionId).eq('date', runDate).maybeSingle(),
  ])
  const members = (gm || []).map(m => m.athletes).filter(Boolean).sort((a, b) => a.name.localeCompare(b.name))

  let presentIds = []
  if (existingRun) {
    const { data: att } = await supabaseAdmin.from('group_session_attendance').select('athlete_id').eq('run_id', existingRun.id)
    presentIds = (att || []).map(a => a.athlete_id)
  }

  // Notes privées du coach (lot A9) : jamais envoyées à un sportif, même chef de groupe.
  const { private_coach_note: _noteSeance, ...sessionPublique } = session || {}
  const exercicesPublics = (exos || []).map(({ private_coach_note: _note, ...e }) => e)
  return NextResponse.json({ group, members, session: sessionPublique, exercises: exercicesPublics, existingRun, presentIds })
}

export async function POST(request, { params }) {
  const { token } = await params
  const body = await request.json()
  const { sessionId, date, exerciseNotes, coachDifficulty, coachNote, presentIds = [] } = body
  if (!sessionId) return NextResponse.json({ error: 'sessionId requis' }, { status: 400 })
  const runDate = date || today()

  const { error, session, groupId } = await authenticateLeader(token, sessionId)
  if (error) return error

  const { data: group } = await supabaseAdmin.from('groups').select('coach_id').eq('id', groupId).single()

  const { data: run, error: upsertErr } = await supabaseAdmin.from('group_session_runs')
    .upsert({
      group_id: groupId, coach_id: group?.coach_id, source_session_id: sessionId,
      title: session?.title || 'Séance', date: runDate,
      exercise_notes: exerciseNotes || {}, coach_difficulty: coachDifficulty ?? null, coach_note: coachNote?.trim() || null,
    }, { onConflict: 'group_id,source_session_id,date' })
    .select().single()
  if (upsertErr || !run) return NextResponse.json({ error: upsertErr?.message || 'échec' }, { status: 400 })

  const { data: existingAtt } = await supabaseAdmin.from('group_session_attendance').select('athlete_id').eq('run_id', run.id)
  const existingIds = new Set((existingAtt || []).map(a => a.athlete_id))
  const nextIds = new Set(presentIds)
  const toAdd = [...nextIds].filter(id => !existingIds.has(id))
  const toRemove = [...existingIds].filter(id => !nextIds.has(id))
  if (toAdd.length) {
    await supabaseAdmin.from('group_session_attendance').insert(toAdd.map(athlete_id => ({ run_id: run.id, athlete_id })))
    await supabaseAdmin.from('notifications').insert(toAdd.map(athlete_id => ({
      athlete_id, type: 'group_session_pending',
      title: 'Séance de groupe à compléter',
      body: session?.title || null,
    })))
    // Push téléphone (app native) en plus de la notif in-app ci-dessus — même geste que le coach
    // depuis /groups/[groupId]/session/[sessionId] (voir notifyGroupSessionAttendance), mais on
    // est déjà côté serveur ici donc pas besoin de repasser par une route /api/notify dédiée.
    const { data: toAddAthletes } = await supabaseAdmin.from('athletes').select('id, token').in('id', toAdd)
    ;(toAddAthletes || []).forEach(a => sendPushToAthlete(a.id, {
      title: 'Séance de groupe à compléter',
      body: session?.title || 'Une séance de groupe',
      link: '/s/' + a.token,
    }).catch(() => {}))
  }
  if (toRemove.length) await supabaseAdmin.from('group_session_attendance').delete().eq('run_id', run.id).in('athlete_id', toRemove)

  return NextResponse.json({ success: true, runId: run.id })
}
