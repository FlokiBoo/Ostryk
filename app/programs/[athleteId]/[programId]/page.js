'use client'

import { useState, useEffect, useRef, use, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import Link from 'next/link'
import AthletesSidebar from '@/app/components/AthletesSidebar'
import ObjectivesBlock from '@/app/components/ObjectivesBlock'
import { buildKnownRaces } from '@/lib/raceEstimates'
import { WEEK_DAYS } from '@/lib/weekDays'
import { setUnsavedChanges, guardNavigation } from '@/lib/unsavedChanges'
import { SortableGroup, SortableItem, DragHandle } from '@/app/components/SortableItem'
import { DndContext, useDraggable, useDroppable, PointerSensor, useSensor, useSensors, closestCenter } from '@dnd-kit/core'
import { getCoachId } from '@/lib/coach'
import { cloneTemplateToAthlete } from '@/lib/programTemplates'
import ActivityTypeSelect from '@/app/components/ActivityTypeSelect'
import { notifyAssigned, notifyProgramAvailable } from '@/lib/notify'
import SessionBlockEditor from '@/app/components/SessionBlockEditor'
import {
  ClipboardText, CalendarBlank, Trash, UsersThree, Repeat,
  CopySimple, ArrowsOutCardinal, Barbell, Heartbeat, Columns, X,
} from '@phosphor-icons/react'

function today() {
  const n = new Date()
  return [n.getFullYear(), String(n.getMonth()+1).padStart(2,'0'), String(n.getDate()).padStart(2,'0')].join('-')
}

const PROGRAM_LEVELS = ['Débutant', 'Intermédiaire', 'Avancé']


function emptyExo(order) {
  return { _key: Date.now() + Math.random(), order_index: order, name: '', sets: '', reps: '', kg: '', rest: '', note: '', video_url: '', focus_muscles: '', pace_base: null, pct_low: '', pct_high: '' }
}

// Vue calendrier Semaine/Jour : seul point d'entrée pour parcourir/ouvrir les séances du
// programme — cliquer une case navigue vers sa page séance (SessionBlockEditor).
// Case cible du glisser-déposer (une par jour de programme) — le fond se surligne quand une
// séance est glissée au-dessus, pour indiquer où elle atterrira.
function DayCell({ children, isOver, setNodeRef, borderLeft }) {
  return (
    <div ref={setNodeRef} style={{
      display: 'flex', flexDirection: 'column', gap: 6, minHeight: 180, padding: 10,
      borderLeft, background: isOver ? 'var(--green-light)' : undefined, transition: 'background 0.1s',
    }}>
      {children}
    </div>
  )
}

// Séance sélectionnable/dupliquable/déplaçable, utilisée à la fois dans les cases du calendrier et
// dans la liste "Non planifiées". Trois contrôles distincts côte à côte (checkbox, dupliquer,
// poignée ⊕) plutôt qu'une puce entièrement "draggable" — même principe que SortableItem/DragHandle
// ailleurs dans l'app : seule la poignée porte les listeners de glisser, le reste (case à cocher,
// titre cliquable) reste utilisable normalement sans ambiguïté clic/glisser.
function SessionChip({ s, selected, onToggleSelect, onOpen, onDuplicate, compact }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: s.id })
  const style = {
    transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 50 : undefined,
  }
  const color = selected ? '#fff' : 'var(--green)'
  return (
    <div ref={setNodeRef} style={{
      display: 'flex', alignItems: 'center', gap: 4, position: 'relative',
      background: selected ? 'var(--green)' : 'var(--green-light)',
      border: '1px solid var(--green)', color,
      borderRadius: compact ? 20 : 'var(--r)', padding: compact ? '3px 6px 3px 10px' : '5px 6px 5px 8px',
      fontSize: compact ? 11 : 14, fontWeight: 700, lineHeight: 1.25,
      ...style,
    }}>
      <input type="checkbox" checked={selected} onChange={() => onToggleSelect(s.id)}
        style={{ accentColor: color, width: 13, height: 13, flexShrink: 0, cursor: 'pointer' }} />
      <button onClick={() => onOpen(s.id)} title={s.title || 'Séance'} style={{
        flex: 1, minWidth: 0, textAlign: 'left', background: 'none', border: 'none', padding: compact ? '2px 0' : '5px 2px',
        font: 'inherit', fontWeight: 'inherit', color: 'inherit', cursor: 'pointer',
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: compact ? 'nowrap' : 'normal', wordBreak: compact ? undefined : 'break-word',
      }}>
        {s.title || 'Séance'}
      </button>
      <button onClick={() => onDuplicate(s.id)} title="Dupliquer cette séance"
        style={{ background: 'none', border: 'none', padding: 3, display: 'flex', color: 'inherit', cursor: 'pointer', flexShrink: 0, opacity: 0.85 }}>
        <CopySimple size={compact ? 12 : 14} />
      </button>
      <span {...listeners} {...attributes} title="Maintenir puis glisser pour déplacer vers un autre jour"
        style={{ cursor: 'grab', touchAction: 'none', display: 'flex', flexShrink: 0, opacity: 0.85, padding: 3 }}>
        <ArrowsOutCardinal size={compact ? 12 : 14} />
      </span>
    </div>
  )
}

function WeekDayCell({ week, d, dayNumber, cellSessions, isFirstCol, selectedIds, onToggleSelect, onOpenSession, onAddAt, onAddFromWorkout, onDuplicateSession }) {
  const { isOver, setNodeRef } = useDroppable({ id: `${week}-${d.key}` })
  const [addMenuOpen, setAddMenuOpen] = useState(false)
  return (
    <DayCell isOver={isOver} setNodeRef={setNodeRef} borderLeft={isFirstCol ? 'none' : '1px solid var(--border)'}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 6, paddingBottom: 4 }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)', whiteSpace: 'nowrap' }}>Jour {dayNumber}</span>
        <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.4px', whiteSpace: 'nowrap' }}>{d.short}</span>
      </div>
      {cellSessions.map(s => (
        <SessionChip key={s.id} s={s} selected={selectedIds.has(s.id)} onToggleSelect={onToggleSelect} onOpen={onOpenSession} onDuplicate={onDuplicateSession} />
      ))}
      <div style={{ position: 'relative' }}>
        <button onClick={() => setAddMenuOpen(v => !v)} style={{
          width: '100%', background: 'transparent', border: '1px solid var(--border2)', color: 'var(--text3)',
          borderRadius: 'var(--r)', padding: '6px 4px', fontSize: 12, fontWeight: 600, cursor: 'pointer',
        }}>
          + Ajouter
        </button>
        {addMenuOpen && (
          <>
            <div onClick={() => setAddMenuOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 90 }} />
            <div style={{
              position: 'absolute', left: 0, top: '100%', marginTop: 4, width: 150, background: 'var(--bg)',
              border: '1px solid var(--border)', borderRadius: 'var(--r)', boxShadow: '0 8px 24px rgba(0,0,0,0.15)',
              zIndex: 100, padding: 4, display: 'flex', flexDirection: 'column', gap: 2,
            }}>
              <button onClick={() => { setAddMenuOpen(false); onAddAt(week, d.key, 'standard') }} style={{
                display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', borderRadius: 6, fontSize: 12,
                color: 'var(--text)', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', fontWeight: 600,
              }}>
                <Barbell size={13} /> Standard
              </button>
              <button onClick={() => { setAddMenuOpen(false); onAddAt(week, d.key, 'cardio') }} style={{
                display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', borderRadius: 6, fontSize: 12,
                color: 'var(--text)', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', fontWeight: 600,
              }}>
                <Heartbeat size={13} /> Cardio
              </button>
              <button onClick={() => { setAddMenuOpen(false); onAddFromWorkout(week, d.key) }} style={{
                display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', borderRadius: 6, fontSize: 12,
                color: 'var(--text)', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', fontWeight: 600,
              }}>
                <Barbell size={13} /> Depuis un workout
              </button>
            </div>
          </>
        )}
      </div>
    </DayCell>
  )
}

