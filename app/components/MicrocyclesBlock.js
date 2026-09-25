'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import {
  ArrowsClockwise, SquaresFour, Lightning, PencilSimple, PushPin, UsersThree, Package, Trash,
  Barbell, CheckCircle, Repeat,
} from '@phosphor-icons/react'
import { supabase } from '@/lib/supabase'
import Link from 'next/link'
import { getCoachId } from '@/lib/coach'
import { notifyAssigned } from '@/lib/notify'
import ActivityTypeSelect from '@/app/components/ActivityTypeSelect'

export default function MicrocyclesBlock({ athleteId, athleteToken }) {
  const router = useRouter()
  const [programs, setPrograms] = useState([])
  const [expandedId, setExpandedId] = useState(null)
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const [saving, setSaving] = useState(false)
  const [renamingId, setRenamingId] = useState(null)
  const [renameVal, setRenameVal] = useState('')
  const [creatingFree, setCreatingFree] = useState(false)
  const [newActivityType, setNewActivityType] = useState('Musculation 🏋️')
  const [selectedSessions, setSelectedSessions] = useState(new Set())
  const [duplicating, setDuplicating] = useState(false)
  const [allAthletes, setAllAthletes] = useState([])
  const [assignModal, setAssignModal] = useState(null) // micro-cycle en cours de copie
  const [alreadyAssignedIds, setAlreadyAssignedIds] = useState(new Set())
  const [selectedIds, setSelectedIds] = useState([])
  const [assigning, setAssigning] = useState(false)
  const [assignDone, setAssignDone] = useState(false)
  const [showArchived, setShowArchived] = useState(false)
  const [completedSessionIds, setCompletedSessionIds] = useState(new Set())

  useEffect(() => { load() }, [athleteId])

  useEffect(() => {
    supabase.from('athletes').select('id, name').neq('archived', true).order('created_at')
      .then(({ data }) => setAllAthletes((data || []).filter(a => a.id !== athleteId)))
  }, [athleteId])

  useEffect(() => {
    if (!assignModal) return
    supabase.from('programs').select('athlete_id').eq('source_program_id', assignModal.id)
      .then(({ data }) => setAlreadyAssignedIds(new Set((data || []).map(p => p.athlete_id))))
  }, [assignModal])

  async function load() {
    const [{ data }, { data: completions }] = await Promise.all([
      supabase
        .from('programs')
        .select('*, program_sessions(id, title, order_index)')
        .eq('athlete_id', athleteId)
        .order('created_at', { ascending: false }),
      supabase.from('program_completions').select('program_session_id').eq('athlete_id', athleteId),
    ])
    const completedIds = new Set((completions || []).map(c => c.program_session_id))
    const progs = (data || []).map(p => ({
      ...p,
      sessions: [...(p.program_sessions || [])].sort((a, b) => a.order_index - b.order_index)
    }))
    // Un programme récurrent (ex: "Avant-Match" chaque semaine) se retrouve en haut, avec sa
    // prochaine séance visible sans avoir à déplier — retour terrain : trop de clics pour un
    // programme qu'on relance sans arrêt.
    progs.sort((a, b) => (b.is_recurrent === true) - (a.is_recurrent === true))
    setPrograms(progs)
    setCompletedSessionIds(completedIds)
  }

  async function createFreeSession() {
    setCreatingFree(true)
    const coachId = await getCoachId()
    const dateLabel = new Date().toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })
    const { data: prog, error } = await supabase.from('programs')
      .insert({ athlete_id: athleteId, title: `Séance libre — ${dateLabel}`, coach_id: coachId })
      .select().single()
    if (!prog) { alert('Erreur : ' + (error?.message || 'impossible de créer la séance')); setCreatingFree(false); return }
    const { data: sess } = await supabase.from('program_sessions')
      .insert({ program_id: prog.id, order_index: 0, title: 'Séance libre' })
      .select().single()
    router.push(sess ? `/programs/${athleteId}/${prog.id}/session/${sess.id}` : `/programs/${athleteId}/${prog.id}`)
  }

  async function createProgram() {
    if (!newName.trim()) return
    setSaving(true)
    const { data } = await supabase.from('programs')
      .insert({ title: newName.trim(), athlete_id: athleteId, activity_type: newActivityType })
      .select().single()
    if (data) {
      const prog = { ...data, sessions: [] }
      setPrograms(prev => [prog, ...prev])
      setExpandedId(data.id)
    }
    setNewName('')
    setNewActivityType('Musculation 🏋️')
    setCreating(false)
    setSaving(false)
  }

  async function renameProgram(id) {
    if (!renameVal.trim()) return
    await supabase.from('programs').update({ title: renameVal.trim() }).eq('id', id)
    setPrograms(prev => prev.map(p => p.id === id ? { ...p, title: renameVal.trim() } : p))
    setRenamingId(null)
  }

  async function deleteProgram(id) {
    if (!window.confirm('Supprimer ce micro-cycle et toutes ses séances ?')) return

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
    if (expandedId === id) setExpandedId(null)
  }

  async function togglePinned(p) {
    const next = p.pinned_board === false ? true : false
    await supabase.from('programs').update({ pinned_board: next }).eq('id', p.id)
    setPrograms(prev => prev.map(x => x.id === p.id ? { ...x, pinned_board: next } : x))
  }

  async function toggleRecurrent(p) {
    const next = !p.is_recurrent
    const { error } = await supabase.from('programs').update({ is_recurrent: next }).eq('id', p.id)
    if (error) { alert("Cette version n'est pas encore déployée, réessaie dans quelques minutes."); return }
    setPrograms(prev => {
      const updated = prev.map(x => x.id === p.id ? { ...x, is_recurrent: next } : x)
      updated.sort((a, b) => (b.is_recurrent === true) - (a.is_recurrent === true))
      return updated
    })
  }

  async function toggleArchived(p) {
    const next = !p.archived
    await supabase.from('programs').update({ archived: next }).eq('id', p.id)
    setPrograms(prev => prev.map(x => x.id === p.id ? { ...x, archived: next } : x))
    if (expandedId === p.id) setExpandedId(null)
  }

  function openAssign(p) {
    setAssignModal(p)
    setSelectedIds([])
    setAssignDone(false)
  }

  function toggleAthlete(id) {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
  }

  async function assignProgram() {
    if (!selectedIds.length || !assignModal) return
    setAssigning(true)
    const coachId = await getCoachId()

    const { data: sessions } = await supabase
      .from('program_sessions')
      .select('*, program_exercises(*)')
      .eq('program_id', assignModal.id)
      .order('order_index')

    for (const targetId of selectedIds) {
      const { data: newProg } = await supabase.from('programs')
        .insert({ athlete_id: targetId, title: assignModal.title, coach_id: coachId, activity_type: assignModal.activity_type, source_program_id: assignModal.id })
        .select().single()
      if (!newProg) continue

      for (const sess of (sessions || [])) {
        const { data: newSess } = await supabase.from('program_sessions')
          .insert({ program_id: newProg.id, order_index: sess.order_index, title: sess.title || '', coach_notes: sess.coach_notes, activation: sess.activation, activation_videos: sess.activation_videos, warmup_content: sess.warmup_content || null, cooldown_content: sess.cooldown_content || null, circuits: sess.circuits, source_session_id: sess.id, session_type: sess.session_type || null, recurring_daily_target: sess.recurring_daily_target ?? null, week_number: sess.week_number, materiel: sess.materiel || null, day_of_week: sess.day_of_week ?? null, hidden_until_run: !!sess.hidden_until_run })
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
              note: e.note,
              materiel: e.materiel || null,
              video_url: e.video_url,
              superset_group: e.superset_group,
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

  async function createSession(programId) {
    const prog = programs.find(p => p.id === programId)
    const idx = prog?.sessions?.length || 0
    const { data } = await supabase.from('program_sessions')
      .insert({ program_id: programId, title: `Séance ${idx + 1}`, order_index: idx })
      .select().single()
    if (data) {
      setPrograms(prev => prev.map(p =>
        p.id === programId ? { ...p, sessions: [...p.sessions, data] } : p
      ))
      router.push(`/programs/${athleteId}/${programId}/session/${data.id}`)
    }
  }

  async function duplicateSession(sess, programId, forcedIdx = null) {
    const prog = programs.find(p => p.id === programId)
    const idx = forcedIdx !== null ? forcedIdx : (prog?.sessions?.length || 0)
    // `sess` ici ne porte que id/title/order_index (voir le select minimal qui charge `programs`
    // plus haut) — sans ce refetch, circuits/warmup/cooldown/timer de la séance source étaient
    // silencieusement ignorés à la copie alors que les exercices, eux, étaient bien dupliqués.
    const { data: srcSession } = await supabase.from('program_sessions')
      .select('circuits, coach_notes, activation, activation_videos, session_type, recurring_daily_target, materiel, activity_mode, warmup_block, cooldown_block, warmup_content, cooldown_content, timer_config')
      .eq('id', sess.id).single()
    const { data: newSess } = await supabase.from('program_sessions')
      .insert({
        ...srcSession,
        program_id: programId, title: sess.title + ' (copie)', order_index: idx,
        circuits: srcSession?.circuits || [], activation_videos: srcSession?.activation_videos || [],
      })
      .select().single()
    if (!newSess) return
    const { data: exos } = await supabase.from('program_exercises')
      .select('*').eq('program_session_id', sess.id).order('order_index')
    if (exos?.length) {
      await supabase.from('program_exercises').insert(
        exos.map(({ id, program_session_id, ...e }) => ({ ...e, program_session_id: newSess.id }))
      )
    }
    setPrograms(prev => prev.map(p =>
      p.id === programId ? { ...p, sessions: [...p.sessions, newSess] } : p
    ))
  }

  async function duplicateSelected(programId) {
    const prog = programs.find(p => p.id === programId)
    if (!prog) return
    const toDuplicate = prog.sessions.filter(s => selectedSessions.has(s.id))
    if (!toDuplicate.length) return
    setDuplicating(true)
    let nextIdx = prog.sessions.length
    for (const sess of toDuplicate) {
      await duplicateSession(sess, programId, nextIdx)
      nextIdx++
    }
    setSelectedSessions(new Set())
    setDuplicating(false)
  }

  function toggleSessionSelected(id) {
    setSelectedSessions(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function deleteSession(sessId, programId) {
    if (!window.confirm('Supprimer cette séance ?')) return

    const { data: exos } = await supabase.from('program_exercises').select('id').eq('program_session_id', sessId)
    const exoIds = (exos || []).map(e => e.id)
    if (exoIds.length) {
      await supabase.from('exercise_performance_history').delete().in('program_exercise_id', exoIds)
      await supabase.from('program_exercise_logs').delete().in('program_exercise_id', exoIds)
      await supabase.from('program_exercises').delete().in('id', exoIds)
    }
    await supabase.from('program_completions').delete().eq('program_session_id', sessId)

    const { error } = await supabase.from('program_sessions').delete().eq('id', sessId)
    if (error) { alert('Erreur : ' + error.message); return }
    setPrograms(prev => prev.map(p =>
      p.id === programId ? { ...p, sessions: p.sessions.filter(s => s.id !== sessId) } : p
    ))
  }

  return (
    <div style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 'var(--rl)', overflow: 'hidden' }}>

      {/* Header */}
      <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.4px', display: 'flex', alignItems: 'center', gap: 5 }}>
          <ArrowsClockwise size={13} /> Micro-cycles
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <Link
            href={`/programs/${athleteId}`}
            style={{ background: 'var(--green-light)', color: 'var(--green)', border: '1px solid #B8EAD8', borderRadius: 20, padding: '5px 12px', fontSize: 12, fontWeight: 700, textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 5 }}
          >
            <SquaresFour size={13} /> Tableau de bord
          </Link>
          <button
            onClick={createFreeSession}
            disabled={creatingFree}
            style={{ background: 'var(--bg2)', border: '1px solid var(--border2)', color: 'var(--text2)', borderRadius: 20, padding: '5px 12px', fontSize: 12, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5 }}
          >
            {creatingFree ? '…' : <><Lightning size={13} /> Séance libre</>}
          </button>
          <button
            onClick={() => { setCreating(true); setNewName('') }}
            style={{ background: 'var(--green)', color: '#fff', border: 'none', borderRadius: 20, padding: '5px 12px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}
          >
            + Créer
          </button>
        </div>
      </div>

      {/* Formulaire création */}
      {creating && (
        <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 8, borderBottom: '1px solid var(--border)', background: 'var(--bg2)' }}>
          <input
            autoFocus
            placeholder="Nom du micro-cycle…"
            value={newName}
            onChange={e => setNewName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') createProgram(); if (e.key === 'Escape') setCreating(false) }}
            style={{ padding: '9px 12px', border: '1px solid var(--border2)', borderRadius: 'var(--r)', fontSize: 14, outline: 'none', background: 'var(--bg)', color: 'var(--text)' }}
          />
          <ActivityTypeSelect value={newActivityType} onChange={setNewActivityType} />
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => setCreating(false)} style={{ flex: 1, background: 'none', border: '1px solid var(--border2)', borderRadius: 'var(--r)', padding: '9px 10px', fontSize: 14, cursor: 'pointer', color: 'var(--text3)' }}>Annuler</button>
            <button onClick={createProgram} disabled={saving || !newName.trim()}
              style={{ flex: 2, background: 'var(--green)', color: '#fff', border: 'none', borderRadius: 'var(--r)', padding: '9px 14px', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
              {saving ? '…' : 'Créer'}
            </button>
          </div>
        </div>
      )}

      {/* Vide */}
      {programs.filter(p => !p.archived).length === 0 && !creating && (
        <div style={{ padding: '24px 14px', textAlign: 'center', color: 'var(--text3)', fontSize: 13 }}>
          Aucun micro-cycle — clique sur "+ Créer" pour commencer
        </div>
      )}

      {/* Liste des micro-cycles */}
      {programs.filter(p => !p.archived).map((prog, pi) => {
        const isOpen = expandedId === prog.id
        const isRenaming = renamingId === prog.id
        const nextSession = prog.is_recurrent
          ? prog.sessions.find(s => !completedSessionIds.has(s.id))
          : null

        return (
          <div key={prog.id} style={{ borderTop: '1px solid var(--border)' }}>

            {/* En-tête programme */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '11px 14px', cursor: 'pointer' }}
              onClick={() => !isRenaming && setExpandedId(isOpen ? null : prog.id)}>
              <span style={{ fontSize: 11, color: 'var(--text3)', width: 14, flexShrink: 0 }}>{isOpen ? '▼' : '▶'}</span>

              {isRenaming ? (
                <input
                  autoFocus
                  value={renameVal}
                  onChange={e => setRenameVal(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') renameProgram(prog.id); if (e.key === 'Escape') setRenamingId(null) }}
                  onBlur={() => renameProgram(prog.id)}
                  onClick={e => e.stopPropagation()}
                  style={{ flex: 1, padding: '4px 8px', border: '1px solid var(--border2)', borderRadius: 6, fontSize: 14, fontWeight: 700, outline: 'none', background: 'var(--bg2)', color: 'var(--text)' }}
                />
              ) : (
                <Link
                  href={`/programs/${athleteId}/${prog.id}`}
                  onClick={e => e.stopPropagation()}
                  onDoubleClick={e => { e.preventDefault(); e.stopPropagation(); setRenamingId(prog.id); setRenameVal(prog.title) }}
                  title="Ouvrir en plein écran"
                  style={{ flex: 1, fontWeight: 700, fontSize: 14, color: 'var(--text)', textDecoration: 'none' }}
                >
                  {prog.title}
                </Link>
              )}

              <span style={{ fontSize: 11, color: 'var(--text3)', flexShrink: 0 }}>
                {prog.sessions.length} séance{prog.sessions.length !== 1 ? 's' : ''}
              </span>
              {!isRenaming && (
                <button
                  onClick={e => { e.stopPropagation(); setRenamingId(prog.id); setRenameVal(prog.title) }}
                  title="Renommer"
                  style={{ background: 'none', border: 'none', display: 'flex', cursor: 'pointer', color: 'var(--text3)', padding: '0 2px', flexShrink: 0 }}
                ><PencilSimple size={13} /></button>
              )}
              <button
                onClick={e => { e.stopPropagation(); togglePinned(prog) }}
                title={prog.pinned_board === false ? 'Afficher dans le tableau de bord côte à côte' : 'Masquer du tableau de bord côte à côte'}
                style={{ background: 'none', border: 'none', display: 'flex', cursor: 'pointer', color: prog.pinned_board === false ? 'var(--text3)' : 'var(--green)', padding: '0 2px', flexShrink: 0 }}
              ><PushPin size={13} weight={prog.pinned_board === false ? 'regular' : 'fill'} /></button>
              <button
                onClick={e => { e.stopPropagation(); toggleRecurrent(prog) }}
                title={prog.is_recurrent ? 'Retirer des programmes récurrents' : 'Marquer comme programme récurrent'}
                style={{ background: 'none', border: 'none', display: 'flex', cursor: 'pointer', color: prog.is_recurrent ? 'var(--green)' : 'var(--text3)', padding: '0 2px', flexShrink: 0 }}
              ><Repeat size={13} weight={prog.is_recurrent ? 'bold' : 'regular'} /></button>
              {allAthletes.length > 0 && (
                <button
                  onClick={e => { e.stopPropagation(); openAssign(prog) }}
                  title="Copier chez un autre sportif"
                  style={{ background: 'none', border: 'none', display: 'flex', cursor: 'pointer', color: 'var(--text3)', padding: '0 2px', flexShrink: 0 }}
                ><UsersThree size={13} /></button>
              )}
              <button
                onClick={e => { e.stopPropagation(); toggleArchived(prog) }}
                title="Archiver"
                style={{ background: 'none', border: 'none', display: 'flex', cursor: 'pointer', color: 'var(--text3)', padding: '0 2px', flexShrink: 0 }}
              ><Package size={13} /></button>
              <button
                onClick={e => { e.stopPropagation(); deleteProgram(prog.id) }}
                style={{ background: 'none', border: 'none', display: 'flex', cursor: 'pointer', color: 'var(--text3)', padding: '0 2px', flexShrink: 0 }}
              ><Trash size={14} /></button>
            </div>

            {/* Prochaine séance du programme récurrent, visible sans déplier */}
            {prog.is_recurrent && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '0 14px 11px 36px' }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--green)', background: 'var(--green-light)', border: '1px solid #B8EAD8', borderRadius: 20, padding: '2px 8px', display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
                  <Repeat size={11} weight="bold" /> Récurrent
                </span>
                {nextSession ? (
                  <>
                    <span style={{ flex: 1, fontSize: 13, color: 'var(--text2)' }}>
                      Prochaine séance : <strong>{nextSession.title}</strong>
                    </span>
                    {athleteToken && (
                      <Link
                        href={`/s/${athleteToken}?coach=1&session=${nextSession.id}&focus=1`}
                        onClick={e => e.stopPropagation()}
                        title="Lancer cette séance (coaching)"
                        style={{ background: 'none', border: 'none', display: 'flex', cursor: 'pointer', color: 'var(--green)', padding: '2px 4px', flexShrink: 0, textDecoration: 'none' }}
                      ><Barbell size={16} /></Link>
                    )}
                  </>
                ) : (
                  <span style={{ flex: 1, fontSize: 13, color: 'var(--text3)' }}>Toutes les séances ont été faites</span>
                )}
              </div>
            )}

            {/* Séances */}
            {isOpen && (
              <div style={{ borderTop: '1px solid var(--border)', background: 'var(--bg2)' }}>
                {prog.sessions.length === 0 && (
                  <div style={{ padding: '10px 14px 0', fontSize: 12, color: 'var(--text3)' }}>
                    Aucune séance
                  </div>
                )}

                {prog.sessions.map((sess, si) => (
                  <div key={sess.id}
                    style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', borderBottom: '1px solid var(--border)' }}>
                    <input
                      type="checkbox"
                      checked={selectedSessions.has(sess.id)}
                      onChange={() => toggleSessionSelected(sess.id)}
                      style={{ accentColor: 'var(--green)', width: 15, height: 15, flexShrink: 0, cursor: 'pointer' }}
                    />
                    <span style={{ fontSize: 12, color: 'var(--text3)', fontWeight: 700, width: 18, flexShrink: 0 }}>
                      {si + 1}
                    </span>
                    <Link
                      href={`/programs/${athleteId}/${prog.id}/session/${sess.id}`}
                      style={{ flex: 1, fontWeight: 600, fontSize: 13, color: 'var(--text)', textDecoration: 'none' }}
                    >
                      {sess.title || `Séance ${si + 1}`}
                    </Link>
                    {athleteToken && (
                      // Reste dans l'app (Link + pas de target="_blank") : le coaching en direct est
                      // un espace normal de l'app, pas un onglet séparé qui peut se perdre si le coach
                      // quitte l'app pendant la séance — retour terrain.
                      <Link
                        href={`/s/${athleteToken}?coach=1&session=${sess.id}&focus=1`}
                        title="Lancer cette séance (coaching)"
                        style={{ background: 'none', border: 'none', display: 'flex', cursor: 'pointer', color: 'var(--green)', padding: '2px 4px', flexShrink: 0, textDecoration: 'none' }}
                      ><Barbell size={16} /></Link>
                    )}
                    <button
                      onClick={() => duplicateSession(sess, prog.id)}
                      title="Dupliquer"
                      style={{ background: 'none', border: 'none', fontSize: 16, cursor: 'pointer', color: 'var(--text3)', padding: '2px 4px', flexShrink: 0 }}
                    >⧉</button>
                    <button
                      onClick={() => deleteSession(sess.id, prog.id)}
                      title="Supprimer"
                      style={{ background: 'none', border: 'none', display: 'flex', cursor: 'pointer', color: 'var(--text3)', padding: '2px 4px', flexShrink: 0 }}
                    ><Trash size={14} /></button>
                  </div>
                ))}

                {prog.sessions.some(s => selectedSessions.has(s.id)) && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', borderBottom: '1px solid var(--border)', background: 'var(--green-light)' }}>
                    <span style={{ flex: 1, fontSize: 12, fontWeight: 700, color: 'var(--green)' }}>
                      {prog.sessions.filter(s => selectedSessions.has(s.id)).length} sélectionnée(s)
                    </span>
                    <button
                      onClick={() => duplicateSelected(prog.id)}
                      disabled={duplicating}
                      style={{ background: 'var(--green)', color: '#fff', border: 'none', borderRadius: 20, padding: '5px 12px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}
                    >
                      {duplicating ? '…' : '⧉ Dupliquer'}
                    </button>
                    <button
                      onClick={() => setSelectedSessions(new Set())}
                      style={{ background: 'none', border: '1px solid var(--border2)', borderRadius: 20, padding: '5px 12px', fontSize: 12, fontWeight: 600, color: 'var(--text3)', cursor: 'pointer' }}
                    >
                      Annuler
                    </button>
                  </div>
                )}

                <button
                  onClick={() => createSession(prog.id)}
                  style={{ width: '100%', background: 'none', border: 'none', padding: '10px 14px', fontSize: 13, color: 'var(--green)', fontWeight: 700, cursor: 'pointer', textAlign: 'left' }}
                >
                  + Ajouter une séance
                </button>
              </div>
            )}
          </div>
        )
      })}

      {programs.some(p => p.archived) && (
        <div style={{ borderTop: '1px solid var(--border)' }}>
          <button
            onClick={() => setShowArchived(v => !v)}
            style={{ width: '100%', textAlign: 'left', background: 'none', border: 'none', padding: '10px 14px', fontSize: 12, fontWeight: 700, color: 'var(--text3)', cursor: 'pointer' }}
          >
            {showArchived ? '▲' : '▼'} Programmes archivés ({programs.filter(p => p.archived).length})
          </button>
          {showArchived && programs.filter(p => p.archived).map(prog => (
            <div key={prog.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', borderTop: '1px solid var(--border)', opacity: 0.7 }}>
              <Link href={`/programs/${athleteId}/${prog.id}`} style={{ flex: 1, fontWeight: 600, fontSize: 13, color: 'var(--text)', textDecoration: 'none' }}>
                {prog.title}
              </Link>
              <span style={{ fontSize: 11, color: 'var(--text3)', flexShrink: 0 }}>
                {prog.sessions.length} séance{prog.sessions.length !== 1 ? 's' : ''}
              </span>
              <button onClick={() => toggleArchived(prog)} title="Désarchiver"
                style={{ background: 'none', border: 'none', display: 'flex', cursor: 'pointer', color: 'var(--green)', padding: '0 2px', flexShrink: 0 }}><ArrowsClockwise size={13} /></button>
              <button onClick={() => deleteProgram(prog.id)} title="Supprimer"
                style={{ background: 'none', border: 'none', display: 'flex', cursor: 'pointer', color: 'var(--text3)', padding: '0 2px', flexShrink: 0 }}><Trash size={14} /></button>
            </div>
          ))}
        </div>
      )}

      {/* Modal copie vers un autre sportif */}
      {assignModal && (
        <div onClick={() => setAssignModal(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 400, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: 'var(--bg)', borderRadius: 'var(--rl)', padding: 20, width: '100%', maxWidth: 380, boxShadow: '0 8px 40px rgba(0,0,0,0.2)' }}>
            <div style={{ fontFamily: 'var(--font-title)', color: 'var(--title)', fontWeight: 700, fontSize: 17, marginBottom: 4 }}>Copier chez un autre sportif</div>
            <div style={{ fontSize: 13, color: 'var(--text3)', marginBottom: 16 }}>
              "{assignModal.title}" sera copié pour chaque sportif sélectionné.
            </div>

            {assignDone ? (
              <div style={{ textAlign: 'center', padding: '20px 0' }}>
                <div style={{ display: 'flex', justifyContent: 'center', color: '#16A34A', marginBottom: 8 }}><CheckCircle size={32} /></div>
                <div style={{ fontWeight: 700, marginBottom: 4 }}>Micro-cycle copié !</div>
                <div style={{ fontSize: 13, color: 'var(--text3)', marginBottom: 16 }}>
                  Une copie a été créée pour {selectedIds.length} sportif{selectedIds.length > 1 ? 's' : ''}.
                </div>
                <button onClick={() => setAssignModal(null)} style={{ background: 'var(--green)', color: '#fff', border: 'none', borderRadius: 'var(--r)', padding: '10px 24px', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
                  Fermer
                </button>
              </div>
            ) : (
              <>
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
                    {assigning ? 'Copie…' : `Copier chez ${selectedIds.length || '—'} sportif${selectedIds.length > 1 ? 's' : ''}`}
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
