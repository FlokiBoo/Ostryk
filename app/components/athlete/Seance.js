'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import Toast from '@/app/components/Toast'
import { parseMusclesFromText, randomCitation } from '@/app/components/CelebrationModal'
import { programmerFinRepos, annulerFinRepos } from '@/lib/reposNotification'
import SectionTexteVideo, { FenetreVideo } from '@/app/components/SectionTexteVideo'
import { sectionDeSeance } from '@/lib/sectionsTexte'

/*
  Écran de séance (maquette Seance.jsx) — étape 1 : mode client, blocs uniquement (échauffement,
  retour au calme et mode coach viendront dans les étapes suivantes, voir les consignes
  d'intégration). Remplace l'ancien SessionPlayer exercice-par-exercice.

  Un bloc = un exercice seul (séries classiques) ou une super série (exercices enchaînés, même
  superset_group). Tour N = série N (set_index) de chaque exercice du bloc. Toutes les écritures
  passent par les fonctions de la page (onEnsureExerciseSets / onSaveExerciseSet), donc par la file
  hors ligne existante : aucune nouvelle logique de sauvegarde ici.

  Une série est "faite" dès qu'elle porte une valeur saisie OU une prescription figée
  (reps_prescribed / kg_prescribed, écrites à la validation du tour — lot A8). C'est ce qui permet
  d'enregistrer un champ vidé comme absent (null) sans que la série redevienne "à faire" au
  rechargement, ni que la prescription revienne à sa place.
*/

const T = {
  beige: '#E8E0D5',
  blanc: '#FFFFFF',
  fond: '#F7F3EC',
  bordeaux: '#6D1A22',
  vert: '#2D3A30',
  ocre: '#A07A3F',
  texte: '#2D2620',
  texteSec: '#625B50', // ≥ 4.5:1 sur beige et blanc (le #8a8378 de la maquette n'y est pas)
  texteCorps: '#5A5348',
  muted: '#B0A796',
  bordure: '#D9CFC1',
  clair: '#F5EFE6',
  sable: '#F3ECE2',
  sableClair: '#FBF3E7',
  vertClair: '#E6EAE5',
  videFond: '#FFF8F0',
}
const TITRE = 'var(--font-title)'

/* ------------------------------------------------------------------ */
/* Lecture des données de la séance                                     */
/* ------------------------------------------------------------------ */

// Repris de l'ancien SessionPlayer (même champ `rest`, texte libre saisi par le coach).
function parseRestSeconds(raw) {
  if (!raw) return null
  const s = raw.toString().trim().toLowerCase().replace(/\s+/g, '').replace(',', '.')
  const range = s.match(/^(\d+(?:\.\d+)?)-(\d+(?:\.\d+)?)(min|m|sec|s)?$/)
  if (range) {
    const avg = (parseFloat(range[1]) + parseFloat(range[2])) / 2
    const unit = range[3]
    return Math.round(unit === 'sec' || unit === 's' ? avg : avg * 60)
  }
  const minSec = s.match(/^(\d+(?:\.\d+)?)(?:min|m)(\d+)?$/)
  if (minSec) return Math.round(parseFloat(minSec[1]) * 60 + (minSec[2] ? parseInt(minSec[2]) : 0))
  const sec = s.match(/^(\d+(?:\.\d+)?)(?:sec|s)$/)
  if (sec) return Math.round(parseFloat(sec[1]))
  const colon = s.match(/^(\d+):(\d{1,2})$/)
  if (colon) return parseInt(colon[1]) * 60 + parseInt(colon[2])
  const bare = s.match(/^(\d+(?:\.\d+)?)$/)
  if (bare) return Math.round(parseFloat(bare[1]))
  return null
}

function extractYouTubeId(url) {
  if (!url) return null
  const patterns = [
    /youtu\.be\/([a-zA-Z0-9_-]{6,})/,
    /youtube\.com\/shorts\/([a-zA-Z0-9_-]{6,})/,
    /youtube\.com\/watch\?v=([a-zA-Z0-9_-]{6,})/,
    /youtube\.com\/embed\/([a-zA-Z0-9_-]{6,})/,
  ]
  for (const p of patterns) {
    const m = url.match(p)
    if (m) return m[1]
  }
  return null
}

// "8-10" → 8, "30s" → 30, "12" → 12 : la prescription reste un texte libre côté coach ; le champ
// part de sa première valeur chiffrée.
function premierNombre(v) {
  if (v === null || v === undefined || v === '') return null
  const m = String(v).replace(',', '.').match(/\d+(?:\.\d+)?/)
  return m ? parseFloat(m[0]) : null
}

