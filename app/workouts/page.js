'use client'

import { useState, useEffect } from 'react'
import { Barbell, MagnifyingGlass, Plus, Trash, CopySimple, DotsThreeVertical } from '@phosphor-icons/react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import AthletesSidebar from '@/app/components/AthletesSidebar'
import ActivityTypeSelect from '@/app/components/ActivityTypeSelect'
import { getCoachId } from '@/lib/coach'
import { cloneTemplateToAthlete } from '@/lib/programTemplates'

function today() {
  const n = new Date()
  return [n.getFullYear(), String(n.getMonth() + 1).padStart(2, '0'), String(n.getDate()).padStart(2, '0')].join('-')
}

// Un "workout" est un programme (table programs) marqué is_workout, réduit à une seule séance —
// il réutilise donc tout ce qui existe déjà pour les séances (exercices, supersets, warmup/cooldown,
// timers…) au lieu de dupliquer cette logique dans un nouveau modèle de données.
export default function WorkoutsPage() {
  const router = useRouter()
  const [workouts, setWorkouts] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [formOpen, setFormOpen] = useState(false)
  const [creating, setCreating] = useState(false)
  const [newTitle, setNewTitle] = useState('')
  const [newActivity, setNewActivity] = useState('Musculation 🏋️')
  const [openActionsId, setOpenActionsId] = useState(null)
  const [duplicatingId, setDuplicatingId] = useState(null)

  useEffect(() => {
    load()
  }, [])

  async function load() {
    setLoading(true)
    const { data } = await supabase
      .from('programs')
      .select('*, program_sessions(id, title, program_exercises(id))')
      .eq('is_workout', true)
      .order('created_at', { ascending: false })
    setWorkouts(data || [])
    setLoading(false)
  }

  const createWorkout = async () => {
    if (!newTitle.trim()) return
    setCreating(true)
    const coachId = await getCoachId()
    const { data: prog, error } = await supabase.from('programs')
      .insert({ title: newTitle.trim(), coach_id: coachId, activity_type: newActivity, is_workout: true })
      .select().single()
    if (prog) {
      await supabase.from('program_sessions').insert({ program_id: prog.id, order_index: 0, title: newTitle.trim() })
      router.push(`/workouts/${prog.id}`)
      return
    }
    if (error) { console.error(error); alert(`Erreur lors de la création : ${error.message}`) }
    setCreating(false)
  }

  const duplicateWorkout = async (w) => {
    setDuplicatingId(w.id)
    const coachId = await getCoachId()
    const copy = await cloneTemplateToAthlete({
      templateProgramId: w.id, templateTitle: `${w.title} (copie)`, templateActivityType: w.activity_type,
      athleteId: null, coachId,
    })
    setDuplicatingId(null)
    setOpenActionsId(null)
    if (!copy) { alert('Erreur lors de la duplication.'); return }
    await supabase.from('programs').update({ is_workout: true }).eq('id', copy.id)
    load()
  }

  const deleteWorkout = async (w) => {
    if (!confirm(`Supprimer le workout "${w.title}" ?`)) return
    const sessionIds = (w.program_sessions || []).map(s => s.id)
    if (sessionIds.length) {
      const { data: exos } = await supabase.from('program_exercises').select('id').in('program_session_id', sessionIds)
      const exoIds = (exos || []).map(e => e.id)
      if (exoIds.length) await supabase.from('program_exercises').delete().in('id', exoIds)
      await supabase.from('program_sessions').delete().in('id', sessionIds)
    }
    await supabase.from('programs').delete().eq('id', w.id)
    setWorkouts(prev => prev.filter(x => x.id !== w.id))
    setOpenActionsId(null)
  }

  const filtered = workouts.filter(w => {
    if (!search.trim()) return true
    const title = w.program_sessions?.[0]?.title || w.title || ''
    return title.toLowerCase().includes(search.trim().toLowerCase())
  })

  return (
    <div className="coach-layout" style={{ background: 'var(--bg2)' }}>
      <AthletesSidebar date={today()} />
      <div className="coach-main" style={{ paddingBottom: 60 }}>
        <div style={{ background: 'var(--bg)', borderBottom: '1px solid var(--border)', padding: '14px 16px', position: 'sticky', top: 0, zIndex: 10, display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ flex: 1, fontFamily: 'var(--font-title)', color: 'var(--title)', fontWeight: 700, fontSize: 19, display: 'flex', alignItems: 'center', gap: 8 }}>
            <Barbell size={20} /> Workouts
          </div>
          <button onClick={() => { setFormOpen(true); setNewTitle(''); setNewActivity('Musculation 🏋️') }}
            style={{ background: 'var(--green)', color: '#fff', border: 'none', borderRadius: 'var(--r)', padding: '8px 14px', fontSize: 13, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
            <Plus size={14} weight="bold" /> Nouveau workout
          </button>
        </div>

        <div style={{ margin: '14px 16px 0', fontSize: 13, color: 'var(--text3)', maxWidth: 640 }}>
          Des séances types, indépendantes d&apos;un programme, à réutiliser telles quelles ou à insérer dans un programme ou un cycle d&apos;entraînement.
        </div>

        <div style={{ margin: '14px 16px 0', position: 'relative', maxWidth: 340 }}>
          <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', display: 'flex', color: 'var(--text3)' }}><MagnifyingGlass size={14} /></span>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Rechercher un workout…"
            style={{ width: '100%', boxSizing: 'border-box', padding: '9px 10px 9px 32px', border: '1px solid var(--border2)', borderRadius: 'var(--r)', fontSize: 13, outline: 'none', background: 'var(--bg)', color: 'var(--text)' }} />
        </div>

        {formOpen && (
          <div style={{ margin: '14px 16px 0', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 'var(--rl)', padding: 14, display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'flex-end', maxWidth: 640 }}>
            <div style={{ flex: 1, minWidth: 180 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: 4 }}>Nom du workout</div>
              <input autoFocus value={newTitle} onChange={e => setNewTitle(e.target.value)} onKeyDown={e => e.key === 'Enter' && createWorkout()}
                placeholder="Ex : Full Body 45min"
                style={{ width: '100%', boxSizing: 'border-box', padding: '8px 10px', border: '1px solid var(--border2)', borderRadius: 'var(--r)', fontSize: 13, outline: 'none', background: 'var(--bg2)', color: 'var(--text)' }} />
            </div>
            <ActivityTypeSelect value={newActivity} onChange={setNewActivity} inputStyle={{ fontSize: 12, fontWeight: 600, borderRadius: 20, padding: '8px 12px' }} />
            <button onClick={createWorkout} disabled={!newTitle.trim() || creating} style={{ background: 'var(--green)', color: '#fff', border: 'none', borderRadius: 'var(--r)', padding: '8px 14px', fontSize: 12, fontWeight: 700, cursor: 'pointer', opacity: (!newTitle.trim() || creating) ? 0.5 : 1 }}>{creating ? 'Création…' : 'Créer'}</button>
            <button onClick={() => setFormOpen(false)} style={{ background: 'none', border: '1px solid var(--border2)', borderRadius: 'var(--r)', padding: '8px 14px', fontSize: 12, cursor: 'pointer', color: 'var(--text3)' }}>Annuler</button>
          </div>
        )}

        <div style={{ margin: '14px 16px 0', display: 'flex', flexDirection: 'column', gap: 8, maxWidth: 640 }}>
          {loading ? (
            <div style={{ fontSize: 13, color: 'var(--text3)' }}>Chargement…</div>
          ) : filtered.length === 0 ? (
            <div style={{ fontSize: 13, color: 'var(--text3)', fontStyle: 'italic' }}>Aucun workout pour l&apos;instant.</div>
          ) : filtered.map(w => {
            const sess = w.program_sessions?.[0]
            const exoCount = sess?.program_exercises?.length || 0
            const displayTitle = sess?.title || w.title || 'Sans titre'
            return (
              <div key={w.id} style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 'var(--r)', padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 10 }}>
                <button onClick={() => router.push(`/workouts/${w.id}`)} style={{ flex: 1, minWidth: 0, textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--text)' }}>{displayTitle}</div>
                  <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 2 }}>{w.activity_type || 'Musculation 🏋️'} · {exoCount} exercice{exoCount !== 1 ? 's' : ''}</div>
                </button>
                <div style={{ position: 'relative', flexShrink: 0 }}>
                  <button onClick={() => setOpenActionsId(openActionsId === w.id ? null : w.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text3)', padding: 6, display: 'flex' }}>
                    <DotsThreeVertical size={18} weight="bold" />
                  </button>
                  {openActionsId === w.id && (
                    <>
                      <div onClick={() => setOpenActionsId(null)} style={{ position: 'fixed', inset: 0, zIndex: 90 }} />
                      <div style={{ position: 'absolute', right: 0, top: '100%', marginTop: 4, width: 180, background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 'var(--r)', boxShadow: '0 8px 24px rgba(0,0,0,0.15)', zIndex: 100, padding: 4, display: 'flex', flexDirection: 'column', gap: 2 }}>
                        <button onClick={() => duplicateWorkout(w)} disabled={duplicatingId === w.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', borderRadius: 6, fontSize: 12, color: 'var(--text)', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', fontWeight: 600 }}>
                          <CopySimple size={13} /> {duplicatingId === w.id ? 'Duplication…' : 'Dupliquer'}
                        </button>
                        <button onClick={() => deleteWorkout(w)} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', borderRadius: 6, fontSize: 12, color: '#DC2626', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', fontWeight: 600 }}>
                          <Trash size={13} /> Supprimer
                        </button>
                      </div>
                    </>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
