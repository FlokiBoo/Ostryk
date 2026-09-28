import { supabaseAdmin } from '@/lib/supabase-admin'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { stripe, SUBSCRIPTION_TIERS } from '@/lib/stripe'

export async function POST(request, { params }) {
  const { token } = await params
  const { tier } = await request.json()
  if (!SUBSCRIPTION_TIERS[tier]) return NextResponse.json({ error: 'formule invalide' }, { status: 400 })

  const { data: athlete } = await supabaseAdmin.from('athletes').select('*').eq('token', token).single()
  if (!athlete) return NextResponse.json({ error: 'introuvable' }, { status: 404 })

  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    { cookies: { getAll() { return cookieStore.getAll() }, setAll(cookiesToSet) { cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options)) } } }
  )
  const { data: { user } } = await supabase.auth.getUser()
  if (!user || athlete.auth_user_id !== user.id) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  if (!athlete.stripe_subscription_id || athlete.subscription_status !== 'active') {
    return NextResponse.json({ error: 'Aucun abonnement actif à changer' }, { status: 400 })
  }
  if (athlete.subscription_tier === tier) {
    return NextResponse.json({ error: 'Déjà sur cette formule' }, { status: 400 })
  }

  const priceId = process.env[SUBSCRIPTION_TIERS[tier].priceEnv]
  if (!priceId) return NextResponse.json({ error: `Prix Stripe non configuré pour la formule ${tier}` }, { status: 500 })

  const subscription = await stripe.subscriptions.retrieve(athlete.stripe_subscription_id)
  // Résiliation programmée : un changement avec prorata ferait payer la différence alors que
  // l'abonnement s'arrête quand même à la date prévue.
  if (subscription.cancel_at_period_end || subscription.cancel_at) {
    return NextResponse.json({ error: 'Ton abonnement se termine bientôt : continue-le d’abord, puis tu pourras changer de formule.' }, { status: 400 })
  }
  const itemId = subscription.items.data[0]?.id
  if (!itemId) return NextResponse.json({ error: 'Abonnement Stripe invalide' }, { status: 500 })

  const updated = await stripe.subscriptions.update(athlete.stripe_subscription_id, {
    items: [{ id: itemId, price: priceId }],
    proration_behavior: 'create_prorations',
    metadata: { athlete_id: athlete.id, tier },
  })

  await supabaseAdmin.from('athletes').update({
    subscription_tier: tier,
    subscription_status: updated.status,
  }).eq('id', athlete.id)

  return NextResponse.json({ ok: true })
}
