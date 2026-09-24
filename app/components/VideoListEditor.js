'use client'

import { useState } from 'react'
import { VideoCamera } from '@phosphor-icons/react'
import { supabase } from '@/lib/supabase'

// Sélecteur de vidéos partagé : bibliothèque d'activations (app/library/activations) et blocs
// circuit de l'éditeur de séance. Une vidéo est une entrée de `movements` — la choisir met à jour
// movements.youtube_url, donc l'URL saisie ici profite partout où ce mouvement apparaît.
const inp = {
  width: '100%', boxSizing: 'border-box', padding: '10px 12px', border: '1px solid var(--border2)',
  borderRadius: 'var(--r)', fontSize: 14, outline: 'none', background: 'var(--bg2)', color: 'var(--text)',
}

export default function VideoListEditor({ videos, onAdd, onRemove, onUpdateUrl }) {
  const [search, setSearch] = useState('')
  const [suggs, setSuggs] = useState([])

  const doSearch = async (val) => {
    setSearch(val)
    if (val.trim().length < 2) { setSuggs([]); return }
    const { data } = await supabase.from('movements').select('name, youtube_url').ilike('name', `%${val.trim()}%`).limit(8)
    setSuggs(data || [])
  }

  const pick = (mov) => {
    onAdd({ name: mov.name, video_url: mov.youtube_url || '' })
    setSearch('')
    setSuggs([])
  }

  const createAndPick = async () => {
    const name = search.trim()
    if (!name) return
    await supabase.from('movements').upsert({ name }, { onConflict: 'name', ignoreDuplicates: true })
    onAdd({ name, video_url: '' })
    setSearch('')
    setSuggs([])
  }

  const updateUrl = async (vi, name, url) => {
    onUpdateUrl(vi, url)
    if (url) await supabase.from('movements').update({ youtube_url: url }).eq('name', name)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {videos.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {videos.map((v, vi) => (
            v.video_url ? (
              <div key={vi} style={{ display: 'flex', alignItems: 'center', gap: 5, background: '#EEF2FF', border: '1px solid #C7D2FE', borderRadius: 20, padding: '4px 6px 4px 10px' }}>
                <a href={v.video_url} target="_blank" rel="noreferrer" style={{ display: 'flex', textDecoration: 'none', flexShrink: 0 }} title="Voir la vidéo"><VideoCamera size={13} /></a>
                <span style={{ fontSize: 12, fontWeight: 700, color: '#4338CA' }}>{v.name}</span>
                <button onClick={() => onRemove(vi)} style={{ background: 'none', border: 'none', color: '#4338CA', fontSize: 14, cursor: 'pointer', padding: '0 2px', flexShrink: 0, lineHeight: 1, opacity: 0.6 }}>×</button>
              </div>
            ) : (
              <div key={vi} style={{ display: 'flex', alignItems: 'center', gap: 5, background: 'var(--bg)', border: '1px solid var(--border2)', borderRadius: 20, padding: '4px 6px 4px 10px' }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)' }}>{v.name}</span>
                <input placeholder="Coller URL…" defaultValue=""
                  onBlur={e => updateUrl(vi, v.name, e.target.value.trim())}
                  style={{ border: '1px solid var(--border2)', borderRadius: 12, padding: '2px 8px', fontSize: 11, outline: 'none', background: 'var(--bg2)', color: 'var(--text)', width: 110 }} />
                <button onClick={() => onRemove(vi)} style={{ background: 'none', border: 'none', color: 'var(--text3)', fontSize: 14, cursor: 'pointer', padding: '0 2px', flexShrink: 0, lineHeight: 1 }}>×</button>
              </div>
            )
          ))}
        </div>
      )}
      <div style={{ position: 'relative' }}>
        <input placeholder="Rechercher un mouvement à ajouter…" value={search}
          onChange={e => doSearch(e.target.value)}
          onBlur={() => setTimeout(() => setSuggs([]), 150)}
          style={{ ...inp, fontSize: 12 }} />
        {search.trim().length >= 2 && (
          <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: 'var(--bg)', border: '1px solid var(--border2)', borderRadius: 'var(--r)', boxShadow: '0 4px 16px rgba(0,0,0,.12)', zIndex: 50, overflow: 'hidden', marginTop: 2 }}>
            {suggs.map((mov, mi) => (
              <button key={mi} onMouseDown={() => pick(mov)}
                style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '8px 10px', textAlign: 'left', background: 'none', border: 'none', borderBottom: '1px solid var(--border)', fontSize: 13, fontWeight: 600, color: 'var(--text)', cursor: 'pointer' }}>
                <span style={{ flex: 1 }}>{mov.name}</span>
                <span style={{ fontSize: 12, display: 'flex' }}>{mov.youtube_url ? <VideoCamera size={13} /> : <span style={{ color: 'var(--text3)', fontSize: 11 }}>pas de vidéo</span>}</span>
              </button>
            ))}
            {!suggs.some(m => m.name.toLowerCase() === search.trim().toLowerCase()) && (
              <button onMouseDown={createAndPick}
                style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '8px 10px', textAlign: 'left', background: 'var(--bg2)', border: 'none', fontSize: 13, fontWeight: 700, color: 'var(--green)', cursor: 'pointer' }}>
                <span style={{ display: 'flex' }}><VideoCamera size={14} /></span>
                <span>Créer « {search} » et lier une vidéo</span>
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
