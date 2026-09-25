'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { getCoachId } from '@/lib/coach'
import PasswordSettingsModal from './PasswordSettingsModal'
import TimerModal from './TimerModal'
import GoniometerView from './GoniometerView'
import QuickAngleModal from './QuickAngleModal'
import { unlockAudio } from '@/lib/audioBeep'
import { unlockSpeech } from '@/lib/speak'
import { guardNavigation, hasUnsavedChanges } from '@/lib/unsavedChanges'
import { clearLastPath } from '@/lib/lastPath'
import {
  House, User, UsersThree, Robot, Timer as TimerIcon, Ruler, CalendarBlank, CookingPot, Carrot,
  ForkKnife, ClipboardText, ChartLineUp, Lightbulb, BookOpen, Lightning, Money, EnvelopeSimple,
  MagnifyingGlass, GearSix, SignOut, Barbell,
} from '@phosphor-icons/react'

async function logout() {
  clearLastPath()
  await supabase.auth.signOut()
  window.location.href = '/login'
}

const METRICS = [
  { key: 'sommeil',     emoji: '🌙', inverse: false },
  { key: 'stress',      emoji: '😰', inverse: true  },
  { key: 'courbatures', emoji: '💪', inverse: true  },
  { key: 'forme',       emoji: '⚡', inverse: false },
]

function scoreColor(val, inverse) {
  if (!val) return 'var(--border2)'
  const s = inverse ? (11 - val) : val
  if (s >= 7) return '#22c55e'
  if (s >= 4) return '#f59e0b'
  return '#ef4444'
}

function initials(name) {
  return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)
}

function today() {
  const n = new Date()
  return [n.getFullYear(), String(n.getMonth() + 1).padStart(2, '0'), String(n.getDate()).padStart(2, '0')].join('-')
}

function formatDateShort(d) {
  return new Date(d + 'T00:00:00').toLocaleDateString('fr-FR', {
    weekday: 'long', day: 'numeric', month: 'short'
  })
}

