'use client'

import { useState, useEffect, useRef } from 'react'
import { VideoCamera, Lightning, PencilSimple, Eye, EyeSlash, TextB, TextItalic, LinkSimple, ListBullets, TextTSlash, XCircle } from '@phosphor-icons/react'
import { supabase } from '@/lib/supabase'
import AthletesSidebar from '@/app/components/AthletesSidebar'
import VideoListEditor from '@/app/components/VideoListEditor'

function emptyForm() {
  return { name: '', text: '', note: '', videos: [] }
}

const inp = {
  width: '100%', boxSizing: 'border-box', padding: '10px 12px', border: '1px solid var(--border2)',
  borderRadius: 'var(--r)', fontSize: 14, outline: 'none', background: 'var(--bg2)', color: 'var(--text)',
}

const fieldLabel = { fontSize: 13, fontWeight: 700, color: 'var(--text)', marginBottom: 6, display: 'block' }

// Champ "Note" calqué sur celui du bloc WARMUP/COOLDOWN de l'éditeur de séance
// (app/components/SessionBlockEditor.js) — même barre d'icônes décorative (pas de mise en forme
// réelle là-bas non plus), pour que la carte d'activation ressemble à ce dans quoi elle finit
// une fois piochée via "Create from library".
function NoteEditor({ value, onChange }) {
  return (
    <div>
      <label style={fieldLabel}>Note (optionnel)</label>
      <div style={{ border: '1px solid var(--border2)', borderRadius: 'var(--r)', overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 2, padding: '8px 10px', borderBottom: '1px solid var(--border2)', background: 'var(--bg2)' }}>
          {[TextB, TextItalic, LinkSimple, ListBullets, TextTSlash].map((Icon, i) => (
            <span key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 26, height: 26, borderRadius: 4, color: 'var(--text3)' }}>
              <Icon size={14} />
            </span>
          ))}
        </div>
        <textarea value={value} onChange={e => onChange(e.target.value)} placeholder="Ajouter une note…" rows={2}
          style={{ width: '100%', boxSizing: 'border-box', border: 'none', padding: '10px 12px', fontSize: 14, outline: 'none', resize: 'vertical', background: 'var(--bg)', color: 'var(--text)', fontFamily: 'inherit' }} />
      </div>
    </div>
  )
}

// Détecte un "#recherche" en cours de frappe juste avant le curseur (le # doit démarrer un mot).
// Les espaces sont autorisés dans la recherche (les noms de mouvements ont souvent plusieurs
// mots) — seul un retour à la ligne, ou une recherche anormalement longue, referme la mention.
function getMentionQuery(text, cursorPos) {
  const upToCursor = text.slice(0, cursorPos)
  const hashIdx = upToCursor.lastIndexOf('#')
  if (hashIdx === -1) return null
  const query = upToCursor.slice(hashIdx + 1)
  if (query.includes('\n') || query.length > 40) return null
  const charBefore = hashIdx > 0 ? upToCursor[hashIdx - 1] : null
  if (charBefore && !/\s/.test(charBefore)) return null
  return { hashIdx, query, cursorPos }
}

