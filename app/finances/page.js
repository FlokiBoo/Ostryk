'use client'

import { useState, useEffect } from 'react'
import { Tag, Money, Warning, CheckCircle, Prohibit, Circle } from '@phosphor-icons/react'
import { supabase } from '@/lib/supabase'
import Link from 'next/link'
import AthletesSidebar from '@/app/components/AthletesSidebar'
import { SUBSCRIPTION_TIERS } from '@/lib/subscriptionTiers'

function today() {
  const n = new Date()
  return [n.getFullYear(), String(n.getMonth() + 1).padStart(2, '0'), String(n.getDate()).padStart(2, '0')].join('-')
}

function initials(name) {
  return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)
}

function formatEur(amount) {
  return amount.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €'
}

const STATUS_LABELS = {
  active: { label: 'Actif', color: '#166534', bg: '#DCFCE7' },
  trialing: { label: 'Essai', color: '#1D4ED8', bg: '#DBEAFE' },
  past_due: { label: 'Paiement en retard', color: '#92400E', bg: '#FEF3C7' },
  unpaid: { label: 'Impayé', color: '#991B1B', bg: '#FEE2E2' },
  incomplete: { label: 'Incomplet', color: '#92400E', bg: '#FEF3C7' },
  incomplete_expired: { label: 'Expiré', color: '#991B1B', bg: '#FEE2E2' },
  canceled: { label: 'Arrêté', color: '#991B1B', bg: '#FEE2E2' },
}

const PAYMENT_LABELS = {
  paid: { color: '#166534', bg: '#DCFCE7' },
  failed: { color: '#991B1B', bg: '#FEE2E2' },
  pending: { color: '#92400E', bg: '#FEF3C7' },
  void: { color: 'var(--text3)', bg: 'var(--bg2)' },
}

