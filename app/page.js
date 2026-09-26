'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { User, Warning, ClipboardText, Barbell, Bell, CalendarBlank, Backpack, Plus, X, UsersThree, Play } from '@phosphor-icons/react'
import { supabase } from '@/lib/supabase'
import Link from 'next/link'
import AthletesSidebar from '@/app/components/AthletesSidebar'
import ChatHeaderButton from '@/app/components/ChatHeaderButton'
import NotificationBell from '@/app/components/NotificationBell'
import { getCoachId } from '@/lib/coach'
import LancerCoachingModal from '@/app/components/coach/LancerCoachingModal'
import MouvementsAFilmer from '@/app/components/coach/MouvementsAFilmer'

function today() {
  const n = new Date()
  return [n.getFullYear(), String(n.getMonth()+1).padStart(2,'0'), String(n.getDate()).padStart(2,'0')].join('-')
}

function tomorrow() {
  const n = new Date()
  n.setDate(n.getDate() + 1)
  return [n.getFullYear(), String(n.getMonth()+1).padStart(2,'0'), String(n.getDate()).padStart(2,'0')].join('-')
}

function formatDateLong(d) {
  return new Date(d + 'T00:00:00').toLocaleDateString('fr-FR', {
    weekday: 'long', day: 'numeric', month: 'long'
  })
}

function initials(name) {
  return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)
}

const PERIOD_OPTIONS = [
  { key: 'today', label: "Aujourd'hui", title: 'ACTIVITÉ DU JOUR' },
  { key: 'week', label: 'Cette semaine', title: 'ACTIVITÉ · CETTE SEMAINE' },
  { key: 'month', label: 'Ce mois-ci', title: 'ACTIVITÉ · CE MOIS-CI' },
  { key: 'year', label: 'Cette année', title: 'ACTIVITÉ · CETTE ANNÉE' },
]

// Bornes (inclusives) de la période sélectionnée, en YYYY-MM-DD — comparable directement en
// chaîne aux dates des séances/activités (mêmes format que today()/tomorrow() ci-dessus).
function periodBounds(period) {
  const now = new Date()
  const fmt = x => [x.getFullYear(), String(x.getMonth() + 1).padStart(2, '0'), String(x.getDate()).padStart(2, '0')].join('-')
  if (period === 'today') { const t = fmt(now); return { start: t, end: t } }
  if (period === 'week') {
    const dayIdx = (now.getDay() + 6) % 7 // lundi = 0
    const start = new Date(now); start.setDate(now.getDate() - dayIdx)
    const end = new Date(start); end.setDate(start.getDate() + 6)
    return { start: fmt(start), end: fmt(end) }
  }
  if (period === 'month') {
    return { start: fmt(new Date(now.getFullYear(), now.getMonth(), 1)), end: fmt(new Date(now.getFullYear(), now.getMonth() + 1, 0)) }
  }
  return { start: `${now.getFullYear()}-01-01`, end: `${now.getFullYear()}-12-31` }
}

// Une séance/activité fusionnée (voir merged plus bas) porte sa date sous deux formats selon son
// origine : ISO complet (completed_at/validated_at) pour program/activity, YYYY-MM-DD brut pour
// legacy — on ramène tout au même préfixe comparable aux bornes de periodBounds.
function sessionDateKey(s) {
  return (s.type === 'program' || s.type === 'activity') ? s.date.slice(0, 10) : s.date
}

