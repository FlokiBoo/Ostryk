'use client'

import { useMemo, useState } from 'react'
import { CalendarBlank } from '@phosphor-icons/react'
import { WEEK_DAYS } from '@/lib/weekDays'

// Popup affiché à l'ouverture quand un programme est assigné à l'athlète mais que personne ne l'a
// daté (ni le coach via day_of_week, ni l'athlète via athlete_days_of_week) — sans ça le programme
// restait invisible ailleurs que dans "Mes programmes" (voir WodTab).
//
// Le conseil du coach (programs.recommended_sessions_per_week) PLAFONNE la sélection quand il
// existe : au-delà, les jours supplémentaires sont refusés avec un message. Quand il n'existe pas
// — c'est le cas de toutes les copies créées avant le correctif de propagation du conseil — il n'y
// a aucun plafond et l'athlète choisit librement, comme avant.
//
// min_hours_between_sessions n'est jamais bloquant : deux jours consécutifs déclenchent un simple
// rappel, l'athlète peut valider quand même.
//
// Dans tous les cas les séances s'enchaînent dans l'ordre du programme (nextUncompletedOf dans
// WodTab) : le jour choisi ne sert qu'à l'étiquette de la carte et au calcul de durée ci-dessous.

function pluriel(n, mot) {
  return `${n} ${mot}${n > 1 ? 's' : ''}`
}

function formateDate(d) {
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })
}

