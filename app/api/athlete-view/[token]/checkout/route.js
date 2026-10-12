import { supabaseAdmin } from '@/lib/supabase-admin'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { stripe, SUBSCRIPTION_TIERS } from '@/lib/stripe'
import { SUBSCRIPTIONS_ENABLED } from '@/lib/subscriptionTiers'

export async function POST(request, { params }) {
  if (!SUBSCRIPTIONS_ENABLED) return NextResponse.json({ error: 'Les abonnements sont désactivés pour le moment.' }, { status: 403 })
  const { token } = await params
  const { tier } = await request.json()
  if (!SUBSCRIPTION_TIERS[tier]) return NextResponse.json({ error: 'formule invalide' }, { status: 400 })

  const { data: athlete } = await supabaseAdmin.from('athletes').select('*').eq('token', token).single()
  if (!athlete) return NextResponse.json({ error: 'introuvable' }, { status: 404 })

  // Seul le sportif lui-même peut s'abonner pour son propre compte
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    { cookies: { getAll() { return cookieStore.getAll() }, setAll(cookiesToSet) { cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options)) } } }
  )
  const { data: { user } } = await supabase.auth.getUser()
  if (!user || athlete.auth_user_id !== user.id) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const priceId = process.env[SUBSCRIPTION_TIERS[tier].priceEnv]
  if (!priceId) return NextResponse.json({ error: `Prix Stripe non configuré pour la formule ${tier}` }, { status: 500 })

  let customerId = athlete.stripe_customer_id
  if (!customerId) {
    const customer = await stripe.customers.create({
      email: athlete.email || undefined,
      name: athlete.name,
      metadata: { athlete_id: athlete.id },
    })
    customerId = customer.id
    await supabaseAdmin.from('athletes').update({ stripe_customer_id: customerId }).eq('id', athlete.id)
  }

  const { origin } = new URL(request.url)
  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    customer: customerId,
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${origin}/s/${token}?subscribed=1`,
    cancel_url: `${origin}/s/${token}`,
    metadata: { athlete_id: athlete.id, tier },
    subscription_data: { metadata: { athlete_id: athlete.id, tier } },
    allow_promotion_codes: true,
  })

  return NextResponse.json({ url: session.url })
}
