'use client'

import { useState, useEffect, useCallback } from 'react'
import { User, PencilSimple, ClipboardText, ChatCircle, ForkKnife, GearSix, CreditCard } from '@phosphor-icons/react'
import { supabase } from '@/lib/supabase'
import ChatThread from '@/app/components/ChatThread'
import SettingsScreen from './SettingsScreen'
import SubscriptionScreen from './SubscriptionScreen'
import { SUBSCRIPTION_TIERS } from '@/lib/subscriptionTiers'

function calcAge(birthDate) {
  if (!birthDate) return null
  return Math.floor((Date.now() - new Date(birthDate).getTime()) / (365.25 * 86400000))
}

const statLabelStyle = { fontSize: 10, fontWeight: 700, color: 'var(--ostryk-text2)', textTransform: 'uppercase', letterSpacing: '0.3px', marginBottom: 4 }
const editIconStyle = { fontSize: 12, color: 'var(--bordeaux)' }

// Hub simplifié : identité + stats corporelles + raccourcis "MON ESPACE" + Réglages. Les radars
// Force/Mobilité qui vivaient ici ont été déplacés vers la page Performances (PerformancesTab),
// et les champs Sexe / base de comparaison badges vers Réglages (SettingsScreen).
export default function ProfilTab({ athlete, token, setActiveTab, onWeightUpdate, onSexUpdate, onBadgeStandardUpdate, onHeightUpdate, onBirthDateUpdate }) {
  const [editingField, setEditingField] = useState(null) // 'weight' | 'height' | 'birth_date' | null
  const [fieldVal, setFieldVal] = useState('')
  const [saving, setSaving] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  // L'abonnement ne vivait que dans Réglages → "Offres & abonnement". Remonté ici, et placé AVANT
  // "Choisir un programme" : le testeur ne voyait pas le lien entre les deux et se demandait dans
  // quel ordre ça se prend — l'abonnement d'abord, le programme ensuite.
  const [showSubscription, setShowSubscription] = useState(false)
  const [showMessages, setShowMessages] = useState(false)
  const [unread, setUnread] = useState(0)

  const refreshUnread = useCallback(() => {
    if (!athlete) return
    fetch(`/api/messages/${athlete.id}`).then(r => r.json()).then(data => {
      const u = (data.messages || []).filter(m => m.sender_role === 'coach' && !m.read_by_athlete_at).length
      setUnread(u)
    })
  }, [athlete])

  useEffect(() => { refreshUnread() }, [refreshUnread])

  useEffect(() => {
    if (!athlete) return
    const channel = supabase
      .channel(`messages-profil-${athlete.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'messages', filter: `athlete_id=eq.${athlete.id}` }, refreshUnread)
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [athlete, refreshUnread])

  const startEdit = (field, current) => { setEditingField(field); setFieldVal(current ?? '') }

  const saveField = async () => {
    if (!fieldVal || !athlete) return
    setSaving(true)
    const value = editingField === 'birth_date' ? fieldVal : parseFloat(fieldVal)
    const { error } = await supabase.from('athletes').update({ [editingField]: value }).eq('id', athlete.id)
    if (!error) {
      if (editingField === 'weight') onWeightUpdate?.(value)
      if (editingField === 'height') onHeightUpdate?.(value)
      if (editingField === 'birth_date') onBirthDateUpdate?.(value)
      setEditingField(null)
    }
    setSaving(false)
  }

  if (!athlete) return null
  const age = calcAge(athlete.birth_date)
  const isSubscribed = athlete.subscription_status === 'active'

  return (
    <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
        <div style={{
          width: 64, height: 64, borderRadius: '50%', background: 'var(--card-white)', color: 'var(--bordeaux)',
          border: '1px solid var(--ostryk-border)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
        }}><User size={30} weight="light" /></div>
        <div style={{ fontFamily: 'var(--font-title)', color: 'var(--bordeaux)', fontWeight: 600, fontSize: 20 }}>{athlete.name}</div>
      </div>

      <div style={{ background: 'var(--card-white)', border: '1px solid var(--ostryk-border)', borderRadius: 'var(--ostryk-card-radius)', padding: 14 }}>
        <div style={{ display: 'flex', gap: 10, textAlign: 'center' }}>
          {[
            { field: 'height', label: 'Taille', unit: 'cm', value: athlete.height, step: '1', display: athlete.height ? `${athlete.height} cm` : null },
            { field: 'weight', label: 'Poids', unit: 'kg', value: athlete.weight, step: '0.1', display: athlete.weight ? `${athlete.weight} kg` : null },
            { field: 'birth_date', label: editingField === 'birth_date' ? 'Date de naissance' : 'Âge', value: athlete.birth_date, display: age != null ? `${age} ans` : null },
          ].map(f => (
            <div key={f.field} style={{ flex: 1 }}>
              <div style={statLabelStyle}>{f.label}</div>
              {editingField === f.field ? (
                <div style={{ display: 'flex', gap: 6, alignItems: 'center', justifyContent: 'center' }}>
                  <input type={f.field === 'birth_date' ? 'date' : 'number'} step={f.step} min="0" autoFocus value={fieldVal} onChange={e => setFieldVal(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && saveField()}
                    onBlur={saveField}
                    style={{ width: f.field === 'birth_date' ? 130 : 56, boxSizing: 'border-box', padding: '5px 7px', border: '1px solid var(--ostryk-border-input)', borderRadius: 6, fontSize: 13, fontWeight: 700, outline: 'none', background: 'var(--beige)', color: 'var(--text)' }} />
                  <button onClick={saveField} disabled={saving || !fieldVal}
                    style={{ background: 'var(--bordeaux)', color: '#fff', border: 'none', borderRadius: 6, padding: '5px 9px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                    {saving ? '…' : '✓'}
                  </button>
                </div>
              ) : (
                <div onClick={() => startEdit(f.field, f.value)} style={{ fontWeight: 700, fontSize: 15, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                  {f.display || '—'}
                  <span style={{ ...editIconStyle, display: 'flex' }}><PencilSimple size={11} weight="light" /></span>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {!isSubscribed && (
        <button onClick={() => setShowSubscription(true)} style={{
          background: 'var(--bordeaux)', color: '#fff', border: 'none', borderRadius: 'var(--ostryk-card-radius)',
          padding: '16px', cursor: 'pointer', textAlign: 'left', display: 'flex', alignItems: 'center', gap: 12,
        }}>
          <span style={{ display: 'flex', flexShrink: 0 }}><CreditCard size={24} weight="light" /></span>
          <div style={{ flex: 1 }}>
            <div style={{ fontFamily: 'var(--font-title)', fontWeight: 600, fontSize: 17 }}>Passer à l&apos;abonnement</div>
            <div style={{ fontSize: 12, opacity: 0.9, marginTop: 2 }}>Débloque tous les programmes en entier, à partir de {SUBSCRIPTION_TIERS.A.amount.toFixed(2).replace('.', ',')}€/mois</div>
          </div>
          <span style={{ fontSize: 18, flexShrink: 0 }}>›</span>
        </button>
      )}

      <div>
        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--ostryk-text2)', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: 8 }}>Mon espace</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {isSubscribed && (
            <button onClick={() => setShowSubscription(true)} style={{
              background: 'var(--card-white)', color: 'var(--text)', border: '1px solid var(--ostryk-border)', borderRadius: 'var(--ostryk-card-radius)',
              padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', textAlign: 'left',
            }}>
              <span style={{ display: 'flex', color: 'var(--vert-foret)' }}><CreditCard size={20} weight="light" /></span>
              <span style={{ flex: 1, fontWeight: 700, fontSize: 14 }}>Mon abonnement</span>
              <span style={{ background: 'var(--beige)', color: 'var(--vert-foret)', borderRadius: 'var(--ostryk-pill-radius)', padding: '3px 10px', fontSize: 11, fontWeight: 700, flexShrink: 0 }}>
                {SUBSCRIPTION_TIERS[athlete.subscription_tier]?.label || 'Actif'}
              </span>
              <span style={{ color: 'var(--ostryk-text3)', fontSize: 18 }}>›</span>
            </button>
          )}

          <button onClick={() => setActiveTab?.('templates')} style={{
            background: 'var(--card-white)', color: 'var(--text)', border: '1px solid var(--ostryk-border)', borderRadius: 'var(--ostryk-card-radius)',
            padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', textAlign: 'left',
          }}>
            <span style={{ display: 'flex', color: 'var(--vert-foret)' }}><ClipboardText size={20} weight="light" /></span>
            <span style={{ flex: 1, fontWeight: 700, fontSize: 14 }}>Choisir un programme</span>
            <span style={{ color: 'var(--ostryk-text3)', fontSize: 18 }}>›</span>
          </button>

          <button onClick={() => setShowMessages(true)} style={{
            background: 'var(--card-white)', color: 'var(--text)', border: '1px solid var(--ostryk-border)', borderRadius: 'var(--ostryk-card-radius)',
            padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', textAlign: 'left',
          }}>
            <span style={{ display: 'flex', color: 'var(--vert-foret)' }}><ChatCircle size={20} weight="light" /></span>
            <span style={{ flex: 1, fontWeight: 700, fontSize: 14 }}>Messagerie</span>
            {unread > 0 && (
              <span style={{
                background: '#DC2626', color: '#fff', borderRadius: 10, minWidth: 18, height: 18, fontSize: 11, fontWeight: 700,
                display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 5px',
              }}>{unread}</span>
            )}
            <span style={{ color: 'var(--ostryk-text3)', fontSize: 18 }}>›</span>
          </button>

          <div style={{
            background: 'var(--card-white)', color: 'var(--ostryk-text3)', border: '1px solid var(--ostryk-border)', borderRadius: 'var(--ostryk-card-radius)',
            padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 10,
          }}>
            <span style={{ display: 'flex', color: 'var(--vert-foret)' }}><ForkKnife size={20} weight="light" /></span>
            <span style={{ flex: 1, fontWeight: 700, fontSize: 14 }}>Générateur de plan alimentaire</span>
            <span style={{ background: 'var(--beige)', color: 'var(--ostryk-text3)', borderRadius: 'var(--ostryk-pill-radius)', padding: '3px 10px', fontSize: 11, fontWeight: 700, flexShrink: 0 }}>À venir</span>
          </div>
        </div>
      </div>

      <button onClick={() => setShowSettings(true)} style={{
        background: 'var(--card-white)', color: 'var(--text)', border: '1px solid var(--ostryk-border)', borderRadius: 'var(--ostryk-card-radius)',
        padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', textAlign: 'left',
      }}>
        <span style={{ display: 'flex', color: 'var(--vert-foret)' }}><GearSix size={20} weight="light" /></span>
        <span style={{ flex: 1, fontWeight: 700, fontSize: 14 }}>Réglages</span>
        <span style={{ color: 'var(--ostryk-text3)', fontSize: 18 }}>›</span>
      </button>

      {showSubscription && (
        <SubscriptionScreen athlete={athlete} token={token} onClose={() => setShowSubscription(false)} />
      )}

      {showSettings && (
        <SettingsScreen
          athlete={athlete} token={token} onClose={() => setShowSettings(false)}
          onSexUpdate={onSexUpdate} onBadgeStandardUpdate={onBadgeStandardUpdate}
        />
      )}

      {showMessages && (
        <div style={{ position: 'fixed', inset: 0, background: 'var(--bg2)', zIndex: 500, display: 'flex', flexDirection: 'column' }}>
          <div style={{ background: 'var(--bg)', borderBottom: '1px solid var(--border)', padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
            <button onClick={() => setShowMessages(false)} style={{ background: 'none', border: 'none', fontSize: 22, color: 'var(--text2)', cursor: 'pointer', padding: '2px 4px', lineHeight: 1 }}>←</button>
            <div style={{ flex: 1, fontFamily: 'var(--font-title)', color: 'var(--title)', fontWeight: 700, fontSize: 18, display: 'flex', alignItems: 'center', gap: 8 }}><ChatCircle size={17} /> Messagerie</div>
          </div>
          <ChatThread athleteId={athlete.id} myRole="athlete" onRead={() => setUnread(0)} />
        </div>
      )}
    </div>
  )
}