// Textarea de description avec mention "#mouvement" : taper # puis un nom propose les mouvements
// correspondants, et en choisir un insère le nom dans le texte ET ajoute sa vidéo démo à la liste
// (remplace le besoin de chercher séparément le mouvement dans l'éditeur de vidéos ci-dessous).
function MentionTextarea({ value, onChange, videos, onAddVideo, placeholder, rows }) {
  const [mention, setMention] = useState(null)
  const [suggs, setSuggs] = useState([])
  const taRef = useRef(null)

  const handleChange = (e) => {
    const val = e.target.value
    onChange(val)
    const m = getMentionQuery(val, e.target.selectionStart)
    setMention(m)
    if (m && m.query.trim().length >= 1) {
      supabase.from('movements').select('name, youtube_url').ilike('name', `%${m.query.trim()}%`).limit(8)
        .then(({ data }) => setSuggs(data || []))
    } else {
      setSuggs([])
    }
  }

  const closeMention = () => { setMention(null); setSuggs([]) }

  const insert = (name, videoUrl) => {
    if (!mention) return
    const before = value.slice(0, mention.hashIdx)
    const after = value.slice(mention.cursorPos)
    const inserted = `#${name} `
    onChange(before + inserted + after)
    closeMention()
    if (!videos.some(v => v.name.toLowerCase() === name.toLowerCase())) {
      onAddVideo({ name, video_url: videoUrl || '' })
    }
    const pos = before.length + inserted.length
    requestAnimationFrame(() => { taRef.current?.focus(); taRef.current?.setSelectionRange(pos, pos) })
  }

  const pick = (mov) => insert(mov.name, mov.youtube_url)

  const createAndPick = async () => {
    const name = mention?.query.trim()
    if (!name) return
    await supabase.from('movements').upsert({ name }, { onConflict: 'name', ignoreDuplicates: true })
    insert(name, '')
  }

  return (
    <div style={{ position: 'relative' }}>
      <textarea ref={taRef} placeholder={placeholder} value={value}
        onChange={handleChange}
        onBlur={() => setTimeout(closeMention, 150)}
        rows={rows} style={{ ...inp, resize: 'vertical', fontFamily: 'inherit' }} />
      {mention && mention.query.trim().length >= 1 && (
        <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: 'var(--bg)', border: '1px solid var(--border2)', borderRadius: 'var(--r)', boxShadow: '0 4px 16px rgba(0,0,0,.12)', zIndex: 50, overflow: 'hidden', marginTop: 2 }}>
          {suggs.map((mov, mi) => (
            <button key={mi} onMouseDown={() => pick(mov)}
              style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '8px 10px', textAlign: 'left', background: 'none', border: 'none', borderBottom: '1px solid var(--border)', fontSize: 13, fontWeight: 600, color: 'var(--text)', cursor: 'pointer' }}>
              <span style={{ flex: 1 }}>{mov.name}</span>
              <span style={{ fontSize: 12, display: 'flex' }}>{mov.youtube_url ? <VideoCamera size={13} /> : <span style={{ color: 'var(--text3)', fontSize: 11 }}>pas de vidéo</span>}</span>
            </button>
          ))}
          {!suggs.some(m => m.name.toLowerCase() === mention.query.trim().toLowerCase()) && (
            <button onMouseDown={createAndPick}
              style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '8px 10px', textAlign: 'left', background: 'var(--bg2)', border: 'none', fontSize: 13, fontWeight: 700, color: 'var(--green)', cursor: 'pointer' }}>
              <span style={{ display: 'flex' }}><VideoCamera size={14} /></span>
              <span>Créer « {mention.query.trim()} » et lier une vidéo</span>
            </button>
          )}
        </div>
      )}
    </div>
  )
}

