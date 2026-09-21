'use client'

import { useState, useEffect, useCallback } from 'react'
import { CalendarBlank, PencilSimple } from '@phosphor-icons/react'
import { supabase } from '@/lib/supabase'
import WellnessBlock, { WELLNESS_METRICS } from '@/app/components/WellnessBlock'
import { ActivityLogForm } from '@/app/components/ActivityBlock'

function today() {
  const n = new Date()
  return [n.getFullYear(), String(n.getMonth() + 1).padStart(2, '0'), String(n.getDate()).padStart(2, '0')].join('-')
}
function offsetDate(date, days) {
  const d = new Date(date + 'T00:00:00')
  d.setDate(d.getDate() + days)
  return [d.getFullYear(), String(d.getMonth() + 1).padStart(2, '0'), String(d.getDate()).padStart(2, '0')].join('-')
}
function formatDateFr(date) {
  return new Date(date + 'T00:00:00').toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })
}
function dateLabel(date) {
  if (date === today()) return "Aujourd'hui"
  if (date === offsetDate(today(), -1)) return 'Hier'
  if (date === offsetDate(today(), -2)) return 'Avant-hier'
  return formatDateFr(date)
}

function DatePickerRow({ date, onChange }) {
  const [open, setOpen] = useState(false)
  const quickOptions = [
    { label: "Aujourd'hui", value: today() },
    { label: 'Hier', value: offsetDate(today(), -1) },
    { label: 'Avant-hier', value: offsetDate(today(), -2) },
  ]
  return (
    <>
      <button onClick={() => setOpen(true)} style={{
        display: 'flex', alignItems: 'center', gap: 8, alignSelf: 'flex-start',
        background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 20,
        padding: '8px 14px', cursor: 'pointer', fontSize: 13, fontWeight: 700, color: 'var(--text)',
        textTransform: 'capitalize',
      }}>
        <CalendarBlank size={14} /> {dateLabel(date)}
        <span style={{ display: 'flex', color: 'var(--text3)' }}><PencilSimple size={11} /></span>
      </button>

      {open && (
        <div onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 700, padding: 16 }}>
          <div onClick={e => e.stopPropagation()} style={{
            background: 'var(--bg)', borderRadius: 20, padding: 20, maxWidth: 340, width: '100%',
            display: 'flex', flexDirection: 'column', gap: 8,
          }}>
            <div style={{ fontFamily: 'var(--font-title)', color: 'var(--title)', fontWeight: 700, fontSize: 16, marginBottom: 4 }}>
              C&apos;était quand ?
            </div>
            {quickOptions.map(o => (
              <button key={o.value} onClick={() => { onChange(o.value); setOpen(false) }} style={{
                textAlign: 'left', padding: '11px 14px', borderRadius: 12, cursor: 'pointer', fontSize: 14, fontWeight: 700,
                background: date === o.value ? 'var(--green-light)' : 'var(--bg2)',
                border: '1px solid ' + (date === o.value ? 'var(--green)' : 'var(--border)'),
                color: date === o.value ? 'var(--green)' : 'var(--text)',
              }}>
                {o.label}
              </button>
            ))}
            <label style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
              padding: '11px 14px', borderRadius: 12, background: 'var(--bg2)', border: '1px solid var(--border)', cursor: 'pointer',
            }}>
              <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>Autre date</span>
              <input type="date" value={date} max={today()} onChange={e => { if (e.target.value) { onChange(e.target.value); setOpen(false) } }}
                style={{ border: 'none', background: 'none', fontSize: 13, fontWeight: 700, color: 'var(--text)', outline: 'none' }} />
            </label>
          </div>
        </div>
      )}
    </>
  )
}

