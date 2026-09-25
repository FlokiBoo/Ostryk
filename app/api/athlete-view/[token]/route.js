import { supabaseAdmin } from '@/lib/supabase-admin'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { buildKnownRaces } from '@/lib/raceEstimates'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export async function GET(request, { params }) {
  const { token } = await params
  if (!token) return NextResponse.json({ error: 'token requis' }, { status: 400 })

  const { data: athlete } = await supabaseAdmin.from('athletes').select('*').eq('token', token).single()
  if (!athlete) return NextResponse.json({ error: 'introuvable' }, { status: 404 })

  // Auth obligatoire : soit le sportif lui-même, soit un coach
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    { cookies: { getAll() { return cookieStore.getAll() }, setAll(cookiesToSet) { cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options)) } } }
  )
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const isOwner = athlete.auth_user_id === user.id
  const { data: coach } = await supabaseAdmin.from('coaches').select('id, is_admin').eq('id', user.id).single()
  const isCoach = !!coach && (coach.is_admin || athlete.coach_id === user.id)
  if (!isOwner && !isCoach) return NextResponse.json({ error: 'forbidden' }, { status: 403 })

  // Limite 2 appareils/compte sportif : le sportif lui-même (pas le coach en aperçu) doit avoir
  // un appareil déjà validé par email. Sinon, redirection côté client vers /verify-device.
  // Le profil perso du coach (bouton "Switch to athlete") partage le même auth_user_id que son
  // compte coach — isOwner y est donc toujours vrai — mais il n'y a jamais d'appareil enregistré
  // pour ce profil interne, donc cette vérification (pensée pour de vrais sportifs) le bloquerait
  // systématiquement. On l'exempte.
  if (isOwner && !athlete.is_coach) {
    const deviceId = cookieStore.get('cp_device')?.value
    const { data: device } = deviceId
      ? await supabaseAdmin.from('athlete_devices').select('id').eq('athlete_id', athlete.id).eq('device_id', deviceId).maybeSingle()
      : { data: null }
    if (!device) return NextResponse.json({ error: 'device_unverified' }, { status: 403 })
    await supabaseAdmin.from('athlete_devices').update({ last_seen_at: new Date().toISOString() }).eq('id', device.id)
  }

  const [{ data: progs }, { data: comps }, { data: logs }, { data: objectives }, { data: noteBlocks }, { data: exoSets }, { data: trackedMovs }, { data: circuitLogsData }] = await Promise.all([
    supabaseAdmin.from('programs')
      .select('*, program_sessions(*, program_exercises(*))')
      .eq('athlete_id', athlete.id)
      .order('created_at', { ascending: false }),
    supabaseAdmin.from('program_completions')
      .select('program_session_id, pleasure, difficulty, duration_minutes, skipped, pending_celebration, completed_at')
      .eq('athlete_id', athlete.id),
    supabaseAdmin.from('program_exercise_logs').select('*').eq('athlete_id', athlete.id),
    supabaseAdmin.from('athlete_objectives').select('*').eq('athlete_id', athlete.id).order('created_at'),
    supabaseAdmin.from('athlete_note_blocks').select('*').eq('athlete_id', athlete.id).order('order_index'),
    supabaseAdmin.from('program_exercise_sets').select('*').eq('athlete_id', athlete.id).order('set_index'),
    supabaseAdmin.from('tracked_movements').select('id, name, unit, tracked_movement_entries(value, athlete_id, date)'),
    supabaseAdmin.from('circuit_logs').select('*').eq('athlete_id', athlete.id),
  ])

  const { data: leaderRows } = await supabaseAdmin.from('group_members').select('group_id').eq('athlete_id', athlete.id).eq('is_leader', true)
  const isGroupLeader = !!leaderRows?.length

  const raceMovements = (trackedMovs || []).map(m => ({
    ...m,
    entries: (m.tracked_movement_entries || []).filter(e => e.athlete_id === athlete.id),
  }))
  const raceKnown = buildKnownRaces(raceMovements)
  const trackedMovements = (trackedMovs || []).map(({ id, name, unit }) => ({ id, name, unit }))

  // Gratuit (pas d'abonnement actif) : les programmes choisis par le sportif lui-même dans le
  // catalogue en libre-service sont limités aux 3 premières séances (ou free_sessions_count si le
  // coach l'a personnalisé) pour donner envie de passer payant. Un programme donné directement par
  // le coach (is_self_service = false) reste toujours accessible en entier, quel que soit l'abonnement.
  // Chacun avance à son rythme, pas de notion de semaine.
  const shouldGateFreeTier = !isCoach && athlete.subscription_status !== 'active'
  const gatedProgs = shouldGateFreeTier
    ? (progs || []).map(p => {
        if (!p.is_self_service) return p
        const limit = p.free_sessions_count ?? 3
        const sorted = [...(p.program_sessions || [])].sort((a, b) => a.order_index - b.order_index)
        const lockedIds = new Set(sorted.slice(limit).map(s => s.id))
        return {
          ...p,
          program_sessions: (p.program_sessions || []).map(s =>
            lockedIds.has(s.id)
              ? { ...s, locked: true, program_exercises: [], activation: null, coach_notes: null, circuits: [], activation_videos: [], warmup_content: null, cooldown_content: null }
              : s
          ),
        }
      })
    : (progs || [])

  // Séances de groupe volontairement cachées par le coach (contenu secret, comme en salle)
  // jusqu'à ce qu'il les "révèle" en validant la séance depuis l'espace groupe (présence + bilan
  // enregistrés dans group_session_runs). Le titre reste visible, le contenu est masqué.
  const groupIdsWithHidden = isCoach ? [] : [...new Set(
    gatedProgs.filter(p => p.group_id && (p.program_sessions || []).some(s => s.hidden_until_run)).map(p => p.group_id)
  )]
  let revealedKeys = new Set()
  if (groupIdsWithHidden.length) {
    const { data: runs } = await supabaseAdmin.from('group_session_runs')
      .select('group_id, source_session_id').in('group_id', groupIdsWithHidden)
    revealedKeys = new Set((runs || []).map(r => `${r.group_id}::${r.source_session_id}`))
  }
  const finalProgs = groupIdsWithHidden.length === 0 ? gatedProgs : gatedProgs.map(p => {
    if (!p.group_id) return p
    return {
      ...p,
      program_sessions: (p.program_sessions || []).map(s => {
        if (!s.hidden_until_run || revealedKeys.has(`${p.group_id}::${s.source_session_id}`)) return s
        return { ...s, hidden: true, program_exercises: [], activation: null, coach_notes: null, circuits: [], activation_videos: [], warmup_content: null, cooldown_content: null }
      }),
    }
  })

  const hasExercises = (finalProgs || []).some(p => (p.program_sessions || []).some(s => (s.program_exercises || []).some(e => e.name)))
  let movieMap = {}, musclesMap = {}, focusGroupsMap = {}
  if (hasExercises) {
    // Bibliothèque récupérée en entier (petit volume) plutôt que filtrée par .in('name', …), qui
    // est sensible à la casse côté Postgres et raterait silencieusement un nom mal accordé.
    const { data: movs } = await supabaseAdmin.from('movements').select('name, youtube_url, muscles, focus_groups')
    ;(movs || []).forEach(m => {
      movieMap[m.name.trim().toLowerCase()] = m.youtube_url
      if (m.muscles) musclesMap[m.name.trim().toLowerCase()] = m.muscles
      if (m.focus_groups) focusGroupsMap[m.name.trim().toLowerCase()] = m.focus_groups
    })
  }

  // Profil perso du coach (bouton "Switch to athlete") : simule l'abonnement le plus cher pour que
  // le coach voie exactement l'expérience d'un client payant, sans passer par un vrai abonnement
  // Stripe. Purement côté réponse — la ligne `athletes` en base n'est pas modifiée.
  const responseAthlete = athlete.is_coach ? { ...athlete, subscription_status: 'active', subscription_tier: 'B' } : athlete

  return NextResponse.json(
    {
      athlete: responseAthlete, programs: finalProgs, completions: comps || [], exerciseLogs: logs || [], movieMap, musclesMap, focusGroupsMap,
      objectives: objectives || [], noteBlocks: noteBlocks || [], exerciseSets: exoSets || [],
      raceKnown, trackedMovements, isCoach, isGroupLeader, circuitLogs: circuitLogsData || [],
    },
    { headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' } }
  )
}
