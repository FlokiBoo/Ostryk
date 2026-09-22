'use client'

import { useState, useEffect, use, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import {
  Lightning, Target, CalendarBlank, ClipboardText, PencilSimple, UsersThree, PushPin, Package,
  Trash, ArrowsClockwise, CheckCircle,
} from '@phosphor-icons/react'
import { supabase } from '@/lib/supabase'
import Link from 'next/link'
import AthletesSidebar from '@/app/components/AthletesSidebar'
import { getCoachId } from '@/lib/coach'
import { notifyAssigned } from '@/lib/notify'
import ActivityTypeSelect from '@/app/components/ActivityTypeSelect'

function today() {
  const n = new Date()
  return [n.getFullYear(), String(n.getMonth()+1).padStart(2,'0'), String(n.getDate()).padStart(2,'0')].join('-')
}

const PRIORITY_STYLES = {
  1: { bg: '#FEF2F2', border: '#FCA5A5', text: '#DC2626' },
  2: { bg: '#FFF7ED', border: '#FDBA74', text: '#C2410C' },
  3: { bg: '#EFF6FF', border: '#93C5FD', text: '#1D4ED8' },
}

function formatDateFr(date) {
  return new Date(date + 'T00:00:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })
}

export default function ProgramsPage({ params }) {
  return (
    <Suspense>
      <ProgramsPageInner params={params} />
    </Suspense>
  )
}

function ProgramsPageInner({ params }) {
  const { athleteId } = use(params)
  const router = useRouter()
  const searchParams = useSearchParams()
  const objectiveId = searchParams.get('objective')
  const [athlete, setAthlete] = useState(null)
  const [programs, setPrograms] = useState([])
  const [allAthletes, setAllAthletes] = useState([])
  const [newTitle, setNewTitle] = useState('')
  const [newAthleteIds, setNewAthleteIds] = useState([athleteId])
  const [showForm, setShowForm] = useState(false)
  const [creating, setCreating] = useState(false)
  const [loading, setLoading] = useState(true)
  const [assignModal, setAssignModal] = useState(null) // program being assigned
  const [alreadyAssignedIds, setAlreadyAssignedIds] = useState(new Set())
  const [selectedIds, setSelectedIds] = useState([])
  const [assignGroupId, setAssignGroupId] = useState(null)
  const [assigning, setAssigning] = useState(false)
  const [assignDone, setAssignDone] = useState(false)
  const [groups, setGroups] = useState([])
  const [newActivityType, setNewActivityType] = useState('Musculation 🏋️')
  const [selectedTypes, setSelectedTypes] = useState(new Set())
  const [typesInit, setTypesInit] = useState(false)
  const [objectives, setObjectives] = useState([])
  const [showArchived, setShowArchived] = useState(false)

  useEffect(() => {
    if (!assignModal) return
    supabase.from('programs').select('athlete_id').eq('source_program_id', assignModal.id)
      .then(({ data }) => setAlreadyAssignedIds(new Set((data || []).map(p => p.athlete_id))))
  }, [assignModal])

  useEffect(() => {
    async function load() {
      const [{ data: a }, { data: ps }, { data: aths }, { data: objs }, { data: grps }] = await Promise.all([
        supabase.from('athletes').select('*').eq('id', athleteId).single(),
        supabase.from('programs')
          .select('*, program_sessions(id)')
          .eq('athlete_id', athleteId)
          .order('created_at', { ascending: false }),
        supabase.from('athletes').select('id, name').neq('archived', true).order('created_at'),
        supabase.from('athlete_objectives').select('*').eq('athlete_id', athleteId).order('target_date'),
        supabase.from('groups').select('*, group_members(athlete_id)').order('name'),
      ])
      setAthlete(a)
      setPrograms(ps || [])
      setAllAthletes(aths || [])
      setObjectives(objs || [])
      setGroups(grps || [])
      if (!typesInit && (ps || []).length) {
        setSelectedTypes(new Set((ps || []).map(p => p.activity_type || 'Musculation 🏋️')))
        setTypesInit(true)
      }
      setLoading(false)
    }
    load()
  }, [athleteId])

  const toggleType = (t) => {
    setSelectedTypes(prev => {
      const next = new Set(prev)
      next.has(t) ? next.delete(t) : next.add(t)
      return next
    })
  }

  const toggleNewAthlete = (id) => {
    setNewAthleteIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
  }

  const createFreeSession = async () => {
    setCreating(true)
    const coachId = await getCoachId()
    const dateLabel = new Date().toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })
    const { data: prog, error } = await supabase.from('programs')
      .insert({ athlete_id: athleteId, title: `Séance libre — ${dateLabel}`, coach_id: coachId, objective_id: objectiveId || null })
      .select().single()
    if (!prog) { alert('Erreur : ' + (error?.message || 'impossible de créer la séance')); setCreating(false); return }
    const { data: sess } = await supabase.from('program_sessions')
      .insert({ program_id: prog.id, order_index: 0, title: 'Séance libre' })
      .select().single()
    router.push(sess ? `/programs/${athleteId}/${prog.id}/session/${sess.id}` : `/programs/${athleteId}/${prog.id}`)
  }

  const createProgram = async () => {
    if (!newTitle.trim() || newAthleteIds.length === 0) return
    setCreating(true)
    const coachId = await getCoachId()
    let firstId = null, firstProgId = null
    for (const aid of newAthleteIds) {
      const { data, error } = await supabase.from('programs')
        .insert({ athlete_id: aid, title: newTitle.trim(), coach_id: coachId, activity_type: newActivityType, objective_id: aid === athleteId ? (objectiveId || null) : null })
        .select().single()
      if (data) {
        await supabase.from('program_sessions')
          .insert({ program_id: data.id, order_index: 0, title: 'Séance 1' })
        if (!firstId) { firstId = aid; firstProgId = data.id }
      } else {
        alert('Erreur : ' + (error?.message || 'impossible de créer le programme'))
      }
    }
    if (firstId) router.push(`/programs/${firstId}/${firstProgId}`)
    else setCreating(false)
  }

  const deleteProgram = async (id) => {
    if (!confirm('Supprimer ce programme et toutes ses séances ?')) return

    const { data: sessions } = await supabase.from('program_sessions').select('id').eq('program_id', id)
    const sessionIds = (sessions || []).map(s => s.id)
    if (sessionIds.length) {
      const { data: exos } = await supabase.from('program_exercises').select('id').in('program_session_id', sessionIds)
      const exoIds = (exos || []).map(e => e.id)
      if (exoIds.length) {
        await supabase.from('exercise_performance_history').delete().in('program_exercise_id', exoIds)
        await supabase.from('program_exercise_logs').delete().in('program_exercise_id', exoIds)
        await supabase.from('program_exercises').delete().in('id', exoIds)
      }
      await supabase.from('program_completions').delete().in('program_session_id', sessionIds)
      await supabase.from('program_sessions').delete().in('id', sessionIds)
    }

    const { error } = await supabase.from('programs').delete().eq('id', id)
    if (error) { alert('Erreur : ' + error.message); return }
    setPrograms(prev => prev.filter(p => p.id !== id))
  }

  const togglePinned = async (p) => {
    const next = p.pinned_board === false ? true : false
    await supabase.from('programs').update({ pinned_board: next }).eq('id', p.id)
    setPrograms(prev => prev.map(x => x.id === p.id ? { ...x, pinned_board: next } : x))
  }

  const toggleArchived = async (p) => {
    const next = !p.archived
    await supabase.from('programs').update({ archived: next }).eq('id', p.id)
    setPrograms(prev => prev.map(x => x.id === p.id ? { ...x, archived: next } : x))
  }

  const openAssign = (p) => {
    setAssignModal(p)
    setSelectedIds([])
    setAssignGroupId(null)
    setAssignDone(false)
  }

  const toggleAthlete = (id) => {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
    setAssignGroupId(null)
  }

  const toggleGroupSelect = (g) => {
    const memberIds = g.group_members.map(m => m.athlete_id)
    const allSelected = memberIds.length > 0 && memberIds.every(id => selectedIds.includes(id))
    if (allSelected) {
      setSelectedIds(prev => prev.filter(id => !memberIds.includes(id)))
      setAssignGroupId(null)
    } else {
      setSelectedIds(prev => [...new Set([...prev, ...memberIds])])
      setAssignGroupId(g.id)
    }
  }

  const assignProgram = async () => {
    if (!selectedIds.length || !assignModal) return
    setAssigning(true)
    const coachId = await getCoachId()
    const batchId = crypto.randomUUID()

    // Charger le programme complet avec sessions et exercices
    const { data: sessions } = await supabase
      .from('program_sessions')
      .select('*, program_exercises(*)')
      .eq('program_id', assignModal.id)
      .order('order_index')

    for (const targetId of selectedIds) {
      // Créer le programme pour cet athlète
      const { data: newProg } = await supabase.from('programs')
        .insert({
          athlete_id: targetId, title: assignModal.title, coach_id: coachId, source_program_id: assignModal.id,
          activity_type: assignModal.activity_type, group_id: assignGroupId, group_batch_id: batchId,
          // Le conseil de rythme doit suivre la copie, sinon il reste invisible du sportif.
          recommended_sessions_per_week: assignModal.recommended_sessions_per_week ?? null,
          min_hours_between_sessions: assignModal.min_hours_between_sessions ?? null,
        })
        .select().single()
      if (!newProg) continue

      for (const sess of (sessions || [])) {
        const { data: newSess } = await supabase.from('program_sessions')
          .insert({
            program_id: newProg.id, order_index: sess.order_index, title: sess.title || '', source_session_id: sess.id,
            activation: sess.activation, coach_notes: sess.coach_notes, activation_videos: sess.activation_videos || [], circuits: sess.circuits || [],
            session_type: sess.session_type || null, recurring_daily_target: sess.recurring_daily_target ?? null,
            week_number: sess.week_number, day_of_week: sess.day_of_week ?? null, hidden_until_run: !!sess.hidden_until_run,
          })
          .select().single()
        if (!newSess) continue

        const exos = (sess.program_exercises || []).sort((a, b) => a.order_index - b.order_index)
        if (exos.length > 0) {
          await supabase.from('program_exercises').insert(
            exos.map(e => ({
              program_session_id: newSess.id,
              order_index: e.order_index,
              name: e.name,
              sets: e.sets,
              reps: e.reps,
              kg: e.kg,
              rest: e.rest,
              note: e.note,
              materiel: e.materiel || null,
              video_url: e.video_url,
              superset_group: e.superset_group,
              focus_muscles: e.focus_muscles,
              pace_base: e.pace_base,
              pct_low: e.pct_low,
              pct_high: e.pct_high,
              source_exercise_id: e.id,
            }))
          )
        }
      }
    }

    notifyAssigned({ athleteIds: selectedIds, kind: 'program', title: assignModal.title })
    setAssigning(false)
    setAssignDone(true)
  }

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100svh', color: 'var(--text3)' }}>Chargement…</div>
  )

  const activeObjective = objectives.find(o => o.id === objectiveId)
  const scopedPrograms = objectiveId ? programs.filter(p => p.objective_id === objectiveId) : programs
  const visiblePrograms = scopedPrograms.filter(p => !p.archived)
  const archivedPrograms = scopedPrograms.filter(p => p.archived)
  const otherObjectives = objectives.filter(o => o.id !== objectiveId)

  return (
    <div className="coach-layout" style={{ background: 'var(--bg2)' }}>
      <AthletesSidebar athleteId={athleteId} date={today()} />
      <div className="coach-main" style={{ paddingBottom: 40 }}>

        {/* Header */}
        <div style={{ background: 'var(--bg)', borderBottom: '1px solid var(--border)', padding: '14px 16px', position: 'sticky', top: 0, zIndex: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 2 }}>
            <Link href={`/semaine/${athleteId}/${today()}`} style={{ fontSize: 22, color: 'var(--text2)', textDecoration: 'none' }}>←</Link>
            <div style={{ flex: 1 }}>
              <div style={{ fontFamily: 'var(--font-title)', color: 'var(--title)', fontWeight: 700, fontSize: 18 }}>{athlete?.name}</div>
              <div style={{ fontSize: 11, color: 'var(--text3)' }}>Programmes d'entraînement</div>
            </div>
            <button onClick={createFreeSession} disabled={creating} style={{ background: 'var(--bg2)', border: '1px solid var(--border2)', color: 'var(--text2)', borderRadius: 20, padding: '7px 14px', fontSize: 13, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5 }}>
              <Lightning size={13} /> Séance libre
            </button>
            <button onClick={() => setShowForm(v => !v)} style={{ background: 'var(--green)', color: '#fff', border: 'none', borderRadius: 20, padding: '7px 14px', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
              {objectiveId ? '+ Micro-cycle' : '+ Programme'}
            </button>
          </div>
        </div>

        <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>

          {objectiveId && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {activeObjective ? (() => {
                const style = PRIORITY_STYLES[activeObjective.priority] || PRIORITY_STYLES[2]
                return (
                  <div style={{ background: style.bg, border: `1px solid ${style.border}`, borderRadius: 'var(--rl)', padding: '12px 14px' }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: style.text, textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: 2, display: 'flex', alignItems: 'center', gap: 4 }}><Target size={11} /> Objectif</div>
                    <div style={{ fontWeight: 800, fontSize: 16, color: style.text }}>{activeObjective.text}</div>
                    {activeObjective.target_date && (
                      <div style={{ fontSize: 12, color: style.text, marginTop: 2, opacity: 0.85, display: 'flex', alignItems: 'center', gap: 4 }}><CalendarBlank size={11} /> {formatDateFr(activeObjective.target_date)}</div>
                    )}
                  </div>
                )
              })() : (
                <div style={{ color: 'var(--text3)', fontSize: 13, fontStyle: 'italic' }}>Objectif introuvable</div>
              )}

              {otherObjectives.length > 0 && (
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  <button onClick={() => router.push(`/programs/${athleteId}`)} style={{ background: 'var(--bg2)', border: '1px solid var(--border2)', color: 'var(--text2)', borderRadius: 20, padding: '5px 12px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                    Tous les programmes
                  </button>
                  {otherObjectives.map(o => (
                    <button key={o.id} onClick={() => router.push(`/programs/${athleteId}?objective=${o.id}`)} style={{ background: 'var(--bg2)', border: '1px solid var(--border2)', color: 'var(--text3)', borderRadius: 20, padding: '5px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {o.text}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {showForm && (
            <div style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 'var(--rl)', padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
              <input
                autoFocus
                placeholder={objectiveId ? 'Nom du micro-cycle (ex: Base aérobie)' : 'Nom du programme (ex: Prise de masse 8 semaines)'}
                value={newTitle}
                onChange={e => setNewTitle(e.target.value)}
                style={{ padding: '10px 12px', border: '1px solid var(--border2)', borderRadius: 'var(--r)', fontSize: 14, outline: 'none', background: 'var(--bg2)', color: 'var(--text)' }}
              />
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: 6 }}>Activité</div>
                <ActivityTypeSelect value={newActivityType} onChange={setNewActivityType} />
              </div>
              {!objectiveId && (
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.4px' }}>Assigner à</div>
                    <button type="button" onClick={() => setNewAthleteIds(newAthleteIds.length === allAthletes.length ? [] : allAthletes.map(a => a.id))}
                      style={{ background: 'none', border: 'none', fontSize: 12, fontWeight: 600, color: 'var(--green)', cursor: 'pointer', padding: 0 }}>
                      {newAthleteIds.length === allAthletes.length ? 'Tout décocher' : 'Tout cocher'}
                    </button>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                    {allAthletes.map(a => (
                      <label key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', borderRadius: 'var(--r)', border: newAthleteIds.includes(a.id) ? '1.5px solid var(--green)' : '1px solid var(--border)', background: newAthleteIds.includes(a.id) ? 'var(--green-light)' : 'var(--bg2)', cursor: 'pointer' }}>
                        <input type="checkbox" checked={newAthleteIds.includes(a.id)} onChange={() => toggleNewAthlete(a.id)}
                          style={{ accentColor: 'var(--green)', width: 15, height: 15 }} />
                        <span style={{ fontSize: 13, fontWeight: 600, color: newAthleteIds.includes(a.id) ? 'var(--green)' : 'var(--text)' }}>{a.name}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={createProgram} disabled={creating || !newTitle.trim() || newAthleteIds.length === 0}
                  style={{ flex: 1, background: newTitle.trim() && newAthleteIds.length ? 'var(--green)' : 'var(--border)', color: '#fff', border: 'none', borderRadius: 'var(--r)', padding: '10px', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
                  {creating ? '…' : objectiveId ? 'Créer le micro-cycle' : newAthleteIds.length > 1 ? `Créer pour ${newAthleteIds.length} clients` : 'Créer'}
                </button>
                <button onClick={() => { setShowForm(false); setNewAthleteIds([athleteId]) }}
                  style={{ background: 'var(--bg2)', color: 'var(--text2)', border: '1px solid var(--border2)', borderRadius: 'var(--r)', padding: '10px 16px', fontSize: 14, cursor: 'pointer' }}>
                  Annuler
                </button>
              </div>
            </div>
          )}

          {visiblePrograms.length === 0 && !showForm ? (
            <div style={{ textAlign: 'center', color: 'var(--text3)', padding: '60px 20px', border: '1px dashed var(--border2)', borderRadius: 'var(--rl)', background: 'var(--bg)' }}>
              <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 12 }}><ClipboardText size={36} /></div>
              <div style={{ fontWeight: 600, marginBottom: 6 }}>Aucun programme</div>
              <div style={{ fontSize: 13 }}>Crée un programme structuré pour {athlete?.name}</div>
            </div>
          ) : (() => {
            const allTypes = [...new Set(visiblePrograms.map(p => p.activity_type || 'Musculation 🏋️'))]
            const visibleTypes = allTypes.filter(t => selectedTypes.has(t))
            return (
              <>
                {allTypes.length > 1 && (
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {allTypes.map(t => (
                      <button
                        key={t}
                        onClick={() => toggleType(t)}
                        style={{
                          background: selectedTypes.has(t) ? 'var(--green)' : 'var(--bg2)',
                          color: selectedTypes.has(t) ? '#fff' : 'var(--text2)',
                          border: selectedTypes.has(t) ? 'none' : '1px solid var(--border2)',
                          borderRadius: 20, padding: '6px 14px', fontSize: 13, fontWeight: 700, cursor: 'pointer',
                        }}
                      >
                        {t}
                      </button>
                    ))}
                  </div>
                )}

                {visibleTypes.length === 0 ? (
                  <div style={{ textAlign: 'center', color: 'var(--text3)', padding: '30px 20px', fontSize: 13 }}>
                    Sélectionne au moins une catégorie ci-dessus
                  </div>
                ) : (
                  <div style={{
                    display: 'grid', gridTemplateColumns: `repeat(${visibleTypes.length}, minmax(240px, 1fr))`,
                    gap: 12, overflowX: 'auto', alignItems: 'start',
                  }}>
                    {visibleTypes.map(type => {
                      const typePrograms = visiblePrograms.filter(p => (p.activity_type || 'Musculation 🏋️') === type)
                      return (
                        <div key={type} style={{ display: 'flex', flexDirection: 'column', gap: 8, minWidth: 0 }}>
                          {allTypes.length > 1 && (
                            <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--text2)' }}>{type}</div>
                          )}
                          {typePrograms.length === 0 && (
                            <div style={{ fontSize: 12, color: 'var(--text3)', fontStyle: 'italic' }}>Aucun programme</div>
                          )}
                          {typePrograms.map(p => (
                            <div key={p.id} style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 'var(--rl)', overflow: 'hidden' }}>
                              <Link href={`/programs/${athleteId}/${p.id}`} style={{ display: 'block', padding: '14px 16px', textDecoration: 'none', color: 'inherit' }}>
                                <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 4 }}>{p.title}</div>
                                <div style={{ fontSize: 12, color: 'var(--text3)' }}>
                                  {(p.program_sessions || []).length} séance{(p.program_sessions || []).length !== 1 ? 's' : ''}
                                </div>
                              </Link>
                              <div style={{ borderTop: '1px solid var(--border)', padding: '8px 16px', display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                                <Link href={`/programs/${athleteId}/${p.id}`} style={{ fontSize: 12, fontWeight: 600, color: 'var(--green)', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 4 }}>
                                  <PencilSimple size={12} /> Modifier
                                </Link>
                                {allAthletes.length > 0 && (
                                  <button onClick={() => openAssign(p)} style={{ background: 'none', border: 'none', fontSize: 12, color: 'var(--text2)', cursor: 'pointer', padding: 0, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}>
                                    <UsersThree size={12} /> Assigner
                                  </button>
                                )}
                                <button
                                  onClick={() => togglePinned(p)}
                                  title={p.pinned_board === false ? 'Afficher dans le tableau de bord côte à côte' : 'Masquer du tableau de bord côte à côte'}
                                  style={{ background: 'none', border: 'none', fontSize: 12, color: p.pinned_board === false ? 'var(--text3)' : 'var(--green)', cursor: 'pointer', padding: 0, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}
                                >
                                  <PushPin size={12} weight={p.pinned_board === false ? 'regular' : 'fill'} /> {p.pinned_board === false ? 'Épingler' : 'Épinglé'}
                                </button>
                                <button onClick={() => toggleArchived(p)} style={{ background: 'none', border: 'none', fontSize: 12, color: 'var(--text2)', cursor: 'pointer', padding: 0, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}>
                                  <Package size={12} /> Archiver
                                </button>
                                <button onClick={() => deleteProgram(p.id)} style={{ background: 'none', border: 'none', fontSize: 12, color: '#DC2626', cursor: 'pointer', padding: 0, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}>
                                  <Trash size={12} /> Supprimer
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )
                    })}
                  </div>
                )}
              </>
            )
          })()}

          {archivedPrograms.length > 0 && (
            <div>
              <button onClick={() => setShowArchived(v => !v)} style={{ background: 'none', border: 'none', color: 'var(--text3)', fontSize: 13, fontWeight: 700, cursor: 'pointer', padding: '6px 0' }}>
                {showArchived ? '▲' : '▼'} Programmes archivés ({archivedPrograms.length})
              </button>
              {showArchived && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 6 }}>
                  {archivedPrograms.map(p => (
                    <div key={p.id} style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 'var(--rl)', overflow: 'hidden', opacity: 0.7 }}>
                      <Link href={`/programs/${athleteId}/${p.id}`} style={{ display: 'block', padding: '14px 16px', textDecoration: 'none', color: 'inherit' }}>
                        <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 4 }}>{p.title}</div>
                        <div style={{ fontSize: 12, color: 'var(--text3)' }}>
                          {(p.program_sessions || []).length} séance{(p.program_sessions || []).length !== 1 ? 's' : ''}
                        </div>
                      </Link>
                      <div style={{ borderTop: '1px solid var(--border)', padding: '8px 16px', display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                        <button onClick={() => toggleArchived(p)} style={{ background: 'none', border: 'none', fontSize: 12, color: 'var(--green)', cursor: 'pointer', padding: 0, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}>
                          <ArrowsClockwise size={12} /> Désarchiver
                        </button>
                        <button onClick={() => deleteProgram(p.id)} style={{ background: 'none', border: 'none', fontSize: 12, color: '#DC2626', cursor: 'pointer', padding: 0, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}>
                          <Trash size={12} /> Supprimer
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Modal assignation */}
      {assignModal && (
        <div onClick={() => setAssignModal(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 400, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: 'var(--bg)', borderRadius: 'var(--rl)', padding: 20, width: '100%', maxWidth: 380, boxShadow: '0 8px 40px rgba(0,0,0,0.2)' }}>
            <div style={{ fontFamily: 'var(--font-title)', color: 'var(--title)', fontWeight: 700, fontSize: 17, marginBottom: 4 }}>Assigner à d'autres clients</div>
            <div style={{ fontSize: 13, color: 'var(--text3)', marginBottom: 16 }}>
              "{assignModal.title}" sera copié pour chaque client sélectionné.
            </div>

            {assignDone ? (
              <div style={{ textAlign: 'center', padding: '20px 0' }}>
                <div style={{ display: 'flex', justifyContent: 'center', color: '#16A34A', marginBottom: 8 }}><CheckCircle size={32} /></div>
                <div style={{ fontWeight: 700, marginBottom: 4 }}>Programme assigné !</div>
                <div style={{ fontSize: 13, color: 'var(--text3)', marginBottom: 16 }}>
                  Une copie a été créée pour {selectedIds.length} client{selectedIds.length > 1 ? 's' : ''}.
                </div>
                <button onClick={() => setAssignModal(null)} style={{ background: 'var(--green)', color: '#fff', border: 'none', borderRadius: 'var(--r)', padding: '10px 24px', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
                  Fermer
                </button>
              </div>
            ) : (
              <>
                {groups.length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
                    {groups.map(g => {
                      const memberIds = g.group_members.map(m => m.athlete_id)
                      const allSelected = memberIds.length > 0 && memberIds.every(id => selectedIds.includes(id))
                      return (
                        <button key={g.id} type="button" onClick={() => toggleGroupSelect(g)} disabled={memberIds.length === 0}
                          style={{
                            background: allSelected ? 'var(--green)' : 'var(--bg2)', color: allSelected ? '#fff' : 'var(--text2)',
                            border: allSelected ? 'none' : '1px solid var(--border2)', borderRadius: 20, padding: '6px 12px',
                            fontSize: 12, fontWeight: 700, cursor: memberIds.length === 0 ? 'default' : 'pointer', opacity: memberIds.length === 0 ? 0.5 : 1,
                          }}>
                          <UsersThree size={12} style={{ verticalAlign: -2, marginRight: 4 }} />{g.name} ({memberIds.length})
                        </button>
                      )
                    })}
                  </div>
                )}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 16, maxHeight: 260, overflowY: 'auto' }}>
                  {allAthletes.map(a => (
                    <label key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 'var(--r)', border: selectedIds.includes(a.id) ? '1.5px solid var(--green)' : '1px solid var(--border)', background: selectedIds.includes(a.id) ? 'var(--green-light)' : 'var(--bg2)', cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={selectedIds.includes(a.id)}
                        onChange={() => toggleAthlete(a.id)}
                        style={{ accentColor: 'var(--green)', width: 16, height: 16 }}
                      />
                      <span style={{ flex: 1, fontSize: 14, fontWeight: 600, color: selectedIds.includes(a.id) ? 'var(--green)' : 'var(--text)' }}>{a.name}</span>
                      {alreadyAssignedIds.has(a.id) && (
                        <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text3)', background: 'var(--bg)', border: '1px solid var(--border2)', borderRadius: 20, padding: '2px 8px', flexShrink: 0 }}>
                          ✓ Déjà assigné
                        </span>
                      )}
                    </label>
                  ))}
                </div>

                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    onClick={assignProgram}
                    disabled={assigning || selectedIds.length === 0}
                    style={{ flex: 1, background: selectedIds.length ? 'var(--green)' : 'var(--border)', color: '#fff', border: 'none', borderRadius: 'var(--r)', padding: '11px', fontSize: 14, fontWeight: 700, cursor: selectedIds.length ? 'pointer' : 'default' }}
                  >
                    {assigning ? 'Assignation…' : `Assigner à ${selectedIds.length || '—'} client${selectedIds.length > 1 ? 's' : ''}`}
                  </button>
                  <button onClick={() => setAssignModal(null)} style={{ background: 'var(--bg2)', color: 'var(--text2)', border: '1px solid var(--border2)', borderRadius: 'var(--r)', padding: '11px 16px', fontSize: 14, cursor: 'pointer' }}>
                    Annuler
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
