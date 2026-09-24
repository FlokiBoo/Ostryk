'use client'

import { useState, useEffect, useRef, use } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import AthletesSidebar from '@/app/components/AthletesSidebar'
import EquipmentPicker from '@/app/components/EquipmentPicker'

function today() {
  const n = new Date()
  return [n.getFullYear(), String(n.getMonth()+1).padStart(2,'0'), String(n.getDate()).padStart(2,'0')].join('-')
}

function getYouTubeId(url) {
  if (!url) return null
  const m = url.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|v\/|shorts\/))([^&\n?#]+)/)
  return m ? m[1] : null
}

function parseMuscles(str) {
  if (!str) return []
  return str.split(',').map(s => s.trim()).filter(Boolean)
}

function serializeMuscles(arr) {
  return arr.join(', ')
}

const fieldStyle = {
  width: '100%', boxSizing: 'border-box', padding: '11px 14px',
  border: '1px solid var(--border2)', borderRadius: 8,
  fontSize: 14, outline: 'none', background: 'var(--bg)', color: 'var(--text)',
  fontFamily: 'inherit',
}

const labelStyle = {
  fontSize: 13, fontWeight: 700, color: 'var(--text)', marginBottom: 6, display: 'block'
}

const optionalStyle = {
  fontSize: 12, fontWeight: 400, color: 'var(--text3)', marginLeft: 6
}

function MusclesPicker({ selected, onChange, allMuscles }) {
  const [input, setInput] = useState('')
  const [open, setOpen] = useState(false)
  const inputRef = useRef(null)
  const containerRef = useRef(null)

  const lower = input.trim().toLowerCase()
  const suggestions = allMuscles.filter(m =>
    !selected.includes(m) && m.toLowerCase().includes(lower)
  )
  const canAddNew = input.trim().length > 1 && !selected.includes(input.trim()) && !allMuscles.some(m => m.toLowerCase() === lower)

  function add(muscle) {
    const m = muscle.trim().replace(/^./, c => c.toUpperCase())
    if (!m || selected.includes(m)) return
    onChange([...selected, m])
    setInput('')
    inputRef.current?.focus()
  }

  function remove(muscle) {
    onChange(selected.filter(m => m !== muscle))
  }

  function handleKey(e) {
    if ((e.key === 'Enter' || e.key === ',') && input.trim()) {
      e.preventDefault()
      add(input.trim())
    }
    if (e.key === 'Backspace' && input === '' && selected.length > 0) {
      onChange(selected.slice(0, -1))
    }
  }

  useEffect(() => {
    function handleClick(e) {
      if (containerRef.current && !containerRef.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  return (
    <div ref={containerRef} style={{ position: 'relative' }}>
      {/* Chips + input */}
      <div
        onClick={() => { setOpen(true); inputRef.current?.focus() }}
        style={{
          minHeight: 46, padding: '6px 10px', border: '1px solid var(--border2)', borderRadius: 8,
          background: 'var(--bg)', cursor: 'text', display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center',
        }}
      >
        {selected.map(m => (
          <span key={m} style={{
            display: 'inline-flex', alignItems: 'center', gap: 4,
            background: '#DCFCE7', color: '#166534', borderRadius: 20,
            padding: '3px 10px', fontSize: 12, fontWeight: 700,
          }}>
            {m}
            <button
              type="button"
              onMouseDown={e => { e.stopPropagation(); remove(m) }}
              style={{ background: 'none', border: 'none', color: '#166534', cursor: 'pointer', fontSize: 14, padding: 0, lineHeight: 1, display: 'flex' }}
            >×</button>
          </span>
        ))}
        <input
          ref={inputRef}
          value={input}
          onChange={e => { setInput(e.target.value); setOpen(true) }}
          onFocus={() => setOpen(true)}
          onKeyDown={handleKey}
          placeholder={selected.length === 0 ? 'Quadriceps, Fessiers…' : ''}
          style={{
            border: 'none', outline: 'none', fontSize: 13, background: 'transparent',
            color: 'var(--text)', fontFamily: 'inherit', minWidth: 120, flex: 1,
          }}
        />
      </div>

      {/* Dropdown */}
      {open && (suggestions.length > 0 || canAddNew || (allMuscles.filter(m => !selected.includes(m)).length > 0 && !lower)) && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, zIndex: 50,
          background: 'var(--bg)', border: '1px solid var(--border2)', borderRadius: 8,
          boxShadow: '0 4px 16px rgba(0,0,0,.1)', overflow: 'hidden', maxHeight: 220, overflowY: 'auto',
        }}>
          {/* Muscles existants non sélectionnés qui matchent */}
          {(lower ? suggestions : allMuscles.filter(m => !selected.includes(m))).map(m => (
            <button
              key={m}
              type="button"
              onMouseDown={() => { add(m); setOpen(false) }}
              style={{
                display: 'block', width: '100%', textAlign: 'left',
                padding: '9px 12px', border: 'none', borderBottom: '1px solid #F3F4F6',
                background: 'none', fontSize: 13, fontWeight: 600, color: 'var(--text)', cursor: 'pointer',
              }}
            >
              {m}
            </button>
          ))}
          {/* Ajouter un nouveau */}
          {canAddNew && (
            <button
              type="button"
              onMouseDown={() => { add(input.trim()); setOpen(false) }}
              style={{
                display: 'block', width: '100%', textAlign: 'left',
                padding: '9px 12px', border: 'none',
                background: '#F0FDF4', fontSize: 13, fontWeight: 700, color: '#166534', cursor: 'pointer',
              }}
            >
              + Ajouter "{input.trim()}"
            </button>
          )}
        </div>
      )}
    </div>
  )
}

export default function MovementDetailPage({ params }) {
  const { id } = use(params)
  const router = useRouter()
  const isNew = id === 'new'

  const [muscles, setMuscles] = useState([])
  const [equipment, setEquipment] = useState([])
  const [form, setForm] = useState({ name: '', youtube_url: '', instructions: '' })
  const [originalState, setOriginalState] = useState(null)
  const [allMuscles, setAllMuscles] = useState([])
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const videoId = getYouTubeId(form.youtube_url)

  // Charger tous les muscles existants depuis la bibliothèque
  useEffect(() => {
    supabase.from('movements').select('muscles').not('muscles', 'is', null).then(({ data }) => {
      const set = new Set()
      ;(data || []).forEach(m => parseMuscles(m.muscles).forEach(s => set.add(s)))
      setAllMuscles([...set].sort((a, b) => a.localeCompare(b, 'fr')))
    })
  }, [])

  useEffect(() => {
    if (isNew) return
    supabase.from('movements').select('*').eq('id', id).single().then(({ data }) => {
      if (data) {
        const f = { name: data.name || '', youtube_url: data.youtube_url || '', instructions: data.instructions || '' }
        const m = parseMuscles(data.muscles)
        const eq = data.equipment || []
        setForm(f)
        setMuscles(m)
        setEquipment(eq)
        setOriginalState({ ...f, muscles: serializeMuscles(m), equipment: eq })
      }
    })
  }, [id])

  const currentState = { ...form, muscles: serializeMuscles(muscles), equipment }
  const isDirty = JSON.stringify(currentState) !== JSON.stringify(originalState)

  async function save() {
    if (!form.name.trim()) return
    setSaving(true)
    const payload = {
      name: form.name.trim(),
      youtube_url: form.youtube_url.trim() || null,
      instructions: form.instructions.trim() || null,
      muscles: muscles.length > 0 ? serializeMuscles(muscles) : null,
      equipment: equipment.length > 0 ? equipment : null,
    }
    if (isNew) {
      const { data } = await supabase.from('movements').insert(payload).select().single()
      if (data) router.replace(`/movements/${data.id}`)
    } else {
      await supabase.from('movements').update(payload).eq('id', id)
      setOriginalState(currentState)
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    }
    setSaving(false)
  }

  async function remove() {
    if (!window.confirm('Supprimer ce mouvement définitivement ?')) return
    setDeleting(true)
    await supabase.from('movements').delete().eq('id', id)
    router.push('/movements')
  }

  return (
    <div className="coach-layout">
      <AthletesSidebar athleteId={null} date={today()} />

      <main className="coach-main" style={{ background: 'var(--bg2)', minHeight: '100svh' }}>

        {/* Header */}
        <div style={{ background: 'var(--bg)', borderBottom: '1px solid var(--border)', padding: '14px 24px', display: 'flex', alignItems: 'center', gap: 12 }}>
          <button onClick={() => router.push('/movements')}
            style={{ background: 'none', border: 'none', color: 'var(--text3)', fontSize: 13, fontWeight: 600, cursor: 'pointer', padding: '6px 0', display: 'flex', alignItems: 'center', gap: 4 }}>
            ← Exercice
          </button>
        </div>

        <div style={{ maxWidth: 700, margin: '0 auto', padding: '28px 24px', display: 'flex', flexDirection: 'column', gap: 20 }}>

          {/* Nom */}
          <div style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 12, padding: 20 }}>
            <label style={labelStyle}>
              Nom du mouvement <span style={{ color: '#EF4444' }}>*</span>
            </label>
            <input
              autoFocus={isNew}
              value={form.name}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              placeholder="Ex: Squat, Hip Thrust, Pails&Rails…"
              style={fieldStyle}
            />
          </div>

          {/* Vidéo YouTube */}
          <div style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 12, padding: 20 }}>
            <label style={labelStyle}>
              Lien vidéo <span style={optionalStyle}>Optionnel</span>
            </label>
            <input
              value={form.youtube_url}
              onChange={e => setForm(f => ({ ...f, youtube_url: e.target.value }))}
              placeholder="https://youtu.be/…"
              style={fieldStyle}
            />
            {videoId && (
              <div style={{ marginTop: 14, borderRadius: 10, overflow: 'hidden', aspectRatio: '16/9', background: '#000' }}>
                <iframe
                  src={`https://www.youtube.com/embed/${videoId}`}
                  style={{ width: '100%', height: '100%', border: 'none', display: 'block' }}
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                />
              </div>
            )}
          </div>

          {/* Instructions */}
          <div style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 12, padding: 20 }}>
            <label style={labelStyle}>
              Instructions <span style={optionalStyle}>Optionnel</span>
            </label>
            <textarea
              value={form.instructions}
              onChange={e => setForm(f => ({ ...f, instructions: e.target.value }))}
              placeholder="Consignes, points techniques, erreurs à éviter…"
              rows={4}
              style={{ ...fieldStyle, resize: 'vertical' }}
            />
          </div>

          {/* Muscles + Matériel */}
          <div style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 12, padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>

            <div>
              <label style={labelStyle}>
                Muscles principaux <span style={optionalStyle}>Optionnel</span>
              </label>
              <MusclesPicker selected={muscles} onChange={setMuscles} allMuscles={allMuscles} />
              <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 5 }}>
                Clique sur un muscle existant ou tape pour en ajouter un nouveau
              </div>
            </div>

            <div>
              <label style={labelStyle}>
                Matériel <span style={optionalStyle}>Optionnel</span>
              </label>
              <EquipmentPicker selected={equipment} onChange={setEquipment} />
            </div>
          </div>

          {/* Actions */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <button
              onClick={save}
              disabled={saving || (!isNew && !isDirty)}
              style={{
                background: isDirty || isNew ? 'var(--green)' : 'var(--text3)',
                color: '#fff', border: 'none', borderRadius: 8,
                padding: '11px 24px', fontSize: 14, fontWeight: 700,
                cursor: isDirty || isNew ? 'pointer' : 'default',
              }}
            >
              {saving ? 'Enregistrement…' : saved ? '✓ Enregistré' : isNew ? 'Créer le mouvement' : 'Enregistrer'}
            </button>
            <button onClick={() => router.push('/movements')}
              style={{ background: 'none', border: '1px solid var(--border2)', borderRadius: 8, padding: '11px 20px', fontSize: 14, fontWeight: 600, cursor: 'pointer', color: 'var(--text2)' }}>
              Annuler
            </button>
            {!isNew && (
              <button onClick={remove} disabled={deleting}
                style={{ marginLeft: 'auto', background: 'none', border: '1px solid #FCA5A5', borderRadius: 8, padding: '11px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer', color: '#EF4444' }}>
                {deleting ? '…' : 'Supprimer'}
              </button>
            )}
          </div>

        </div>
      </main>
    </div>
  )
}
