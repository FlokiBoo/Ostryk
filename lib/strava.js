import { supabaseAdmin } from '@/lib/supabase-admin'

const CLIENT_ID = process.env.STRAVA_CLIENT_ID
const CLIENT_SECRET = process.env.STRAVA_CLIENT_SECRET

export function stravaAuthorizeUrl(redirectUri, state) {
  const url = new URL('https://www.strava.com/oauth/authorize')
  url.searchParams.set('client_id', CLIENT_ID)
  url.searchParams.set('redirect_uri', redirectUri)
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('approval_prompt', 'auto')
  url.searchParams.set('scope', 'activity:read_all')
  url.searchParams.set('state', state)
  return url.toString()
}

export async function exchangeStravaCode(code) {
  const res = await fetch('https://www.strava.com/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ client_id: CLIENT_ID, client_secret: CLIENT_SECRET, code, grant_type: 'authorization_code' }),
  })
  if (!res.ok) throw new Error(`Échange de code Strava échoué (${res.status})`)
  return res.json() // { access_token, refresh_token, expires_at, athlete: { id, ... } }
}

// Rafraîchit le token d'un athlète si besoin (expire toutes les 6h côté Strava) et met à jour
// la base — à appeler avant tout appel à l'API Strava pour cet athlète.
export async function getValidStravaToken(athlete) {
  if (!athlete.strava_refresh_token) return null
  const now = Math.floor(Date.now() / 1000)
  if (athlete.strava_access_token && athlete.strava_token_expires_at > now + 60) {
    return athlete.strava_access_token
  }
  const res = await fetch('https://www.strava.com/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: CLIENT_ID, client_secret: CLIENT_SECRET,
      grant_type: 'refresh_token', refresh_token: athlete.strava_refresh_token,
    }),
  })
  if (!res.ok) return null
  const json = await res.json()
  await supabaseAdmin.from('athletes').update({
    strava_access_token: json.access_token,
    strava_refresh_token: json.refresh_token,
    strava_token_expires_at: json.expires_at,
  }).eq('id', athlete.id)
  return json.access_token
}

