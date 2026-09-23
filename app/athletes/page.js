'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import AthletesSidebar from '@/app/components/AthletesSidebar'
import { getCoachId } from '@/lib/coach'

function today() {
  const n = new Date()
  return [n.getFullYear(), String(n.getMonth()+1).padStart(2,'0'), String(n.getDate()).padStart(2,'0')].join('-')
}

function initials(name) {
  return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)
}

function depuis(dateIso) {
  if (!dateIso) return 'jamais'
  const j = Math.floor((Date.now() - new Date(dateIso).getTime()) / 86400000)
  if (j <= 0) return "aujourd'hui"
  if (j === 1) return 'hier'
  if (j < 30) return `il y a ${j} j`
  return `il y a ${Math.floor(j / 30)} mois`
}

const TIER_BADGES = {
  A: { label: 'Silver', color: '#57606F', bg: '#E2E8F0' },
  B: { label: 'Gold', color: '#92400E', bg: '#FDE68A' },
}

const SORT_OPTIONS = [
  { key: 'alpha', label: 'Alphabétique (A→Z)' },
  { key: 'alpha_desc', label: 'Alphabétique inversé (Z→A)' },
  { key: 'date', label: "Date d'ajout (récent d'abord)" },
  { key: 'subscription', label: "Type d'abonnement" },
]

// Priorité d'affichage : abonnés (Gold puis Silver) avant les non-abonnés.
function subscriptionRank(a) {
  if (a.subscription_status === 'active' && a.subscription_tier === 'B') return 0
  if (a.subscription_status === 'active' && a.subscription_tier === 'A') return 1
  return 2
}

