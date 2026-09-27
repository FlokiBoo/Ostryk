import { supabaseAdmin } from '@/lib/supabase-admin'
import { NextResponse } from 'next/server'
import { stripe } from '@/lib/stripe'
import { pushPaymentToNotion } from '@/lib/notion'
import { SUBSCRIPTION_TIERS } from '@/lib/subscriptionTiers'
import { ONE_TIME_OFFERS } from '@/lib/offers'
import { sendEmail } from '@/lib/email'

export const dynamic = 'force-dynamic'

// Depuis l'API Stripe 2025-03-31, current_period_end n'est plus sur l'abonnement mais sur ses
// items : un webhook envoyé dans une version récente arrive sans le champ au niveau racine.
function periodEnd(subscription) {
  return subscription.current_period_end ?? subscription.items?.data?.[0]?.current_period_end ?? null
}

async function syncFromSubscription(subscription) {
  const athleteId = subscription.metadata?.athlete_id
  const tier = subscription.metadata?.tier || null
  if (!athleteId) return

  const end = periodEnd(subscription)
  await supabaseAdmin.from('athletes').update({
    stripe_subscription_id: subscription.id,
    subscription_tier: tier,
    subscription_status: subscription.status,
    subscription_current_period_end: end ? new Date(end * 1000).toISOString() : null,
    subscription_cancel_at_period_end: !!subscription.cancel_at_period_end,
  }).eq('id', athleteId)
}

// Achat d'une offre ponctuelle (page publique /offres) : aucun compte athlète n'existe encore à
// ce stade, donc on se contente d'enregistrer la vente et de prévenir le coach par mail pour
// qu'il lance l'onboarding manuel (questionnaire, call de cadrage…).
async function recordOfferPurchase(session) {
  const offer = ONE_TIME_OFFERS[session.metadata.offer_key]
  const customerName = session.metadata.customer_name || session.customer_details?.name || ''
  const customerEmail = session.customer_details?.email || session.customer_email || ''

  await supabaseAdmin.from('offer_purchases').insert({
    offer_key: session.metadata.offer_key,
    customer_name: customerName,
    customer_email: customerEmail,
    amount_cents: session.amount_total,
    stripe_session_id: session.id,
    stripe_payment_intent_id: session.payment_intent,
  })

  if (session.metadata.request_id) {
    await supabaseAdmin.from('offer_requests').update({ status: 'paid' }).eq('id', session.metadata.request_id)
  }

  // Offre "3x sans frais" : l'abonnement Stripe créé pour étaler le paiement doit s'auto-annuler
  // après la 3e mensualité (Checkout n'accepte pas cancel_at à la création, cf. decide/route.js).
  if (session.mode === 'subscription' && session.subscription) {
    const cancelDate = new Date()
    cancelDate.setMonth(cancelDate.getMonth() + 3)
    await stripe.subscriptions.update(session.subscription, { cancel_at: Math.floor(cancelDate.getTime() / 1000) })
  }

  const { data: coach } = await supabaseAdmin.from('coaches').select('email').eq('is_admin', true).limit(1).maybeSingle()
  if (coach?.email) {
    await sendEmail({
      to: coach.email,
      subject: `Nouvelle vente : ${offer?.label || session.metadata.offer_key}`,
      html: `<p><strong>${customerName}</strong> (${customerEmail}) vient d'acheter « ${offer?.label || session.metadata.offer_key} » — ${(session.amount_total / 100).toFixed(0)}€.</p>`,
    })
  }
}

// Notifie le coach des évènements marquants du cycle de vie d'un abonnement (souscription,
// annulation programmée, fin réelle) directement dans la cloche de notifications de l'app.
async function notifySubscriptionEvent(subscription, kind) {
  const athleteId = subscription.metadata?.athlete_id
  if (!athleteId) return
  // Résiliation faite par le coach depuis Finances : inutile de le notifier de sa propre action.
  if (kind !== 'started' && subscription.metadata?.canceled_by === 'coach') return
  const { data: athlete } = await supabaseAdmin.from('athletes').select('name, coach_id').eq('id', athleteId).maybeSingle()
  if (!athlete?.coach_id) return

  const tierLabel = SUBSCRIPTION_TIERS[subscription.metadata?.tier]?.label || null
  const end = periodEnd(subscription)
  const periodEndLabel = end
    ? new Date(end * 1000).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })
    : null

  const messages = {
    started: { title: `${athlete.name} vient de s'abonner`, body: tierLabel },
    cancel_scheduled: { title: `${athlete.name} a annulé son abonnement`, body: periodEndLabel ? `Actif jusqu'au ${periodEndLabel}` : null },
    ended: { title: `L'abonnement de ${athlete.name} s'est terminé`, body: tierLabel },
  }
  const msg = messages[kind]
  if (!msg) return
  await supabaseAdmin.from('notifications').insert({ coach_id: athlete.coach_id, type: `subscription_${kind}`, title: msg.title, body: msg.body })
}

