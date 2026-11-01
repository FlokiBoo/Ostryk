'use client'

import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import { getCoachId } from '@/lib/coach'
import ActivityTypeSelect from '@/app/components/ActivityTypeSelect'

// Création d'un programme personnel depuis la fiche client : assigné à ce seul client (il n'apparaît
// donc pas dans « Programmes »), puis ouverture directe de l'éditeur.
export default function CreerProgrammeClient({ athleteId, athleteNom, onFermer, onCree }) {
  const [titre, setTitre] = useState('')
  const [activite, setActivite] = useState('Musculation 🏋️')
  const [enCours, setEnCours] = useState(false)

  const creer = async () => {
    if (!titre.trim() || enCours) return
    setEnCours(true)
    const coachId = await getCoachId()
    const { data, error } = await supabase.from('programs')
      .insert({ athlete_id: athleteId, title: titre.trim(), coach_id: coachId, activity_type: activite })
      .select().single()
    if (!data) {
      alert('Erreur : ' + (error?.message || 'impossible de créer le programme'))
      setEnCours(false)
      return
    }
    await supabase.from('program_sessions').insert({ program_id: data.id, order_index: 0, title: 'Séance 1' })
    onCree(data.id)
  }

  return (
    <div onClick={onFermer} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: 'var(--bg)', borderRadius: 'var(--rl)', padding: 20, width: '100%', maxWidth: 440, display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div>
          <div style={{ fontFamily: 'var(--font-title)', color: 'var(--title)', fontWeight: 700, fontSize: 18 }}>Nouveau programme</div>
          <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 2 }}>Programme personnel de {athleteNom}</div>
        </div>
        <input
          autoFocus
          placeholder="Nom du programme (ex : Prépa marathon 8 semaines)"
          value={titre}
          onChange={e => setTitre(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') creer() }}
          style={{ padding: '11px 12px', border: '1px solid var(--border2)', borderRadius: 'var(--r)', fontSize: 14, outline: 'none', background: 'var(--bg2)', color: 'var(--text)' }}
        />
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: 6 }}>Activité</div>
          <ActivityTypeSelect value={activite} onChange={setActivite} />
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={creer} disabled={enCours || !titre.trim()} style={{ flex: 1, background: titre.trim() ? 'var(--bordeaux)' : 'var(--border)', color: '#fff', border: 'none', borderRadius: 'var(--r)', padding: 11, fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>
            {enCours ? 'Création…' : 'Créer et ouvrir'}
          </button>
          <button onClick={onFermer} style={{ background: 'var(--bg2)', color: 'var(--text2)', border: '1px solid var(--border2)', borderRadius: 'var(--r)', padding: '11px 16px', fontSize: 14, cursor: 'pointer' }}>
            Annuler
          </button>
        </div>
      </div>
    </div>
  )
}