export default function AthletesSidebar({ athleteId, date = today() }) {
  const [athletes, setAthletes] = useState([])
  const [wellness, setWellness] = useState({})
  const [done, setDone] = useState(new Set())
  const [open, setOpen] = useState(false)
  const [collapsed, setCollapsed] = useState(false)
  const [search, setSearch] = useState('')
  const [searchFocused, setSearchFocused] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [sectionsCollapsed, setSectionsCollapsed] = useState({})
  const [showTimer, setShowTimer] = useState(false)
  const [gonioChoice, setGonioChoice] = useState(false) // menu "mesure rapide / nouveau test"
  const [showQuickAngle, setShowQuickAngle] = useState(false)
  const [gonioAthleteId, setGonioAthleteId] = useState(null)
  const [creatingTest, setCreatingTest] = useState(false)

  useEffect(() => {
    try {
      const raw = localStorage.getItem('coachpro_nav_sections_collapsed')
      if (raw) setSectionsCollapsed(JSON.parse(raw))
    } catch {}
  }, [])

  const toggleSection = (key) => {
    setSectionsCollapsed(prev => {
      const next = { ...prev, [key]: !prev[key] }
      try { localStorage.setItem('coachpro_nav_sections_collapsed', JSON.stringify(next)) } catch {}
      return next
    })
  }

  useEffect(() => {
    setCollapsed(localStorage.getItem('coachpro_sidebar_collapsed') === '1')
  }, [])

  const toggleCollapsed = () => {
    setCollapsed(prev => {
      const next = !prev
      localStorage.setItem('coachpro_sidebar_collapsed', next ? '1' : '0')
      return next
    })
  }

  useEffect(() => {
    async function load() {
      const { data: aths } = await supabase
        .from('athletes').select('*').neq('archived', true).eq('is_test', false).order('created_at')
      if (!aths?.length) { setAthletes([]); return }
      setAthletes(aths)

      const ids = aths.map(a => a.id)

      // wellness du jour
      const { data: wRows } = await supabase
        .from('wellness').select('*').eq('date', date).in('athlete_id', ids)
      const wMap = {}
      ;(wRows || []).forEach(r => { wMap[r.athlete_id] = r })
      setWellness(wMap)

      // sessions du jour
      const { data: sessions } = await supabase
        .from('sessions').select('id, athlete_id')
        .eq('date', date).in('athlete_id', ids)
      if (!sessions?.length) { setDone(new Set()); return }

      // exercises de ces sessions
      const { data: exos } = await supabase
        .from('exercises').select('id, session_id')
        .in('session_id', sessions.map(s => s.id))
      if (!exos?.length) { setDone(new Set()); return }

      // athlete_logs pour ces exercises
      const { data: logs } = await supabase
        .from('athlete_logs').select('exercise_id')
        .in('exercise_id', exos.map(e => e.id))

      const loggedExoIds = new Set((logs || []).map(l => l.exercise_id))
      const sessionsWithLog = new Set(
        exos.filter(e => loggedExoIds.has(e.id)).map(e => e.session_id)
      )
      const doneIds = new Set(
        sessions.filter(s => sessionsWithLog.has(s.id)).map(s => s.athlete_id)
      )
      setDone(doneIds)
    }
    load()
  }, [date])

  const startNamedGonioTest = async () => {
    unlockAudio()
    unlockSpeech()
    const name = window.prompt('Nom de ce test (ex: "Cliente Insta — épaule D") ?')
    if (!name || !name.trim()) return
    setCreatingTest(true)
    const coachId = await getCoachId()
    const { data, error } = await supabase.from('athletes')
      .insert({ coach_id: coachId, name: name.trim(), is_test: true, token: crypto.randomUUID() })
      .select().single()
    setCreatingTest(false)
    setGonioChoice(false)
    if (error) { alert('Erreur : ' + error.message); return }
    setGonioAthleteId(data.id)
  }

  const filteredAthletes = search.trim()
    ? athletes.filter(a => a.name.toLowerCase().includes(search.trim().toLowerCase()))
    : []

  return (
    <>
      {/* Bouton hamburger — mobile uniquement */}
      <button
        onClick={() => setOpen(true)}
        className="sidebar-toggle"
        style={{
          position: 'fixed', bottom: 20, left: 16, zIndex: 200,
          background: 'var(--green)', color: '#fff', border: 'none',
          borderRadius: '50%', width: 48, height: 48,
          fontSize: 20, cursor: 'pointer', boxShadow: '0 2px 12px rgba(0,0,0,0.2)',
          alignItems: 'center', justifyContent: 'center',
        }}
        aria-label="Ouvrir la liste des sportifs"
      >☰</button>

      {/* Backdrop */}
      {open && (
        <div
          onClick={() => setOpen(false)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 299 }}
        />
      )}

    <div className={`coach-sidebar${open ? ' coach-sidebar--open' : ''}${collapsed ? ' coach-sidebar--collapsed' : ''}`}>
      {/* Header sidebar */}
      <div style={{ padding: '16px 12px 10px', borderBottom: '1px solid var(--border)', flexShrink: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontFamily: 'var(--font-title)', color: 'var(--title)', fontWeight: 700, fontSize: 16, marginBottom: 2 }}>OSTRYK</div>
          <div style={{ fontSize: 11, color: 'var(--text3)', textTransform: 'capitalize' }}>
            {formatDateShort(date)}
          </div>
        </div>
        <button onClick={toggleCollapsed} className="sidebar-collapse-btn"
          style={{ display: 'none', background: 'none', border: 'none', fontSize: 16, cursor: 'pointer', color: 'var(--text3)', padding: 4 }}
          title="Réduire le bandeau">«</button>
        <button onClick={() => setOpen(false)} className="sidebar-close"
          style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: 'var(--text3)', padding: 4 }}>✕</button>
      </div>

      {/* Navigation principale */}
      <div style={{ padding: '8px', borderBottom: '1px solid var(--border)', flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
        <Link href="/" onClick={e => { if (guardNavigation(e)) setOpen(false) }} style={{
          display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px',
          borderRadius: 'var(--r)', textDecoration: 'none', fontSize: 13, fontWeight: 600,
          color: 'var(--text2)', background: 'transparent',
        }}><House size={16} /> Tableau de bord</Link>

        <div style={{ position: 'relative', margin: '2px 2px 4px' }}>
          <span style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', display: 'flex', color: 'var(--text3)' }}><MagnifyingGlass size={13} /></span>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            onFocus={() => setSearchFocused(true)}
            onBlur={() => setTimeout(() => setSearchFocused(false), 150)}
            placeholder="Rechercher un sportif…"
            style={{
              width: '100%', boxSizing: 'border-box', border: '1px solid var(--border2)', borderRadius: 'var(--r)',
              padding: '6px 8px 6px 26px', fontSize: 12, outline: 'none', background: 'var(--bg2)', color: 'var(--text)',
            }}
          />

          {/* Dropdown de résultats, ancré sous le champ (avant : rendu tout en bas de la
              sidebar, ce qui obligeait à scroller pour le voir). */}
          {search.trim() && searchFocused && (
            <div style={{
              position: 'absolute', top: '100%', left: 0, right: 0, marginTop: 4,
              background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 'var(--r)',
              boxShadow: '0 8px 24px rgba(0,0,0,0.18)', zIndex: 50, maxHeight: '50vh', overflowY: 'auto', padding: 4,
            }}>
              {filteredAthletes.length === 0 ? (
                <div style={{ padding: '10px 8px', fontSize: 12, color: 'var(--text3)' }}>Aucun résultat.</div>
              ) : filteredAthletes.map(a => {
                const active = a.id === athleteId
                const w = wellness[a.id]
                const seanceFaite = done.has(a.id)

                return (
                  <Link
                    key={a.id}
                    href={`/semaine/${a.id}/${date}`}
                    onClick={e => { if (guardNavigation(e)) { setOpen(false); setSearch('') } }}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 8,
                      padding: '8px 8px', borderRadius: 'var(--r)',
                      background: active ? 'var(--green-light)' : 'transparent',
                      border: active ? '1px solid #B8EAD8' : '1px solid transparent',
                      textDecoration: 'none', color: 'inherit',
                    }}
                  >
                    {/* Avatar */}
                    <div style={{
                      width: 32, height: 32, borderRadius: '50%', flexShrink: 0,
                      background: active ? 'var(--green)' : 'var(--bg2)',
                      color: active ? '#fff' : 'var(--text2)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 11, fontWeight: 800,
                      border: seanceFaite ? '2px solid #22c55e' : '1px solid var(--border2)',
                    }}>
                      {initials(a.name)}
                    </div>

                    {/* Infos */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: active ? '#0D6B4F' : 'var(--text)', display: 'flex', alignItems: 'center', gap: 5 }}>
                        {a.name}
                        {a.is_coach && (
                          <span style={{ fontSize: 9, fontWeight: 800, background: '#DBEAFE', color: '#1D4ED8', borderRadius: 10, padding: '1px 5px', flexShrink: 0 }}>COACH</span>
                        )}
                      </div>
                      {/* Dots bien-être sportif */}
                      {w ? (
                        <div style={{ display: 'flex', gap: 3, marginTop: 2 }}>
                          {METRICS.map(m => {
                            const v = w[m.key]
                            if (!v) return null
                            return (
                              <span key={m.key} style={{ fontSize: 10, fontWeight: 700, color: scoreColor(v, m.inverse) }}>
                                {m.emoji}{v}
                              </span>
                            )
                          })}
                        </div>
                      ) : (
                        <div style={{ fontSize: 10, color: 'var(--text3)', marginTop: 1 }}>{a.is_coach ? 'Coach' : 'Pas de données'}</div>
                      )}
                    </div>

                    {/* Badge séance faite */}
                    {seanceFaite && (
                      <span style={{ fontSize: 11, color: '#22c55e', flexShrink: 0 }}>✓</span>
                    )}
                  </Link>
                )
              })}
            </div>
          )}
        </div>

        <Link href="/athletes" onClick={e => { if (guardNavigation(e)) setOpen(false) }} style={{
          display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px',
          borderRadius: 'var(--r)', textDecoration: 'none', fontSize: 13, fontWeight: 600,
          color: 'var(--text2)', background: 'transparent',
        }}><User size={16} /> Sportifs</Link>
        <Link href="/groups" onClick={e => { if (guardNavigation(e)) setOpen(false) }} style={{
          display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px',
          borderRadius: 'var(--r)', textDecoration: 'none', fontSize: 13, fontWeight: 600,
          color: 'var(--text2)', background: 'transparent',
        }}><UsersThree size={16} /> Groupes</Link>
        <Link href="/assistant" onClick={e => { if (guardNavigation(e)) setOpen(false) }} style={{
          display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px',
          borderRadius: 'var(--r)', textDecoration: 'none', fontSize: 13, fontWeight: 600,
          color: 'var(--text2)', background: 'transparent',
        }}><Robot size={16} /> Assistant IA</Link>

        <button onClick={() => toggleSection('coaching')} style={{
          display: 'flex', alignItems: 'center', gap: 4, width: '100%', background: 'none', border: 'none', cursor: 'pointer',
          fontSize: 10, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.5px', padding: '10px 10px 2px', fontFamily: 'inherit',
        }}>
          <span style={{ transform: sectionsCollapsed.coaching ? 'rotate(-90deg)' : 'none', transition: 'transform .15s', display: 'inline-block', fontSize: 9 }}>▾</span>
          Coaching
        </button>
        {!sectionsCollapsed.coaching && (
          <>
            <Link href="/programs" onClick={e => { if (guardNavigation(e)) setOpen(false) }} style={{
              display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px',
              borderRadius: 'var(--r)', textDecoration: 'none', fontSize: 13, fontWeight: 600,
              color: 'var(--text2)', background: 'transparent',
            }}><ClipboardText size={16} /> Programmes</Link>
            <Link href="/workouts" onClick={e => { if (guardNavigation(e)) setOpen(false) }} style={{
              display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px',
              borderRadius: 'var(--r)', textDecoration: 'none', fontSize: 13, fontWeight: 600,
              color: 'var(--text2)', background: 'transparent',
            }}><Barbell size={16} /> Workouts</Link>
            <Link href="/movements" onClick={e => { if (guardNavigation(e)) setOpen(false) }} style={{
              display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px',
              borderRadius: 'var(--r)', textDecoration: 'none', fontSize: 13, fontWeight: 600,
              color: 'var(--text2)', background: 'transparent',
            }}><BookOpen size={16} /> Bibliothèque d&apos;exercices</Link>
            <Link href="/metrics" onClick={e => { if (guardNavigation(e)) setOpen(false) }} style={{
              display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px',
              borderRadius: 'var(--r)', textDecoration: 'none', fontSize: 13, fontWeight: 600,
              color: 'var(--text2)', background: 'transparent',
            }}><ChartLineUp size={16} /> Metrics</Link>
            <Link href="/tips" onClick={e => { if (guardNavigation(e)) setOpen(false) }} style={{
              display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px',
              borderRadius: 'var(--r)', textDecoration: 'none', fontSize: 13, fontWeight: 600,
              color: 'var(--text2)', background: 'transparent',
            }}><Lightbulb size={16} /> Tips</Link>
          </>
        )}

        <button onClick={() => toggleSection('outils')} style={{
          display: 'flex', alignItems: 'center', gap: 4, width: '100%', background: 'none', border: 'none', cursor: 'pointer',
          fontSize: 10, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.5px', padding: '10px 10px 2px', fontFamily: 'inherit',
        }}>
          <span style={{ transform: sectionsCollapsed.outils ? 'rotate(-90deg)' : 'none', transition: 'transform .15s', display: 'inline-block', fontSize: 9 }}>▾</span>
          Outils
        </button>
        {!sectionsCollapsed.outils && (
          <>
            <button onClick={() => setShowTimer(true)} style={{
              display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', width: '100%', textAlign: 'left',
              borderRadius: 'var(--r)', border: 'none', background: 'transparent', cursor: 'pointer', fontFamily: 'inherit',
              fontSize: 13, fontWeight: 600, color: 'var(--text2)',
            }}><TimerIcon size={16} /> Timer</button>
            <button onClick={() => setGonioChoice(true)} style={{
              display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', width: '100%', textAlign: 'left',
              borderRadius: 'var(--r)', border: 'none', background: 'transparent', cursor: 'pointer', fontFamily: 'inherit',
              fontSize: 13, fontWeight: 600, color: 'var(--text2)',
            }}><Ruler size={16} /> Goniomètre</button>
          </>
        )}

        <button onClick={() => toggleSection('nutrition')} style={{
          display: 'flex', alignItems: 'center', gap: 4, width: '100%', background: 'none', border: 'none', cursor: 'pointer',
          fontSize: 10, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.5px', padding: '10px 10px 2px', fontFamily: 'inherit',
        }}>
          <span style={{ transform: sectionsCollapsed.nutrition ? 'rotate(-90deg)' : 'none', transition: 'transform .15s', display: 'inline-block', fontSize: 9 }}>▾</span>
          Nutrition
        </button>
        {!sectionsCollapsed.nutrition && (
          <>
            <Link href="/nutrition/plans" onClick={e => { if (guardNavigation(e)) setOpen(false) }} style={{
              display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px',
              borderRadius: 'var(--r)', textDecoration: 'none', fontSize: 13, fontWeight: 600,
              color: 'var(--text2)', background: 'transparent',
            }}><CalendarBlank size={16} /> Plans</Link>
            <Link href="/nutrition/recettes" onClick={e => { if (guardNavigation(e)) setOpen(false) }} style={{
              display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px',
              borderRadius: 'var(--r)', textDecoration: 'none', fontSize: 13, fontWeight: 600,
              color: 'var(--text2)', background: 'transparent',
            }}><CookingPot size={16} /> Recettes</Link>
            <Link href="/nutrition/aliments" onClick={e => { if (guardNavigation(e)) setOpen(false) }} style={{
              display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px',
              borderRadius: 'var(--r)', textDecoration: 'none', fontSize: 13, fontWeight: 600,
              color: 'var(--text2)', background: 'transparent',
            }}><Carrot size={16} /> Aliments</Link>
            <Link href="/meal-planner" onClick={e => { if (guardNavigation(e)) setOpen(false) }} style={{
              display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px',
              borderRadius: 'var(--r)', textDecoration: 'none', fontSize: 13, fontWeight: 600,
              color: 'var(--text2)', background: 'transparent',
            }}><ForkKnife size={16} /> Générateur de plan</Link>
          </>
        )}

        <button onClick={() => toggleSection('exercice')} style={{
          display: 'flex', alignItems: 'center', gap: 4, width: '100%', background: 'none', border: 'none', cursor: 'pointer',
          fontSize: 10, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.5px', padding: '10px 10px 2px', fontFamily: 'inherit',
        }}>
          <span style={{ transform: sectionsCollapsed.exercice ? 'rotate(-90deg)' : 'none', transition: 'transform .15s', display: 'inline-block', fontSize: 9 }}>▾</span>
          Exercice
        </button>
        {!sectionsCollapsed.exercice && (
          <>
            <Link href="/library/activations" onClick={e => { if (guardNavigation(e)) setOpen(false) }} style={{
              display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px',
              borderRadius: 'var(--r)', textDecoration: 'none', fontSize: 13, fontWeight: 600,
              color: 'var(--text2)', background: 'transparent',
            }}><Lightning size={16} /> Activations</Link>
          </>
        )}

        <button onClick={() => toggleSection('business')} style={{
          display: 'flex', alignItems: 'center', gap: 4, width: '100%', background: 'none', border: 'none', cursor: 'pointer',
          fontSize: 10, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.5px', padding: '10px 10px 2px', fontFamily: 'inherit',
        }}>
          <span style={{ transform: sectionsCollapsed.business ? 'rotate(-90deg)' : 'none', transition: 'transform .15s', display: 'inline-block', fontSize: 9 }}>▾</span>
          Business
        </button>
        {!sectionsCollapsed.business && (
          <>
            <Link href="/finances" onClick={e => { if (guardNavigation(e)) setOpen(false) }} style={{
              display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px',
              borderRadius: 'var(--r)', textDecoration: 'none', fontSize: 13, fontWeight: 600,
              color: 'var(--text2)', background: 'transparent',
            }}><Money size={16} /> Finances</Link>
            <Link href="/demandes" onClick={e => { if (guardNavigation(e)) setOpen(false) }} style={{
              display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px',
              borderRadius: 'var(--r)', textDecoration: 'none', fontSize: 13, fontWeight: 600,
              color: 'var(--text2)', background: 'transparent',
            }}><EnvelopeSimple size={16} /> Demandes</Link>
          </>
        )}
      </div>

      {/* Bas de sidebar : déconnexion + accueil */}
      <div style={{ padding: '10px 12px', borderTop: '1px solid var(--border)', flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
        <button
          onClick={() => setShowSettings(true)}
          style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 6, background: 'var(--bg2)', border: '1px solid var(--border2)', borderRadius: 'var(--r)', padding: '8px 12px', fontSize: 12, fontWeight: 600, color: 'var(--text3)', cursor: 'pointer', textAlign: 'left' }}
        >
          <GearSix size={14} /> Paramètres
        </button>
        <button
          onClick={() => { if (hasUnsavedChanges() && !window.confirm('Tu as des modifications non sauvegardées sur cette page. Te déconnecter sans enregistrer ?')) return; logout() }}
          style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 6, background: 'var(--bg2)', border: '1px solid var(--border2)', borderRadius: 'var(--r)', padding: '8px 12px', fontSize: 12, fontWeight: 600, color: 'var(--text3)', cursor: 'pointer', textAlign: 'left' }}
        >
          <SignOut size={14} /> Déconnexion
        </button>
        <Link href="/" onClick={guardNavigation} style={{ fontSize: 12, color: 'var(--text3)', textDecoration: 'none', fontWeight: 600, padding: '2px 0' }}>
          ← Accueil
        </Link>
      </div>
    </div>

    {/* Bouton pour rouvrir le bandeau réduit — desktop uniquement */}
    <button
      onClick={toggleCollapsed}
      className="sidebar-reopen-btn"
      style={{
        display: 'none', position: 'sticky', top: 10, left: 0, alignSelf: 'flex-start',
        background: 'var(--bg)', border: '1px solid var(--border)', borderLeft: 'none',
        borderRadius: '0 var(--r) var(--r) 0', width: 20, height: 40,
        fontSize: 13, color: 'var(--text3)', cursor: 'pointer', flexShrink: 0, zIndex: 5,
      }}
      title="Afficher le bandeau"
    >»</button>

    {showSettings && <PasswordSettingsModal onClose={() => setShowSettings(false)} />}
    {showTimer && <TimerModal onClose={() => setShowTimer(false)} />}

    {gonioChoice && (
      <div onClick={() => setGonioChoice(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 850, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
        <div onClick={e => e.stopPropagation()} style={{ background: 'var(--bg)', borderRadius: 'var(--rl)', padding: 20, width: '100%', maxWidth: 360, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ fontFamily: 'var(--font-title)', color: 'var(--title)', fontWeight: 700, fontSize: 17, marginBottom: 4, display: 'flex', alignItems: 'center', gap: 8 }}><Ruler size={18} /> Goniomètre</div>
          <button onClick={() => { setGonioChoice(false); setShowQuickAngle(true) }} style={{
            textAlign: 'left', background: 'var(--bg2)', border: '1px solid var(--border2)', borderRadius: 'var(--r)',
            padding: '12px 14px', cursor: 'pointer', fontFamily: 'inherit',
          }}>
            <div style={{ fontWeight: 700, fontSize: 14 }}>Mesure rapide</div>
            <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 2 }}>Photo ou client en direct, rien n&apos;est sauvegardé</div>
          </button>
          <button onClick={startNamedGonioTest} disabled={creatingTest} style={{
            textAlign: 'left', background: 'var(--green-light)', border: '1px solid #B8EAD8', borderRadius: 'var(--r)',
            padding: '12px 14px', cursor: 'pointer', fontFamily: 'inherit',
          }}>
            <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--green)' }}>{creatingTest ? '…' : 'Nouveau test nommé'}</div>
            <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 2 }}>Sauvegardé comme fiche de test, à convertir ou supprimer plus tard</div>
          </button>
          <button onClick={() => setGonioChoice(false)} style={{ background: 'none', border: 'none', color: 'var(--text3)', fontSize: 13, cursor: 'pointer', marginTop: 4 }}>Annuler</button>
        </div>
      </div>
    )}

    {showQuickAngle && <QuickAngleModal onClose={() => setShowQuickAngle(false)} />}
    {gonioAthleteId && <GoniometerView athleteId={gonioAthleteId} onClose={() => setGonioAthleteId(null)} />}
    </>
  )
}
