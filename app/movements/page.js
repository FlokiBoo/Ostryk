'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { VideoCamera, BookOpen, MagnifyingGlass, PencilSimple, Trash, Eye, EyeSlash } from '@phosphor-icons/react'
import { supabase } from '@/lib/supabase'
import AthletesSidebar from '@/app/components/AthletesSidebar'
import EquipmentPicker from '@/app/components/EquipmentPicker'

function today() {
  const n = new Date()
  return [n.getFullYear(), String(n.getMonth()+1).padStart(2,'0'), String(n.getDate()).padStart(2,'0')].join('-')
}

const COLUMNS = [
  { key: 'name',        label: 'Nom du mouvement',   flex: 4 },
  { key: 'equipment',   label: 'Matériel',            flex: 2 },
  { key: 'youtube_url', label: 'Vidéo',               flex: 1 },
]

// Cycle des états de tri par colonne : name = alpha/inverse,
// muscles/matériel = alpha/inverse/vide d'abord, vidéo = avec/sans d'abord
const SORT_CYCLES = {
  name: ['asc', 'desc'],
  muscles: ['asc', 'desc', 'empty'],
  equipment: ['asc', 'desc', 'empty'],
  youtube_url: ['with', 'without'],
}

function sortIndicator(colKey, sort) {
  if (sort.key !== colKey) return ''
  if (colKey === 'youtube_url') return sort.dir === 'with' ? <> <VideoCamera size={11} style={{ verticalAlign: -1 }} /> d&apos;abord</> : ' — d\'abord'
  if (sort.dir === 'empty') return ' (vide d\'abord)'
  return sort.dir === 'asc' ? ' ▲' : ' ▼'
}

function sortMovements(list, sort) {
  const arr = [...list]
  const { key, dir } = sort

  if (key === 'name') {
    arr.sort((a, b) => a.name.localeCompare(b.name, 'fr'))
    if (dir === 'desc') arr.reverse()
    return arr
  }

  if (key === 'muscles' || key === 'equipment') {
    const text = m => (key === 'equipment' ? (m.equipment || []).join(', ') : (m[key] || '')).trim()
    arr.sort((a, b) => {
      const av = text(a), bv = text(b)
      if (dir === 'empty') {
        if (!av && bv) return -1
        if (av && !bv) return 1
        return a.name.localeCompare(b.name, 'fr')
      }
      if (!av && !bv) return a.name.localeCompare(b.name, 'fr')
      if (!av) return 1
      if (!bv) return -1
      return dir === 'desc' ? bv.localeCompare(av, 'fr') : av.localeCompare(bv, 'fr')
    })
    return arr
  }

  if (key === 'youtube_url') {
    arr.sort((a, b) => {
      const aHas = !!a.youtube_url, bHas = !!b.youtube_url
      if (aHas === bHas) return a.name.localeCompare(b.name, 'fr')
      const aFirst = dir === 'with' ? aHas : !aHas
      return aFirst ? -1 : 1
    })
    return arr
  }

  return arr
}

function emptyForm() {
  return { name: '', muscles: '', equipment: [], youtube_url: '' }
}

