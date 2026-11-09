import { supabaseAdmin } from '@/lib/supabase-admin'
import { ordreSeances } from '@/lib/programSchedule'

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
    .select('id, coach_id, program_sessions(id, order_index, week_number, day_of_week)')
    .eq('athlete_id', athleteId)
    .or('archived.is.null,archived.eq.false')
    .ilike('activity_type', ilikePrefix)
    .order('created_at', { ascending: true })

  const { data: completions } = await supabaseAdmin.from('program_completions')
    .select('program_session_id').eq('athlete_id', athleteId)
  const completedIds = new Set((completions || []).map(c => c.program_session_id))

  for (const prog of (programs || [])) {
    const sessions = [...(prog.program_sessions || [])].sort(ordreSeances)
    const next = sessions.find(s => !completedIds.has(s.id))
    if (next) return next.id
  }
  return null
}

// Discipline d'une activité hors programme : le type Strava d'abord, sinon un mot du nom donné à
// l'activité ("Natation le matin"). `motif` retrouve la discipline déjà créée par le coach
// (activity_definitions.label est un texte libre : "Course à pied", "Running", "Footing"…) ;
// `defaut` sert quand il n'en existe aucune.
// `famille` : disciplines considérées comme la même pratique quand on rapproche une activité
// Strava d'une séance Ostryk du même jour (voir memeDiscipline).
const DISCIPLINES = [
  { types: ['Run', 'VirtualRun', 'TrailRun'], motif: /course|run|footing|trail/i, defaut: 'Course à pied' },
  { types: ['Ride', 'VirtualRide', 'EBikeRide', 'MountainBikeRide', 'GravelRide'], motif: /v[ée]lo|cycl|bike|vtt/i, defaut: 'Vélo' },
  { types: ['Swim'], motif: /natation|nage|swim/i, defaut: 'Natation' },
  { types: ['Walk', 'Hike'], motif: /marche|rando|walk|hike/i, defaut: 'Marche' },
  { types: ['WeightTraining', 'Workout'], motif: /muscu|renfo/i, defaut: 'Musculation', famille: 'force' },
  { types: ['Crossfit'], motif: /crossfit/i, defaut: 'Crossfit', famille: 'force' },
  { types: ['Yoga'], motif: /yoga/i, defaut: 'Yoga' },
  { types: ['Rowing'], motif: /aviron|rameur|row/i, defaut: 'Aviron' },
]

export function disciplineStrava(activity, labelsExistants = []) {
  const d = disciplineDeLActivite(activity)
  if (!d) return activity.type || 'Activité'
  return labelsExistants.find(l => d.motif.test(l)) || d.defaut
}

// --- Même séance vue des deux côtés ------------------------------------------------------------
// Le sportif valide sa séance dans Ostryk ET sa montre l'envoie sur Strava : c'est UNE séance.
// Sans rapprochement, l'import Strava cherchait la PROCHAINE séance non faite du programme (la
// séance du jour étant déjà validée) et, faute de mieux, créait une activité libre « Musculation »
// à côté : deux activités pour un seul entraînement. On rattache donc l'activité Strava à la
// séance validée le même jour, dans la même discipline — dans les deux ordres d'arrivée.

const famille = (d) => d.famille || d.defaut

function disciplineDeLActivite(activity) {
  return DISCIPLINES.find(x => x.types.includes(activity.type) || x.types.includes(activity.sport_type))
    || DISCIPLINES.find(x => x.motif.test(activity.name || ''))
    || null
}

// Discipline Strava `d` comparée à une séance Ostryk : par le type d'activité du programme quand il
// en désigne une, sinon par le mode de la séance (une séance « cardio » n'est pas de la muscu).
function memeDiscipline(d, programActivityType, activityMode) {
  if (!d) return false
  const duProgramme = DISCIPLINES.find(x => x.motif.test(programActivityType || ''))
  if (duProgramme) return famille(duProgramme) === famille(d)
  return famille(d) === 'force' ? activityMode !== 'cardio' : activityMode === 'cardio'
}

