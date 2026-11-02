import { supabaseAdmin } from '@/lib/supabase-admin'
import { NextResponse } from 'next/server'
import { accesAthlete } from '@/lib/athleteAcces'

export const dynamic = 'force-dynamic'

// Calculateur d'apport de l'onglet Nutrition : le sportif (ou son coach) lit son profil pour
// préremplir le calcul, puis enregistre ses objectifs journaliers — les mêmes colonnes que celles
// réglées par le coach depuis la fiche client (le dernier qui enregistre l'emporte).
const COLONNES = 'id, coach_id, auth_user_id, sex, birth_date, weight, height, objectif_kcal, objectif_proteines, objectif_glucides, objectif_lipides'

export async function GET(request, { params }) {
  const { token } = await params
  const { athlete, reponse } = await accesAthlete(token, COLONNES)
  if (reponse) return reponse
  return NextResponse.json({
    profil: { sexe: athlete.sex, naissance: athlete.birth_date, poids: athlete.weight, taille: athlete.height },
    objectifs: { kcal: athlete.objectif_kcal, proteines: athlete.objectif_proteines, glucides: athlete.objectif_glucides, lipides: athlete.objectif_lipides },
  })
}

// Bornes larges : on refuse seulement l'absurde (faute de frappe), pas les choix du sportif.
const BORNES = { kcal: [800, 8000], proteines: [0, 600], glucides: [0, 1200], lipides: [0, 400] }

export async function PUT(request, { params }) {
  const { token } = await params
  const { athlete, reponse } = await accesAthlete(token)
  if (reponse) return reponse

  const corps = await request.json().catch(() => ({}))
  const valeurs = {}
  for (const [cle, [min, max]] of Object.entries(BORNES)) {
    const n = Math.round(Number(corps[cle]))
    if (!Number.isFinite(n) || n < min || n > max) {
      return NextResponse.json({ error: `Valeur invalide pour ${cle === 'kcal' ? 'les calories' : `les ${cle}`} (entre ${min} et ${max}).` }, { status: 400 })
    }
    valeurs[cle] = n
  }

  const { error } = await supabaseAdmin.from('athletes').update({
    objectif_kcal: valeurs.kcal, objectif_proteines: valeurs.proteines,
    objectif_glucides: valeurs.glucides, objectif_lipides: valeurs.lipides,
  }).eq('id', athlete.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ objectifs: valeurs })
}
