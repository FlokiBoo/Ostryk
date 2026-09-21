'use client'

import { useState } from 'react'
import { CreditCard, Circle, Lock, Question, Envelope, Bug, FileText, DownloadSimple } from '@phosphor-icons/react'
import { supabase } from '@/lib/supabase'
import PasswordSettingsModal from '@/app/components/PasswordSettingsModal'
import SubscriptionScreen from './SubscriptionScreen'
import { SUBSCRIPTION_TIERS } from '@/lib/subscriptionTiers'
import { clearLastPath } from '@/lib/lastPath'

const rowStyle = {
  background: 'var(--bg)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: 'var(--rl)',
  padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', textAlign: 'left', width: '100%',
}

// Champ d'identité, distinct de la base de comparaison utilisée pour les badges (cf. BADGE_STANDARD_OPTIONS) —
// quelqu'un qui ne se reconnaît pas dans Homme/Femme choisit quand même explicitement sa base de badges.
const SEX_OPTIONS = [
  { v: 'H', l: 'Homme' },
  { v: 'F', l: 'Femme' },
  { v: 'NB', l: 'Non-binaire' },
  { v: 'autre', l: 'Autre' },
  { v: 'ND', l: 'Préfère ne pas dire' },
]

const BADGE_STANDARD_OPTIONS = [
  { v: '', l: 'Aucune — pas de badge' },
  { v: 'H', l: 'Standards Homme' },
  { v: 'F', l: 'Standards Femme' },
]

const selectFieldStyle = {
  width: '100%', boxSizing: 'border-box', padding: '7px 8px', border: '1px solid var(--border2)',
  borderRadius: 6, fontSize: 13, fontWeight: 700, outline: 'none', background: 'var(--bg2)', color: 'var(--text)',
}