export default function MovementsPage() {
  const router = useRouter()
  const [movements, setMovements] = useState([])
  const [search, setSearch] = useState('')
  const [editingId, setEditingId] = useState(null)
  const [editForm, setEditForm] = useState(emptyForm())
  const [showCreate, setShowCreate] = useState(false)
  const [newForm, setNewForm] = useState(emptyForm())
  const [saving, setSaving] = useState(false)
  const [sort, setSort] = useState({ key: 'name', dir: 'asc' })
  const [userId, setUserId] = useState(null)
  const [isAdmin, setIsAdmin] = useState(false)
  const [hiddenIds, setHiddenIds] = useState(new Set())
  const nameRef = useRef(null)

  async function loadUser() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    setUserId(user.id)
    const { data: coach } = await supabase.from('coaches').select('is_admin').eq('id', user.id).single()
    setIsAdmin(!!coach?.is_admin)
  }

  async function loadHidden() {
    const { data } = await supabase.from('coach_hidden_content').select('content_id').eq('content_type', 'movement')
    setHiddenIds(new Set((data || []).map(r => r.content_id)))
  }

  async function toggleHidden(movementId, hidden) {
    if (hidden) {
      await supabase.from('coach_hidden_content').delete().eq('content_type', 'movement').eq('content_id', movementId)
      setHiddenIds(prev => { const next = new Set(prev); next.delete(movementId); return next })
    } else {
      await supabase.from('coach_hidden_content').insert({ coach_id: userId, content_type: 'movement', content_id: movementId })
      setHiddenIds(prev => new Set(prev).add(movementId))
    }
  }

  async function load() {
    const { data } = await supabase.from('movements').select('*').order('name')
    setMovements(data || [])
  }

  useEffect(() => { Promise.resolve().then(() => { loadUser(); load(); loadHidden() }) }, [])
  useEffect(() => { if (showCreate) nameRef.current?.focus() }, [showCreate])

  async function create() {
    if (!newForm.name.trim()) return
    setSaving(true)
    const { data, error } = await supabase.from('movements').insert({
      name: newForm.name.trim(),
      muscles: newForm.muscles.trim() || null,
      equipment: newForm.equipment.length ? newForm.equipment : null,
      youtube_url: newForm.youtube_url.trim() || null,
      coach_id: isAdmin ? null : userId,
    }).select().single()
    if (error) { alert('Erreur : ' + error.message); setSaving(false); return }
    if (!data) { alert('Mouvement non créé — exécute "ALTER TABLE movements DISABLE ROW LEVEL SECURITY;" dans Supabase'); setSaving(false); return }
    setMovements(prev => [...prev, data].sort((a, b) => a.name.localeCompare(b.name, 'fr')))
    setNewForm(emptyForm())
    setShowCreate(false)
    setSaving(false)
  }

  async function saveEdit() {
    if (!editForm.name.trim()) return
    setSaving(true)
    const name = editForm.name.trim()
    await supabase.from('movements').update({
      name,
      muscles: editForm.muscles.trim() || null,
      equipment: editForm.equipment.length ? editForm.equipment : null,
      youtube_url: editForm.youtube_url.trim() || null,
    }).eq('id', editingId)
    // Garde le mouvement suivi (Metrics) lié en synchronisant son nom
    await supabase.from('tracked_movements').update({ name }).eq('movement_id', editingId)
    setMovements(prev => prev.map(m =>
      m.id === editingId ? { ...m, ...editForm } : m
    ).sort((a, b) => a.name.localeCompare(b.name, 'fr')))
    setEditingId(null)
    setSaving(false)
  }

  async function remove(id) {
    if (!window.confirm('Supprimer ce mouvement ?')) return
    await supabase.from('movements').delete().eq('id', id)
    setMovements(prev => prev.filter(m => m.id !== id))
  }

  const handleSort = (key) => {
    setSort(prev => {
      if (prev.key !== key) return { key, dir: SORT_CYCLES[key][0] }
      const cycle = SORT_CYCLES[key]
      const idx = cycle.indexOf(prev.dir)
      return { key, dir: cycle[(idx + 1) % cycle.length] }
    })
  }

  const filtered = movements.filter(m =>
    m.name.toLowerCase().includes(search.toLowerCase()) ||
    (m.muscles || '').toLowerCase().includes(search.toLowerCase()) ||
    (m.equipment || []).join(' ').toLowerCase().includes(search.toLowerCase())
  )
  const sorted = sortMovements(filtered, sort)

  const inputStyle = {
    width: '100%', boxSizing: 'border-box', padding: '7px 10px',
    border: '1px solid var(--ostryk-border-input)', borderRadius: 6,
    fontSize: 13, outline: 'none', background: 'var(--bg)', color: 'var(--text)',
    fontFamily: 'inherit',
  }

  return (
    <div className="coach-layout">
      <AthletesSidebar athleteId={null} date={today()} />

      <main className="coach-main" style={{ display: 'flex', flexDirection: 'column', minHeight: '100svh' }}>

        {/* Header */}
        <div style={{ padding: '18px 24px 0', display: 'flex', alignItems: 'center', gap: 12, borderBottom: '1px solid var(--border)', paddingBottom: 14 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontFamily: 'var(--font-title)', color: 'var(--title)', fontSize: 19, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}><BookOpen size={18} /> Exercice</div>
            <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 2 }}>{movements.length} mouvements</div>
          </div>
          <button
            onClick={() => { setShowCreate(v => !v); setNewForm(emptyForm()) }}
            style={{ background: 'var(--bordeaux)', color: '#fff', border: 'none', borderRadius: 20, padding: '9px 18px', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}
          >
            + Ajouter
          </button>
        </div>

        {/* Formulaire création */}
        {showCreate && (
          <div style={{ padding: '14px 24px', borderBottom: '1px solid var(--border)', background: '#F0FDF4', display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
            <div style={{ flex: 3, minWidth: 160 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: 4 }}>Nom *</div>
              <input ref={nameRef} value={newForm.name} onChange={e => setNewForm(f => ({ ...f, name: e.target.value }))}
                onKeyDown={e => e.key === 'Enter' && create()}
                placeholder="Ex: Squat, Hip Thrust…" style={inputStyle} />
            </div>
            <div style={{ flex: 2, minWidth: 130 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: 4 }}>Muscles principaux</div>
              <input value={newForm.muscles} onChange={e => setNewForm(f => ({ ...f, muscles: e.target.value }))}
                placeholder="Ex: Quadriceps, Fessiers" style={inputStyle} />
            </div>
            <div style={{ flex: 3, minWidth: 220 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: 4 }}>Matériel</div>
              <EquipmentPicker compact selected={newForm.equipment} onChange={equipment => setNewForm(f => ({ ...f, equipment }))} />
            </div>
            <div style={{ flex: 1, minWidth: 100 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: 4 }}>Lien YouTube</div>
              <input value={newForm.youtube_url} onChange={e => setNewForm(f => ({ ...f, youtube_url: e.target.value }))}
                placeholder="https://…" style={inputStyle} />
            </div>
            <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
              <button onClick={() => setShowCreate(false)}
                style={{ background: 'none', border: '1px solid var(--border2)', borderRadius: 6, padding: '7px 12px', fontSize: 13, cursor: 'pointer', color: 'var(--text3)' }}>✕</button>
              <button onClick={create} disabled={saving || !newForm.name.trim()}
                style={{ background: 'var(--green)', color: '#fff', border: 'none', borderRadius: 6, padding: '7px 16px', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
                {saving ? '…' : 'Enregistrer'}
              </button>
            </div>
          </div>
        )}

        {/* Barre de recherche */}
        <div style={{ padding: '12px 24px', borderBottom: '1px solid var(--border)' }}>
          <div style={{ position: 'relative' }}>
            <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', display: 'flex', color: 'var(--text3)' }}><MagnifyingGlass size={14} /></span>
            <input
              placeholder="Rechercher par nom, muscle, matériel…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={{ ...inputStyle, paddingLeft: 34, background: 'var(--bg2)', fontSize: 14 }}
            />
          </div>
        </div>

        {/* En-tête colonnes */}
        <div style={{ display: 'flex', padding: '8px 24px', background: 'var(--bg2)', borderBottom: '1px solid var(--border)' }}>
          {COLUMNS.map(col => (
            <div
              key={col.key}
              onClick={() => handleSort(col.key)}
              title="Cliquer pour trier"
              style={{
                flex: col.flex, fontSize: 11, fontWeight: 700,
                color: sort.key === col.key ? 'var(--green)' : 'var(--text3)',
                textTransform: 'uppercase', letterSpacing: '0.4px',
                cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap',
              }}
            >
              {col.label}{sortIndicator(col.key, sort)}
            </div>
          ))}
          <div style={{ width: 72 }} />
        </div>

        {/* Lignes */}
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {sorted.length === 0 && (
            <div style={{ padding: '40px 24px', textAlign: 'center', color: 'var(--text3)', fontSize: 13 }}>
              {search ? 'Aucun résultat pour cette recherche' : 'Aucun mouvement — clique sur "+ Ajouter"'}
            </div>
          )}

          {sorted.map((m, idx) => (
            <div key={m.id} style={{ borderBottom: '1px solid var(--border)' }}>

              {editingId === m.id ? (
                /* Ligne en édition */
                <div style={{ display: 'flex', padding: '10px 24px', gap: 10, alignItems: 'center', background: '#F0FDF4' }}>
                  <div style={{ flex: 3 }}>
                    <input autoFocus value={editForm.name} onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))}
                      onKeyDown={e => e.key === 'Enter' && saveEdit()}
                      style={inputStyle} />
                  </div>
                  <div style={{ flex: 2 }}>
                    <input value={editForm.muscles} onChange={e => setEditForm(f => ({ ...f, muscles: e.target.value }))}
                      placeholder="Muscles" style={inputStyle} />
                  </div>
                  <div style={{ flex: 3 }}>
                    <EquipmentPicker compact selected={editForm.equipment} onChange={equipment => setEditForm(f => ({ ...f, equipment }))} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <input value={editForm.youtube_url} onChange={e => setEditForm(f => ({ ...f, youtube_url: e.target.value }))}
                      placeholder="URL YouTube" style={inputStyle} />
                  </div>
                  <div style={{ display: 'flex', gap: 6, width: 72, flexShrink: 0 }}>
                    <button onClick={() => setEditingId(null)}
                      style={{ background: 'none', border: '1px solid var(--border2)', borderRadius: 6, padding: '6px 8px', fontSize: 13, cursor: 'pointer', color: 'var(--text3)' }}>✕</button>
                    <button onClick={saveEdit} disabled={saving}
                      style={{ background: 'var(--green)', color: '#fff', border: 'none', borderRadius: 6, padding: '6px 10px', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>✓</button>
                  </div>
                </div>
              ) : (
                /* Ligne normale */
                <div
                  onClick={() => router.push(`/movements/${m.id}`)}
                  style={{ display: 'flex', padding: '13px 24px', alignItems: 'center', gap: 0, cursor: 'pointer', background: idx % 2 === 0 ? 'var(--card-white)' : '#FBF9F5' }}
                  onMouseEnter={e => e.currentTarget.style.background = 'var(--bg2)'}
                  onMouseLeave={e => e.currentTarget.style.background = idx % 2 === 0 ? 'var(--card-white)' : '#FBF9F5'}
                >
                  <div style={{ flex: 4, paddingRight: 12, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--text)', display: 'flex', alignItems: 'center', gap: 6 }}>
                      {m.name}
                      {m.coach_id === userId && (
                        <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--green)', background: 'var(--green-light)', borderRadius: 20, padding: '2px 8px', flexShrink: 0 }}>Perso</span>
                      )}
                      {m.coach_id === null && hiddenIds.has(m.id) && (
                        <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--text3)', background: 'var(--bg2)', borderRadius: 20, padding: '2px 8px', flexShrink: 0 }}>Masqué</span>
                      )}
                    </div>
                    {m.muscles && (
                      <div style={{ fontSize: 11, color: 'var(--ostryk-text2)', marginTop: 2 }}>{m.muscles}</div>
                    )}
                  </div>
                  <div style={{ flex: 2, paddingRight: 12, display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                    {(m.equipment || []).map(e => (
                      <span key={e} style={{ fontSize: 12, fontWeight: 600, color: '#6D5F4D', background: 'var(--ostryk-border)', borderRadius: 20, padding: '3px 10px', display: 'inline-block' }}>
                        {e}
                      </span>
                    ))}
                  </div>
                  <div style={{ flex: 1 }}>
                    {m.youtube_url
                      ? <a href={m.youtube_url} target="_blank" rel="noreferrer"
                          onClick={e => e.stopPropagation()}
                          style={{ fontSize: 12, color: 'var(--green)', fontWeight: 700, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                          ▶ Vidéo
                        </a>
                      : <span style={{ color: 'var(--border2)', fontSize: 13 }}>—</span>
                    }
                  </div>
                  <div style={{ width: 72, display: 'flex', gap: 4, justifyContent: 'flex-end', flexShrink: 0 }}>
                    {(isAdmin || m.coach_id === userId) ? (
                      <>
                        <button onClick={e => { e.stopPropagation(); setEditingId(m.id); setEditForm({ name: m.name, muscles: m.muscles || '', equipment: m.equipment || [], youtube_url: m.youtube_url || '' }) }}
                          style={{ background: 'none', border: 'none', color: 'var(--green)', display: 'flex', cursor: 'pointer', padding: '4px 6px', borderRadius: 4 }}><PencilSimple size={14} /></button>
                        <button onClick={e => { e.stopPropagation(); remove(m.id) }}
                          style={{ background: 'none', border: 'none', color: 'var(--ostryk-text3)', display: 'flex', cursor: 'pointer', padding: '4px 6px', borderRadius: 4 }}><Trash size={14} /></button>
                      </>
                    ) : (
                      <button onClick={e => { e.stopPropagation(); toggleHidden(m.id, hiddenIds.has(m.id)) }}
                        title={hiddenIds.has(m.id) ? 'Afficher à mes clients' : 'Masquer à mes clients'}
                        style={{ background: 'none', border: 'none', color: 'var(--text3)', display: 'flex', cursor: 'pointer', padding: '4px 6px', borderRadius: 4 }}>
                        {hiddenIds.has(m.id) ? <EyeSlash size={14} /> : <Eye size={14} />}
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </main>
    </div>
  )
}
