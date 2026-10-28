'use client'

import { useState, useEffect, useRef } from 'react'
import { Carrot, Trash } from '@phosphor-icons/react'
import { supabase } from '@/lib/supabase'
import { getCoachId } from '@/lib/coach'
import AthletesSidebar from '@/app/components/AthletesSidebar'
import AlimentsAVerifier from '@/app/components/coach/AlimentsAVerifier'

function today() {
  const n = new Date()
  return [n.getFullYear(), String(n.getMonth() + 1).padStart(2, '0'), String(n.getDate()).padStart(2, '0')].join('-')
}

function emptyForm() {
  return { name: '', kcal_100g: '', proteines_100g: '', glucides_100g: '', lipides_100g: '' }
}

const inputStyle = {
  width: '100%', boxSizing: 'border-box', padding: '7px 10px',
  border: '1px solid var(--border2)', borderRadius: 6,
  fontSize: 13, outline: 'none', background: 'var(--bg)', color: 'var(--text)',
  fontFamily: 'inherit',
}

export default function AlimentsPage() {
  const [aliments, setAliments] = useState([])
  const [search, setSearch] = useState('')
  const [showCreate, setShowCreate] = useState(false)
  const [newForm, setNewForm] = useState(emptyForm())
  const [saving, setSaving] = useState(false)
  const nameRef = useRef(null)

  async function load() {
    const { data } = await supabase.from('aliments').select('*').order('name')
    setAliments(data || [])
  }

  useEffect(() => { load() }, [])
  useEffect(() => { if (showCreate) nameRef.current?.focus() }, [showCreate])

  async function create() {
    if (!newForm.name.trim()) return
    setSaving(true)
    const coachId = await getCoachId()
    const { data, error } = await supabase.from('aliments').insert({
      name: newForm.name.trim(),
      kcal_100g: newForm.kcal_100g ? Number(newForm.kcal_100g) : null,
      proteines_100g: newForm.proteines_100g ? Number(newForm.proteines_100g) : null,
      glucides_100g: newForm.glucides_100g ? Number(newForm.glucides_100g) : null,
      lipides_100g: newForm.lipides_100g ? Number(newForm.lipides_100g) : null,
      coach_id: coachId,
    }).select().single()
    setSaving(false)
    if (error) { alert('Erreur : ' + error.message); return }
    setAliments(prev => [...prev, data].sort((a, b) => a.name.localeCompare(b.name, 'fr')))
    setNewForm(emptyForm())
    setShowCreate(false)
  }

  async function remove(id) {
    if (!window.confirm('Supprimer cet aliment ?')) return
    await supabase.from('aliments').delete().eq('id', id)
    setAliments(prev => prev.filter(a => a.id !== id))
  }

  // Les aliments à vérifier ont leur propre bloc (AlimentsAVerifier), avec les photos.
  const filtered = aliments.filter(a => a.statut !== 'a_verifier' && `${a.name} ${a.marque || ''}`.toLowerCase().includes(search.toLowerCase()))

  return (
    <div className="coach-layout">
      <AthletesSidebar athleteId={null} date={today()} />

      <main className="coach-main" style={{ display: 'flex', flexDirection: 'column', minHeight: '100svh' }}>

        <div style={{ padding: '18px 24px 0', display: 'flex', alignItems: 'center', gap: 12, borderBottom: '1px solid var(--border)', paddingBottom: 14 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontFamily: 'var(--font-title)', color: 'var(--title)', fontSize: 19, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}><Carrot size={18} /> Aliments</div>
            <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 2 }}>{aliments.length} aliment{aliments.length !== 1 ? 's' : ''}</div>
          </div>
          <button
            onClick={() => { setShowCreate(v => !v); setNewForm(emptyForm()) }}
            style={{ background: 'var(--green)', color: '#fff', border: 'none', borderRadius: 20, padding: '9px 18px', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}
          >
            + Ajouter
          </button>
        </div>

        {showCreate && (
          <div style={{ padding: '14px 24px', borderBottom: '1px solid var(--border)', background: '#F0FDF4', display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
            <div style={{ flex: 3, minWidth: 160 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: 4 }}>Nom *</div>
              <input ref={nameRef} value={newForm.name} onChange={e => setNewForm(f => ({ ...f, name: e.target.value }))}
                onKeyDown={e => e.key === 'Enter' && create()}
                placeholder="Ex: Blanc de poulet" style={inputStyle} />
            </div>
            <div style={{ flex: 1, minWidth: 90 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: 4 }}>Kcal /100g</div>
              <input type="number" value={newForm.kcal_100g} onChange={e => setNewForm(f => ({ ...f, kcal_100g: e.target.value }))} style={inputStyle} />
            </div>
            <div style={{ flex: 1, minWidth: 90 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: 4 }}>Protéines /100g</div>
              <input type="number" value={newForm.proteines_100g} onChange={e => setNewForm(f => ({ ...f, proteines_100g: e.target.value }))} style={inputStyle} />
            </div>
            <div style={{ flex: 1, minWidth: 90 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: 4 }}>Glucides /100g</div>
              <input type="number" value={newForm.glucides_100g} onChange={e => setNewForm(f => ({ ...f, glucides_100g: e.target.value }))} style={inputStyle} />
            </div>
            <div style={{ flex: 1, minWidth: 90 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: 4 }}>Lipides /100g</div>
              <input type="number" value={newForm.lipides_100g} onChange={e => setNewForm(f => ({ ...f, lipides_100g: e.target.value }))} style={inputStyle} />
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

        <AlimentsAVerifier
          onValide={a => setAliments(prev => prev.map(x => (x.id === a.id ? a : x)))}
          onSupprime={id => setAliments(prev => prev.filter(x => x.id !== id))}
        />

        <div style={{ padding: '12px 24px', borderBottom: '1px solid var(--border)' }}>
          <input
            placeholder="Rechercher un aliment…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ ...inputStyle, background: 'var(--bg2)', fontSize: 14 }}
          />
        </div>

        <div style={{ padding: '0 24px' }}>
          {filtered.length === 0 ? (
            <div style={{ textAlign: 'center', color: 'var(--text3)', padding: '60px 20px' }}>Aucun aliment.</div>
          ) : (
            <div style={{ border: '1px solid var(--border)', borderRadius: 'var(--rl)', overflow: 'hidden', margin: '16px 0' }}>
              {filtered.map((a, i) => (
                <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '12px 14px', borderTop: i > 0 ? '1px solid var(--border)' : 'none' }}>
                  <div style={{ flex: 2, fontWeight: 700, fontSize: 13 }}>
                    {a.name}
                    {a.marque ? <span style={{ fontWeight: 500, color: 'var(--text3)' }}> · {a.marque}</span> : null}
                    {a.source === 'off' ? <span title="Produit scanné, valeurs Open Food Facts" style={{ marginLeft: 6, fontSize: 10, fontWeight: 700, color: 'var(--text3)', border: '1px solid var(--border2)', borderRadius: 4, padding: '1px 4px' }}>scan</span> : null}
                  </div>
                  <div style={{ flex: 1, fontSize: 12, color: 'var(--text3)' }}>{a.kcal_100g ?? '—'} kcal</div>
                  <div style={{ flex: 1, fontSize: 12, color: 'var(--text3)' }}>P {a.proteines_100g ?? '—'}g</div>
                  <div style={{ flex: 1, fontSize: 12, color: 'var(--text3)' }}>G {a.glucides_100g ?? '—'}g</div>
                  <div style={{ flex: 1, fontSize: 12, color: 'var(--text3)' }}>L {a.lipides_100g ?? '—'}g</div>
                  <button onClick={() => remove(a.id)} style={{ background: 'none', border: 'none', color: '#991B1B', cursor: 'pointer', display: 'flex', flexShrink: 0 }}><Trash size={13} /></button>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
