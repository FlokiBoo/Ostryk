'use client'

import { useEffect, useState } from 'react'
import { Trash } from '@phosphor-icons/react'
import CourbeDatee from '@/app/components/CourbeDatee'
import { CHAMPS_MESURES, serie } from '@/lib/mesures'
import { jourLocal } from '@/lib/nutrition'

// « Mon suivi corporel » : le sportif note son poids et ses mensurations, datés. Chaque saisie
// devient un point des courbes que le coach voit sur la fiche client. Ouvert depuis le Profil et
// depuis le « + ».

const champ = { width: '100%', boxSizing: 'border-box', padding: '10px 12px', border: '1px solid var(--border2)', borderRadius: 'var(--r)', fontSize: 16, background: 'var(--bg)', color: 'var(--text)', fontFamily: 'inherit', outline: 'none' }
const carte = { background: 'var(--card-white)', border: '1px solid var(--ostryk-border)', borderRadius: 'var(--ostryk-card-radius)', padding: 16 }
const fmt = v => (v === null || v === undefined ? null : Number(v).toLocaleString('fr-FR'))
const formVide = () => ({ date: jourLocal(), ...Object.fromEntries(CHAMPS_MESURES.map(c => [c.key, ''])) })

export default function SuiviCorporelScreen({ token, onClose, onPoids }) {
  const [mesures, setMesures] = useState(null)
  const [form, setForm] = useState(formVide)
  const [envoi, setEnvoi] = useState(false)
  const [message, setMessage] = useState(null)

  useEffect(() => {
    let actif = true
    fetch(`/api/athlete-view/${token}/mesures`, { cache: 'no-store' })
      .then(r => r.json())
      .then(j => { if (actif) setMesures(j.mesures || []) })
      .catch(() => actif && setMesures([]))
    return () => { actif = false }
  }, [token])

  const enregistrer = async () => {
    setEnvoi(true)
    setMessage(null)
    try {
      const res = await fetch(`/api/athlete-view/${token}/mesures`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) { setMessage({ erreur: true, texte: j.error || 'Enregistrement impossible.' }); return }
      setMesures(prev => [j.mesure, ...(prev || []).filter(m => m.id !== j.mesure.id)].sort((a, b) => b.date.localeCompare(a.date)))
      if (j.mesure.poids_kg !== null && form.date >= ((mesures || []).find(m => m.poids_kg !== null)?.date || '')) onPoids?.(Number(j.mesure.poids_kg))
      setForm(formVide())
      setMessage({ erreur: false, texte: 'Enregistré. Ton coach le voit sur ta fiche.' })
    } catch {
      setMessage({ erreur: true, texte: 'Pas de connexion. Réessaie dans un instant.' })
    } finally {
      setEnvoi(false)
    }
  }

  const supprimer = async (m) => {
    if (!window.confirm(`Supprimer la mesure du ${new Date(`${m.date}T12:00:00`).toLocaleDateString('fr-FR')} ?`)) return
    const res = await fetch(`/api/athlete-view/${token}/mesures?id=${m.id}`, { method: 'DELETE' }).catch(() => null)
    if (res?.ok) setMesures(prev => prev.filter(x => x.id !== m.id))
    else alert('Suppression impossible, réessaie.')
  }

  const poids = serie(mesures, 'poids_kg')
  const rempli = CHAMPS_MESURES.some(c => String(form[c.key]).trim() !== '')

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'var(--bg2)', zIndex: 550, display: 'flex', flexDirection: 'column' }}>
      <div style={{ background: 'var(--bg)', borderBottom: '1px solid var(--border)', padding: '14px 16px', paddingTop: 'calc(14px + env(safe-area-inset-top))', display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
        <button onClick={onClose} aria-label="Retour" style={{ background: 'none', border: 'none', fontSize: 22, color: 'var(--text2)', cursor: 'pointer', padding: '2px 4px', lineHeight: 1 }}>←</button>
        <div style={{ flex: 1, fontFamily: 'var(--font-title)', color: 'var(--title)', fontWeight: 700, fontSize: 18 }}>Mon suivi corporel</div>
      </div>
      <div style={{ flex: 1, overflowY: 'auto', maxWidth: 460, width: '100%', margin: '0 auto', boxSizing: 'border-box', padding: 16, display: 'flex', flexDirection: 'column', gap: 12, paddingBottom: 'calc(24px + env(safe-area-inset-bottom))' }}>
        {poids.length ? (
          <div style={carte}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 8 }}>
              <span style={{ fontWeight: 800, fontSize: 15, flex: 1 }}>Poids</span>
              <span style={{ fontSize: 22, fontWeight: 800 }}>{fmt(poids[poids.length - 1].valeur)}</span>
              <span style={{ fontSize: 12, color: 'var(--text3)' }}>kg</span>
            </div>
            <CourbeDatee points={poids} unite="kg" hauteur={140} />
          </div>
        ) : null}

        <div style={{ ...carte, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ fontWeight: 800, fontSize: 15 }}>Nouvelle mesure</div>
          <div style={{ fontSize: 12, color: 'var(--text3)', lineHeight: 1.45 }}>Remplis seulement ce que tu as mesuré. Pour des courbes fiables : le matin, à jeun, au même endroit du corps.</div>
          <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--text3)' }}>Date
            <input type="date" value={form.date} max={jourLocal()} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} style={{ ...champ, marginTop: 4 }} />
          </label>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            {CHAMPS_MESURES.map(c => (
              <label key={c.key} style={{ fontSize: 12, fontWeight: 700, color: 'var(--text3)' }}>{c.label} ({c.unite})
                <input value={form[c.key]} inputMode="decimal" onChange={e => setForm(f => ({ ...f, [c.key]: e.target.value }))} style={{ ...champ, marginTop: 4 }} />
              </label>
            ))}
          </div>
          {message ? <div style={{ fontSize: 13, color: message.erreur ? 'var(--bordeaux)' : 'var(--green)' }}>{message.texte}</div> : null}
          <button onClick={enregistrer} disabled={envoi || !rempli} style={{ background: 'var(--green)', color: '#fff', border: 'none', borderRadius: 'var(--r)', padding: 13, fontSize: 14, fontWeight: 700, cursor: rempli ? 'pointer' : 'default', opacity: rempli ? 1 : 0.5, fontFamily: 'inherit' }}>
            {envoi ? 'Enregistrement…' : 'Enregistrer'}
          </button>
        </div>

        {mesures?.length ? (
          <div style={carte}>
            <div style={{ fontWeight: 800, fontSize: 15, marginBottom: 6 }}>Historique</div>
            {mesures.map(m => (
              <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderTop: '1px solid var(--border)' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 700 }}>{new Date(`${m.date}T12:00:00`).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}</div>
                  <div style={{ fontSize: 12, color: 'var(--text3)' }}>
                    {CHAMPS_MESURES.filter(c => m[c.key] !== null).map(c => `${c.label} ${fmt(m[c.key])} ${c.unite}`).join(' · ')}
                    {m.saisi_par === 'coach' ? ' · saisi par ton coach' : ''}
                  </div>
                </div>
                <button aria-label="Supprimer cette mesure" onClick={() => supprimer(m)} style={{ background: 'none', border: 'none', color: 'var(--text3)', cursor: 'pointer', padding: 4, display: 'flex' }}><Trash size={16} /></button>
              </div>
            ))}
          </div>
        ) : null}
        {mesures === null ? <div style={{ fontSize: 13, color: 'var(--text3)', textAlign: 'center' }}>Chargement…</div> : null}
      </div>
    </div>
  )
}
