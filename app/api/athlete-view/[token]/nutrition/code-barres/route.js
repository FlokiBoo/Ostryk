import { supabaseAdmin } from '@/lib/supabase-admin'
import { NextResponse } from 'next/server'
import { accesAthlete } from '@/lib/athleteAcces'
import { depuisAliment } from '@/lib/nutrition'

export const dynamic = 'force-dynamic'

const nombre = v => (v === null || v === undefined || v === '' || Number.isNaN(Number(v)) ? null : Math.round(Number(v) * 10) / 10)

// Produit scanné : d'abord chez nous (déjà scanné ou créé depuis des photos), sinon Open Food
// Facts, dont le résultat est recopié dans `aliments` pour les scans suivants.
// → { aliment } ou { trouve: false } (le sportif passe alors aux photos).
export async function GET(request, { params }) {
  const { token } = await params
  const { reponse } = await accesAthlete(token)
  if (reponse) return reponse

  const code = (new URL(request.url).searchParams.get('code') || '').replace(/\D/g, '')
  if (code.length < 8 || code.length > 14) return NextResponse.json({ error: 'code-barres invalide' }, { status: 400 })

  const { data: connu } = await supabaseAdmin.from('aliments').select('*').eq('code_barres', code).maybeSingle()
  if (connu) return NextResponse.json({ aliment: depuisAliment(connu) })

  let produit = null
  try {
    const res = await fetch(`https://world.openfoodfacts.org/api/v2/product/${code}.json?fields=product_name,product_name_fr,brands,nutriments,serving_quantity`, {
      headers: { 'User-Agent': 'OSTRYK/1.0 (contact via ostryk.fr)' },
      signal: AbortSignal.timeout(8000),
    })
    if (res.ok) {
      const json = await res.json()
      if (json.status === 1) produit = json.product
    }
  } catch {
    // Open Food Facts injoignable : on se comporte comme un produit inconnu, les photos prennent le relais.
  }

  const n = produit?.nutriments || {}
  const nom = (produit?.product_name_fr || produit?.product_name || '').trim()
  // Une fiche sans nom ou sans aucune valeur ne sert à rien : mieux vaut passer aux photos.
  if (!produit || !nom || [n['energy-kcal_100g'], n.proteins_100g, n.carbohydrates_100g, n.fat_100g].every(v => nombre(v) === null)) {
    return NextResponse.json({ trouve: false })
  }

  const { data: cree, error } = await supabaseAdmin.from('aliments').insert({
    name: nom,
    marque: (produit.brands || '').split(',')[0].trim() || null,
    code_barres: code,
    kcal_100g: nombre(n['energy-kcal_100g']),
    proteines_100g: nombre(n.proteins_100g),
    glucides_100g: nombre(n.carbohydrates_100g),
    sucres_100g: nombre(n.sugars_100g),
    lipides_100g: nombre(n.fat_100g),
    fibres_100g: nombre(n.fiber_100g),
    sel_100g: nombre(n.salt_100g),
    portion_g: nombre(produit.serving_quantity),
    source: 'off',
    statut: 'verifie',
  }).select('*').single()

  if (error) {
    // Deux scans simultanés du même produit : l'index unique a refusé le second, on relit le premier.
    const { data: existant } = await supabaseAdmin.from('aliments').select('*').eq('code_barres', code).maybeSingle()
    if (existant) return NextResponse.json({ aliment: depuisAliment(existant) })
    return NextResponse.json({ error: error.message }, { status: 400 })
  }
  return NextResponse.json({ aliment: depuisAliment(cree) })
}
