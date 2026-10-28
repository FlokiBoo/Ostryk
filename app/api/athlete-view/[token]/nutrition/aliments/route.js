import { supabaseAdmin } from '@/lib/supabase-admin'
import { NextResponse } from 'next/server'
import { accesAthlete } from '@/lib/athleteAcces'
import { depuisAliment } from '@/lib/nutrition'

export const dynamic = 'force-dynamic'

const nombre = v => {
  if (v === null || v === undefined || v === '') return null
  const n = Number(String(v).replace(',', '.'))
  return Number.isFinite(n) && n >= 0 && n < 10000 ? Math.round(n * 100) / 100 : null
}

// Création d'un aliment par le sportif, après relecture de ce que Claude a lu sur ses photos.
// Visible de tous tout de suite, mais 'a_verifier' jusqu'au passage du coach.
export async function POST(request, { params }) {
  const { token } = await params
  const { athlete, reponse } = await accesAthlete(token)
  if (reponse) return reponse

  const corps = await request.json()
  const nom = (corps.nom || '').trim().slice(0, 120)
  if (!nom) return NextResponse.json({ error: 'Le nom est obligatoire.' }, { status: 400 })
  const valeurs = {
    kcal_100g: nombre(corps.kcal_100g), proteines_100g: nombre(corps.proteines_100g),
    glucides_100g: nombre(corps.glucides_100g), lipides_100g: nombre(corps.lipides_100g),
  }
  if (Object.values(valeurs).every(v => v === null)) {
    return NextResponse.json({ error: 'Renseigne au moins les calories ou une macro.' }, { status: 400 })
  }
  const code = (corps.code_barres || '').replace(/\D/g, '') || null
  // Les chemins viennent de la route d'analyse ; on n'accepte que ceux du dossier du sportif.
  const chemin = p => (typeof p === 'string' && p.startsWith(`${athlete.id}/`) ? p : null)

  const { data, error } = await supabaseAdmin.from('aliments').insert({
    name: nom,
    marque: (corps.marque || '').trim().slice(0, 80) || null,
    code_barres: code,
    ...valeurs,
    sucres_100g: nombre(corps.sucres_100g),
    fibres_100g: nombre(corps.fibres_100g),
    sel_100g: nombre(corps.sel_100g),
    portion_g: nombre(corps.portion_g),
    source: 'photo',
    statut: 'a_verifier',
    cree_par_athlete_id: athlete.id,
    photo_nom_path: chemin(corps.photos?.nom),
    photo_valeurs_path: chemin(corps.photos?.valeurs),
  }).select('*').single()

  if (error) {
    // Code-barres déjà connu (créé entre-temps par un autre sportif) : on renvoie l'existant.
    if (code) {
      const { data: existant } = await supabaseAdmin.from('aliments').select('*').eq('code_barres', code).maybeSingle()
      if (existant) return NextResponse.json({ aliment: depuisAliment(existant) })
    }
    return NextResponse.json({ error: error.message }, { status: 400 })
  }
  return NextResponse.json({ aliment: depuisAliment(data) })
}
