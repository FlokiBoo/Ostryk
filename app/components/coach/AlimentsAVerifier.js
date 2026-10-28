'use client'

import { useEffect, useState } from 'react'
import { Check, Trash } from '@phosphor-icons/react'
import { supabase } from '@/lib/supabase'

// Aliments créés par les sportifs depuis deux photos (onglet Nutrition), lues par Claude. Ils sont
// déjà visibles de tous ; le coach compare ici les valeurs aux photos, corrige, puis valide.
// Les valeurs déjà notées dans les journaux ne bougent pas : elles ont été figées à l'ajout.

const BUCKET = 'nutrition-etiquettes'
const CHAMPS = [
  ['kcal_100g', 'Kcal'], ['proteines_100g', 'Prot.'], ['glucides_100g', 'Gluc.'], ['sucres_100g', 'Sucres'],
  ['lipides_100g', 'Lip.'], ['fibres_100g', 'Fibres'], ['sel_100g', 'Sel'], ['portion_g', 'Portion g'],
]
const champ = {
  width: '100%', boxSizing: 'border-box', padding: '6px 8px', border: '1px solid var(--border2)', borderRadius: 6,
  fontSize: 13, background: 'var(--bg)', color: 'var(--text)', fontFamily: 'inherit', outline: 'none',
}
const nombre = v => (v === '' || v === null || v === undefined ? null : Number(String(v).replace(',', '.')))

export default function AlimentsAVerifier({ onValide, onSupprime }) {
  const [liste, setListe] = useState(null)
  const [photos, setPhotos] = useState({})
  const [envoi, setEnvoi] = useState(null)

  useEffect(() => {
    let actif = true
    supabase.from('aliments').select('*, athletes:cree_par_athlete_id(name)').eq('statut', 'a_verifier').order('created_at')
      .then(async ({ data }) => {
        if (!actif) return
        const rows = data || []
        setListe(rows.map(a => ({ ...a, form: Object.fromEntries([['name', a.name], ['marque', a.marque || ''], ...CHAMPS.map(([k]) => [k, a[k] ?? ''])]) })))
        const chemins = rows.flatMap(a => [a.photo_nom_path, a.photo_valeurs_path]).filter(Boolean)
        if (!chemins.length) return
        const { data: urls } = await supabase.storage.from(BUCKET).createSignedUrls(chemins, 3600)
        if (actif) setPhotos(Object.fromEntries((urls || []).filter(u => u.signedUrl).map(u => [u.path, u.signedUrl])))
      })
    return () => { actif = false }
  }, [])

  if (!liste || liste.length === 0) return null

  const maj = (id, k, v) => setListe(prev => prev.map(a => (a.id === id ? { ...a, form: { ...a.form, [k]: v } } : a)))

  const valider = async (a) => {
    if (!a.form.name.trim()) return
    setEnvoi(a.id)
    const valeurs = {
      name: a.form.name.trim(), marque: a.form.marque.trim() || null,
      ...Object.fromEntries(CHAMPS.map(([k]) => [k, nombre(a.form[k])])),
      statut: 'verifie', verifie_at: new Date().toISOString(),
    }
    const { data, error } = await supabase.from('aliments').update(valeurs).eq('id', a.id).select().single()
    setEnvoi(null)
    if (error) { alert('Erreur : ' + error.message); return }
    setListe(prev => prev.filter(x => x.id !== a.id))
    onValide?.(data)
  }

  const supprimer = async (a) => {
    if (!window.confirm(`Supprimer « ${a.name} » ? Les journaux qui le contiennent gardent leurs valeurs.`)) return
    setEnvoi(a.id)
    const { error } = await supabase.from('aliments').delete().eq('id', a.id)
    setEnvoi(null)
    if (error) { alert('Erreur : ' + error.message); return }
    setListe(prev => prev.filter(x => x.id !== a.id))
    onSupprime?.(a.id)
  }

  return (
    <div style={{ padding: '16px 24px 0' }}>
      <div style={{ fontSize: 14, fontWeight: 800, marginBottom: 4 }}>À vérifier · {liste.length}</div>
      <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 10 }}>Créés par tes sportifs à partir de photos. Compare aux étiquettes, corrige si besoin, puis valide.</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {liste.map(a => (
          <div key={a.id} style={{ border: '1px solid #F5C98B', background: '#FFFAF2', borderRadius: 'var(--rl)', padding: 12, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', gap: 8 }}>
              {[a.photo_nom_path, a.photo_valeurs_path].map((p, i) => (p && photos[p] ? (
                <a key={p} href={photos[p]} target="_blank" rel="noreferrer" title={i ? 'Valeurs nutritionnelles' : 'Nom du produit'}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={photos[p]} alt={i ? 'Valeurs nutritionnelles' : 'Nom du produit'} style={{ width: 96, height: 96, objectFit: 'cover', borderRadius: 8, border: '1px solid var(--border)' }} />
                </a>
              ) : null))}
            </div>
            <div style={{ flex: 1, minWidth: 260, display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ display: 'flex', gap: 8 }}>
                <input value={a.form.name} onChange={e => maj(a.id, 'name', e.target.value)} placeholder="Nom" style={{ ...champ, flex: 2, fontWeight: 700 }} />
                <input value={a.form.marque} onChange={e => maj(a.id, 'marque', e.target.value)} placeholder="Marque" style={{ ...champ, flex: 1 }} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(72px, 1fr))', gap: 6 }}>
                {CHAMPS.map(([k, label]) => (
                  <label key={k} style={{ fontSize: 10, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase' }}>{label}
                    <input value={a.form[k]} onChange={e => maj(a.id, k, e.target.value)} inputMode="decimal" style={{ ...champ, marginTop: 2 }} />
                  </label>
                ))}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ flex: 1, fontSize: 11, color: 'var(--text3)' }}>
                  {a.athletes?.name ? `Ajouté par ${a.athletes.name}` : 'Ajouté par un sportif'} · {new Date(a.created_at).toLocaleDateString('fr-FR')}
                  {a.code_barres ? ` · code ${a.code_barres}` : ''}
                </span>
                <button onClick={() => supprimer(a)} disabled={envoi === a.id} title="Supprimer"
                  style={{ background: 'none', border: '1px solid #F1B8B8', color: '#DC2626', borderRadius: 6, padding: '6px 8px', cursor: 'pointer', display: 'flex' }}>
                  <Trash size={14} />
                </button>
                <button onClick={() => valider(a)} disabled={envoi === a.id}
                  style={{ background: 'var(--green)', color: '#fff', border: 'none', borderRadius: 6, padding: '7px 14px', fontSize: 13, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Check size={14} weight="bold" /> Valider
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