export default function Home() {
  const router = useRouter()
  const [athletes, setAthletes] = useState([])
  const [completedSessions, setCompletedSessions] = useState(null)
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [lancerCoachingOuvert, setLancerCoachingOuvert] = useState(false)
  const [showMissingMusclesModal, setShowMissingMusclesModal] = useState(false)
  const [copiedMissingMuscles, setCopiedMissingMuscles] = useState(false)
  const [newName, setNewName] = useState('')
  const [saving, setSaving] = useState(false)
  const [coachToken, setCoachToken] = useState(null)
  const [coachId, setCoachId] = useState(null)
  const [generatingToken, setGeneratingToken] = useState(false)
  const [selected, setSelected] = useState(null)
  const [browserSession, setBrowserSession] = useState(null)
  const [movementsMissingMuscles, setMovementsMissingMuscles] = useState([])
  const [tomorrowPlan, setTomorrowPlan] = useState(null)
  const [showAddCoaching, setShowAddCoaching] = useState(false)
  const [groups, setGroups] = useState([])
  const [period, setPeriod] = useState('today')

  const logout = async () => {
    await supabase.auth.signOut()
    window.location.href = '/login'
  }

  useEffect(() => {
    async function load() {
      // Verrou d'accès : cette page est réservée aux coachs. Un sportif mal aiguillé ici
      // (ex. lien d'invitation) est renvoyé vers son propre espace, pas vers le dashboard coach.
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }
      const { data: me } = await supabase.from('coaches').select('id').eq('id', user.id).single()
      if (!me) {
        const { data: athlete } = await supabase.from('athletes').select('token').eq('auth_user_id', user.id).single()
        router.push(athlete?.token ? `/s/${athlete.token}` : '/login')
        return
      }
      setCoachId(me.id)

      const [{ data: aths }, { data: sessions }, { data: progComps }, { data: actValidated }, { data: coachingPlan }, { data: myGroups }] = await Promise.all([
        supabase.from('athletes').select('*').neq('archived', true).order('created_at'),
        supabase
          .from('sessions')
          .select('id, date, title, coach_notes, athlete_id, athletes(id, name), exercises(id, name, sets, reps, kg, note, athlete_logs(sets_done, reps_done, kg_done, note))')
          .order('date', { ascending: false })
          .limit(40),
        supabase
          .from('program_completions')
          .select('id, completed_at, athlete_id, pleasure, difficulty, duration_minutes, athletes(id, name), program_sessions(id, title, program_id, program_exercises(id, name, sets, reps, kg, note))')
          .order('completed_at', { ascending: false })
          .limit(40),
        supabase
          .from('activity_logs')
          .select('id, athlete_id, athletes(id, name), label, km, duration_minutes, difficulty, validated_at')
          .not('validated_at', 'is', null)
          .order('validated_at', { ascending: false })
          .limit(40),
        // group_id/groups() pas encore migrés en base tant que le SQL n'a pas tourné : retombe sur
        // le select d'origine (sans groupe) plutôt que de faire planter tout le chargement du dashboard.
        (async () => {
          const res = await supabase
            .from('coaching_schedule')
            .select('id, athlete_id, group_id, athletes(id, name), groups(id, name), program_sessions(id, title, materiel, programs(title))')
            .eq('coach_id', me.id)
            .eq('date', tomorrow())
            .order('created_at')
          if (!res.error) return res
          return supabase
            .from('coaching_schedule')
            .select('id, athlete_id, athletes(id, name), program_sessions(id, title, materiel, programs(title))')
            .eq('coach_id', me.id)
            .eq('date', tomorrow())
            .order('created_at')
        })(),
        supabase.from('groups').select('id, name').order('name'),
      ])
      const athList = aths || []
      setTomorrowPlan(coachingPlan || [])
      setAthletes(athList)
      setGroups(myGroups || [])

      const progSessionIds = (progComps || []).flatMap(c => (c.program_sessions?.program_exercises || []).map(e => e.id))
      const { data: progLogs } = progSessionIds.length
        ? await supabase.from('program_exercise_logs').select('program_exercise_id, sets_done, reps_done, kg_done, note').in('program_exercise_id', progSessionIds)
        : { data: [] }
      const progLogsMap = {}
      ;(progLogs || []).forEach(l => { progLogsMap[l.program_exercise_id] = l })

      const { data: missingMuscles } = await supabase
        .from('movements')
        .select('id, name')
        .or('muscles.is.null,muscles.eq.')
        .order('name')
      setMovementsMissingMuscles(missingMuscles || [])

      // La ligne athletes marquée is_coach = le profil perso de ce coach (RLS la scope déjà à lui).
      const coach = athList.find(a => a.is_coach)
      if (coach) {
        if (coach.token) {
          setCoachToken(coach.token)
        } else {
          const token = crypto.randomUUID()
          const { data } = await supabase.from('athletes').update({ token }).eq('id', coach.id).select().single()
          if (data) setCoachToken(data.token)
        }
      }

      const legacyDone = (sessions || [])
        .filter(s => s.exercises?.some(e => e.athlete_logs?.length > 0))
        .map(s => ({
          id: `legacy-${s.id}`,
          type: 'legacy',
          date: s.date,
          sortKey: s.date,
          athleteId: s.athlete_id,
          athleteName: s.athletes?.name || '—',
          title: s.title,
          coachNotes: s.coach_notes,
          feedback: null,
          exosDone: s.exercises.filter(e => e.athlete_logs?.length > 0).map(e => ({
            id: e.id, name: e.name, sets: e.sets, reps: e.reps, kg: e.kg, note: e.note,
            log: e.athlete_logs[0],
          })),
        }))

      const progDone = (progComps || [])
        .filter(c => c.program_sessions)
        .map(c => ({
          id: `prog-${c.id}`,
          type: 'program',
          date: c.completed_at,
          sortKey: c.completed_at,
          athleteId: c.athlete_id,
          athleteName: c.athletes?.name || '—',
          programId: c.program_sessions?.program_id,
          sessionId: c.program_sessions?.id,
          title: c.program_sessions?.title,
          coachNotes: null,
          feedback: { pleasure: c.pleasure, difficulty: c.difficulty, duration_minutes: c.duration_minutes },
          exosDone: (c.program_sessions.program_exercises || []).filter(e => e.name).map(e => ({
            id: e.id, name: e.name, sets: e.sets, reps: e.reps, kg: e.kg, note: e.note,
            log: progLogsMap[e.id] || {},
          })),
        }))

      const activityDone = (actValidated || []).map(a => ({
        id: `activity-${a.id}`,
        type: 'activity',
        date: a.validated_at,
        sortKey: a.validated_at,
        athleteId: a.athlete_id,
        athleteName: a.athletes?.name || '—',
        title: a.label,
        coachNotes: null,
        feedback: { pleasure: null, difficulty: a.difficulty, duration_minutes: a.duration_minutes },
        km: a.km,
        exosDone: [],
      }))

      const merged = [...legacyDone, ...progDone, ...activityDone].sort((a, b) => b.sortKey.localeCompare(a.sortKey))
      setCompletedSessions(merged)
      setLoading(false)
    }
    load()
  }, [router])

  const createAthlete = async () => {
    const name = newName.trim()
    if (!name) return
    setSaving(true)
    const coachId = await getCoachId()
    const { data } = await supabase.from('athletes').insert({ name, coach_id: coachId }).select().single()
    if (data) setAthletes(prev => [...prev, data])
    setNewName('')
    setShowForm(false)
    setSaving(false)
  }

  const addCoachingEntry = async ({ athleteId, groupId, sessionId }) => {
    const payload = { coach_id: coachId, athlete_id: athleteId || null, group_id: groupId || null, program_session_id: sessionId, date: tomorrow() }
    const selectStr = 'id, athlete_id, group_id, athletes(id, name), groups(id, name), program_sessions(id, title, materiel, programs(title))'
    let { data, error } = await supabase.from('coaching_schedule').insert(payload).select(selectStr).single()
    if (error?.message?.includes('group_id')) {
      // Colonne group_id pas encore migrée en base : réessaie sans (coaching individuel classique
      // continue de fonctionner pendant que la migration groupe n'est pas encore passée).
      ;({ data, error } = await supabase.from('coaching_schedule').insert({ ...payload, group_id: undefined }).select(selectStr).single())
    }
    if (error) { alert('Erreur : ' + error.message); return }
    setTomorrowPlan(prev => [...(prev || []), data])
    setShowAddCoaching(false)
  }

  const removeCoachingEntry = async (id) => {
    await supabase.from('coaching_schedule').delete().eq('id', id)
    setTomorrowPlan(prev => prev.filter(e => e.id !== id))
  }

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100svh', color: 'var(--text3)' }}>
      Chargement…
    </div>
  )

  // "Clients 1:1" = statut manuel (is_1to1_client, basculé depuis la page Sportifs), pas
  // l'abonnement Ostryk — un client peut être suivi en 1:1 sans payer via l'abonnement de l'app
  // (virement, espèces...) et inversement. Les autres athlètes suivis sont "curiosité" — visibles
  // mais pas prioritaires.
  const clients1to1 = athletes.filter(a => !a.is_coach && a.is_1to1_client)
  const client1to1Ids = new Set(clients1to1.map(a => a.id))
  const bounds = periodBounds(period)
  const periodSessions = (completedSessions || []).filter(s => {
    const d = sessionDateKey(s)
    return d >= bounds.start && d <= bounds.end
  })
  const activeAthleteIds = new Set(periodSessions.map(s => s.athleteId))
  const activityByAthlete = {}
  periodSessions.forEach(s => {
    if (!activityByAthlete[s.athleteId]) activityByAthlete[s.athleteId] = { athleteId: s.athleteId, athleteName: s.athleteName, sessions: [] }
    activityByAthlete[s.athleteId].sessions.push(s)
  })
  const activityGroups = Object.values(activityByAthlete).sort((a, b) =>
    b.sessions[0].sortKey.localeCompare(a.sessions[0].sortKey)
  )
  const priorityGroups = activityGroups.filter(g => client1to1Ids.has(g.athleteId))
  const otherGroups = activityGroups.filter(g => !client1to1Ids.has(g.athleteId))
  const activePeriod = PERIOD_OPTIONS.find(p => p.key === period)

  const openSessionFromList = (s) => {
    if (s.type === 'program' && s.programId) setBrowserSession(s)
    else setSelected(s)
  }

  return (
    <div className="coach-layout" style={{ background: 'var(--bg2)' }}>
      <AthletesSidebar athleteId={null} date={today()} />
      <div className="coach-main">

        {/* Header */}
        <div style={{
          padding: '20px 16px 14px', background: 'var(--bg)',
          borderBottom: '1px solid var(--border)',
          display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
          position: 'sticky', top: 0, zIndex: 10
        }}>
          <div style={{ flex: 1, minWidth: 120 }}>
            <div style={{ fontFamily: 'var(--font-title)', color: 'var(--title)', fontSize: 21, fontWeight: 700 }}>OSTRYK</div>
            <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 1 }}>
              {athletes.length} sportif{athletes.length !== 1 ? 's' : ''}
            </div>
          </div>
          {coachId && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 2, flexShrink: 0 }}>
              <ChatHeaderButton coachId={coachId} />
              <NotificationBell coachId={coachId} />
            </div>
          )}
          {/* Boutons d'action : sur la ligne du titre quand il y a la place, sinon (téléphone) sur une
              ligne à part, alignés à droite — ils débordaient de l'écran. */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end', marginLeft: 'auto' }}>
          {/* Toggle Vue Sportif */}
          {coachToken && (
            <button
              onClick={() => router.push(`/s/${coachToken}?coach=1`)}
              style={{
                background: 'var(--green-light)', color: 'var(--green)',
                border: '1.5px solid #B8EAD8', borderRadius: 20,
                padding: '8px 14px', fontSize: 12, fontWeight: 700,
                cursor: 'pointer', flexShrink: 0, display: 'flex', alignItems: 'center', gap: 5
              }}
            >
              <User size={14} /> Switch to athlete
            </button>
          )}
          <button onClick={() => setLancerCoachingOuvert(true)} style={{
            background: 'var(--bordeaux)', color: '#fff', border: 'none', borderRadius: 20, padding: '8px 16px', fontSize: 13,
            fontWeight: 600, cursor: 'pointer', flexShrink: 0, display: 'flex', alignItems: 'center', gap: 6, fontFamily: 'inherit',
          }}><Play size={13} weight="fill" /> Lancer un coaching</button>
          <button onClick={() => setShowForm(v => !v)} style={{
            background: 'var(--green)', color: '#fff', border: 'none',
            borderRadius: 20, padding: '8px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer', flexShrink: 0
          }}>+ Sportif</button>
          </div>
        </div>

        {lancerCoachingOuvert && (
          <LancerCoachingModal
            athletes={athletes}
            onFermer={() => setLancerCoachingOuvert(false)}
            // L'écran de séance en mode coach vit sur la fiche du client : elle l'ouvre directement.
            onChoisir={(athleteId, sessionId) => router.push(`/athletes/${athleteId}?coaching=${sessionId}`)}
          />
        )}

        <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>

          {/* Formulaire ajout */}
          {showForm && (
            <div style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 'var(--rl)', padding: 14, display: 'flex', gap: 8 }}>
              <input
                autoFocus
                placeholder="Prénom Nom du sportif"
                value={newName}
                onChange={e => setNewName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && createAthlete()}
                style={{ flex: 1, padding: '10px 12px', border: '1px solid var(--border2)', borderRadius: 'var(--r)', fontSize: 14, outline: 'none', background: 'var(--bg2)' }}
              />
              <button onClick={createAthlete} disabled={saving} style={{
                background: 'var(--green)', color: '#fff', border: 'none',
                borderRadius: 'var(--r)', padding: '10px 16px', fontSize: 14, fontWeight: 600, cursor: 'pointer'
              }}>{saving ? '…' : 'Créer'}</button>
            </div>
          )}

          {/* Sélecteur de période */}
          <div style={{ display: 'flex', gap: 8, overflowX: 'auto' }}>
            {PERIOD_OPTIONS.map(opt => {
              const active = period === opt.key
              return (
                <button key={opt.key} onClick={() => setPeriod(opt.key)} style={{
                  flexShrink: 0, padding: '7px 14px', borderRadius: 20, fontSize: 13, fontWeight: 700, cursor: 'pointer',
                  background: active ? 'var(--bordeaux)' : 'none',
                  border: active ? 'none' : '1px solid #D8CFC0',
                  color: active ? '#fff' : 'var(--text2)',
                }}>
                  {opt.label}
                </button>
              )
            })}
          </div>

          {/* Bandeau 3 stats — les 2 dernières se recalculent selon la période, "Clients 1:1" reste
              un total (nombre de clients suivis en 1:1, indépendant de la période : voir "total"
              en dessous pour ne pas laisser croire à un bug quand elle ne bouge pas au changement
              de période, contrairement aux deux autres). */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
            {[
              { label: 'Clients 1:1', value: clients1to1.length, sub: 'total' },
              { label: 'Athlètes actifs', value: activeAthleteIds.size },
              { label: 'Séances validées', value: periodSessions.length },
            ].map(stat => (
              <div key={stat.label} style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 'var(--rl)', padding: '12px 10px', textAlign: 'center' }}>
                <div style={{ fontFamily: 'var(--font-title)', fontSize: 24, fontWeight: 700, color: 'var(--title)' }}>{stat.value}</div>
                <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2 }}>
                  {stat.label}{stat.sub && <span style={{ opacity: 0.7 }}> ({stat.sub})</span>}
                </div>
              </div>
            ))}
          </div>

          {/* Mouvements sans muscles renseignés */}
          {movementsMissingMuscles.length > 0 && (
            <button onClick={() => setShowMissingMusclesModal(true)} style={{
              display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none', textAlign: 'left', width: '100%',
              background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: 'var(--rl)', padding: '12px 14px', cursor: 'pointer', fontFamily: 'inherit',
            }}>
              <span style={{ display: 'flex', flexShrink: 0, color: '#92400E' }}><Warning size={20} /></span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#92400E' }}>
                  {movementsMissingMuscles.length} mouvement{movementsMissingMuscles.length !== 1 ? 's' : ''} sans muscle renseigné
                </div>
                <div style={{ fontSize: 12, color: '#92400E', opacity: 0.85, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {movementsMissingMuscles.map(m => m.name).join(', ')}
                </div>
              </div>
              <span style={{ fontSize: 12, fontWeight: 700, color: '#92400E', flexShrink: 0 }}>Voir →</span>
            </button>
          )}

          {/* Mouvements sans vidéo, ou avec la vidéo d'une autre chaîne que celle du coach */}
          <MouvementsAFilmer />

          {showMissingMusclesModal && (
            <div onClick={() => setShowMissingMusclesModal(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 500, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
              <div onClick={e => e.stopPropagation()} style={{ background: 'var(--bg)', borderRadius: 'var(--rl)', padding: 20, width: '100%', maxWidth: 400, maxHeight: '80svh', overflowY: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.4)', display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ flex: 1, fontFamily: 'var(--font-title)', color: 'var(--title)', fontWeight: 700, fontSize: 17, display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Warning size={16} /> {movementsMissingMuscles.length} mouvement{movementsMissingMuscles.length !== 1 ? 's' : ''} sans muscle
                  </div>
                  <button onClick={() => setShowMissingMusclesModal(false)} style={{ background: 'none', border: 'none', fontSize: 20, color: 'var(--text3)', cursor: 'pointer', padding: '2px 4px', lineHeight: 1 }}>×</button>
                </div>
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(movementsMissingMuscles.map(m => m.name).join('\n'))
                    setCopiedMissingMuscles(true)
                    setTimeout(() => setCopiedMissingMuscles(false), 1500)
                  }}
                  style={{
                    background: copiedMissingMuscles ? '#DCFCE7' : 'var(--bg2)', color: copiedMissingMuscles ? '#166534' : 'var(--text2)',
                    border: `1px solid ${copiedMissingMuscles ? '#BBF7D0' : 'var(--border2)'}`, borderRadius: 'var(--r)',
                    padding: '9px', fontSize: 13, fontWeight: 700, cursor: 'pointer',
                  }}>
                  {copiedMissingMuscles ? '✓ Liste copiée' : <><ClipboardText size={14} style={{ verticalAlign: -2, marginRight: 5 }} />Copier la liste</>}
                </button>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {movementsMissingMuscles.map(m => (
                    <Link key={m.id} href={`/movements/${m.id}`} onClick={() => setShowMissingMusclesModal(false)} style={{
                      display: 'block', padding: '10px 12px', background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 'var(--r)',
                      fontSize: 14, fontWeight: 600, color: 'var(--text)', textDecoration: 'none',
                    }}>
                      {m.name}
                    </Link>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Coaching de demain */}
          {athletes.length > 0 && (
            <div style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 'var(--rl)', padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ display: 'flex', color: 'var(--green)' }}><CalendarBlank size={16} /></span>
                <div style={{ flex: 1, fontSize: 13, fontWeight: 700, textTransform: 'capitalize' }}>
                  Coaching de demain · {formatDateLong(tomorrow())}
                </div>
                <button onClick={() => setShowAddCoaching(true)} style={{
                  background: 'var(--green-light)', color: 'var(--green)', border: 'none',
                  borderRadius: 20, padding: '5px 10px', fontSize: 12, fontWeight: 700, cursor: 'pointer',
                  display: 'flex', alignItems: 'center', gap: 4,
                }}>
                  <Plus size={13} /> Ajouter
                </button>
              </div>

              {tomorrowPlan === null ? (
                <div style={{ color: 'var(--text3)', fontSize: 13 }}>Chargement…</div>
              ) : tomorrowPlan.length === 0 ? (
                <div style={{ fontSize: 13, color: 'var(--text3)' }}>Aucun coaching planifié pour demain.</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {tomorrowPlan.map(entry => (
                    <div key={entry.id} style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 'var(--r)', padding: '10px 12px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontWeight: 700, fontSize: 13, display: 'flex', alignItems: 'center', gap: 5 }}>
                            {entry.group_id && <UsersThree size={13} style={{ flexShrink: 0, color: 'var(--text3)' }} />}
                            {entry.athletes?.name || entry.groups?.name || '—'}
                          </div>
                          <div style={{ fontSize: 12, color: 'var(--text3)' }}>
                            {entry.program_sessions?.title || 'Séance'}
                            {entry.program_sessions?.programs?.title ? ` · ${entry.program_sessions.programs.title}` : ''}
                          </div>
                        </div>
                        <button onClick={() => removeCoachingEntry(entry.id)} title="Retirer"
                          style={{ background: 'none', border: 'none', color: 'var(--text3)', cursor: 'pointer', padding: 4, display: 'flex' }}>
                          <X size={15} />
                        </button>
                      </div>
                      {entry.program_sessions?.materiel && (
                        <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid var(--border)', display: 'flex', gap: 6 }}>
                          <span style={{ flexShrink: 0, color: 'var(--text3)' }}><Backpack size={14} /></span>
                          <div style={{ fontSize: 12, color: 'var(--text2)', whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>{entry.program_sessions.materiel}</div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {showAddCoaching && (
            <AddCoachingModal
              athletes={athletes.filter(a => !a.is_coach)}
              groups={groups}
              onClose={() => setShowAddCoaching(false)}
              onAdd={addCoachingEntry}
            />
          )}

          {/* Activité de la période, groupée par client */}
          {!athletes.length && !showForm ? (
            <div style={{ textAlign: 'center', color: 'var(--text3)', padding: '60px 20px', border: '1px dashed var(--border2)', borderRadius: 'var(--rl)', background: 'var(--bg)' }}>
              <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 12 }}><Barbell size={36} /></div>
              <div style={{ fontWeight: 600, marginBottom: 6 }}>Aucun sportif</div>
              <div style={{ fontSize: 13 }}>Clique sur « + Sportif » pour commencer</div>
            </div>
          ) : (
            <>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                {activePeriod.title}
              </div>

              {completedSessions === null ? (
                <div style={{ color: 'var(--text3)', fontSize: 13, padding: '20px 0' }}>Chargement…</div>
              ) : activityGroups.length === 0 ? (
                <div style={{ textAlign: 'center', color: 'var(--text3)', padding: '40px 20px', border: '1px dashed var(--border2)', borderRadius: 'var(--rl)', background: 'var(--bg)' }}>
                  <div style={{ fontSize: 13 }}>Aucune activité sur cette période.</div>
                </div>
              ) : (
                <>
                  {priorityGroups.map(group => (
                    <AthleteActivityGroup key={group.athleteId} group={group} onOpenSession={openSessionFromList} />
                  ))}
                  {/* "Autres" = athlètes suivis hors abonnement 1:1 (curiosité) — une catégorie à
                      part, visible mais clairement secondaire par rapport aux vrais clients 1:1. */}
                  {otherGroups.length > 0 && (
                    <>
                      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.5px', marginTop: priorityGroups.length > 0 ? 6 : 0, opacity: 0.7 }}>
                        Autres athlètes
                      </div>
                      {otherGroups.map(group => (
                        <AthleteActivityGroup key={group.athleteId} group={group} onOpenSession={openSessionFromList} />
                      ))}
                    </>
                  )}
                </>
              )}
            </>
          )}
        </div>
      </div>
      {selected && <SessionDetailModal session={selected} onClose={() => setSelected(null)} />}
      {browserSession && (
        <SessionBrowserModal
          programId={browserSession.programId}
          initialSessionId={browserSession.sessionId}
          athleteId={browserSession.athleteId}
          athleteName={browserSession.athleteName}
          onClose={() => setBrowserSession(null)}
        />
      )}
    </div>
  )
}

// Accordéon par client (fermé par défaut) : titre = avatar + nom + nb d'activités, dépliage montre
// chaque activité de la période avec sa pill "✓ X exercices" — y compris à 0 (une activité type
// Strava sans exercices structurés n'est pas traitée différemment, volontairement : même style
// partout, pas de grisé ni de cas particulier visuel pour ne pas laisser croire à une anomalie.
function AthleteActivityGroup({ group, onOpenSession }) {
  const [open, setOpen] = useState(false)
  // Point discret sur l'en-tête replié quand au moins une activité du groupe mérite un coup d'œil
  // (note coach déjà laissée, ou ressenti/difficulté élevé remonté par l'athlète) — sans ça, trier
  // 15 clients sur "ce mois-ci" oblige à ouvrir chaque accordéon un par un pour repérer ce qui sort
  // du lot. Pas de texte, juste un indice visuel — le détail reste dans le dépliage/la modale.
  const needsAttention = group.sessions.some(s => s.coachNotes || (s.feedback?.difficulty != null && s.feedback.difficulty >= 8))
  return (
    <div style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 'var(--rl)', overflow: 'hidden' }}>
      <button onClick={() => setOpen(v => !v)} style={{
        width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px',
        background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit',
      }}>
        <div style={{ position: 'relative', flexShrink: 0 }}>
          <div style={{
            width: 36, height: 36, borderRadius: '50%',
            background: 'var(--green-light)', color: 'var(--green)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 800,
          }}>
            {initials(group.athleteName)}
          </div>
          {needsAttention && (
            <span title="Note coach ou ressenti élevé à voir" style={{
              position: 'absolute', top: -1, right: -1, width: 10, height: 10, borderRadius: '50%',
              background: 'var(--bordeaux)', border: '2px solid var(--bg)',
            }} />
          )}
        </div>
        <div style={{ flex: 1, minWidth: 0, fontWeight: 700, fontSize: 14 }}>{group.athleteName}</div>
        <div style={{ fontSize: 12, color: 'var(--text3)', flexShrink: 0 }}>
          {group.sessions.length} activité{group.sessions.length !== 1 ? 's' : ''}
        </div>
        <span style={{ color: 'var(--text3)', flexShrink: 0, display: 'flex', transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .15s' }}>▾</span>
      </button>

      {open && (
        <div style={{ borderTop: '1px solid var(--border)', display: 'flex', flexDirection: 'column' }}>
          {group.sessions.map((s, i) => (
            <button key={s.id} onClick={() => onOpenSession(s)} style={{
              display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '10px 14px',
              background: 'none', border: 'none', borderBottom: i < group.sessions.length - 1 ? '1px solid var(--border)' : 'none',
              cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit',
            }}>
              <div style={{ flex: 1, minWidth: 0, fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>
                {s.title || (s.type === 'activity' ? 'Activité' : 'Séance')}
              </div>
              <span style={{ fontSize: 12, fontWeight: 700, background: '#E4EDE7', color: 'var(--vert-foret)', borderRadius: 20, padding: '3px 10px', flexShrink: 0 }}>
                ✓ {s.exosDone.length} exercice{s.exosDone.length !== 1 ? 's' : ''}
              </span>
              <span style={{ color: 'var(--text3)', flexShrink: 0, display: 'flex' }}>›</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function SessionDetailModal({ session, onClose }) {
  const dateLabel = session.type === 'program' || session.type === 'activity' ? session.date.slice(0, 10) : session.date
  const f = session.feedback

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', zIndex: 1000 }}>
      <div onClick={e => e.stopPropagation()} style={{
        background: 'var(--bg)', borderRadius: '20px 20px 0 0', padding: 20, width: '100%', maxWidth: 480,
        maxHeight: '88svh', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 14,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 40, height: 40, borderRadius: '50%', flexShrink: 0,
            background: 'var(--green-light)', color: 'var(--green)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 800
          }}>
            {session.athleteName.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 800, fontSize: 16 }}>{session.athleteName}</div>
            <div style={{ fontSize: 12, color: 'var(--text3)', textTransform: 'capitalize' }}>{formatDateLong(dateLabel)}</div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: 'var(--text3)', padding: 4 }}>✕</button>
        </div>

        {session.title && <div style={{ fontSize: 14, fontWeight: 700 }}>{session.title}</div>}

        {(session.km != null || (f && (f.pleasure != null || f.difficulty != null || f.duration_minutes))) && (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {session.km != null && <Stat label="Distance" value={`${session.km} km`} />}
            {f?.pleasure != null && <Stat label="Plaisir" value={`${f.pleasure}/10`} />}
            {f?.difficulty != null && <Stat label={session.type === 'activity' ? 'RPE' : 'Difficulté'} value={`${f.difficulty}/10`} />}
            {f?.duration_minutes && <Stat label="Durée" value={`${f.duration_minutes} min`} />}
          </div>
        )}

        {session.coachNotes && (
          <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 'var(--r)', padding: '10px 12px', fontSize: 13, color: 'var(--text2)', fontStyle: 'italic', lineHeight: 1.6 }}>
            {session.coachNotes}
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {session.exosDone.map(e => {
            const log = e.log || {}
            const prescribed = [e.sets && `${e.sets} séries`, e.reps && `${e.reps} reps`, e.kg && `${e.kg} kg`].filter(Boolean).join(' · ')
            const done = [log.sets_done && `${log.sets_done} séries`, log.reps_done && `${log.reps_done} reps`, log.kg_done && `${log.kg_done} kg`].filter(Boolean).join(' · ')
            return (
              <div key={e.id} style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 'var(--r)', padding: '10px 12px' }}>
                <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 4 }}>{e.name}</div>
                {prescribed && <div style={{ fontSize: 12, color: 'var(--text3)' }}>Prescrit : {prescribed}</div>}
                {done && <div style={{ fontSize: 12, color: '#166534', fontWeight: 700, marginTop: 2 }}>Réalisé : {done}</div>}
                {e.note && <div style={{ fontSize: 12, color: 'var(--text3)', fontStyle: 'italic', marginTop: 4 }}>Note coach : {e.note}</div>}
                {log.note && <div style={{ fontSize: 12, color: 'var(--text2)', fontStyle: 'italic', marginTop: 4 }}>« {log.note} »</div>}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function Stat({ label, value }) {
  return (
    <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 'var(--r)', padding: '6px 12px', display: 'flex', flexDirection: 'column', gap: 1 }}>
      <div style={{ fontSize: 10, color: 'var(--text3)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.3px' }}>{label}</div>
      <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>{value}</div>
    </div>
  )
}

function SessionBrowserModal({ programId, initialSessionId, athleteId, athleteName, onClose }) {
  const [sessions, setSessions] = useState(null)
  const [visibleIndices, setVisibleIndices] = useState([0])

  useEffect(() => {
    async function load() {
      const { data: sessData } = await supabase
        .from('program_sessions')
        .select('id, title, order_index, coach_notes, program_exercises(id, name, sets, reps, kg, note, materiel, order_index)')
        .eq('program_id', programId)
        .order('order_index')

      const sessionIds = (sessData || []).map(s => s.id)
      const exoIds = (sessData || []).flatMap(s => (s.program_exercises || []).map(e => e.id))

      const [{ data: comps }, { data: logs }] = await Promise.all([
        sessionIds.length
          ? supabase.from('program_completions').select('program_session_id, pleasure, difficulty, duration_minutes, completed_at').eq('athlete_id', athleteId).in('program_session_id', sessionIds)
          : Promise.resolve({ data: [] }),
        exoIds.length
          ? supabase.from('program_exercise_logs').select('program_exercise_id, sets_done, reps_done, kg_done, note').eq('athlete_id', athleteId).in('program_exercise_id', exoIds)
          : Promise.resolve({ data: [] }),
      ])
      const compMap = {}
      ;(comps || []).forEach(c => { compMap[c.program_session_id] = c })
      const logMap = {}
      ;(logs || []).forEach(l => { logMap[l.program_exercise_id] = l })

      const list = (sessData || []).map(s => ({
        ...s,
        completion: compMap[s.id] || null,
        exercises: [...(s.program_exercises || [])]
          .sort((a, b) => a.order_index - b.order_index)
          .map(e => ({ ...e, log: logMap[e.id] || {} })),
      }))
      setSessions(list)
      const idx = list.findIndex(s => s.id === initialSessionId)
      setVisibleIndices([idx >= 0 ? idx : 0])
    }
    load()
  }, [programId, athleteId, initialSessionId])

  const duplicateSession = async (fullIndex) => {
    const s = sessions[fullIndex]
    const { data: newSession, error: sessErr } = await supabase.from('program_sessions')
      .insert({
        program_id: programId, order_index: sessions.length,
        title: s.title ? `${s.title} (copie)` : '',
        coach_notes: s.coach_notes || null,
      })
      .select().single()
    if (sessErr || !newSession) { alert('Erreur duplication : ' + sessErr?.message); return }

    const toInsert = s.exercises.filter(e => e.name).map((e, j) => ({
      program_session_id: newSession.id, order_index: j, name: e.name,
      sets: e.sets ?? null, reps: e.reps || null, kg: e.kg ?? null, note: e.note || null, materiel: e.materiel || null,
    }))
    let insertedExos = []
    if (toInsert.length) {
      const { data: inserted, error: insErr } = await supabase.from('program_exercises').insert(toInsert).select()
      if (insErr) { alert('Erreur duplication des exercices : ' + insErr.message); return }
      insertedExos = inserted || []
    }

    const newIndex = sessions.length
    setSessions(prev => [...prev, { ...newSession, completion: null, exercises: insertedExos.map(e => ({ ...e, log: {} })) }])
    setVisibleIndices(prev => {
      const idx = prev.indexOf(fullIndex)
      const next = [...prev]
      next.splice(idx + 1, 0, newIndex)
      return next
    })
  }

  if (sessions === null) return (
    <div style={{ position: 'fixed', inset: 0, background: 'var(--bg2)', zIndex: 900, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text3)' }}>
      Chargement…
    </div>
  )

  const sorted = [...visibleIndices].sort((a, b) => a - b)
  const min = sorted[0]
  const max = sorted[sorted.length - 1]
  const isFirst = min === 0
  const isLast = max === sessions.length - 1

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'var(--bg2)', zIndex: 900, display: 'flex', flexDirection: 'column' }}>
      <div style={{ background: 'var(--bg)', borderBottom: '1px solid var(--border)', padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
        <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 22, color: 'var(--text2)', cursor: 'pointer', padding: '2px 4px', lineHeight: 1 }}>←</button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <Link href={`/semaine/${athleteId}/${today()}`} style={{ fontFamily: 'var(--font-title)', color: 'var(--title)', fontWeight: 700, fontSize: 17, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textDecoration: 'none', display: 'block' }}>{athleteName}</Link>
          <div style={{ fontSize: 11, color: 'var(--text3)' }}>{sorted.map(i => i + 1).join(', ')} / {sessions.length}</div>
        </div>
      </div>

      <div style={{ flex: 1, overflow: 'auto', padding: 16, display: 'flex', alignItems: 'flex-start', gap: 10 }}>
        <button onClick={() => setVisibleIndices(v => [...v, min - 1])} disabled={isFirst}
          style={{ background: 'var(--bg)', border: '1px solid var(--border2)', borderRadius: 20, padding: '10px 16px', fontSize: 13, fontWeight: 700, color: isFirst ? 'var(--border2)' : 'var(--text2)', cursor: isFirst ? 'default' : 'pointer', flexShrink: 0, marginTop: 40, whiteSpace: 'nowrap' }}>
          ‹ Séance précédente
        </button>

        <div style={{ flex: 1, display: 'grid', gridTemplateColumns: `repeat(${sorted.length}, minmax(280px, 1fr))`, gap: 12 }}>
          {sorted.map(fullIndex => {
            const closeCard = () => {
              if (sorted.length === 1) { onClose(); return }
              setVisibleIndices(v => v.filter(i => i !== fullIndex))
            }
            return (
              <SessionMiniCard
                key={sessions[fullIndex].id}
                session={sessions[fullIndex]}
                onClose={closeCard}
                onDuplicate={() => duplicateSession(fullIndex)}
                athleteId={athleteId}
              />
            )
          })}
        </div>

        <button onClick={() => setVisibleIndices(v => [...v, max + 1])} disabled={isLast}
          style={{ background: 'var(--bg)', border: '1px solid var(--border2)', borderRadius: 20, padding: '10px 16px', fontSize: 13, fontWeight: 700, color: isLast ? 'var(--border2)' : 'var(--text2)', cursor: isLast ? 'default' : 'pointer', flexShrink: 0, marginTop: 40, whiteSpace: 'nowrap' }}>
          Séance suivante ›
        </button>
      </div>
    </div>
  )
}

function SessionMiniCard({ session, onClose, onDuplicate, athleteId }) {
  const isDone = !!session.completion
  const [notifying, setNotifying] = useState(false)
  const [notified, setNotified] = useState(false)

  const notifyAthlete = async () => {
    setNotifying(true)
    const res = await fetch(`/api/messages/${athleteId}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ body: `J'ai laissé des retours sur ta séance « ${session.title || 'Séance'} », va y jeter un œil !` }),
    })
    setNotifying(false)
    if (!res.ok) { alert('Erreur lors de l\'envoi du message.'); return }
    setNotified(true)
  }

  const saveSessionNote = async (value) => {
    await supabase.from('program_sessions').update({ coach_notes: value }).eq('id', session.id)
  }
  const saveExerciseNote = async (exerciseId, value) => {
    await supabase.from('program_exercises').update({ note: value }).eq('id', exerciseId)
  }
  const saveExerciseField = async (exerciseId, field, value) => {
    await supabase.from('program_exercises').update({ [field]: value }).eq('id', exerciseId)
  }

  const noteFieldStyle = {
    width: '100%', boxSizing: 'border-box', padding: '6px 8px', border: '1px solid var(--border2)',
    borderRadius: 6, fontSize: 11, outline: 'none', background: 'var(--bg)', color: 'var(--text2)',
    fontStyle: 'italic', resize: 'none', fontFamily: 'inherit', marginTop: 4,
  }
  const prescribedFieldStyleSmall = {
    width: 32, boxSizing: 'border-box', padding: '1px 3px', border: 'none', borderBottom: '1px solid var(--border2)',
    borderRadius: 0, fontSize: 10, outline: 'none', background: 'transparent', color: 'var(--text2)',
    fontFamily: 'inherit', textAlign: 'center',
  }

  return (
    <div style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 'var(--rl)', padding: 16, display: 'flex', flexDirection: 'column', gap: 10, minWidth: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{ flex: 1, fontWeight: 800, fontSize: 15, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{session.title || 'Séance'}</div>
        {isDone ? (
          <span style={{ background: '#DCFCE7', color: '#166534', borderRadius: 20, padding: '3px 10px', fontSize: 11, fontWeight: 700, flexShrink: 0 }}>✓ Faite</span>
        ) : (
          <span style={{ background: 'var(--bg2)', color: 'var(--text3)', borderRadius: 20, padding: '3px 10px', fontSize: 11, fontWeight: 700, flexShrink: 0 }}>À venir</span>
        )}
        {onDuplicate && (
          <button onClick={onDuplicate} title="Dupliquer cette séance"
            style={{ background: 'none', border: '1px solid var(--border2)', borderRadius: 20, padding: '3px 10px', fontSize: 11, fontWeight: 700, color: 'var(--text2)', cursor: 'pointer', flexShrink: 0, whiteSpace: 'nowrap' }}>
            ⧉ Dupliquer
          </button>
        )}
        {onClose && (
          <button onClick={onClose} title="Fermer cette séance" style={{ background: 'none', border: 'none', fontSize: 18, color: 'var(--text3)', cursor: 'pointer', padding: '0 2px', flexShrink: 0, lineHeight: 1 }}>×</button>
        )}
      </div>

      {isDone && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {session.completion.pleasure != null && <Stat label="Plaisir" value={`${session.completion.pleasure}/10`} />}
          {session.completion.difficulty != null && <Stat label="Difficulté" value={`${session.completion.difficulty}/10`} />}
          {session.completion.duration_minutes && <Stat label="Durée" value={`${session.completion.duration_minutes} min`} />}
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {session.exercises.filter(e => e.name).map(e => {
          const log = e.log || {}
          return (
            <div key={e.id} style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 'var(--r)', padding: '8px 10px' }}>
              <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 4 }}>{e.name}</div>

              {/* Prévu par le coach — discret, encore modifiable si besoin */}
              <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 4, fontSize: 10, color: 'var(--text3)', marginBottom: 8 }}>
                <span>Prévu :</span>
                <input type="text" defaultValue={e.sets || ''} placeholder="—"
                  onBlur={ev => saveExerciseField(e.id, 'sets', ev.target.value)}
                  style={prescribedFieldStyleSmall} /> séries ·
                <input type="text" defaultValue={e.reps || ''} placeholder="—"
                  onBlur={ev => saveExerciseField(e.id, 'reps', ev.target.value)}
                  style={prescribedFieldStyleSmall} /> reps ·
                <input type="text" defaultValue={e.kg || ''} placeholder="—"
                  onBlur={ev => saveExerciseField(e.id, 'kg', ev.target.value)}
                  style={prescribedFieldStyleSmall} /> kg
              </div>

              {/* Réalisé par le sportif — c'est ce qui compte le plus ici */}
              {(log.sets_done || log.reps_done || log.kg_done || log.note) ? (
                <div style={{ background: 'var(--green-light)', border: '1px solid #B8EAD8', borderRadius: 'var(--r)', padding: '10px 12px', marginBottom: 8 }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--green)', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: 8 }}>Réalisé</div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    {log.sets_done && <Stat label="Séries" value={log.sets_done} />}
                    {log.reps_done && <Stat label="Reps" value={log.reps_done} />}
                    {log.kg_done && <Stat label="Charge" value={`${log.kg_done} kg`} />}
                  </div>
                  {log.note && <div style={{ fontSize: 13, color: 'var(--text)', fontStyle: 'italic', marginTop: 8 }}>« {log.note} »</div>}
                </div>
              ) : (
                <div style={{ fontSize: 12, color: 'var(--text3)', fontStyle: 'italic', marginBottom: 8 }}>Pas encore réalisé</div>
              )}

              <textarea
                placeholder="Note coach pour cet exercice…"
                defaultValue={e.note || ''}
                onBlur={ev => saveExerciseNote(e.id, ev.target.value)}
                rows={2}
                style={noteFieldStyle}
              />
            </div>
          )
        })}
      </div>

      <div>
        <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: 4 }}>
          Note coach (séance)
        </div>
        <textarea
          placeholder="Ta note pour cette séance…"
          defaultValue={session.coach_notes || ''}
          onBlur={ev => saveSessionNote(ev.target.value)}
          rows={3}
          style={{ ...noteFieldStyle, fontStyle: 'normal', fontSize: 13, marginTop: 0 }}
        />
      </div>

      {isDone && (
        <button onClick={notifyAthlete} disabled={notifying || notified}
          style={{
            background: notified ? '#DCFCE7' : 'var(--green)', color: notified ? '#166534' : '#fff', border: 'none',
            borderRadius: 'var(--r)', padding: '9px', fontSize: 12, fontWeight: 700, cursor: notified ? 'default' : 'pointer',
          }}>
          {notified ? '✓ Message envoyé' : notifying ? 'Envoi…' : <><Bell size={14} style={{ verticalAlign: -2, marginRight: 5 }} />Prévenir de mes retours</>}
        </button>
      )}
    </div>
  )
}

const selectStyle = {
  width: '100%', boxSizing: 'border-box', padding: '10px 12px', border: '1px solid var(--border2)',
  borderRadius: 'var(--r)', fontSize: 14, outline: 'none', background: 'var(--bg2)', color: 'var(--text)',
}

function AddCoachingModal({ athletes, groups, onClose, onAdd }) {
  const [mode, setMode] = useState('athlete') // 'athlete' | 'group'
  const [athleteId, setAthleteId] = useState('')
  const [athleteSearch, setAthleteSearch] = useState('')
  const [groupId, setGroupId] = useState('')
  const [groupSearch, setGroupSearch] = useState('')
  const [sessionId, setSessionId] = useState('')
  const [saving, setSaving] = useState(false)

  const switchMode = (m) => { setMode(m); setAthleteId(''); setGroupId(''); setSessionId(''); setAthleteSearch(''); setGroupSearch('') }

  const confirm = async () => {
    if (mode === 'athlete' ? (!athleteId || !sessionId) : (!groupId || !sessionId)) return
    setSaving(true)
    await onAdd(mode === 'athlete' ? { athleteId, sessionId } : { groupId, sessionId })
    setSaving(false)
  }

  const selectedAthlete = athletes.find(a => a.id === athleteId)
  const filteredAthletes = athleteSearch.trim()
    ? athletes.filter(a => a.name.toLowerCase().includes(athleteSearch.trim().toLowerCase()))
    : athletes

  const selectedGroup = groups.find(g => g.id === groupId)
  const filteredGroups = groupSearch.trim()
    ? groups.filter(g => g.name.toLowerCase().includes(groupSearch.trim().toLowerCase()))
    : groups

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 500, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: 'var(--bg)', borderRadius: 'var(--rl)', padding: 20, width: '100%', maxWidth: 420, boxShadow: '0 20px 60px rgba(0,0,0,0.4)', display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ flex: 1, fontFamily: 'var(--font-title)', color: 'var(--title)', fontWeight: 700, fontSize: 17 }}>Planifier un coaching</div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 20, color: 'var(--text3)', cursor: 'pointer', padding: '2px 4px', lineHeight: 1 }}>×</button>
        </div>

        <div style={{ display: 'flex', border: '1px solid var(--border2)', borderRadius: 'var(--rl)', padding: 3 }}>
          {[{ key: 'athlete', label: 'Individuel' }, { key: 'group', label: 'Groupe' }].map(t => (
            <button key={t.key} onClick={() => switchMode(t.key)} style={{
              flex: 1, padding: '8px 0', border: 'none', borderRadius: 'var(--r)', cursor: 'pointer',
              fontSize: 13, fontWeight: 700, background: mode === t.key ? 'var(--green)' : 'none',
              color: mode === t.key ? '#fff' : 'var(--text3)',
            }}>
              {t.label}
            </button>
          ))}
        </div>

        {mode === 'athlete' ? (
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: 6 }}>Sportif</div>
            {selectedAthlete ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', borderRadius: 'var(--r)', border: '1px solid var(--border2)', background: 'var(--bg2)' }}>
                <span style={{ flex: 1, fontWeight: 700, fontSize: 14, color: 'var(--text)' }}>{selectedAthlete.name}</span>
                <button onClick={() => { setAthleteId(''); setSessionId(''); setAthleteSearch('') }} style={{ background: 'none', border: 'none', color: 'var(--green)', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                  Changer
                </button>
              </div>
            ) : (
              <>
                {/* Retour terrain : avec beaucoup de sportifs, faire défiler une longue liste
                    déroulante est pénible — taper pour filtrer est plus rapide. */}
                <input
                  value={athleteSearch}
                  onChange={e => setAthleteSearch(e.target.value)}
                  placeholder="Rechercher un sportif…"
                  autoFocus
                  style={selectStyle}
                />
                <div style={{ maxHeight: 200, overflowY: 'auto', marginTop: 8, display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {filteredAthletes.length === 0 ? (
                    <div style={{ fontSize: 12, color: 'var(--text3)', padding: '8px 4px' }}>Aucun sportif trouvé.</div>
                  ) : filteredAthletes.map(a => (
                    <button key={a.id} onClick={() => { setAthleteId(a.id); setSessionId('') }} style={{
                      textAlign: 'left', padding: '9px 12px', borderRadius: 8, border: '1px solid var(--border2)',
                      background: 'var(--bg2)', color: 'var(--text)', cursor: 'pointer', fontSize: 13, fontWeight: 600, fontFamily: 'inherit',
                    }}>
                      {a.name}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        ) : (
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: 6 }}>Groupe</div>
            {selectedGroup ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', borderRadius: 'var(--r)', border: '1px solid var(--border2)', background: 'var(--bg2)' }}>
                <span style={{ flex: 1, fontWeight: 700, fontSize: 14, color: 'var(--text)' }}>{selectedGroup.name}</span>
                <button onClick={() => { setGroupId(''); setSessionId(''); setGroupSearch('') }} style={{ background: 'none', border: 'none', color: 'var(--green)', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                  Changer
                </button>
              </div>
            ) : (
              <>
                <input
                  value={groupSearch}
                  onChange={e => setGroupSearch(e.target.value)}
                  placeholder="Rechercher un groupe…"
                  autoFocus
                  style={selectStyle}
                />
                <div style={{ maxHeight: 200, overflowY: 'auto', marginTop: 8, display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {filteredGroups.length === 0 ? (
                    <div style={{ fontSize: 12, color: 'var(--text3)', padding: '8px 4px' }}>Aucun groupe trouvé.</div>
                  ) : filteredGroups.map(g => (
                    <button key={g.id} onClick={() => { setGroupId(g.id); setSessionId('') }} style={{
                      textAlign: 'left', padding: '9px 12px', borderRadius: 8, border: '1px solid var(--border2)',
                      background: 'var(--bg2)', color: 'var(--text)', cursor: 'pointer', fontSize: 13, fontWeight: 600, fontFamily: 'inherit',
                    }}>
                      {g.name}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        )}

        {mode === 'athlete' && athleteId && (
          <ProgramSessionPicker key={athleteId} athleteId={athleteId} sessionId={sessionId} onSelectSession={setSessionId} />
        )}
        {mode === 'group' && groupId && (
          <GroupSessionPicker key={groupId} groupId={groupId} sessionId={sessionId} onSelectSession={setSessionId} />
        )}

        <button onClick={confirm} disabled={!sessionId || saving} style={{
          background: 'var(--green)', color: '#fff', border: 'none', borderRadius: 'var(--r)',
          padding: '11px', fontSize: 14, fontWeight: 700, cursor: (!sessionId || saving) ? 'default' : 'pointer',
          opacity: (!sessionId || saving) ? 0.6 : 1,
        }}>
          {saving ? '…' : 'Planifier'}
        </button>
      </div>
    </div>
  )
}

function ProgramSessionPicker({ athleteId, sessionId, onSelectSession }) {
  const [programs, setPrograms] = useState(null)
  const [programId, setProgramId] = useState('')

  useEffect(() => {
    async function load() {
      const { data } = await supabase
        .from('programs')
        .select('id, title, program_sessions(id, title, order_index)')
        .eq('athlete_id', athleteId)
        .neq('archived', true)
        .is('group_id', null)
        .order('created_at', { ascending: false })
      setPrograms(data || [])
    }
    load()
  }, [athleteId])

  const selectedProgram = programs?.find(p => p.id === programId)
  const sessions = selectedProgram
    ? [...(selectedProgram.program_sessions || [])].sort((a, b) => a.order_index - b.order_index)
    : []

  return (
    <>
      <div>
        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: 6 }}>Programme</div>
        {programs === null ? (
          <div style={{ fontSize: 13, color: 'var(--text3)' }}>Chargement…</div>
        ) : programs.length === 0 ? (
          <div style={{ fontSize: 13, color: 'var(--text3)' }}>Ce sportif n&apos;a aucun programme actif.</div>
        ) : (
          <select value={programId} onChange={e => { setProgramId(e.target.value); onSelectSession('') }} style={selectStyle}>
            <option value="">Choisir un programme…</option>
            {programs.map(p => <option key={p.id} value={p.id}>{p.title || 'Programme sans titre'}</option>)}
          </select>
        )}
      </div>

      {programId && (
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: 6 }}>Séance à coacher</div>
          {sessions.length === 0 ? (
            <div style={{ fontSize: 13, color: 'var(--text3)' }}>Ce programme n&apos;a aucune séance.</div>
          ) : (
            <select value={sessionId} onChange={e => onSelectSession(e.target.value)} style={selectStyle}>
              <option value="">Choisir une séance…</option>
              {sessions.map(s => <option key={s.id} value={s.id}>{s.title || 'Séance sans titre'}</option>)}
            </select>
          )}
        </div>
      )}
    </>
  )
}

// Un groupe a des séances via deux chemins possibles (cf. app/groups/[groupId]/page.js et
// leader-groups/route.js) : un programme direct (programs.group_id, is_microcycle=false) et/ou
// des modèles réutilisables liés via group_program_templates. On les réunit dans une seule liste.
function GroupSessionPicker({ groupId, sessionId, onSelectSession }) {
  const [sessions, setSessions] = useState(null)

  useEffect(() => {
    async function load() {
      const [{ data: directProgs }, { data: templates }] = await Promise.all([
        supabase.from('programs')
          .select('id, program_sessions(id, title, order_index)')
          .eq('group_id', groupId).eq('is_microcycle', false).is('athlete_id', null)
          .order('created_at', { ascending: false }).limit(1),
        supabase.from('group_program_templates')
          .select('programs(program_sessions(id, title, order_index))')
          .eq('group_id', groupId),
      ])
      const direct = directProgs?.[0]?.program_sessions || []
      const linked = (templates || []).flatMap(t => t.programs?.program_sessions || [])
      setSessions([...direct, ...linked].sort((a, b) => a.order_index - b.order_index))
    }
    load()
  }, [groupId])

  return (
    <div>
      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: 6 }}>Séance à coacher</div>
      {sessions === null ? (
        <div style={{ fontSize: 13, color: 'var(--text3)' }}>Chargement…</div>
      ) : sessions.length === 0 ? (
        <div style={{ fontSize: 13, color: 'var(--text3)' }}>Ce groupe n&apos;a aucune séance.</div>
      ) : (
        <select value={sessionId} onChange={e => onSelectSession(e.target.value)} style={selectStyle}>
          <option value="">Choisir une séance…</option>
          {sessions.map(s => <option key={s.id} value={s.id}>{s.title || 'Séance sans titre'}</option>)}
        </select>
      )}
    </div>
  )
}