export default function ActivationsLibraryPage() {
  const [items, setItems] = useState([])
  const [editingId, setEditingId] = useState(null)
  const [editForm, setEditForm] = useState(emptyForm())
  const [showCreate, setShowCreate] = useState(false)
  const [newForm, setNewForm] = useState(emptyForm())
  const [saving, setSaving] = useState(false)
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
    const { data } = await supabase.from('coach_hidden_content').select('content_id').eq('content_type', 'activation_preset')
    setHiddenIds(new Set((data || []).map(r => r.content_id)))
  }

  async function toggleHidden(itemId, hidden) {
    if (hidden) {
      await supabase.from('coach_hidden_content').delete().eq('content_type', 'activation_preset').eq('content_id', itemId)
      setHiddenIds(prev => { const next = new Set(prev); next.delete(itemId); return next })
    } else {
      await supabase.from('coach_hidden_content').insert({ coach_id: userId, content_type: 'activation_preset', content_id: itemId })
      setHiddenIds(prev => new Set(prev).add(itemId))
    }
  }

  async function load() {
    const { data } = await supabase.from('activation_presets').select('*').order('name')
    setItems(data || [])
  }

  useEffect(() => { Promise.resolve().then(() => { loadUser(); load(); loadHidden() }) }, [])
  useEffect(() => { if (showCreate) nameRef.current?.focus() }, [showCreate])

  async function create() {
    if (!newForm.name.trim()) return
    setSaving(true)
    const { data, error } = await supabase.from('activation_presets').insert({
      name: newForm.name.trim(), text: newForm.text.trim() || null, note: newForm.note.trim() || null, videos: newForm.videos,
      coach_id: isAdmin ? null : userId,
    }).select().single()
    if (error) { alert('Erreur : ' + error.message); setSaving(false); return }
    setItems(prev => [...prev, data].sort((a, b) => a.name.localeCompare(b.name)))
    setNewForm(emptyForm())
    setShowCreate(false)
    setSaving(false)
  }

  function startEdit(item) {
    setEditingId(item.id)
    setEditForm({ name: item.name, text: item.text || '', note: item.note || '', videos: item.videos || [] })
  }

  async function saveEdit() {
    if (!editForm.name.trim()) return
    setSaving(true)
    const { error } = await supabase.from('activation_presets').update({
      name: editForm.name.trim(), text: editForm.text.trim() || null, note: editForm.note.trim() || null, videos: editForm.videos,
    }).eq('id', editingId)
    if (error) { alert('Erreur : ' + error.message); setSaving(false); return }
    setItems(prev => prev.map(i => i.id === editingId ? { ...i, name: editForm.name.trim(), text: editForm.text.trim() || null, note: editForm.note.trim() || null, videos: editForm.videos } : i).sort((a, b) => a.name.localeCompare(b.name)))
    setEditingId(null)
    setSaving(false)
  }

  async function remove(id) {
    if (!confirm('Supprimer cette activation ?')) return
    await supabase.from('activation_presets').delete().eq('id', id)
    setItems(prev => prev.filter(i => i.id !== id))
  }

  async function duplicate(item) {
    setSaving(true)
    const { data, error } = await supabase.from('activation_presets').insert({
      name: `${item.name} (copie)`, text: item.text, note: item.note || null, videos: item.videos || [],
      coach_id: isAdmin ? null : userId,
    }).select().single()
    if (error) { alert('Erreur : ' + error.message); setSaving(false); return }
    setItems(prev => [...prev, data].sort((a, b) => a.name.localeCompare(b.name)))
    setSaving(false)
    startEdit(data)
  }

  return (
    <div className="coach-layout" style={{ background: 'var(--bg2)' }}>
      <AthletesSidebar athleteId={null} />
      <div className="coach-main">
        <div style={{
          padding: '20px 16px 14px', background: 'var(--bg)',
          borderBottom: '1px solid var(--border)',
          display: 'flex', alignItems: 'center', gap: 12,
          position: 'sticky', top: 0, zIndex: 10
        }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontFamily: 'var(--font-title)', color: 'var(--title)', fontSize: 21, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}><Lightning size={19} /> Activations</div>
            <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 1 }}>
              Protocoles d&apos;activation réutilisables — texte + vidéos
            </div>
          </div>
          <button onClick={() => setShowCreate(v => !v)} style={{
            background: 'var(--bordeaux)', color: '#fff', border: 'none',
            borderRadius: 20, padding: '8px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer'
          }}>+ Activation</button>
        </div>

        <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 10, maxWidth: 640 }}>
          {showCreate && (
            <div style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 'var(--rl)', padding: 14, display: 'flex', flexDirection: 'column', gap: 14 }}>
              <input ref={nameRef} placeholder="Nom (ex: Activation 1, Hyrox Ski…)"
                value={newForm.name} onChange={e => setNewForm(f => ({ ...f, name: e.target.value }))}
                style={inp} />
              <div>
                <label style={fieldLabel}>Description</label>
                <MentionTextarea placeholder="Texte de l'activation… (tape # pour lier un mouvement)"
                  value={newForm.text} onChange={text => setNewForm(f => ({ ...f, text }))}
                  videos={newForm.videos} onAddVideo={v => setNewForm(f => ({ ...f, videos: [...f.videos, v] }))}
                  rows={4} />
                <div style={{ marginTop: 8 }}>
                  <VideoListEditor
                    videos={newForm.videos}
                    onAdd={v => setNewForm(f => ({ ...f, videos: [...f.videos, v] }))}
                    onRemove={idx => setNewForm(f => ({ ...f, videos: f.videos.filter((_, i) => i !== idx) }))}
                    onUpdateUrl={(idx, url) => setNewForm(f => ({ ...f, videos: f.videos.map((v, i) => i === idx ? { ...v, video_url: url } : v) }))}
                  />
                </div>
              </div>
              <NoteEditor value={newForm.note} onChange={note => setNewForm(f => ({ ...f, note }))} />
              <button onClick={create} disabled={saving} style={{
                background: 'var(--green)', color: '#fff', border: 'none',
                borderRadius: 'var(--r)', padding: '10px 16px', fontSize: 14, fontWeight: 600, cursor: 'pointer'
              }}>{saving ? '…' : 'Créer'}</button>
            </div>
          )}

          {!items.length && !showCreate ? (
            <div style={{ textAlign: 'center', color: 'var(--text3)', padding: '60px 20px', border: '1px dashed var(--border2)', borderRadius: 'var(--rl)', background: 'var(--bg)' }}>
              <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 12 }}><Lightning size={36} /></div>
              <div style={{ fontWeight: 600, marginBottom: 6 }}>Aucune activation</div>
              <div style={{ fontSize: 13 }}>Clique sur « + Activation » pour commencer</div>
            </div>
          ) : (
            items.map(item => (
              <div key={item.id} style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 'var(--rl)', padding: 14 }}>
                {editingId === item.id ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                    <input value={editForm.name} onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))} style={inp} />
                    <div>
                      <label style={fieldLabel}>Description</label>
                      <MentionTextarea placeholder="Texte de l'activation… (tape # pour lier un mouvement)"
                        value={editForm.text} onChange={text => setEditForm(f => ({ ...f, text }))}
                        videos={editForm.videos} onAddVideo={v => setEditForm(f => ({ ...f, videos: [...f.videos, v] }))}
                        rows={4} />
                      <div style={{ marginTop: 8 }}>
                        <VideoListEditor
                          videos={editForm.videos}
                          onAdd={v => setEditForm(f => ({ ...f, videos: [...f.videos, v] }))}
                          onRemove={idx => setEditForm(f => ({ ...f, videos: f.videos.filter((_, i) => i !== idx) }))}
                          onUpdateUrl={(idx, url) => setEditForm(f => ({ ...f, videos: f.videos.map((v, i) => i === idx ? { ...v, video_url: url } : v) }))}
                        />
                      </div>
                    </div>
                    <NoteEditor value={editForm.note} onChange={note => setEditForm(f => ({ ...f, note }))} />
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button onClick={saveEdit} disabled={saving} style={{
                        background: 'var(--green)', color: '#fff', border: 'none',
                        borderRadius: 'var(--r)', padding: '8px 14px', fontSize: 13, fontWeight: 600, cursor: 'pointer'
                      }}>{saving ? '…' : 'Sauvegarder'}</button>
                      <button onClick={() => setEditingId(null)} style={{
                        background: 'var(--bg2)', border: '1px solid var(--border2)', color: 'var(--text2)',
                        borderRadius: 'var(--r)', padding: '8px 14px', fontSize: 13, fontWeight: 600, cursor: 'pointer'
                      }}>Annuler</button>
                    </div>
                  </div>
                ) : (
                  <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontFamily: 'var(--font-title)', fontWeight: 700, fontSize: 15, marginBottom: item.text ? 4 : 0, display: 'flex', alignItems: 'center', gap: 6 }}>
                        {item.name}
                        {item.coach_id === userId && (
                          <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--green)', background: 'var(--green-light)', borderRadius: 20, padding: '2px 8px', flexShrink: 0, fontFamily: 'var(--font-ui)' }}>Perso</span>
                        )}
                        {item.coach_id === null && hiddenIds.has(item.id) && (
                          <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--text3)', background: 'var(--bg2)', borderRadius: 20, padding: '2px 8px', flexShrink: 0, fontFamily: 'var(--font-ui)' }}>Masqué</span>
                        )}
                      </div>
                      {item.text && <div style={{ fontSize: 13, color: '#5A5348', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{item.text}</div>}
                      {item.videos?.length > 0 && (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
                          {item.videos.map((v, vi) => (
                            <span key={vi} style={{ fontSize: 11, background: 'var(--bg)', border: '1px solid var(--ostryk-chip-border)', color: 'var(--text2)', borderRadius: 20, padding: '2px 8px', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 4 }}><VideoCamera size={11} /> {v.name}</span>
                          ))}
                        </div>
                      )}
                      {item.note && (
                        <div style={{ fontSize: 12, color: 'var(--text3)', fontStyle: 'italic', marginTop: 6, whiteSpace: 'pre-wrap' }}>{item.note}</div>
                      )}
                    </div>
                    <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                      <button onClick={() => duplicate(item)} disabled={saving} title="Dupliquer"
                        style={{ background: 'none', border: '1px solid var(--border2)', borderRadius: 'var(--r)', padding: '6px 10px', fontSize: 12, color: 'var(--green)', cursor: 'pointer' }}>⧉</button>
                      {(isAdmin || item.coach_id === userId) ? (
                        <>
                          <button onClick={() => startEdit(item)} style={{ background: 'none', border: '1px solid var(--border2)', borderRadius: 'var(--r)', padding: '6px 10px', display: 'flex', color: 'var(--green)', cursor: 'pointer' }}><PencilSimple size={12} weight="light" /></button>
                          <button onClick={() => remove(item.id)} style={{ background: 'none', border: 'none', color: 'var(--bordeaux)', display: 'flex', cursor: 'pointer', padding: '0 4px' }}><XCircle size={16} /></button>
                        </>
                      ) : (
                        <button onClick={() => toggleHidden(item.id, hiddenIds.has(item.id))}
                          title={hiddenIds.has(item.id) ? 'Afficher à mes clients' : 'Masquer à mes clients'}
                          style={{ background: 'none', border: '1px solid var(--border2)', borderRadius: 'var(--r)', padding: '6px 10px', display: 'flex', color: 'var(--text2)', cursor: 'pointer' }}>
                          {hiddenIds.has(item.id) ? <EyeSlash size={12} /> : <Eye size={12} />}
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
