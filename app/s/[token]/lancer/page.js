'use client'

import { useState, useEffect, use } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { coachingHref } from '@/lib/coachingHref'

export default function LancerPage({ params }) {
  const { token } = use(params)
  const router = useRouter()
  const [athlete, setAthlete] = useState(null)
  const [programs, setPrograms] = useState(null)
  const [expanded, setExpanded] = useState({})

  useEffect(() => {
    async function load() {
      const { data: ath } = await supabase.from('athletes').select('id, name, token').eq('token', token).single()
      if (!ath) { setPrograms([]); return }
      setAthlete(ath)

      const { data: progs } = await supabase
        .from('programs')
        .select('id, title, activity_type, pinned_board, program_sessions(id, title, order_index, program_exercises(name))')
        .eq('athlete_id', ath.id)
        .neq('archived', true)
        .order('created_at', { ascending: false })

      const sessionIds = (progs || []).flatMap(p => (p.program_sessions || []).map(s => s.id))
      const { data: comps } = sessionIds.length
        ? await supabase.from('program_completions').select('program_session_id').eq('athlete_id', ath.id).in('program_session_id', sessionIds)
        : { data: [] }
      const doneIds = new Set((comps || []).map(c => c.program_session_id))

      const list = (progs || []).map(p => ({
        ...p,
        sessions: [...(p.program_sessions || [])].sort((a, b) => a.order_index - b.order_index).map(s => ({ ...s, done: doneIds.has(s.id) })),
      })).filter(p => {
        const isFreeSession = p.title?.startsWith('Séance libre')
        const allDone = p.sessions.length > 0 && p.sessions.every(s => s.done)
        return !(isFreeSession && allDone)
      })
      setPrograms(list)
    }
    load()
  }, [token])

  const launchSession = (session) => {
    router.push(coachingHref({ athleteId: athlete.id, athleteToken: token, session }))
  }

  return (
    <div style={{ minHeight: '100svh', background: 'var(--bg2)', display: 'flex', flexDirection: 'column' }}>
      <div style={{ background: 'var(--bg)', borderBottom: '1px solid var(--border)', padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 10, position: 'sticky', top: 0, zIndex: 10 }}>
        <button onClick={() => router.back()} style={{ background: 'none', border: 'none', fontSize: 22, color: 'var(--text2)', cursor: 'pointer', padding: '2px 4px', lineHeight: 1 }}>←</button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: 'var(--font-title)', color: 'var(--title)', fontWeight: 700, fontSize: 17, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{athlete?.name || '…'}</div>
          <div style={{ fontSize: 11, color: 'var(--text3)' }}>Choisir un programme à lancer</div>
        </div>
      </div>

      <div style={{ padding: 16, maxWidth: 480, width: '100%', margin: '0 auto', boxSizing: 'border-box', display: 'flex', flexDirection: 'column', gap: 12 }}>
        {programs === null && (
          <div style={{ textAlign: 'center', color: 'var(--text3)', fontSize: 13, padding: '30px 0' }}>Chargement…</div>
        )}

        {programs !== null && programs.length === 0 && (
          <div style={{ textAlign: 'center', color: 'var(--text3)', fontSize: 13, padding: '30px 0', border: '1px dashed var(--border2)', borderRadius: 'var(--rl)' }}>
            Aucun programme disponible pour ce sportif.
          </div>
        )}

        {(programs || []).map(prog => {
          const isExpanded = !!expanded[prog.id]
          const upcoming = prog.sessions.filter(s => !s.done).slice(0, 2)
          const visible = isExpanded ? prog.sessions : (upcoming.length > 0 ? upcoming : prog.sessions.slice(-2))
          const hiddenCount = prog.sessions.length - visible.length

          return (
            <div key={prog.id} style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 'var(--rl)', overflow: 'hidden' }}>
              <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ fontWeight: 800, fontSize: 15, flex: 1 }}>{prog.title || prog.activity_type || 'Programme'}</div>
                {prog.activity_type && <div style={{ fontSize: 11, color: 'var(--text3)', fontWeight: 600 }}>{prog.activity_type}</div>}
              </div>

              <div style={{ display: 'flex', flexDirection: 'column' }}>
                {prog.sessions.length === 0 && (
                  <div style={{ padding: '12px 14px', fontSize: 12, color: 'var(--text3)', fontStyle: 'italic' }}>Aucune séance</div>
                )}
                {visible.map((s, i) => {
                  const fullIdx = prog.sessions.indexOf(s)
                  return (
                    <button key={s.id} onClick={() => launchSession(s)} style={{
                      display: 'flex', alignItems: 'center', gap: 8, width: '100%', textAlign: 'left',
                      background: s.done ? '#FEF2F2' : 'none', border: 'none', borderTop: i > 0 ? '1px solid var(--border)' : 'none',
                      padding: '12px 14px', cursor: 'pointer', fontFamily: 'inherit',
                    }}>
                      <div style={{
                        width: 24, height: 24, borderRadius: '50%', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 11, fontWeight: 800,
                        background: s.done ? '#FEE2E2' : 'var(--green-light)', color: s.done ? '#991B1B' : 'var(--green)',
                      }}>
                        {s.done ? '✓' : fullIdx + 1}
                      </div>
                      <div style={{ flex: 1, fontSize: 14, fontWeight: 700, color: s.done ? '#991B1B' : 'var(--text)' }}>{s.title || `Séance ${fullIdx + 1}`}</div>
                      <span style={{ color: 'var(--green)', fontSize: 13, fontWeight: 700 }}>▶ Lancer</span>
                    </button>
                  )
                })}

                {prog.sessions.length > visible.length || isExpanded ? (
                  <button
                    onClick={() => setExpanded(e => ({ ...e, [prog.id]: !e[prog.id] }))}
                    style={{
                      background: 'none', border: 'none', borderTop: '1px solid var(--border)', padding: '10px 14px',
                      fontSize: 12, fontWeight: 600, color: 'var(--text3)', cursor: 'pointer', textAlign: 'center', width: '100%',
                    }}>
                    {isExpanded ? '▲ Réduire' : `▼ Voir toutes les séances${hiddenCount > 0 ? ` (${hiddenCount} de plus)` : ''}`}
                  </button>
                ) : null}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