function WeekGrid({ sessions, durationWeeks, onAddAt, onAddFromWorkout, onOpenSession, onMoveSession, onDuplicateSession, selectedIds, onToggleSelect }) {
  const byCell = {}
  sessions.forEach(s => {
    if (s.week_number == null || s.day_of_week == null) return
    const key = `${s.week_number}-${s.day_of_week}`
    ;(byCell[key] = byCell[key] || []).push(s)
  })
  const unscheduled = sessions.filter(s => s.week_number == null || s.day_of_week == null)

  const weeks = Array.from({ length: durationWeeks }, (_, wi) => wi + 1)

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { delay: 200, tolerance: 6 } }))

  const handleDragEnd = (event) => {
    const { active, over } = event
    if (!over) return
    const [weekStr, dayStr] = String(over.id).split('-')
    const week = parseInt(weekStr, 10)
    const day = parseInt(dayStr, 10)

    const dragged = sessions.find(x => x.id === active.id)
    // Si la séance glissée fait partie d'une sélection multiple, on déplace tout le lot d'un coup
    // plutôt que la seule séance sous le pointeur.
    const idsToMove = selectedIds.has(active.id) && selectedIds.size > 1 ? [...selectedIds] : [active.id]

    // Décalage (en jours) entre la position d'origine de la séance saisie et la case cible, appliqué
    // aux autres séances du lot pour garder leur organisation relative (ex. Jour 1/Jour 2 -> Jour 4/
    // Jour 5 si on lâche Jour 2 sur Jour 5), plutôt que de toutes les empiler sur la même case.
    const hasOrigin = dragged && dragged.week_number != null && dragged.day_of_week != null
    const delta = hasOrigin ? ((week - 1) * 7 + day) - ((dragged.week_number - 1) * 7 + dragged.day_of_week) : 0
    const maxAbsDay = durationWeeks * 7 - 1

    idsToMove.forEach(id => {
      const s = sessions.find(x => x.id === id)
      if (!s) return
      let targetWeek, targetDay
      if (!hasOrigin || s.week_number == null || s.day_of_week == null) {
        // Pas de position d'origine à décaler (séance non planifiée, ou séance saisie elle-même non
        // planifiée) : atterrit exactement sur la case visée.
        targetWeek = week; targetDay = day
      } else {
        const abs = Math.min(maxAbsDay, Math.max(0, (s.week_number - 1) * 7 + s.day_of_week + delta))
        targetWeek = Math.floor(abs / 7) + 1
        targetDay = abs % 7
      }
      if (s.week_number !== targetWeek || s.day_of_week !== targetDay) onMoveSession(id, targetWeek, targetDay)
    })
  }

  return (
    <div style={{ margin: '12px 16px 0', display: 'flex', flexDirection: 'column', gap: 14 }}>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <div style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 'var(--rl)', overflow: 'hidden' }}>
          {weeks.map((week, wi) => (
            <div key={week} style={{
              display: 'grid', gridTemplateColumns: 'repeat(7, minmax(130px, 1fr))', overflowX: 'auto',
              borderTop: wi === 0 ? 'none' : '1px solid var(--border)',
            }}>
              {WEEK_DAYS.map((d, di) => {
                const dayNumber = (week - 1) * 7 + di + 1
                return (
                  <WeekDayCell key={d.key} week={week} d={d} dayNumber={dayNumber}
                    cellSessions={byCell[`${week}-${d.key}`] || []} isFirstCol={di === 0}
                    selectedIds={selectedIds} onToggleSelect={onToggleSelect}
                    onOpenSession={onOpenSession} onAddAt={onAddAt} onAddFromWorkout={onAddFromWorkout} onDuplicateSession={onDuplicateSession} />
                )
              })}
            </div>
          ))}
        </div>

        {unscheduled.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6, padding: '4px 2px' }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text3)' }}>Non planifiées :</span>
            {unscheduled.map(s => (
              <SessionChip key={s.id} s={s} compact selected={selectedIds.has(s.id)} onToggleSelect={onToggleSelect} onOpen={onOpenSession} onDuplicate={onDuplicateSession} />
            ))}
          </div>
        )}
      </DndContext>
    </div>
  )
}

export default function ProgramEditorPageWrapper({ params }) {
  return <Suspense><ProgramEditorPage params={params} /></Suspense>
}

