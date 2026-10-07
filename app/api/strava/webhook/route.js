import { supabaseAdmin } from '@/lib/supabase-admin'
import { getValidStravaToken, fetchStravaActivity, processStravaActivity, stravaDejaTraitee } from '@/lib/strava'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

// Poignée de main de validation de l'abonnement webhook (faite une seule fois à la création).
export async function GET(request) {
  const { searchParams } = new URL(request.url)
  const mode = searchParams.get('hub.mode')
  const token = searchParams.get('hub.verify_token')
  const challenge = searchParams.get('hub.challenge')

  if (mode === 'subscribe' && token === process.env.STRAVA_WEBHOOK_VERIFY_TOKEN) {
    return NextResponse.json({ 'hub.challenge': challenge })
  }
  return NextResponse.json({ error: 'forbidden' }, { status: 403 })
}

// Événement d'activité Strava. On répond vite (Strava exige <2s) : seules les activités
// fraîchement créées déclenchent un traitement, tout le reste est ignoré immédiatement.
export async function POST(request) {
  const body = await request.json().catch(() => null)
  if (!body) return NextResponse.json({ ok: true })

  if (body.object_type !== 'activity' || body.aspect_type !== 'create') {
    return NextResponse.json({ ok: true })
  }

  const { data: athlete } = await supabaseAdmin.from('athletes')
    .select('id, strava_access_token, strava_refresh_token, strava_token_expires_at')
    .eq('strava_athlete_id', body.owner_id).maybeSingle()
  if (!athlete) return NextResponse.json({ ok: true })

  // Strava redélivre parfois le même événement plusieurs fois (retry si on met trop de temps à
  // répondre) — sans ça, chaque retry consommait une séance de plus dans le programme réel de
  // l'athlète (3 séances marquées faites pour une seule vraie sortie) ou comptait deux fois la même
  // activité libre. L'id d'activité Strava est stable d'un retry à l'autre : on l'utilise comme clé
  // d'idempotence, avant même d'aller chercher une séance.
  const stravaActivityId = body.object_id
  if (await stravaDejaTraitee(athlete.id, stravaActivityId)) return NextResponse.json({ ok: true })

  const accessToken = await getValidStravaToken(athlete)
  if (!accessToken) return NextResponse.json({ ok: true })

  const activity = await fetchStravaActivity(accessToken, stravaActivityId)
  if (!activity) return NextResponse.json({ ok: true })

  await processStravaActivity(athlete, activity)
  return NextResponse.json({ ok: true })
}