function Row({ a, promoCodes, onAction }) {
  const [showPromoPicker, setShowPromoPicker] = useState(false)
  const [showEndPicker, setShowEndPicker] = useState(false)
  const [selectedPromo, setSelectedPromo] = useState('')
  const [busy, setBusy] = useState(false)

  const status = STATUS_LABELS[a.subscriptionStatus]
  const tier = a.tier && SUBSCRIPTION_TIERS[a.tier]
  const pay = a.lastPayment
  const payStyle = pay ? PAYMENT_LABELS[pay.status] : null
  const isActive = a.subscriptionStatus === 'active'

  const run = async (action, extra) => {
    setBusy(true)
    await onAction(a.id, action, extra)
    setBusy(false)
    setShowPromoPicker(false)
    setShowEndPicker(false)
    setSelectedPromo('')
  }

  const endDateLabel = a.periodEnd
    ? new Date(a.periodEnd).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })
    : null

  return (
    <div style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 8, opacity: busy ? 0.6 : 1 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{
          width: 32, height: 32, borderRadius: '50%', flexShrink: 0,
          background: 'var(--green-light)', color: 'var(--green)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 800,
        }}>
          {initials(a.name)}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.name}</div>
          <div style={{ fontSize: 11, color: 'var(--text3)' }}>
            {tier?.label || '—'}
            {pay && ` · ${formatEur(pay.amount / 100)} le ${new Date(pay.date).toLocaleDateString('fr-FR')}`}
            {a.discountCode && <> · <Tag size={10} style={{ verticalAlign: -1 }} /> {a.discountCode}</>}
          </div>
        </div>
        {pay && payStyle && (
          <span style={{ fontSize: 11, fontWeight: 700, color: payStyle.color, background: payStyle.bg, borderRadius: 10, padding: '3px 10px', flexShrink: 0 }}>
            {pay.label}
          </span>
        )}
        {a.paused ? (
          <span style={{ fontSize: 11, fontWeight: 700, color: '#92400E', background: '#FEF3C7', borderRadius: 10, padding: '3px 10px', flexShrink: 0 }}>
            Suspendu
          </span>
        ) : isActive && a.cancelAtPeriodEnd ? (
          <span style={{ fontSize: 11, fontWeight: 700, color: '#92400E', background: '#FEF3C7', borderRadius: 10, padding: '3px 10px', flexShrink: 0 }}>
            {endDateLabel ? `Fin le ${endDateLabel}` : 'Fin programmée'}
          </span>
        ) : status ? (
          <span style={{ fontSize: 11, fontWeight: 700, color: status.color, background: status.bg, borderRadius: 10, padding: '3px 10px', flexShrink: 0 }}>
            {status.label}
          </span>
        ) : (
          <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text3)', background: 'var(--bg2)', borderRadius: 10, padding: '3px 10px', flexShrink: 0 }}>
            Jamais abonné
          </span>
        )}
      </div>

      {isActive && (
        <div style={{ display: 'flex', gap: 12, paddingLeft: 42, flexWrap: 'wrap' }}>
          {a.discountCode ? (
            <button onClick={() => run('remove_promo')} disabled={busy} style={{ background: 'none', border: 'none', color: '#DC2626', fontSize: 11, fontWeight: 700, cursor: 'pointer', padding: 0 }}>
              Retirer le code promo
            </button>
          ) : (
            <button onClick={() => setShowPromoPicker(v => !v)} disabled={busy} style={{ background: 'none', border: 'none', color: 'var(--green)', fontSize: 11, fontWeight: 700, cursor: 'pointer', padding: 0, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              <Tag size={11} /> Appliquer un code promo
            </button>
          )}
          {a.paused ? (
            <button onClick={() => run('resume')} disabled={busy} style={{ background: 'none', border: 'none', color: 'var(--green)', fontSize: 11, fontWeight: 700, cursor: 'pointer', padding: 0 }}>
              ▶ Reprendre la facturation
            </button>
          ) : (
            <button onClick={() => { if (confirm(`Suspendre la facturation de ${a.name} ? Il gardera son accès, mais ne sera plus prélevé jusqu'à la reprise.`)) run('pause') }}
              disabled={busy} style={{ background: 'none', border: 'none', color: '#92400E', fontSize: 11, fontWeight: 700, cursor: 'pointer', padding: 0 }}>
              ⏸ Suspendre
            </button>
          )}
          {a.cancelAtPeriodEnd ? (
            <button onClick={() => run('undo_cancel')} disabled={busy} style={{ background: 'none', border: 'none', color: 'var(--green)', fontSize: 11, fontWeight: 700, cursor: 'pointer', padding: 0 }}>
              ↺ Annuler la fin d&apos;abonnement
            </button>
          ) : (
            <button onClick={() => setShowEndPicker(v => !v)} disabled={busy} style={{ background: 'none', border: 'none', color: '#DC2626', fontSize: 11, fontWeight: 700, cursor: 'pointer', padding: 0 }}>
              ✕ Mettre fin à l&apos;abonnement
            </button>
          )}
        </div>
      )}

      {isActive && showEndPicker && !a.cancelAtPeriodEnd && (
        <div style={{ display: 'flex', gap: 6, paddingLeft: 42, flexWrap: 'wrap' }}>
          <button onClick={() => { if (confirm(`Mettre fin à l'abonnement de ${a.name} ${endDateLabel ? `le ${endDateLabel}` : 'à la fin de sa période en cours'} ? Il garde son accès jusque-là et ne sera plus prélevé ensuite.`)) run('cancel_at_period_end') }}
            disabled={busy} style={{ background: 'var(--bg2)', color: 'var(--text)', border: '1px solid var(--border2)', borderRadius: 'var(--r)', padding: '6px 12px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
            {endDateLabel ? `À la fin de la période (${endDateLabel})` : 'À la fin de la période'}
          </button>
          <button onClick={() => { if (confirm(`Arrêter immédiatement l'abonnement de ${a.name} ? Son accès est coupé tout de suite, sans remboursement de la période déjà payée.`)) run('cancel_now') }}
            disabled={busy} style={{ background: '#DC2626', color: '#fff', border: 'none', borderRadius: 'var(--r)', padding: '6px 12px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
            Immédiatement
          </button>
        </div>
      )}

      {isActive && showPromoPicker && (
        <div style={{ display: 'flex', gap: 6, paddingLeft: 42 }}>
          <select value={selectedPromo} onChange={e => setSelectedPromo(e.target.value)}
            style={{ flex: 1, padding: '6px 8px', border: '1px solid var(--border2)', borderRadius: 'var(--r)', fontSize: 12, outline: 'none', background: 'var(--bg2)', color: 'var(--text)' }}>
            <option value="">Choisir un code…</option>
            {(promoCodes || []).filter(pc => pc.active).map(pc => (
              <option key={pc.id} value={pc.id}>{pc.code} ({discountLabel(pc.coupon)})</option>
            ))}
          </select>
          <button onClick={() => run('apply_promo', { promotionCodeId: selectedPromo })} disabled={busy || !selectedPromo}
            style={{ background: selectedPromo ? 'var(--green)' : 'var(--border2)', color: '#fff', border: 'none', borderRadius: 'var(--r)', padding: '6px 12px', fontSize: 12, fontWeight: 700, cursor: 'pointer', flexShrink: 0 }}>
            Appliquer
          </button>
        </div>
      )}
    </div>
  )
}

const DURATION_LABELS = { once: 'une fois', forever: 'à vie', repeating: 'récurrent' }

function discountLabel(coupon) {
  const value = coupon.percent_off ? `${coupon.percent_off}%` : `${(coupon.amount_off / 100).toFixed(2).replace('.00', '')}€`
  const duration = coupon.duration === 'repeating' ? `${coupon.duration_in_months} mois` : DURATION_LABELS[coupon.duration]
  return `${value} · ${duration}`
}

const emptyPromoForm = { code: '', type: 'percent', value: '', duration: 'once', durationInMonths: '3', maxRedemptions: '', expiresAt: '' }

function PromoCodesSection({ codes, onReload }) {
  const [error, setError] = useState('')
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [deletingId, setDeletingId] = useState(null)
  const [editingId, setEditingId] = useState(null)
  const [form, setForm] = useState(emptyPromoForm)

  const closeForm = () => { setOpen(false); setEditingId(null); setForm(emptyPromoForm) }

  const startEdit = (pc) => {
    setForm({
      code: pc.code,
      type: pc.coupon.percent_off ? 'percent' : 'amount',
      value: pc.coupon.percent_off || (pc.coupon.amount_off / 100),
      duration: pc.coupon.duration,
      durationInMonths: String(pc.coupon.duration_in_months || 3),
      maxRedemptions: pc.max_redemptions || '',
      expiresAt: pc.expires_at ? new Date(pc.expires_at * 1000).toISOString().slice(0, 10) : '',
    })
    setEditingId(pc.id)
    setOpen(true)
  }

  const submit = async () => {
    setSaving(true)
    setError('')
    const res = await fetch(editingId ? `/api/finances/promo-codes/${editingId}` : '/api/finances/promo-codes', {
      method: editingId ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    })
    const json = await res.json().catch(() => ({}))
    setSaving(false)
    if (!res.ok) { setError(json.error || 'Erreur d\'enregistrement'); return }
    closeForm()
    onReload()
  }

  const toggleActive = async (id, active) => {
    await fetch(`/api/finances/promo-codes/${id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ active }),
    })
    onReload()
  }

  const remove = async (pc) => {
    if (!confirm(`Supprimer le code "${pc.code}" ? Les sportifs qui l'ont déjà appliqué gardent leur réduction — seules les futures utilisations seront bloquées.`)) return
    setDeletingId(pc.id)
    const res = await fetch(`/api/finances/promo-codes/${pc.id}`, { method: 'DELETE' })
    setDeletingId(null)
    if (!res.ok) { const json = await res.json().catch(() => ({})); alert('Erreur : ' + (json.error || '')); return }
    onReload()
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.5px', flex: 1, display: 'flex', alignItems: 'center', gap: 5 }}>
          <Tag size={13} /> Codes promo {codes ? `(${codes.length})` : ''}
        </div>
        <button onClick={() => open ? closeForm() : setOpen(true)} style={{ background: 'none', border: 'none', color: 'var(--green)', fontSize: 12, fontWeight: 700, cursor: 'pointer', padding: 0 }}>
          {open ? 'Annuler' : '+ Nouveau code'}
        </button>
      </div>

      {error && (
        <div style={{ fontSize: 13, color: '#DC2626', background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 'var(--r)', padding: '10px 12px', marginBottom: 10 }}>
          {error}
        </div>
      )}

      {open && (
        <div style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 'var(--rl)', padding: 14, marginBottom: 10, display: 'flex', flexDirection: 'column', gap: 10 }}>
          {editingId && (
            <div style={{ fontSize: 11, color: 'var(--text3)' }}>
              Modifier ce code crée un nouveau code à la place de l&apos;ancien — les sportifs qui l&apos;ont déjà appliqué gardent leur réduction actuelle.
            </div>
          )}
          <input
            placeholder="Code (ex: SUMMER20)"
            value={form.code}
            onChange={e => setForm(f => ({ ...f, code: e.target.value.toUpperCase() }))}
            style={{ padding: '9px 10px', border: '1px solid var(--border2)', borderRadius: 'var(--r)', fontSize: 14, fontWeight: 700, outline: 'none', background: 'var(--bg2)', color: 'var(--text)' }}
          />

          <div style={{ display: 'flex', gap: 6 }}>
            <button onClick={() => setForm(f => ({ ...f, type: 'percent' }))} style={{
              flex: 1, background: form.type === 'percent' ? 'var(--green)' : 'var(--bg2)', color: form.type === 'percent' ? '#fff' : 'var(--text2)',
              border: '1px solid var(--border2)', borderRadius: 20, padding: '7px 4px', fontSize: 12, fontWeight: 700, cursor: 'pointer',
            }}>%</button>
            <button onClick={() => setForm(f => ({ ...f, type: 'amount' }))} style={{
              flex: 1, background: form.type === 'amount' ? 'var(--green)' : 'var(--bg2)', color: form.type === 'amount' ? '#fff' : 'var(--text2)',
              border: '1px solid var(--border2)', borderRadius: 20, padding: '7px 4px', fontSize: 12, fontWeight: 700, cursor: 'pointer',
            }}>Montant €</button>
            <input
              type="number" min="0" placeholder={form.type === 'percent' ? 'Ex: 20' : 'Ex: 10'}
              value={form.value} onChange={e => setForm(f => ({ ...f, value: e.target.value }))}
              style={{ flex: 1, minWidth: 0, padding: '7px 9px', border: '1px solid var(--border2)', borderRadius: 'var(--r)', fontSize: 13, outline: 'none', background: 'var(--bg2)', color: 'var(--text)' }}
            />
          </div>

          <div>
            <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 4 }}>Durée d&apos;application</div>
            <div style={{ display: 'flex', gap: 6 }}>
              {[['once', 'Une fois'], ['repeating', 'X mois'], ['forever', 'À vie']].map(([k, l]) => (
                <button key={k} onClick={() => setForm(f => ({ ...f, duration: k }))} style={{
                  flex: 1, background: form.duration === k ? 'var(--green)' : 'var(--bg2)', color: form.duration === k ? '#fff' : 'var(--text2)',
                  border: '1px solid var(--border2)', borderRadius: 20, padding: '7px 4px', fontSize: 12, fontWeight: 700, cursor: 'pointer',
                }}>{l}</button>
              ))}
            </div>
            {form.duration === 'repeating' && (
              <input type="number" min="1" placeholder="Nombre de mois" value={form.durationInMonths}
                onChange={e => setForm(f => ({ ...f, durationInMonths: e.target.value }))}
                style={{ marginTop: 6, width: '100%', boxSizing: 'border-box', padding: '7px 9px', border: '1px solid var(--border2)', borderRadius: 'var(--r)', fontSize: 13, outline: 'none', background: 'var(--bg2)', color: 'var(--text)' }} />
            )}
          </div>

          <div style={{ display: 'flex', gap: 6 }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 4 }}>Utilisations max</div>
              <input type="number" min="1" placeholder="Illimité" value={form.maxRedemptions}
                onChange={e => setForm(f => ({ ...f, maxRedemptions: e.target.value }))}
                style={{ width: '100%', boxSizing: 'border-box', padding: '7px 9px', border: '1px solid var(--border2)', borderRadius: 'var(--r)', fontSize: 13, outline: 'none', background: 'var(--bg2)', color: 'var(--text)' }} />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 4 }}>Expire le</div>
              <input type="date" value={form.expiresAt}
                onChange={e => setForm(f => ({ ...f, expiresAt: e.target.value }))}
                style={{ width: '100%', boxSizing: 'border-box', padding: '7px 9px', border: '1px solid var(--border2)', borderRadius: 'var(--r)', fontSize: 13, outline: 'none', background: 'var(--bg2)', color: 'var(--text)' }} />
            </div>
          </div>

          <button onClick={submit} disabled={saving || !form.code.trim() || !form.value} style={{
            background: form.code.trim() && form.value ? 'var(--green)' : 'var(--border2)', color: '#fff', border: 'none',
            borderRadius: 'var(--r)', padding: 10, fontSize: 14, fontWeight: 700, cursor: 'pointer',
          }}>
            {saving ? '…' : editingId ? 'Enregistrer les modifications' : 'Créer le code'}
          </button>
        </div>
      )}

      {codes === null ? (
        <div style={{ fontSize: 13, color: 'var(--text3)', padding: '10px 0' }}>Chargement…</div>
      ) : codes.length === 0 ? (
        <div style={{ fontSize: 13, color: 'var(--text3)', padding: '10px 0' }}>Aucun code promo pour l&apos;instant.</div>
      ) : (
        <div style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 'var(--rl)', overflow: 'hidden' }}>
          {codes.map((pc, i) => (
            <div key={pc.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', borderTop: i > 0 ? '1px solid var(--border)' : 'none', flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: 140 }}>
                <div style={{ fontWeight: 700, fontSize: 13 }}>{pc.code}</div>
                <div style={{ fontSize: 11, color: 'var(--text3)' }}>
                  {discountLabel(pc.coupon)}
                  {pc.max_redemptions ? ` · ${pc.times_redeemed}/${pc.max_redemptions} utilisations` : pc.times_redeemed > 0 ? ` · ${pc.times_redeemed} utilisation${pc.times_redeemed > 1 ? 's' : ''}` : ''}
                  {pc.expires_at ? ` · expire le ${new Date(pc.expires_at * 1000).toLocaleDateString('fr-FR')}` : ''}
                </div>
              </div>
              <span style={{
                fontSize: 11, fontWeight: 700, borderRadius: 10, padding: '3px 10px', flexShrink: 0,
                color: pc.active ? '#166534' : 'var(--text3)', background: pc.active ? '#DCFCE7' : 'var(--bg2)',
              }}>
                {pc.active ? 'Actif' : 'Désactivé'}
              </span>
              <button onClick={() => toggleActive(pc.id, !pc.active)} style={{ background: 'none', border: 'none', color: 'var(--text3)', fontSize: 12, fontWeight: 700, cursor: 'pointer', flexShrink: 0 }}>
                {pc.active ? 'Désactiver' : 'Réactiver'}
              </button>
              <button onClick={() => startEdit(pc)} style={{ background: 'none', border: 'none', color: 'var(--green)', fontSize: 12, fontWeight: 700, cursor: 'pointer', flexShrink: 0 }}>
                Modifier
              </button>
              <button onClick={() => remove(pc)} disabled={deletingId === pc.id} style={{ background: 'none', border: 'none', color: '#DC2626', fontSize: 12, fontWeight: 700, cursor: 'pointer', flexShrink: 0 }}>
                {deletingId === pc.id ? '…' : 'Supprimer'}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function Group({ title, items, promoCodes, onAction }) {
  if (items.length === 0) return null
  return (
    <div>
      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 5 }}>
        {title} ({items.length})
      </div>
      <div style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 'var(--rl)', overflow: 'hidden' }}>
        {items.map((a, i) => <div key={a.id} style={{ borderTop: i > 0 ? '1px solid var(--border)' : 'none' }}><Row a={a} promoCodes={promoCodes} onAction={onAction} /></div>)}
      </div>
    </div>
  )
}