// Jour vécu par le sportif. Les dates Ostryk sont des instants UTC : on les ramène à l'heure de
// Paris (app mono-coach en France), comme start_date_local côté Strava.
function jourParis(iso) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris' }).format(new Date(iso))
}

// Séance validée ce jour-là, pas encore liée à Strava, de la même discipline que l'activité.
async function seanceValideeDuJour(athleteId, activity) {
  const jour = (activity.start_date_local || activity.start_date).slice(0, 10)
  const debut = new Date(`${jour}T00:00:00Z`); debut.setUTCDate(debut.getUTCDate() - 1)
  const fin = new Date(`${jour}T00:00:00Z`); fin.setUTCDate(fin.getUTCDate() + 2)
  const { data } = await supabaseAdmin.from('program_completions')
    .select('id, completed_at, duration_minutes, distance_km, program_sessions(activity_mode, programs(activity_type))')
    .eq('athlete_id', athleteId).is('strava_activity_id', null).eq('skipped', false)
    .gte('completed_at', debut.toISOString()).lt('completed_at', fin.toISOString())
    .order('completed_at')
  const d = disciplineDeLActivite(activity)
  return (data || []).find(c => c.completed_at && jourParis(c.completed_at) === jour
    && memeDiscipline(d, c.program_sessions?.programs?.activity_type, c.program_sessions?.activity_mode)) || null
}

// Le sportif vient de valider une séance (route session-completed) : si Strava est passé avant et a
// rangé l'activité du jour à part, on la rattache à la séance et on supprime le doublon. Seulement
// pour une activité libre qui ne contient QUE cette activité Strava (pas d'addition de plusieurs
// sorties, pas de chiffres saisis à la main qu'on effacerait).
export async function rattacherStravaALaSeance(athleteId, programSessionId) {
  const { data: c } = await supabaseAdmin.from('program_completions')
    .select('id, completed_at, strava_activity_id, duration_minutes, distance_km, program_sessions(activity_mode, programs(activity_type))')
    .eq('athlete_id', athleteId).eq('program_session_id', programSessionId).eq('skipped', false).maybeSingle()
  if (!c || c.strava_activity_id || !c.completed_at) return false

  const { data: logs } = await supabaseAdmin.from('activity_logs')
    .select('id, label, km, duration_minutes, strava_activity_ids')
    .eq('athlete_id', athleteId).eq('date', jourParis(c.completed_at)).eq('type', 'custom')
  const log = (logs || []).find(l => (l.strava_activity_ids || []).length === 1
    && memeDiscipline(DISCIPLINES.find(x => x.motif.test(l.label || '')), c.program_sessions?.programs?.activity_type, c.program_sessions?.activity_mode))
  if (!log) return false

  const { error } = await supabaseAdmin.from('program_completions').update({
    strava_activity_id: log.strava_activity_ids[0],
    ...(c.duration_minutes == null && log.duration_minutes != null ? { duration_minutes: log.duration_minutes } : {}),
    ...(c.distance_km == null && log.km != null ? { distance_km: log.km } : {}),
  }).eq('id', c.id).is('strava_activity_id', null)
  if (error) return false
  await supabaseAdmin.from('activity_logs').delete().eq('id', log.id)
  return true
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

  // Séance déjà validée dans Ostryk le même jour : c'est le même entraînement, on l'y rattache
  // (durée/distance Strava seulement si le sportif ne les a pas saisies, ressenti intact).
  const duJour = await seanceValideeDuJour(athlete.id, activity)
  if (duJour) {
    const { error } = await supabaseAdmin.from('program_completions').update({
      strava_activity_id: activity.id,
      ...(duJour.duration_minutes == null ? { duration_minutes: Math.round(activity.moving_time / 60) } : {}),
      ...(duJour.distance_km == null && activity.distance > 0 ? { distance_km: Math.round((activity.distance / 1000) * 100) / 100 } : {}),
    }).eq('id', duJour.id).is('strava_activity_id', null)
    if (!error) {
      await notifierImport(athlete, activity, activityTypeLabel)
      return { imported: true }
    }
  }

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
