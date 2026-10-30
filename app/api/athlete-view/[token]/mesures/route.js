import { supabaseAdmin } from '@/lib/supabase-admin'
import { NextResponse } from 'next/server'
import { accesAthlete } from '@/lib/athleteAcces'
import { CHAMPS_MESURES, valeurMesure } from '@/lib/mesures'

export const dynamic = 'force-dynamic'

const JOUR = /^\d{4}-\d{2}-\d{2}$/

export async function GET(request, { params }) {
  const { token } = await params
  const { athlete, reponse } = await accesAthlete(token)
  if (reponse) return reponse

  const { data, error } = await supabaseAdmin.from('mesures_corporelles').select('*')
    .eq('athlete_id', athlete.id).order('date', { ascending: false }).limit(365)
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ mesures: data || [] })
}

// Une mesure par jour : ressaisir le même jour complète / corrige la ligne existante. Un champ
// laissé vide n'efface pas une valeur déjà saisie ce jour-là (on peut noter le poids le matin et
// les tours le soir).
export async function POST(request, { params }) {
  const { token } = await params
  const { athlete, role, reponse } = await accesAthlete(token)
  if (reponse) return reponse

  const corps = await request.json()
  if (!JOUR.test(corps.date || '')) return NextResponse.json({ error: 'date invalide' }, { status: 400 })

  const valeurs = {}
  for (const champ of CHAMPS_MESURES) {
    const v = valeurMesure(champ, corps[champ.key])
    if (v === undefined) return NextResponse.json({ error: `${champ.label} : valeur impossible.` }, { status: 400 })
    if (v !== null) valeurs[champ.key] = v
  }
  if (!Object.keys(valeurs).length) return NextResponse.json({ error: 'Renseigne au moins une mesure.' }, { status: 400 })

  const { data, error } = await supabaseAdmin.from('mesures_corporelles')
    .upsert({ athlete_id: athlete.id, date: corps.date, ...valeurs, saisi_par: role, updated_at: new Date().toISOString() }, { onConflict: 'athlete_id,date' })
    .select('*').single()
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  // athletes.weight = le poids le plus récent, lu ailleurs dans l'app (badges, plan alimentaire).
  if (valeurs.poids_kg !== undefined) {
    const { data: dernier } = await supabaseAdmin.from('mesures_corporelles').select('poids_kg')
      .eq('athlete_id', athlete.id).not('poids_kg', 'is', null).order('date', { ascending: false }).limit(1).maybeSingle()
    if (dernier) await supabaseAdmin.from('athletes').update({ weight: dernier.poids_kg }).eq('id', athlete.id)
  }

  return NextResponse.json({ mesure: data })
}

export async function DELETE(request, { params }) {
  const { token } = await params
  const { athlete, reponse } = await accesAthlete(token)
  if (reponse) return reponse

  const id = new URL(request.url).searchParams.get('id')
  const { error } = await supabaseAdmin.from('mesures_corporelles').delete().eq('id', id).eq('athlete_id', athlete.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ ok: true })
}
