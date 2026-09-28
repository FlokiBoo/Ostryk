'use client'

import { useState, useEffect, useRef, use } from 'react'
import { useRouter } from 'next/navigation'
import { Package, Trash, User, Key, EnvelopeSimple, Barbell, LinkSimple, CalendarBlank } from '@phosphor-icons/react'
import { supabase } from '@/lib/supabase'
import Link from 'next/link'
import AthletesSidebar from '@/app/components/AthletesSidebar'
import MicrocyclesBlock from '@/app/components/MicrocyclesBlock'
import WeeklyStatsBlock from '@/app/components/WeeklyStatsBlock'
import ProgressBlock from '@/app/components/ProgressBlock'
import ActivityBlock from '@/app/components/ActivityBlock'
import ObjectivesBlock from '@/app/components/ObjectivesBlock'
import WeeklyPlannerBlock from '@/app/components/WeeklyPlannerBlock'
import AthleteQuickNav from '@/app/components/AthleteQuickNav'
import TrackedMovementsBlock from '@/app/components/TrackedMovementsBlock'

function today() {
  const n = new Date()
  return [n.getFullYear(), String(n.getMonth()+1).padStart(2,'0'), String(n.getDate()).padStart(2,'0')].join('-')
}

function calcAge(birthDate) {
  if (!birthDate) return null
  const birth = new Date(birthDate)
  const now = new Date()
  let age = now.getFullYear() - birth.getFullYear()
  const m = now.getMonth() - birth.getMonth()
  if (m < 0 || (m === 0 && now.getDate() < birth.getDate())) age--
  return age
}

function formatDuration(min) {
  if (!min) return ''
  const h = Math.floor(min / 60)
  const m = min % 60
  if (h === 0) return `${m}min`
  if (m === 0) return `${h}h`
  return `${h}h${String(m).padStart(2,'0')}`
}

const METRICS = [
  { key: 'sommeil',     emoji: '🌙', label: 'Sommeil',     inverse: false },
  { key: 'stress',      emoji: '😰', label: 'Stress',      inverse: true  },
  { key: 'courbatures', emoji: '💪', label: 'Courbatures', inverse: true  },
  { key: 'forme',       emoji: '⚡', label: 'Forme',       inverse: false },
]


function scoreColor(val, inverse) {
  const s = inverse ? (11 - val) : val
  if (s >= 7) return '#22c55e'
  if (s >= 4) return '#f59e0b'
  return '#ef4444'
}

