'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { PushPin, X } from '@phosphor-icons/react'
import { supabase } from '@/lib/supabase'

// Tableau de bord coach : les clients que le coach a choisi de suivre (athletes.suivi_dashboard),
// chacun avec la dernière séance faite AVEC le coach :
//   - coaching individuel : une séance validée dont au moins une série a été saisie par le coach
//     (program_exercise_sets.entered_by_role = 'coach', posé par l'écran de coaching) ;
//   - coaching de groupe : une séance de groupe où le client était présent (group_session_attendance).
// La plus récente des deux l'emporte.

function dateCourte(iso) {
  if (!iso) return ''
  const d = new Date(iso.length === 10 ? `${iso}T12:00:00` : iso)
  const jours = Math.floor((Date.now() - d.getTime()) / 86400000)
  if (jours <= 0) return "aujourd'hui"
  if (jours === 1) return 'hier'
  if (jours < 7) return `il y a ${jours} jours`
  return `le ${d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}`
}

async function dernieresSeancesCoachees(ids) {
  if (!ids.length) return {}
  const [{ data: completions }, { data: presences }] = await Promise.all([
    supabase.from('program_completions')
      .select('athlete_id, program_session_id, completed_at, program_sessions(title)')
      .in('athlete_id', ids).eq('skipped', false).not('completed_at', 'is', null)
      .order('completed_at', { ascending: false }).limit(100),
    supabase.from('group_session_attendance')
      .select('athlete_id, group_session_runs(title, date, groups(name))')
      .in('athlete_id', ids).limit(300),
  ])

  // Parmi les séances validées, celles où le coach a saisi des séries.
  const sessionIds = [...new Set((completions || []).map(c => c.program_session_id))]
  const coachees = new Set()
  if (sessionIds.length) {
    const { data: series } = await supabase.from('program_exercise_sets')
      .select('athlete_id, program_exercises!inner(program_session_id)')
      .eq('entered_by_role', 'coach').in('athlete_id', ids)
      .in('program_exercises.program_session_id', sessionIds)
      .limit(5000)
    for (const s of series || []) coachees.add(`${s.athlete_id}:${s.program_exercises.program_session_id}`)
  }

  const out = {}
  const garder = (athleteId, seance) => {
    if (!out[athleteId] || seance.date > out[athleteId].date) out[athleteId] = seance
  }
  for (const c of completions || []) {
    if (coachees.has(`${c.athlete_id}:${c.program_session_id}`)) {
      garder(c.athlete_id, { titre: c.program_sessions?.title || 'Séance', date: c.completed_at, groupe: null })
    }
  }
  for (const p of presences || []) {
    const run = p.group_session_runs
    if (run?.date) garder(p.athlete_id, { titre: run.title || 'Séance', date: run.date, groupe: run.groups?.name || 'groupe' })
  }
  return out
}

export default function ClientsSuivis({ athletes, onSuiviChange }) {
  const suivis = athletes.filter(a => a.suivi_dashboard)
  const [dernieres, setDernieres] = useState(null)
  const [choix, setChoix] = useState(false)
  const cle = suivis.map(a => a.id).join(',')

  useEffect(() => {
    let actif = true
    dernieresSeancesCoachees(cle ? cle.split(',') : []).then(r => { if (actif) setDernieres(r) })
    return () => { actif = false }
  }, [cle])

  const basculer = async (a) => {
    const valeur = !a.suivi_dashboard
    onSuiviChange(a.id, valeur)
    const { error } = await supabase.from('athletes').update({ suivi_dashboard: valeur }).eq('id', a.id)
    if (error) { onSuiviChange(a.id, !valeur); alert('Erreur : ' + error.message) }
  }

  return (
    <div style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 'var(--rl)', padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ display: 'flex', color: 'var(--green)' }}><PushPin size={16} /></span>
        <div style={{ flex: 1, fontSize: 13, fontWeight: 700 }}>Mes clients suivis</div>
        <button onClick={() => setChoix(true)} style={{
          background: 'var(--green-light)', color: 'var(--green)', border: 'none',
          borderRadius: 20, padding: '5px 10px', fontSize: 12, fontWeight: 700, cursor: 'pointer',
        }}>
          {suivis.length ? 'Modifier' : 'Choisir'}
        </button>
      </div>

      {suivis.length === 0 ? (
        <div style={{ fontSize: 13, color: 'var(--text3)' }}>Choisis les clients que tu veux garder sous les yeux.</div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 8 }}>
          {suivis.map(a => {
            const s = dernieres?.[a.id]
            return (
              <Link key={a.id} href={`/athletes/${a.id}`} style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 'var(--r)', padding: '10px 12px', textDecoration: 'none', color: 'var(--text)', display: 'block' }}>
                <div style={{ fontWeight: 700, fontSize: 13 }}>{a.name}</div>
                <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 2 }}>
                  {dernieres === null ? 'Chargement…'
                    : s ? <>Dernière séance ensemble : <strong style={{ color: 'var(--text2)', fontWeight: 600 }}>{s.titre}</strong>{s.groupe ? ` (${s.groupe})` : ''} · {dateCourte(s.date)}</>
                      : 'Pas encore de séance coachée ensemble.'}
                </div>
              </Link>
            )
          })}
        </div>
      )}

      {choix ? (
        <div onClick={() => setChoix(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 900, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: 'var(--bg)', borderRadius: 'var(--rl)', padding: 18, width: '100%', maxWidth: 420, maxHeight: '80svh', display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center' }}>
              <div style={{ flex: 1, fontFamily: 'var(--font-title)', color: 'var(--title)', fontWeight: 700, fontSize: 17 }}>Clients suivis</div>
              <button onClick={() => setChoix(false)} aria-label="Fermer" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text3)', display: 'flex' }}><X size={20} /></button>
            </div>
            <div style={{ overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 4 }}>
              {athletes.map(a => (
                <label key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 6px', borderRadius: 'var(--r)', cursor: 'pointer', fontSize: 14 }}>
                  <input type="checkbox" checked={!!a.suivi_dashboard} onChange={() => basculer(a)} style={{ width: 18, height: 18, accentColor: 'var(--green)' }} />
                  {a.name}
                </label>
              ))}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
