'use client'

import { useState } from 'react'
import { Check, Sparkle } from '@phosphor-icons/react'
import { SUBSCRIPTION_TIERS, SUBSCRIPTION_PITCH } from '@/lib/subscriptionTiers'
import { ONE_TIME_OFFERS } from '@/lib/offers'

// Écran d'abonnement du sportif. Vivait auparavant en dur dans SettingsScreen, derrière
// Profil → Réglages → "Offres & abonnement" : deux taps dans l'écran où l'on va le moins, et deux
// lignes de description pour toute l'argumentation (retour testeur — on ne comprenait ni ce que
// l'abonnement apporte, ni son rapport avec "Choisir un programme"). Extrait ici pour pouvoir
// l'ouvrir aussi depuis le Profil et depuis la bannière de la page d'accueil, et repris dans la
// charte sportif (--card-white / --bordeaux / --vert-foret) plutôt que celle du coach.
// Le texte de vente lui-même vit dans lib/subscriptionTiers.js.
export default function SubscriptionScreen({ athlete, token, onClose }) {
  const [subscribing, setSubscribing] = useState(null)
  const [changingPlan, setChangingPlan] = useState(null)
  const [portalLoading, setPortalLoading] = useState(false)
  const [offerPlan, setOfferPlan] = useState({})
  const [offerSending, setOfferSending] = useState(null)
  const [offerSent, setOfferSent] = useState({})

  const isActive = athlete.subscription_status === 'active'

  const subscribe = async (tier) => {
    setSubscribing(tier)
    const res = await fetch(`/api/athlete-view/${token}/checkout`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tier }),
    })
    const json = await res.json().catch(() => ({}))
    setSubscribing(null)
    if (json.error) { alert('Erreur : ' + json.error); return }
    window.location.assign(json.url)
  }

  const changePlan = async (tier) => {
    setChangingPlan(tier)
    const res = await fetch(`/api/athlete-view/${token}/change-plan`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tier }),
    })
    const json = await res.json().catch(() => ({}))
    setChangingPlan(null)
    if (json.error) { alert('Erreur : ' + json.error); return }
    window.location.reload()
  }

  const openPortal = async () => {
    setPortalLoading(true)
    const res = await fetch(`/api/athlete-view/${token}/portal`, { method: 'POST' })
    const json = await res.json().catch(() => ({}))
    setPortalLoading(false)
    if (json.error) { alert('Erreur : ' + json.error); return }
    window.location.assign(json.url)
  }

  const requestOffer = async (offerKey) => {
    if (!athlete.email) { alert('Ajoute un email à ton profil pour envoyer une demande.'); return }
    setOfferSending(offerKey)
    const res = await fetch('/api/offers/request', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ offerKey, name: athlete.name, email: athlete.email, paymentPlan: offerPlan[offerKey] || 'full' }),
    })
    const json = await res.json().catch(() => ({}))
    setOfferSending(null)
    if (!res.ok) { alert('Erreur : ' + (json.error || '')); return }
    setOfferSent(prev => ({ ...prev, [offerKey]: true }))
  }

  const price = (amount) => amount.toFixed(2).replace('.', ',')

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'var(--bg2)', zIndex: 550, display: 'flex', flexDirection: 'column' }}>
      <div style={{ background: 'var(--bg)', borderBottom: '1px solid var(--border)', padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
        <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 22, color: 'var(--text2)', cursor: 'pointer', padding: '2px 4px', lineHeight: 1 }}>←</button>
        <div style={{ flex: 1, fontFamily: 'var(--font-title)', color: 'var(--title)', fontWeight: 700, fontSize: 18 }}>
          {isActive ? 'Mon abonnement' : 'Passer à l’abonnement'}
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', maxWidth: 460, width: '100%', margin: '0 auto', boxSizing: 'border-box', padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>

        {isActive ? (
          <div style={{ background: 'var(--green-light)', border: '1px solid #B8EAD8', borderRadius: 'var(--ostryk-card-radius)', padding: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#0D6B4F' }}>
              ✓ Abonnement actif — {SUBSCRIPTION_TIERS[athlete.subscription_tier]?.label || athlete.subscription_tier}
            </div>
            {athlete.subscription_current_period_end && (
              <div style={{ fontSize: 12, color: '#0D6B4F' }}>
                Renouvellement automatique le {new Date(athlete.subscription_current_period_end).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}
              </div>
            )}
            <button onClick={openPortal} disabled={portalLoading}
              style={{ background: 'var(--bg)', border: '1px solid var(--border2)', borderRadius: 'var(--ostryk-pill-radius)', padding: '10px', fontSize: 13, fontWeight: 700, color: 'var(--text)', cursor: 'pointer' }}>
              {portalLoading ? '…' : 'Gérer mon abonnement'}
            </button>
          </div>
        ) : (
          <>
            <div style={{ background: 'var(--bordeaux)', borderRadius: 'var(--ostryk-card-radius)', padding: '18px 16px', color: '#fff' }}>
              <div style={{ fontFamily: 'var(--font-title)', fontWeight: 600, fontSize: 21, marginBottom: 6 }}>
                Va au bout de tes programmes
              </div>
              <div style={{ fontSize: 13, opacity: 0.9, lineHeight: 1.5 }}>
                Ton compte est en accès gratuit. L’abonnement débloque l’intégralité du catalogue et garde ta progression au même endroit.
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {SUBSCRIPTION_PITCH.map(p => (
                <div key={p.title} style={{ background: 'var(--card-white)', border: '1px solid var(--ostryk-border)', borderRadius: 'var(--ostryk-card-radius)', padding: '12px 14px', display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                  <span style={{ fontSize: 20, lineHeight: 1.2, flexShrink: 0 }}>{p.emoji}</span>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--bordeaux)', marginBottom: 2 }}>{p.title}</div>
                    <div style={{ fontSize: 12.5, color: 'var(--ostryk-text2)', lineHeight: 1.45 }}>{p.text}</div>
                  </div>
                </div>
              ))}
            </div>

            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--ostryk-text2)', textTransform: 'uppercase', letterSpacing: '0.4px', marginTop: 4 }}>
              Choisis ta formule
            </div>
          </>
        )}

        {Object.values(SUBSCRIPTION_TIERS).map(t => {
          const isCurrent = isActive && athlete.subscription_tier === t.key
          const featured = !isActive && t.highlight
          return (
            <div key={t.key} style={{
              background: 'var(--card-white)',
              border: `${isCurrent || featured ? '2px' : '1px'} solid ${isCurrent ? 'var(--vert-foret)' : featured ? 'var(--bordeaux)' : 'var(--ostryk-border)'}`,
              borderRadius: 'var(--ostryk-card-radius)', padding: 16, display: 'flex', flexDirection: 'column', gap: 10, position: 'relative',
            }}>
              {featured && (
                <span style={{
                  position: 'absolute', top: -10, right: 14, background: 'var(--bordeaux)', color: '#fff',
                  borderRadius: 'var(--ostryk-pill-radius)', padding: '3px 10px', fontSize: 10, fontWeight: 800,
                  textTransform: 'uppercase', letterSpacing: '0.4px', display: 'inline-flex', alignItems: 'center', gap: 4,
                }}>
                  <Sparkle size={10} weight="fill" /> {t.highlightLabel}
                </span>
              )}
              {isCurrent && (
                <span style={{ fontSize: 10, fontWeight: 800, color: 'var(--vert-foret)', textTransform: 'uppercase', letterSpacing: '0.4px' }}>
                  Ta formule actuelle
                </span>
              )}

              <div>
                <div style={{ fontFamily: 'var(--font-title)', fontWeight: 600, fontSize: 19, color: 'var(--bordeaux)' }}>{t.label}</div>
                {t.tagline && (
                  <div style={{ fontSize: 12.5, color: 'var(--ostryk-text2)', marginTop: 3, lineHeight: 1.45 }}>{t.tagline}</div>
                )}
              </div>

              <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
                <span style={{ fontFamily: 'var(--font-title)', fontWeight: 600, fontSize: 28, color: 'var(--bordeaux)' }}>{price(t.amount)}€</span>
                <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--ostryk-text3)' }}>/mois</span>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                {(t.benefits || []).map(b => (
                  <div key={b} style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                    <span style={{ display: 'flex', flexShrink: 0, marginTop: 1 }}><Check size={14} weight="bold" color="var(--vert-foret)" /></span>
                    <span style={{ fontSize: 13, color: 'var(--text)', lineHeight: 1.4 }}>{b}</span>
                  </div>
                ))}
              </div>

              {!isCurrent && !isActive && (
                <button onClick={() => subscribe(t.key)} disabled={subscribing === t.key} style={{
                  background: featured ? 'var(--bordeaux)' : 'transparent',
                  color: featured ? '#fff' : 'var(--vert-foret)',
                  border: featured ? 'none' : '1.5px solid var(--vert-foret)',
                  borderRadius: 'var(--ostryk-pill-radius)', padding: '13px', fontSize: 14, fontWeight: 700, cursor: 'pointer', marginTop: 2,
                }}>
                  {subscribing === t.key ? '…' : 'Choisir cette formule'}
                </button>
              )}
              {!isCurrent && isActive && (
                <button onClick={() => changePlan(t.key)} disabled={changingPlan === t.key} style={{
                  background: 'transparent', color: 'var(--vert-foret)', border: '1.5px solid var(--vert-foret)',
                  borderRadius: 'var(--ostryk-pill-radius)', padding: '12px', fontSize: 13, fontWeight: 700, cursor: 'pointer', marginTop: 2,
                }}>
                  {changingPlan === t.key ? '…' : 'Passer à cette formule'}
                </button>
              )}
            </div>
          )
        })}

        {!isActive && (
          <div style={{ fontSize: 11.5, color: 'var(--ostryk-text3)', textAlign: 'center', lineHeight: 1.5, padding: '0 8px' }}>
            Sans engagement — tu peux résilier à tout moment depuis cet écran. Paiement sécurisé par Stripe.
          </div>
        )}

        <div style={{ borderTop: '1px solid var(--ostryk-border)', margin: '8px 0 2px' }} />

        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--ostryk-text2)', textTransform: 'uppercase', letterSpacing: '0.4px' }}>
          Accompagnement sur-mesure (paiement unique)
        </div>
        <div style={{ fontSize: 12.5, color: 'var(--ostryk-text2)', lineHeight: 1.45, marginTop: -4 }}>
          Une autre logique que l’abonnement : ton coach construit et suit ton plan personnellement. Tu envoies une demande, il te recontacte.
        </div>

        {Object.values(ONE_TIME_OFFERS).map(o => (
          <div key={o.key} style={{ background: 'var(--card-white)', border: '1px solid var(--ostryk-border)', borderRadius: 'var(--ostryk-card-radius)', padding: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
              <div style={{ fontWeight: 700, fontSize: 15, flex: 1, color: 'var(--bordeaux)' }}>{o.label}</div>
              <div style={{ fontWeight: 800, fontSize: 16, color: 'var(--bordeaux)' }}>{o.amount}€</div>
            </div>
            <div style={{ fontSize: 12, color: 'var(--ostryk-text3)' }}>{o.subtitle}</div>

            {offerSent[o.key] ? (
              <div style={{ background: 'var(--beige)', borderRadius: 'var(--ostryk-pill-radius)', padding: '9px', fontSize: 12, color: 'var(--ostryk-text2)', textAlign: 'center' }}>
                ✓ Demande envoyée — ton coach te recontacte sous 24-48h.
              </div>
            ) : (
              <>
                <div style={{ display: 'flex', gap: 8 }}>
                  {[{ v: 'full', l: 'En 1 fois' }, { v: '3x', l: '3x sans frais' }].map(opt => {
                    const checked = (offerPlan[o.key] || 'full') === opt.v
                    return (
                      <label key={opt.v} style={{
                        flex: 1, display: 'flex', alignItems: 'center', gap: 6, padding: '8px 10px', fontSize: 12, cursor: 'pointer',
                        border: `1.5px solid ${checked ? 'var(--vert-foret)' : 'var(--ostryk-chip-border)'}`, borderRadius: 'var(--ostryk-pill-radius)',
                        background: checked ? 'var(--beige)' : 'transparent',
                      }}>
                        <input type="radio" name={`plan-${o.key}`} checked={checked}
                          onChange={() => setOfferPlan(p => ({ ...p, [o.key]: opt.v }))} style={{ accentColor: 'var(--vert-foret)' }} />
                        {opt.l}
                      </label>
                    )
                  })}
                </div>
                <button onClick={() => requestOffer(o.key)} disabled={offerSending === o.key} style={{
                  background: 'transparent', color: 'var(--vert-foret)', border: '1.5px solid var(--vert-foret)',
                  borderRadius: 'var(--ostryk-pill-radius)', padding: '11px', fontSize: 13, fontWeight: 700, cursor: 'pointer',
                }}>
                  {offerSending === o.key ? '…' : 'Envoyer ma demande'}
                </button>
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