async function notifyPaymentFailed(invoice) {
  if (!invoice.customer) return
  const { data: athlete } = await supabaseAdmin.from('athletes').select('name, coach_id').eq('stripe_customer_id', invoice.customer).maybeSingle()
  if (!athlete?.coach_id) return
  await supabaseAdmin.from('notifications').insert({
    coach_id: athlete.coach_id, type: 'payment_failed',
    title: `Paiement échoué pour ${athlete.name}`,
    body: null,
  })
}

async function syncInvoiceToNotion(invoice, status) {
  if (!invoice.customer) return
  const { data: athlete } = await supabaseAdmin.from('athletes')
    .select('name, subscription_tier').eq('stripe_customer_id', invoice.customer).maybeSingle()
  if (!athlete) return

  await pushPaymentToNotion({
    athleteName: athlete.name,
    amount: (invoice.amount_paid || invoice.amount_due || 0) / 100,
    date: new Date(invoice.created * 1000).toISOString().slice(0, 10),
    status,
    tier: SUBSCRIPTION_TIERS[athlete.subscription_tier]?.label,
    invoiceId: invoice.id,
  })
}

export async function POST(request) {
  const body = await request.text()
  const signature = request.headers.get('stripe-signature')

  let event
  try {
    event = stripe.webhooks.constructEvent(body, signature, process.env.STRIPE_WEBHOOK_SECRET)
  } catch (err) {
    return NextResponse.json({ error: `Signature invalide : ${err.message}` }, { status: 400 })
  }

  // Une fois la signature vérifiée, on accuse toujours réception (2xx) même si le traitement
  // interne échoue (Notion indisponible, etc.) — sinon Stripe retente puis désactive l'endpoint
  // après des échecs répétés, alors que l'événement a bien été reçu et authentifié.
  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object
        // Une offre ponctuelle (paiement unique OU abonnement 3x) se reconnaît à son metadata
        // offer_key, à vérifier avant le cas abonnement générique — sinon un 3x atterrirait dans
        // syncFromSubscription qui ne fait rien en l'absence d'athlete_id (aucune vente enregistrée).
        if (session.metadata?.offer_key) {
          await recordOfferPurchase(session)
        } else if (session.mode === 'subscription' && session.subscription) {
          const subscription = await stripe.subscriptions.retrieve(session.subscription)
          await syncFromSubscription(subscription)
        }
        break
      }
      case 'customer.subscription.created': {
        const subscription = event.data.object
        await syncFromSubscription(subscription)
        await notifySubscriptionEvent(subscription, 'started')
        break
      }
      case 'customer.subscription.updated': {
        const subscription = event.data.object
        await syncFromSubscription(subscription)
        // Ne notifier qu'au moment où l'annulation est programmée (transition false -> true),
        // pas à chaque `updated` ultérieur (renouvellement, changement de moyen de paiement…).
        if (subscription.cancel_at_period_end && event.data.previous_attributes?.cancel_at_period_end === false) {
          await notifySubscriptionEvent(subscription, 'cancel_scheduled')
        }
        break
      }
      case 'customer.subscription.deleted': {
        const subscription = event.data.object
        const athleteId = subscription.metadata?.athlete_id
        // Ne résilier que si c'est bien l'abonnement en cours de l'athlète : un événement
        // renvoyé en retard (ou livré hors ordre) pour un ancien abonnement ne doit pas
        // écraser un réabonnement souscrit entre-temps.
        if (athleteId) {
          await supabaseAdmin.from('athletes').update({
            subscription_status: 'canceled', subscription_tier: null, subscription_cancel_at_period_end: false,
          }).eq('id', athleteId)
            .or(`stripe_subscription_id.is.null,stripe_subscription_id.eq.${subscription.id}`)
        }
        await notifySubscriptionEvent(subscription, 'ended')
        break
      }
      case 'invoice.paid': {
        await syncInvoiceToNotion(event.data.object, 'Payé')
        break
      }
      case 'invoice.payment_failed': {
        await syncInvoiceToNotion(event.data.object, 'Échoué')
        await notifyPaymentFailed(event.data.object)
        break
      }
    }
  } catch (err) {
    console.error(`Erreur de traitement du webhook Stripe (${event.type}) :`, err)
  }

  return NextResponse.json({ received: true })
}
