'use client'

import { useState, useEffect, useRef, use, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { UsersThree, Lightning, FlagCheckered } from '@phosphor-icons/react'
import { supabase } from '@/lib/supabase'
import { getCoachId } from '@/lib/coach'
import { unlockAudio } from '@/lib/audioBeep'
import { unlockSpeech } from '@/lib/speak'
import SplitTimerSession from '@/app/components/SplitTimerSession'
import TimerModal from '@/app/components/TimerModal'
import { CompactStepper } from '@/app/components/GroupPerfStepper'

function today() {
  const n = new Date()
  return [n.getFullYear(), String(n.getMonth() + 1).padStart(2, '0'), String(n.getDate()).padStart(2, '0')].join('-')
}

const inp = {
  width: '100%', boxSizing: 'border-box', padding: '9px 11px', border: '1px solid var(--border2)',
  borderRadius: 'var(--r)', fontSize: 13, outline: 'none', background: 'var(--bg2)', color: 'var(--text)', fontFamily: 'inherit',
}

export default function GroupCoachingSessionPageWrapper({ params }) {
  return (
    <Suspense>
      <GroupCoachingSessionPage params={params} />
    </Suspense>
  )
}

function GroupCoachingSessionPage({ params }) {
  const { groupId, sessionId } = use(params)
  const router = useRouter()
  const searchParams = useSearchParams()
  // Sans paramètre, on travaille sur la séance du jour (lancement en direct). Avec ?date=,
  // on ré-ouvre une séance passée pour la corriger (présents, ressenti) depuis l'historique groupe.
  const runDate = searchParams.get('date') || today()
  const isPast = runDate !== today()
  const [group, setGroup] = useState(null)
  const [members, setMembers] = useState([])
  const [session, setSession] = useState(null)
  const [exercises, setExercises] = useState([])
  const [presentIds, setPresentIds] = useState(new Set())
  const [exerciseNotes, setExerciseNotes] = useState({})
  const [coachDifficulty, setCoachDifficulty] = useState(null)
  const [coachNote, setCoachNote] = useState('')
  const [runId, setRunId] = useState(null)
  const [athleteSets, setAthleteSets] = useState({}) // { athleteId: { programExerciseId: [series...] } }
  const [prefilledSetIds, setPrefilledSetIds] = useState(new Set()) // séries créées via "+ Ajouter" pas encore retouchées par le coach
  const [loading, setLoading] = useState(true)
  const [runningTimer, setRunningTimer] = useState(null) // { config, label } | null — timer préparé sur un circuit/exercice
  const [showTimer, setShowTimer] = useState(null) // { seconds, label } | null — chrono libre sans config préparée
  // Enregistrement automatique du passage (présents, notes perso, ressenti) : avant, rien n'était
  // gardé sans clic sur Enregistrer, et des notes de séance ont été perdues ainsi. Les séries,
  // elles, sont déjà écrites à la saisie (updateSet / addSet).
  const [modifs, setModifs] = useState(0)
  const [autoEtat, setAutoEtat] = useState(null) // null | 'attente' | 'ok' | 'erreur'
  const etatRef = useRef({})
  const runIdRef = useRef(null)
  const enAttenteRef = useRef(false)
  const chaineRef = useRef(Promise.resolve())
  const modifie = () => { setModifs(n => n + 1); setAutoEtat('attente') }

  useEffect(() => { load() }, [groupId, sessionId, runDate])

  async function load() {
    setLoading(true)
    const [{ data: g }, { data: gm }, { data: sess }, { data: exos }] = await Promise.all([
      supabase.from('groups').select('*').eq('id', groupId).single(),
      supabase.from('group_members').select('athlete_id, athletes(id, name)').eq('group_id', groupId),
      supabase.from('program_sessions').select('*').eq('id', sessionId).single(),
      supabase.from('program_exercises').select('*').eq('program_session_id', sessionId).order('order_index'),
    ])
    setGroup(g)
    const mem = (gm || []).map(m => m.athletes).filter(Boolean).sort((a, b) => a.name.localeCompare(b.name))
    setMembers(mem)
    setSession(sess)
    setExercises(exos || [])

    if (mem.length && (exos || []).length) {
      const { data: sets } = await supabase.from('program_exercise_sets').select('*')
        .in('athlete_id', mem.map(m => m.id)).in('program_exercise_id', (exos || []).map(e => e.id))
        .order('set_index')
      const grouped = {}
      ;(sets || []).forEach(s => {
        (grouped[s.athlete_id] ||= {})
        ;(grouped[s.athlete_id][s.program_exercise_id] ||= []).push(s)
      })
      setAthleteSets(grouped)
    }

    const { data: existingRun } = await supabase.from('group_session_runs')
      .select('*').eq('group_id', groupId).eq('source_session_id', sessionId).eq('date', runDate).maybeSingle()
    if (existingRun) {
      setRunId(existingRun.id)
      runIdRef.current = existingRun.id
      setExerciseNotes(existingRun.exercise_notes || {})
      setCoachDifficulty(existingRun.coach_difficulty)
      setCoachNote(existingRun.coach_note || '')
      const { data: att } = await supabase.from('group_session_attendance').select('athlete_id').eq('run_id', existingRun.id)
      setPresentIds(new Set((att || []).map(a => a.athlete_id)))
    }
    setLoading(false)
  }

  // Crée une nouvelle série pré-remplie avec la précédente de cet athlète sur cet exercice (reps +
  // charge identiques) — ou, à défaut de série précédente, avec le plan du coach (exo.reps/exo.kg).
  // Marquée "pré-rempli" tant que le coach ne l'a pas retouchée (voir updateSet).
  const addSet = async (athleteId, exerciseId) => {
    const existing = athleteSets[athleteId]?.[exerciseId] || []
    const prevSet = existing[existing.length - 1]
    const exo = exercises.find(e => e.id === exerciseId)
    const reps_done = prevSet ? prevSet.reps_done : (parseInt(exo?.reps, 10) || null)
    const kg_done = prevSet ? prevSet.kg_done : (parseFloat(exo?.kg) || null)
    const { data, error } = await supabase.from('program_exercise_sets')
      .insert({ athlete_id: athleteId, program_exercise_id: exerciseId, set_index: existing.length, reps_done, kg_done })
      .select().single()
    if (error || !data) return
    setAthleteSets(prev => ({
      ...prev,
      [athleteId]: { ...prev[athleteId], [exerciseId]: [...(prev[athleteId]?.[exerciseId] || []), data] },
    }))
    setPrefilledSetIds(prev => new Set(prev).add(data.id))
  }

  const updateSet = async (athleteId, exerciseId, setId, field, value) => {
    setAthleteSets(prev => ({
      ...prev,
      [athleteId]: {
        ...prev[athleteId],
        [exerciseId]: (prev[athleteId]?.[exerciseId] || []).map(s => s.id === setId ? { ...s, [field]: value } : s),
      },
    }))
    setPrefilledSetIds(prev => { if (!prev.has(setId)) return prev; const next = new Set(prev); next.delete(setId); return next })
    await supabase.from('program_exercise_sets').update({ [field]: value }).eq('id', setId)
  }

  const togglePresent = (athleteId) => {
    modifie()
    setPresentIds(prev => {
      const next = new Set(prev)
      if (next.has(athleteId)) next.delete(athleteId)
      else next.add(athleteId)
      return next
    })
  }

  useEffect(() => {
    etatRef.current = { exerciseNotes, coachDifficulty, coachNote, presentIds, title: session?.title }
  })

  // Les écritures passent l'une après l'autre : deux upserts simultanés du même passage pourraient
  // créer puis supprimer des présences dans le désordre.
  const enregistrerPassage = () => {
    const tache = chaineRef.current.then(async () => {
      const { exerciseNotes: notes, coachDifficulty: diff, coachNote: noteSeance, presentIds: presents, title } = etatRef.current
      const coachId = await getCoachId()
      const { data: run, error } = await supabase.from('group_session_runs')
        .upsert({
          id: runIdRef.current || undefined,
          group_id: groupId, coach_id: coachId, source_session_id: sessionId,
          title: title || 'Séance', date: runDate,
          exercise_notes: notes, coach_difficulty: diff, coach_note: (noteSeance || '').trim() || null,
        }, { onConflict: 'group_id,source_session_id,date' })
        .select().single()
      if (error || !run) throw new Error(error?.message || 'échec')
      runIdRef.current = run.id
      setRunId(run.id)

      const { data: existingAtt } = await supabase.from('group_session_attendance').select('athlete_id').eq('run_id', run.id)
      const existingIds = new Set((existingAtt || []).map(a => a.athlete_id))
      const toAdd = [...presents].filter(id => !existingIds.has(id))
      const toRemove = [...existingIds].filter(id => !presents.has(id))
      if (toAdd.length) await supabase.from('group_session_attendance').insert(toAdd.map(athlete_id => ({ run_id: run.id, athlete_id })))
      if (toRemove.length) await supabase.from('group_session_attendance').delete().eq('run_id', run.id).in('athlete_id', toRemove)
      return run
    })
    chaineRef.current = tache.catch(() => {})
    return tache
  }

  useEffect(() => {
    if (!modifs) return
    enAttenteRef.current = true
    const t = setTimeout(() => {
      enAttenteRef.current = false
      enregistrerPassage().then(() => setAutoEtat('ok'), () => setAutoEtat('erreur'))
    }, 1200)
    return () => clearTimeout(t)
  }, [modifs]) // eslint-disable-line react-hooks/exhaustive-deps

  // Départ de la page pendant le délai : on écrit tout de suite ce qui restait en attente.
  useEffect(() => () => { if (enAttenteRef.current) enregistrerPassage().catch(() => {}) }, []) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const avantDepart = (e) => { if (enAttenteRef.current) { enregistrerPassage().catch(() => {}); e.preventDefault(); e.returnValue = '' } }
    window.addEventListener('beforeunload', avantDepart)
    return () => window.removeEventListener('beforeunload', avantDepart)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100svh', color: 'var(--text3)' }}>Chargement…</div>
  )

  const circuits = session?.circuits || []

  const content = (
    <div style={{ maxWidth: 640, margin: '0 auto', minHeight: runningTimer ? undefined : '100svh', background: 'var(--bg2)', paddingBottom: 60 }}>
      <div style={{ background: 'var(--bg)', borderBottom: '1px solid var(--border)', padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 10, position: 'sticky', top: 0, zIndex: 10 }}>
        <button onClick={() => router.push(`/groups/${groupId}`)} style={{ background: 'none', border: 'none', fontSize: 22, color: 'var(--text2)', cursor: 'pointer', padding: '2px 4px', lineHeight: 1, flexShrink: 0 }}>←</button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: 'var(--font-title)', color: 'var(--title)', fontWeight: 700, fontSize: 17, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{session?.title || 'Séance'}</div>
          <div style={{ fontSize: 11, color: 'var(--text3)' }}>
            {group?.name} · {new Date(runDate + 'T00:00:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })}
            {isPast && ' · modification'}
          </div>
        </div>
        {session?.timer_config && (
          <button onClick={() => { unlockAudio(); unlockSpeech(); setRunningTimer({ config: session.timer_config, label: session.title || 'Timer de la séance' }) }}
            title="Lancer le timer de la séance"
            style={{ background: 'var(--green-light)', color: 'var(--green)', border: '1px solid #B8EAD8', borderRadius: 'var(--r)', padding: '6px 12px', fontSize: 13, fontWeight: 700, flexShrink: 0, cursor: 'pointer' }}>
            ▶⏱ Séance
          </button>
        )}
      </div>

      <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>

        {/* Présence */}
        <div style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 'var(--rl)', padding: 14 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: 10 }}>
            <UsersThree size={11} style={{ verticalAlign: -1, marginRight: 4 }} />Présents ({presentIds.size}/{members.length})
          </div>
          {members.length === 0 ? (
            <div style={{ fontSize: 13, color: 'var(--text3)', fontStyle: 'italic' }}>Aucun membre dans ce groupe</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {members.map(m => {
                const present = presentIds.has(m.id)
                return (
                  <label key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', borderRadius: 'var(--r)', border: present ? '1.5px solid var(--green)' : '1px solid var(--border)', background: present ? 'var(--green-light)' : 'var(--bg2)', cursor: 'pointer' }}>
                    <input type="checkbox" checked={present} onChange={() => togglePresent(m.id)} style={{ accentColor: 'var(--green)', width: 16, height: 16 }} />
                    <span style={{ fontSize: 14, fontWeight: 600, color: present ? 'var(--green)' : 'var(--text)' }}>{m.name}</span>
                  </label>
                )
              })}
            </div>
          )}
        </div>

        {/* Contenu de la séance */}
        {exercises.map(exo => (
          <div key={exo.id} style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 'var(--rl)', padding: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <span style={{ fontWeight: 700, fontSize: 14, flex: 1 }}>{exo.name}</span>
              <button onClick={() => { unlockAudio(); unlockSpeech(); exo.timer_config ? setRunningTimer({ config: exo.timer_config, label: `Timer ${exo.name || ''}` }) : setShowTimer({}) }}
                style={{ background: 'var(--green-light)', color: 'var(--green)', border: '1px solid #B8EAD8', borderRadius: 'var(--r)', padding: '4px 10px', fontSize: 13, fontWeight: 700, flexShrink: 0, cursor: 'pointer' }}>
                {exo.timer_config ? '▶⏱' : '⏱'}
              </button>
            </div>
            <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 8, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              {exo.sets && <span>{exo.sets} séries</span>}
              {exo.reps && <span>{exo.reps} reps</span>}
              {exo.kg && <span>{exo.kg} kg</span>}
              {exo.rest && <span>récup {exo.rest}</span>}
            </div>
            {exo.note && <div style={{ fontSize: 12, color: 'var(--text2)', fontStyle: 'italic', marginBottom: 8 }}>{exo.note}</div>}
            <textarea placeholder="Note perso (visible uniquement par toi)…" value={exerciseNotes[`exercise:${exo.id}`] || ''}
              onChange={e => { setExerciseNotes(prev => ({ ...prev, [`exercise:${exo.id}`]: e.target.value })); modifie() }}
              rows={2} style={{ ...inp, resize: 'vertical' }} />

            {presentIds.size > 0 && (
              <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px dashed var(--border)', display: 'flex', flexDirection: 'column', gap: 10 }}>
                {members.filter(m => presentIds.has(m.id)).map(m => {
                  const sets = athleteSets[m.id]?.[exo.id] || []
                  return (
                    <div key={m.id}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text2)', marginBottom: 4 }}>{m.name}</div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        {sets.map((s, i) => (
                          <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '4px 8px', background: 'var(--bg2)', borderRadius: 'var(--r)' }}>
                            <span style={{ fontSize: 10, color: 'var(--text3)', width: 14, flexShrink: 0 }}>{i + 1}</span>
                            <CompactStepper value={s.reps_done} suffix=" reps" step={1}
                              onChange={v => updateSet(m.id, exo.id, s.id, 'reps_done', Math.max(0, Math.round(v)))} />
                            <CompactStepper value={s.kg_done} suffix=" kg" step={2.5} decimal
                              onChange={v => updateSet(m.id, exo.id, s.id, 'kg_done', Math.max(0, v))} />
                            {prefilledSetIds.has(s.id) && <span style={{ fontSize: 10, color: 'var(--text3)', fontStyle: 'italic' }}>· pré-rempli</span>}
                          </div>
                        ))}
                        <button type="button" onClick={() => addSet(m.id, exo.id)} style={{
                          alignSelf: 'flex-start', border: '1px dashed var(--green)', color: 'var(--green)', background: 'none',
                          borderRadius: 'var(--r)', padding: '4px 10px', fontSize: 11, fontWeight: 600, cursor: 'pointer',
                        }}>
                          + Ajouter une série
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        ))}

        {circuits.map(c => (
          <div key={c.id} style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 'var(--rl)', padding: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <span style={{ fontWeight: 700, fontSize: 14, flex: 1, display: 'flex', alignItems: 'center', gap: 5 }}><Lightning size={13} /> {c.name || 'Circuit'}</span>
              {c.timer && (
                <button onClick={() => { unlockAudio(); unlockSpeech(); setRunningTimer({ config: c.timer, label: c.name || 'Circuit' }) }}
                  style={{ background: '#4338CA', color: '#fff', border: 'none', borderRadius: 'var(--r)', padding: '4px 10px', fontSize: 12, fontWeight: 700, flexShrink: 0, cursor: 'pointer' }}>
                  ▶⏱ Timer
                </button>
              )}
            </div>
            {c.text && <div style={{ fontSize: 12, color: 'var(--text2)', whiteSpace: 'pre-wrap', marginBottom: 8 }}>{c.text}</div>}
            <textarea placeholder="Note perso (visible uniquement par toi)…" value={exerciseNotes[`circuit:${c.id}`] || ''}
              onChange={e => { setExerciseNotes(prev => ({ ...prev, [`circuit:${c.id}`]: e.target.value })); modifie() }}
              rows={2} style={{ ...inp, resize: 'vertical' }} />
          </div>
        ))}

        {/* Fin de séance */}
        <div style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 'var(--rl)', padding: 14 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: 10 }}>
            <FlagCheckered size={11} style={{ verticalAlign: -1, marginRight: 4 }} />Fin de séance (ton ressenti)
          </div>
          <div style={{ marginBottom: 10 }}>
            <div style={{ fontSize: 12, color: 'var(--text3)', fontWeight: 600, marginBottom: 6 }}>Difficulté ressentie pour le groupe (1-10)</div>
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
              {Array.from({ length: 10 }, (_, i) => i + 1).map(n => (
                <button key={n} onClick={() => { setCoachDifficulty(n); modifie() }} style={{
                  width: 30, height: 30, borderRadius: '50%', border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 700,
                  background: coachDifficulty === n ? 'var(--green)' : 'var(--bg2)', color: coachDifficulty === n ? '#fff' : 'var(--text2)',
                }}>{n}</button>
              ))}
            </div>
          </div>
          <textarea placeholder="Note libre sur la séance…" value={coachNote} onChange={e => { setCoachNote(e.target.value); modifie() }}
            rows={3} style={{ ...inp, resize: 'vertical' }} />
        </div>

        <div style={{ fontSize: 11, color: autoEtat === 'erreur' ? 'var(--red, #B91C1C)' : 'var(--text3)', textAlign: 'center' }}>
          {autoEtat === 'attente' ? 'Enregistrement…' : autoEtat === 'erreur' ? 'Échec de l\u2019enregistrement — vérifie ta connexion puis modifie un champ pour réessayer.' : autoEtat === 'ok' ? '✓ Enregistré automatiquement.' : 'Notes, présences et charges s\u2019enregistrent automatiquement.'}
        </div>
      </div>
    </div>
  )

  if (runningTimer) {
    return (
      <SplitTimerSession config={runningTimer.config} timerLabel={runningTimer.label} onClose={() => setRunningTimer(null)}>
        {content}
      </SplitTimerSession>
    )
  }

  return (
    <>
      {content}
      {showTimer && <TimerModal onClose={() => setShowTimer(null)} presetSeconds={showTimer.seconds} presetLabel={showTimer.label} />}
    </>
  )
}
