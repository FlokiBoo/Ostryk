'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import CourbeDatee from '@/app/components/CourbeDatee'
import { jourLocal, totaux } from '@/lib/nutrition'
import { CHAMPS_MESURES, serie } from '@/lib/mesures'

// Tableau de bord en tête de la fiche client (coach) : les 7 derniers jours de nutrition, les
// séances faites sur la même période, la courbe de poids et les mensurations. Chaque point des
// courbes est une saisie datée du sportif (table mesures_corporelles, écran « Mon suivi corporel »).

const T = {
  blanc: '#FFFFFF', texte: '#2D2620', texteSec: '#625B50', muted: '#B0A796', filet: '#EFE8DE',
  vert: '#2D3A30', bordeaux: '#6D1A22', ocre: '#A07A3F', fond: '#F7F3EC',
}
const carte = { background: T.blanc, border: '1px solid #F0EBE2', borderRadius: 16, padding: 16, minWidth: 0 }
const titre = { fontFamily: 'Cinzel, serif', fontSize: 12, color: T.bordeaux, margin: '0 0 12px', letterSpacing: '0.02em' }
const fmt = v => (v === null || v === undefined ? '—' : (Math.round(v * 10) / 10).toLocaleString('fr-FR'))
const JOURS = ['dim', 'lun', 'mar', 'mer', 'jeu', 'ven', 'sam']
const OBJECTIFS = [['objectif_kcal', 'Kcal'], ['objectif_proteines', 'Prot. g'], ['objectif_glucides', 'Gluc. g'], ['objectif_lipides', 'Lip. g']]

function septJours() {
  const out = []
  for (let k = 6; k >= 0; k--) { const d = new Date(); d.setDate(d.getDate() - k); out.push(jourLocal(d)) }
  return out
}
const jourCourt = j => JOURS[new Date(`${j}T12:00:00`).getDay()]

// seancesFaites : [{ id, titre, date (ISO), duree_min, effort }] sur les 7 derniers jours, fournies
// par la page (elle a déjà les complétions de tous les programmes du sportif).
export default function TableauDeBordClient({ athleteId, seancesFaites = [] }) {
  const [donnees, setDonnees] = useState(null)

  useEffect(() => {
    let actif = true
    const jours = septJours()
    Promise.all([
      supabase.from('nutrition_journal').select('jour, kcal, proteines, glucides, lipides').eq('athlete_id', athleteId).gte('jour', jours[0]),
      supabase.from('athletes').select(OBJECTIFS.map(([k]) => k).join(', ')).eq('id', athleteId).single(),
      supabase.from('mesures_corporelles').select('*').eq('athlete_id', athleteId).order('date'),
    ]).then(([{ data: entrees }, { data: ath }, { data: mesures, error: errMesures }]) => {
      if (!actif) return
      setDonnees({
        jours: jours.map(j => {
          const liste = (entrees || []).filter(e => e.jour === j)
          return { jour: j, note: liste.length > 0, ...totaux(liste) }
        }),
        objectifs: Object.fromEntries(OBJECTIFS.map(([k]) => [k, ath?.[k] ?? ''])),
        mesures: mesures || [],
        mesuresIndispo: !!errMesures,
      })
    })
    return () => { actif = false }
  }, [athleteId])

  if (!donnees) return <div style={{ ...carte, marginBottom: 16, color: T.texteSec, fontSize: 13 }}>Chargement du tableau de bord…</div>

  return (
    <section aria-label="Tableau de bord du client" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 14, marginBottom: 16 }}>
      <Nutrition athleteId={athleteId} jours={donnees.jours} objectifsInitiaux={donnees.objectifs} />
      <Seances seances={seancesFaites} />
      <Poids mesures={donnees.mesures} indispo={donnees.mesuresIndispo} />
      <Mensurations mesures={donnees.mesures} />
    </section>
  )
}

