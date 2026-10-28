import { supabaseAdmin } from '@/lib/supabase-admin'
import { NextResponse } from 'next/server'
import { accesAthlete } from '@/lib/athleteAcces'
import { rechercherCiqual } from '@/lib/ciqualRecherche'
import { depuisAliment, depuisCiqual } from '@/lib/nutrition'

export const dynamic = 'force-dynamic'

// Recherche par nom : les aliments partagés (créés par les coachs et les sportifs, produits
// scannés) d'abord, puis CIQUAL. Open Food Facts n'est pas interrogé ici — trop lent pour une
// saisie au clavier, et le scan du code-barres couvre déjà les produits emballés.
export async function GET(request, { params }) {
  const { token } = await params
  const { reponse } = await accesAthlete(token)
  if (reponse) return reponse

  const q = (new URL(request.url).searchParams.get('q') || '').trim()
  if (q.length < 2) return NextResponse.json({ resultats: [] })

  // Virgules, parenthèses et jokers casseraient la syntaxe du filtre .or() de PostgREST.
  const motif = q.replace(/[,()%*\\]/g, ' ').trim()
  const { data } = motif
    ? await supabaseAdmin.from('aliments').select('*')
      .or(`name.ilike.%${motif}%,marque.ilike.%${motif}%`)
      .order('name').limit(8)
    : { data: [] }

  return NextResponse.json({
    resultats: [...(data || []).map(depuisAliment), ...rechercherCiqual(q, 10).map(depuisCiqual)],
  })
}
