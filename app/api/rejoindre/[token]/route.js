import { supabaseAdmin } from '@/lib/supabase-admin'
import { NextResponse } from 'next/server'
import { sendEmail } from '@/lib/email'
import { isPasswordValid, passwordPolicyMessage } from '@/lib/passwordPolicy'

// Lien d'invitation personnel d'un client (/rejoindre/<token>), copié depuis sa fiche par le coach.
// Contrairement à l'invitation par email (lien Supabase qui expire vite) et au lien général
// d'inscription (qui crée une NOUVELLE fiche, d'où les doublons), il ne périme pas et rattache le
// compte créé à la fiche existante. Utilisable une seule fois : dès que la fiche a un compte
// (auth_user_id), il ne fait plus que renvoyer vers la connexion.
//
// Comme l'inscription normale, le client renseigne (ou corrige) ses informations : prénom, nom,
// date de naissance, taille, poids, poids cible. Elles sont écrites sur SA fiche, qui garde tout le
// reste (programmes en cours, historique…). Un champ laissé vide n'efface pas ce que le coach avait
// déjà saisi.
//
// Pas de session requise (le client n'a pas encore de compte) : la route n'expose que le nom et
// l'email déjà connus de la fiche, jamais le reste.

async function ficheDuLien(token) {
  if (!token || token.length < 12) return null
  const { data } = await supabaseAdmin.from('athletes')
    .select('id, name, email, auth_user_id, coach_id, archived').eq('token', token).maybeSingle()
  return data && !data.archived ? data : null
}

export async function GET(request, { params }) {
  const { token } = await params
  const fiche = await ficheDuLien(token)
  if (!fiche) return NextResponse.json({ error: 'Lien invalide.' }, { status: 404 })
  const [prenom, ...nom] = (fiche.name || '').trim().split(/\s+/)
  return NextResponse.json({
    prenom: prenom || null,
    nom: nom.join(' ') || null,
    email: fiche.email || null,
    active: !!fiche.auth_user_id,
  })
}

export async function POST(request, { params }) {
  const { token } = await params
  const { email, password, prenom, nom, birth_date, height, weight, target_weight } = await request.json().catch(() => ({}))
  const fiche = await ficheDuLien(token)
  if (!fiche) return NextResponse.json({ error: 'Lien invalide.' }, { status: 404 })
  if (fiche.auth_user_id) return NextResponse.json({ error: 'Ce compte est déjà activé : connecte-toi.', active: true }, { status: 409 })

  const adresse = (email || '').trim().toLowerCase()
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(adresse)) return NextResponse.json({ error: 'Adresse email invalide.' }, { status: 400 })
  if (!isPasswordValid(password)) return NextResponse.json({ error: passwordPolicyMessage() }, { status: 400 })
  const nomComplet = `${(prenom || '').trim()} ${(nom || '').trim()}`.trim()
  if (!(prenom || '').trim()) return NextResponse.json({ error: 'Ton prénom est requis.' }, { status: 400 })
  const nombre = (v) => { const n = parseFloat(v); return Number.isFinite(n) && n > 0 ? n : null }
  const infos = {
    name: nomComplet,
    ...(/^\d{4}-\d{2}-\d{2}$/.test(birth_date || '') ? { birth_date } : {}),
    ...(nombre(height) ? { height: Math.round(nombre(height)) } : {}),
    ...(nombre(weight) ? { weight: nombre(weight) } : {}),
    ...(nombre(target_weight) ? { target_weight: nombre(target_weight) } : {}),
  }

  // Email déjà porté par une AUTRE fiche : on ne crée pas un second compte pour la même personne.
  const { data: autre } = await supabaseAdmin.from('athletes').select('id').ilike('email', adresse).neq('id', fiche.id).maybeSingle()
  if (autre) {
    return NextResponse.json({ error: 'Cet email est déjà utilisé par un autre compte Ostryk. Préviens ton coach pour qu’il fusionne les deux.' }, { status: 409 })
  }

  const { data: cree, error: erreurCreation } = await supabaseAdmin.auth.admin.createUser({
    email: adresse,
    password,
    email_confirm: true,
    user_metadata: { name: nomComplet },
    app_metadata: { athlete_token: token },
  })
  if (erreurCreation) {
    const dejaInscrit = /already.*registered|already exists/i.test(erreurCreation.message || '')
    return NextResponse.json({
      error: dejaInscrit
        ? 'Un compte existe déjà avec cet email. Connecte-toi, ou préviens ton coach si ce compte n’est pas relié à ta fiche.'
        : erreurCreation.message,
    }, { status: dejaInscrit ? 409 : 400 })
  }

  // Rattachement conditionnel : si deux activations arrivent en même temps, une seule gagne.
  const { data: liee, error: erreurLien } = await supabaseAdmin.from('athletes')
    .update({ auth_user_id: cree.user.id, email: adresse, ...infos })
    .eq('id', fiche.id).is('auth_user_id', null)
    .select('id').maybeSingle()
  if (erreurLien || !liee) {
    await supabaseAdmin.auth.admin.deleteUser(cree.user.id)
    return NextResponse.json({ error: erreurLien?.message || 'Ce compte vient d’être activé : connecte-toi.' }, { status: 409 })
  }

  const { data: coach } = await supabaseAdmin.from('coaches').select('email').eq('id', fiche.coach_id).maybeSingle()
  if (coach?.email) {
    await sendEmail({
      to: coach.email,
      subject: `${nomComplet} a activé son compte`,
      html: `<p><strong>${nomComplet}</strong> vient d’activer son compte Ostryk (${adresse}) avec son lien personnel.</p>`,
    }).catch(() => {})
  }

  return NextResponse.json({ success: true })
}