// Assistant en 3 temps : choisir la discipline → remplir bien-être → remplir les détails de
// l'activité choisie (km/durée/RPE). Réutilise WellnessBlock et ActivityLogForm tels quels.
// La date est sélectionnée aujourd'hui par défaut et modifiable via DatePickerRow, indépendamment
// de la navigation jour-par-jour du reste de l'app (retirée du tableau de bord).
export default function AddActivityWizard({ athleteId, onClose, onSaved }) {
  const [step, setStep] = useState(1)
  const [date, setDate] = useState(today())
  const [defs, setDefs] = useState(null)
  const [selectedDef, setSelectedDef] = useState(null)
  const [log, setLog] = useState(null)
  // Bien-être : le bouton "Valider mon bien-être" de WellnessBlock est masqué ici (hideValidate) —
  // "Suivant" fait les deux d'un coup, et refuse d'avancer tant que les quatre curseurs ne sont pas
  // renseignés. Avant, il fallait valider puis appuyer sur Suivant, et rien n'empêchait de passer
  // avec un formulaire vide (retour testeur).
  const [wellness, setWellness] = useState(null)
  const [wellnessError, setWellnessError] = useState(null)
  const [validatingWellness, setValidatingWellness] = useState(false)
  const onWellnessChange = useCallback(row => { setWellness(row); setWellnessError(null) }, [])

  const goToActivityStep = async () => {
    const missing = WELLNESS_METRICS.filter(m => !wellness?.[m.key])
    if (missing.length) {
      setWellnessError(
        missing.length === WELLNESS_METRICS.length
          ? 'Renseigne les quatre curseurs pour continuer.'
          : `Il manque : ${missing.map(m => m.label.toLowerCase()).join(', ')}.`
      )
      return
    }
    setValidatingWellness(true)
    const { error } = await supabase.from('wellness')
      .upsert({ athlete_id: athleteId, date, validated: true }, { onConflict: 'athlete_id,date' })
    setValidatingWellness(false)
    if (error) { setWellnessError('Enregistrement impossible : ' + error.message); return }
    setStep(3)
  }

  useEffect(() => {
    supabase.from('activity_definitions').select('*').order('created_at')
      .then(({ data }) => setDefs(data || []))
  }, [])

  useEffect(() => {
    if (!selectedDef) return
    supabase.from('activity_logs').select('*')
      .eq('athlete_id', athleteId).eq('date', date).eq('label', selectedDef.label).maybeSingle()
      .then(({ data }) => setLog(data || null))
  }, [selectedDef, athleteId, date])

  const back = () => { if (step === 1) onClose(); else setStep(s => s - 1) }
  const changeDate = (d) => { setDate(d); setWellness(null); setWellnessError(null) }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'var(--bg2)', zIndex: 600, display: 'flex', flexDirection: 'column' }}>
      <div style={{ background: 'var(--bg)', borderBottom: '1px solid var(--border)', padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
        <button onClick={back} style={{ background: 'none', border: 'none', fontSize: 22, color: 'var(--text2)', cursor: 'pointer', padding: '2px 4px', lineHeight: 1 }}>←</button>
        <div style={{ flex: 1, fontFamily: 'var(--font-title)', color: 'var(--title)', fontWeight: 700, fontSize: 18 }}>
          {step === 1 && 'Quelle activité ?'}
          {step === 2 && 'Bien-être du jour'}
          {step === 3 && selectedDef?.label}
        </div>
        <div style={{ display: 'flex', gap: 4 }}>
          {[1, 2, 3].map(n => (
            <span key={n} style={{ width: 6, height: 6, borderRadius: '50%', background: n <= step ? 'var(--green)' : 'var(--border2)' }} />
          ))}
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', maxWidth: 460, width: '100%', margin: '0 auto', boxSizing: 'border-box', padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <DatePickerRow date={date} onChange={changeDate} />

        {step === 1 && (
          defs === null ? (
            <div style={{ textAlign: 'center', color: 'var(--text3)', padding: '40px 0' }}>Chargement…</div>
          ) : defs.length === 0 ? (
            <div style={{ textAlign: 'center', color: 'var(--text3)', padding: '40px 20px', border: '1px dashed var(--border2)', borderRadius: 'var(--rl)', background: 'var(--bg)' }}>
              Aucune discipline disponible pour l&apos;instant.
            </div>
          ) : (
            defs.map(def => (
              <button key={def.id} onClick={() => { setSelectedDef(def); setStep(2) }} style={{
                display: 'flex', alignItems: 'center', gap: 10, background: 'var(--bg)', border: '1px solid var(--border)',
                borderRadius: 'var(--rl)', padding: '14px 16px', cursor: 'pointer', textAlign: 'left',
              }}>
                <span style={{ flex: 1, fontWeight: 700, fontSize: 15 }}>{def.label}</span>
                <span style={{ color: 'var(--text3)', fontSize: 18 }}>›</span>
              </button>
            ))
          )
        )}

        {step === 2 && (
          <>
            <WellnessBlock athleteId={athleteId} date={date} mode="athlete" hideValidate onChange={onWellnessChange} />
            {wellnessError && (
              <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 'var(--r)', padding: '10px 12px', fontSize: 13, fontWeight: 600, color: '#991B1B' }}>
                {wellnessError}
              </div>
            )}
            <button onClick={goToActivityStep} disabled={validatingWellness} style={{
              background: 'var(--green)', color: '#fff', border: 'none', borderRadius: 'var(--rl)',
              padding: '14px', fontSize: 15, fontWeight: 700, cursor: 'pointer',
            }}>
              {validatingWellness ? '…' : 'Suivant →'}
            </button>
          </>
        )}

        {step === 3 && selectedDef && (
          <>
            <ActivityLogForm def={selectedDef} log={log} date={date} athleteId={athleteId} onSaved={l => { setLog(l); onSaved?.() }} />
            <button onClick={onClose} style={{
              background: 'var(--green)', color: '#fff', border: 'none', borderRadius: 'var(--rl)',
              padding: '14px', fontSize: 15, fontWeight: 700, cursor: 'pointer',
            }}>
              ✓ Terminer
            </button>
          </>
        )}
      </div>
    </div>
  )
}
