'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import SessionBlockEditor from '@/app/components/SessionBlockEditor'

// Panneau de la vue côte à côte d'une fiche groupe : le contenu de la séance (éditeur) ou ses
// résultats, pour garder par exemple la séance de la semaine dernière ouverte à côté de celle du
// jour. Les résultats relisent ce que la page de séance de groupe enregistre : présences et
// ressenti par passage (group_session_runs / group_session_attendance), séries par membre
// (program_exercise_sets, liées à l'exercice de la séance, pas à une date).
export default function PanneauSeanceGroupe({ groupId, sessionId, onClose }) {
  const [onglet, setOnglet] = useState('contenu')
  const bouton = (cle, libelle) => (
    <button onClick={() => setOnglet(cle)} aria-pressed={onglet === cle} style={{
      flex: 1, padding: '8px 10px', border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 700,
      background: onglet === cle ? 'var(--green)' : 'transparent', color: onglet === cle ? '#fff' : 'var(--text2)',
      borderRadius: 'var(--r)',
    }}>{libelle}</button>
  )
  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100%' }}>
      <div style={{ position: 'sticky', top: 0, zIndex: 5, display: 'flex', gap: 4, padding: 6, background: 'var(--bg)', borderBottom: '1px solid var(--border)' }}>
        {bouton('contenu', 'Contenu')}
        {bouton('resultats', 'Résultats')}
      </div>
      {onglet === 'contenu'
        ? <SessionBlockEditor sessionId={sessionId} backHref={`/groups/${groupId}`} onClose={onClose} />
        : <ResultatsSeance groupId={groupId} sessionId={sessionId} />}
    </div>
  )
}

const dateFr = (iso) => new Date(`${iso}T12:00:00`).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' })
const serie = (s) => {
  const reps = s.reps_done != null && s.reps_done !== '' ? `${s.reps_done}` : '—'
  return s.kg_done != null && s.kg_done !== '' ? `${reps} × ${s.kg_done} kg` : `${reps} reps`
}

function ResultatsSeance({ groupId, sessionId }) {
  const [donnees, setDonnees] = useState(null)

  useEffect(() => {
    let actif = true
    async function charger() {
      const [{ data: sess }, { data: exos }, { data: gm }, { data: runs }] = await Promise.all([
        supabase.from('program_sessions').select('id, title, circuits').eq('id', sessionId).single(),
        supabase.from('program_exercises').select('id, name, order_index').eq('program_session_id', sessionId).order('order_index'),
        supabase.from('group_members').select('athletes(id, name)').eq('group_id', groupId),
        supabase.from('group_session_runs').select('id, date, coach_difficulty, coach_note, exercise_notes')
          .eq('group_id', groupId).eq('source_session_id', sessionId).order('date', { ascending: false }),
      ])
      const membres = (gm || []).map(m => m.athletes).filter(Boolean)
      const exercices = (exos || []).filter(e => (e.name || '').trim())
      const [{ data: sets }, { data: att }] = await Promise.all([
        membres.length && exercices.length
          ? supabase.from('program_exercise_sets').select('athlete_id, program_exercise_id, set_index, reps_done, kg_done')
            .in('athlete_id', membres.map(m => m.id)).in('program_exercise_id', exercices.map(e => e.id)).order('set_index')
          : Promise.resolve({ data: [] }),
        (runs || []).length
          ? supabase.from('group_session_attendance').select('run_id, athlete_id').in('run_id', runs.map(r => r.id))
          : Promise.resolve({ data: [] }),
      ])
      if (actif) setDonnees({ sess, exercices, membres, runs: runs || [], sets: sets || [], att: att || [] })
    }
    charger()
    return () => { actif = false }
  }, [groupId, sessionId])

  if (!donnees) return <div style={{ padding: 16, fontSize: 13, color: 'var(--text3)' }}>Chargement…</div>
  const { sess, exercices, membres, runs, sets, att } = donnees
  const nom = Object.fromEntries(membres.map(m => [m.id, m.name]))

  if (!runs.length) {
    return (
      <div style={{ padding: 16 }}>
        <div style={{ fontFamily: 'var(--font-title)', color: 'var(--title)', fontWeight: 700, fontSize: 16, marginBottom: 6 }}>{sess?.title || 'Séance'}</div>
        <div style={{ fontSize: 13, color: 'var(--text3)' }}>Pas encore faite avec le groupe.</div>
      </div>
    )
  }

  const carte = { background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 'var(--rl)', padding: 12 }
  const titreBloc = { fontSize: 11, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: 8 }
  const dernier = runs[0]

  return (
    <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ fontFamily: 'var(--font-title)', color: 'var(--title)', fontWeight: 700, fontSize: 16 }}>{sess?.title || 'Séance'}</div>

      {runs.map(r => {
        const presents = att.filter(a => a.run_id === r.id).map(a => nom[a.athlete_id]).filter(Boolean).sort((a, b) => a.localeCompare(b))
        return (
          <div key={r.id} style={carte}>
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8, marginBottom: 6 }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>{dateFr(r.date)}</span>
              {r.coach_difficulty ? <span style={{ fontSize: 12, color: 'var(--text3)' }}>Difficulté {r.coach_difficulty}/10</span> : null}
            </div>
            <div style={{ fontSize: 12, color: 'var(--text2)' }}>
              {presents.length ? `${presents.length} présent${presents.length > 1 ? 's' : ''} : ${presents.join(', ')}` : 'Présences non renseignées'}
            </div>
            {r.coach_note ? <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 6, fontStyle: 'italic' }}>{r.coach_note}</div> : null}
          </div>
        )
      })}

      {runs.length > 1 && (
        <div style={{ fontSize: 11, color: 'var(--text3)' }}>
          Séance faite {runs.length} fois : les séries ci-dessous regroupent tous les passages.
        </div>
      )}

      {exercices.map(e => {
        const parMembre = {}
        sets.filter(s => s.program_exercise_id === e.id).forEach(s => { (parMembre[s.athlete_id] ||= []).push(s) })
        const lignes = Object.entries(parMembre).filter(([id]) => nom[id]).sort(([a], [b]) => nom[a].localeCompare(nom[b]))
        const note = dernier.exercise_notes?.[`exercise:${e.id}`]
        return (
          <div key={e.id} style={carte}>
            <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', marginBottom: 6 }}>{e.name}</div>
            {lignes.length === 0
              ? <div style={{ fontSize: 12, color: 'var(--text3)' }}>Aucune performance saisie.</div>
              : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {lignes.map(([id, series]) => (
                    <div key={id} style={{ display: 'flex', gap: 8, fontSize: 12 }}>
                      <span style={{ width: 110, flexShrink: 0, fontWeight: 600, color: 'var(--text2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{nom[id]}</span>
                      <span style={{ color: 'var(--text)' }}>{series.map(serie).join(' · ')}</span>
                    </div>
                  ))}
                </div>
              )}
            {note ? <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 6, fontStyle: 'italic' }}>Note : {note}</div> : null}
          </div>
        )
      })}

      {(sess?.circuits || []).map(c => {
        const note = dernier.exercise_notes?.[`circuit:${c.id}`]
        if (!note) return null
        return (
          <div key={c.id} style={carte}>
            <div style={titreBloc}>{c.name || 'Circuit'}</div>
            <div style={{ fontSize: 12, color: 'var(--text2)', fontStyle: 'italic' }}>Note : {note}</div>
          </div>
        )
      })}
    </div>
  )
}