export async function fetchStravaActivity(accessToken, activityId) {
  const res = await fetch(`https://www.strava.com/api/v3/activities/${activityId}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (!res.ok) return null
  return res.json()
}

// Correspondance entre le type d'activité Strava (fixe côté Strava) et le libellé activity_type
// libre utilisé côté coach (pas d'enum ici — "Running 🏃‍♀️", "Musculation 🏋️", "Crossfit 🏋️"...
// sont juste des conventions de texte). Le préfixe ILIKE retrouve un programme déjà de ce type ;
// à défaut de correspondance connue, on garde le type Strava tel quel comme libellé de secours
// plutôt que d'ignorer l'activité.
const STRAVA_TYPE_MAP = {
  Run: 'Running 🏃‍♀️',
  VirtualRun: 'Running 🏃‍♀️',
  Ride: 'Vélo 🚴',
  VirtualRide: 'Vélo 🚴',
  Swim: 'Natation 🏊',
  Walk: 'Marche 🥾',
  Hike: 'Marche 🥾',
  WeightTraining: 'Musculation 🏋️',
  Workout: 'Musculation 🏋️',
  Crossfit: 'Crossfit 🏋️',
  Yoga: 'Yoga 🧘',
  Rowing: 'Aviron 🚣',
}

export function stravaActivityLabel(stravaType) {
  return STRAVA_TYPE_MAP[stravaType] || stravaType
}

// Séance pas encore validée dans le programme actif du même type d'activité le plus ancien, ou
// null quand l'activité ne correspond à aucun programme en cours (voir enregistrerActiviteLibre).
export async function findSessionForActivity(athleteId, activityTypeLabel) {
  const ilikePrefix = `${activityTypeLabel.split(' ')[0]}%`
  const { data: programs } = await supabaseAdmin.from('programs')
    .select('id, coach_id, program_sessions(id, order_index)')
    .eq('athlete_id', athleteId)
    .or('archived.is.null,archived.eq.false')
    .ilike('activity_type', ilikePrefix)
    .order('created_at', { ascending: true })

  const { data: completions } = await supabaseAdmin.from('program_completions')
    .select('program_session_id').eq('athlete_id', athleteId)
  const completedIds = new Set((completions || []).map(c => c.program_session_id))

  for (const prog of (programs || [])) {
    const sessions = [...(prog.program_sessions || [])].sort((a, b) => a.order_index - b.order_index)
    const next = sessions.find(s => !completedIds.has(s.id))
    if (next) return next.id
  }
  return null
}

// Discipline d'une activité hors programme : le type Strava d'abord, sinon un mot du nom donné à
// l'activité ("Natation le matin"). `motif` retrouve la discipline déjà créée par le coach
// (activity_definitions.label est un texte libre : "Course à pied", "Running", "Footing"…) ;
// `defaut` sert quand il n'en existe aucune.
const DISCIPLINES = [
  { types: ['Run', 'VirtualRun', 'TrailRun'], motif: /course|run|footing|trail/i, defaut: 'Course à pied' },
  { types: ['Ride', 'VirtualRide', 'EBikeRide', 'MountainBikeRide', 'GravelRide'], motif: /v[ée]lo|cycl|bike|vtt/i, defaut: 'Vélo' },
  { types: ['Swim'], motif: /natation|nage|swim/i, defaut: 'Natation' },
  { types: ['Walk', 'Hike'], motif: /marche|rando|walk|hike/i, defaut: 'Marche' },
  { types: ['WeightTraining', 'Workout'], motif: /muscu|renfo/i, defaut: 'Musculation' },
  { types: ['Crossfit'], motif: /crossfit/i, defaut: 'Crossfit' },
  { types: ['Yoga'], motif: /yoga/i, defaut: 'Yoga' },
  { types: ['Rowing'], motif: /aviron|rameur|row/i, defaut: 'Aviron' },
]

export function disciplineStrava(activity, labelsExistants = []) {
  const d = DISCIPLINES.find(x => x.types.includes(activity.type) || x.types.includes(activity.sport_type))
    || DISCIPLINES.find(x => x.motif.test(activity.name || ''))
  if (!d) return activity.type || 'Activité'
  return labelsExistants.find(l => d.motif.test(l)) || d.defaut
}

// Activité déjà importée, dans une séance de programme ou dans une activité libre.
export async function stravaDejaTraitee(athleteId, stravaActivityId) {
  const [{ data: completion }, { data: logs }] = await Promise.all([
    supabaseAdmin.from('program_completions')
      .select('id').eq('athlete_id', athleteId).eq('strava_activity_id', stravaActivityId).maybeSingle(),
    supabaseAdmin.from('activity_logs')
      .select('id').eq('athlete_id', athleteId).contains('strava_activity_ids', [stravaActivityId]).limit(1),
  ])
  return !!completion || !!logs?.length
}

// Activité sans programme correspondant : une ligne d'activité du jour (activity_logs), jamais un
// programme "Séance libre" — il apparaissait dans les microcycles du coach à chaque sortie.
// Une seule ligne par jour et par discipline : une deuxième sortie s'y additionne. Une saisie
// faite à la main avant l'arrivée de Strava garde ses chiffres, on y rattache seulement l'activité.
async function enregistrerActiviteLibre(athlete, activity) {
  const { data: defs } = await supabaseAdmin.from('activity_definitions').select('label')
  const label = disciplineStrava(activity, (defs || []).map(d => d.label).filter(Boolean))
  // Jour vécu par le sportif (heure locale de l'activité), pas le jour UTC.
  const date = (activity.start_date_local || activity.start_date).slice(0, 10)
  const km = activity.distance > 0 ? Math.round((activity.distance / 1000) * 100) / 100 : null
  const minutes = Math.round(activity.moving_time / 60)

  const { data: existante } = await supabaseAdmin.from('activity_logs')
    .select('id, km, duration_minutes, validated_at, strava_activity_ids')
    .eq('athlete_id', athlete.id).eq('date', date).eq('type', 'custom').eq('label', label).maybeSingle()

  if (!existante) {
    const { error } = await supabaseAdmin.from('activity_logs').insert({
      athlete_id: athlete.id, date, type: 'custom', label, km, duration_minutes: minutes,
      validated_at: activity.start_date, strava_activity_ids: [activity.id],
    })
    return !error
  }

  const ids = existante.strava_activity_ids || []
  const saisieManuelle = !ids.length && (existante.km != null || existante.duration_minutes != null)
  const { error } = await supabaseAdmin.from('activity_logs').update({
    strava_activity_ids: [...ids, activity.id],
    validated_at: existante.validated_at || activity.start_date,
    ...(saisieManuelle ? {} : {
      km: km == null ? existante.km : Math.round(((Number(existante.km) || 0) + km) * 100) / 100,
      duration_minutes: (existante.duration_minutes || 0) + minutes,
    }),
  }).eq('id', existante.id)
  return !error
}

async function notifierImport(athlete, activity, activityTypeLabel) {
  await supabaseAdmin.from('notifications').insert({
    athlete_id: athlete.id, type: 'strava_activity_imported',
    title: 'Séance importée depuis Strava',
    body: activity.name || activityTypeLabel,
  })
}

// Traite UNE activité Strava déjà récupérée (webhook temps réel ou import manuel rétroactif) :
// idempotent sur l'id d'activité Strava. Valide la prochaine séance d'un programme en cours du même
// type s'il y en a un (sans écraser un ressenti déjà saisi à la main), sinon l'enregistre comme
// activité libre. Notifie le client. Retourne { imported: bool }.
export async function processStravaActivity(athlete, activity) {
  if (await stravaDejaTraitee(athlete.id, activity.id)) return { imported: false, reason: 'already_processed' }

  const activityTypeLabel = stravaActivityLabel(activity.type)
  const sessionId = await findSessionForActivity(athlete.id, activityTypeLabel)
  if (!sessionId) {
    if (!(await enregistrerActiviteLibre(athlete, activity))) return { imported: false, reason: 'activity_log_failed' }
    await notifierImport(athlete, activity, activityTypeLabel)
    return { imported: true }
  }

  const { data: existing } = await supabaseAdmin.from('program_completions')
    .select('id').eq('athlete_id', athlete.id).eq('program_session_id', sessionId).maybeSingle()

  const stravaFields = {
    duration_minutes: Math.round(activity.moving_time / 60),
    strava_activity_id: activity.id,
    ...(activity.distance > 0 ? { distance_km: Math.round((activity.distance / 1000) * 100) / 100 } : {}),
  }

  if (existing) {
    await supabaseAdmin.from('program_completions').update(stravaFields).eq('id', existing.id)
  } else {
    await supabaseAdmin.from('program_completions').insert({
      athlete_id: athlete.id, program_session_id: sessionId, completed_at: activity.start_date, ...stravaFields,
    })
  }

  await notifierImport(athlete, activity, activityTypeLabel)
  return { imported: true }
}