export default function AthletesPage() {
  const router = useRouter()
  const [athletes, setAthletes] = useState(null)
  const [groupsByAthlete, setGroupsByAthlete] = useState({})
  const [programsByAthlete, setProgramsByAthlete] = useState({})
  const [lastActivityByAthlete, setLastActivityByAthlete] = useState({})
  const [othersOpen, setOthersOpen] = useState(true)
  const [search, setSearch] = useState('')
  const [sortBy, setSortBy] = useState('alpha')
  const [showTests, setShowTests] = useState(false)
  const [menu, setMenu] = useState(null) // { athlete, top, left, openUp }
  const [busyId, setBusyId] = useState(null)
  const [togglingLeader, setTogglingLeader] = useState(null) // `${athleteId}:${groupId}`
  const [showAdd, setShowAdd] = useState(false)
  const [newName, setNewName] = useState('')
  const [newEmail, setNewEmail] = useState('')
  const [createdAthlete, setCreatedAthlete] = useState(null)
  const [creating, setCreating] = useState(false)
  const [inviting, setInviting] = useState(false)
  const [inviteMsg, setInviteMsg] = useState('')
  const [linkCopied, setLinkCopied] = useState(false)

  const copySignupLink = () => {
    navigator.clipboard.writeText(`${window.location.origin}/login?mode=signup`)
    setLinkCopied(true)
    setTimeout(() => setLinkCopied(false), 2000)
  }

  useEffect(() => { load() }, [])

  async function load() {
    const [{ data }, { data: groups }, { data: progs }, { data: progComps }, { data: actValidated }] = await Promise.all([
      supabase.from('athletes').select('*').neq('archived', true).order('name'),
      supabase.from('groups').select('id, name, group_members(athlete_id, is_leader)'),
      supabase.from('programs').select('title, athlete_id').not('athlete_id', 'is', null).neq('archived', true),
      // Dernière activité par sportif — mêmes 2 sources que le dashboard coach (app/page.js),
      // seule la date importe ici (pas le détail des séances), donc select minimal.
      supabase.from('program_completions').select('athlete_id, completed_at'),
      supabase.from('activity_logs').select('athlete_id, validated_at').not('validated_at', 'is', null),
    ])
    setAthletes(data || [])
    const byAthlete = {}
    ;(groups || []).forEach(g => {
      ;(g.group_members || []).forEach(m => {
        (byAthlete[m.athlete_id] ||= []).push({ groupId: g.id, groupName: g.name, isLeader: !!m.is_leader })
      })
    })
    setGroupsByAthlete(byAthlete)
    const progsByAthlete = {}
    ;(progs || []).forEach(p => { (progsByAthlete[p.athlete_id] ||= []).push(p.title) })
    setProgramsByAthlete(progsByAthlete)

    const lastActivity = {}
    const bump = (athleteId, dateStr) => {
      if (!athleteId || !dateStr) return
      if (!lastActivity[athleteId] || dateStr > lastActivity[athleteId]) lastActivity[athleteId] = dateStr
    }
    ;(progComps || []).forEach(c => bump(c.athlete_id, c.completed_at))
    ;(actValidated || []).forEach(a => bump(a.athlete_id, a.validated_at))
    setLastActivityByAthlete(lastActivity)
  }

  const toggleLeaderFromList = async (athleteId, groupId, current) => {
    const busyKey = `${athleteId}:${groupId}`
    setTogglingLeader(busyKey)
    await supabase.from('group_members').update({ is_leader: !current }).eq('group_id', groupId).eq('athlete_id', athleteId)
    setGroupsByAthlete(prev => ({
      ...prev,
      [athleteId]: prev[athleteId].map(g => g.groupId === groupId ? { ...g, isLeader: !current } : g),
    }))
    setTogglingLeader(null)
  }

  const inviteFromMenu = async (a) => {
    setMenu(null)
    setBusyId(a.id)
    const res = await fetch('/api/invite', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: a.email, athleteId: a.id, athleteName: a.name, redirectTo: window.location.origin }),
    })
    const json = await res.json()
    setBusyId(null)
    alert(json.error ? 'Erreur : ' + json.error : `✓ Invitation envoyée à ${a.email}`)
  }

  const archiveAthlete = async (a) => {
    if (!confirm(`Archiver ${a.name} ?`)) return
    setMenu(null)
    setBusyId(a.id)
    const { error } = await supabase.from('athletes').update({ archived: true }).eq('id', a.id)
    setBusyId(null)
    if (error) { alert('Erreur : ' + error.message); return }
    setAthletes(prev => prev.filter(x => x.id !== a.id))
  }

  const deleteAthlete = async (a) => {
    if (!confirm(`Supprimer définitivement ${a.name} ? Cette action est irréversible.`)) return
    setMenu(null)
    setBusyId(a.id)
    const res = await fetch(`/api/athletes/${a.id}`, { method: 'DELETE' })
    setBusyId(null)
    if (!res.ok) {
      const { error } = await res.json().catch(() => ({}))
      alert('Erreur : ' + (error || 'suppression impossible'))
      return
    }
    setAthletes(prev => prev.filter(x => x.id !== a.id))
  }

  const testCount = (athletes || []).filter(a => a.is_test).length

  const convertTestToClient = async (a) => {
    setMenu(null)
    setBusyId(a.id)
    const { error } = await supabase.from('athletes').update({ is_test: false }).eq('id', a.id)
    setBusyId(null)
    if (error) { alert('Erreur : ' + error.message); return }
    setAthletes(prev => prev.map(x => x.id === a.id ? { ...x, is_test: false } : x))
  }

  const toggleFollowType = async (a) => {
    setMenu(null)
    const next = !a.is_1to1_client
    setBusyId(a.id)
    const { error } = await supabase.from('athletes').update({ is_1to1_client: next }).eq('id', a.id)
    setBusyId(null)
    if (error) { alert('Erreur : ' + error.message); return }
    setAthletes(prev => prev.map(x => x.id === a.id ? { ...x, is_1to1_client: next } : x))
  }

  const sortAthletes = (list) => [...list].sort((a, b) => {
    if (sortBy === 'alpha_desc') return b.name.localeCompare(a.name)
    if (sortBy === 'date') return new Date(b.created_at) - new Date(a.created_at)
    if (sortBy === 'subscription') return subscriptionRank(a) - subscriptionRank(b) || a.name.localeCompare(b.name)
    return a.name.localeCompare(b.name)
  })

  const filtered = (athletes || [])
    .filter(a => (showTests || !a.is_test) && a.name.toLowerCase().includes(search.trim().toLowerCase()))
  // "Suivi 1:1" : statut manuel (is_1to1_client, basculé depuis le menu ⋯), pas l'abonnement
  // Ostryk — un client peut être suivi en 1:1 sans payer via l'abonnement de l'app (virement,
  // espèces...) et inversement. Même champ que celui utilisé pour le dashboard coach (app/page.js).
  const oneToOne = sortAthletes(filtered.filter(a => a.is_1to1_client))
  const others = sortAthletes(filtered.filter(a => !a.is_1to1_client))

  const openAdd = () => {
    setNewName('')
    setNewEmail('')
    setCreatedAthlete(null)
    setInviteMsg('')
    setShowAdd(true)
  }

  const closeAdd = () => {
    setShowAdd(false)
  }

  const createClient = async () => {
    if (!newName.trim()) return
    setCreating(true)
    const coachId = await getCoachId()
    const { data, error } = await supabase.from('athletes').insert({ name: newName.trim(), email: newEmail.trim() || null, coach_id: coachId }).select().single()
    setCreating(false)
    if (error) { alert('Erreur : ' + error.message); return }
    setAthletes(prev => [...prev, data].sort((a, b) => a.name.localeCompare(b.name)))
    setCreatedAthlete(data)
  }

  const sendInviteEmail = async () => {
    if (!createdAthlete || !newEmail.trim()) return
    setInviting(true)
    setInviteMsg('')
    const res = await fetch('/api/invite', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: newEmail.trim(), athleteId: createdAthlete.id, athleteName: createdAthlete.name, redirectTo: window.location.origin }),
    })
    const json = await res.json()
    setInviting(false)
    setInviteMsg(json.error ? 'Erreur : ' + json.error : `✓ Invitation envoyée à ${newEmail.trim()}`)
  }

  const renderAthleteRow = (a, i) => (
    <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', borderTop: i > 0 ? '1px solid var(--border)' : 'none', position: 'relative', opacity: busyId === a.id ? 0.5 : 1 }}>
      <div
        onClick={() => router.push(`/semaine/${a.id}/${today()}`)}
        style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 0, cursor: 'pointer' }}
      >
        <div style={{
          width: 34, height: 34, borderRadius: '50%', flexShrink: 0,
          background: 'var(--green-light)', color: 'var(--green)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 800,
        }}>
          {initials(a.name)}
        </div>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontWeight: 700, fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: 6 }}>
            {a.name}
            {a.is_coach && (
              <span style={{ fontSize: 9, fontWeight: 800, background: '#DBEAFE', color: '#1D4ED8', borderRadius: 10, padding: '1px 5px', flexShrink: 0 }}>COACH</span>
            )}
            {a.is_test && (
              <span style={{ fontSize: 9, fontWeight: 800, background: '#FEF3C7', color: '#92400E', borderRadius: 10, padding: '1px 5px', flexShrink: 0 }}>TEST</span>
            )}
            {a.subscription_status === 'active' && TIER_BADGES[a.subscription_tier] ? (
              <span style={{
                fontSize: 9, fontWeight: 800, borderRadius: 10, padding: '1px 6px', flexShrink: 0,
                color: TIER_BADGES[a.subscription_tier].color, background: TIER_BADGES[a.subscription_tier].bg,
              }}>
                🏅 {TIER_BADGES[a.subscription_tier].label}
              </span>
            ) : a.subscription_status !== 'active' && !a.is_coach && (
              <span style={{ fontSize: 9, fontWeight: 700, background: 'var(--bg2)', color: 'var(--text3)', borderRadius: 10, padding: '1px 6px', flexShrink: 0 }}>
                Non abonné
              </span>
            )}
            <span style={{ fontSize: 10, color: 'var(--text3)', fontWeight: 600, marginLeft: 'auto', flexShrink: 0, whiteSpace: 'nowrap' }}>
              {depuis(lastActivityByAthlete[a.id])}
            </span>
          </div>
          {groupsByAthlete[a.id]?.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 4 }}>
              {groupsByAthlete[a.id].map(g => {
                const busyKey = `${a.id}:${g.groupId}`
                return (
                  <button
                    key={g.groupId}
                    onClick={e => { e.stopPropagation(); toggleLeaderFromList(a.id, g.groupId, g.isLeader) }}
                    disabled={togglingLeader === busyKey}
                    title={g.isLeader ? `Retirer le statut de leader (${g.groupName})` : `Désigner comme leader (${g.groupName})`}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 3, flexShrink: 0,
                      background: g.isLeader ? 'var(--green)' : 'var(--bg2)', color: g.isLeader ? '#fff' : 'var(--text3)',
                      border: '1px solid ' + (g.isLeader ? 'var(--green)' : 'var(--border2)'), borderRadius: 20,
                      padding: '2px 8px', fontSize: 10, fontWeight: 700, cursor: 'pointer',
                    }}>
                    {g.isLeader ? '⭐' : '☆'} {g.groupName}
                  </button>
                )
              })}
            </div>
          )}
          {programsByAthlete[a.id]?.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 4 }}>
              {programsByAthlete[a.id].map((title, idx) => (
                <span key={idx} style={{
                  flexShrink: 0, background: 'var(--bg2)', color: 'var(--text2)',
                  border: '1px solid var(--border2)', borderRadius: 20,
                  padding: '2px 8px', fontSize: 10, fontWeight: 700,
                }}>
                  📋 {title}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      <button onClick={e => {
        const rect = e.currentTarget.getBoundingClientRect()
        const openUp = rect.bottom > window.innerHeight - 100
        setMenu(menu?.athlete.id === a.id ? null : {
          athlete: a,
          left: rect.right,
          top: openUp ? rect.top : rect.bottom,
          openUp,
        })
      }}
        style={{ background: 'var(--bg2)', border: '1px solid var(--border2)', borderRadius: 'var(--r)', padding: '6px 10px', fontSize: 15, cursor: 'pointer', color: 'var(--text3)', flexShrink: 0, lineHeight: 1 }}>
        ···
      </button>
    </div>
  )

  return (
    <div className="coach-layout" style={{ background: 'var(--bg2)' }}>
      <AthletesSidebar athleteId={null} date={today()} />
      <div className="coach-main" style={{ paddingBottom: 40 }}>

        <div style={{ background: 'var(--bg)', borderBottom: '1px solid var(--border)', padding: '14px 16px', position: 'sticky', top: 0, zIndex: 10, display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontFamily: 'var(--font-title)', color: 'var(--title)', fontWeight: 700, fontSize: 18, marginBottom: 2 }}>👤 Sportifs</div>
            <div style={{ fontSize: 12, color: 'var(--text3)' }}>
              {(athletes || []).length} sportif{(athletes || []).length !== 1 ? 's' : ''} · {oneToOne.length} en suivi 1:1
            </div>
          </div>
          <button onClick={openAdd} style={{ background: 'var(--green)', color: '#fff', border: 'none', borderRadius: 20, padding: '7px 14px', fontSize: 13, fontWeight: 700, cursor: 'pointer', flexShrink: 0 }}>
            + Ajouter
          </button>
        </div>

        <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{
            background: 'var(--green-light)', border: '1px solid #B8EAD8', borderRadius: 'var(--rl)',
            padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 10,
          }}>
            <span style={{ fontSize: 18, flexShrink: 0 }}>🔗</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--green)' }}>Lien d&apos;inscription</div>
              <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 1 }}>
                À envoyer aux personnes intéressées : elles arrivent sur la page de connexion / inscription.
              </div>
            </div>
            <button onClick={copySignupLink} style={{
              background: linkCopied ? 'var(--green)' : '#fff', color: linkCopied ? '#fff' : 'var(--green)',
              border: '1px solid var(--green)', borderRadius: 20, padding: '7px 14px', fontSize: 12, fontWeight: 700,
              cursor: 'pointer', flexShrink: 0, whiteSpace: 'nowrap',
            }}>
              {linkCopied ? '✓ Copié' : 'Copier le lien'}
            </button>
          </div>

          <div style={{ display: 'flex', gap: 8 }}>
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Rechercher un sportif…"
              style={{ flex: 1, padding: '10px 12px', border: '1px solid var(--border2)', borderRadius: 'var(--r)', fontSize: 14, outline: 'none', background: 'var(--bg)', color: 'var(--text)' }}
            />
            <select value={sortBy} onChange={e => setSortBy(e.target.value)}
              style={{ padding: '10px 12px', border: '1px solid var(--border2)', borderRadius: 'var(--r)', fontSize: 13, outline: 'none', background: 'var(--bg)', color: 'var(--text)', flexShrink: 0 }}>
              {SORT_OPTIONS.map(o => <option key={o.key} value={o.key}>{o.label}</option>)}
            </select>
          </div>

          {testCount > 0 && (
            <button onClick={() => setShowTests(s => !s)} style={{
              alignSelf: 'flex-start', background: 'none', border: 'none', color: 'var(--text3)',
              fontSize: 12, fontWeight: 600, cursor: 'pointer', padding: '2px 0', textDecoration: 'underline',
            }}>
              {showTests ? 'Masquer' : 'Afficher'} mes fiches de test ({testCount})
            </button>
          )}

          {athletes === null ? (
            <div style={{ color: 'var(--text3)', fontSize: 13, padding: '20px 0' }}>Chargement…</div>
          ) : filtered.length === 0 ? (
            <div style={{ textAlign: 'center', color: 'var(--text3)', padding: '60px 20px', border: '1px dashed var(--border2)', borderRadius: 'var(--rl)', background: 'var(--bg)' }}>
              <div style={{ fontSize: 13 }}>Aucun sportif trouvé.</div>
            </div>
          ) : (
            <>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--bordeaux)', textTransform: 'uppercase', letterSpacing: '0.4px' }}>
                Suivi 1:1 · {oneToOne.length}
              </div>
              {oneToOne.length === 0 ? (
                <div style={{ fontSize: 12, color: 'var(--text3)', fontStyle: 'italic' }}>Aucun sportif en suivi 1:1 pour l&apos;instant.</div>
              ) : (
                <div style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 'var(--rl)', overflow: 'hidden' }}>
                  {oneToOne.map((a, i) => renderAthleteRow(a, i))}
                </div>
              )}

              {/* "Autres" = suivi hors 1:1 (curiosité, groupe uniquement, etc.) — repliable, ouvert
                  par défaut, mais toujours après la section prioritaire ci-dessus. */}
              <button onClick={() => setOthersOpen(v => !v)} style={{
                display: 'flex', alignItems: 'center', gap: 8, background: 'none', border: 'none', padding: 0, cursor: 'pointer',
                fontSize: 11, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.4px',
              }}>
                <span style={{ fontSize: 10 }}>{othersOpen ? '▾' : '▸'}</span>
                Autres sportifs · {others.length}
              </button>
              {othersOpen && (
                others.length === 0 ? (
                  <div style={{ fontSize: 12, color: 'var(--text3)', fontStyle: 'italic' }}>—</div>
                ) : (
                  <div style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 'var(--rl)', overflow: 'hidden' }}>
                    {others.map((a, i) => renderAthleteRow(a, i))}
                  </div>
                )
              )}
            </>
          )}
        </div>
      </div>

      {menu && (
        <>
          <div onClick={() => setMenu(null)} style={{ position: 'fixed', inset: 0, zIndex: 900 }} />
          <div style={{
            position: 'fixed', left: menu.left, zIndex: 1000,
            transform: 'translateX(-100%)',
            ...(menu.openUp ? { bottom: window.innerHeight - menu.top + 4 } : { top: menu.top + 4 }),
            background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 'var(--r)',
            boxShadow: '0 8px 24px rgba(0,0,0,.2)', overflow: 'hidden', minWidth: 180,
          }}>
            {menu.athlete.email && (
              <button onClick={() => inviteFromMenu(menu.athlete)} style={{ display: 'block', width: '100%', textAlign: 'left', background: 'none', border: 'none', padding: '10px 14px', fontSize: 13, fontWeight: 600, color: 'var(--text)', cursor: 'pointer', borderBottom: '1px solid var(--border)' }}>
                {menu.athlete.auth_user_id ? '🔑 Renvoyer un lien de connexion' : '✉️ Envoyer l\'invitation'}
              </button>
            )}
            {menu.athlete.is_test && (
              <button onClick={() => convertTestToClient(menu.athlete)} style={{ display: 'block', width: '100%', textAlign: 'left', background: 'none', border: 'none', padding: '10px 14px', fontSize: 13, fontWeight: 600, color: 'var(--green)', cursor: 'pointer', borderBottom: '1px solid var(--border)' }}>
                ✓ Convertir en client
              </button>
            )}
            {!menu.athlete.is_coach && (
              <button onClick={() => router.push(`/athletes/${menu.athlete.id}`)} style={{ display: 'block', width: '100%', textAlign: 'left', background: 'none', border: 'none', padding: '10px 14px', fontSize: 13, fontWeight: 600, color: 'var(--text)', cursor: 'pointer', borderBottom: '1px solid var(--border)' }}>
                📋 Ouvrir la fiche
              </button>
            )}
            {!menu.athlete.is_coach && (
              <button onClick={() => toggleFollowType(menu.athlete)} style={{ display: 'block', width: '100%', textAlign: 'left', background: 'none', border: 'none', padding: '10px 14px', fontSize: 13, fontWeight: 600, color: 'var(--text)', cursor: 'pointer', borderBottom: '1px solid var(--border)' }}>
                {menu.athlete.is_1to1_client ? '↩︎ Retirer du suivi 1:1' : '🤝 Marquer en suivi 1:1'}
              </button>
            )}
            <button onClick={() => archiveAthlete(menu.athlete)} style={{ display: 'block', width: '100%', textAlign: 'left', background: 'none', border: 'none', padding: '10px 14px', fontSize: 13, fontWeight: 600, color: '#92400E', cursor: 'pointer' }}>
              📦 Archiver
            </button>
            <button onClick={() => deleteAthlete(menu.athlete)} style={{ display: 'block', width: '100%', textAlign: 'left', background: 'none', border: 'none', padding: '10px 14px', fontSize: 13, fontWeight: 600, color: '#991B1B', cursor: 'pointer', borderTop: '1px solid var(--border)' }}>
              🗑 Supprimer
            </button>
          </div>
        </>
      )}

      {showAdd && (
        <div onClick={closeAdd} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 400, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: 'var(--bg)', borderRadius: 'var(--rl)', padding: 20, width: '100%', maxWidth: 380, boxShadow: '0 8px 40px rgba(0,0,0,0.2)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <div style={{ fontWeight: 800, fontSize: 16, flex: 1 }}>+ Ajouter un client</div>
              <button onClick={closeAdd} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: 'var(--text3)', padding: 0 }}>×</button>
            </div>

            {!createdAthlete ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 12 }}>
                <input
                  autoFocus
                  placeholder="Prénom Nom"
                  value={newName}
                  onChange={e => setNewName(e.target.value)}
                  style={{ padding: '10px 12px', border: '1px solid var(--border2)', borderRadius: 'var(--r)', fontSize: 14, outline: 'none', background: 'var(--bg2)', color: 'var(--text)' }}
                />
                <input
                  type="email"
                  placeholder="Email (pour l'inviter)"
                  value={newEmail}
                  onChange={e => setNewEmail(e.target.value)}
                  style={{ padding: '10px 12px', border: '1px solid var(--border2)', borderRadius: 'var(--r)', fontSize: 14, outline: 'none', background: 'var(--bg2)', color: 'var(--text)' }}
                />
                <button onClick={createClient} disabled={creating || !newName.trim()}
                  style={{ background: newName.trim() ? 'var(--green)' : 'var(--border)', color: '#fff', border: 'none', borderRadius: 'var(--r)', padding: '10px', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>
                  {creating ? '…' : 'Créer le client'}
                </button>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 12 }}>
                <div style={{ fontSize: 13, color: 'var(--text2)' }}>
                  <b>{createdAthlete.name}</b> a été créé. {newEmail.trim() ? "Envoie-lui son invitation :" : "Ajoute un email pour l'inviter (ou fais-le plus tard depuis sa fiche)."}
                </div>
                {newEmail.trim() && (
                  <button onClick={sendInviteEmail} disabled={inviting}
                    style={{ background: 'var(--green)', color: '#fff', border: 'none', borderRadius: 'var(--r)', padding: '10px', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>
                    {inviting ? '…' : '✉️ Envoyer l\'invitation par email'}
                  </button>
                )}
                {inviteMsg && <div style={{ fontSize: 12, color: inviteMsg.startsWith('Erreur') ? '#DC2626' : '#166534', fontWeight: 600 }}>{inviteMsg}</div>}
                <button onClick={closeAdd} style={{ background: 'none', border: '1px solid var(--border2)', borderRadius: 'var(--r)', padding: '9px', fontSize: 13, cursor: 'pointer', color: 'var(--text3)' }}>
                  Terminé
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
