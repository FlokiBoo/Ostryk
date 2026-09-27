import { supabaseAdmin } from '@/lib/supabase-admin'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { stripe } from '@/lib/stripe'

async function requireAdmin() {
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    { cookies: { getAll() { return cookieStore.getAll() }, setAll(cookiesToSet) { cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options)) } } }
  )
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data: coach } = await supabaseAdmin.from('coaches').select('is_admin').eq('id', user.id).single()
  return coach?.is_admin ? user : null
}

// Actions ponctuelles du coach sur l'abonnement Stripe d'un sportif donné : appliquer/retirer un
// code promo existant, suspendre/reprendre la facturation, ou mettre fin à l'abonnement (en fin de
// période payée ou immédiatement). N'affecte que cet abonnement.
export async function POST(request, { params }) {
  const user = await requireAdmin()
  if (!user) return NextResponse.json({ error: 'forbidden' }, { status: 403 })

  const { athleteId } = await params
  const { action, promotionCodeId } = await request.json()

  const { data: athlete } = await supabaseAdmin.from('athletes').select('stripe_subscription_id').eq('id', athleteId).single()
  if (!athlete?.stripe_subscription_id) return NextResponse.json({ error: 'Aucun abonnement actif pour ce sportif' }, { status: 400 })

  try {
    if (action === 'apply_promo') {
      if (!promotionCodeId) return NextResponse.json({ error: 'promotionCodeId requis' }, { status: 400 })
      const promo = await stripe.promotionCodes.retrieve(promotionCodeId)
      const couponId = typeof promo.coupon === 'string' ? promo.coupon : promo.coupon?.id
      if (!couponId) return NextResponse.json({ error: 'Code promo invalide' }, { status: 400 })
      await stripe.subscriptions.update(athlete.stripe_subscription_id, { coupon: couponId })
    } else if (action === 'remove_promo') {
      await stripe.subscriptions.update(athlete.stripe_subscription_id, { coupon: '' })
    } else if (action === 'pause') {
      await stripe.subscriptions.update(athlete.stripe_subscription_id, { pause_collection: { behavior: 'mark_uncollectible' } })
    } else if (action === 'resume') {
      await stripe.subscriptions.update(athlete.stripe_subscription_id, { pause_collection: '' })
    } else if (action === 'cancel_at_period_end') {
      // canceled_by marque une résiliation décidée par le coach : le webhook ne lui renvoie pas
      // de notification "X a annulé son abonnement" pour sa propre action.
      await stripe.subscriptions.update(athlete.stripe_subscription_id, { cancel_at_period_end: true, metadata: { canceled_by: 'coach' } })
    } else if (action === 'undo_cancel') {
      await stripe.subscriptions.update(athlete.stripe_subscription_id, { cancel_at_period_end: false, metadata: { canceled_by: '' } })
    } else if (action === 'cancel_now') {
      // Arrêt immédiat, sans remboursement au prorata de la période déjà payée. La base est mise
      // à jour tout de suite (sans attendre le webhook) pour que l'accès soit coupé dès maintenant.
      await stripe.subscriptions.update(athlete.stripe_subscription_id, { metadata: { canceled_by: 'coach' } })
      await stripe.subscriptions.cancel(athlete.stripe_subscription_id)
      await supabaseAdmin.from('athletes').update({
        subscription_status: 'canceled', subscription_tier: null,
      }).eq('id', athleteId)
    } else {
      return NextResponse.json({ error: 'action inconnue' }, { status: 400 })
    }
    return NextResponse.json({ ok: true })
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 400 })
  }
}