export default function ChooseDaysModal({ program, objectives = [], onSave, onDismiss }) {
  const conseil = program.recommended_sessions_per_week || null
  const max = conseil ? Math.min(Math.max(conseil, 1), 7) : 7
  const ecartMini = program.min_hours_between_sessions || null
  const pourquoi = program.recommended_rhythm_note || null

  const totalSeances = (program.sessions || []).filter(s => s.session_type !== 'recurrent').length

  const [selected, setSelected] = useState(() => (program.athlete_days_of_week || []).slice(0, max))
  const [maxAtteint, setMaxAtteint] = useState(false)
  const [saving, setSaving] = useState(false)

  const nb = selected.length

  const calcul = useMemo(() => {
    if (nb === 0 || totalSeances === 0) return null
    const semaines = Math.ceil(totalSeances / nb)
    const debut = new Date()
    const fin = new Date(debut)
    fin.setDate(fin.getDate() + semaines * 7)
    const objectifDepasse = (objectives || [])
      .filter(o => o.target_date && !o.completed_at)
      .map(o => ({ ...o, d: new Date(o.target_date) }))
      .filter(o => o.d > debut && o.d < fin)
      .sort((a, b) => a.d - b.d)[0]
    return { semaines, fin, objectifDepasse }
  }, [nb, totalSeances, objectives])

  // Paires de jours trop rapprochées pour le conseil du coach. La semaine boucle : dimanche puis
  // lundi comptent comme deux jours d'affilée.
  const alerteEcart = useMemo(() => {
    if (!ecartMini || ecartMini <= 24 || nb < 2) return null
    const tries = [...selected].sort((a, b) => a - b)
    const paires = []
    for (let k = 0; k < tries.length; k++) {
      const a = tries[k]
      const b = tries[(k + 1) % tries.length]
      const ecartJours = k === tries.length - 1 ? b + 7 - a : b - a
      if (ecartJours * 24 < ecartMini) {
        paires.push(`${WEEK_DAYS[a].label.toLowerCase()} et ${WEEK_DAYS[b].label.toLowerCase()}`)
      }
    }
    return paires.length ? paires : null
  }, [selected, nb, ecartMini])

  const toggleDay = (key) => {
    if (selected.includes(key)) {
      setMaxAtteint(false)
      setSelected(prev => prev.filter(d => d !== key))
      return
    }
    if (selected.length >= max) {
      setMaxAtteint(true)
      return
    }
    setMaxAtteint(false)
    setSelected(prev => [...prev, key])
  }

  const save = async () => {
    if (nb === 0 || saving) return
    setSaving(true)
    await onSave([...selected].sort((a, b) => a - b))
    setSaving(false)
  }

  let message
  if (maxAtteint) {
    message = { bg: 'var(--bordeaux-light)', col: 'var(--bordeaux)', texte: `Maximum ${pluriel(max, 'jour')}, c'est le rythme conseillé par ton coach. Retire un jour pour en choisir un autre.` }
  } else if (nb === 0) {
    message = { bg: 'var(--ostryk-border)', col: 'var(--ostryk-text2)', texte: 'Sélectionne au moins un jour.' }
  } else if (!calcul) {
    message = { bg: 'var(--ostryk-border)', col: 'var(--text2)', texte: pluriel(nb, 'séance') + ' par semaine.' }
  } else if (conseil && nb < max) {
    message = {
      bg: 'var(--ostryk-border)', col: 'var(--text2)',
      texte: `${pluriel(nb, 'jour')} sur ${max} conseillés. Le programme durera ${pluriel(calcul.semaines, 'semaine')}${program.duration_weeks ? ` au lieu de ${program.duration_weeks}` : ''}.`,
    }
  } else if (conseil) {
    message = { bg: 'var(--vert-foret-light)', col: 'var(--vert-foret)', texte: `Rythme conseillé. Le programme dure ${pluriel(calcul.semaines, 'semaine')}.` }
  } else {
    message = { bg: 'var(--ostryk-border)', col: 'var(--text2)', texte: `${pluriel(nb, 'séance')} par semaine. Le programme durera ${pluriel(calcul.semaines, 'semaine')}.` }
  }

  const encart = {
    borderRadius: 10, padding: '9px 12px', fontSize: 12, lineHeight: 1.5, marginBottom: 8,
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(33,29,25,0.55)', zIndex: 1200, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
      <div style={{ background: 'var(--card-white)', borderRadius: '20px 20px 0 0', padding: '24px 20px 28px', width: '100%', maxWidth: 480, maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 -8px 40px rgba(0,0,0,0.2)' }}>
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 10 }}>
          <div style={{ width: 40, height: 40, borderRadius: '50%', background: 'var(--ostryk-border)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--vert-foret)' }}>
            <CalendarBlank size={20} weight="light" />
          </div>
        </div>
        <div style={{ fontFamily: 'var(--font-title)', fontWeight: 600, fontSize: 19, color: 'var(--bordeaux)', textAlign: 'center', marginBottom: 6 }}>
          Tes jours d&apos;entraînement
        </div>
        <div style={{ fontSize: 13, color: 'var(--ostryk-text2)', textAlign: 'center', marginBottom: 14, lineHeight: 1.5 }}>
          Pour « {program.title} », choisis les jours où tu peux t&apos;entraîner chaque semaine. Les
          séances s&apos;enchaînent dans l&apos;ordre du programme.
        </div>

        {conseil && (
          <div style={{ background: 'var(--bg)', borderRadius: 12, padding: '10px 14px', marginBottom: 16 }}>
            <div style={{ fontSize: 13.5, color: 'var(--text)', lineHeight: 1.5 }}>
              💡 Ton coach te conseille{' '}
              <strong style={{ fontWeight: 700, color: 'var(--bordeaux)' }}>{pluriel(conseil, 'séance')}</strong> par semaine
              {ecartMini ? `, avec au moins ${ecartMini} h entre deux séances` : ''}.
            </div>
            {pourquoi && (
              <div style={{ fontSize: 12, lineHeight: 1.55, color: 'var(--text2)', marginTop: 6 }}>{pourquoi}</div>
            )}
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'center', gap: 6, marginBottom: 12 }}>
          {WEEK_DAYS.map(d => {
            const isSelected = selected.includes(d.key)
            return (
              <button key={d.key} onClick={() => toggleDay(d.key)} aria-label={d.label} aria-pressed={isSelected} style={{
                flex: '1 1 0', minWidth: 0, maxWidth: 46, aspectRatio: '1 / 1', borderRadius: '50%',
                border: `1.5px solid ${isSelected ? 'var(--vert-foret)' : 'var(--ostryk-border-input)'}`,
                background: isSelected ? 'var(--vert-foret)' : 'var(--card-white)',
                color: isSelected ? '#fff' : 'var(--ostryk-text2)',
                fontSize: 12, fontWeight: 700, cursor: 'pointer',
              }}>
                {d.short}
              </button>
            )
          })}
        </div>

        <div role="status" aria-live="polite" style={{ ...encart, background: message.bg, color: message.col }}>
          {message.texte}
        </div>

        {alerteEcart && (
          <div role="status" aria-live="polite" style={{ ...encart, background: 'var(--bordeaux-light)', color: 'var(--bordeaux)' }}>
            {alerteEcart.length <= 2 ? `Tu enchaînes ${alerteEcart.join(', ')}.` : 'Plusieurs de tes jours se suivent de trop près.'}
            {' '}Ton coach conseille {ecartMini} h de récupération entre deux séances. Tu peux valider quand même.
          </div>
        )}

        {calcul?.objectifDepasse && (
          <div style={{ ...encart, background: 'var(--bordeaux-light)', color: 'var(--bordeaux)' }}>
            À ce rythme le programme se termine vers le {formateDate(calcul.fin)}, après ton objectif
            « {calcul.objectifDepasse.text} » ({formateDate(calcul.objectifDepasse.d)}).
          </div>
        )}

        <button onClick={save} disabled={nb === 0 || saving} style={{
          width: '100%', background: nb > 0 ? 'var(--bordeaux)' : 'var(--ostryk-border)',
          color: nb > 0 ? '#fff' : 'var(--ostryk-text3)',
          border: 'none', borderRadius: 'var(--ostryk-pill-radius)', padding: '14px',
          fontSize: 15, fontWeight: 700, cursor: nb > 0 ? 'pointer' : 'default', marginTop: 8, marginBottom: 10,
        }}>
          {saving ? '…' : 'Valider mes jours'}
        </button>

        <button onClick={onDismiss} style={{
          width: '100%', background: 'none', border: 'none', color: 'var(--ostryk-text2)',
          fontSize: 13, fontWeight: 600, cursor: 'pointer', padding: 6,
        }}>
          Plus tard
        </button>
      </div>
    </div>
  )
}
