'use client'

import { useState, useEffect } from 'react'
import { TrendUp } from '@phosphor-icons/react'
import { supabase } from '@/lib/supabase'

export default function ProgressBlock({ athleteId }) {
  const [improvements, setImprovements] = useState(null)

  useEffect(() => {
    if (!athleteId) return
    async function load() {
      const { data: history } = await supabase
        .from('exercise_performance_history')
        .select('program_exercise_id, kg_done, reps_done, logged_at, program_exercises(name)')
        .eq('athlete_id', athleteId)
        .not('kg_done', 'is', null)
        .order('logged_at', { ascending: false })
        .limit(200)

      if (!history?.length) { setImprovements([]); return }

      // Grouper par exercice, garder les 2 dernières entrées distinctes
      const byExercise = {}
      // Exercice d'une séance masquée au client : la RLS ne renvoie pas son nom.
      history.filter(h => h.program_exercises?.name).forEach(h => {
        if (!byExercise[h.program_exercise_id]) byExercise[h.program_exercise_id] = []
        byExercise[h.program_exercise_id].push(h)
      })

      const results = []
      Object.values(byExercise).forEach(entries => {
        if (entries.length < 2) return
        const latest = entries[0]
        // Chercher la première entrée avec une charge différente
        const previous = entries.slice(1).find(e => parseFloat(e.kg_done) !== parseFloat(latest.kg_done))
        if (!previous) return
        const prevKg = parseFloat(previous.kg_done)
        const newKg = parseFloat(latest.kg_done)
        if (newKg <= prevKg) return
        const pct = Math.round((newKg - prevKg) / prevKg * 100)
        if (pct <= 0) return

        const daysAgo = Math.round((Date.now() - new Date(latest.logged_at)) / 86400000)
        results.push({
          name: latest.program_exercises?.name || 'Exercice',
          prevKg,
          newKg,
          pct,
          daysAgo,
        })
      })

      results.sort((a, b) => b.pct - a.pct)
      setImprovements(results.slice(0, 3))
    }
    load()
  }, [athleteId])

  if (!improvements) return null
  if (improvements.length === 0) return null

  return (
    <div style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 'var(--rl)', overflow: 'hidden' }}>

      <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--border)' }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.4px', display: 'flex', alignItems: 'center', gap: 5 }}>
          <TrendUp size={13} /> Progressions récentes
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {improvements.map((imp, i) => (
          <div key={i} style={{
            display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px',
            borderBottom: i < improvements.length - 1 ? '1px solid var(--border)' : 'none',
          }}>
            {/* Badge % */}
            <div style={{
              background: '#DCFCE7', color: '#166534',
              borderRadius: 10, padding: '4px 10px',
              fontSize: 14, fontWeight: 800, flexShrink: 0,
            }}>
              +{imp.pct}%
            </div>

            {/* Nom + détail */}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 700, fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {imp.name}
              </div>
              <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 2 }}>
                {imp.prevKg} kg → <span style={{ fontWeight: 700, color: 'var(--green)' }}>{imp.newKg} kg</span>
              </div>
            </div>

            {/* Date */}
            <div style={{ fontSize: 11, color: 'var(--text3)', fontWeight: 600, flexShrink: 0 }}>
              {imp.daysAgo === 0 ? "aujourd'hui" : imp.daysAgo === 1 ? 'hier' : `il y a ${imp.daysAgo}j`}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