export default function FinancesPage() {
  const [checking, setChecking] = useState(true)
  const [isAdmin, setIsAdmin] = useState(false)
  const [data, setData] = useState(null)
  const [promoCodes, setPromoCodes] = useState(null)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')

  const loadFinances = async () => {
    const res = await fetch('/api/finances', { cache: 'no-store' })
    const json = await res.json().catch(() => ({}))
    if (!res.ok) { setError(json.error || 'Erreur de chargement'); return }
    setData(json)
  }

  const loadPromoCodes = async () => {
    const res = await fetch('/api/finances/promo-codes', { cache: 'no-store' })
    const json = await res.json().catch(() => ({}))
    if (res.ok) setPromoCodes(json.codes)
  }

  const handleAthleteAction = async (athleteId, action, extra = {}) => {
    const res = await fetch(`/api/finances/athletes/${athleteId}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, ...extra }),
    })
    if (!res.ok) { const json = await res.json().catch(() => ({})); alert('Erreur : ' + (json.error || '')); return }
    loadFinances()
  }

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { setChecking(false); return }
      const { data: me } = await supabase.from('coaches').select('is_admin').eq('id', user.id).single()
      if (!me?.is_admin) { setChecking(false); return }
      setIsAdmin(true)
      setChecking(false)

      await loadFinances()
      await loadPromoCodes()
    }
    load()
  }, [])

  if (checking) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100svh', color: 'var(--text3)' }}>Chargement…</div>
  )
  if (!isAdmin) return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100svh', gap: 12, color: 'var(--text3)' }}>
      <div>Accès réservé.</div>
      <Link href="/" style={{ color: 'var(--green)', fontWeight: 600 }}>← Retour</Link>
    </div>
  )

  const athletes = (data?.athletes || []).filter(a => a.name.toLowerCase().includes(search.trim().toLowerCase()))
  const actifs = athletes.filter(a => a.subscriptionStatus === 'active')
  const arretes = athletes.filter(a => a.subscriptionStatus && a.subscriptionStatus !== 'active')
  const jamais = athletes.filter(a => !a.subscriptionStatus)
  const failedCount = (data?.athletes || []).filter(a => a.lastPayment?.status === 'failed').length

  return (
    <div className="coach-layout" style={{ background: 'var(--bg2)' }}>
      <AthletesSidebar athleteId={null} date={today()} />
      <div className="coach-main" style={{ paddingBottom: 40 }}>

        <div style={{ background: 'var(--bg)', borderBottom: '1px solid var(--border)', padding: '14px 16px', position: 'sticky', top: 0, zIndex: 10 }}>
          <div style={{ fontFamily: 'var(--font-title)', color: 'var(--title)', fontWeight: 700, fontSize: 18, display: 'flex', alignItems: 'center', gap: 8 }}><Money size={17} /> Finances</div>
          <div style={{ fontSize: 12, color: 'var(--text3)' }}>Abonnements, paiements et chiffre d&apos;affaires</div>
        </div>

        <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 20 }}>

          {error && (
            <div style={{ fontSize: 13, color: '#DC2626', background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 'var(--r)', padding: '10px 12px' }}>
              {error}
            </div>
          )}

          {!data && !error && (
            <div style={{ color: 'var(--text3)', fontSize: 13, padding: '20px 0' }}>Chargement des données Stripe…</div>
          )}

          {data && (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10 }}>
                {[
                  { label: 'Ce mois-ci', value: data.revenue.month },
                  { label: 'Ce trimestre', value: data.revenue.quarter },
                  { label: 'Cette année', value: data.revenue.year },
                ].map(kpi => (
                  <div key={kpi.label} style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 'var(--rl)', padding: 14 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 6 }}>
                      {kpi.label}
                    </div>
                    <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--green)' }}>{formatEur(kpi.value)}</div>
                  </div>
                ))}
              </div>

              {failedCount > 0 && (
                <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 'var(--rl)', padding: '10px 14px', fontSize: 13, fontWeight: 700, color: '#991B1B', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Warning size={15} /> {failedCount} paiement{failedCount > 1 ? 's' : ''} échoué{failedCount > 1 ? 's' : ''} à traiter
                </div>
              )}

              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Rechercher un sportif…"
                style={{ padding: '10px 12px', border: '1px solid var(--border2)', borderRadius: 'var(--r)', fontSize: 14, outline: 'none', background: 'var(--bg)', color: 'var(--text)' }}
              />

              <Group title={<><CheckCircle size={13} color="#166534" /> Actifs</>} items={actifs} promoCodes={promoCodes} onAction={handleAthleteAction} />
              <Group title={<><Prohibit size={13} color="#991B1B" /> Arrêtés / en souci</>} items={arretes} promoCodes={promoCodes} onAction={handleAthleteAction} />
              <Group title={<><Circle size={13} /> Jamais abonnés</>} items={jamais} promoCodes={promoCodes} onAction={handleAthleteAction} />

              <PromoCodesSection codes={promoCodes} onReload={loadPromoCodes} />
            </>
          )}
        </div>
      </div>
    </div>
  )
}