function Nutrition({ athleteId, jours, objectifsInitiaux }) {
  const [objectifs, setObjectifs] = useState(objectifsInitiaux)
  const [edition, setEdition] = useState(false)
  const [sauve, setSauve] = useState(null)
  const [survol, setSurvol] = useState(null)

  const notes = jours.filter(j => j.note)
  const moyenne = k => (notes.length ? Math.round(notes.reduce((s, j) => s + j[k], 0) / notes.length) : null)
  const objKcal = Number(objectifs.objectif_kcal) || null
  const max = Math.max(1, objKcal || 0, ...jours.map(j => j.kcal)) * 1.1
  const hauteur = 120

  const enregistrer = async (k, v) => {
    const valeur = v === '' ? null : Math.round(Number(String(v).replace(',', '.')))
    if (valeur !== null && !(valeur >= 0)) return
    setSauve('…')
    const { error } = await supabase.from('athletes').update({ [k]: valeur }).eq('id', athleteId)
    setSauve(error ? 'Erreur' : 'Enregistré')
    if (!error) setTimeout(() => setSauve(null), 1500)
  }

  return (
    <div style={carte}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <p style={{ ...titre, flex: 1 }}>Nutrition · 7 derniers jours</p>
        <button onClick={() => setEdition(e => !e)} style={{ background: 'none', border: 'none', color: T.texteSec, fontSize: 12, textDecoration: 'underline', cursor: 'pointer', padding: 0, marginBottom: 12 }}>
          {edition ? 'Fermer' : 'Objectifs'}
        </button>
      </div>

      {edition ? (
        <div style={{ marginBottom: 12 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6 }}>
            {OBJECTIFS.map(([k, label]) => (
              <label key={k} style={{ fontSize: 10, fontWeight: 700, color: T.texteSec, textTransform: 'uppercase' }}>{label}
                <input value={objectifs[k]} inputMode="numeric" onChange={e => setObjectifs(o => ({ ...o, [k]: e.target.value }))} onBlur={e => enregistrer(k, e.target.value)}
                  style={{ width: '100%', boxSizing: 'border-box', marginTop: 2, padding: '5px 6px', border: '1px solid #D9CFC1', borderRadius: 6, fontSize: 13, fontFamily: 'inherit' }} />
              </label>
            ))}
          </div>
          <p style={{ fontSize: 11, color: T.texteSec, margin: '4px 0 0', minHeight: 14 }}>{sauve || 'Objectifs par jour, visibles par le client dans son onglet Nutrition.'}</p>
        </div>
      ) : null}

      {notes.length === 0 ? (
        <p style={{ fontSize: 13, color: T.texteSec, margin: 0 }}>Rien de noté ces 7 derniers jours.</p>
      ) : (
        <>
          {/* Colonnes kcal par jour, une seule série : pas de légende. Survol = détail des macros. */}
          <div style={{ position: 'relative', height: hauteur, display: 'flex', alignItems: 'flex-end', gap: 6, borderBottom: `1px solid ${T.filet}` }}>
            {objKcal ? (
              <div style={{ position: 'absolute', left: 0, right: 0, bottom: (objKcal / max) * hauteur, borderTop: `1px solid ${T.muted}` }}>
                <span style={{ position: 'absolute', right: 0, top: -14, fontSize: 10, color: T.texteSec, background: T.blanc, paddingLeft: 4 }}>objectif {objKcal}</span>
              </div>
            ) : null}
            {jours.map((j, i) => (
              <div key={j.jour} onPointerEnter={() => setSurvol(i)} onPointerLeave={() => setSurvol(null)} onPointerDown={() => setSurvol(i)}
                style={{ flex: 1, height: '100%', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', position: 'relative', cursor: 'default' }}>
                <div style={{
                  width: '100%', maxWidth: 24, height: j.note ? Math.max(3, (j.kcal / max) * hauteur) : 2,
                  background: j.note ? T.vert : T.filet, borderRadius: j.note ? '4px 4px 0 0' : 0, opacity: survol === null || survol === i ? 1 : 0.55,
                }} />
                {survol === i ? (
                  <div style={{
                    position: 'absolute', bottom: '100%', marginBottom: 4, zIndex: 2, whiteSpace: 'nowrap',
                    left: i < 2 ? 0 : i > 4 ? 'auto' : '50%', right: i > 4 ? 0 : 'auto', transform: i >= 2 && i <= 4 ? 'translateX(-50%)' : 'none',
                    background: T.texte, color: '#fff', borderRadius: 6, padding: '5px 8px', fontSize: 11, lineHeight: 1.45,
                  }}>
                    <strong>{new Date(`${j.jour}T12:00:00`).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'short' })}</strong><br />
                    {j.note ? <>{j.kcal} kcal · P {j.proteines} g · G {j.glucides} g · L {j.lipides} g</> : 'Rien de noté'}
                  </div>
                ) : null}
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
            {jours.map(j => <span key={j.jour} style={{ flex: 1, textAlign: 'center', fontSize: 10, color: T.texteSec }}>{jourCourt(j.jour)}</span>)}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginTop: 14 }}>
            {[['kcal', 'Kcal', 'objectif_kcal', ''], ['proteines', 'Protéines', 'objectif_proteines', ' g'], ['glucides', 'Glucides', 'objectif_glucides', ' g'], ['lipides', 'Lipides', 'objectif_lipides', ' g']].map(([k, label, ko, u]) => (
              <div key={k}>
                <p style={{ fontSize: 10, color: T.texteSec, margin: 0, textTransform: 'uppercase', fontWeight: 700 }}>{label}</p>
                <p style={{ fontSize: 17, fontWeight: 700, margin: '2px 0 0', color: T.texte }}>{moyenne(k)}<span style={{ fontSize: 11, fontWeight: 400, color: T.texteSec }}>{u}</span></p>
                <p style={{ fontSize: 10, color: T.texteSec, margin: 0 }}>{objectifs[ko] ? `obj. ${objectifs[ko]}${u}` : 'moy./jour'}</p>
              </div>
            ))}
          </div>
          <p style={{ fontSize: 11, color: T.texteSec, margin: '10px 0 0' }}>Moyennes sur les {notes.length} jour{notes.length > 1 ? 's' : ''} noté{notes.length > 1 ? 's' : ''}.</p>
        </>
      )}
    </div>
  )
}

function Seances({ seances }) {
  return (
    <div style={carte}>
      <p style={titre}>Séances · 7 derniers jours</p>
      <p style={{ margin: '0 0 10px', fontSize: 28, fontWeight: 700, color: T.texte }}>
        {seances.length}<span style={{ fontSize: 13, fontWeight: 400, color: T.texteSec }}> séance{seances.length > 1 ? 's' : ''} faite{seances.length > 1 ? 's' : ''}</span>
      </p>
      {seances.length === 0 ? <p style={{ fontSize: 13, color: T.texteSec, margin: 0 }}>Aucune séance validée cette semaine.</p> : null}
      {seances.map(s => (
        <div key={s.id} style={{ display: 'flex', gap: 10, alignItems: 'baseline', padding: '7px 0', borderTop: `1px solid ${T.filet}` }}>
          <span style={{ fontSize: 11, color: T.texteSec, minWidth: 54 }}>{new Date(s.date).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric' })}</span>
          <span style={{ flex: 1, minWidth: 0, fontSize: 13, color: T.texte, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.titre}</span>
          <span style={{ fontSize: 11, color: T.texteSec, whiteSpace: 'nowrap' }}>
            {[s.duree_min ? `${s.duree_min} min` : null, s.effort].filter(Boolean).join(' · ')}
          </span>
        </div>
      ))}
    </div>
  )
}

function variation(points) {
  if (points.length < 2) return null
  const d = points[points.length - 1].valeur - points[0].valeur
  return `${d > 0 ? '+' : d < 0 ? '−' : '±'}${fmt(Math.abs(d))}`
}

function Poids({ mesures, indispo }) {
  const points = serie(mesures, 'poids_kg')
  const dernier = points[points.length - 1]
  const delta = variation(points)
  return (
    <div style={carte}>
      <p style={titre}>Poids</p>
      {indispo ? <p style={{ fontSize: 13, color: T.texteSec, margin: 0 }}>Suivi corporel indisponible pour le moment.</p>
        : !points.length ? <p style={{ fontSize: 13, color: T.texteSec, margin: 0 }}>Aucune pesée enregistrée. Le client la note dans Profil › Mon suivi corporel.</p>
          : (
            <>
              <p style={{ margin: '0 0 8px', fontSize: 28, fontWeight: 700, color: T.texte }}>
                {fmt(dernier.valeur)}<span style={{ fontSize: 13, fontWeight: 400, color: T.texteSec }}> kg</span>
                {delta ? <span style={{ fontSize: 12, fontWeight: 600, color: T.texteSec, marginLeft: 8 }}>{delta} kg depuis le {new Date(`${points[0].date}T12:00:00`).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}</span> : null}
              </p>
              <CourbeDatee points={points} unite="kg" hauteur={150} couleur={T.vert} />
            </>
          )}
    </div>
  )
}

function Mensurations({ mesures }) {
  const champs = CHAMPS_MESURES.filter(c => c.key !== 'poids_kg').map(c => ({ ...c, points: serie(mesures, c.key) })).filter(c => c.points.length)
  return (
    <div style={carte}>
      <p style={titre}>Mensurations</p>
      {!champs.length ? <p style={{ fontSize: 13, color: T.texteSec, margin: 0 }}>Aucune mensuration enregistrée.</p> : null}
      {/* Petits multiples : une courbe par mesure, chacune sur sa propre échelle — un seul graphique
          mélangerait des tours de 30 cm et de 100 cm, et les variations des petits seraient écrasées. */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: 12 }}>
        {champs.map(c => {
          const dernier = c.points[c.points.length - 1]
          const delta = variation(c.points)
          return (
            <div key={c.key}>
              <p style={{ fontSize: 11, color: T.texteSec, margin: 0 }}>{c.label}</p>
              <p style={{ fontSize: 15, fontWeight: 700, margin: '1px 0 4px', color: T.texte }}>
                {fmt(dernier.valeur)} {c.unite}{delta ? <span style={{ fontSize: 11, fontWeight: 600, color: T.texteSec, marginLeft: 6 }}>{delta}</span> : null}
              </p>
              <CourbeDatee points={c.points} unite={c.unite} hauteur={52} couleur={T.vert} compact />
            </div>
          )
        })}
      </div>
    </div>
  )
}