export default function SettingsScreen({ athlete, token, onClose, onSexUpdate, onBadgeStandardUpdate }) {
  const [showPassword, setShowPassword] = useState(false)
  const [showSubscription, setShowSubscription] = useState(false)
  const [showHelp, setShowHelp] = useState(false)
  const [stravaBusy, setStravaBusy] = useState(false)
  const [showStravaImport, setShowStravaImport] = useState(false)
  const [importStartDate, setImportStartDate] = useState('')
  const [importing, setImporting] = useState(false)
  const [importResult, setImportResult] = useState(null)

  const disconnectStrava = async () => {
    if (!window.confirm('Déconnecter Strava ? Tes prochaines courses ne seront plus enregistrées automatiquement.')) return
    setStravaBusy(true)
    const res = await fetch('/api/strava/disconnect', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token }),
    })
    if (!res.ok) { alert('Erreur lors de la déconnexion.'); setStravaBusy(false); return }
    window.location.reload()
  }

  const runStravaImport = async () => {
    if (!importStartDate) return
    setImporting(true)
    setImportResult(null)
    const res = await fetch(`/api/athlete-view/${token}/strava-import`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ startDate: importStartDate }),
    })
    const json = await res.json().catch(() => ({}))
    setImporting(false)
    if (!res.ok) { alert('Erreur : ' + (json.error || '')); return }
    setImportResult(json)
  }

  const saveSex = async (val) => {
    await supabase.from('athletes').update({ sex: val }).eq('id', athlete.id)
    onSexUpdate?.(val)
  }

  const saveBadgeStandard = async (val) => {
    const value = val || null
    const { error } = await supabase.from('athletes').update({ badge_standard: value }).eq('id', athlete.id)
    if (error) { alert("Cette version n'est pas encore déployée, réessaie dans quelques minutes."); return }
    onBadgeStandardUpdate?.(value)
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'var(--bg2)', zIndex: 500, display: 'flex', flexDirection: 'column' }}>
      <div style={{ background: 'var(--bg)', borderBottom: '1px solid var(--border)', padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
        <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 22, color: 'var(--text2)', cursor: 'pointer', padding: '2px 4px', lineHeight: 1 }}>←</button>
        <div style={{ flex: 1, fontFamily: 'var(--font-title)', color: 'var(--title)', fontWeight: 700, fontSize: 18 }}>Réglages</div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', maxWidth: 460, width: '100%', margin: '0 auto', boxSizing: 'border-box', padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.4px' }}>Profil</div>

        <div style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 'var(--rl)', padding: 14, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.3px', marginBottom: 4 }}>Sexe</div>
            <select value={athlete.sex || ''} onChange={e => saveSex(e.target.value)} style={selectFieldStyle}>
              <option value="" disabled>Choisir…</option>
              {SEX_OPTIONS.map(o => <option key={o.v} value={o.v}>{o.l}</option>)}
            </select>
          </div>

          <div>
            <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.3px', marginBottom: 4 }}>Base de comparaison pour les badges</div>
            <select value={athlete.badge_standard || ''} onChange={e => saveBadgeStandard(e.target.value)} style={selectFieldStyle}>
              {BADGE_STANDARD_OPTIONS.map(o => <option key={o.v} value={o.v}>{o.l}</option>)}
            </select>
            <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 4, lineHeight: 1.4 }}>
              Indépendant du sexe déclaré — choisis &quot;Aucune&quot; si tu ne veux pas de comparaison H/F sur tes badges de force et cardio.
            </div>
          </div>
        </div>

        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.4px', marginTop: 8 }}>Compte</div>

        <button onClick={() => setShowSubscription(true)} style={rowStyle}>
          <span style={{ display: 'flex' }}><CreditCard size={20} /></span>
          <span style={{ flex: 1, fontWeight: 700, fontSize: 14 }}>
            Offres &amp; abonnement
            {athlete.subscription_status === 'active' && SUBSCRIPTION_TIERS[athlete.subscription_tier] && (
              <span style={{ marginLeft: 8, fontSize: 11, fontWeight: 700, background: 'var(--green-light)', color: 'var(--green)', borderRadius: 10, padding: '2px 8px' }}>
                {SUBSCRIPTION_TIERS[athlete.subscription_tier].label}
              </span>
            )}
          </span>
          <span style={{ color: 'var(--text3)', fontSize: 18 }}>›</span>
        </button>

        {athlete.strava_athlete_id ? (
          <>
            <button onClick={disconnectStrava} disabled={stravaBusy} style={rowStyle}>
              <span style={{ display: 'flex', color: '#FC4C02' }}><Circle size={20} weight="fill" /></span>
              <span style={{ flex: 1, fontWeight: 700, fontSize: 14 }}>
                Strava
                <span style={{ marginLeft: 8, fontSize: 11, fontWeight: 700, background: 'var(--green-light)', color: 'var(--green)', borderRadius: 10, padding: '2px 8px' }}>Connecté</span>
              </span>
              <span style={{ color: 'var(--text3)', fontSize: 12 }}>{stravaBusy ? '…' : 'Déconnecter'}</span>
            </button>
            <button onClick={() => { setImportResult(null); setShowStravaImport(true) }} style={rowStyle}>
              <span style={{ display: 'flex' }}><DownloadSimple size={20} /></span>
              <span style={{ flex: 1, fontWeight: 700, fontSize: 14 }}>Importer mes activités Strava</span>
              <span style={{ color: 'var(--text3)', fontSize: 18 }}>›</span>
            </button>
          </>
        ) : (
          <a href={`/api/strava/connect?token=${token}`} style={{ ...rowStyle, textDecoration: 'none' }}>
            <span style={{ display: 'flex', color: '#FC4C02' }}><Circle size={20} weight="fill" /></span>
            <span style={{ flex: 1, fontWeight: 700, fontSize: 14 }}>Connecter Strava</span>
            <span style={{ color: 'var(--text3)', fontSize: 18 }}>›</span>
          </a>
        )}

        <button onClick={() => setShowPassword(true)} style={rowStyle}>
          <span style={{ display: 'flex' }}><Lock size={20} /></span>
          <span style={{ flex: 1, fontWeight: 700, fontSize: 14 }}>Changer mon mot de passe</span>
          <span style={{ color: 'var(--text3)', fontSize: 18 }}>›</span>
        </button>

        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.4px', marginTop: 8 }}>Aide</div>

        <button onClick={() => setShowHelp(true)} style={rowStyle}>
          <span style={{ display: 'flex' }}><Question size={20} /></span>
          <span style={{ flex: 1, fontWeight: 700, fontSize: 14 }}>Centre d&apos;aide</span>
          <span style={{ color: 'var(--text3)', fontSize: 18 }}>›</span>
        </button>

        <a href="mailto:contact@ostryk.fr?subject=Contact%20OSTRYK" style={{ ...rowStyle, textDecoration: 'none' }}>
          <span style={{ display: 'flex' }}><Envelope size={20} /></span>
          <span style={{ flex: 1, fontWeight: 700, fontSize: 14 }}>Contactez-nous</span>
          <span style={{ color: 'var(--text3)', fontSize: 18 }}>›</span>
        </a>

        <a href="mailto:contact@ostryk.fr?subject=Probl%C3%A8me%20OSTRYK" style={{ ...rowStyle, textDecoration: 'none' }}>
          <span style={{ display: 'flex' }}><Bug size={20} /></span>
          <span style={{ flex: 1, fontWeight: 700, fontSize: 14 }}>Rapporter un problème</span>
          <span style={{ color: 'var(--text3)', fontSize: 18 }}>›</span>
        </a>

        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.4px', marginTop: 8 }}>Légal</div>

        <a href="/confidentialite" style={{ ...rowStyle, textDecoration: 'none' }}>
          <span style={{ display: 'flex' }}><FileText size={20} /></span>
          <span style={{ flex: 1, fontWeight: 700, fontSize: 14 }}>CGU &amp; Confidentialité</span>
          <span style={{ color: 'var(--text3)', fontSize: 18 }}>›</span>
        </a>

        <div style={{ textAlign: 'center', fontSize: 11, color: 'var(--text3)', marginTop: 4 }}>OSTRYK — version 1.0</div>

        <button
          onClick={async () => { clearLastPath(); await supabase.auth.signOut(); window.location.href = '/login' }}
          style={{ ...rowStyle, marginTop: 10, color: '#B91C1C', justifyContent: 'center' }}
        >
          ⎋ Déconnexion
        </button>
      </div>

      {showSubscription && (
        <SubscriptionScreen athlete={athlete} token={token} onClose={() => setShowSubscription(false)} />
      )}

      {showHelp && (
        <div style={{ position: 'fixed', inset: 0, background: 'var(--bg2)', zIndex: 550, display: 'flex', flexDirection: 'column' }}>
          <div style={{ background: 'var(--bg)', borderBottom: '1px solid var(--border)', padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
            <button onClick={() => setShowHelp(false)} style={{ background: 'none', border: 'none', fontSize: 22, color: 'var(--text2)', cursor: 'pointer', padding: '2px 4px', lineHeight: 1 }}>←</button>
            <div style={{ flex: 1, fontFamily: 'var(--font-title)', color: 'var(--title)', fontWeight: 700, fontSize: 18 }}>Centre d&apos;aide</div>
          </div>
          <div style={{ flex: 1, padding: 16, textAlign: 'center', color: 'var(--text3)' }}>
            <div style={{ fontSize: 32, marginBottom: 10 }}>🚧</div>
            <div style={{ fontSize: 13 }}>Bientôt disponible. En attendant, utilise &quot;Contactez-nous&quot; pour toute question.</div>
          </div>
        </div>
      )}

      {showStravaImport && (
        <div onClick={() => !importing && setShowStravaImport(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 600, padding: 16 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: 'var(--bg)', borderRadius: 'var(--rl)', padding: 20, maxWidth: 380, width: '100%', boxShadow: '0 20px 60px rgba(0,0,0,0.4)' }}>
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 8 }}><DownloadSimple size={32} /></div>
            <div style={{ fontFamily: 'var(--font-title)', color: 'var(--title)', fontSize: 17, fontWeight: 700, marginBottom: 4, textAlign: 'center' }}>
              Importer mes activités Strava
            </div>
            <div style={{ fontSize: 13, color: 'var(--text3)', marginBottom: 16, textAlign: 'center' }}>
              Choisis la date à partir de laquelle récupérer tes activités (par exemple le 1er septembre pour tout ce qui a eu lieu depuis).
            </div>
            <input type="date" value={importStartDate} onChange={e => setImportStartDate(e.target.value)} max={new Date().toISOString().slice(0, 10)}
              style={{ width: '100%', boxSizing: 'border-box', padding: '10px 12px', border: '1px solid var(--border2)', borderRadius: 'var(--r)', fontSize: 14, fontWeight: 700, outline: 'none', background: 'var(--bg2)', color: 'var(--text)', marginBottom: 12 }} />

            {importResult && (
              <div style={{ background: 'var(--green-light)', border: '1px solid #B8EAD8', borderRadius: 'var(--r)', padding: '10px 12px', fontSize: 13, color: '#0D6B4F', marginBottom: 12, textAlign: 'center' }}>
                {importResult.imported} activité{importResult.imported !== 1 ? 's' : ''} importée{importResult.imported !== 1 ? 's' : ''}
                {importResult.total > importResult.imported ? ` (${importResult.total - importResult.imported} déjà connue${importResult.total - importResult.imported !== 1 ? 's' : ''})` : ''}.
              </div>
            )}

            <button onClick={runStravaImport} disabled={!importStartDate || importing} style={{
              background: 'var(--green)', color: '#fff', border: 'none', borderRadius: 'var(--r)', padding: '11px', fontSize: 14, fontWeight: 700,
              cursor: (!importStartDate || importing) ? 'default' : 'pointer', width: '100%', opacity: (!importStartDate || importing) ? 0.6 : 1, marginBottom: 8,
            }}>
              {importing ? 'Import en cours…' : 'Importer'}
            </button>
            <button onClick={() => setShowStravaImport(false)} disabled={importing} style={{ background: 'none', border: 'none', color: 'var(--text3)', fontSize: 13, fontWeight: 600, cursor: 'pointer', width: '100%', padding: 6 }}>
              Fermer
            </button>
          </div>
        </div>
      )}

      {showPassword && <PasswordSettingsModal onClose={() => setShowPassword(false)} />}
    </div>
  )
}
