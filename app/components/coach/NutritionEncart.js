'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { jourLocal, totaux } from '@/lib/nutrition'

// Encart Nutrition de la fiche sportif (coach) : objectifs journaliers, que le sportif voit dans
// son onglet Nutrition, et ce qu'il a noté sur les 7 derniers jours.

const CHAMPS = [['objectif_kcal', 'Kcal'], ['objectif_proteines', 'Prot. g'], ['objectif_glucides', 'Gluc. g'], ['objectif_lipides', 'Lip. g']]
const champ = {
  width: '100%', boxSizing: 'border-box', padding: '5px 6px', border: '1px solid #D9CFC1', borderRadius: 6,
  fontSize: 13, background: '#fff', color: '#2D2620', fontFamily: 'inherit', outline: 'none',
}

function joursPrecedents(n) {
  const out = []
  for (let k = n - 1; k >= 0; k--) { const d = new Date(); d.setDate(d.getDate() - k); out.push(jourLocal(d)) }
  return out
}

export default function NutritionEncart({ athleteId }) {
  const [objectifs, setObjectifs] = useState(null)
  const [sauve, setSauve] = useState(null)
  const [jours, setJours] = useState(null)

  useEffect(() => {
    let actif = true
    const liste = joursPrecedents(7)
    Promise.all([
      supabase.from('athletes').select(CHAMPS.map(([k]) => k).join(', ')).eq('id', athleteId).single(),
      supabase.from('nutrition_journal').select('jour, kcal, proteines, glucides, lipides').eq('athlete_id', athleteId).gte('jour', liste[0]),
    ]).then(([{ data: ath }, { data: entrees }]) => {
      if (!actif) return
      setObjectifs(Object.fromEntries(CHAMPS.map(([k]) => [k, ath?.[k] ?? ''])))
      setJours(liste.map(j => ({ jour: j, ...totaux((entrees || []).filter(e => e.jour === j)), vide: !(entrees || []).some(e => e.jour === j) })))
    })
    return () => { actif = false }
  }, [athleteId])

  const enregistrer = async (k, v) => {
    const valeur = v === '' ? null : Math.round(Number(String(v).replace(',', '.')))
    if (valeur !== null && !(valeur >= 0)) return
    setSauve('…')
    const { error } = await supabase.from('athletes').update({ [k]: valeur }).eq('id', athleteId)
    setSauve(error ? 'Erreur' : 'Enregistré')
    if (!error) setTimeout(() => setSauve(null), 1500)
  }

  if (!objectifs || !jours) return <p style={{ fontSize: 12, color: '#8a8378', margin: 0 }}>Chargement…</p>

  const notes = jours.filter(j => !j.vide)
  const moyenne = notes.length ? Math.round(notes.reduce((s, j) => s + j.kcal, 0) / notes.length) : null
  const max = Math.max(1, Number(objectifs.objectif_kcal) || 0, ...jours.map(j => j.kcal))

  return (
    <>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6 }}>
        {CHAMPS.map(([k, label]) => (
          <label key={k} style={{ fontSize: 10, fontWeight: 700, color: '#8a8378', textTransform: 'uppercase' }}>{label}
            <input value={objectifs[k]} inputMode="numeric" onChange={e => setObjectifs(o => ({ ...o, [k]: e.target.value }))}
              onBlur={e => enregistrer(k, e.target.value)} style={{ ...champ, marginTop: 2 }} />
          </label>
        ))}
      </div>
      <p style={{ fontSize: 11, color: '#8a8378', margin: '4px 0 12px', minHeight: 14 }}>{sauve || 'Objectifs par jour, visibles par le sportif.'}</p>

      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4, height: 56 }} aria-label="Calories des 7 derniers jours">
        {jours.map(j => (
          <div key={j.jour} title={`${j.jour} : ${j.vide ? 'rien noté' : `${j.kcal} kcal · P ${j.proteines} g`}`}
            style={{ flex: 1, height: j.vide ? 3 : `${Math.max(6, (j.kcal / max) * 100)}%`, background: j.vide ? '#EFE8DE' : '#2D3A30', borderRadius: 3 }} />
        ))}
      </div>
      <p style={{ fontSize: 12, color: '#5A5348', margin: '8px 0 0' }}>
        {notes.length
          ? `${notes.length} jour${notes.length > 1 ? 's' : ''} noté${notes.length > 1 ? 's' : ''} sur 7 · ${moyenne} kcal en moyenne`
          : 'Rien de noté ces 7 derniers jours.'}
      </p>
    </>
  )
}