function uniteReps(v) {
  const s = String(v ?? '').toLowerCase()
  if (/\d\s*(s|sec|secondes?|")\b/.test(s) || /\d\s*"$/.test(s)) return 'secondes'
  if (/\d\s*min/.test(s)) return 'minutes'
  if (/\d\s*cal/.test(s)) return 'cal'
  if (/\d\s*m\b/.test(s)) return 'mètres'
  return 'reps'
}

// Exercices à plat → blocs (exercice seul, ou super série entière).
function grouperEnBlocs(exos) {
  const groupes = []
  let i = 0
  while (i < exos.length) {
    const g = exos[i].superset_group
    if (!g) { groupes.push([exos[i]]); i++; continue }
    let j = i
    while (j < exos.length && exos[j].superset_group === g) j++
    groupes.push(exos.slice(i, j))
    i = j
  }
  return groupes
}

function construireBlocs(session) {
  // Les exercices d'un ancien bloc échauffement / retour au calme vivent dans leur section.
  const exos = (session.exercises || []).filter(e => e.name && !['warmup', 'cooldown'].includes(e.block_type))
  return grouperEnBlocs(exos).map((groupe, gi) => {
    const lettre = String.fromCharCode(65 + gi)
    return {
      id: lettre,
      tours: Math.max(1, ...groupe.map(e => parseInt(e.sets, 10) || 1)),
      repos_sec: Math.max(0, ...groupe.map(e => parseRestSeconds(e.rest) || 0)),
      enchaine: groupe.length > 1,
      exercices: groupe.map((e, i) => {
        const details = Array.isArray(e.set_details) ? e.set_details : []
        const nbSeries = Math.max(1, parseInt(e.sets, 10) || 1)
        const repsRef = details.find(d => d?.reps)?.reps ?? e.reps
        const unite_reps = uniteReps(repsRef)
        // Prescription explicite par série (set_details), ou, pour la première, les reps/kg de
        // l'exercice. null quand le coach n'a rien écrit pour cette série : le tour reprend alors les
        // valeurs du tour précédent (voir valeursTour).
        const prescriptions = Array.from({ length: nbSeries }, (_, k) => {
          const d = details[k] || {}
          const repsTexte = d.reps || (k === 0 ? e.reps : null) || null
          const kgBrut = d.kg ?? (k === 0 && e.kg !== undefined && e.kg !== '' ? e.kg : null)
          if (!repsTexte && kgBrut === null) return null
          const kg = kgBrut === null ? null : parseFloat(kgBrut)
          return { reps: premierNombre(repsTexte), repsTexte: repsTexte ? String(repsTexte) : null, kg: Number.isNaN(kg) ? null : kg }
        })
        return {
          id: e.id,
          code: groupe.length > 1 ? `${lettre}${i + 1}` : lettre,
          nom: e.name,
          // Charge proposée sur tout exercice compté en répétitions (même au poids du corps, où elle
          // reste simplement vide) ; pas sur un exercice au temps, aux calories ou à la distance.
          unite: unite_reps === 'reps' ? 'kg' : undefined,
          pas: 2.5,
          unite_reps,
          pas_reps: unite_reps === 'secondes' ? 5 : 1,
          tempo: details.map(d => d?.tempo).find(Boolean) || null,
          note: e.note || null,
          // Coach uniquement (lot A9) : l'API sportif ne l'envoie jamais.
          note_privee: e.private_coach_note || '',
          video_url: e.video_url || null,
          prescriptions,
        }
      }),
    }
  })
}

function musclesDeLaSeance(session) {
  const exos = (session.exercises || []).filter(e => e.name)
  const principaux = [...new Set(exos.flatMap(e => [
    ...(e.movement_focus_groups ? e.movement_focus_groups.split(',') : []),
    ...(e.focus_muscles ? e.focus_muscles.split(',') : []),
  ]).map(m => m.trim()).filter(Boolean))]
  const deduits = parseMusclesFromText(exos.map(e => e.movement_muscles || '').join(', '))
  if (principaux.length === 0) return { principaux: deduits, secondaires: [] }
  return { principaux, secondaires: deduits.filter(m => !principaux.includes(m)) }
}

const libelleMuscle = (m) => (m.charAt(0).toUpperCase() + m.slice(1)).replace(/-/g, ' ')

/* ------------------------------------------------------------------ */
/* Séries en base ↔ tours                                               */
/* ------------------------------------------------------------------ */

const rempli = (v) => v !== null && v !== undefined && v !== ''
const serieFaite = (s) => !!s && [s.reps_done, s.kg_done, s.reps_prescribed, s.kg_prescribed].some(rempli)

// Tours déjà validés d'un bloc : séries faites en tête de liste, pour TOUS les exercices du bloc.
function toursValides(bloc, exerciseSets) {
  return Math.min(...bloc.exercices.map(e => {
    const sets = exerciseSets[e.id] || []
    let n = 0
    while (n < sets.length && serieFaite(sets[n])) n++
    return n
  }))
}

// Prescription qui s'applique au tour `index` : la sienne, sinon la dernière écrite avant lui (le
// coach ne répète pas une série identique). Sert de référence (première flèche sur une case vide)
// et de prescription figée à la validation.
function prescriptionEffective(e, index) {
  for (let k = Math.min(index, e.prescriptions.length - 1); k >= 0; k--) if (e.prescriptions[k]) return e.prescriptions[k]
  return {}
}

// Valeurs proposées pour le tour `index` : sa prescription si elle existe, sinon celles du tour précédent.
function valeursTour(bloc, index, precedent) {
  const out = {}
  bloc.exercices.forEach(e => {
    const p = e.prescriptions[index]
    if (p) out[e.id] = { kg: e.unite === 'kg' ? p.kg : null, reps: p.reps }
    else out[e.id] = { kg: precedent?.[e.id]?.kg ?? null, reps: precedent?.[e.id]?.reps ?? null }
  })
  return out
}

// État initial d'un bloc à partir des séries en base : tours validés relus tels quels (un champ
// vide reste vide), puis le tour suivant pré-rempli — ou, bloc déjà fini, retour sur son dernier tour.
function etatInitialBloc(bloc, exerciseSets) {
  const faits = toursValides(bloc, exerciseSets)
  const liste = []
  for (let i = 0; i < faits; i++) {
    const t = {}
    bloc.exercices.forEach(e => {
      const s = (exerciseSets[e.id] || [])[i]
      t[e.id] = { kg: e.unite === 'kg' && rempli(s.kg_done) ? parseFloat(s.kg_done) : null, reps: premierNombre(s.reps_done) }
    })
    liste.push(t)
  }
  if (faits === 0) return { liste: [valeursTour(bloc, 0, null)], courant: 0 }
  if (faits < bloc.tours) return { liste: [...liste, valeursTour(bloc, faits, liste[faits - 1])], courant: faits }
  return { liste, courant: faits - 1 }
}

/* ------------------------------------------------------------------ */
/* Utilitaires d'affichage et hooks                                     */
/* ------------------------------------------------------------------ */

const fmt = (v) => (v === null || v === undefined ? '' : (Math.round(v * 10) / 10).toString().replace('.', ','))
const mmss = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`

function consigneBloc(bloc) {
  const codes = bloc.exercices.map(e => e.code)
  if (bloc.enchaine) {
    const repos = bloc.repos_sec ? ` Repose-toi ${bloc.repos_sec} secondes, puis recommence.` : ''
    const liste = `${codes.slice(0, -1).join(', puis ')}, puis ${codes[codes.length - 1]}`
    return `Fais ${liste}.${repos}`
  }
  // Séries classiques : dans les données actuelles, un bloc non enchaîné n'a qu'un exercice.
  const repos = bloc.repos_sec ? ` Repos ${bloc.repos_sec} secondes entre les séries.` : ''
  if (codes.length === 1) return `Fais tes ${bloc.tours} série${bloc.tours > 1 ? 's' : ''} de ${codes[0]}.${repos}`
  return `Fais tes ${bloc.tours} séries de ${codes[0]} avant de passer à ${codes[1]}.${repos}`
}

// Empêche l'écran de s'éteindre pendant la séance ; se ré-acquiert au retour au premier plan.
function useKeepAwake() {
  useEffect(() => {
    let lock = null
    let annule = false
    const prendre = async () => {
      try {
        if ('wakeLock' in navigator) lock = await navigator.wakeLock.request('screen')
      } catch { /* non supporté */ }
    }
    prendre()
    const surVisibilite = () => { if (document.visibilityState === 'visible' && !annule) prendre() }
    document.addEventListener('visibilitychange', surVisibilite)
    return () => {
      annule = true
      document.removeEventListener('visibilitychange', surVisibilite)
      if (lock) lock.release().catch(() => {})
    }
  }, [])
}

// Chrono basé sur un horodatage de fin : juste même après un passage en arrière-plan (le JS d'une
// WebView est suspendu écran verrouillé), recalculé au retour au premier plan. Doublé d'une
// notification locale programmée à la même heure (lib/reposNotification.js), la seule chose qui
// puisse prévenir le sportif téléphone en poche ; reprogrammée au +15 s, annulée si on passe.
// `initial` : repos en cours relu après un rechargement (ignoré s'il est déjà fini).
function useChrono(initial = null) {
  const [etat, setEtat] = useState(() => (initial && initial.fin > Date.now() ? initial : null)) // { fin: timestamp, duree: secondes }
  const [restant, setRestant] = useState(0)
  const timer = useRef(null)

  useEffect(() => {
    if (!etat) return undefined
    const tick = () => {
      const r = Math.max(0, Math.ceil((etat.fin - Date.now()) / 1000))
      setRestant(r)
      if (r <= 0) {
        clearInterval(timer.current)
        setEtat(null)
        try { navigator.vibrate?.([140, 70, 140]) } catch { /* vibration indisponible */ }
      }
    }
    tick()
    timer.current = setInterval(tick, 500)
    const surVisibilite = () => { if (document.visibilityState === 'visible') tick() }
    document.addEventListener('visibilitychange', surVisibilite)
    return () => {
      clearInterval(timer.current)
      document.removeEventListener('visibilitychange', surVisibilite)
    }
  }, [etat])

  return {
    etat,
    actif: Boolean(etat),
    restant,
    duree: etat?.duree ?? 0,
    lancer: (secondes) => {
      const fin = Date.now() + secondes * 1000
      setEtat({ fin, duree: secondes })
      programmerFinRepos(fin)
    },
    ajouter: (secondes) => {
      if (!etat) return
      const fin = etat.fin + secondes * 1000
      setEtat({ fin, duree: etat.duree + secondes })
      programmerFinRepos(fin)
    },
    arreter: () => {
      if (!etat) return
      setEtat(null)
      annulerFinRepos()
    },
  }
}

/* ------------------------------------------------------------------ */
/* Briques d'interface                                                  */
/* ------------------------------------------------------------------ */

function FeuilleModale({ children, onFermer }) {
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 900, display: 'flex', alignItems: 'flex-end' }}>
      <div onClick={onFermer} aria-hidden="true" style={{ position: 'absolute', inset: 0, background: 'rgba(45,38,32,0.5)' }} />
      <div role="dialog" aria-modal="true" style={{
        position: 'relative', width: '100%', maxWidth: 480, margin: '0 auto', background: T.fond,
        borderRadius: '22px 22px 0 0', padding: '10px 16px calc(18px + env(safe-area-inset-bottom, 0px))',
        maxHeight: '90vh', overflowY: 'auto',
      }}>
        <div style={{ width: 36, height: 4, borderRadius: 100, background: T.bordure, margin: '0 auto 14px' }} />
        {children}
      </div>
    </div>
  )
}

function ExplicationTempo({ tempo, onFermer }) {
  const phases = [
    ['Descente', 'phase où tu résistes au mouvement'],
    ['Pause basse', 'en position basse, sous tension'],
    ['Montée', 'phase où tu produis la force'],
    ['Pause haute', 'avant de repartir'],
  ]
  const lire = (c) => (c.toUpperCase() === 'X' ? 'le plus vite possible' : c === '0' ? "sans temps d'arrêt" : `${c} seconde${+c > 1 ? 's' : ''}`)
  return (
    <FeuilleModale onFermer={onFermer}>
      <p style={{ fontFamily: TITRE, fontSize: 17, margin: '0 0 4px' }}>
        Le tempo <span style={{ color: T.ocre }}>{tempo}</span>
      </p>
      <p style={{ fontSize: 12, color: T.texteSec, margin: '0 0 14px' }}>Quatre chiffres, quatre phases du mouvement, en secondes.</p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {tempo.split('').slice(0, 4).map((c, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, background: T.blanc, borderRadius: 10, padding: '9px 12px' }}>
            <span style={{
              width: 26, height: 26, borderRadius: 8, background: T.ocre, color: T.blanc, fontFamily: TITRE, fontSize: 14,
              display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none',
            }}>{c}</span>
            <div>
              <p style={{ fontSize: 13, margin: 0 }}>{phases[i]?.[0]} · <span style={{ color: T.ocre }}>{lire(c)}</span></p>
              <p style={{ fontSize: 11, color: T.texteSec, margin: '1px 0 0' }}>{phases[i]?.[1]}</p>
            </div>
          </div>
        ))}
      </div>
      <button type="button" onClick={onFermer} style={{ width: '100%', marginTop: 14, background: T.bordeaux, color: T.clair, border: 'none', borderRadius: 12, height: 46, fontSize: 14, fontFamily: 'inherit', cursor: 'pointer' }}>
        J&apos;ai compris
      </button>
    </FeuilleModale>
  )
}

function Champ({ exercice, champ, valeur, suffixe, onPas, onSaisie }) {
  const vide = valeur === null
  // Texte en cours de frappe ("67," avant la décimale) gardé localement ; la valeur numérique ne
  // remonte qu'une fois lisible, et une frappe vide remonte null (valeur absente).
  const [brouillon, setBrouillon] = useState(null)
  const bouton = {
    width: 30, height: 30, flex: 'none', border: 'none', borderRadius: '50%', background: T.blanc,
    color: T.vert, fontSize: 16, padding: 0, cursor: 'pointer', fontFamily: 'inherit',
  }
  return (
    <div style={{
      display: 'flex', alignItems: 'center', background: vide ? T.videFond : T.fond,
      border: `1px solid ${vide ? `${T.ocre}55` : 'transparent'}`, borderRadius: 100, padding: 3, marginTop: 6,
    }}>
      <button type="button" aria-label={`Diminuer ${champ === 'kg' ? 'la charge' : 'la valeur'} sur ${exercice.nom}`} onClick={() => { setBrouillon(null); onPas(-1) }} style={bouton}>−</button>
      <input
        value={brouillon ?? fmt(valeur)}
        placeholder="—"
        inputMode="decimal"
        aria-label={`${champ === 'kg' ? 'Charge' : 'Valeur'} sur ${exercice.nom}`}
        onFocus={e => e.target.scrollIntoView({ block: 'center', behavior: 'smooth' })}
        onChange={e => {
          const propre = e.target.value.replace(/[^0-9,.]/g, '').replace('.', ',')
          setBrouillon(propre)
          onSaisie(propre)
        }}
        onBlur={() => setBrouillon(null)}
        onKeyDown={e => { if (e.key === 'Enter') e.target.blur() }}
        style={{
          flex: 1, minWidth: 0, width: '100%', border: 'none', background: 'none', fontFamily: TITRE, fontSize: 17,
          textAlign: 'center', color: T.texte, outline: 'none', padding: 0,
        }}
      />
      <button type="button" aria-label={`Augmenter ${champ === 'kg' ? 'la charge' : 'la valeur'} sur ${exercice.nom}`} onClick={() => { setBrouillon(null); onPas(1) }} style={bouton}>+</button>
      <span style={{ fontSize: 10, color: T.texteSec, padding: '0 7px 0 3px', whiteSpace: 'nowrap' }}>{suffixe}</span>
    </div>
  )
}

function CarteExercice({ exercice, valeur, pleineLargeur, onPas, onSaisie, onTempo, onVideo, notePrivee = null, onNotePrivee = null }) {
  const [noteOuverte, setNoteOuverte] = useState(false)
  return (
    <div style={{ flex: pleineLargeur ? '1 1 100%' : '1 1 calc(50% - 4px)', minWidth: 0, boxSizing: 'border-box', background: T.blanc, borderRadius: 14, padding: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ background: T.texteSec, color: T.blanc, borderRadius: 100, fontSize: 10, padding: '2px 7px', flex: 'none' }}>{exercice.code}</span>
        {/* minWidth: 0 : sans lui, un nom long impose sa largeur à la carte et casse la grille à deux colonnes. */}
        <span title={exercice.nom} style={{ fontSize: 12, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{exercice.nom}</span>
        {onNotePrivee ? (
          <button type="button" aria-label={`Note privée sur ${exercice.nom}${notePrivee ? ' (renseignée)' : ''}`} onClick={() => onNotePrivee(exercice)} style={{
            border: 'none', background: notePrivee ? T.vert : 'none', color: notePrivee ? T.beige : T.texteSec, borderRadius: 6,
            width: 26, height: 24, fontSize: 12, padding: 0, cursor: 'pointer', flex: 'none',
          }}>
            ✎
          </button>
        ) : null}
        {exercice.video_url ? (
          <button type="button" aria-label={`Vidéo de ${exercice.nom}`} onClick={() => onVideo(exercice)} style={{ border: 'none', background: 'none', color: T.texteSec, fontSize: 12, padding: '4px 2px', cursor: 'pointer' }}>
            ▶
          </button>
        ) : null}
      </div>

      {exercice.tempo ? (
        <button type="button" onClick={() => onTempo(exercice.tempo)} style={{
          display: 'flex', alignItems: 'center', gap: 5, marginTop: 8, background: T.sableClair, border: `1px solid ${T.ocre}33`,
          borderRadius: 8, padding: '5px 8px', width: '100%', cursor: 'pointer', fontFamily: 'inherit',
        }}>
          <span style={{ fontSize: 10, color: T.texteSec, letterSpacing: '0.04em' }}>TEMPO</span>
          <span style={{ fontFamily: TITRE, fontSize: 14, color: T.ocre, flex: 1, textAlign: 'left' }}>{exercice.tempo}</span>
          <span style={{ fontSize: 11, color: T.ocre }}>?</span>
        </button>
      ) : null}

      {exercice.note ? (
        <button type="button" onClick={() => setNoteOuverte(o => !o)} aria-expanded={noteOuverte} style={{
          display: 'flex', gap: 7, width: '100%', textAlign: 'left', marginTop: 8, background: T.sable, border: 'none',
          borderLeft: `3px solid ${T.bordeaux}`, borderRadius: 6, padding: '7px 9px', cursor: 'pointer', fontFamily: 'inherit',
        }}>
          <span style={{ fontSize: 11, color: T.bordeaux, flex: 'none' }}>✎</span>
          <span style={{
            fontSize: 11, lineHeight: 1.45, color: T.texteCorps, whiteSpace: 'pre-wrap',
            ...(noteOuverte ? {} : { display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }),
          }}>
            {exercice.note}
          </span>
        </button>
      ) : null}

      <div style={{ display: pleineLargeur ? 'flex' : 'block', gap: 8 }}>
        {exercice.unite === 'kg' ? (
          <div style={{ flex: 1 }}>
            <Champ exercice={exercice} champ="kg" valeur={valeur.kg} suffixe="kg" onPas={d => onPas('kg', d)} onSaisie={v => onSaisie('kg', v)} />
          </div>
        ) : null}
        <div style={{ flex: 1 }}>
          <Champ exercice={exercice} champ="reps" valeur={valeur.reps} suffixe={exercice.unite_reps} onPas={d => onPas('reps', d)} onSaisie={v => onSaisie('reps', v)} />
        </div>
      </div>
    </div>
  )
}

function Repos({ secondes, chrono }) {
  if (!secondes) return null
  if (!chrono.actif) {
    return (
      <button type="button" onClick={() => chrono.lancer(secondes)} style={{
        width: '100%', marginTop: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, background: T.blanc,
        color: T.vert, border: `1px solid ${T.bordure}`, borderRadius: 12, height: 46, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit',
      }}>
        ◷ Repos {secondes} secondes <span style={{ fontSize: 11, color: T.texteSec }}>· lancer</span>
      </button>
    )
  }
  const pct = Math.round(((chrono.duree - chrono.restant) / chrono.duree) * 100)
  const petit = { borderRadius: 100, fontSize: 11, height: 32, padding: '0 11px', cursor: 'pointer', fontFamily: 'inherit' }
  return (
    <div style={{ marginTop: 12, background: T.vert, borderRadius: 12, padding: '10px 12px', color: T.beige }} role="status" aria-live="polite">
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ fontFamily: TITRE, fontSize: 22, minWidth: 56 }}>{mmss(chrono.restant)}</span>
        <span style={{ fontSize: 12, color: T.muted, flex: 1 }}>repos</span>
        <button type="button" onClick={() => chrono.ajouter(15)} style={{ ...petit, background: 'none', border: `1px solid ${T.muted}`, color: T.beige }}>+15 s</button>
        <button type="button" onClick={chrono.arreter} style={{ ...petit, background: T.beige, border: 'none', color: T.vert }}>Passer</button>
      </div>
      <div style={{ height: 4, borderRadius: 100, background: '#4A5A50', marginTop: 9 }}>
        <div style={{ width: `${pct}%`, height: 4, borderRadius: 100, background: T.beige }} />
      </div>
    </div>
  )
}

function Muscles({ muscles }) {
  if (!muscles.principaux.length) return null
  const pastille = (fond, couleur) => ({ background: fond, color: couleur, borderRadius: 100, fontSize: 11, padding: '3px 10px' })
  return (
    <div style={{ background: T.blanc, borderRadius: 12, padding: 12 }}>
      <p style={{ fontFamily: TITRE, fontSize: 12, color: T.bordeaux, margin: '0 0 8px' }}>Muscles travaillés</p>
      <p style={{ fontSize: 10, color: T.texteSec, margin: '0 0 5px' }}>Principaux</p>
      <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginBottom: muscles.secondaires.length ? 9 : 0 }}>
        {muscles.principaux.map(m => <span key={m} style={pastille(T.bordeaux, T.clair)}>{libelleMuscle(m)}</span>)}
      </div>
      {muscles.secondaires.length ? (
        <>
          <p style={{ fontSize: 10, color: T.texteSec, margin: '0 0 5px' }}>Secondaires</p>
          <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
            {muscles.secondaires.map(m => <span key={m} style={pastille(T.vertClair, T.vert)}>{libelleMuscle(m)}</span>)}
          </div>
        </>
      ) : null}
    </div>
  )
}

function Echelle({ titre, valeur, couleur, libelles, onChoisir }) {
  return (
    <div style={{ background: T.blanc, borderRadius: 14, padding: 12, marginBottom: 8 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 9 }}>
        <span style={{ fontSize: 13 }}>{titre}</span>
        <span style={{ fontSize: 11, color: valeur ? couleur : T.texteSec }}>
          {valeur ? `${valeur}/10${libelles[valeur] ? ` · ${libelles[valeur]}` : ''}` : 'à noter'}
        </span>
      </div>
      <div style={{ display: 'flex', gap: 3 }}>
        {Array.from({ length: 10 }, (_, k) => k + 1).map(i => {
          const on = valeur >= i
          return (
            <button key={i} type="button" aria-label={`${titre} ${i} sur 10`} aria-pressed={valeur === i} onClick={() => onChoisir(valeur === i ? 0 : i)} style={{
              flex: 1, minWidth: 0, height: 44, borderRadius: 9, border: `1px solid ${on ? couleur : '#E3DACB'}`, background: on ? couleur : T.blanc,
              color: on ? T.clair : T.texteSec, fontFamily: TITRE, fontSize: 13, padding: 0, cursor: 'pointer',
            }}>
              {i}
            </button>
          )
        })}
      </div>
    </div>
  )
}

// Fin de séance en mode coach : notation plaisir / difficulté sur 10 (même échelle que les stats du
// sportif, program_completions.pleasure / difficulty), puis récapitulatif partageable.
function FinCoach({ session, athleteNom, dureeMin, nbBlocs, volume, muscles, onTerminer, onPartager }) {
  const [plaisir, setPlaisir] = useState(0)
  const [difficulte, setDifficulte] = useState(0)
  const [recap, setRecap] = useState(false)
  const [citation] = useState(() => randomCitation())
  const [partage, setPartage] = useState(false)
  const [envoi, setEnvoi] = useState(false)
  const prenom = (athleteNom || '').split(' ')[0] || 'ton sportif'
  const note = { plaisir: plaisir || null, difficulte: difficulte || null, duree_min: dureeMin }
  return (
    <>
      <p style={{ fontFamily: TITRE, fontSize: 18, color: T.bordeaux, margin: '0 0 2px' }}>Séance terminée</p>
      <p style={{ fontSize: 12, color: T.texteSec, margin: '0 0 14px' }}>{session.title || 'Séance'} · {dureeMin} minute{dureeMin > 1 ? 's' : ''} · {nbBlocs} bloc{nbBlocs > 1 ? 's' : ''}</p>
      <Echelle titre="Plaisir" valeur={plaisir} couleur={T.bordeaux} libelles={{ 1: 'Pénible', 4: 'Moyen', 7: 'Bon', 10: 'Excellent' }} onChoisir={setPlaisir} />
      <Echelle titre="Difficulté" valeur={difficulte} couleur={T.vert} libelles={{ 1: 'Très facile', 4: 'Modérée', 7: 'Dure', 10: 'Maximale' }} onChoisir={setDifficulte} />
      <button type="button" onClick={() => setRecap(true)} style={{
        width: '100%', marginTop: 6, background: plaisir && difficulte ? T.bordeaux : '#C9BFB0', color: T.clair, border: 'none', borderRadius: 12,
        height: 50, fontSize: 14, cursor: 'pointer', fontFamily: 'inherit',
      }}>
        Valider la séance
      </button>

      {recap ? (
        <FeuilleModale onFermer={() => setRecap(false)}>
          <p style={{ fontFamily: TITRE, fontSize: 18, color: T.bordeaux, margin: '0 0 2px' }}>{session.title || 'Séance'}</p>
          <p style={{ fontSize: 12, color: T.texteSec, margin: '0 0 12px' }}>
            {new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })} · {dureeMin} minute{dureeMin > 1 ? 's' : ''}
          </p>
          <div style={{ background: T.vert, borderRadius: 14, padding: '16px 14px', marginBottom: 12 }}>
            <p style={{ fontFamily: TITRE, fontSize: 16, lineHeight: 1.5, color: T.clair, margin: 0, textAlign: 'center' }}>«&nbsp;{citation.texte}&nbsp;»</p>
            {citation.auteur ? <p style={{ fontSize: 11, color: T.muted, margin: '6px 0 0', textAlign: 'center' }}>{citation.auteur}</p> : null}
          </div>
          <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
            {[['Plaisir', plaisir || '—', T.bordeaux, true], ['Difficulté', difficulte || '—', T.vert, true], ['Volume', volume, T.texte, false]].map(([l, v, c, surDix]) => (
              <div key={l} style={{ flex: 1, background: T.blanc, borderRadius: 12, padding: 10 }}>
                <p style={{ fontSize: 11, color: T.texteSec, margin: 0 }}>{l}</p>
                <p style={{ fontFamily: TITRE, fontSize: 20, color: c, margin: '2px 0 0' }}>
                  {v}{surDix ? <span style={{ fontSize: 12, color: T.texteSec }}>/10</span> : null}
                </p>
              </div>
            ))}
          </div>
          <div style={{ marginBottom: 14 }}><Muscles muscles={muscles} /></div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" disabled={envoi} onClick={async () => { setEnvoi(true); await onTerminer({ ...note, partage }) }} style={{
              flex: 1, background: T.blanc, border: `1px solid ${T.bordure}`, borderRadius: 12, height: 50, fontSize: 14, cursor: 'pointer', fontFamily: 'inherit',
            }}>
              {envoi ? '…' : 'Quitter'}
            </button>
            <button type="button" disabled={partage || envoi} onClick={async () => {
              setEnvoi(true)
              try { await onPartager({ ...note, citation, muscles: [...muscles.principaux, ...muscles.secondaires], volume }); setPartage(true) } finally { setEnvoi(false) }
            }} style={{
              flex: 2, background: partage ? T.vert : T.bordeaux, color: T.clair, border: 'none', borderRadius: 12, height: 50, fontSize: 14,
              cursor: partage ? 'default' : 'pointer', fontFamily: 'inherit',
            }}>
              {partage ? 'Envoyé ✓' : 'Partager'}
            </button>
          </div>
          <p style={{ fontSize: 11, color: T.texteSec, textAlign: 'center', margin: '8px 0 0' }}>
            {partage ? `Envoyé à ${prenom}` : `Tes notes restent privées · ${prenom} reçoit la citation et les muscles`}
          </p>
        </FeuilleModale>
      ) : null}
    </>
  )
}

function Page({ titre, etapes, index, faits, fin, onNaviguer, onFermer, bandeauCoach = null, children }) {
  return (
    <div style={{ background: T.beige, minHeight: '100svh', color: T.texte, paddingBottom: 'calc(18px + env(safe-area-inset-bottom, 0px))' }}>
      {bandeauCoach ? (
        <div style={{ background: T.vert, color: T.beige, padding: 'calc(10px + env(safe-area-inset-top, 0px)) 14px 10px', display: 'flex', alignItems: 'center', gap: 9 }}>
          <span aria-hidden="true" style={{ width: 26, height: 26, borderRadius: '50%', background: T.bordeaux, color: T.clair, fontSize: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}>
            {bandeauCoach.split(' ').map(m => m[0]).join('').slice(0, 2).toUpperCase()}
          </span>
          <span style={{ fontSize: 12, flex: 1 }}>Coaching · {bandeauCoach}</span>
          <span style={{ background: T.beige, color: T.vert, borderRadius: 100, fontSize: 10, padding: '3px 9px' }}>Mode coach</span>
        </div>
      ) : null}
      <div style={{ paddingTop: bandeauCoach ? 14 : 'calc(16px + env(safe-area-inset-top, 0px))' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '0 10px', marginBottom: 14 }}>
          <button type="button" aria-label="Retour" onClick={onFermer} style={{ background: 'none', border: 'none', fontSize: 20, color: T.vert, width: 44, height: 44, cursor: 'pointer', flex: 'none' }}>
            ←
          </button>
          <span style={{ flex: 1, textAlign: 'center', fontFamily: TITRE, fontSize: 13, color: T.bordeaux, letterSpacing: '0.06em', textTransform: 'uppercase', lineHeight: 1.35 }}>
            {titre}
          </span>
          <span style={{ width: 44, flex: 'none' }} />
        </div>

        <nav aria-label="Étapes de la séance" style={{ display: 'flex', gap: 7, justifyContent: 'center', marginBottom: 5, flexWrap: 'wrap', padding: '0 14px' }}>
          {etapes.map((et, i) => {
            const actif = i === index && !fin
            const termine = Boolean(faits[et.id])
            return (
              <button key={et.id} type="button" aria-current={actif ? 'step' : undefined}
                aria-label={`${et.libelle}${termine ? ', terminé' : ''}`} onClick={() => onNaviguer(i)} style={{
                  width: 44, height: 44, border: 'none', borderRadius: '50%', cursor: 'pointer',
                  background: actif ? T.bordeaux : termine ? T.vert : T.blanc,
                  color: actif || termine ? T.clair : T.texte, fontFamily: TITRE, fontSize: 14,
                }}>
                {et.rond}
              </button>
            )
          })}
        </nav>

        <p style={{ textAlign: 'center', fontSize: 11, color: T.texteSec, margin: '0 0 14px' }}>
          {fin ? 'Séance terminée' : etapes[index]?.libelle}
        </p>

        <div style={{ padding: '0 14px' }}>{children}</div>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Écran principal                                                      */
/* ------------------------------------------------------------------ */

// État de la séance en cours, mémorisé par sportif + séance (même clé que l'ancien player, que la
// page efface à la validation via clearSessionProgress) : section affichée, tour courant et
// valeurs de CHAQUE tour de chaque bloc (y compris un tour pas encore validé), blocs marqués
// terminés, fin du repos en cours, début de séance. Un WebView mobile peut recharger toute la page
// en repassant au premier plan : sans ça, le client qui revient sur le bloc A ne retrouverait pas
// son tour 2 tel qu'il l'a laissé. Les séries validées restent, elles, la référence en base.
export const sessionProgressKey = (athleteId, sessionId) => `ostryk_session_progress_${athleteId}_${sessionId}`
// Au-delà, c'est une autre séance : on repart des séries en base.
const PROGRESS_MAX_AGE_MS = 12 * 60 * 60 * 1000

function lireEtat(athleteId, sessionId) {
  try {
    const parsed = JSON.parse(localStorage.getItem(sessionProgressKey(athleteId, sessionId)) || 'null')
    if (typeof parsed?.blockIndex !== 'number' || !parsed.updatedAt || Date.now() - parsed.updatedAt > PROGRESS_MAX_AGE_MS) return null
    return parsed
  } catch { return null }
}

// Tours mémorisés sur ce téléphone, complétés par la base si elle en sait plus (tours validés
// depuis un autre appareil). Mémoire ignorée si elle ne correspond plus aux exercices du bloc
// (séance modifiée par le coach entre-temps).
function fusionnerBloc(bloc, depuisBase, memo) {
  const ids = bloc.exercices.map(e => e.id)
  const lisible = memo && Array.isArray(memo.liste) && memo.liste.length > 0
    && memo.liste.every(t => t && ids.every(id => t[id] && 'kg' in t[id] && 'reps' in t[id]))
  if (!lisible) return depuisBase
  const liste = memo.liste.length >= depuisBase.liste.length ? memo.liste : [...memo.liste, ...depuisBase.liste.slice(memo.liste.length)]
  const courant = Number.isInteger(memo.courant) ? Math.min(Math.max(0, memo.courant), liste.length - 1) : depuisBase.courant
  return { liste, courant }
}

/*
  mode 'coach' (fiche sportif, coaching en présentiel) : bandeau vert, crayon de note privée sur
  chaque exercice (onEnregistrerNotePrivee), fin de séance avec notation plaisir / difficulté puis
  récapitulatif partageable (onPartagerRecap). Les séries, elles, passent par les mêmes
  onEnsureExerciseSets / onSaveExerciseSet : c'est l'appelant qui les marque entered_by_role = 'coach'.
*/
export default function Seance({ session, athleteId, mouvementsSections = {}, exerciseSets, onEnsureExerciseSets, onSaveExerciseSet, onTerminer, onQuitter, mode = 'client', athleteNom = '', onEnregistrerNotePrivee = null, onPartagerRecap = null }) {
  const coach = mode === 'coach'
  useKeepAwake()
  const [memo] = useState(() => lireEtat(athleteId, session.id))
  const [video, setVideo] = useState(null)
  const chrono = useChrono(memo?.repos)
  const [debut] = useState(() => (typeof memo?.debut === 'number' ? memo.debut : Date.now()))
  const blocs = useMemo(() => construireBlocs(session), [session])
  // Étapes de navigation : échauffement (△), blocs A, B, C…, retour au calme (▽). Sections envoyées
  // prêtes par l'API ; recalculées ici pour une séance créée côté client (séance libre).
  const sections = useMemo(() => session.sections || {
    echauffement: sectionDeSeance(session, 'echauffement'),
    retourAuCalme: sectionDeSeance(session, 'retourAuCalme'),
  }, [session])
  const etapes = useMemo(() => [
    ...(sections.echauffement ? [{ id: 'echauffement', type: 'texte', rond: '△', libelle: sections.echauffement.titre, section: sections.echauffement }] : []),
    ...blocs.map(b => ({ id: b.id, type: 'bloc', rond: b.id, libelle: `Bloc ${b.id}`, bloc: b })),
    ...(sections.retourAuCalme ? [{ id: 'retourAuCalme', type: 'texte', rond: '▽', libelle: sections.retourAuCalme.titre, section: sections.retourAuCalme }] : []),
  ], [blocs, sections])
  const muscles = useMemo(() => musclesDeLaSeance(session), [session])
  const [toast, setToast] = useState(null)

  const [tours, setTours] = useState(() => Object.fromEntries(blocs.map(b => [b.id, fusionnerBloc(b, etatInitialBloc(b, exerciseSets), memo?.blocs?.[b.id])])))
  const [faits, setFaits] = useState(() => Object.fromEntries(blocs.map(b => [b.id, !!memo?.faits?.[b.id] || toursValides(b, exerciseSets) >= b.tours])))
  // Reprise : l'étape mémorisée ; sinon, séance déjà entamée → premier bloc pas fini ; sinon le début
  // (échauffement s'il y en a un).
  const [index, setIndex] = useState(() => {
    const memoIndex = memo?.section ? etapes.findIndex(et => et.id === memo.section) : -1
    if (memoIndex !== -1) return memoIndex
    if (!blocs.some(b => toursValides(b, exerciseSets) > 0)) return 0
    const i = etapes.findIndex(et => et.type === 'bloc' && toursValides(et.bloc, exerciseSets) < et.bloc.tours)
    return i === -1 ? Math.max(0, etapes.length - 1) : i
  })
  const [tempo, setTempo] = useState(null)
  const [notesPrivees, setNotesPrivees] = useState(() => Object.fromEntries(blocs.flatMap(b => b.exercices.map(e => [e.id, e.note_privee]))))
  const [notePriveeOuverte, setNotePriveeOuverte] = useState(null) // { exercice, texte, envoi }
  const [fin, setFin] = useState(null) // horodatage de fin de séance, null tant qu'elle continue
  const [terminaison, setTerminaison] = useState(false)

  // Réécrit à chaque changement (frappe comprise) : au prochain montage, on rouvre exactement ici.
  useEffect(() => {
    try {
      localStorage.setItem(sessionProgressKey(athleteId, session.id), JSON.stringify({
        blockIndex: index, section: etapes[index]?.id, blocs: tours, faits, repos: chrono.etat, debut, updatedAt: Date.now(),
      }))
    } catch { /* stockage indisponible — reprise sur les séries en base */ }
  }, [athleteId, session.id, index, etapes, tours, faits, chrono.etat, debut])

  // Séries à créer pour le bloc affiché (autant que de tours listés, au moins les tours prévus).
  // Provisionnement local et synchrone côté page ; le ref évite un double appel (effets rejoués en
  // dev) qui créerait des séries en double avant que l'état n'ait été relu.
  const provisionne = useRef({})
  const etape = etapes[index]
  const bloc = etape?.type === 'bloc' ? etape.bloc : null
  const nbTours = bloc ? Math.max(bloc.tours, tours[bloc.id].liste.length) : 0
  useEffect(() => {
    if (!bloc) return
    bloc.exercices.forEach(e => {
      if ((provisionne.current[e.id] || 0) >= nbTours) return
      provisionne.current[e.id] = nbTours
      if ((exerciseSets[e.id] || []).length < nbTours) onEnsureExerciseSets(e.id, nbTours)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bloc?.id, nbTours])

  if (etapes.length === 0) {
    return (
      <Page bandeauCoach={coach ? athleteNom : null} titre={session.title || 'Séance'} etapes={[]} index={0} faits={{}} onNaviguer={() => {}} onFermer={onQuitter}>
        <p style={{ textAlign: 'center', color: T.texteSec, padding: 30 }}>Aucun exercice dans cette séance.</p>
      </Page>
    )
  }

  function majValeur(b, exercice, champ, transformer) {
    setTours(prev => {
      const etat = prev[b.id]
      const liste = etat.liste.map((t, i) => (i === etat.courant ? { ...t, [exercice.id]: transformer({ ...t[exercice.id] }) } : t))
      return { ...prev, [b.id]: { ...etat, liste } }
    })
  }

  // Écrit le tour courant du bloc dans les séries (une par exercice). Refuse — sans rien perdre —
  // si une série n'existe pas encore : elle est redemandée, un second tap suffira.
  function enregistrerTour(b) {
    const etat = tours[b.id]
    const t = etat.liste[etat.courant]
    const lignes = b.exercices.map(e => (exerciseSets[e.id] || [])[etat.courant])
    if (lignes.some(l => !l)) {
      b.exercices.forEach(e => onEnsureExerciseSets(e.id, etat.courant + 1))
      setToast('Un instant… réessaie dans une seconde')
      return false
    }
    b.exercices.forEach((e, k) => {
      const v = t[e.id]
      const p = prescriptionEffective(e, etat.courant)
      const id = lignes[k].id
      onSaveExerciseSet(e.id, id, 'reps_done', v.reps === null ? '' : String(v.reps))
      onSaveExerciseSet(e.id, id, 'kg_done', e.unite === 'kg' && v.kg !== null ? String(v.kg) : '')
      onSaveExerciseSet(e.id, id, 'reps_prescribed', p.repsTexte ?? (p.reps != null ? String(p.reps) : null))
      onSaveExerciseSet(e.id, id, 'kg_prescribed', e.unite === 'kg' ? p.kg ?? null : null)
    })
    setToast('✓ Tour enregistré')
    return true
  }

  if (fin) {
    const series = blocs.reduce((acc, b) => acc + toursValides(b, exerciseSets) * b.exercices.length, 0)
    const dureeMin = Math.max(1, Math.round((fin - debut) / 60000))
    if (coach) {
      return (
        <Page bandeauCoach={athleteNom} titre={session.title || 'Séance'} etapes={etapes} index={-1} faits={faits} fin onNaviguer={i => { setFin(null); setIndex(i) }} onFermer={() => setFin(null)}>
          <FinCoach session={session} athleteNom={athleteNom} dureeMin={dureeMin} nbBlocs={blocs.length} volume={series} muscles={muscles}
            onTerminer={onTerminer} onPartager={onPartagerRecap} />
        </Page>
      )
    }
    return (
      <Page bandeauCoach={coach ? athleteNom : null} titre={session.title || 'Séance'} etapes={etapes} index={-1} faits={faits} fin onNaviguer={i => { setFin(null); setIndex(i) }} onFermer={() => setFin(null)}>
        <div style={{ background: T.vert, borderRadius: 20, padding: '20px 16px', color: T.clair, textAlign: 'center', marginBottom: 12 }}>
          <p style={{ fontFamily: TITRE, fontSize: 24, margin: '0 0 4px' }}>Séance terminée</p>
          <p style={{ fontSize: 12, color: T.muted, margin: 0 }}>{session.title || 'Séance'} · {dureeMin} minute{dureeMin > 1 ? 's' : ''}</p>
        </div>
        <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
          {[[series, 'séries'], [blocs.length, 'blocs'], [dureeMin, 'minutes']].map(([v, l]) => (
            <div key={l} style={{ flex: 1, background: T.blanc, borderRadius: 12, padding: 12, textAlign: 'center' }}>
              <p style={{ fontFamily: TITRE, fontSize: 22, margin: 0 }}>{v}</p>
              <p style={{ fontSize: 11, color: T.texteSec, margin: '2px 0 0' }}>{l}</p>
            </div>
          ))}
        </div>
        <div style={{ marginBottom: 14 }}><Muscles muscles={muscles} /></div>
        <button type="button" disabled={terminaison} onClick={async () => { setTerminaison(true); await onTerminer({ duree_min: dureeMin }) }} style={{
          width: '100%', background: T.bordeaux, color: T.clair, border: 'none', borderRadius: 12, height: 52, fontSize: 15,
          fontFamily: 'inherit', cursor: 'pointer', opacity: terminaison ? 0.6 : 1,
        }}>
          {terminaison ? 'Enregistrement…' : "Retour à l'accueil"}
        </button>
        <Toast message={toast} show={!!toast} onDone={() => setToast(null)} position="top" />
      </Page>
    )
  }

  const derniereEtape = index === etapes.length - 1
  const pageEtape = (contenu) => (
    <Page bandeauCoach={coach ? athleteNom : null} titre={session.title || 'Séance'} etapes={etapes} index={index} faits={faits}
      onNaviguer={i => { chrono.arreter(); setIndex(i) }} onFermer={onQuitter}>
      {contenu}
      {tempo ? <ExplicationTempo tempo={tempo} onFermer={() => setTempo(null)} /> : null}
      {video ? <FenetreVideo video={video} onFermer={() => setVideo(null)} /> : null}
      {notePriveeOuverte ? (
        <FeuilleModale onFermer={() => setNotePriveeOuverte(null)}>
          <p style={{ fontFamily: TITRE, fontSize: 16, margin: '0 0 2px' }}>Note privée</p>
          <p style={{ fontSize: 12, color: T.texteSec, margin: '0 0 12px' }}>{notePriveeOuverte.exercice.nom} · visible par toi seul</p>
          <textarea autoFocus rows={4} value={notePriveeOuverte.texte} aria-label="Note privée"
            onChange={e => { const texte = e.target.value; setNotePriveeOuverte(n => ({ ...n, texte })) }}
            style={{ width: '100%', boxSizing: 'border-box', border: `1px solid ${T.bordure}`, borderRadius: 10, padding: 10, fontFamily: 'inherit', fontSize: 14, background: T.blanc, resize: 'vertical' }} />
          <button type="button" disabled={notePriveeOuverte.envoi} onClick={async () => {
            const { exercice, texte } = notePriveeOuverte
            setNotePriveeOuverte(n => ({ ...n, envoi: true }))
            try {
              await onEnregistrerNotePrivee({ program_session_id: session.id, program_exercise_id: exercice.id, texte: texte.trim() })
              setNotesPrivees(n => ({ ...n, [exercice.id]: texte.trim() }))
              setNotePriveeOuverte(null)
              setToast('✓ Note enregistrée')
            } catch (err) {
              setNotePriveeOuverte(n => ({ ...n, envoi: false }))
              setToast(err?.message || 'Note non enregistrée')
            }
          }} style={{ width: '100%', marginTop: 12, background: T.bordeaux, color: T.clair, border: 'none', borderRadius: 12, height: 46, fontSize: 14, cursor: 'pointer', fontFamily: 'inherit' }}>
            {notePriveeOuverte.envoi ? 'Enregistrement…' : 'Enregistrer'}
          </button>
        </FeuilleModale>
      ) : null}
      <Toast message={toast} show={!!toast} onDone={() => setToast(null)} position="top" />
    </Page>
  )

  if (etape.type === 'texte') {
    return pageEtape(
      <SectionTexteVideo
        section={etape.section}
        mouvements={mouvementsSections}
        fait={Boolean(faits[etape.id])}
        onLireVideo={setVideo}
        onValider={valeur => {
          setFaits(f => ({ ...f, [etape.id]: valeur }))
          if (!valeur) return
          if (derniereEtape) setFin(Date.now())
          else setIndex(index + 1)
        }}
      />
    )
  }

  const etat = tours[bloc.id]
  const t = etat.liste[etat.courant]
  const impair = bloc.exercices.length % 2 === 1

  return pageEtape(
    <>
      <div style={{ display: 'flex', gap: 9, background: T.blanc, borderRadius: 12, padding: '10px 12px', marginBottom: 10 }}>
        <span style={{ width: 3, background: T.bordeaux, borderRadius: 100, flex: 'none' }} />
        <p style={{ fontSize: 12, lineHeight: 1.5, color: T.texteCorps, margin: 0 }}>{consigneBloc(bloc)}</p>
      </div>

      {etat.liste.map((tt, i) => (i === etat.courant ? null : (
        <button key={i} type="button" onClick={() => setTours(p => ({ ...p, [bloc.id]: { ...p[bloc.id], courant: i } }))} style={{
          width: '100%', textAlign: 'left', background: T.blanc, border: 'none', borderRadius: 12, padding: '9px 12px', marginBottom: 8,
          display: 'flex', alignItems: 'center', gap: 8, minHeight: 44, cursor: 'pointer', fontFamily: 'inherit',
        }}>
          <span style={{ width: 18, height: 18, borderRadius: '50%', background: i < toursValides(bloc, exerciseSets) ? T.vert : T.muted, color: T.blanc, fontSize: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}>
            {i < toursValides(bloc, exerciseSets) ? '✓' : ''}
          </span>
          <span style={{ fontSize: 12, color: T.texteSec, minWidth: 44 }}>Tour {i + 1}</span>
          <span style={{ fontSize: 11, color: T.texteCorps, flex: 1 }}>
            {bloc.exercices.map(e => `${e.code} ${e.unite === 'kg' ? `${fmt(tt[e.id].kg) || '—'}×${tt[e.id].reps ?? '—'}` : tt[e.id].reps ?? '—'}`).join(' · ')}
          </span>
        </button>
      )))}

      <p style={{ fontSize: 12, color: T.texteSec, textAlign: 'center', margin: '2px 0 8px' }}>
        Tour {etat.courant + 1}
        {etat.courant + 1 > bloc.tours ? ' · supplémentaire' : ` sur ${bloc.tours} prévu${bloc.tours > 1 ? 's' : ''}`}
      </p>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {bloc.exercices.map((e, i) => (
          <CarteExercice
            key={e.id}
            exercice={e}
            valeur={t[e.id]}
            pleineLargeur={impair && i === bloc.exercices.length - 1}
            onTempo={setTempo}
            onVideo={e => setVideo({ nom: e.nom, video_url: e.video_url })}
            notePrivee={notesPrivees[e.id]}
            onNotePrivee={coach && onEnregistrerNotePrivee ? ex => setNotePriveeOuverte({ exercice: ex, texte: notesPrivees[ex.id] || '', envoi: false }) : null}
            onPas={(champ, d) => majValeur(bloc, e, champ, v => {
              const ref = prescriptionEffective(e, etat.courant)
              // Case vide : la première flèche repose la valeur de référence.
              if (champ === 'kg') v.kg = v.kg === null ? ref.kg ?? 0 : Math.max(0, v.kg + d * e.pas)
              else v.reps = v.reps === null ? ref.reps ?? 1 : Math.max(0, v.reps + d * e.pas_reps)
              return v
            })}
            onSaisie={(champ, brut) => majValeur(bloc, e, champ, v => {
              const n = brut.trim() === '' ? null : parseFloat(brut.replace(',', '.'))
              const valide = n === null || Number.isNaN(n) ? null : n
              if (champ === 'kg') v.kg = valide
              else v.reps = valide === null ? null : Math.round(valide)
              return v
            })}
          />
        ))}
      </div>

      <Repos secondes={bloc.repos_sec} chrono={chrono} />

      <button type="button" onClick={() => {
        if (!enregistrerTour(bloc)) return
        setTours(p => {
          const e = p[bloc.id]
          const liste = e.courant === e.liste.length - 1 ? [...e.liste, valeursTour(bloc, e.liste.length, e.liste[e.liste.length - 1])] : e.liste
          return { ...p, [bloc.id]: { liste, courant: e.courant + 1 } }
        })
        chrono.arreter()
      }} style={{
        width: '100%', marginTop: 8, background: T.blanc, border: `1px solid ${T.bordure}`, borderRadius: 12, height: 44, fontSize: 13,
        color: T.texte, cursor: 'pointer', fontFamily: 'inherit',
      }}>
        + {etat.courant + 1 < etat.liste.length ? `Valider et passer au tour ${etat.courant + 2}` : `Ajouter le tour ${etat.courant + 2}`}
      </button>

      <button type="button" onClick={() => {
        if (!enregistrerTour(bloc)) return
        setFaits(f => ({ ...f, [bloc.id]: true }))
        chrono.arreter()
        if (derniereEtape) setFin(Date.now())
        else setIndex(index + 1)
      }} style={{
        width: '100%', marginTop: 8, background: T.bordeaux, color: T.clair, border: 'none', borderRadius: 12, height: 50, fontSize: 14,
        cursor: 'pointer', fontFamily: 'inherit',
      }}>
        {derniereEtape ? 'Terminer la séance' : `Terminer le bloc ${bloc.id}`}
      </button>
    </>
  )
}
