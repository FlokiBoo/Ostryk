import { supabaseAdmin } from '@/lib/supabase-admin'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

// Tableau de bord → "Mouvements à filmer" : les mouvements de la bibliothèque qui n'ont pas de
// vidéo, ou dont la vidéo ne vient pas de la chaîne du coach, avec les programmes qui les utilisent
// (pour savoir quoi tourner en priorité).
//
// Chaîne de la vidéo : lue via oEmbed YouTube (public, sans clé d'API), mise en cache le temps de
// vie de l'instance serveur — une vidéo ne change pas de chaîne.
// Programmes : ceux de la bibliothèque du coach (athlete_id null) et ceux faits sur mesure pour un
// client (sans source_program_id), hors archivés. Les copies suivies par les clients sont ignorées :
// elles répéteraient le programme source autant de fois qu'il y a de clients.
// Un mouvement est "utilisé" par un programme s'il y figure comme exercice (par son nom, comme
// partout dans l'app) ou s'il est cité par un jeton # de l'échauffement / du retour au calme.

export const dynamic = 'force-dynamic'

const MA_CHAINE = 'https://www.youtube.com/@Ms_Coachingg'
const cacheChaines = new Map() // url → { nom, url } | null (vidéo introuvable)

async function chaineDe(url) {
  if (cacheChaines.has(url)) return cacheChaines.get(url)
  let chaine = null
  try {
    const r = await fetch(`https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(url)}`, { signal: AbortSignal.timeout(6000) })
    if (r.ok) {
      const j = await r.json()
      chaine = { nom: j.author_name || 'Chaîne inconnue', url: j.author_url || '' }
    }
  } catch { /* réseau / délai : on réessaiera au prochain appel */ return undefined }
  cacheChaines.set(url, chaine)
  return chaine
}

const cle = (nom) => (nom || '').trim().toLowerCase()

// Deux programmes de même titre pour le même client (phase recopiée, ancienne version…) : une seule
// étiquette, avec leur nombre, plutôt que le même nom répété.
function regrouper(progs) {
  const parEtiquette = new Map()
  for (const p of progs) {
    const k = `${p.titre}|${p.client || ''}|${p.workout}`
    if (parEtiquette.has(k)) parEtiquette.get(k).nb += 1
    else parEtiquette.set(k, { ...p, nb: 1 })
  }
  return [...parEtiquette.values()].sort((a, b) => a.titre.localeCompare(b.titre, 'fr'))
}

export async function GET() {
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    { cookies: { getAll() { return cookieStore.getAll() }, setAll(cookiesToSet) { cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options)) } } }
  )
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const { data: coach } = await supabaseAdmin.from('coaches').select('id').eq('id', user.id).maybeSingle()
  if (!coach) return NextResponse.json({ error: 'forbidden' }, { status: 403 })

  const [{ data: mouvements }, { data: programmes }] = await Promise.all([
    supabaseAdmin.from('movements').select('id, name, youtube_url, video_url').order('name'),
    supabaseAdmin.from('programs')
      .select('id, title, athlete_id, is_workout, athletes(name), program_sessions(warmup_content, cooldown_content, program_exercises(name))')
      .is('source_program_id', null).neq('archived', true),
  ])

  // mouvement (clé de nom ou id) → programmes qui l'utilisent
  const parNom = new Map()
  const parId = new Map()
  const ajouter = (map, k, p) => { if (!map.has(k)) map.set(k, new Map()); map.get(k).set(p.id, p) }
  for (const p of programmes || []) {
    const prog = {
      id: p.id,
      titre: p.title || 'Programme sans titre',
      client: p.athlete_id ? (p.athletes?.name || 'Client') : null,
      workout: !!p.is_workout,
      lien: p.athlete_id ? `/programs/${p.athlete_id}/${p.id}` : `/programs/templates/${p.id}`,
    }
    for (const s of p.program_sessions || []) {
      for (const e of s.program_exercises || []) if (e.name) ajouter(parNom, cle(e.name), prog)
      for (const contenu of [s.warmup_content, s.cooldown_content]) {
        for (const l of Array.isArray(contenu) ? contenu : []) if (l?.mouvementId) ajouter(parId, l.mouvementId, prog)
      }
    }
  }

  const resultats = await Promise.all((mouvements || []).map(async m => {
    const video = m.youtube_url || m.video_url || null
    let statut = 'aucune', chaine = null
    if (video) {
      chaine = await chaineDe(video)
      if (chaine === undefined) { statut = 'inconnue'; chaine = null }
      else if (!chaine) statut = 'indisponible'
      else statut = chaine.url.toLowerCase() === MA_CHAINE.toLowerCase() ? 'mienne' : 'externe'
    }
    const progs = new Map([...(parNom.get(cle(m.name)) || new Map()), ...(parId.get(m.id) || new Map())])
    return {
      id: m.id,
      nom: m.name,
      video,
      statut, // aucune | externe | indisponible (vidéo supprimée / privée) | inconnue (YouTube injoignable) | mienne
      chaine: chaine?.nom || null,
      programmes: regrouper([...progs.values()]),
    }
  }))

  const aFilmer = resultats
    .filter(r => r.statut !== 'mienne')
    // Les plus utilisés d'abord : ce sont ceux que les clients voient le plus.
    .sort((a, b) => b.programmes.length - a.programmes.length || a.nom.localeCompare(b.nom, 'fr'))

  return NextResponse.json({
    total: resultats.length,
    miennes: resultats.filter(r => r.statut === 'mienne').length,
    mouvements: aFilmer,
  }, { headers: { 'Cache-Control': 'no-store' } })
}