export default function AthletePage({ params }) {
  const { athleteId } = use(params)
  const router = useRouter()
  const [athlete, setAthlete] = useState(null)
  const [wellness, setWellness] = useState(null)
  const [activityLogs] = useState({})
  const [recentSessions, setRecentSessions] = useState([])
  const [openSession, setOpenSession] = useState(null)
  const [objectives, setObjectives] = useState([])
  const [noteBlocks, setNoteBlocks] = useState([])
  const [editingBlockId, setEditingBlockId] = useState(null)
  const [blockForm, setBlockForm] = useState({ title: '', content: '' })
  const [savingBlock, setSavingBlock] = useState(false)
  const [loading, setLoading] = useState(true)
  const [showDanger, setShowDanger] = useState(false)
  const [editingProfile, setEditingProfile] = useState(false)
  const [saving, setSaving] = useState(false)
  const [inviting, setInviting] = useState(false)
  const [inviteMsg, setInviteMsg] = useState('')

  const [form, setForm] = useState({ name: '', email: '', birth_date: '', weight: '', height: '' })

  useEffect(() => {
    async function load() {
      const todayStr = today()
      const [{ data: ath }, { data: w }, { data: actLogs }, { data: progs }, { data: objs }, { data: blocks }] = await Promise.all([
        supabase.from('athletes').select('*').eq('id', athleteId).single(),
        supabase.from('wellness').select('*').eq('athlete_id', athleteId).eq('date', todayStr).single(),
        Promise.resolve({ data: [] }),
        supabase.from('programs').select('*, program_sessions(id)').eq('athlete_id', athleteId),
        supabase.from('athlete_objectives').select('*').eq('athlete_id', athleteId).order('created_at'),
        supabase.from('athlete_note_blocks').select('*').eq('athlete_id', athleteId).order('order_index'),
      ])

      const sessionIds = (progs || []).flatMap(p => (p.program_sessions || []).map(s => s.id))
      let completions = []
      if (sessionIds.length > 0) {
        const { data: comps } = await supabase.from('program_completions')
          .select('*, program_sessions(id, title, programs(title), program_exercises(id, name, sets, reps, kg, note, private_coach_note))')
          .in('program_session_id', sessionIds)
          .order('completed_at', { ascending: false })
          .limit(3)
        completions = comps || []

        const exerciseIds = completions.flatMap(c => (c.program_sessions?.program_exercises || []).map(e => e.id))
        if (exerciseIds.length > 0) {
          const { data: logs } = await supabase.from('program_exercise_logs')
            .select('*')
            .eq('athlete_id', athleteId)
            .in('program_exercise_id', exerciseIds)
          const logsMap = {}
          ;(logs || []).forEach(l => { logsMap[l.program_exercise_id] = l })
          completions = completions.map(c => ({
            ...c,
            program_sessions: c.program_sessions ? {
              ...c.program_sessions,
              program_exercises: (c.program_sessions.program_exercises || []).map(e => ({ ...e, log: logsMap[e.id] })),
            } : c.program_sessions,
          }))
        }
      }

      setAthlete(ath)
      setWellness(w)
      setRecentSessions(completions)
      setObjectives(objs || [])
      setNoteBlocks(blocks || [])
      if (ath) setForm({ name: ath.name || '', email: ath.email || '', birth_date: ath.birth_date || '', weight: ath.weight || '', height: ath.height || '' })
      setLoading(false)
    }
    load()
  }, [athleteId])

  const saveProfile = async () => {
    setSaving(true)
    const { data } = await supabase.from('athletes').update({
      name: form.name.trim(),
      email: form.email.trim() || null,
      birth_date: form.birth_date || null,
      weight: form.weight ? parseFloat(form.weight) : null,
      height: form.height ? parseInt(form.height) : null,
    }).eq('id', athleteId).select().single()
    if (data) setAthlete(data)
    setSaving(false)
    setEditingProfile(false)
  }

  const addBlock = async () => {
    setSavingBlock(true)
    const { data, error } = await supabase.from('athlete_note_blocks')
      .insert({ athlete_id: athleteId, title: '', content: '', order_index: noteBlocks.length })
      .select().single()
    if (error) { alert('Erreur : ' + error.message); setSavingBlock(false); return }
    if (data) {
      setNoteBlocks(prev => [...prev, data])
      setEditingBlockId(data.id)
      setBlockForm({ title: '', content: '' })
    }
    setSavingBlock(false)
  }

  const startEditBlock = (b) => {
    setEditingBlockId(b.id)
    setBlockForm({ title: b.title || '', content: b.content || '' })
  }

  const saveBlock = async () => {
    setSavingBlock(true)
    const { data, error } = await supabase.from('athlete_note_blocks')
      .update({ title: blockForm.title.trim(), content: blockForm.content.trim() })
      .eq('id', editingBlockId).select().single()
    if (error) { alert('Erreur : ' + error.message); setSavingBlock(false); return }
    if (data) setNoteBlocks(prev => prev.map(b => b.id === editingBlockId ? data : b))
    setEditingBlockId(null)
    setSavingBlock(false)
  }

  const removeBlock = async (id) => {
    if (!confirm('Supprimer ce bloc ?')) return
    await supabase.from('athlete_note_blocks').delete().eq('id', id)
    setNoteBlocks(prev => prev.filter(b => b.id !== id))
  }

  const inviteClient = async () => {
    const email = form.email.trim() || athlete?.email
    if (!email) return
    setInviting(true)
    setInviteMsg('')
    const res = await fetch('/api/invite', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, athleteId, athleteName: athlete?.name, redirectTo: window.location.origin }) })
    const json = await res.json()
    setInviteMsg(json.error ? 'Erreur : ' + json.error : 'Invitation envoyée à ' + email + ' !')
    setInviting(false)
  }

  const archiveAthlete = async () => {
    if (!confirm(`Archiver ${athlete?.name} ?`)) return
    const { error } = await supabase.from('athletes').update({ archived: true }).eq('id', athleteId)
    if (error) { alert('Erreur : ' + error.message); return }
    router.push('/')
  }

  const deleteAthlete = async () => {
    if (!confirm(`Supprimer définitivement ${athlete?.name} ? Cette action est irréversible.`)) return
    const res = await fetch(`/api/athletes/${athleteId}`, { method: 'DELETE' })
    if (!res.ok) {
      const { error } = await res.json().catch(() => ({}))
      alert('Erreur : ' + (error || 'suppression impossible'))
      return
    }
    router.push('/')
  }

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100svh', color: 'var(--text3)' }}>Chargement…</div>
  )

  const age = calcAge(athlete?.birth_date)
  return (
    <div className="coach-layout" style={{ background: 'var(--bg2)' }}>
      <AthletesSidebar athleteId={athleteId} date={today()} />
      <div className="coach-main" style={{ paddingBottom: 40 }}>

        {/* Header */}
        <div style={{ background: 'var(--bg)', borderBottom: '1px solid var(--border)', padding: '14px 16px', position: 'sticky', top: 0, zIndex: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Link href="/" style={{ fontSize: 22, color: 'var(--text2)', textDecoration: 'none' }}>←</Link>
            <div style={{ fontFamily: 'var(--font-title)', color: 'var(--title)', fontWeight: 700, fontSize: 18, flex: 1 }}>{athlete?.name}</div>
            <button onClick={() => setShowDanger(v => !v)} style={{ background: 'var(--bg2)', border: '1px solid var(--border2)', borderRadius: 'var(--r)', padding: '5px 10px', fontSize: 15, cursor: 'pointer', color: 'var(--text3)', flexShrink: 0, lineHeight: 1 }}>···</button>
          </div>
          {showDanger && (
            <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
              <button onClick={archiveAthlete} style={{ flex: 1, background: '#FEF3C7', color: '#92400E', border: '1px solid #FDE68A', borderRadius: 'var(--r)', padding: '8px', fontSize: 12, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5 }}><Package size={13} /> Archiver</button>
              <button onClick={deleteAthlete} style={{ flex: 1, background: '#FEE2E2', color: '#991B1B', border: '1px solid #FCA5A5', borderRadius: 'var(--r)', padding: '8px', fontSize: 12, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5 }}><Trash size={13} /> Supprimer</button>
            </div>
          )}
        </div>

        <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>

          {athlete && <AthleteQuickNav athlete={athlete} onUpdate={setAthlete} />}

          {/* ── PROFIL ── */}
          <div style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 'var(--rl)', overflow: 'hidden' }}>
            <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.4px', display: 'flex', alignItems: 'center', gap: 5 }}><User size={13} /> Profil</div>
              <button onClick={() => { setEditingProfile(v => !v); setInviteMsg('') }} style={{ background: 'none', border: 'none', color: 'var(--green)', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
                {editingProfile ? 'Annuler' : 'Modifier'}
              </button>
            </div>

            {editingProfile ? (
              <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
                <Field label="Nom complet"><input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} style={inputStyle} /></Field>
                <Field label="Date de naissance"><input type="date" value={form.birth_date} onChange={e => setForm(f => ({ ...f, birth_date: e.target.value }))} style={inputStyle} /></Field>
                <div style={{ display: 'flex', gap: 10 }}>
                  <Field label="Poids (kg)" style={{ flex: 1 }}><input type="number" step="0.1" placeholder="70.5" value={form.weight} onChange={e => setForm(f => ({ ...f, weight: e.target.value }))} style={inputStyle} /></Field>
                  <Field label="Taille (cm)" style={{ flex: 1 }}><input type="number" placeholder="175" value={form.height} onChange={e => setForm(f => ({ ...f, height: e.target.value }))} style={inputStyle} /></Field>
                </div>
                <Field label="Email">
                  <div style={{ display: 'flex', gap: 8 }}>
                    <input type="email" placeholder="client@mail.com" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} style={{ ...inputStyle, flex: 1 }} />
                    <button onClick={inviteClient} disabled={inviting || !form.email.trim()} style={{ background: 'var(--green)', color: '#fff', border: 'none', borderRadius: 'var(--r)', padding: '8px 12px', fontSize: 12, fontWeight: 700, cursor: 'pointer', flexShrink: 0, display: 'flex', alignItems: 'center', gap: 5 }}>
                      {inviting ? '…' : (athlete?.auth_user_id ? <><Key size={12} /> Renvoyer un lien</> : <><EnvelopeSimple size={12} /> Inviter</>)}
                    </button>
                  </div>
                </Field>
                {inviteMsg && <div style={{ fontSize: 12, color: inviteMsg.startsWith('Erreur') ? '#DC2626' : '#166534', fontWeight: 600 }}>{inviteMsg}</div>}
                <button onClick={saveProfile} disabled={saving} style={{ background: 'var(--green)', color: '#fff', border: 'none', borderRadius: 'var(--r)', padding: '11px', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>
                  {saving ? 'Enregistrement…' : 'Enregistrer'}
                </button>
              </div>
            ) : (
              <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
                {/* Avatar + nom */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{ width: 48, height: 48, borderRadius: '50%', background: 'var(--green-light)', color: 'var(--green)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, fontWeight: 800, flexShrink: 0 }}>
                    {athlete?.name?.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)}
                  </div>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 16 }}>{athlete?.name}</div>
                    {athlete?.email && <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 2 }}>{athlete.email}</div>}
                  </div>
                </div>

                {/* Stats */}
                {(age || athlete?.weight || athlete?.height) && (
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {age !== null && <Stat label="Âge" value={`${age} ans`} />}
                    {athlete?.weight && <Stat label="Poids" value={`${athlete.weight} kg`} />}
                    {athlete?.height && <Stat label="Taille" value={`${athlete.height} cm`} />}
                  </div>
                )}

                {/* Lien personnel */}
                {athlete?.token ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {/* Reste dans l'app (pas de target="_blank") : le coaching en direct doit être un
                        espace normal de l'app, pas un onglet séparé qui peut se perdre si le coach
                        quitte l'app pendant la séance — retour terrain. */}
                    <Link href={`/s/${athlete.token}/lancer`}
                      style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8, background: 'var(--green)', color: '#fff', border: 'none', borderRadius: 'var(--r)', padding: '10px 16px', fontSize: 13, fontWeight: 700, textDecoration: 'none' }}>
                      <Barbell size={15} /> Coaching — lancer une séance
                    </Link>
                  </div>
                ) : (
                  <button onClick={async () => {
                    const token = crypto.randomUUID()
                    const { data } = await supabase.from('athletes').update({ token }).eq('id', athleteId).select().single()
                    if (data) setAthlete(data)
                  }} style={{ background: 'var(--green-light)', color: 'var(--green)', border: '1px solid #B8EAD8', borderRadius: 'var(--r)', padding: '8px 14px', fontSize: 12, fontWeight: 700, cursor: 'pointer', alignSelf: 'flex-start', display: 'flex', alignItems: 'center', gap: 5 }}>
                    <LinkSimple size={12} /> Générer un lien personnel
                  </button>
                )}
              </div>
            )}
          </div>

          {/* ── OBJECTIFS ── */}
          <ObjectivesBlock athleteId={athleteId} objectives={objectives} setObjectives={setObjectives} />

          {/* ── BLOCS LIBRES ── */}
          {noteBlocks.map(b => (
            <div key={b.id} style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 'var(--rl)', overflow: 'hidden' }}>
              <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                {editingBlockId === b.id ? (
                  <input
                    autoFocus
                    value={blockForm.title}
                    onChange={e => setBlockForm(f => ({ ...f, title: e.target.value }))}
                    placeholder="Titre du bloc…"
                    style={{ flex: 1, fontSize: 13, fontWeight: 700, border: 'none', outline: 'none', background: 'transparent', color: 'var(--text)' }}
                  />
                ) : (
                  <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>
                    {b.title || <span style={{ color: 'var(--text3)', fontWeight: 400, fontStyle: 'italic' }}>Sans titre</span>}
                  </span>
                )}
                <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                  {editingBlockId === b.id ? (
                    <>
                      <button onClick={() => setEditingBlockId(null)} style={{ background: 'none', border: 'none', color: 'var(--text3)', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>Annuler</button>
                      <button onClick={saveBlock} disabled={savingBlock} style={{ background: 'none', border: 'none', color: 'var(--green)', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>{savingBlock ? '…' : 'Enregistrer'}</button>
                    </>
                  ) : (
                    <>
                      <button onClick={() => startEditBlock(b)} style={{ background: 'none', border: 'none', color: 'var(--green)', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>Modifier</button>
                      <button onClick={() => removeBlock(b.id)} style={{ background: 'none', border: 'none', color: '#DC2626', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>×</button>
                    </>
                  )}
                </div>
              </div>
              <div style={{ padding: 14 }}>
                {editingBlockId === b.id ? (
                  <textarea
                    value={blockForm.content}
                    onChange={e => setBlockForm(f => ({ ...f, content: e.target.value }))}
                    placeholder="Contenu…"
                    rows={4}
                    style={{ width: '100%', boxSizing: 'border-box', padding: '9px 11px', border: '1px solid var(--border2)', borderRadius: 'var(--r)', fontSize: 14, outline: 'none', background: 'var(--bg2)', color: 'var(--text)', fontFamily: 'inherit', resize: 'vertical' }}
                  />
                ) : (
                  b.content
                    ? <div style={{ fontSize: 14, color: 'var(--text)', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{b.content}</div>
                    : <div style={{ fontSize: 13, color: 'var(--text3)', fontStyle: 'italic' }}>Vide</div>
                )}
              </div>
            </div>
          ))}
          <button onClick={addBlock} disabled={savingBlock} style={{ background: 'var(--bg2)', border: '1px dashed var(--border2)', color: 'var(--text2)', borderRadius: 'var(--rl)', padding: '10px 14px', fontSize: 13, fontWeight: 600, cursor: 'pointer', textAlign: 'left' }}>
            + Ajouter un bloc
          </button>

          {/* ── STATS SEMAINE / MOIS ── */}
          <WeeklyStatsBlock athleteId={athleteId} />

          {/* ── PLANNING SEMAINE-TYPE ── */}
          <WeeklyPlannerBlock athleteId={athleteId} />

          <ProgressBlock athleteId={athleteId} />

          {/* ── AUJOURD'HUI ── */}
          <div style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 'var(--rl)', overflow: 'hidden' }}>
            <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--border)' }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.4px', display: 'inline-flex', alignItems: 'center', gap: 5 }}><CalendarBlank size={13} /> Aujourd&apos;hui</span>
            </div>

            {/* Bien-être */}
            <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--border)' }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text2)', marginBottom: 6 }}>Bien-être</div>
              {wellness ? (
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {METRICS.map(m => {
                    const v = wellness[m.key]
                    if (!v) return null
                    return (
                      <div key={m.key} style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'var(--bg2)', borderRadius: 20, padding: '4px 10px' }}>
                        <span style={{ fontSize: 13 }}>{m.emoji}</span>
                        <span style={{ fontSize: 12, fontWeight: 800, color: scoreColor(v, m.inverse) }}>{v}</span>
                        <span style={{ fontSize: 11, color: 'var(--text3)' }}>{m.label}</span>
                      </div>
                    )
                  })}
                </div>
              ) : (
                <span style={{ fontSize: 12, color: 'var(--text3)', fontStyle: 'italic' }}>Pas renseigné</span>
              )}
            </div>

            {/* Activité */}
            <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--border)' }}>
              <ActivityBlock athleteId={athleteId} isCoach={true} />
            </div>

            {/* Séance */}
            <div style={{ padding: '12px 14px' }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text2)', marginBottom: 6 }}>Dernières séances</div>
              {recentSessions.length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {recentSessions.map((c, i) => (
                    <div
                      key={c.id || i}
                      onClick={() => setOpenSession(c)}
                      style={{ display: 'flex', alignItems: 'flex-start', gap: 8, background: '#F0FDF4', borderRadius: 'var(--r)', padding: '8px 12px', cursor: 'pointer' }}
                    >
                      <span style={{ color: '#22c55e', fontSize: 14, marginTop: 1 }}>✓</span>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 13, fontWeight: 700 }}>
                          {c.program_sessions?.title || 'Séance'}
                          {c.program_sessions?.programs?.title && <span style={{ fontSize: 11, fontWeight: 400, color: 'var(--text3)', marginLeft: 6 }}>{c.program_sessions.programs.title}</span>}
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 1 }}>{new Date(c.completed_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}</div>
                        <div style={{ display: 'flex', gap: 8, marginTop: 2, flexWrap: 'wrap' }}>
                          {c.pleasure != null && <span style={{ fontSize: 11, color: 'var(--text3)' }}>Plaisir <b style={{ color: scoreColor(c.pleasure, false) }}>{c.pleasure}/10</b></span>}
                          {c.difficulty != null && <span style={{ fontSize: 11, color: 'var(--text3)' }}>Difficulté <b style={{ color: scoreColor(c.difficulty, true) }}>{c.difficulty}/10</b></span>}
                          {c.duration_minutes && <span style={{ fontSize: 11, color: 'var(--text3)' }}>{formatDuration(c.duration_minutes)}</span>}
                        </div>
                      </div>
                      <span style={{ color: 'var(--text3)', fontSize: 12, marginTop: 2 }}>›</span>
                    </div>
                  ))}
                </div>
              ) : (
                <span style={{ fontSize: 12, color: 'var(--text3)', fontStyle: 'italic' }}>Aucune séance validée</span>
              )}
            </div>
          </div>

          {/* ── PROGRAMMES ── */}
          <MicrocyclesBlock athleteId={athleteId} athleteToken={athlete?.token} />

          {/* ── RECORDS & TESTS ── */}
          <TrackedMovementsBlock athleteId={athleteId} isCoach />

        </div>
      </div>
      {openSession && <SessionDetailModal session={openSession} onClose={() => setOpenSession(null)} />}
    </div>
  )
}

