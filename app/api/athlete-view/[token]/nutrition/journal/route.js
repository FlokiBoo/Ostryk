import { supabaseAdmin } from '@/lib/supabase-admin'
import { NextResponse } from 'next/server'
import { accesAthlete } from '@/lib/athleteAcces'
import { ciqualParId } from '@/lib/ciqualRecherche'
import { REPAS_KEYS, depuisAliment, depuisCiqual, valeursPourQuantite } from '@/lib/nutrition'

export const dynamic = 'force-dynamic'

const JOUR = /^\d{4}-\d{2}-\d{2}$/
const COLONNES = 'id, coach_id, auth_user_id, objectif_kcal, objectif_proteines, objectif_glucides, objectif_lipides'

// Journée du sportif : ses entrées et les objectifs fixés par le coach.
export async function GET(request, { params }) {
  const { token } = await params
  const { athlete, reponse } = await accesAthlete(token, COLONNES)
  if (reponse) return reponse

  const jour = new URL(request.url).searchParams.get('jour')
  if (!JOUR.test(jour || '')) return NextResponse.json({ error: 'jour invalide' }, { status: 400 })

  const { data, error } = await supabaseAdmin.from('nutrition_journal')
    .select('id, repas, nom, quantite_g, kcal, proteines, glucides, lipides, aliment_id, ciqual_id, created_at')
    .eq('athlete_id', athlete.id).eq('jour', jour).order('created_at')
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  return NextResponse.json({
    entrees: data || [],
    objectifs: { kcal: athlete.objectif_kcal, proteines: athlete.objectif_proteines, glucides: athlete.objectif_glucides, lipides: athlete.objectif_lipides },
  })
}

// Les valeurs sont recalculées ici depuis la source (aliment en base ou CIQUAL), pas reprises du
// navigateur : le journal sert aussi au coach, il ne doit pas dépendre de ce que le client envoie.
export async function POST(request, { params }) {
  const { token } = await params
  const { athlete, reponse } = await accesAthlete(token)
  if (reponse) return reponse

  const { jour, repas, source, id, quantite_g } = await request.json()
  const quantite = Number(quantite_g)
  if (!JOUR.test(jour || '')) return NextResponse.json({ error: 'jour invalide' }, { status: 400 })
  if (!REPAS_KEYS.includes(repas)) return NextResponse.json({ error: 'repas invalide' }, { status: 400 })
  if (!(quantite > 0) || quantite > 5000) return NextResponse.json({ error: 'quantité invalide' }, { status: 400 })

  let aliment = null
  if (source === 'aliment') {
    const { data } = await supabaseAdmin.from('aliments').select('*').eq('id', id).maybeSingle()
    if (data) aliment = depuisAliment(data)
  } else if (source === 'ciqual') {
    const c = ciqualParId(id)
    if (c) aliment = depuisCiqual(c)
  }
  if (!aliment) return NextResponse.json({ error: 'aliment introuvable' }, { status: 404 })

  const { data, error } = await supabaseAdmin.from('nutrition_journal').insert({
    athlete_id: athlete.id, jour, repas, quantite_g: quantite,
    aliment_id: source === 'aliment' ? aliment.id : null,
    ciqual_id: source === 'ciqual' ? aliment.id : null,
    nom: aliment.marque ? `${aliment.nom} · ${aliment.marque}` : aliment.nom,
    ...valeursPourQuantite(aliment.pour100, quantite),
  }).select('id, repas, nom, quantite_g, kcal, proteines, glucides, lipides, aliment_id, ciqual_id, created_at').single()
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  return NextResponse.json({ entree: data })
}

export async function DELETE(request, { params }) {
  const { token } = await params
  const { athlete, reponse } = await accesAthlete(token)
  if (reponse) return reponse

  const id = new URL(request.url).searchParams.get('id')
  const { error } = await supabaseAdmin.from('nutrition_journal').delete().eq('id', id).eq('athlete_id', athlete.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ ok: true })
}
