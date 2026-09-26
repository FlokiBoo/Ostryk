'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { VideoCamera, ClipboardText, MagnifyingGlass, X } from '@phosphor-icons/react'

/*
  Tableau de bord → "Mouvements à filmer" (données : app/api/mouvements-a-filmer/route.js).
  Carte résumé + liste complète : mouvements sans vidéo, ou dont la vidéo vient d'une autre chaîne
  que celle du coach, avec les programmes qui les utilisent. Les plus utilisés en premier.
*/

const FILTRES = [
  { cle: 'tous', libelle: 'Tous' },
  { cle: 'aucune', libelle: 'Sans vidéo' },
  { cle: 'externe', libelle: 'Autre chaîne' },
  { cle: 'utilises', libelle: 'Dans un programme' },
]

const normaliser = (t) => (t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

function Statut({ m }) {
  const style = { fontSize: 11, fontWeight: 700, borderRadius: 20, padding: '2px 8px', whiteSpace: 'nowrap', flexShrink: 0 }
  if (m.statut === 'aucune') return <span style={{ ...style, color: '#7A5B2C', background: '#FBF3E7', border: '1px solid #A07A3F55' }}>Sans vidéo</span>
  if (m.statut === 'indisponible') return <span style={{ ...style, color: '#A32D2D', background: '#FDECEC', border: '1px solid #A32D2D33' }}>Vidéo indisponible</span>
  if (m.statut === 'inconnue') return <span style={{ ...style, color: 'var(--text3)', background: 'var(--bg2)' }}>Chaîne non vérifiée</span>
  return (
    <a href={m.video} target="_blank" rel="noreferrer" title="Voir la vidéo actuelle" style={{ ...style, color: '#2F5D8C', background: '#EAF0F6', border: '1px solid #2F5D8C33', textDecoration: 'none', maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis' }}>
      ▶ {m.chaine}
    </a>
  )
}

export default function MouvementsAFilmer() {
  const [donnees, setDonnees] = useState(null)
  const [ouvert, setOuvert] = useState(false)
  const [filtre, setFiltre] = useState('tous')
  const [recherche, setRecherche] = useState('')
  const [copie, setCopie] = useState(false)

  useEffect(() => {
    let actif = true
    fetch('/api/mouvements-a-filmer').then(r => (r.ok ? r.json() : null)).then(d => { if (actif && d) setDonnees(d) }).catch(() => {})
    return () => { actif = false }
  }, [])

  const liste = useMemo(() => {
    if (!donnees) return []
    const q = normaliser(recherche.trim())
    return donnees.mouvements.filter(m => {
      if (filtre === 'aucune' && m.statut !== 'aucune') return false
      if (filtre === 'externe' && !['externe', 'indisponible', 'inconnue'].includes(m.statut)) return false
      if (filtre === 'utilises' && m.programmes.length === 0) return false
      if (q && !normaliser(m.nom).includes(q) && !m.programmes.some(p => normaliser(p.titre).includes(q))) return false
      return true
    })
  }, [donnees, filtre, recherche])

  if (!donnees || donnees.mouvements.length === 0) return null

  const nbAucune = donnees.mouvements.filter(m => m.statut === 'aucune').length
  const nbAutres = donnees.mouvements.length - nbAucune
  const nbUtilises = donnees.mouvements.filter(m => m.programmes.length > 0).length

  return (
    <>
      <button type="button" onClick={() => setOuvert(true)} style={{
        display: 'flex', alignItems: 'center', gap: 10, textAlign: 'left', width: '100%', background: '#EAF0F6', border: '1px solid #2F5D8C33',
        borderRadius: 'var(--rl)', padding: '12px 14px', cursor: 'pointer', fontFamily: 'inherit',
      }}>
        <span style={{ display: 'flex', flexShrink: 0, color: '#2F5D8C' }}><VideoCamera size={20} /></span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#2F5D8C' }}>
            {donnees.mouvements.length} mouvement{donnees.mouvements.length > 1 ? 's' : ''} à filmer
          </div>
          <div style={{ fontSize: 12, color: '#2F5D8C', opacity: 0.9 }}>
            {nbAucune} sans vidéo · {nbAutres} avec la vidéo d&apos;une autre chaîne · {nbUtilises} utilisé{nbUtilises > 1 ? 's' : ''} dans un programme
          </div>
        </div>
        <span style={{ fontSize: 12, fontWeight: 700, color: '#2F5D8C', flexShrink: 0 }}>Voir →</span>
      </button>

      {ouvert && (
        <div onClick={() => setOuvert(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 500, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div onClick={e => e.stopPropagation()} role="dialog" aria-label="Mouvements à filmer" style={{
            background: 'var(--bg)', borderRadius: 'var(--rl)', width: '100%', maxWidth: 680, maxHeight: '85svh', display: 'flex', flexDirection: 'column',
            boxShadow: '0 20px 60px rgba(0,0,0,0.4)', overflow: 'hidden',
          }}>
            <div style={{ padding: '18px 20px 12px', borderBottom: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontFamily: 'var(--font-title)', color: 'var(--title)', fontWeight: 700, fontSize: 17, display: 'flex', alignItems: 'center', gap: 8 }}>
                    <VideoCamera size={16} /> Mouvements à filmer
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 2 }}>
                    {donnees.miennes} sur {donnees.total} ont déjà une vidéo de ta chaîne. Les plus utilisés dans tes programmes sont en haut.
                  </div>
                </div>
                <button type="button" aria-label="Fermer" onClick={() => setOuvert(false)} style={{ display: 'flex', background: 'none', border: 'none', color: 'var(--text3)', cursor: 'pointer', padding: 6 }}>
                  <X size={18} />
                </button>
              </div>

              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {FILTRES.map(f => (
                  <button key={f.cle} type="button" aria-pressed={filtre === f.cle} onClick={() => setFiltre(f.cle)} style={{
                    border: `1px solid ${filtre === f.cle ? 'var(--green)' : 'var(--border2)'}`, background: filtre === f.cle ? 'var(--green)' : 'var(--bg)',
                    color: filtre === f.cle ? '#fff' : 'var(--text2)', borderRadius: 20, padding: '6px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
                  }}>
                    {f.libelle}
                  </button>
                ))}
              </div>

              <div style={{ display: 'flex', gap: 8 }}>
                <div style={{ position: 'relative', flex: 1 }}>
                  <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', display: 'flex', color: 'var(--text3)' }}><MagnifyingGlass size={14} /></span>
                  <input value={recherche} onChange={e => setRecherche(e.target.value)} placeholder="Mouvement ou programme…" aria-label="Rechercher" style={{
                    width: '100%', boxSizing: 'border-box', height: 36, padding: '0 10px 0 30px', border: '1px solid var(--border2)', borderRadius: 'var(--r)',
                    fontSize: 13, background: 'var(--bg2)', color: 'var(--text)', outline: 'none', fontFamily: 'inherit',
                  }} />
                </div>
                <button type="button" onClick={() => {
                  navigator.clipboard.writeText(liste.map(m => m.nom).join('\n')).then(() => { setCopie(true); setTimeout(() => setCopie(false), 1500) }).catch(() => {})
                }} style={{
                  flexShrink: 0, height: 36, padding: '0 12px', borderRadius: 'var(--r)', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
                  background: copie ? '#DCFCE7' : 'var(--bg2)', color: copie ? '#166534' : 'var(--text2)', border: `1px solid ${copie ? '#BBF7D0' : 'var(--border2)'}`,
                  display: 'flex', alignItems: 'center', gap: 5,
                }}>
                  {copie ? '✓ Copiée' : <><ClipboardText size={14} /> Copier la liste ({liste.length})</>}
                </button>
              </div>
            </div>

            <div style={{ overflowY: 'auto', padding: '4px 20px 16px' }}>
              {liste.length === 0 ? (
                <p style={{ fontSize: 13, color: 'var(--text3)', textAlign: 'center', padding: 24, margin: 0 }}>Rien pour ce filtre.</p>
              ) : liste.map(m => (
                <div key={m.id} style={{ padding: '10px 0', borderBottom: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Link href={`/movements/${m.id}`} style={{ flex: 1, minWidth: 0, fontSize: 14, fontWeight: 700, color: 'var(--text)', textDecoration: 'none', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {m.nom}
                    </Link>
                    <Statut m={m} />
                  </div>
                  {m.programmes.length ? (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                      {m.programmes.map(p => (
                        <Link key={p.id} href={p.lien} style={{
                          fontSize: 11, fontWeight: 600, color: 'var(--green)', background: 'var(--green-light)', borderRadius: 20, padding: '2px 9px', textDecoration: 'none',
                        }}>
                          {p.titre}{p.client ? ` · ${p.client}` : ''}{p.workout ? ' · workout' : ''}{p.nb > 1 ? ` (×${p.nb})` : ''}
                        </Link>
                      ))}
                    </div>
                  ) : (
                    <div style={{ fontSize: 11, color: 'var(--text3)' }}>Dans aucun programme</div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