function SessionDetailModal({ session, onClose }) {
  const sess = session.program_sessions
  const exercises = sess?.program_exercises || []
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', zIndex: 1000 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: 'var(--bg)', borderRadius: '20px 20px 0 0', padding: 20, width: '100%', maxWidth: 480, maxHeight: '88svh', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div>
          <div style={{ fontSize: 16, fontWeight: 800 }}>
            {sess?.title || 'Séance'}
            {sess?.programs?.title && <span style={{ fontSize: 12, fontWeight: 400, color: 'var(--text3)', marginLeft: 6 }}>{sess.programs.title}</span>}
          </div>
          <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 2 }}>
            {new Date(session.completed_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}
          </div>
        </div>
        {(session.pleasure != null || session.difficulty != null || session.duration_minutes) && (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {session.pleasure != null && <Stat label="Plaisir" value={`${session.pleasure}/10`} />}
            {session.difficulty != null && <Stat label="Difficulté" value={`${session.difficulty}/10`} />}
            {session.duration_minutes && <Stat label="Durée" value={formatDuration(session.duration_minutes)} />}
          </div>
        )}
        <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 'var(--r)', padding: '8px 10px' }}>
          <div style={{ fontSize: 9, color: 'var(--text3)', fontWeight: 700, textTransform: 'uppercase' }}>Note du sportif</div>
          <div style={{ fontSize: 13, color: session.comment ? 'var(--text)' : 'var(--text3)', fontStyle: session.comment ? 'normal' : 'italic', marginTop: 2 }}>
            {session.comment || 'Vide'}
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {exercises.map(e => {
            const log = e.log || {}
            const prescribed = [e.sets && `${e.sets} séries`, e.reps && `${e.reps} reps`, e.kg && `${e.kg} kg`].filter(Boolean).join(' · ')
            const done = [log.sets_done && `${log.sets_done} séries`, log.reps_done && `${log.reps_done} reps`, log.kg_done && `${log.kg_done} kg`].filter(Boolean).join(' · ')
            return (
              <div key={e.id} style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 'var(--r)', padding: '10px 12px' }}>
                <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 4 }}>{e.name}</div>
                {prescribed && <div style={{ fontSize: 12, color: 'var(--text3)' }}>Prescrit : {prescribed}</div>}
                {done && <div style={{ fontSize: 12, color: '#166534', fontWeight: 700, marginTop: 2 }}>Réalisé : {done}</div>}
                {e.note && <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 2 }}>Note coach : {e.note}</div>}
                {log.note && <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 2, fontStyle: 'italic' }}>« {log.note} »</div>}
                {e.private_coach_note && <div style={{ fontSize: 12, color: 'var(--text)', marginTop: 4, whiteSpace: 'pre-wrap' }}><b>Ma note :</b> {e.private_coach_note}</div>}
              </div>
            )
          })}
          {exercises.length === 0 && (
            <div style={{ fontSize: 13, color: 'var(--text3)', fontStyle: 'italic', textAlign: 'center', padding: '10px 0' }}>Aucun exercice</div>
          )}
        </div>
      </div>
    </div>
  )
}

const inputStyle = {
  width: '100%', boxSizing: 'border-box',
  padding: '9px 11px', border: '1px solid var(--border2)', borderRadius: 'var(--r)',
  fontSize: 14, outline: 'none', background: 'var(--bg2)', color: 'var(--text)',
  fontFamily: 'inherit',
}

function Field({ label, children, style }) {
  return (
    <div style={style}>
      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: 5 }}>{label}</div>
      {children}
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
