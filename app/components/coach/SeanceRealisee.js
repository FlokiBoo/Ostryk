'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { CheckCircle, PencilSimple, X } from '@phosphor-icons/react'

const rempli = v => v != null && v !== ''

function mesures(reps, kg, sec) {
  const parts = []
  if (rempli(reps)) parts.push(`${reps} reps`)
  if (rempli(kg)) parts.push(`${kg} kg`)
  if (rempli(sec)) parts.push(`${sec} sec`)
  return parts.join(' × ')
}

function Note({ label, children, couleur = 'var(--text2)' }) {
  return (
    <div style={{ fontSize: 12, color: couleur, lineHeight: 1.4, whiteSpace: 'pre-wrap' }}>
      <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.4px', color: 'var(--text3)', marginRight: 6 }}>{label}</span>
      {children}
    </div>
  )
}

// Lecture seule d'une séance terminée : ce qui a été saisi pendant la séance (séries, charges,
// notes), à garder sous les yeux pendant qu'on écrit la suivante dans le panneau voisin. Charge
// ses propres données plutôt que de les recevoir de la page : l'éditeur d'à côté écrit en base
// sans repasser par l'état de la page.
export default function SeanceRealisee({ sessionId, athleteId, onEdit, onClose }) {
  const [data, setData] = useState(null)

  useEffect(() => {
    let annule = false
    async function load() {
      const { data: sess } = await supabase.from('program_sessions')
        .select('*, program_exercises(*)').eq('id', sessionId).single()
      const exercises = [...(sess?.program_exercises || [])].filter(e => e.name).sort((a, b) => a.order_index - b.order_index)
      const exoIds = exercises.map(e => e.id)
      const vide = Promise.resolve({ data: [] })
      const [{ data: completion }, { data: logs }, { data: sets }] = await Promise.all([
        supabase.from('program_completions').select('*').eq('athlete_id', athleteId).eq('program_session_id', sessionId).maybeSingle(),
        exoIds.length ? supabase.from('program_exercise_logs').select('*').eq('athlete_id', athleteId).in('program_exercise_id', exoIds) : vide,
        exoIds.length ? supabase.from('program_exercise_sets').select('*').eq('athlete_id', athleteId).in('program_exercise_id', exoIds).order('set_index') : vide,
      ])
      if (annule) return
      const logParExo = {}
      ;(logs || []).forEach(l => { logParExo[l.program_exercise_id] = l })
      const setsParExo = {}
      ;(sets || []).forEach(s => { (setsParExo[s.program_exercise_id] ||= []).push(s) })
      setData({ session: sess, completion, exercises, logParExo, setsParExo })
    }
    load()
    return () => { annule = true }
  }, [sessionId, athleteId])

  if (!data) return <div style={{ padding: 24, fontSize: 13, color: 'var(--text3)' }}>Chargement…</div>

  const { session, completion, exercises, logParExo, setsParExo } = data
  const faiteLe = completion?.completed_at
    ? new Date(completion.completed_at).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })
    : null

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100%' }}>
      <div style={{
        position: 'sticky', top: 0, zIndex: 5, background: 'var(--bg)', borderBottom: '1px solid var(--border)',
        padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 8,
      }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: 'var(--font-title)', color: 'var(--title)', fontWeight: 700, fontSize: 16, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {session?.title || 'Séance'}
          </div>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--green)', display: 'flex', alignItems: 'center', gap: 4, marginTop: 2 }}>
            <CheckCircle size={13} weight="fill" /> Terminée{faiteLe ? ` · ${faiteLe}` : ''}
          </div>
        </div>
        {onEdit && (
          <button onClick={onEdit} title="Modifier le contenu de cette séance"
            style={{ background: 'none', border: '1px solid var(--border2)', borderRadius: 'var(--r)', padding: '6px 10px', fontSize: 12, fontWeight: 600, color: 'var(--text2)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0 }}>
            <PencilSimple size={13} /> Modifier
          </button>
        )}
        {onClose && (
          <button onClick={onClose} title="Fermer cette séance"
            style={{ background: 'none', border: 'none', color: 'var(--text3)', cursor: 'pointer', padding: 4, display: 'flex', flexShrink: 0 }}>
            <X size={18} />
          </button>
        )}
      </div>

      <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
        {(completion?.pleasure != null || completion?.difficulty != null || completion?.duration_minutes) && (
          <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', fontSize: 12, color: 'var(--text2)' }}>
            {completion.pleasure != null && <span>Plaisir <strong>{completion.pleasure}/10</strong></span>}
            {completion.difficulty != null && <span>Difficulté <strong>{completion.difficulty}/10</strong></span>}
            {completion.duration_minutes ? <span>Durée <strong>{completion.duration_minutes} min</strong></span> : null}
          </div>
        )}

        {(session?.coach_notes || session?.private_coach_note) && (
          <div style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 'var(--r)', padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 6 }}>
            {session.coach_notes && <Note label="Consigne">{session.coach_notes}</Note>}
            {session.private_coach_note && <Note label="Note privée">{session.private_coach_note}</Note>}
          </div>
        )}

        {exercises.length === 0 && (
          <div style={{ fontSize: 13, color: 'var(--text3)', fontStyle: 'italic' }}>Aucun exercice dans cette séance.</div>
        )}

        {exercises.map(e => {
          const log = logParExo[e.id] || {}
          const sets = setsParExo[e.id] || []
          const prevu = [rempli(e.sets) ? `${e.sets} séries` : null, mesures(e.reps, e.kg) || null].filter(Boolean).join(' · ')
          const resume = [rempli(log.sets_done) ? `${log.sets_done} séries` : null, mesures(log.reps_done, log.kg_done) || null].filter(Boolean).join(' · ')
          const rienSaisi = sets.length === 0 && !resume && !log.note
          return (
            <div key={e.id} style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 'var(--r)', padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                <div style={{ flex: 1, fontWeight: 700, fontSize: 14, color: 'var(--text)' }}>{e.name}</div>
                {prevu && <div style={{ fontSize: 11, color: 'var(--text3)', flexShrink: 0 }}>Prévu : {prevu}</div>}
              </div>

              {sets.length > 0 && (
                <div style={{ background: 'var(--green-light)', borderRadius: 'var(--r)', padding: '6px 10px', display: 'flex', flexDirection: 'column', gap: 3 }}>
                  {sets.map((s, i) => {
                    const fait = mesures(s.reps_done, s.kg_done, s.sec_done)
                    const prescrit = mesures(s.reps_prescribed, s.kg_prescribed, s.sec_prescribed)
                    return (
                      <div key={s.id} style={{ display: 'flex', alignItems: 'baseline', gap: 8, fontSize: 13 }}>
                        <span style={{ width: 52, fontSize: 11, fontWeight: 700, color: 'var(--green)', flexShrink: 0 }}>Série {i + 1}</span>
                        <span style={{ fontWeight: 700, color: 'var(--text)' }}>{fait || '—'}</span>
                        {prescrit && prescrit !== fait && <span style={{ fontSize: 11, color: 'var(--text3)' }}>prévu {prescrit}</span>}
                        {s.entered_by_role === 'coach' && <span style={{ fontSize: 10, color: 'var(--text3)', marginLeft: 'auto' }}>saisie coach</span>}
                      </div>
                    )
                  })}
                </div>
              )}

              {resume && (
                <div style={{ fontSize: 13, color: 'var(--text)' }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--green)', marginRight: 8 }}>Réalisé</span>
                  <strong>{resume}</strong>
                </div>
              )}

              {log.note && <Note label="Note du sportif" couleur="var(--text)">{log.note}</Note>}
              {e.note && <Note label="Consigne">{e.note}</Note>}
              {e.private_coach_note && <Note label="Note privée">{e.private_coach_note}</Note>}
              {rienSaisi && <div style={{ fontSize: 12, color: 'var(--text3)', fontStyle: 'italic' }}>Rien de saisi sur cet exercice.</div>}
            </div>
          )
        })}
      </div>
    </div>
  )
}
