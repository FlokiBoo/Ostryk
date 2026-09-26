'use client'

import { useEffect, useMemo, useState } from 'react'
import { ArrowLeft, CheckCircle, MagnifyingGlass, Play, X } from '@phosphor-icons/react'
import { supabase } from '@/lib/supabase'

/*
  "Lancer un coaching" depuis le tableau de bord : on cherche le client, puis on choisit la séance.
  onChoisir(athleteId, sessionId) — le tableau de bord ouvre alors l'écran de séance en mode coach
  sur la fiche du client (app/athletes/[athleteId]?coaching=<sessionId>).

  Séances proposées : celles de tous les programmes non archivés du client, les séances à faire
  d'abord (la prochaine de chaque programme mise en avant), les séances déjà faites repliées en
  dessous — on peut en rouvrir une pour corriger la saisie.
*/

const normaliser = (t) => (t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

export default function LancerCoachingModal({ athletes = [], onFermer, onChoisir }) {
  const [recherche, setRecherche] = useState('')
  const [client, setClient] = useState(null)
  const [programmes, setProgrammes] = useState(null) // [{ id, titre, aFaire: [...], faites: [...] }]
  const [voirFaites, setVoirFaites] = useState(false)

  const resultats = useMemo(() => {
    const q = normaliser(recherche.trim())
    return athletes
      .filter(a => !a.is_coach && !a.archived && (!q || normaliser(a.name).includes(q)))
      .sort((a, b) => a.name.localeCompare(b.name, 'fr'))
  }, [athletes, recherche])

  useEffect(() => {
    if (!client) return
    let actif = true
    Promise.all([
      supabase.from('programs').select('id, title, created_at, program_sessions(id, title, order_index, session_type, program_exercises(id))')
        .eq('athlete_id', client.id).neq('archived', true).order('created_at', { ascending: false }),
      supabase.from('program_completions').select('program_session_id, skipped').eq('athlete_id', client.id),
    ]).then(([{ data: progs }, { data: comps }]) => {
      if (!actif) return
      const faites = new Set((comps || []).filter(c => !c.skipped).map(c => c.program_session_id))
      setProgrammes((progs || []).map(p => {
        const seances = [...(p.program_sessions || [])]
          .filter(s => (s.program_exercises || []).length > 0)
          .sort((a, b) => (a.order_index ?? 0) - (b.order_index ?? 0))
          .map(s => ({ id: s.id, titre: s.title || 'Séance', recurrente: s.session_type === 'recurrent' }))
        return {
          id: p.id,
          titre: p.title || 'Programme',
          aFaire: seances.filter(s => s.recurrente || !faites.has(s.id)),
          faites: seances.filter(s => !s.recurrente && faites.has(s.id)),
        }
      }).filter(p => p.aFaire.length || p.faites.length))
    })
    return () => { actif = false }
  }, [client])

  const choisirClient = (a) => {
    setProgrammes(null)
    setVoirFaites(false)
    setClient(a)
  }

  const ligne = (s, { prochaine = false, faite = false } = {}) => (
    <button key={s.id} type="button" onClick={() => onChoisir(client.id, s.id)} style={{
      display: 'flex', alignItems: 'center', gap: 10, width: '100%', textAlign: 'left', minHeight: 48, padding: '10px 12px',
      border: `1px solid ${prochaine ? 'var(--bordeaux)' : 'var(--border)'}`, borderRadius: 10, cursor: 'pointer', fontFamily: 'inherit',
      background: prochaine ? '#FBF3E7' : 'var(--bg)', color: 'var(--text)',
    }}>
      <span style={{ display: 'flex', flexShrink: 0, color: faite ? 'var(--green)' : 'var(--bordeaux)' }}>
        {faite ? <CheckCircle size={18} weight="fill" /> : <Play size={16} weight="fill" />}
      </span>
      <span style={{ flex: 1, minWidth: 0, fontSize: 14, fontWeight: prochaine ? 700 : 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.titre}</span>
      {prochaine ? <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--bordeaux)', flexShrink: 0 }}>Prochaine</span> : null}
      {s.recurrente ? <span style={{ fontSize: 11, color: 'var(--text3)', flexShrink: 0 }}>Récurrente</span> : null}
    </button>
  )

  const nbFaites = (programmes || []).reduce((n, p) => n + p.faites.length, 0)

  return (
    <div onClick={onFermer} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div onClick={e => e.stopPropagation()} role="dialog" aria-label="Lancer un coaching" style={{
        background: 'var(--bg)', borderRadius: 14, width: '100%', maxWidth: 460, maxHeight: 'calc(100vh - 48px)',
        display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 20px 60px rgba(0,0,0,0.25)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '16px 16px 12px', borderBottom: '1px solid var(--border)' }}>
          {client ? (
            <button type="button" aria-label="Changer de client" onClick={() => setClient(null)} style={{ display: 'flex', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text2)', padding: 6 }}>
              <ArrowLeft size={18} />
            </button>
          ) : null}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontFamily: 'var(--font-title)', fontSize: 18, color: 'var(--bordeaux)' }}>Lancer un coaching</div>
            <div style={{ fontSize: 12, color: 'var(--text3)' }}>{client ? `${client.name} · choisis la séance` : 'Choisis le client'}</div>
          </div>
          <button type="button" aria-label="Fermer" onClick={onFermer} style={{ display: 'flex', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text2)', padding: 6 }}>
            <X size={18} />
          </button>
        </div>

        {!client ? (
          <>
            <div style={{ padding: '12px 16px', position: 'relative' }}>
              <span style={{ position: 'absolute', left: 28, top: '50%', transform: 'translateY(-50%)', display: 'flex', color: 'var(--text3)' }}><MagnifyingGlass size={15} /></span>
              <input autoFocus value={recherche} onChange={e => setRecherche(e.target.value)} placeholder="Rechercher un client…" aria-label="Rechercher un client"
                onKeyDown={e => { if (e.key === 'Enter' && resultats.length === 1) choisirClient(resultats[0]) }}
                style={{ width: '100%', boxSizing: 'border-box', height: 42, padding: '0 12px 0 36px', border: '1px solid var(--ostryk-border-input)', borderRadius: 10, fontSize: 15, fontFamily: 'inherit', background: 'var(--bg2)', color: 'var(--text)', outline: 'none' }} />
            </div>
            <div style={{ overflowY: 'auto', padding: '0 8px 12px' }}>
              {resultats.length === 0 ? (
                <p style={{ fontSize: 13, color: 'var(--text3)', textAlign: 'center', padding: 20, margin: 0 }}>Aucun client trouvé.</p>
              ) : resultats.map(a => (
                <button key={a.id} type="button" onClick={() => choisirClient(a)} style={{
                  display: 'block', width: '100%', textAlign: 'left', minHeight: 44, padding: '10px 12px', border: 'none', borderRadius: 8,
                  background: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: 14, fontWeight: 600, color: 'var(--text)',
                }}>
                  {a.name}
                </button>
              ))}
            </div>
          </>
        ) : (
          <div style={{ overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 16 }}>
            {programmes === null ? (
              <p style={{ fontSize: 13, color: 'var(--text3)', margin: 0 }}>Chargement…</p>
            ) : programmes.length === 0 ? (
              <p style={{ fontSize: 13, color: 'var(--text3)', margin: 0 }}>Aucune séance avec des exercices pour ce client.</p>
            ) : (
              <>
                {programmes.filter(p => p.aFaire.length).map(p => (
                  <div key={p.id}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: 8 }}>{p.titre}</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {p.aFaire.map((s, i) => ligne(s, { prochaine: i === 0 && !s.recurrente }))}
                    </div>
                  </div>
                ))}
                {nbFaites > 0 ? (
                  <div>
                    <button type="button" onClick={() => setVoirFaites(v => !v)} aria-expanded={voirFaites} style={{
                      background: 'none', border: 'none', padding: '4px 0', cursor: 'pointer', fontFamily: 'inherit', fontSize: 12, fontWeight: 700, color: 'var(--green)',
                    }}>
                      {voirFaites ? '▾' : '▸'} Séances déjà faites ({nbFaites}) — pour corriger une saisie
                    </button>
                    {voirFaites ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 8 }}>
                        {programmes.flatMap(p => p.faites.map(s => ligne({ ...s, titre: programmes.length > 1 ? `${s.titre} · ${p.titre}` : s.titre }, { faite: true })))}
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