function ProgramEditorPage({ params }) {
  const { athleteId, programId } = use(params)
  const router = useRouter()
  const searchParams = useSearchParams()
  const openFromUrl = searchParams.get('open')
  const [athlete, setAthlete] = useState(null)
  const [program, setProgram] = useState(null)
  const [sessions, setSessions] = useState([])
  const [movementMusclesMap, setMovementMusclesMap] = useState({})
  const [movementFocusGroupsMap, setMovementFocusGroupsMap] = useState({})
  const [loading, setLoading] = useState(true)
  const [pinnedSessions, setPinnedSessions] = useState(new Set())
  const [selectedSessionIds, setSelectedSessionIds] = useState(new Set())
  // Vue côte à côte : liste d'ids affichés en panneaux (SessionBlockEditor) plutôt que la simple
  // sélection ci-dessus, pour survivre à sa remise à zéro (ex: après une action sur la sélection).
  const [sideBySideIds, setSideBySideIds] = useState(null)
  const [addMenuOpen, setAddMenuOpen] = useState(false)
  const [duplicatingSelected, setDuplicatingSelected] = useState(false)
  const [titleSaving, setTitleSaving] = useState(false)

  // ?open=<id> : ancien lien profond vers le défunt éditeur plein écran — redirige vers la page
  // séance (SessionBlockEditor), seul éditeur de contenu restant.
  useEffect(() => {
    if (openFromUrl) router.replace(`/programs/${athleteId}/${programId}/session/${openFromUrl}`)
  }, [openFromUrl, athleteId, programId, router])

  const [objectives, setObjectives] = useState([])
  const [noteBlocks, setNoteBlocks] = useState([])
  const [raceKnown, setRaceKnown] = useState({})
  const [participants, setParticipants] = useState([])
  const [showAddParticipant, setShowAddParticipant] = useState(false)
  const [otherAthletes, setOtherAthletes] = useState([])
  const [addingParticipantId, setAddingParticipantId] = useState(null)
  const [removingParticipantId, setRemovingParticipantId] = useState(null)

  const isTemplate = athleteId === 'templates'
  // Un programme avec group_id est un "cycle d'entraînement" propre à un groupe (créé depuis
  // /groups/[groupId]) : il ne doit pas être proposable comme template en place (ça le retirerait
  // pas du groupe pour autant) — seule la duplication vers un programme indépendant a du sens ici.
  const isGroupCycle = isTemplate && !!program?.group_id
  const [otherTemplates, setOtherTemplates] = useState([])
  const [duplicatingAsProgram, setDuplicatingAsProgram] = useState(false)

  const duplicateGroupCycleAsProgram = async () => {
    if (!program) return
    setDuplicatingAsProgram(true)
    const coachId = await getCoachId()
    const copy = await cloneTemplateToAthlete({
      templateProgramId: programId, templateTitle: program.title, templateActivityType: program.activity_type,
      athleteId: null, coachId,
    })
    if (!copy) {
      setDuplicatingAsProgram(false)
      alert('Erreur lors de la duplication.')
      return
    }
    await supabase.from('programs').update({ is_template: true }).eq('id', copy.id)
    router.push(`/programs/templates/${copy.id}`)
  }

  useEffect(() => {
    if (!isTemplate) return
    supabase.from('programs').select('id, title').eq('is_template', true).neq('id', programId).order('title')
      .then(({ data }) => setOtherTemplates(data || []))
  }, [isTemplate, programId])

  // Sportifs ayant une copie de ce template (source_program_id) — sert au bandeau "suivi par N
  // sportifs" et à la liste de destinataires quand le coach lance la synchro.
  const [followers, setFollowers] = useState([])
  const [syncing, setSyncing] = useState(false)
  const [notifyOnSync, setNotifyOnSync] = useState(false)
  const [removingFollowerId, setRemovingFollowerId] = useState(null)
  const [showAddFollower, setShowAddFollower] = useState(false)
  const [otherAthletesForFollower, setOtherAthletesForFollower] = useState([])
  const [addFollowerSearch, setAddFollowerSearch] = useState('')
  const [addingFollowerId, setAddingFollowerId] = useState(null)
  const [togglingAvailable, setTogglingAvailable] = useState(false)

  useEffect(() => {
    if (!isTemplate) return
    supabase.from('programs').select('id, athlete_id, athletes(name)').eq('source_program_id', programId)
      .then(({ data }) => setFollowers(data || []))
  }, [isTemplate, programId])

  useEffect(() => {
    const rawPinned = localStorage.getItem(`coachpro_pinned_sessions_${programId}`)
    if (rawPinned) setPinnedSessions(new Set(JSON.parse(rawPinned)))
  }, [programId])

  const togglePinnedSession = (id) => {
    setPinnedSessions(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      localStorage.setItem(`coachpro_pinned_sessions_${programId}`, JSON.stringify([...next]))
      return next
    })
  }

  useEffect(() => {
    if (isTemplate || !athleteId) return
    supabase.from('tracked_movements').select('id, name, unit, tracked_movement_entries(value, athlete_id, date)')
      .then(({ data }) => {
        const movements = (data || []).map(m => ({
          ...m,
          entries: (m.tracked_movement_entries || []).filter(e => e.athlete_id === athleteId),
        }))
        setRaceKnown(buildKnownRaces(movements))
      })
  }, [athleteId, isTemplate])

  useEffect(() => {
    async function load() {
      const [{ data: a }, { data: prog }, { data: sess }] = await Promise.all([
        isTemplate ? Promise.resolve({ data: null }) : supabase.from('athletes').select('*').eq('id', athleteId).single(),
        supabase.from('programs').select('*').eq('id', programId).single(),
        supabase.from('program_sessions')
          .select('*, program_exercises(*)')
          .eq('program_id', programId)
          .order('order_index')
      ])
      setAthlete(a)
      setProgram(prog)

      if (!isTemplate && prog?.group_batch_id) {
        const { data: parts } = await supabase.from('programs')
          .select('id, athlete_id, athletes(name)')
          .eq('group_batch_id', prog.group_batch_id)
          .order('created_at')
        setParticipants(parts || [])
      }

      const hasExercises = (sess || []).some(s => (s.program_exercises || []).some(e => e.name))
      let movieMap = {}
      if (hasExercises) {
        // Bibliothèque récupérée en entier (petit volume) plutôt que filtrée par .in('name', …), qui
        // est sensible à la casse côté Postgres et raterait silencieusement un nom mal accordé.
        const { data: movs } = await supabase.from('movements').select('name, youtube_url, muscles, focus_groups')
        ;(movs || []).forEach(m => { movieMap[m.name.trim().toLowerCase()] = m.youtube_url })
        const musclesMap = {}
        ;(movs || []).forEach(m => { if (m.muscles) musclesMap[m.name.trim().toLowerCase()] = m.muscles })
        setMovementMusclesMap(musclesMap)
        const focusMap = {}
        ;(movs || []).forEach(m => { if (m.focus_groups) focusMap[m.name.trim().toLowerCase()] = m.focus_groups })
        setMovementFocusGroupsMap(focusMap)
      }

      const loaded = (sess || []).map(s => ({
        ...s,
        exercises: [...(s.program_exercises || [])]
          .sort((a, b) => a.order_index - b.order_index)
          .map(e => ({ ...e, _key: e.id, sets: e.sets ?? '', reps: e.reps ?? '', kg: e.kg ?? '', rest: e.rest ?? '', note: e.note ?? '', materiel: e.materiel ?? '', video_url: (movieMap[e.name?.trim().toLowerCase()] ?? e.video_url) || '', superset_group: e.superset_group || null, pct_low: e.pct_low ?? '', pct_high: e.pct_high ?? '' })),
        activation_videos: s.activation_videos || [],
        circuits: s.circuits || [],
      }))
      setSessions(loaded)

      if (!isTemplate && a) {
        const [{ data: objs }, { data: blocks }] = await Promise.all([
          supabase.from('athlete_objectives').select('*').eq('athlete_id', a.id).order('created_at'),
          supabase.from('athlete_note_blocks').select('*').eq('athlete_id', a.id).order('order_index'),
        ])
        setObjectives(objs || [])
        setNoteBlocks(blocks || [])
      }

      setLoading(false)
    }
    load()
  }, [athleteId, programId])

  const propagateSessionToClients = async (sessId, sessOrderIndex, fields, exos) => {
    const { data: clientPrograms } = await supabase.from('programs').select('id, athlete_id').eq('source_program_id', programId)
    if (!clientPrograms?.length) return

    for (const cp of clientPrograms) {
      let { data: clientSess } = await supabase.from('program_sessions')
        .select('id').eq('program_id', cp.id).eq('source_session_id', sessId).maybeSingle()

      if (!clientSess) {
        // Nouvelle séance côté template, jamais vue par ce client : on la crée
        const { data: created } = await supabase.from('program_sessions')
          .insert({ program_id: cp.id, order_index: sessOrderIndex, title: fields.title, source_session_id: sessId, session_type: fields.session_type || null, materiel: fields.materiel || null, day_of_week: fields.day_of_week ?? null, hidden_until_run: !!fields.hidden_until_run, warmup_content: fields.warmup_content ?? null, cooldown_content: fields.cooldown_content ?? null })
          .select().single()
        clientSess = created
        if (!clientSess) continue
      } else {
        // Séance déjà validée par ce sportif : on ne touche à rien (contenu + historique intacts)
        const { data: completion } = await supabase.from('program_completions')
          .select('program_session_id').eq('program_session_id', clientSess.id).maybeSingle()
        if (completion) continue

        await supabase.from('program_sessions').update({
          title: fields.title, activation: fields.activation,
          coach_notes: fields.coach_notes, activation_videos: fields.activation_videos,
          circuits: fields.circuits, session_type: fields.session_type || null,
          materiel: fields.materiel || null, day_of_week: fields.day_of_week ?? null, hidden_until_run: !!fields.hidden_until_run,
          warmup_content: fields.warmup_content ?? null, cooldown_content: fields.cooldown_content ?? null,
        }).eq('id', clientSess.id)
      }

      // Met à jour les exercices EN PLACE (par position) pour ne pas casser l'historique
      // lié à l'id de chaque exercice (program_exercise_logs, exercise_performance_history)
      const { data: existingExos } = await supabase.from('program_exercises')
        .select('id').eq('program_session_id', clientSess.id).order('order_index')
      const existing = existingExos || []
      const maxLen = Math.max(existing.length, exos.length)

      for (let j = 0; j < maxLen; j++) {
        const e = exos[j]
        if (e && existing[j]) {
          await supabase.from('program_exercises').update({
            order_index: j, name: e.name, sets: e.sets, reps: e.reps, kg: e.kg,
            rest: e.rest, note: e.note, materiel: e.materiel || null, video_url: e.video_url, superset_group: e.superset_group,
            focus_muscles: e.focus_muscles || null, timer_config: e.timer_config || null,
          }).eq('id', existing[j].id)
        } else if (e && !existing[j]) {
          await supabase.from('program_exercises').insert({
            program_session_id: clientSess.id, order_index: j, name: e.name,
            sets: e.sets, reps: e.reps, kg: e.kg, rest: e.rest, note: e.note, materiel: e.materiel || null,
            video_url: e.video_url, superset_group: e.superset_group,
            focus_muscles: e.focus_muscles || null, timer_config: e.timer_config || null,
          })
        } else if (!e && existing[j]) {
          await supabase.from('program_exercises').delete().eq('id', existing[j].id)
        }
      }
    }
  }
  // Déplacement par glisser-déposer dans la grille Jour 1→N : contrairement à updateSession (qui
  // ne fait que marquer "modifié" en attendant le clic sur Sauvegarder), ici on écrit tout de suite
  // en base — l'utilisateur s'attend à ce qu'un glisser-déposer soit persisté immédiatement.
  const moveSessionToDay = async (id, weekNumber, dayOfWeek) => {
    const needsSync = isTemplate && followers.length > 0
    setSessions(prev => prev.map(s => s.id === id
      ? { ...s, week_number: weekNumber, day_of_week: dayOfWeek, ...(needsSync ? { needs_sync: true } : {}) }
      : s))
    await supabase.from('program_sessions')
      .update({ week_number: weekNumber, day_of_week: dayOfWeek, ...(needsSync ? { needs_sync: true } : {}) })
      .eq('id', id)
  }

  const toggleSessionSelected = (id) => {
    setSelectedSessionIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const duplicateSelectedSessions = async () => {
    setDuplicatingSelected(true)
    let nextIdx = sessions.length
    for (const id of selectedSessionIds) {
      await duplicateSession(id, nextIdx, { skipOpen: true })
      nextIdx++
    }
    setSelectedSessionIds(new Set())
    setDuplicatingSelected(false)
  }

  const runSync = async () => {
    setSyncing(true)
    const pending = sessions.filter(s => s.needs_sync)
    for (const s of pending) {
      const sessFields = {
        title: s.title || '', activation: s.activation || null,
        coach_notes: s.coach_notes || null, activation_videos: s.activation_videos || [],
        circuits: s.circuits || [], session_type: s.session_type || null,
        materiel: s.materiel || null, day_of_week: s.day_of_week ?? null, hidden_until_run: !!s.hidden_until_run,
        warmup_content: s.warmup_content || null, cooldown_content: s.cooldown_content || null,
      recurring_daily_target: s.session_type === 'recurrent' ? (s.recurring_daily_target || 1) : null,
      }
      const exos = s.exercises.filter(e => e.name.trim()).map((e, j) => ({
        order_index: j, name: e.name.trim(),
        sets: e.sets !== '' ? parseInt(e.sets) : null, reps: e.reps || null,
        kg: e.kg !== '' && !isNaN(parseFloat(e.kg)) ? parseFloat(e.kg) : null,
        rest: e.rest || null, note: e.note || null, materiel: e.materiel || null, video_url: e.video_url || null,
        superset_group: e.superset_group || null, focus_muscles: e.focus_muscles || null,
        pace_base: e.pace_base || null,
        pct_low: e.pct_low !== '' && e.pct_low != null ? parseFloat(e.pct_low) : null,
        pct_high: e.pct_high !== '' && e.pct_high != null ? parseFloat(e.pct_high) : null,
        timer_config: e.timer_config || null,
      }))
      await propagateSessionToClients(s.id, s.order_index ?? 0, sessFields, exos)
      await supabase.from('program_sessions').update({ needs_sync: false }).eq('id', s.id)
    }
    setSessions(prev => prev.map(s => s.needs_sync ? { ...s, needs_sync: false } : s))

    if (notifyOnSync && followers.length > 0) {
      await notifyAssigned({ athleteIds: followers.map(f => f.athlete_id), kind: 'program_updated', title: program?.title || 'Programme' })
    }
    setSyncing(false)
  }

  const toggleProgramAvailable = async () => {
    if (!program) return
    const next = !program.available_to_clients
    setTogglingAvailable(true)
    setProgram(p => ({ ...p, available_to_clients: next }))
    const { error } = await supabase.from('programs').update({ available_to_clients: next }).eq('id', programId)
    setTogglingAvailable(false)
    if (error) {
      setProgram(p => ({ ...p, available_to_clients: !next }))
      alert('Erreur : ' + error.message)
      return
    }
    if (next) notifyProgramAvailable(programId)
  }

  // Retire la copie d'un sportif suiveur de ce template (même nettoyage en cascade que
  // removeParticipant/deleteWholeProgram, appliqué ici à une copie liée par source_program_id).
  const removeFollower = async (follower) => {
    if (!confirm(`Retirer ce programme de "${follower.athletes?.name || 'ce sportif'}" ? Sa copie et ses résultats seront supprimés.`)) return
    setRemovingFollowerId(follower.id)
    const { data: sess } = await supabase.from('program_sessions').select('id').eq('program_id', follower.id)
    const sessionIds = (sess || []).map(s => s.id)
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
    await supabase.from('programs').delete().eq('id', follower.id)
    setFollowers(prev => prev.filter(f => f.id !== follower.id))
    setRemovingFollowerId(null)
  }

  const openAddFollower = async () => {
    setShowAddFollower(true)
    setAddFollowerSearch('')
    const { data } = await supabase.from('athletes').select('id, name').neq('archived', true).order('name')
    const followerIds = new Set(followers.map(f => f.athlete_id))
    setOtherAthletesForFollower((data || []).filter(a => !followerIds.has(a.id)))
  }

  const addFollower = async (targetId) => {
    setAddingFollowerId(targetId)
    const coachId = await getCoachId()
    const copy = await cloneTemplateToAthlete({
      templateProgramId: programId, templateTitle: program.title, templateActivityType: program.activity_type,
      athleteId: targetId, coachId,
    })
    if (copy) {
      setFollowers(prev => [...prev, { id: copy.id, athlete_id: targetId, athletes: { name: otherAthletesForFollower.find(a => a.id === targetId)?.name } }])
      setOtherAthletesForFollower(prev => prev.filter(a => a.id !== targetId))
      notifyAssigned({ athleteIds: [targetId], kind: 'program', title: program.title })
    }
    setAddingFollowerId(null)
  }

  // Créée depuis une case de la grille Semaine/Jour (WeekGrid) : place directement la séance au
  // bon endroit plutôt que de la laisser "non planifiée" en bas de la liste par défaut. Ouvre
  // ensuite la nouvelle page séance (blocks) plutôt que l'ancien éditeur plein écran (setOpenId).
  const addSessionAt = async (weekNumber, dayOfWeek, mode = 'standard') => {
    const { data: s } = await supabase.from('program_sessions')
      .insert({ program_id: programId, order_index: sessions.length, title: '', week_number: weekNumber, day_of_week: dayOfWeek, activity_mode: mode })
      .select().single()
    if (s) router.push(`/programs/${athleteId}/${programId}/session/${s.id}`)
  }

  // Picker "Depuis un workout" (bouton + Ajouter d'une case du calendrier) : liste chargée à la
  // demande plutôt qu'au montage de la page, ces workouts ne servant qu'à cette action ponctuelle.
  const [workoutPickerFor, setWorkoutPickerFor] = useState(null) // { week, day } ou null
  const [availableWorkouts, setAvailableWorkouts] = useState([])
  const [loadingWorkouts, setLoadingWorkouts] = useState(false)

  const openWorkoutPicker = async (week, day) => {
    setWorkoutPickerFor({ week, day })
    setLoadingWorkouts(true)
    const { data } = await supabase.from('programs')
      .select('id, title, activity_type, program_sessions(id, title, program_exercises(id))')
      .eq('is_workout', true).order('created_at', { ascending: false })
    setAvailableWorkouts(data || [])
    setLoadingWorkouts(false)
  }

  const addSessionFromWorkout = async (workout) => {
    const { week, day } = workoutPickerFor
    const srcSessionId = workout.program_sessions?.[0]?.id
    setWorkoutPickerFor(null)
    if (!srcSessionId) return
    const { data: srcSession } = await supabase.from('program_sessions')
      .select('*, program_exercises(*)').eq('id', srcSessionId).single()
    if (!srcSession) return

    const { data: newSess } = await supabase.from('program_sessions')
      .insert({
        program_id: programId, order_index: sessions.length,
        title: srcSession.title || workout.title || '', week_number: week, day_of_week: day,
        activation: srcSession.activation || null, coach_notes: srcSession.coach_notes || null,
        activation_videos: srcSession.activation_videos || [], circuits: srcSession.circuits || [],
        warmup_block: srcSession.warmup_block || null, cooldown_block: srcSession.cooldown_block || null,
        warmup_content: srcSession.warmup_content || null, cooldown_content: srcSession.cooldown_content || null,
        materiel: srcSession.materiel || null, activity_mode: srcSession.activity_mode || 'standard',
      })
      .select().single()
    if (!newSess) return

    const exos = (srcSession.program_exercises || []).sort((a, b) => a.order_index - b.order_index)
    if (exos.length) {
      await supabase.from('program_exercises').insert(exos.map(e => ({
        program_session_id: newSess.id, order_index: e.order_index, name: e.name,
        sets: e.sets, reps: e.reps, kg: e.kg, rest: e.rest, note: e.note, materiel: e.materiel || null, video_url: e.video_url,
        superset_group: e.superset_group, focus_muscles: e.focus_muscles || null,
        pace_base: e.pace_base || null, pct_low: e.pct_low, pct_high: e.pct_high,
        timer_config: e.timer_config || null,
      })))
    }
    router.push(`/programs/${athleteId}/${programId}/session/${newSess.id}`)
  }

  // Clic sur une séance déjà existante dans la grille : ouvre elle aussi la nouvelle page séance
  // (blocks), pas l'ancien éditeur — cohérent avec la création via addSessionAt ci-dessus.
  const goToSessionPage = (id) => router.push(`/programs/${athleteId}/${programId}/session/${id}`)

  const duplicateSession = async (id, forcedIdx = null, opts = {}) => {
    const s = sessions.find(sess => sess.id === id)
    if (!s) return

    const { data: newSession, error: sessErr } = await supabase.from('program_sessions')
      .insert({
        program_id: programId, order_index: forcedIdx !== null ? forcedIdx : sessions.length,
        title: s.title ? `${s.title} (copie)` : '',
        activation: s.activation || null, coach_notes: s.coach_notes || null,
        activation_videos: s.activation_videos || [], session_type: s.session_type || null,
        recurring_daily_target: s.recurring_daily_target ?? null,
        materiel: s.materiel || null,
        // Circuits + warmup/cooldown/timer de séance : oubliés par le passé (voir
        // addSessionFromWorkout ci-dessus pour le pattern correct), ce qui faisait disparaître le
        // circuit d'une séance dupliquée sans toucher à ses exercices.
        circuits: s.circuits || [], warmup_block: s.warmup_block || null, cooldown_block: s.cooldown_block || null,
        warmup_content: s.warmup_content || null, cooldown_content: s.cooldown_content || null,
        activity_mode: s.activity_mode || 'standard', timer_config: s.timer_config || null,
        // Garde le même jour que l'originale (au lieu de retomber "non planifiée") : dans la
        // grille Jour 1→N, dupliquer une séance sert surtout à en poser une copie juste à côté,
        // que le coach glisse ensuite ailleurs si besoin.
        week_number: s.week_number, day_of_week: s.day_of_week,
      })
      .select().single()
    if (sessErr || !newSession) { alert('Erreur duplication : ' + sessErr?.message); return }

    const toInsert = s.exercises.filter(e => e.name.trim()).map((e, j) => ({
      program_session_id: newSession.id, order_index: j, name: e.name.trim(),
      sets: e.sets !== '' ? parseInt(e.sets) : null,
      reps: e.reps || null,
      kg: e.kg !== '' && !isNaN(parseFloat(e.kg)) ? parseFloat(e.kg) : null,
      rest: e.rest || null,
      note: e.note || null,
      materiel: e.materiel || null,
      video_url: e.video_url || null,
      superset_group: e.superset_group || null,
      focus_muscles: e.focus_muscles || null,
      pace_base: e.pace_base || null,
      pct_low: e.pct_low !== '' && e.pct_low != null ? parseFloat(e.pct_low) : null,
      pct_high: e.pct_high !== '' && e.pct_high != null ? parseFloat(e.pct_high) : null,
      timer_config: e.timer_config || null,
    }))

    let insertedExos = []
    if (toInsert.length) {
      const { data: inserted, error: insErr } = await supabase.from('program_exercises').insert(toInsert).select()
      if (insErr) { alert('Erreur duplication des exercices : ' + insErr.message); return }
      insertedExos = inserted || []
    }

    const newS = {
      ...newSession,
      exercises: insertedExos.length
        ? insertedExos.map(e => ({ ...e, _key: e.id }))
        : [emptyExo(0)],
    }
    setSessions(prev => [...prev, newS])
    if (!opts.skipOpen) router.push(`/programs/${athleteId}/${programId}/session/${newSession.id}`)
  }

  const saveTitle = async () => {
    if (!program) return
    setTitleSaving(true)
    await supabase.from('programs').update({ title: program.title }).eq('id', programId)
    setTitleSaving(false)
  }

  const saveActivityType = async (value) => {
    setProgram(p => ({ ...p, activity_type: value }))
    const { error } = await supabase.from('programs').update({ activity_type: value }).eq('id', programId)
    if (error) alert('Erreur lors de l\'enregistrement de l\'activité : ' + error.message)
  }

  // Alternative aux jours fixés séance par séance : le coach conseille juste un rythme
  // (ex: 2 séances/semaine, 48h d'écart mini), et c'est l'athlète qui choisit ses jours dans
  // son espace — utile pour les templates existants qu'on ne veut pas réorganiser séance par séance.
  const saveScheduleHint = async (field, value) => {
    setProgram(p => ({ ...p, [field]: value }))
    await supabase.from('programs').update({ [field]: value }).eq('id', programId)
  }

  // "Template" est un statut explicite (is_template) que le coach coche lui-même — un programme
  // sans sportif assigné n'apparaît pas automatiquement dans la galerie de /programs/new tant qu'il
  // n'a pas été marqué comme tel (voir demande du coach : pas tous les programmes = des templates).
  const saveIsTemplate = async (value) => {
    setProgram(p => ({ ...p, is_template: value }))
    const { error } = await supabase.from('programs').update({ is_template: value }).eq('id', programId)
    if (error) {
      setProgram(p => ({ ...p, is_template: !value }))
      alert('Erreur : ' + error.message)
    }
  }

  // Cascade partagée par deleteSession (une séance) et deleteSelectedSessions (plusieurs) — pas de
  // confirm() ici, chaque appelant gère sa propre confirmation (une seule pour tout le lot en bulk).
  const deleteSessionCascade = async (id) => {
    const { data: linked } = await supabase.from('program_sessions').select('id').eq('source_session_id', id)
    for (const l of (linked || [])) {
      const { data: completion } = await supabase.from('program_completions')
        .select('program_session_id').eq('program_session_id', l.id).maybeSingle()
      if (!completion) await supabase.from('program_sessions').delete().eq('id', l.id)
    }
    await supabase.from('program_sessions').delete().eq('id', id)
  }

  const deleteSession = async (id) => {
    if (!confirm('Supprimer cette séance ? Elle sera aussi supprimée chez les clients à qui ce programme est lié (sauf s\'ils l\'ont déjà validée).')) return
    await deleteSessionCascade(id)
    setSessions(prev => prev.filter(s => s.id !== id))
  }

  const deleteSelectedSessions = async () => {
    const n = selectedSessionIds.size
    if (!confirm(`Supprimer ${n} séance${n > 1 ? 's' : ''} ? Elles seront aussi supprimées chez les clients à qui ce programme est lié (sauf s'ils les ont déjà validées).`)) return
    for (const id of selectedSessionIds) await deleteSessionCascade(id)
    setSessions(prev => prev.filter(s => !selectedSessionIds.has(s.id)))
    setSelectedSessionIds(new Set())
  }

  const deleteWholeProgram = async () => {
    if (!confirm(isGroupCycle ? 'Supprimer ce cycle d\'entraînement et toutes ses séances ? Cette action est définitive.' : 'Supprimer ce programme et toutes ses séances ? Cette action est définitive.')) return

    const sessionIds = sessions.map(s => s.id)
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

    const { error } = await supabase.from('programs').delete().eq('id', programId)
    if (error) { alert('Erreur : ' + error.message); return }
    router.push(isGroupCycle ? `/groups/${program.group_id}` : isTemplate ? '/programs' : `/programs/${athleteId}`)
  }

  const openAddParticipant = async () => {
    setShowAddParticipant(true)
    const { data } = await supabase.from('athletes').select('id, name').neq('archived', true).order('name')
    const participantIds = new Set(participants.map(p => p.athlete_id))
    setOtherAthletes((data || []).filter(a => !participantIds.has(a.id)))
  }

  const addParticipant = async (targetId) => {
    if (!program?.group_batch_id) return
    setAddingParticipantId(targetId)
    const coachId = await getCoachId()

    const { data: sourceSessions } = await supabase
      .from('program_sessions')
      .select('*, program_exercises(*)')
      .eq('program_id', programId)
      .order('order_index')

    const { data: newProg } = await supabase.from('programs')
      .insert({
        athlete_id: targetId, title: program.title, coach_id: coachId,
        source_program_id: programId, activity_type: program.activity_type,
        group_id: program.group_id, group_batch_id: program.group_batch_id,
      })
      .select().single()

    if (newProg) {
      for (const sess of (sourceSessions || [])) {
        const { data: newSess } = await supabase.from('program_sessions')
          .insert({
            program_id: newProg.id, order_index: sess.order_index, title: sess.title || '', source_session_id: sess.id,
            activation: sess.activation || null, coach_notes: sess.coach_notes || null,
            activation_videos: sess.activation_videos || [], circuits: sess.circuits || [],
            warmup_content: sess.warmup_content || null, cooldown_content: sess.cooldown_content || null,
            session_type: sess.session_type || null, recurring_daily_target: sess.recurring_daily_target ?? null,
            week_number: sess.week_number, day_of_week: sess.day_of_week ?? null, hidden_until_run: !!sess.hidden_until_run,
          })
          .select().single()
        if (!newSess) continue

        const exos = (sess.program_exercises || []).sort((a, b) => a.order_index - b.order_index)
        if (exos.length > 0) {
          await supabase.from('program_exercises').insert(
            exos.map(e => ({
              program_session_id: newSess.id, order_index: e.order_index, name: e.name,
              sets: e.sets, reps: e.reps, kg: e.kg, rest: e.rest, note: e.note, materiel: e.materiel || null, video_url: e.video_url,
              superset_group: e.superset_group, focus_muscles: e.focus_muscles || null,
              pace_base: e.pace_base || null, pct_low: e.pct_low, pct_high: e.pct_high, source_exercise_id: e.id,
              timer_config: e.timer_config || null,
            }))
          )
        }
      }
      setParticipants(prev => [...prev, { id: newProg.id, athlete_id: targetId, athletes: { name: otherAthletes.find(a => a.id === targetId)?.name } }])
      setOtherAthletes(prev => prev.filter(a => a.id !== targetId))
      notifyAssigned({ athleteIds: [targetId], kind: 'program', title: program.title })
    }
    setAddingParticipantId(null)
  }

  const removeParticipant = async (participant) => {
    if (!confirm(`Retirer ${participant.athletes?.name || 'ce client'} de cette séance ? Sa copie et ses résultats seront supprimés.`)) return
    setRemovingParticipantId(participant.id)

    const { data: sess } = await supabase.from('program_sessions').select('id').eq('program_id', participant.id)
    const sessionIds = (sess || []).map(s => s.id)
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
    await supabase.from('programs').delete().eq('id', participant.id)
    setParticipants(prev => prev.filter(p => p.id !== participant.id))
    setRemovingParticipantId(null)
  }

  const inp ={ border: '1px solid var(--border2)', borderRadius: 'var(--r)', padding: '8px 10px', fontSize: 13, outline: 'none', background: 'var(--bg2)', color: 'var(--text)', width: '100%' }
  const stepBtn = { width: 24, height: 24, borderRadius: '50%', border: '1px solid var(--border2)', background: 'var(--bg2)', color: 'var(--text2)', fontSize: 14, fontWeight: 700, lineHeight: 1, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0, flexShrink: 0 }

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100svh', color: 'var(--text3)' }}>Chargement…</div>
  )

  return (
    <div className="coach-layout" style={{ background: 'var(--bg2)' }}>
      <AthletesSidebar athleteId={athleteId} date={today()} />
      <div className="coach-main" style={{ paddingBottom: 60 }}>

        {/* Header */}
        <div style={{ background: 'var(--bg)', borderBottom: '1px solid var(--border)', padding: '14px 16px', position: 'sticky', top: 0, zIndex: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {/* router.back() plutôt qu'un href fixe : cette page est atteignable depuis plusieurs
                endroits (liste des programmes, mais aussi un groupe via son programme lié) —
                un lien fixe vers /programs ramenait toujours à la liste complète même en venant
                d'un groupe, au lieu d'y revenir (retour terrain). */}
            <button onClick={() => { if (guardNavigation({ preventDefault() {} })) router.back() }} style={{ fontSize: 22, color: 'var(--text2)', textDecoration: 'none', background: 'none', border: 'none', cursor: 'pointer', padding: 0, lineHeight: 1 }}>←</button>
            <div style={{ flex: 1, minWidth: 0 }}>
              <input
                value={program?.title || ''}
                onChange={e => setProgram(p => ({ ...p, title: e.target.value }))}
                onBlur={saveTitle}
                onKeyDown={e => e.key === 'Enter' && e.target.blur()}
                style={{ fontFamily: 'var(--font-title)', fontWeight: 700, fontSize: 19, border: 'none', outline: 'none', background: 'transparent', width: '100%', color: 'var(--title)' }}
                placeholder={isGroupCycle ? 'Nom du cycle' : 'Nom du programme'}
              />
              {titleSaving && <div style={{ fontSize: 10, color: 'var(--text3)' }}>Enregistrement…</div>}
              <div style={{ fontSize: 11, color: 'var(--text3)', display: 'flex', alignItems: 'center', gap: 4, marginTop: 2 }}>
                {isGroupCycle
                  ? <><UsersThree size={11} /> Cycle d&apos;entraînement</>
                  : isTemplate ? <><ClipboardText size={11} /> {program?.is_template ? 'Template' : 'Brouillon'}</> : athlete?.name} · {sessions.length} séance{sessions.length !== 1 ? 's' : ''}
              </div>
              <ActivityTypeSelect
                value={program?.activity_type || 'Musculation 🏋️'}
                onChange={saveActivityType}
                style={{ marginTop: 6 }}
                inputStyle={{ fontSize: 12, fontWeight: 600, borderRadius: 20, color: 'var(--text2)', padding: '4px 10px' }}
              />
            </div>
            {isGroupCycle ? (
              <button onClick={duplicateGroupCycleAsProgram} disabled={duplicatingAsProgram}
                title="Créer un programme indépendant, identique à ce cycle, réutilisable en dehors du groupe"
                style={{
                  background: 'none', border: '1px solid var(--border2)', color: 'var(--text2)',
                  borderRadius: 'var(--r)', padding: '6px 10px', fontSize: 12, fontWeight: 700, cursor: duplicatingAsProgram ? 'default' : 'pointer', flexShrink: 0, display: 'flex', alignItems: 'center', gap: 4,
                }}>
                <CopySimple size={12} /> {duplicatingAsProgram ? 'Duplication…' : 'Dupliquer en programme'}
              </button>
            ) : isTemplate && (
              <button onClick={() => saveIsTemplate(!program?.is_template)}
                title={program?.is_template ? 'Retirer de la galerie de templates' : 'Proposer ce programme comme template réutilisable'}
                style={{
                  background: program?.is_template ? 'var(--green-light)' : 'none',
                  border: `1px solid ${program?.is_template ? 'var(--green)' : 'var(--border2)'}`,
                  color: program?.is_template ? 'var(--green)' : 'var(--text3)',
                  borderRadius: 'var(--r)', padding: '6px 10px', fontSize: 12, fontWeight: 700, cursor: 'pointer', flexShrink: 0, display: 'flex', alignItems: 'center', gap: 4,
                }}>
                <ClipboardText size={12} weight={program?.is_template ? 'fill' : 'regular'} /> {program?.is_template ? 'Template' : 'En faire un template'}
              </button>
            )}
            <button onClick={deleteWholeProgram} title="Supprimer le programme"
              style={{ background: 'none', border: '1px solid var(--border2)', borderRadius: 'var(--r)', padding: '6px 10px', fontSize: 12, fontWeight: 700, color: '#DC2626', cursor: 'pointer', flexShrink: 0, display: 'flex', alignItems: 'center', gap: 4 }}>
              <Trash size={12} /> Supprimer
            </button>
          </div>
        </div>

        {/* Stats — Azeoo affiche ces champs en lecture seule avec un bouton "Edit" séparé ; ici ils
            restent éditables en place, cohérent avec le reste de l'app (pas de flux d'édition à part). */}
        <div style={{ margin: '12px 16px 0', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 'var(--rl)', padding: 14 }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 20 }}>
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: 4 }}>Durée</div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
                <input type="number" min="0" placeholder="—" defaultValue={program?.duration_weeks ?? ''}
                  onBlur={e => saveScheduleHint('duration_weeks', e.target.value ? parseInt(e.target.value) : null)}
                  style={{ width: 40, border: 'none', borderBottom: '1px dashed var(--border2)', background: 'transparent', fontSize: 14, fontWeight: 700, color: 'var(--text)', outline: 'none', padding: '2px 0' }} />
                <span style={{ fontSize: 12, color: 'var(--text3)' }}>semaines</span>
              </div>
            </div>
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: 4 }}>Niveau</div>
              <select value={program?.level || ''} onChange={e => saveScheduleHint('level', e.target.value || null)}
                style={{ border: 'none', borderBottom: '1px dashed var(--border2)', background: 'transparent', fontSize: 14, fontWeight: 700, color: 'var(--text)', outline: 'none', padding: '2px 0' }}>
                <option value="">—</option>
                {PROGRAM_LEVELS.map(l => <option key={l} value={l}>{l}</option>)}
              </select>
            </div>
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: 4 }}>Objectif</div>
              <input placeholder="—" defaultValue={program?.goal || ''}
                onBlur={e => saveScheduleHint('goal', e.target.value.trim() || null)}
                style={{ width: 140, border: 'none', borderBottom: '1px dashed var(--border2)', background: 'transparent', fontSize: 14, fontWeight: 700, color: 'var(--text)', outline: 'none', padding: '2px 0' }} />
            </div>
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: 4 }}>Matériel</div>
              <input placeholder="—" defaultValue={program?.equipment || ''}
                onBlur={e => saveScheduleHint('equipment', e.target.value.trim() || null)}
                style={{ width: 140, border: 'none', borderBottom: '1px dashed var(--border2)', background: 'transparent', fontSize: 14, fontWeight: 700, color: 'var(--text)', outline: 'none', padding: '2px 0' }} />
            </div>
          </div>

          {isTemplate && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 14, paddingTop: 12, borderTop: '1px solid var(--border)', fontSize: 11, color: 'var(--text3)', flexWrap: 'wrap' }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><ClipboardText size={11} /> Phase précédente conseillée :</span>
              <select value={program?.previous_phase_program_id || ''}
                onChange={e => saveScheduleHint('previous_phase_program_id', e.target.value || null)}
                style={{ maxWidth: 200, padding: '2px 6px', border: '1px solid var(--border2)', borderRadius: 4, fontSize: 11, outline: 'none', background: 'var(--bg2)', color: 'var(--text)' }}>
                <option value="">Aucune</option>
                {otherTemplates.map(t => <option key={t.id} value={t.id}>{t.title}</option>)}
              </select>
            </div>
          )}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: isTemplate ? 8 : 14, paddingTop: isTemplate ? 0 : 12, borderTop: isTemplate ? 'none' : '1px solid var(--border)', fontSize: 11, color: 'var(--text3)', flexWrap: 'wrap' }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><CalendarBlank size={11} /> Rythme conseillé (si l&apos;athlète choisit ses jours) :</span>
            <input type="number" min="1" max="7" placeholder="X" value={program?.recommended_sessions_per_week ?? ''}
              onChange={e => saveScheduleHint('recommended_sessions_per_week', e.target.value ? parseInt(e.target.value) : null)}
              style={{ width: 44, boxSizing: 'border-box', padding: '2px 4px', border: '1px solid var(--border2)', borderRadius: 4, fontSize: 11, outline: 'none', background: 'var(--bg2)', color: 'var(--text)', textAlign: 'center' }} />
            <span>séances/sem., mini</span>
            <input type="number" min="0" placeholder="48" value={program?.min_hours_between_sessions ?? ''}
              onChange={e => saveScheduleHint('min_hours_between_sessions', e.target.value ? parseInt(e.target.value) : null)}
              style={{ width: 44, boxSizing: 'border-box', padding: '2px 4px', border: '1px solid var(--border2)', borderRadius: 4, fontSize: 11, outline: 'none', background: 'var(--bg2)', color: 'var(--text)', textAlign: 'center' }} />
            <span>h d&apos;écart</span>
          </div>
        </div>

        {!isTemplate && program?.group_batch_id && (
          <div style={{ margin: '12px 16px 0', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 'var(--rl)', padding: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.4px', flex: 1, display: 'flex', alignItems: 'center', gap: 4 }}>
                <UsersThree size={12} /> Participants ({participants.length})
              </div>
              <button onClick={openAddParticipant} style={{ background: 'none', border: 'none', color: 'var(--green)', fontSize: 12, fontWeight: 700, cursor: 'pointer', padding: 0 }}>
                + Ajouter un client
              </button>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {participants.map(p => (
                <div key={p.id} style={{
                  display: 'flex', alignItems: 'center', gap: 6, background: p.athlete_id === athleteId ? 'var(--green-light)' : 'var(--bg2)',
                  border: '1px solid ' + (p.athlete_id === athleteId ? 'var(--green)' : 'var(--border2)'), borderRadius: 20, padding: '5px 6px 5px 12px',
                }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: p.athlete_id === athleteId ? 'var(--green)' : 'var(--text2)' }}>{p.athletes?.name || '—'}</span>
                  {p.athlete_id !== athleteId && (
                    <button onClick={() => removeParticipant(p)} disabled={removingParticipantId === p.id}
                      style={{ background: 'none', border: 'none', color: 'var(--text3)', fontSize: 15, cursor: 'pointer', padding: '0 4px', lineHeight: 1 }}>
                      {removingParticipantId === p.id ? '…' : '×'}
                    </button>
                  )}
                </div>
              ))}
            </div>
            {showAddParticipant && (
              <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px dashed var(--border)', display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 200, overflowY: 'auto' }}>
                {otherAthletes.length === 0 ? (
                  <div style={{ fontSize: 12, color: 'var(--text3)', fontStyle: 'italic' }}>Tous les clients participent déjà</div>
                ) : otherAthletes.map(a => (
                  <button key={a.id} onClick={() => addParticipant(a.id)} disabled={addingParticipantId === a.id}
                    style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'var(--bg2)', border: '1px solid var(--border2)', borderRadius: 'var(--r)', padding: '8px 12px', fontSize: 13, fontWeight: 600, color: 'var(--text)', cursor: 'pointer', textAlign: 'left' }}>
                    {a.name}
                    <span style={{ color: 'var(--green)', fontSize: 12 }}>{addingParticipantId === a.id ? '…' : '+ Ajouter'}</span>
                  </button>
                ))}
                <button onClick={() => setShowAddParticipant(false)} style={{ background: 'none', border: 'none', color: 'var(--text3)', fontSize: 12, fontWeight: 600, cursor: 'pointer', padding: '2px 0', textAlign: 'left' }}>
                  Fermer
                </button>
              </div>
            )}
          </div>
        )}

        {!isTemplate && athlete && (objectives.length > 0 || noteBlocks.length > 0) && (
          <div style={{ margin: '12px 16px 0', display: 'flex', flexDirection: 'column', gap: 8 }}>
            {objectives.length > 0 && (
              <ObjectivesBlock athleteId={athlete.id} objectives={objectives} setObjectives={setObjectives} />
            )}
            {noteBlocks.map(b => (
              <div key={b.id} style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 'var(--rl)', overflow: 'hidden' }}>
                {b.title && (
                  <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--border)' }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>{b.title}</span>
                  </div>
                )}
                {b.content && (
                  <div style={{ padding: 14, fontSize: 14, color: 'var(--text)', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{b.content}</div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Partage + Client(s) — pendant Ostryk du panneau "Enable sharing" / "Client(s)" d'Azeoo,
            adapté au modèle de copie (pas de lien live) : le coach active la disponibilité et voit/gère
            les sportifs qui ont une copie de ce template. */}
        {isTemplate && (
          <div style={{ margin: '12px 16px 0', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 'var(--rl)', padding: 14, display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>Disponible aux sportifs</div>
                <div style={{ fontSize: 11, color: 'var(--text3)' }}>Visible dans la liste des programmes que les sportifs peuvent démarrer eux-mêmes.</div>
              </div>
              <button onClick={toggleProgramAvailable} disabled={togglingAvailable} role="switch" aria-checked={!!program?.available_to_clients}
                style={{
                  width: 40, height: 22, borderRadius: 20, border: 'none', flexShrink: 0, cursor: 'pointer', position: 'relative',
                  background: program?.available_to_clients ? 'var(--green)' : 'var(--border2)', transition: 'background 0.15s',
                }}>
                <span style={{
                  position: 'absolute', top: 2, left: program?.available_to_clients ? 20 : 2, width: 18, height: 18, borderRadius: '50%',
                  background: '#fff', transition: 'left 0.15s', boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
                }} />
              </button>
            </div>

            <div style={{ borderTop: '1px solid var(--border)', paddingTop: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ flex: 1, fontSize: 11, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.4px', display: 'flex', alignItems: 'center', gap: 4 }}>
                  <UsersThree size={12} /> Client(s) {followers.length > 0 && `(${followers.length})`}
                </div>
                <button onClick={openAddFollower} style={{ background: 'none', border: 'none', color: 'var(--green)', fontSize: 12, fontWeight: 700, cursor: 'pointer', padding: 0 }}>
                  + Ajouter un client
                </button>
              </div>

              {showAddFollower && (() => {
                const filtered = addFollowerSearch.trim()
                  ? otherAthletesForFollower.filter(a => a.name.toLowerCase().includes(addFollowerSearch.trim().toLowerCase()))
                  : otherAthletesForFollower
                return (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, paddingBottom: 4, borderBottom: '1px dashed var(--border)' }}>
                    {otherAthletesForFollower.length > 5 && (
                      <input autoFocus value={addFollowerSearch} onChange={e => setAddFollowerSearch(e.target.value)}
                        placeholder="Rechercher un sportif…"
                        style={{ width: '100%', boxSizing: 'border-box', padding: '7px 10px', border: '1px solid var(--border2)', borderRadius: 'var(--r)', fontSize: 13, outline: 'none', background: 'var(--bg2)', color: 'var(--text)' }} />
                    )}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 200, overflowY: 'auto' }}>
                      {otherAthletesForFollower.length === 0 ? (
                        <div style={{ fontSize: 12, color: 'var(--text3)', fontStyle: 'italic' }}>Tous les clients ont déjà ce programme</div>
                      ) : filtered.length === 0 ? (
                        <div style={{ fontSize: 12, color: 'var(--text3)', fontStyle: 'italic' }}>Aucun sportif ne correspond à cette recherche</div>
                      ) : filtered.map(a => (
                        <button key={a.id} onClick={() => addFollower(a.id)} disabled={addingFollowerId === a.id}
                          style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'var(--bg2)', border: '1px solid var(--border2)', borderRadius: 'var(--r)', padding: '8px 12px', fontSize: 13, fontWeight: 600, color: 'var(--text)', cursor: 'pointer', textAlign: 'left' }}>
                          {a.name}
                          <span style={{ color: 'var(--green)', fontSize: 12 }}>{addingFollowerId === a.id ? '…' : '+ Ajouter'}</span>
                        </button>
                      ))}
                    </div>
                    <button onClick={() => setShowAddFollower(false)} style={{ background: 'none', border: 'none', color: 'var(--text3)', fontSize: 12, fontWeight: 600, cursor: 'pointer', padding: '2px 0', textAlign: 'left' }}>
                      Fermer
                    </button>
                  </div>
                )
              })()}

              {followers.length === 0 ? (
                <div style={{ fontSize: 12, color: 'var(--text3)', fontStyle: 'italic' }}>Aucun sportif n&apos;a encore ce programme.</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {followers.map(f => (
                    <div key={f.id} style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--bg2)', border: '1px solid var(--border2)', borderRadius: 'var(--r)', padding: '8px 10px' }}>
                      <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{f.athletes?.name || '—'}</span>
                      <Link href={`/programs/${f.athlete_id}/${f.id}`} style={{ fontSize: 12, fontWeight: 600, color: 'var(--green)', textDecoration: 'none' }}>Voir</Link>
                      <button onClick={() => removeFollower(f)} disabled={removingFollowerId === f.id}
                        style={{ background: 'none', border: 'none', color: '#DC2626', fontSize: 12, fontWeight: 600, cursor: 'pointer', padding: 0 }}>
                        {removingFollowerId === f.id ? '…' : 'Retirer'}
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {sessions.some(s => s.needs_sync) && (
                <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 'var(--r)', padding: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <div style={{ fontSize: 13, color: 'var(--text2)' }}>
                    Une séance a été modifiée après que des sportifs ont programmé ce programme :
                    <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>
                      {sessions.filter(s => s.needs_sync).map(s => (
                        <li key={s.id} style={{ fontWeight: 600 }}>{s.title || 'Séance sans titre'}</li>
                      ))}
                    </ul>
                  </div>
                  <button onClick={runSync} disabled={syncing} style={{
                    alignSelf: 'flex-start', background: '#F59E0B', color: '#fff', border: 'none', borderRadius: 'var(--r)',
                    padding: '9px 16px', fontSize: 13, fontWeight: 700, cursor: 'pointer',
                  }}>
                    {syncing ? 'Synchronisation…' : '⟳ Lancer la synchro'}
                  </button>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--text3)', cursor: 'pointer' }}>
                    <input type="checkbox" checked={notifyOnSync} onChange={e => setNotifyOnSync(e.target.checked)}
                      style={{ accentColor: 'var(--green)', width: 15, height: 15 }} />
                    Envoyer une notification aux sportifs concernés
                  </label>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Une séance récurrente vit hors calendrier (week_number/day_of_week toujours nuls, voir
            handleSave dans SessionBlockEditor) donc n'apparaîtrait sinon que noyée dans "Non
            planifiées" au bas de la grille — ce bandeau la rend facile à retrouver et rouvrir. */}
        {sessions.some(s => s.session_type === 'recurrent') && (
          <div style={{ margin: '12px 16px 0', display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', borderRadius: 'var(--rl)', background: 'var(--bg2)', border: '1px solid var(--border)', flexWrap: 'wrap' }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text3)', display: 'inline-flex', alignItems: 'center', gap: 4 }}><Repeat size={12} /> Séances récurrentes :</span>
            {sessions.filter(s => s.session_type === 'recurrent').map(s => (
              <button key={s.id} onClick={() => goToSessionPage(s.id)}
                title="Ouvrir cette séance"
                style={{ background: 'var(--bg)', border: '1px solid var(--border2)', borderRadius: 20, padding: '4px 10px', fontSize: 12, fontWeight: 600, color: 'var(--text2)', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                {s.title || `Séance ${sessions.indexOf(s) + 1}`}
              </button>
            ))}
          </div>
        )}

        <WeekGrid
          sessions={sessions}
          durationWeeks={program?.duration_weeks || 1}
          onAddAt={addSessionAt}
          onAddFromWorkout={openWorkoutPicker}
          onOpenSession={goToSessionPage}
          onMoveSession={moveSessionToDay}
          onDuplicateSession={(id) => duplicateSession(id, null, { skipOpen: true })}
          selectedIds={selectedSessionIds}
          onToggleSelect={toggleSessionSelected}
        />

        {selectedSessionIds.size > 0 && (
          <div style={{
            position: 'sticky', bottom: 12, zIndex: 50, margin: '12px 16px 0',
            background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 'var(--rl)',
            boxShadow: '0 4px 20px rgba(0,0,0,0.12)', padding: '10px 14px',
            display: 'flex', alignItems: 'center', gap: 14,
          }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>
              <span style={{ width: 20, height: 20, borderRadius: '50%', background: 'var(--green)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, flexShrink: 0 }}>
                {selectedSessionIds.size}
              </span>
              séance{selectedSessionIds.size > 1 ? 's' : ''} sélectionnée{selectedSessionIds.size > 1 ? 's' : ''}
            </span>
            <button onClick={() => setSelectedSessionIds(new Set())} style={{ background: 'none', border: 'none', color: 'var(--text3)', fontSize: 12, fontWeight: 600, textDecoration: 'underline', cursor: 'pointer', padding: 0 }}>
              Effacer la sélection
            </button>
            <div style={{ flex: 1 }} />
            <button
              onClick={() => {
                setSideBySideIds(sessions.filter(s => selectedSessionIds.has(s.id)).map(s => s.id))
                setSelectedSessionIds(new Set())
              }}
              title="Ouvrir les séances sélectionnées côte à côte"
              style={{ background: 'var(--green-light)', border: '1px solid var(--green)', color: 'var(--green)', borderRadius: 'var(--r)', padding: 8, display: 'flex', cursor: 'pointer' }}>
              <Columns size={16} />
            </button>
            <button onClick={duplicateSelectedSessions} disabled={duplicatingSelected} title="Dupliquer la sélection"
              style={{ background: 'var(--green-light)', border: '1px solid var(--green)', color: 'var(--green)', borderRadius: 'var(--r)', padding: 8, display: 'flex', cursor: 'pointer' }}>
              <CopySimple size={16} />
            </button>
            <button onClick={deleteSelectedSessions} title="Supprimer la sélection"
              style={{ background: 'none', border: '1px solid #F1B8B8', color: '#DC2626', borderRadius: 'var(--r)', padding: 8, display: 'flex', cursor: 'pointer' }}
            >
              <Trash size={16} />
            </button>
          </div>
        )}

        {/* Vue côte à côte : un SessionBlockEditor par séance sélectionnée, en panneaux de largeur
            fixe défilant horizontalement — chaque panneau gère son propre scroll vertical (voir
            son header "sticky") et se ferme indépendamment des autres via onClose (pas de
            navigation qui fermerait toute la vue). Fermer le dernier panneau ferme la vue entière. */}
        {sideBySideIds && sideBySideIds.length > 0 && (
          <div style={{ position: 'fixed', inset: 0, background: 'var(--bg2)', zIndex: 250, display: 'flex', flexDirection: 'column' }}>
            <div style={{
              background: 'var(--bg)', borderBottom: '1px solid var(--border)', padding: '10px 16px',
              display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0,
            }}>
              <button onClick={() => setSideBySideIds(null)} style={{ background: 'none', border: 'none', fontSize: 22, color: 'var(--text2)', cursor: 'pointer', padding: 0, lineHeight: 1, display: 'flex' }}>←</button>
              <span style={{ fontFamily: 'var(--font-title)', color: 'var(--title)', fontWeight: 700, fontSize: 15 }}>
                Retour au calendrier
              </span>
              <span style={{ fontSize: 12, color: 'var(--text3)' }}>
                — {sideBySideIds.length} séance{sideBySideIds.length > 1 ? 's' : ''} côte à côte
              </span>
            </div>
            <div style={{ flex: 1, display: 'flex', overflowX: 'auto' }}>
              {sideBySideIds.map(id => (
                <div key={id} style={{ width: 480, flexShrink: 0, height: '100%', overflowY: 'auto', borderRight: '1px solid var(--border)' }}>
                  <SessionBlockEditor
                    sessionId={id}
                    backHref={`/programs/${athleteId}/${programId}`}
                    onClose={() => setSideBySideIds(prev => {
                      const next = (prev || []).filter(x => x !== id)
                      return next.length ? next : null
                    })}
                  />
                </div>
              ))}
            </div>
          </div>
        )}

      </div>
      {workoutPickerFor && (
        <div onClick={() => setWorkoutPickerFor(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 900, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: 'var(--bg)', borderRadius: 'var(--rl)', padding: 20, width: '100%', maxWidth: 420, maxHeight: '80svh', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ flex: 1, fontFamily: 'var(--font-title)', color: 'var(--title)', fontWeight: 700, fontSize: 17, display: 'flex', alignItems: 'center', gap: 8 }}><Barbell size={16} /> Choisir un workout</div>
              <button onClick={() => setWorkoutPickerFor(null)} style={{ background: 'none', border: 'none', fontSize: 20, color: 'var(--text3)', cursor: 'pointer', padding: '2px 4px', lineHeight: 1 }}><X size={18} /></button>
            </div>
            {loadingWorkouts ? (
              <div style={{ fontSize: 13, color: 'var(--text3)' }}>Chargement…</div>
            ) : availableWorkouts.length === 0 ? (
              <div style={{ fontSize: 13, color: 'var(--text3)', fontStyle: 'italic' }}>Aucun workout dans ta bibliothèque pour l&apos;instant.</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {availableWorkouts.map(w => {
                  const sess = w.program_sessions?.[0]
                  const exoCount = sess?.program_exercises?.length || 0
                  return (
                    <button key={w.id} onClick={() => addSessionFromWorkout(w)} style={{
                      textAlign: 'left', background: 'var(--bg2)', border: '1px solid var(--border2)', borderRadius: 'var(--r)',
                      padding: '10px 12px', cursor: 'pointer', fontFamily: 'inherit',
                    }}>
                      <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--text)' }}>{sess?.title || w.title}</div>
                      <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 2 }}>{w.activity_type || 'Musculation 🏋️'} · {exoCount} exercice{exoCount !== 1 ? 's' : ''}</div>
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
