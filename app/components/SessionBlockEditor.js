'use client'

// Éditeur de séance "blocks", branché sur les vraies données (program_sessions/program_exercises/
// movements/circuits) — prototypé dans app/preview-session/page.js. Partagé entre le coach
// (app/programs/[athleteId]/[programId]/session/[sessionId]/page.js) et l'athlète
// (app/s/[token]/session/[sessionId]/page.js, "Séance libre" → mode Standard/Cardio) : les deux
// wrappers ne font que fournir `sessionId` et `backHref`, RLS fait le reste (un athlète ne peut
// lire/écrire que ses propres program_sessions/program_exercises, voir supabase_schema policies).
// Périmètre volontairement réduit (pas des types de séance avancés — ceux-ci restent gérés par
// l'ancien éditeur plein écran côté coach).

import { useState, useRef, useEffect, useMemo } from 'react'
import VideoListEditor from '@/app/components/VideoListEditor'
import { CIRCUIT_MODES } from '@/lib/circuitModes'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { setUnsavedChanges, hasUnsavedChanges } from '@/lib/unsavedChanges'
import { MUSCLE_GROUPS as REAL_MUSCLE_GROUPS, JOINT_GROUPS } from '@/app/components/MuscleAnatomyDiagram'
import { parseMusclesFromText } from '@/app/components/CelebrationModal'
import { isCardioMovementName, cardioMovementSortKey, PACE_BASES } from '@/lib/raceEstimates'
import { hasCardioSteps } from '@/lib/cardioSteps'
import CardioStepEditor from '@/app/components/CardioStepEditor'
import {
  X, TextB, TextItalic, LinkSimple, ListBullets, TextTSlash,
  CaretLeft, CaretRight, ArrowsDownUp, Plus, FileText, Flame, Snowflake, Barbell,
  DotsThreeVertical, PencilSimple, Info, MagnifyingGlass, Check, Timer, DotsSixVertical,
  ArrowsClockwise, Heartbeat, VideoCamera, CopySimple, Lightbulb, Target, Eye, EyeSlash, Backpack,
} from '@phosphor-icons/react'
import { SortableGroup, SortableItem } from '@/app/components/SortableItem'
import TimerConfigEditor, { defaultTimerConfig } from '@/app/components/TimerConfigEditor'

// Dupliqué depuis app/components/athlete/SessionPlayer.js (même convention que ce fichier :
// petit helper autonome plutôt qu'un import cross-fichier).
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

const BLOCK_META = {
  warmup: {
    title: 'WARMUP', badgeLabel: 'WARM UP', icon: Flame,
    namePlaceholder: 'Enter a name (e.g. upper body warm-up)',
    descriptionPlaceholder: 'Write the detailed description of the warm-up part',
  },
  cooldown: {
    title: 'COOLDOWN', badgeLabel: 'COOL DOWN', icon: Snowflake,
    namePlaceholder: 'Enter a name (e.g. upper body stretch)',
    descriptionPlaceholder: 'Write the detailed description of the cool-down / stretching part',
  },
  exercise: {
    title: 'EXERCISE', badgeLabel: 'EXERCISE', icon: Barbell,
    namePlaceholder: 'Enter a name (e.g. push day)',
    descriptionPlaceholder: 'Write the detailed description of this exercise block',
  },
  circuit: {
    title: 'CIRCUIT', badgeLabel: 'CIRCUIT', icon: ArrowsClockwise,
    namePlaceholder: 'Enter a name (e.g. push day)',
    descriptionPlaceholder: 'Write the detailed description of this exercise block',
  },
}

const REST_PRESETS = [
  { label: '30s', seconds: 30 },
  { label: '45s', seconds: 45 },
  { label: '1min', seconds: 60 },
  { label: '1min30', seconds: 90 },
  { label: '2min', seconds: 120 },
  { label: '3min', seconds: 180 },
  { label: '4min', seconds: 240 },
  { label: '5min', seconds: 300 },
]

const formatRestLabel = (seconds) => {
  const preset = REST_PRESETS.find(p => p.seconds === seconds)
  if (preset) return preset.label
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  if (m === 0) return `${s}s`
  return s === 0 ? `${m}min` : `${m}min${s}`
}

// Le champ `rest` existant en base est du texte libre saisi par le coach depuis des années
// ("90s", "1min30", "2min"...) — parsing best-effort, avec 60s de repli si le format n'est pas
// reconnu (jamais d'erreur bloquante pour autant, juste une valeur par défaut).
function parseRestToSeconds(rest) {
  if (!rest) return 60
  const str = String(rest).trim().toLowerCase()
  const minSec = str.match(/^(\d+)\s*min\s*(\d+)?/)
  if (minSec) return parseInt(minSec[1], 10) * 60 + (parseInt(minSec[2], 10) || 0)
  const secOnly = str.match(/^(\d+)\s*s(ec)?\b/)
  if (secOnly) return parseInt(secOnly[1], 10)
  const num = parseFloat(str)
  return Number.isFinite(num) ? Math.round(num) : 60
}

// Badge REST cliquable (état d'ouverture local à chaque instance — plusieurs RestDivider peuvent
// être montés pour le même bloc, voir leurs deux usages plus bas) : ouvre un petit popover de
// presets + une valeur libre en secondes, seul moyen de changer la récup depuis la suppression du
// popup à l'ajout d'exercice (commit "Supprime le détour Number of sets/Rest time").
function RestDivider({ seconds, onChange }) {
  const [open, setOpen] = useState(false)
  const [customValue, setCustomValue] = useState('')

  const applyCustom = () => {
    const n = parseInt(customValue, 10)
    if (Number.isFinite(n) && n > 0) onChange(n)
    setCustomValue('')
    setOpen(false)
  }

  return (
    <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 8, padding: '10px 2px', color: c.textMuted, fontSize: 13, fontWeight: 700 }}>
      <Timer size={16} />
      <span>REST</span>
      <button onClick={() => setOpen(v => !v)} style={{
        marginLeft: 'auto', background: c.disabledBg, borderRadius: 6, padding: '4px 12px', fontSize: 13, fontWeight: 600,
        color: c.text, border: 'none', cursor: 'pointer',
      }}>
        {formatRestLabel(seconds)}
      </button>
      {open && (
        <>
          <div onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 90 }} />
          <div style={{
            position: 'absolute', right: 0, top: '100%', marginTop: 4, background: c.bg, border: `1px solid ${c.border}`,
            borderRadius: 8, boxShadow: '0 8px 24px rgba(0,0,0,0.12)', zIndex: 100, padding: 8,
            display: 'flex', flexDirection: 'column', gap: 2, width: 160,
          }}>
            {REST_PRESETS.map(p => (
              <button key={p.seconds} onClick={() => { onChange(p.seconds); setOpen(false) }} style={{
                textAlign: 'left', padding: '6px 8px', borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: 'pointer',
                border: 'none', background: p.seconds === seconds ? c.blueBorder : 'none', color: p.seconds === seconds ? c.blue : c.text,
              }}>
                {p.label}
              </button>
            ))}
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, borderTop: `1px solid ${c.border}`, marginTop: 4, paddingTop: 6 }}>
              <input
                type="number" min="1" placeholder="Autre (s)" value={customValue}
                onChange={e => setCustomValue(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && applyCustom()}
                style={{ width: 0, flex: 1, boxSizing: 'border-box', border: `1px solid ${c.border}`, borderRadius: 6, padding: '5px 6px', fontSize: 12, outline: 'none', fontFamily: 'inherit' }}
              />
              <button onClick={applyCustom} style={{ border: 'none', background: 'none', color: c.blue, fontWeight: 700, fontSize: 12, cursor: 'pointer', padding: '4px 2px' }}>OK</button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

// --- Traduction DB -> blocks (lecture) --------------------------------------------------------

// Groupe les program_exercises consécutifs partageant le même superset_group (et block_type) en
// un seul bloc multi-exercices ; chaque ligne sans superset_group devient son propre bloc à 1
// exercice. Même logique de regroupement que la carte superset de l'ancien éditeur.
function groupExercisesIntoBlocks(rows, musclesMap = {}) {
  const groups = []
  rows.forEach(row => {
    const last = groups[groups.length - 1]
    if (last && last.block_type === row.block_type && row.superset_group && last.superset_group === row.superset_group) {
      last.rows.push(row)
    } else {
      groups.push({ block_type: row.block_type, superset_group: row.superset_group, rows: [row] })
    }
  })
  return groups.map(g => {
    const firstId = g.rows[0].id
    const setCount = Math.max(1, parseInt(g.rows[0].sets, 10) || 1)
    const sets = Array.from({ length: setCount }, (_, i) => ({ id: `set-${firstId}-${i}` }))
    const setNotes = {}
    const setValues = {}
    const paceValues = {}
    const cardioStructures = {}
    // La granularité par set est perdue côté ancien schéma (un seul `note` par exercice) : on la
    // réattache au premier set de chaque exercice (grille standard) ET sous une clé "note:<ex>"
    // dédiée (vue cardio, pas de grille de sets) pour ne pas la perdre silencieusement.
    g.rows.forEach(r => {
      const exId = `ex-${r.id}`
      if (r.note) {
        setNotes[`${sets[0].id}:${exId}`] = r.note
        setNotes[`note:${exId}`] = r.note
      }
      // set_details : reps/kg par set, index-aligné sur `sets` (voir flattenBlocksToExerciseRows).
      if (Array.isArray(r.set_details)) {
        r.set_details.forEach((d, i) => {
          const set = sets[i]
          if (set && d && (d.reps || d.kg != null || d.tempo)) {
            setValues[`${set.id}:${exId}`] = { reps: d.reps || '', kg: d.kg != null ? String(d.kg) : '', tempo: d.tempo || '' }
          }
        })
      }
      if (r.pace_base || r.pct_low != null || r.pct_high != null) {
        paceValues[exId] = { base: r.pace_base || '', pctLow: r.pct_low ?? '', pctHigh: r.pct_high ?? '' }
      }
      if (hasCardioSteps(r.cardio_structure)) {
        cardioStructures[exId] = r.cardio_structure
      }
    })
    return {
      id: `block-${firstId}`,
      // block_type n'est écrit que par cet éditeur : les exercices venus d'une copie
      // (assignation, libre-service, cloneTemplateToAthlete), de l'ancien éditeur ou de la route
      // free-session/exercise l'ont à null. Sans ce repli, BLOCK_META[null].icon lève et l'éditeur
      // s'ouvre sur un écran blanc.
      type: g.block_type || 'exercise',
      name: '', description: '', note: '',
      exercises: g.rows.map(r => ({
        id: `ex-${r.id}`, name: r.name,
        muscles: musclesMap[r.name.trim().toLowerCase()] || '',
        focus_muscles: r.focus_muscles || '',
        materiel: r.materiel || '',
      })),
      sets,
      restSeconds: parseRestToSeconds(g.rows[0].rest),
      setNotes,
      setValues,
      paceValues,
      cardioStructures,
      // Timer lié au bloc entier (superset compris) : porté par le premier exercice du bloc
      // côté program_exercises.timer_config, même colonne que l'ancien éditeur plein écran —
      // voir flattenBlocksToExerciseRows pour l'écriture symétrique.
      timerConfig: g.rows[0].timer_config || null,
    }
  })
}

function toCircuitBlock(circuit) {
  return {
    id: `circuit-${circuit.id}`,
    dbCircuitId: circuit.id,
    type: 'circuit',
    name: circuit.name || '', description: '', note: '',
    exercises: [], sets: [], restSeconds: 60,
    circuitNote: circuit.text || '',
    // videos et result_mode existaient dans la forme du jsonb mais n'étaient ni relus ni écrits :
    // le champ vidéo restait vide quoi qu'il arrive, et l'espace sportif lisait un result_mode que
    // rien ne renseignait.
    circuitVideos: circuit.videos || [],
    circuitResultMode: circuit.result_mode || null,
  }
}

// Réinsère les circuits (stockés à part dans program_sessions.circuits, positionnés par
// afterExerciseIndex sur la liste APLATIE des program_exercises) dans le tableau `blocks` déjà
// groupé — à la position du bloc juste après l'exercice visé.
function insertCircuits(exerciseBlocks, circuits) {
  if (!circuits?.length) return exerciseBlocks
  const boundaries = []
  let total = 0
  exerciseBlocks.forEach(b => { total += b.exercises.length; boundaries.push(total) })

  const byInsertIndex = new Map()
  circuits.forEach(circuit => {
    const after = circuit.afterExerciseIndex ?? 0
    let insertIndex = boundaries.findIndex(b => after <= b)
    insertIndex = insertIndex === -1 ? exerciseBlocks.length : insertIndex + 1
    if (after <= 0) insertIndex = 0
    byInsertIndex.set(insertIndex, [...(byInsertIndex.get(insertIndex) || []), toCircuitBlock(circuit)])
  })

  const result = [...(byInsertIndex.get(0) || [])]
  exerciseBlocks.forEach((b, i) => {
    result.push(b)
    const at = i + 1
    if (byInsertIndex.has(at)) result.push(...byInsertIndex.get(at))
  })
  return result
}

// Nom/description/notes d'un bloc warmup ou cooldown vivent à part (program_sessions.warmup_block /
// .cooldown_block, voir handleSave) car ces blocs n'ont pas forcément d'exercice — flattenBlocksToExerciseRows
// ignore tout bloc sans exercice, donc rien à raccrocher dans program_exercises pour eux. On les
// réinjecte ici : sur un bloc déjà présent (créé via "Create from library") ou, s'il n'y en a pas
// encore, en synthétisant un bloc vide à la bonne position (warmup en tête, cooldown en fin — comme
// addWarmupBlock/addCooldownBlock).
function applyBlockMeta(blocks, type, meta, position) {
  const idx = blocks.findIndex(b => b.type === type)
  if (idx !== -1) {
    if (!meta) return blocks
    const next = [...blocks]
    next[idx] = { ...next[idx], name: meta.name || '', description: meta.description || '', note: meta.note || '' }
    return next
  }
  if (!meta) return blocks
  const newBlock = {
    id: `${type}-meta`, type, name: meta.name || '', description: meta.description || '', note: meta.note || '',
    exercises: [], sets: [], restSeconds: 60,
  }
  return position === 'prepend' ? [newBlock, ...blocks] : [...blocks, newBlock]
}

function buildBlocksFromDb(exerciseRows, circuits, warmupMeta, cooldownMeta, musclesMap = {}) {
  let blocks = insertCircuits(groupExercisesIntoBlocks(exerciseRows, musclesMap), circuits || [])
  blocks = applyBlockMeta(blocks, 'warmup', warmupMeta, 'prepend')
  blocks = applyBlockMeta(blocks, 'cooldown', cooldownMeta, 'append')
  return blocks
}

// --- Traduction blocks -> DB (écriture) -------------------------------------------------------

function flattenBlocksToExerciseRows(blocks, activityMode) {
  const rows = []
  const isCardio = activityMode === 'cardio'
  blocks.forEach(block => {
    if (block.type === 'circuit' || !block.exercises?.length) return
    const supersetToken = block.exercises.length > 1 ? Math.random().toString(36).slice(2, 8) : null
    block.exercises.forEach((ex, exIndex) => {
      // Timer lié au bloc entier : porté uniquement par le premier exercice de la ligne
      // program_exercises (superset compris) — voir groupExercisesIntoBlocks pour la lecture
      // symétrique. Les autres exercices du même bloc restent à null pour ne pas dupliquer/désync.
      const timer_config = exIndex === 0 ? (block.timerConfig || null) : null
      if (isCardio) {
        // Pas de grille de sets en mode cardio (allure réglée en % VMA/Seuil/Δ, pas en séries) —
        // une seule note et un seul couple base/%low-%high par exercice, voir updatePaceValue.
        const pace = block.paceValues?.[ex.id] || {}
        rows.push({
          block_type: block.type,
          name: ex.name,
          sets: null,
          rest: null,
          note: block.setNotes?.[`note:${ex.id}`] || null,
          materiel: ex.materiel || null,
          superset_group: supersetToken,
          pace_base: pace.base || null,
          pct_low: pace.pctLow !== '' && pace.pctLow != null ? parseFloat(pace.pctLow) : null,
          pct_high: pace.pctHigh !== '' && pace.pctHigh != null ? parseFloat(pace.pctHigh) : null,
          set_details: null,
          timer_config,
          focus_muscles: ex.focus_muscles || null,
          cardio_structure: block.cardioStructures?.[ex.id] || null,
        })
      } else {
        // addSet recopie la note du set précédent sur le nouveau set (voir plus haut) : sans
        // dédoublonnage ici, une note laissée identique d'un set à l'autre serait répétée autant
        // de fois que de sets dans le texte final vu par l'athlète.
        const notes = [...new Set(
          (block.sets || [])
            .map(s => block.setNotes?.[`${s.id}:${ex.id}`])
            .filter(Boolean)
        )]
        // Reps/kg gardent leur granularité par set (contrairement à `note` ci-dessus, fusionnée
        // en une seule chaîne) : un tableau index-aligné sur `sets`, relu par groupExercisesIntoBlocks.
        const setDetails = (block.sets || []).map(s => {
          const v = block.setValues?.[`${s.id}:${ex.id}`]
          return {
            reps: v?.reps || null,
            kg: v?.kg !== '' && v?.kg != null ? parseFloat(v.kg) : null,
            tempo: v?.tempo || null,
          }
        })
        rows.push({
          block_type: block.type,
          name: ex.name,
          sets: block.sets?.length || 1,
          rest: formatRestLabel(block.restSeconds ?? 60),
          note: notes.length ? notes.join(' / ') : null,
          materiel: ex.materiel || null,
          superset_group: supersetToken,
          pace_base: null,
          pct_low: null,
          pct_high: null,
          cardio_structure: null,
          set_details: setDetails.some(d => d.reps || d.kg != null || d.tempo) ? setDetails : null,
          timer_config,
          focus_muscles: ex.focus_muscles || null,
        })
      }
    })
  })
  return rows
}

function flattenBlocksToCircuits(blocks) {
  const circuits = []
  let cursor = 0
  blocks.forEach(block => {
    if (block.type === 'circuit') {
      circuits.push({
        id: block.dbCircuitId || `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        name: block.name || '',
        text: block.circuitNote || '',
        videos: block.circuitVideos || [],
        result_mode: block.circuitResultMode || null,
        afterExerciseIndex: cursor,
      })
    } else {
      cursor += block.exercises?.length || 0
    }
  })
  return circuits
}

// Contrepartie écriture de applyBlockMeta : null si le bloc n'existe pas ou est resté entièrement
// vide, pour ne pas polluer program_sessions.warmup_block/cooldown_block avec des lignes {"","",""}.
function extractBlockMeta(blocks, type) {
  const b = blocks.find(x => x.type === type)
  if (!b) return null
  const meta = { name: b.name || '', description: b.description || '', note: b.note || '' }
  return (meta.name || meta.description || meta.note) ? meta : null
}

// Charte graphique OSTRYK (app/globals.css) — même palette que le prototype visuel
// (app/preview-session/page.js, commit "Remet la page séance aux couleurs OSTRYK") : cette version
// branchée sur les vraies données n'avait pas encore reçu cette passe. `blue` reste le nom du token
// en interne (repris partout dans ce fichier pour l'accent primaire) mais résout vers --green.
const c = {
  bg: 'var(--bg)',
  border: 'var(--border)',
  borderDashed: 'var(--border2)',
  text: 'var(--text)',
  textMuted: 'var(--text2)',
  textFaint: 'var(--text3)',
  blue: 'var(--green)',
  blueBorder: 'var(--green-light)',
  disabled: 'var(--text3)',
  disabledBg: 'var(--bg2)',
  title: 'var(--title)',
}

const label = { fontSize: 13, color: c.text, marginBottom: 6, display: 'block' }
const input = {
  boxSizing: 'border-box', width: '100%', padding: '9px 12px', border: `1px solid ${c.border}`,
  borderRadius: 'var(--r)', fontSize: 14, color: c.text, outline: 'none', background: c.bg, fontFamily: 'inherit',
}

// onClose (optionnel) : quand ce composant est monté comme un panneau parmi d'autres (vue côte à
// côte, voir app/programs/.../page.js) plutôt que comme une page à part entière, fermer CE panneau
// ne doit pas naviguer loin des autres — le parent décide alors quoi faire (retirer le panneau).
// Sans onClose, comportement page normale : navigation vers backHref.
export default function SessionBlockEditor({ sessionId, backHref, canManageCatalog = true, onClose }) {
  const router = useRouter()

  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [saving, setSaving] = useState(false)
  const [savedFlash, setSavedFlash] = useState(false)

  const [sessionTitle, setSessionTitle] = useState('')
  const [description, setDescription] = useState('')
  const [sessionType, setSessionType] = useState(null)
  // Séance "explication" (session_type: 'explication', porté depuis l'ancien éditeur plein
  // écran) : juste une note (réutilise `description`) + un lien vidéo, pas d'exercices — pour
  // un coach qui veut expliquer un programme sans prescrire de contenu. Le lien vidéo réutilise
  // program_sessions.activation_videos (même convention détournée que l'ancien éditeur, pas de
  // colonne dédiée) : un tableau à un seul élément { name: 'Vidéo', video_url }.
  const [explicationVideo, setExplicationVideo] = useState('')
  const [activityMode, setActivityMode] = useState('standard')
  const [recurringTarget, setRecurringTarget] = useState(1)
  const [materiel, setMateriel] = useState('')
  // hidden_until_run : programmes de groupe uniquement (isGroupProgram, résolu via la jointure
  // programs(group_id) au chargement) — porté depuis l'ancien éditeur plein écran (page.js:2124-2137).
  const [hiddenUntilRun, setHiddenUntilRun] = useState(false)
  const [isGroupProgram, setIsGroupProgram] = useState(false)
  const [movementsList, setMovementsList] = useState([]) // [{ id, name, muscles }]

  // Timer de séance (program_sessions.timer_config) — distinct des timers par bloc, qui vivent
  // sur `block.timerConfig` (voir groupExercisesIntoBlocks/flattenBlocksToExerciseRows, stockés
  // sur le premier exercice du bloc côté program_exercises.timer_config, même colonne que
  // l'ancien éditeur plein écran). timerEditor : null | { scope: 'session' | 'block' }.
  const [sessionTimerConfig, setSessionTimerConfig] = useState(null)
  const [timerEditor, setTimerEditor] = useState(null)
  const [timerDraft, setTimerDraft] = useState(null)

  const [addMenuOpen, setAddMenuOpen] = useState(false)
  const [blockMenuOpen, setBlockMenuOpen] = useState(false)
  const [blocks, setBlocks] = useState([])
  const [exercisesModalOpen, setExercisesModalOpen] = useState(false)
  const [exerciseSearch, setExerciseSearch] = useState('')
  const [selectedMuscles, setSelectedMuscles] = useState([])
  const [selectedJoints, setSelectedJoints] = useState([])
  // Détour "nombre de séries" puis "temps de récup" à la toute première sélection d'un exercice —
  // coach uniquement (canManageCatalog), voir plus bas. Le sportif en "Séance libre" (canManageCatalog
  // false) et l'ajout d'un exercice suivant en superset (addingSecondaryExercise) gardent l'ajout
  // direct avec 1 série de base.
  const [configStep, setConfigStep] = useState(null) // null | 'sets' | 'rest'
  const [pendingExercise, setPendingExercise] = useState(null)
  const [pendingSets, setPendingSets] = useState(3)
  const [pendingRest, setPendingRest] = useState(60)
  const [addingSecondaryExercise, setAddingSecondaryExercise] = useState(false)
  const [replacingExerciseId, setReplacingExerciseId] = useState(null)
  const [exerciseMenuOpenId, setExerciseMenuOpenId] = useState(null)
  const [pendingCircuitExercises, setPendingCircuitExercises] = useState([])
  // Focus muscles par exercice — porté depuis l'ancien éditeur plein écran (page.js:2419-2533).
  // Le focus vit sur le mouvement du catalogue (movements.focus_groups, partagé entre toutes ses
  // utilisations) plutôt que sur cet exercice précis : cohérent avec la détection auto déjà en
  // place ailleurs (parseMusclesFromText sur movements.muscles), et évite d'avoir à re-choisir le
  // focus à chaque fois qu'on reprend le même mouvement dans une autre séance.
  const [movementMusclesMap, setMovementMusclesMap] = useState({})
  const [movementFocusGroupsMap, setMovementFocusGroupsMap] = useState({})
  const [focusPickerExerciseId, setFocusPickerExerciseId] = useState(null)
  // Matériel par exercice — propre à CETTE séance (contrairement au focus, pas de catalogue
  // partagé à mettre à jour) : un simple champ texte sur l'exercice, écrit directement dans
  // program_exercises.materiel par flattenBlocksToExerciseRows. Regroupé avec le champ matériel
  // de session dans l'encart du haut (cf. le calcul de exercisesWithMateriel).
  const [materielPickerExerciseId, setMaterielPickerExerciseId] = useState(null)
  const [draftMateriel, setDraftMateriel] = useState('')
  // Modale "Advanced settings" (coach uniquement, canManageCatalog) — édite muscles/vidéo du
  // mouvement (catalogue partagé `movements`, retrouvé par nom comme le reste de ce fichier), pas
  // une donnée propre à cette séance : écrit directement en base à la sauvegarde, sans passer par
  // handleSave/setUnsavedChanges (program_exercises ne porte ni muscles ni vidéo).
  const [advancedSettingsExerciseId, setAdvancedSettingsExerciseId] = useState(null)
  const [advancedDraftMuscles, setAdvancedDraftMuscles] = useState([])
  const [advancedDraftVideoUrl, setAdvancedDraftVideoUrl] = useState('')
  const [savingAdvancedSettings, setSavingAdvancedSettings] = useState(false)
  // Exercice cardio dont l'éditeur de steps détaillé (CardioStepEditor) est déplié — un seul à la
  // fois, repliés par défaut pour ne pas alourdir la vue quand la structure simple (base+%) suffit.
  const [cardioStepEditorExId, setCardioStepEditorExId] = useState(null)
  // Création rapide d'un mouvement absent du catalogue, depuis la modale Exercises elle-même
  // (coach uniquement, canManageCatalog) — voir createMovement plus bas.
  const [createMovementOpen, setCreateMovementOpen] = useState(false)
  const [newMovementName, setNewMovementName] = useState('')
  const [newMovementMuscles, setNewMovementMuscles] = useState([])
  const [newMovementJoints, setNewMovementJoints] = useState([])
  const [newMovementVideoUrl, setNewMovementVideoUrl] = useState('')
  const [creatingMovement, setCreatingMovement] = useState(false)
  // Sélection par id (pas par index) : un glisser-déposer des blocs (voir moveBlock/orderMode
  // plus bas) peut réordonner le tableau `blocks` en plusieurs étapes synchrones avant tout
  // re-render — un index resterait figé sur une position pendant que son contenu change sous lui.
  // L'id, lui, continue de désigner le même bloc quel que soit son nouvel index.
  const [activeBlockId, setActiveBlockId] = useState(null)
  const [orderMode, setOrderMode] = useState(false)
  const [descModalOpen, setDescModalOpen] = useState(false)
  const [draftName, setDraftName] = useState('')
  const [draftDescription, setDraftDescription] = useState('')
  const [draftNote, setDraftNote] = useState('')
  const [activationPresets, setActivationPresets] = useState(null) // null = pas encore chargé
  const [presetsMenuOpen, setPresetsMenuOpen] = useState(false)
  const [warmupLibraryOpen, setWarmupLibraryOpen] = useState(false)
  const [mentionQuery, setMentionQuery] = useState(null)
  const [mentionRange, setMentionRange] = useState(null)
  const [notesModalOpen, setNotesModalOpen] = useState(false)
  const [draftSetNote, setDraftSetNote] = useState('')
  const [applyNoteToNextSets, setApplyNoteToNextSets] = useState(false)
  const [activeNoteContext, setActiveNoteContext] = useState(null)
  const [videoModalExercise, setVideoModalExercise] = useState(null)
  // Popover "Dupliquer" ouvert sur une cellule reps/kg (setCellKey), voir copySetValueToNextSet /
  // copySetValueToAllSets — un seul à la fois, comme les autres popovers de ce fichier (RestDivider).
  const [copyMenuOpenKey, setCopyMenuOpenKey] = useState(null)
  const descriptionRef = useRef(null)
  const descriptionBackdropRef = useRef(null)
  const blockIdCounter = useRef(0)

  const nextBlockId = () => {
    blockIdCounter.current += 1
    return `new-${blockIdCounter.current}`
  }

  // Chargement initial : séance + exercices + circuits. Une seule fois au montage (l'édition
  // ensuite reste locale jusqu'au clic sur Save, comme l'ancien éditeur). La bibliothèque de
  // mouvements, elle, est cherchée à la demande (voir l'effet plus bas) — la table dépasse
  // largement une page fixe (400+ lignes chez ce coach), donc une recherche serveur en direct,
  // comme le fait déjà l'ancien éditeur, est nécessaire pour ne pas rendre certains mouvements
  // introuvables selon leur ordre alphabétique.
  useEffect(() => {
    let cancelled = false
    async function load() {
      const [{ data: sessionRow }, { data: exerciseRows }, { data: movs }] = await Promise.all([
        supabase.from('program_sessions').select('id, title, coach_notes, circuits, session_type, recurring_daily_target, activity_mode, warmup_block, cooldown_block, timer_config, activation_videos, materiel, hidden_until_run, programs(group_id)').eq('id', sessionId).single(),
        supabase.from('program_exercises').select('id, order_index, name, sets, rest, note, materiel, superset_group, block_type, pace_base, pct_low, pct_high, set_details, timer_config, focus_muscles, cardio_structure').eq('program_session_id', sessionId).order('order_index'),
        // Bibliothèque récupérée en entier (petit volume) plutôt que filtrée par nom — sensible à
        // la casse côté Postgres, raterait silencieusement un nom mal accordé. Même approche que
        // l'ancien éditeur plein écran (page.js:629-638).
        supabase.from('movements').select('name, muscles, focus_groups'),
      ])
      if (cancelled) return
      if (!sessionRow) {
        setNotFound(true)
        setLoading(false)
        return
      }
      setSessionTitle(sessionRow.title || '')
      setDescription(sessionRow.coach_notes || '')
      setSessionType(sessionRow.session_type || null)
      setActivityMode(sessionRow.activity_mode || 'standard')
      setRecurringTarget(sessionRow.recurring_daily_target || 1)
      setSessionTimerConfig(sessionRow.timer_config || null)
      setExplicationVideo(sessionRow.activation_videos?.[0]?.video_url || '')
      setMateriel(sessionRow.materiel || '')
      setHiddenUntilRun(!!sessionRow.hidden_until_run)
      setIsGroupProgram(!!sessionRow.programs?.group_id)
      const musclesMap = {}, focusMap = {}
      ;(movs || []).forEach(m => {
        if (m.muscles) musclesMap[m.name.trim().toLowerCase()] = m.muscles
        if (m.focus_groups) focusMap[m.name.trim().toLowerCase()] = m.focus_groups
      })
      setMovementMusclesMap(musclesMap)
      setMovementFocusGroupsMap(focusMap)
      const builtBlocks = buildBlocksFromDb(exerciseRows || [], sessionRow.circuits || [], sessionRow.warmup_block || null, sessionRow.cooldown_block || null, musclesMap)
      setBlocks(builtBlocks)
      if (builtBlocks.length) setActiveBlockId(builtBlocks[0].id)
      setAddMenuOpen((exerciseRows || []).length === 0 && !(sessionRow.circuits || []).length)
      setLoading(false)
    }
    load()
    return () => { cancelled = true }
  }, [sessionId])

  // Recherche de mouvements côté serveur (débounced), tant que la modale Exercises OU l'autocomplete
  // "#mention" de la modale Description est active — pas de fetch fixe : la bibliothèque de
  // mouvements peut dépasser largement une seule page. mentionQuery !== null couvre à la fois le
  // clic sur "+ Exercises" (ouvre l'autocomplete avec une requête vide) et la frappe de "#" dans le
  // texte : sans ce déclencheur, movementsList restait vide dans la modale Description et ni le
  // bouton ni le "#" ne proposaient jamais rien.
  const mentionActive = mentionQuery !== null
  useEffect(() => {
    if (!exercisesModalOpen && !mentionActive) return
    let cancelled = false
    const isCardio = activityMode === 'cardio'
    const searchTerm = exercisesModalOpen ? exerciseSearch : (mentionQuery || '')
    const timer = setTimeout(async () => {
      // En mode cardio, le filtre Run/Row/Ski Erg/Bike (voir isCardioMovementName) s'applique
      // après coup en JS : il faut donc charger toute la bibliothèque (400+ mouvements chez ce
      // coach) plutôt que les 100 premiers par ordre alphabétique, sous peine de couper avant
      // d'atteindre "Run EF" etc. si aucun texte de recherche ne réduit déjà la liste.
      let query = supabase.from('movements').select('id, name, muscles, joints, video_url, youtube_url').order('name').limit(isCardio ? 2000 : 100)
      if (searchTerm.trim()) query = query.ilike('name', `%${searchTerm.trim()}%`)
      if (selectedMuscles.length > 0 && !isCardio && exercisesModalOpen) {
        query = query.or(selectedMuscles.map(m => `muscles.ilike.%${m}%`).join(','))
      }
      if (selectedJoints.length > 0 && !isCardio && exercisesModalOpen) {
        query = query.or(selectedJoints.map(j => `joints.ilike.%${j}%`).join(','))
      }
      const { data } = await query
      if (cancelled) return
      let list = (data || []).map(m => ({ id: m.id, name: m.name, muscles: m.muscles || '', joints: m.joints || '', videoUrl: m.video_url || m.youtube_url || '' }))
      if (isCardio) {
        list = list.filter(m => isCardioMovementName(m.name))
          .sort((a, b) => cardioMovementSortKey(a.name) - cardioMovementSortKey(b.name))
          .slice(0, 100)
      }
      setMovementsList(list)
    }, 250)
    return () => { cancelled = true; clearTimeout(timer) }
  }, [exercisesModalOpen, exerciseSearch, selectedMuscles, selectedJoints, activityMode, mentionActive, mentionQuery])

  // Bibliothèque d'activations pré-construites (app/library/activations) — chargée une seule fois,
  // à la première ouverture de la modale Description OU du picker "Create from library" d'un bloc
  // warmup/cooldown (voir openExercisePickerForBlock), pas à chaque frappe (contrairement aux
  // mouvements ci-dessus) : la liste est courte (protocoles créés à la main par le coach), pas
  // besoin de recherche serveur. Coach uniquement (canManageCatalog) : un athlète en "Séance libre"
  // n'a pas de bibliothèque d'activations à piocher.
  useEffect(() => {
    if ((!descModalOpen && !warmupLibraryOpen) || !canManageCatalog || activationPresets !== null) return
    let cancelled = false
    async function loadPresets() {
      const [{ data: presets }, { data: hidden }] = await Promise.all([
        supabase.from('activation_presets').select('id, name, text, note, videos, coach_id').order('name'),
        supabase.from('coach_hidden_content').select('content_id').eq('content_type', 'activation_preset'),
      ])
      if (cancelled) return
      const hiddenIds = new Set((hidden || []).map(r => r.content_id))
      setActivationPresets((presets || []).filter(p => !hiddenIds.has(p.id)))
    }
    loadPresets()
    return () => { cancelled = true }
  }, [descModalOpen, warmupLibraryOpen, canManageCatalog, activationPresets])

  useEffect(() => {
    const handler = (e) => {
      if (!hasUnsavedChanges()) return
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [])

  useEffect(() => () => setUnsavedChanges(false), [])

  const goBack = () => {
    if (hasUnsavedChanges() && !window.confirm('Tu as des modifications non sauvegardées sur cette page. Les quitter sans enregistrer ?')) return
    if (onClose) { onClose(); return }
    // On revient à la page précédente réelle (dashboard, liste de séances...) plutôt que de forcer
    // systématiquement le calendrier du programme — backHref ne sert que de filet si cette page a
    // été ouverte directement (lien externe, rechargement) et qu'il n'y a rien à "back" dans l'historique.
    if (typeof window !== 'undefined' && window.history.length > 1) {
      router.back()
    } else {
      router.replace(backHref)
    }
  }

  const handleSave = async () => {
    if (saving) return
    setSaving(true)
    try {
      const rows = flattenBlocksToExerciseRows(blocks, activityMode)
      const { data: existingRows } = await supabase
        .from('program_exercises')
        .select('id')
        .eq('program_session_id', sessionId)
        .order('order_index')
      const existingIds = (existingRows || []).map(r => r.id)
      const maxLen = Math.max(existingIds.length, rows.length)
      for (let i = 0; i < maxLen; i++) {
        const row = rows[i]
        const existingId = existingIds[i]
        if (row && existingId) {
          await supabase.from('program_exercises').update({ ...row, order_index: i }).eq('id', existingId)
        } else if (row && !existingId) {
          await supabase.from('program_exercises').insert({ ...row, order_index: i, program_session_id: sessionId })
        } else if (!row && existingId) {
          await supabase.from('program_exercises').delete().eq('id', existingId)
        }
      }

      await supabase.from('program_sessions')
        .update({
          title: sessionTitle, coach_notes: description, circuits: flattenBlocksToCircuits(blocks),
          warmup_block: extractBlockMeta(blocks, 'warmup'), cooldown_block: extractBlockMeta(blocks, 'cooldown'),
          timer_config: sessionTimerConfig,
          activity_mode: activityMode,
          materiel: materiel.trim() || null,
          ...(isGroupProgram ? { hidden_until_run: hiddenUntilRun } : {}),
          session_type: sessionType, recurring_daily_target: sessionType === 'recurrent' ? recurringTarget : null,
          // Récurrente = hors calendrier : jamais de semaine/jour, même si la séance en avait un
          // avant (créée via une case du calendrier puis basculée en récurrente après coup).
          ...(sessionType === 'recurrent' ? { week_number: null, day_of_week: null } : {}),
          // N'écrit activation_videos que pour une séance "explication" — ailleurs ce champ
          // n'est pas géré par cet éditeur, pas de raison de l'écraser.
          ...(sessionType === 'explication' ? { activation_videos: explicationVideo.trim() ? [{ name: 'Vidéo', video_url: explicationVideo.trim() }] : [] } : {}),
        })
        .eq('id', sessionId)

      // Écriture dans le catalogue partagé réservée au coach (RLS) — un athlète ne choisit de
      // toute façon que parmi les mouvements déjà existants ici (pas de "Create <name>"), donc
      // cet upsert n'a rien à faire côté athlète et provoquerait juste un 403 RLS silencieux.
      const names = [...new Set(rows.map(r => r.name).filter(Boolean))]
      if (canManageCatalog && names.length) {
        await supabase.from('movements').upsert(names.map(name => ({ name })), { onConflict: 'name', ignoreDuplicates: true })
      }

      setUnsavedChanges(false)
      setSavedFlash(true)
      setTimeout(() => setSavedFlash(false), 2000)
    } finally {
      setSaving(false)
    }
  }

  const addWarmupBlock = () => {
    const existing = blocks.find(b => b.type === 'warmup')
    if (existing) {
      setActiveBlockId(existing.id)
    } else {
      const newBlock = { id: nextBlockId(), type: 'warmup', name: '', description: '', note: '' }
      setBlocks([newBlock, ...blocks])
      setActiveBlockId(newBlock.id)
    }
    setUnsavedChanges(true)
    setAddMenuOpen(false)
  }

  const addCooldownBlock = () => {
    const existing = blocks.find(b => b.type === 'cooldown')
    if (existing) {
      setActiveBlockId(existing.id)
    } else {
      const newBlock = { id: nextBlockId(), type: 'cooldown', name: '', description: '', note: '' }
      setBlocks([...blocks, newBlock])
      setActiveBlockId(newBlock.id)
    }
    setUnsavedChanges(true)
    setAddMenuOpen(false)
  }

  const addExerciseLikeBlock = (type) => {
    const cooldownIndex = blocks.findIndex(b => b.type === 'cooldown')
    const insertAt = cooldownIndex === -1 ? blocks.length : cooldownIndex
    const newBlock = { id: nextBlockId(), type, name: '', description: '', note: '' }
    setBlocks([...blocks.slice(0, insertAt), newBlock, ...blocks.slice(insertAt)])
    setActiveBlockId(newBlock.id)
    setUnsavedChanges(true)
    setAddMenuOpen(false)
    setAddingSecondaryExercise(false)
    setPendingCircuitExercises([])
    setExercisesModalOpen(true)
  }

  const addExerciseBlock = () => addExerciseLikeBlock('exercise')
  const addCircuitBlock = () => addExerciseLikeBlock('circuit')

  const removeBlock = (index) => {
    const newBlocks = blocks.filter((_, i) => i !== index)
    setBlocks(newBlocks)
    setActiveBlockId(newBlocks[Math.min(index, newBlocks.length - 1)]?.id ?? null)
    setUnsavedChanges(true)
  }

  // Duplique le bloc avec de nouveaux id (bloc, exercices, sets) — jamais les mêmes que
  // l'original, sinon les clés de setNotes/setValues/paceValues (indexées par ces id) et les clés
  // React `key` se retrouveraient partagées entre les deux blocs. dbCircuitId est délibérément
  // abandonné : un bloc circuit dupliqué doit créer sa propre ligne `circuits` à la sauvegarde,
  // pas réutiliser celle de l'original.
  const duplicateBlock = (index) => {
    const original = blocks[index]
    if (!original) return

    const exerciseIdMap = new Map()
    const exercises = (original.exercises || []).map(ex => {
      const newId = nextBlockId()
      exerciseIdMap.set(ex.id, newId)
      return { ...ex, id: newId }
    })
    const setIdMap = new Map()
    const sets = (original.sets || []).map(s => {
      const newId = nextBlockId()
      setIdMap.set(s.id, newId)
      return { ...s, id: newId }
    })
    const remapRecord = (record) => {
      const out = {}
      Object.entries(record || {}).forEach(([key, value]) => {
        const [setPart, exPart] = key.split(':')
        out[`${setIdMap.get(setPart) ?? setPart}:${exerciseIdMap.get(exPart) ?? exPart}`] = value
      })
      return out
    }
    const paceValues = {}
    Object.entries(original.paceValues || {}).forEach(([exId, value]) => {
      paceValues[exerciseIdMap.get(exId) ?? exId] = value
    })
    const cardioStructures = {}
    Object.entries(original.cardioStructures || {}).forEach(([exId, value]) => {
      cardioStructures[exerciseIdMap.get(exId) ?? exId] = value
    })

    const duplicate = {
      ...original,
      id: nextBlockId(),
      dbCircuitId: undefined,
      exercises,
      sets,
      setNotes: remapRecord(original.setNotes),
      setValues: remapRecord(original.setValues),
      paceValues,
      cardioStructures,
    }

    setBlocks([...blocks.slice(0, index + 1), duplicate, ...blocks.slice(index + 1)])
    setActiveBlockId(duplicate.id)
    setUnsavedChanges(true)
  }

  // Dérivé de activeBlockId (voir sa déclaration) plutôt que stocké directement.
  const activeBlockIndex = blocks.findIndex(b => b.id === activeBlockId)
  const activeBlock = blocks[activeBlockIndex] ?? null
  // Un même exercice (id) n'existe que dans un seul bloc, mais la modale Advanced settings est
  // déclenchée depuis la grille des sets sans y garder de référence directe à son bloc parent.
  const advancedSettingsExercise = advancedSettingsExerciseId
    ? blocks.flatMap(b => b.exercises || []).find(e => e.id === advancedSettingsExerciseId) ?? null
    : null

  // Glisser-déposer des cercles de navigation pour réordonner les blocs (actif seulement en mode
  // Order — hors de ce mode, un tap sur un cercle sert à naviguer, pas à déplacer). Même contrat
  // que moveExercise : résout l'index courant par id à l'intérieur du functional updater, jamais
  // via un index capturé à l'extérieur — un glisser sur plusieurs crans déclenche plusieurs appels
  // synchrones avant le prochain rendu (voir SortableGroup).
  const moveBlock = (blockId, dir) => {
    setBlocks(prev => {
      const idx = prev.findIndex(b => b.id === blockId)
      const newIdx = idx + dir
      if (idx === -1 || newIdx < 0 || newIdx >= prev.length) return prev
      const newBlocks = [...prev]
      const [item] = newBlocks.splice(idx, 1)
      newBlocks.splice(newIdx, 0, item)
      return newBlocks
    })
    setUnsavedChanges(true)
  }
  const isCircuitBlock = activeBlock?.type === 'circuit'

  const majCircuit = (champs) => {
    setBlocks(blocks.map((b, i) => (i === activeBlockIndex ? { ...b, ...champs } : b)))
    setUnsavedChanges(true)
  }

  const openDescModal = () => {
    if (!activeBlock) return
    setDraftName(activeBlock.name)
    setDraftDescription(activeBlock.description)
    setDraftNote(activeBlock.note)
    setMentionQuery(null)
    setMentionRange(null)
    setDescModalOpen(true)
    requestAnimationFrame(resizeDescriptionTextarea)
  }

  const closeDescModal = () => {
    setDescModalOpen(false)
    setMentionQuery(null)
    setMentionRange(null)
    setPresetsMenuOpen(false)
  }

  // Insère un protocole d'activation pré-construit (bibliothèque coach, voir app/library/activations)
  // — ajoute plutôt qu'écrase : un coach compose parfois une activation à partir de plusieurs
  // protocoles (ex. mobilité épaule + activation genou), donc le nom ne remplace le champ que s'il
  // est vide et le texte s'ajoute à la suite de ce qui est déjà écrit.
  const applyPreset = (preset) => {
    setDraftName(prev => prev || preset.name)
    setDraftDescription(prev => (prev ? `${prev}\n\n${preset.text || ''}` : (preset.text || '')))
    if (preset.note) setDraftNote(prev => (prev ? `${prev}\n\n${preset.note}` : preset.note))
    setPresetsMenuOpen(false)
    setUnsavedChanges(true)
    requestAnimationFrame(resizeDescriptionTextarea)
  }

  const confirmDescModal = () => {
    setBlocks(blocks.map((b, i) => (
      i === activeBlockIndex ? { ...b, name: draftName, description: draftDescription, note: draftNote } : b
    )))
    setUnsavedChanges(true)
    closeDescModal()
  }

  // Timer de séance / timer de bloc — config seulement ici (EMOM/AMRAP/TABATA/Perso, voir
  // TimerConfigEditor) : le lancement réel (vue split timer/séance) se fait à l'exécution de la
  // séance (app/s/[token]/page.js, session groupe...), pas dans ce builder.
  const openSessionTimerEditor = () => {
    setTimerDraft(sessionTimerConfig || defaultTimerConfig())
    setTimerEditor({ scope: 'session' })
  }

  const openBlockTimerEditor = () => {
    if (!activeBlock) return
    setTimerDraft(activeBlock.timerConfig || defaultTimerConfig())
    setTimerEditor({ scope: 'block' })
    setBlockMenuOpen(false)
  }

  const closeTimerEditor = () => setTimerEditor(null)

  const saveTimerEditor = () => {
    if (timerEditor?.scope === 'session') {
      setSessionTimerConfig(timerDraft)
    } else if (timerEditor?.scope === 'block') {
      setBlocks(blocks.map((b, i) => i === activeBlockIndex ? { ...b, timerConfig: timerDraft } : b))
    }
    setUnsavedChanges(true)
    closeTimerEditor()
  }

  const removeTimerEditor = () => {
    if (timerEditor?.scope === 'session') {
      setSessionTimerConfig(null)
    } else if (timerEditor?.scope === 'block') {
      setBlocks(blocks.map((b, i) => i === activeBlockIndex ? { ...b, timerConfig: null } : b))
    }
    setUnsavedChanges(true)
    closeTimerEditor()
  }

  const toggleMuscle = (muscleKey) => {
    setSelectedMuscles(prev => prev.includes(muscleKey) ? prev.filter(m => m !== muscleKey) : [...prev, muscleKey])
  }

  const toggleJoint = (jointKey) => {
    setSelectedJoints(prev => prev.includes(jointKey) ? prev.filter(j => j !== jointKey) : [...prev, jointKey])
  }

  // Pour warmup/cooldown, "Create from library" propose d'abord les activations pré-construites
  // du coach (bibliothèque app/library/activations) plutôt que la recherche mouvement par
  // mouvement — un échauffement se compose presque toujours d'un protocole déjà prêt, pas d'une
  // recherche depuis zéro. openMovementPickerDirectly() reste accessible depuis cette modale pour
  // le cas où le coach veut malgré tout piocher un mouvement précis.
  const openExercisePickerForBlock = () => {
    if (activeBlock && ['warmup', 'cooldown'].includes(activeBlock.type)) {
      setWarmupLibraryOpen(true)
      return
    }
    openMovementPickerDirectly()
  }

  const openMovementPickerDirectly = () => {
    setAddingSecondaryExercise(false)
    setReplacingExerciseId(null)
    setPendingCircuitExercises([])
    setWarmupLibraryOpen(false)
    setExercisesModalOpen(true)
  }

  // Ajoute en une seule fois tous les mouvements d'une activation pré-construite au bloc actif —
  // en boucle, plusieurs appels à addExerciseToActiveBlock écraseraient chacun le résultat du
  // précédent (même fermeture `blocks` non réactualisée entre deux appels synchrones). Le nom/texte
  // du protocole s'ajoute au nom/description du bloc sans écraser ce qui y est déjà (même logique
  // additive que applyPreset dans la modale Description — un coach compose parfois plusieurs
  // protocoles dans le même bloc).
  const applyPresetToActiveBlock = (preset) => {
    if (!activeBlock) return
    const newExercises = (preset.videos || []).map(v => ({ id: nextBlockId(), name: v.name, muscles: '' }))
    setBlocks(blocks.map((b, i) => {
      if (i !== activeBlockIndex) return b
      const sets = b.sets?.length > 0 ? b.sets : [{ id: nextBlockId() }]
      const restSeconds = b.restSeconds ?? 60
      return {
        ...b,
        name: b.name || preset.name,
        description: b.description ? `${b.description}\n\n${preset.text || ''}` : (preset.text || ''),
        note: preset.note ? (b.note ? `${b.note}\n\n${preset.note}` : preset.note) : b.note,
        exercises: [...(b.exercises || []), ...newExercises],
        sets, restSeconds,
      }
    }))
    setUnsavedChanges(true)
    setWarmupLibraryOpen(false)
  }

  const openFollowExercisePicker = () => {
    setAddingSecondaryExercise(true)
    setReplacingExerciseId(null)
    setPendingCircuitExercises([])
    setExercisesModalOpen(true)
  }

  // Menu "⋮" par exercice (Replace / Delete) — ouvre le même picker que "+ Exercises" mais en mode
  // remplacement : le nom choisi prend la place de celui-ci sans toucher à son id, donc ses séries/
  // reps/notes déjà saisies restent attachées plutôt que d'être perdues comme avec un delete+add.
  const openReplaceExercisePicker = (exerciseId) => {
    setReplacingExerciseId(exerciseId)
    setAddingSecondaryExercise(false)
    setPendingCircuitExercises([])
    setExercisesModalOpen(true)
    setExerciseMenuOpenId(null)
  }

  const closeExercisesModal = () => {
    setExercisesModalOpen(false)
    setPendingCircuitExercises([])
    setReplacingExerciseId(null)
  }

  const replaceExerciseInActiveBlock = (ex) => {
    if (!activeBlock || !replacingExerciseId) return
    setBlocks(blocks.map((b, i) => (
      i === activeBlockIndex
        ? { ...b, exercises: (b.exercises || []).map(e => e.id === replacingExerciseId ? { ...e, name: ex.name, muscles: ex.muscles } : e) }
        : b
    )))
    setUnsavedChanges(true)
    setExercisesModalOpen(false)
    setReplacingExerciseId(null)
  }

  // Purge les données rattachées à l'exercice supprimé (sets/notes/valeurs/pace) pour ne pas les
  // ressusciter si un futur exercice réutilise le même id.
  const removeExerciseFromActiveBlock = (exerciseId) => {
    if (!activeBlock) return
    if (!window.confirm('Supprimer cet exercice ?')) return
    setBlocks(blocks.map((b, i) => {
      if (i !== activeBlockIndex) return b
      const exercises = (b.exercises || []).filter(e => e.id !== exerciseId)
      const dropKey = (k) => k.endsWith(`:${exerciseId}`) || k === `note:${exerciseId}`
      const setValues = Object.fromEntries(Object.entries(b.setValues || {}).filter(([k]) => !dropKey(k)))
      const setNotes = Object.fromEntries(Object.entries(b.setNotes || {}).filter(([k]) => !dropKey(k)))
      const paceValues = { ...(b.paceValues || {}) }
      delete paceValues[exerciseId]
      const cardioStructures = { ...(b.cardioStructures || {}) }
      delete cardioStructures[exerciseId]
      return { ...b, exercises, setValues, setNotes, paceValues, cardioStructures }
    }))
    setUnsavedChanges(true)
    setExerciseMenuOpenId(null)
  }

  // Groupes musculaires "à ressentir" pour un exercice : override manuel s'il y en a un sur CET
  // exercice précis (ex.focus_muscles, hérité d'une ancienne saisie), sinon le focus déjà posé sur
  // ce mouvement dans le catalogue (movementFocusGroupsMap), sinon détection auto depuis son texte
  // "muscles" (parseMusclesFromText) — même ordre de priorité que l'ancien éditeur (page.js:2488-2490).
  const getExerciseFocusGroups = (ex) => {
    if (ex.focus_muscles) return ex.focus_muscles.split(',').filter(Boolean)
    const key = ex.name.trim().toLowerCase()
    const catalogFocus = movementFocusGroupsMap[key]
    if (catalogFocus) return catalogFocus.split(',').filter(Boolean)
    return parseMusclesFromText(movementMusclesMap[key] || '')
  }

  // Écrit le focus sur le mouvement du catalogue (partagé entre toutes ses utilisations) plutôt
  // que sur cet exercice précis, et efface un éventuel override laissé sur CET exercice — même
  // choix que l'ancien éditeur (page.js:2516-2522), pour ne pas avoir deux sources de vérité qui
  // divergent silencieusement.
  const toggleExerciseFocusGroup = (ex, groupKey) => {
    if (!activeBlock) return
    const current = getExerciseFocusGroups(ex)
    const next = current.includes(groupKey) ? current.filter(k => k !== groupKey) : [...current, groupKey]
    const name = ex.name.trim()
    const value = next.length ? next.join(',') : null
    if (name) {
      // .then() indispensable : un PostgrestFilterBuilder Supabase est "lazy" et n'envoie la
      // requête que quand la promesse est consommée (await ou .then()) — sans ça l'appel
      // s'exécute (aucune erreur) mais ne part jamais réellement (vérifié en conditions réelles :
      // 0 requête réseau sans ce .then()). Même piège présent dans l'ancien éditeur (page.js:2517).
      supabase.from('movements').upsert({ name, focus_groups: value }, { onConflict: 'name' })
        .then(({ error }) => { if (error) console.error('Erreur sauvegarde focus_groups:', error.message) })
      setMovementFocusGroupsMap(prev => ({ ...prev, [name.toLowerCase()]: value }))
    }
    setBlocks(blocks.map((b, i) => (
      i === activeBlockIndex
        ? { ...b, exercises: (b.exercises || []).map(e => e.id === ex.id ? { ...e, focus_muscles: '' } : e) }
        : b
    )))
    setUnsavedChanges(true)
  }

  const openMaterielPicker = (ex) => {
    setDraftMateriel(ex.materiel || '')
    setMaterielPickerExerciseId(ex.id)
  }

  const confirmMaterielPicker = () => {
    const exId = materielPickerExerciseId
    setBlocks(blocks.map((b, i) => (
      i === activeBlockIndex
        ? { ...b, exercises: (b.exercises || []).map(e => e.id === exId ? { ...e, materiel: draftMateriel.trim() } : e) }
        : b
    )))
    setUnsavedChanges(true)
    setMaterielPickerExerciseId(null)
  }

  // Modale "Advanced settings" (coach uniquement, canManageCatalog) : édite muscles + vidéo du
  // mouvement du catalogue partagé (movements, retrouvé par nom — même limite que openExerciseVideo :
  // un exercice déjà enregistré n'a pas de lien vers movements.id, donc la vidéo se re-fetch si
  // absente de ex.videoUrl). Écrit en base tout de suite (pas de setUnsavedChanges : program_exercises
  // ne porte ni muscles ni vidéo, voir flattenBlocksToExerciseRows).
  const openAdvancedSettings = async (ex) => {
    const muscleKeys = (ex.muscles || '')
      .split(',')
      .map(s => s.trim())
      .filter(Boolean)
      .map(part => REAL_MUSCLE_GROUPS.find(g => g.label.toLowerCase() === part.toLowerCase())?.key)
      .filter(Boolean)
    setAdvancedDraftMuscles(muscleKeys)
    let videoUrl = ex.videoUrl || ''
    if (!videoUrl) {
      const { data } = await supabase.from('movements').select('video_url, youtube_url').eq('name', ex.name).limit(1).maybeSingle()
      videoUrl = data?.video_url || data?.youtube_url || ''
    }
    setAdvancedDraftVideoUrl(videoUrl)
    setAdvancedSettingsExerciseId(ex.id)
  }

  const closeAdvancedSettings = () => setAdvancedSettingsExerciseId(null)

  const toggleAdvancedDraftMuscle = (key) => {
    setAdvancedDraftMuscles(prev => prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key])
  }

  // Répercute sur TOUTES les occurrences de ce nom dans la séance (un même mouvement peut
  // apparaître dans plusieurs blocs/supersets) sans attendre un rechargement de page — même
  // logique que toggleExerciseFocusGroup pour movementFocusGroupsMap.
  const saveAdvancedSettings = async (ex) => {
    const name = ex.name.trim()
    if (!name || savingAdvancedSettings) return
    setSavingAdvancedSettings(true)
    const musclesLabel = advancedDraftMuscles
      .map(key => REAL_MUSCLE_GROUPS.find(g => g.key === key)?.label)
      .filter(Boolean)
      .join(', ')
    const videoUrl = advancedDraftVideoUrl.trim()
    const { error } = await supabase.from('movements')
      .upsert({ name, muscles: musclesLabel || null, youtube_url: videoUrl || null }, { onConflict: 'name' })
    setSavingAdvancedSettings(false)
    if (error) { alert('Erreur : ' + error.message); return }
    setMovementMusclesMap(prev => ({ ...prev, [name.toLowerCase()]: musclesLabel }))
    setBlocks(prev => prev.map(b => ({
      ...b,
      exercises: (b.exercises || []).map(e => e.name.trim() === name ? { ...e, muscles: musclesLabel, videoUrl } : e),
    })))
    setAdvancedSettingsExerciseId(null)
  }

  // Ajoute directement l'exercice au bloc actif, sans détour séries/récup — 1 série de base (voir
  // "Add set" pour en ajouter). Utilisé pour l'ajout en superset (addingSecondaryExercise), en mode
  // cardio, et pour la toute première sélection côté sportif (canManageCatalog false, "Séance
  // libre") ; côté coach c'est startExerciseConfig ci-dessous qui gère la première sélection.
  const addExerciseToActiveBlock = (ex) => {
    if (!activeBlock) return
    setBlocks(blocks.map((b, i) => {
      if (i !== activeBlockIndex) return b
      const sets = b.sets?.length > 0 ? b.sets : [{ id: nextBlockId() }]
      const restSeconds = b.restSeconds ?? 60
      return { ...b, exercises: [...(b.exercises || []), { id: nextBlockId(), name: ex.name, muscles: ex.muscles }], sets, restSeconds }
    }))
    setUnsavedChanges(true)
    setExercisesModalOpen(false)
    setAddingSecondaryExercise(false)
  }

  // Détour coach : nombre de séries puis temps de récup, avant que l'exercice n'atterrisse dans le
  // bloc (contrairement à addExerciseToActiveBlock qui l'ajoute tout de suite avec 1 série).
  const startExerciseConfig = (ex) => {
    setPendingExercise(ex)
    setPendingSets(3)
    setPendingRest(60)
    setConfigStep('sets')
    setExercisesModalOpen(false)
  }

  const closeExerciseConfig = () => {
    setConfigStep(null)
    setPendingExercise(null)
  }

  const confirmSetsStep = () => setConfigStep('rest')

  const confirmRestStep = () => {
    if (activeBlock && pendingExercise) {
      const newSets = Array.from({ length: pendingSets }, () => ({ id: nextBlockId() }))
      setBlocks(blocks.map((b, i) => (
        i === activeBlockIndex
          ? {
              ...b,
              exercises: [...(b.exercises || []), { id: nextBlockId(), name: pendingExercise.name, muscles: pendingExercise.muscles }],
              sets: newSets,
              restSeconds: pendingRest,
            }
          : b
      )))
      setUnsavedChanges(true)
    }
    closeExerciseConfig()
  }

  const toggleCircuitPending = (ex) => {
    setPendingCircuitExercises(prev => (
      prev.some(p => p.name === ex.name) ? prev.filter(p => p.name !== ex.name) : [...prev, ex]
    ))
  }

  const openCreateMovement = () => {
    setNewMovementName(exerciseSearch.trim())
    setNewMovementMuscles([])
    setNewMovementJoints([])
    setNewMovementVideoUrl('')
    setCreateMovementOpen(true)
  }

  const toggleNewMovementMuscle = (key) => {
    setNewMovementMuscles(prev => prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key])
  }

  const toggleNewMovementJoint = (key) => {
    setNewMovementJoints(prev => prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key])
  }

  // Insère le mouvement dans le catalogue (même shape que app/movements/page.js : nom seul
  // obligatoire, muscles/vidéo optionnels) puis le sélectionne tout de suite comme si le coach
  // venait de cliquer sur son "+" dans la liste — mêmes branchements que la ligne normale
  // (replace / circuit / ajout direct / détour séries-récup) : pas besoin de le rechercher une
  // seconde fois juste après l'avoir créé.
  const createMovement = async () => {
    const name = newMovementName.trim()
    if (!name || creatingMovement) return
    setCreatingMovement(true)
    const { data: { user } } = await supabase.auth.getUser()
    const { data: coachRow } = await supabase.from('coaches').select('is_admin').eq('id', user?.id).maybeSingle()
    const musclesLabel = newMovementMuscles
      .map(key => REAL_MUSCLE_GROUPS.find(g => g.key === key)?.label)
      .filter(Boolean)
      .join(', ')
    const jointsLabel = newMovementJoints
      .map(key => JOINT_GROUPS.find(g => g.key === key)?.label)
      .filter(Boolean)
      .join(', ')
    const { data, error } = await supabase.from('movements').insert({
      name,
      muscles: musclesLabel || null,
      joints: jointsLabel || null,
      youtube_url: newMovementVideoUrl.trim() || null,
      coach_id: coachRow?.is_admin ? null : (user?.id || null),
    }).select('id, name, muscles, joints, video_url, youtube_url').single()
    setCreatingMovement(false)
    if (error || !data) { alert('Erreur : ' + (error?.message || 'création impossible')); return }
    const ex = { id: data.id, name: data.name, muscles: data.muscles || '', joints: data.joints || '', videoUrl: data.video_url || data.youtube_url || '' }
    setMovementsList(prev => [ex, ...prev])
    setCreateMovementOpen(false)
    if (replacingExerciseId) replaceExerciseInActiveBlock(ex)
    else if (isCircuitBlock) toggleCircuitPending(ex)
    else if (!canManageCatalog || addingSecondaryExercise || activityMode === 'cardio') addExerciseToActiveBlock(ex)
    else startExerciseConfig(ex)
  }

  const confirmCircuitSelection = () => {
    if (!activeBlock || pendingCircuitExercises.length === 0) return
    setBlocks(blocks.map((b, i) => {
      if (i !== activeBlockIndex) return b
      const newExercises = [
        ...(b.exercises || []),
        ...pendingCircuitExercises.map(ex => ({ id: nextBlockId(), name: ex.name, muscles: ex.muscles })),
      ]
      const sets = b.sets?.length > 0 ? b.sets : Array.from({ length: 3 }, () => ({ id: nextBlockId() }))
      const restSeconds = b.restSeconds ?? 60
      return { ...b, exercises: newExercises, sets, restSeconds }
    }))
    setUnsavedChanges(true)
    setPendingCircuitExercises([])
    setExercisesModalOpen(false)
  }

  // Nouveau SET = copie du dernier SET existant (reps, kg, notes, par exercice) : le coach entre
  // rarement des valeurs totalement différentes d'un set à l'autre, autant partir de la même base
  // et ne laisser que les écarts à corriger plutôt que tout ressaisir.
  const addSet = () => {
    if (!activeBlock) return
    setBlocks(blocks.map((b, i) => {
      if (i !== activeBlockIndex) return b
      const newSetId = nextBlockId()
      const lastSet = (b.sets || [])[(b.sets || []).length - 1]
      const setValues = { ...(b.setValues || {}) }
      const setNotes = { ...(b.setNotes || {}) }
      if (lastSet) {
        (b.exercises || []).forEach(ex => {
          const lastValue = b.setValues?.[setCellKey(lastSet.id, ex.id)]
          if (lastValue) setValues[setCellKey(newSetId, ex.id)] = { ...lastValue }
          const lastNote = b.setNotes?.[setCellKey(lastSet.id, ex.id)]
          if (lastNote) setNotes[setCellKey(newSetId, ex.id)] = lastNote
        })
      }
      return { ...b, sets: [...(b.sets || []), { id: newSetId }], setValues, setNotes }
    }))
    setUnsavedChanges(true)
  }

  const removeSet = (setId) => {
    if (!activeBlock) return
    setBlocks(blocks.map((b, i) => (
      i === activeBlockIndex ? { ...b, sets: (b.sets || []).filter(s => s.id !== setId) } : b
    )))
    setUnsavedChanges(true)
  }

  const moveExercise = (exerciseId, dir) => {
    setBlocks(prev => prev.map((b, i) => {
      if (i !== activeBlockIndex) return b
      const list = b.exercises || []
      const idx = list.findIndex(e => e.id === exerciseId)
      const newIdx = idx + dir
      if (idx === -1 || newIdx < 0 || newIdx >= list.length) return b
      const newList = [...list]
      const [item] = newList.splice(idx, 1)
      newList.splice(newIdx, 0, item)
      return { ...b, exercises: newList }
    }))
    setUnsavedChanges(true)
  }

  const setCellKey = (setId, exerciseId) => `${setId}:${exerciseId}`

  // Reps/kg par (set, exercice) — grille standard uniquement, voir updatePaceValue pour le cardio.
  const updateSetValue = (setId, exerciseId, field, value) => {
    setBlocks(blocks.map((b, i) => {
      if (i !== activeBlockIndex) return b
      const key = setCellKey(setId, exerciseId)
      const setValues = { ...(b.setValues || {}) }
      setValues[key] = { ...(setValues[key] || { reps: '', kg: '', tempo: '' }), [field]: value }
      return { ...b, setValues }
    }))
    setUnsavedChanges(true)
  }

  // Copie reps+kg d'un set vers le set juste après, pour ce même exercice.
  const copySetValueToNextSet = (setId, exerciseId) => {
    if (!activeBlock) return
    setBlocks(blocks.map((b, i) => {
      if (i !== activeBlockIndex) return b
      const value = b.setValues?.[setCellKey(setId, exerciseId)]
      if (!value) return b
      const setIndex = (b.sets || []).findIndex(s => s.id === setId)
      const nextSet = (b.sets || [])[setIndex + 1]
      if (!nextSet) return b
      const setValues = { ...(b.setValues || {}), [setCellKey(nextSet.id, exerciseId)]: { ...value } }
      return { ...b, setValues }
    }))
    setUnsavedChanges(true)
  }

  // Copie reps+kg d'un set vers TOUS les sets du bloc pour ce même exercice (y compris ceux
  // d'avant), pour éviter de ressaisir les mêmes valeurs set par set quand elles ne varient pas.
  const copySetValueToAllSets = (setId, exerciseId) => {
    if (!activeBlock) return
    setBlocks(blocks.map((b, i) => {
      if (i !== activeBlockIndex) return b
      const value = b.setValues?.[setCellKey(setId, exerciseId)]
      if (!value) return b
      const setValues = { ...(b.setValues || {}) }
      for (const s of (b.sets || [])) {
        setValues[setCellKey(s.id, exerciseId)] = { ...value }
      }
      return { ...b, setValues }
    }))
    setUnsavedChanges(true)
  }

  // Les program_exercises déjà enregistrés n'ont que `name` (pas de lien vers movements.id), donc
  // ex.videoUrl n'est connu à l'avance que pour un exercice tout juste ajouté depuis la recherche
  // (voir addExercisesToActiveBlock) — pour les autres on va chercher la vidéo par nom au clic.
  const openExerciseVideo = async (ex) => {
    if (ex.videoUrl) { setVideoModalExercise(ex); return }
    const { data } = await supabase.from('movements').select('video_url, youtube_url').eq('name', ex.name).limit(1).maybeSingle()
    const videoUrl = data?.video_url || data?.youtube_url || ''
    if (!videoUrl) { alert('Aucune vidéo liée à ce mouvement.'); return }
    setVideoModalExercise({ ...ex, videoUrl })
  }

  // Récup du bloc actif (un seul restSeconds partagé par tous les RestDivider du bloc, voir
  // addExerciseToActiveBlock) — remplace le popup retiré à l'ajout d'exercice : la valeur reste
  // éditable après coup en cliquant le badge REST.
  const updateBlockRest = (seconds) => {
    setBlocks(blocks.map((b, i) => (i === activeBlockIndex ? { ...b, restSeconds: seconds } : b)))
    setUnsavedChanges(true)
  }

  // Base (VMA/Seuil60/Δ) + %1/%2 par exercice — mode cardio uniquement, pas de grille de sets
  // (voir flattenBlocksToExerciseRows / groupExercisesIntoBlocks pour le mapping DB).
  const updatePaceValue = (exerciseId, field, value) => {
    setBlocks(blocks.map((b, i) => {
      if (i !== activeBlockIndex) return b
      const paceValues = { ...(b.paceValues || {}) }
      paceValues[exerciseId] = { ...(paceValues[exerciseId] || { base: '', pctLow: '', pctHigh: '' }), [field]: value }
      return { ...b, paceValues }
    }))
    setUnsavedChanges(true)
  }

  // Structure cardio détaillée (blocs de steps, voir lib/cardioSteps.js) d'un exercice cardio —
  // écrite en plus de paceValues (repli simple base+%low/%high, voir updatePaceValue), pas à sa
  // place : un exercice sans structure garde son export .FIT résolu depuis pace_base/pct.
  const updateCardioStructure = (exerciseId, structure) => {
    setBlocks(blocks.map((b, i) => {
      if (i !== activeBlockIndex) return b
      const cardioStructures = { ...(b.cardioStructures || {}) }
      if (structure) cardioStructures[exerciseId] = structure
      else delete cardioStructures[exerciseId]
      return { ...b, cardioStructures }
    }))
    setUnsavedChanges(true)
  }

  const openSetNotesModal = (setId, exerciseId) => {
    if (!activeBlock) return
    setActiveNoteContext({ setId, exerciseId })
    setDraftSetNote(activeBlock.setNotes?.[setCellKey(setId, exerciseId)] || '')
    setApplyNoteToNextSets(false)
    setNotesModalOpen(true)
  }

  const closeSetNotesModal = () => {
    setNotesModalOpen(false)
    setActiveNoteContext(null)
  }

  const confirmSetNotesModal = () => {
    if (activeNoteContext) {
      const { setId, exerciseId } = activeNoteContext
      setBlocks(blocks.map((b, i) => {
        if (i !== activeBlockIndex) return b
        const setNotes = { ...(b.setNotes || {}) }
        setNotes[setCellKey(setId, exerciseId)] = draftSetNote
        if (applyNoteToNextSets) {
          const setIndex = (b.sets || []).findIndex(s => s.id === setId)
          for (const s of (b.sets || []).slice(setIndex + 1)) {
            setNotes[setCellKey(s.id, exerciseId)] = draftSetNote
          }
        }
        return { ...b, setNotes }
      }))
      setUnsavedChanges(true)
    }
    closeSetNotesModal()
  }

  const clearSetNotesModal = () => setDraftSetNote('')

  // Le filtrage (nom + muscles) est déjà appliqué côté serveur par l'effet de recherche ci-dessus.
  const filteredExercises = movementsList

  const movementNames = useMemo(() => movementsList.map(m => m.name), [movementsList])
  const mentionPattern = useMemo(() => (
    movementNames.length
      ? new RegExp(`#(${movementNames.map(m => m.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')).join('|')})\\b`, 'g')
      : null
  ), [movementNames])

  function renderHighlightedDescription(text) {
    if (!mentionPattern) return text
    const parts = []
    let lastIndex = 0
    let match
    const regex = new RegExp(mentionPattern.source, 'g')
    while ((match = regex.exec(text)) !== null) {
      if (match.index > lastIndex) parts.push(text.slice(lastIndex, match.index))
      parts.push(
        <span key={match.index} style={{ color: c.blue, textDecoration: 'underline', fontWeight: 600 }}>
          {match[0]}
        </span>
      )
      lastIndex = match.index + match[0].length
    }
    if (lastIndex < text.length) parts.push(text.slice(lastIndex))
    return parts
  }

  // Le textarea (transparent, texte réel invisible) est superposé à un calque de rendu qui
  // surligne les mentions #exercice — les deux doivent occuper EXACTEMENT la même hauteur/largeur
  // pour que le curseur reste aligné sur le texte affiché. Sans auto-grandissement, le textarea
  // (rows=3 fixe) finit par scroller en interne dès qu'on dépasse 3 lignes : sa scrollbar réduit
  // la largeur de saisie effective sans toucher au calque (overflow:hidden, jamais de scrollbar),
  // donc les deux retombent le texte différemment et le curseur dérive visuellement.
  const resizeDescriptionTextarea = () => {
    const ta = descriptionRef.current
    if (!ta) return
    ta.style.height = 'auto'
    ta.style.height = `${ta.scrollHeight}px`
  }

  const handleDescriptionChange = (e) => {
    const value = e.target.value
    const cursor = e.target.selectionStart
    setDraftDescription(value)
    setUnsavedChanges(true)
    e.target.style.height = 'auto'
    e.target.style.height = `${e.target.scrollHeight}px`
    const uptoCursor = value.slice(0, cursor)
    const hashIndex = uptoCursor.lastIndexOf('#')
    const query = hashIndex === -1 ? null : uptoCursor.slice(hashIndex + 1)
    const stillMatching = query !== null && !query.includes('\n') &&
      (query === '' || movementNames.some(m => m.toLowerCase().startsWith(query.toLowerCase())))
    if (stillMatching) {
      setMentionQuery(query)
      setMentionRange({ start: hashIndex, end: cursor })
    } else {
      setMentionQuery(null)
      setMentionRange(null)
    }
  }

  const openExercisePicker = () => {
    const cursor = descriptionRef.current?.selectionStart ?? draftDescription.length
    setMentionRange({ start: cursor, end: cursor })
    setMentionQuery('')
    descriptionRef.current?.focus()
  }

  const pickMovement = (name) => {
    if (!mentionRange) return
    const { start, end } = mentionRange
    const before = draftDescription.slice(0, start)
    const after = draftDescription.slice(end)
    const insertion = `#${name} `
    setDraftDescription(before + insertion + after)
    setMentionQuery(null)
    setMentionRange(null)
    requestAnimationFrame(() => {
      const ta = descriptionRef.current
      if (!ta) return
      ta.focus()
      const pos = before.length + insertion.length
      ta.setSelectionRange(pos, pos)
      resizeDescriptionTextarea()
    })
  }

  const mentionMatches = mentionQuery === null
    ? []
    : movementsList.filter(m => m.name.toLowerCase().startsWith(mentionQuery.toLowerCase())).slice(0, 5)

  if (loading) {
    return (
      <div style={{ background: c.bg, minHeight: '100svh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: c.textMuted, fontFamily: 'var(--font-ui)' }}>
        Chargement…
      </div>
    )
  }

  if (notFound) {
    return (
      <div style={{ background: c.bg, minHeight: '100svh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16, color: c.textMuted, fontFamily: 'var(--font-ui)' }}>
        <div>Séance introuvable.</div>
        <button onClick={() => (onClose ? onClose() : router.push(backHref))} style={{ border: `1px solid ${c.border}`, borderRadius: 6, padding: '9px 20px', background: c.bg, cursor: 'pointer' }}>
          Retour au calendrier
        </button>
      </div>
    )
  }

  return (
    <div style={{ background: c.bg, minHeight: '100svh', fontFamily: 'var(--font-ui)', position: 'relative' }}>
      {/* Flèches de bord d'écran pour changer de bloc — position: fixed (pas absolute) pour rester
          visibles au scroll, comme le reste des chrome flottants. Seulement en page normale
          (!onClose) : en vue côte à côte (plusieurs panneaux SessionBlockEditor de 480px l'un à
          côté de l'autre, voir app/programs/.../page.js), du fixed couvrirait TOUS les panneaux au
          lieu de rester dans celui-ci — même piège que documenté plus haut pour les backdrops de
          menu. z-index sous les modales (200+) pour qu'une modale ouverte les recouvre et les
          neutralise plutôt que de rester cliquables par-dessus. */}
      {!onClose && blocks.length > 1 && (
        <>
          <button
            disabled={orderMode || activeBlockIndex === 0}
            onClick={() => setActiveBlockId(blocks[Math.max(0, activeBlockIndex - 1)]?.id)}
            aria-label="Previous block"
            style={{
              position: 'fixed', left: 12, top: '50%', transform: 'translateY(-50%)', zIndex: 60,
              display: 'flex', alignItems: 'center', justifyContent: 'center', width: 44, height: 44, borderRadius: '50%',
              background: c.bg, border: `1px solid ${c.border}`, boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
              cursor: (orderMode || activeBlockIndex === 0) ? 'default' : 'pointer',
              color: (orderMode || activeBlockIndex === 0) ? c.borderDashed : c.text,
            }}
          >
            <CaretLeft size={22} weight="bold" />
          </button>
          <button
            disabled={orderMode || activeBlockIndex >= blocks.length - 1}
            onClick={() => setActiveBlockId(blocks[Math.min(blocks.length - 1, activeBlockIndex + 1)]?.id)}
            aria-label="Next block"
            style={{
              position: 'fixed', right: 12, top: '50%', transform: 'translateY(-50%)', zIndex: 60,
              display: 'flex', alignItems: 'center', justifyContent: 'center', width: 44, height: 44, borderRadius: '50%',
              background: c.bg, border: `1px solid ${c.border}`, boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
              cursor: (orderMode || activeBlockIndex >= blocks.length - 1) ? 'default' : 'pointer',
              color: (orderMode || activeBlockIndex >= blocks.length - 1) ? c.borderDashed : c.text,
            }}
          >
            <CaretRight size={22} weight="bold" />
          </button>
        </>
      )}

      <div style={{ maxWidth: 680, margin: '0 auto', padding: '28px 32px 60px' }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 28 }}>
          <button onClick={goBack} style={{ display: 'flex', background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: c.text }}>
            <X size={22} />
          </button>
          <input
            value={sessionTitle}
            onChange={e => { setSessionTitle(e.target.value); setUnsavedChanges(true) }}
            placeholder='Workout name &quot;Standard&quot;'
            style={{ ...input, flex: 1, fontSize: 15, padding: '10px 14px' }}
          />
          {savedFlash && <span style={{ fontSize: 13, color: c.blue, fontWeight: 600 }}>✓ Sauvegardé</span>}
          <button onClick={handleSave} disabled={saving} style={{
            flexShrink: 0, background: c.blue, color: '#fff', border: 'none', borderRadius: 6,
            padding: '10px 28px', fontSize: 14, fontWeight: 600, cursor: saving ? 'default' : 'pointer', opacity: saving ? 0.7 : 1,
          }}>
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>

        {/* Description */}
        <div style={{ marginBottom: 24, border: `1px solid ${c.border}`, borderRadius: 6, overflow: 'hidden' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '8px 10px', borderBottom: `1px solid ${c.border}` }}>
            {[TextB, TextItalic, LinkSimple, ListBullets, TextTSlash].map((Icon, i) => (
              <button key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 28, height: 28, border: 'none', background: 'none', borderRadius: 4, color: c.textMuted, cursor: 'pointer' }}>
                <Icon size={15} />
              </button>
            ))}
          </div>
          <textarea
            placeholder="Description"
            value={description}
            onChange={e => { setDescription(e.target.value); setUnsavedChanges(true) }}
            rows={5}
            style={{ width: '100%', boxSizing: 'border-box', border: 'none', padding: '12px 14px', fontSize: 14, outline: 'none', resize: 'none', background: 'transparent', fontFamily: 'inherit', color: c.text }}
          />
        </div>

        {/* Matériel : porté depuis l'ancien éditeur plein écran (page.js:2726-2735) — lu côté
            athlète (app/s/[token]/page.js) et sur le tableau de bord coach (app/page.js). */}
        <div style={{ marginBottom: 24 }}>
          <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: c.textMuted, marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.3 }}>
            Matériel
          </label>
          <textarea
            placeholder="Matériel nécessaire pour cette séance"
            value={materiel}
            onChange={e => { setMateriel(e.target.value); setUnsavedChanges(true) }}
            rows={2}
            style={{ width: '100%', boxSizing: 'border-box', border: `1px solid ${c.border}`, borderRadius: 6, padding: '10px 14px', fontSize: 14, outline: 'none', resize: 'none', background: c.bg, fontFamily: 'inherit', color: c.text }}
          />
          {/* Regroupe automatiquement le matériel tagué exercice par exercice (bouton sac à dos
              sur chaque ligne d'exercice) — vient s'ajouter au texte libre ci-dessus, ne le
              remplace pas : le coach garde la main pour une note générale ("prévoir une serviette"). */}
          {(() => {
            const tagged = blocks.flatMap(b => b.exercises || []).filter(ex => ex.materiel?.trim())
            if (!tagged.length) return null
            return (
              <ul style={{ margin: '8px 0 0', padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 3 }}>
                {tagged.map(ex => (
                  <li key={ex.id} style={{ fontSize: 13, color: c.textMuted }}>
                    <span style={{ fontWeight: 600, color: c.text }}>{ex.name}</span> — {ex.materiel}
                  </li>
                ))}
              </ul>
            )
          })()}
        </div>

        {/* Récurrence : hors calendrier, proposée au sportif tous les jours plutôt qu'à une
            date précise — voir la note en tête de fichier sur le périmètre réduit de cette page,
            ce champ est l'exception portée ici car il n'a pas d'équivalent dans l'ancien éditeur
            plein écran une fois la séance créée depuis la grille Jour 1→N. */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 24 }}>
          <button
            onClick={() => { setActivityMode(m => m === 'cardio' ? 'standard' : 'cardio'); setUnsavedChanges(true) }}
            title="Limite la bibliothèque d'exercices aux mouvements Run/Row/Ski Erg/Bike et affiche une allure (base + %) au lieu de séries/reps/kg"
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 12px', borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: 'pointer',
              border: `1px solid ${activityMode === 'cardio' ? c.blue : c.border}`,
              background: activityMode === 'cardio' ? c.blueBorder : c.bg,
              color: activityMode === 'cardio' ? c.blue : c.textMuted,
            }}
          >
            <Heartbeat size={14} weight={activityMode === 'cardio' ? 'fill' : 'regular'} />
            {activityMode === 'cardio' ? 'Cardio' : 'Standard'}
          </button>
          <button onClick={() => { setSessionType(t => t === 'recurrent' ? null : 'recurrent'); setUnsavedChanges(true) }} style={{
            padding: '7px 12px', borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: 'pointer',
            border: `1px solid ${sessionType === 'recurrent' ? c.blue : c.border}`,
            background: sessionType === 'recurrent' ? c.blueBorder : c.bg,
            color: sessionType === 'recurrent' ? c.blue : c.textMuted,
          }}>
            {sessionType === 'recurrent' ? 'Recurring · every day' : 'Does not repeat'}
          </button>
          {sessionType === 'recurrent' && (
            <label title="Number of times per day to validate the session — resets daily"
              style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 13, color: c.textMuted }}>
              <input type="number" min="1" value={recurringTarget}
                onChange={e => { setRecurringTarget(Math.max(1, parseInt(e.target.value) || 1)); setUnsavedChanges(true) }}
                style={{ width: 44, boxSizing: 'border-box', padding: '6px 8px', border: `1px solid ${c.border}`, borderRadius: 6, fontSize: 13, textAlign: 'center', outline: 'none', background: c.bg, color: c.text }} />
              x/day
            </label>
          )}
          <button
            onClick={() => { setSessionType(t => t === 'explication' ? null : 'explication'); setUnsavedChanges(true) }}
            title="Séance de type explication : juste une note + une vidéo, sans exercices"
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 12px', borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: 'pointer',
              border: `1px solid ${sessionType === 'explication' ? c.blue : c.border}`,
              background: sessionType === 'explication' ? c.blueBorder : c.bg,
              color: sessionType === 'explication' ? c.blue : c.textMuted,
            }}
          >
            <Lightbulb size={14} weight={sessionType === 'explication' ? 'fill' : 'regular'} /> Explication
          </button>
          {isGroupProgram && (
            <button
              onClick={() => { setHiddenUntilRun(v => !v); setUnsavedChanges(true) }}
              title="Cache le contenu de la séance aux athlètes du groupe jusqu'à son lancement en direct"
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 12px', borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: 'pointer',
                border: `1px solid ${hiddenUntilRun ? c.blue : c.border}`,
                background: hiddenUntilRun ? c.blueBorder : c.bg,
                color: hiddenUntilRun ? c.blue : c.textMuted,
              }}
            >
              {hiddenUntilRun ? <><EyeSlash size={14} /> Caché</> : <><Eye size={14} /> Visible</>}
            </button>
          )}
        </div>

        {sessionType !== 'explication' && (
        <>
        {/* Add / Order */}
        <div style={{ display: 'flex', gap: 12 }}>
          <div style={{ position: 'relative' }}>
            <button onClick={() => setAddMenuOpen(v => !v)} style={{
              display: 'flex', alignItems: 'center', gap: 6, background: c.bg, border: `1px solid ${c.blue}`,
              borderRadius: 6, padding: '9px 16px', fontSize: 13, fontWeight: 600, color: c.blue, cursor: 'pointer',
            }}>
              <Plus size={14} weight="bold" /> Add
            </button>
            {addMenuOpen && (
              <>
                {/* absolute (relatif à la racine du composant, pas au viewport) plutôt que fixed :
                    en vue côte à côte (plusieurs SessionBlockEditor montés à la fois, voir
                    app/programs/.../page.js), un backdrop plein viewport intercepterait aussi les
                    clics destinés aux AUTRES panneaux tant que ce menu reste ouvert. */}
                <div onClick={() => setAddMenuOpen(false)} style={{ position: 'absolute', inset: 0, zIndex: 90 }} />
                <div style={{
                  position: 'absolute', left: 0, top: '100%', marginTop: 6, width: 320, background: c.bg,
                  border: `1px solid ${c.border}`, borderRadius: 8, boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
                  zIndex: 100, padding: 8, display: 'flex', flexDirection: 'column', gap: 2,
                }}>
                  <button onClick={addWarmupBlock} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px', borderRadius: 6, fontSize: 14, color: c.text, background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left' }}>
                    <span style={{ width: 32, height: 32, borderRadius: '50%', background: c.text, color: '#fff', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <Flame size={12} weight="fill" />
                      <span style={{ fontSize: 5, fontWeight: 800, letterSpacing: '0.2px', lineHeight: 1 }}>WARM UP</span>
                    </span>
                    Add the warm-up part
                  </button>
                  <button onClick={addCooldownBlock} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px', borderRadius: 6, fontSize: 14, color: c.text, background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left' }}>
                    <span style={{ width: 32, height: 32, borderRadius: '50%', background: c.text, color: '#fff', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <Snowflake size={12} weight="fill" />
                      <span style={{ fontSize: 5, fontWeight: 800, letterSpacing: '0.2px', lineHeight: 1 }}>COOL DOWN</span>
                    </span>
                    Add the cool-down / stretching part
                  </button>
                  <div style={{ height: 1, background: c.border, margin: '4px 0' }} />
                  <button onClick={addExerciseBlock} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px', borderRadius: 6, fontSize: 14, color: c.text, background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left' }}>
                    <span style={{ width: 32, height: 32, borderRadius: 6, border: `1.5px solid ${c.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <Plus size={14} />
                    </span>
                    Add exercise
                  </button>
                  <button onClick={addCircuitBlock} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px', borderRadius: 6, fontSize: 14, color: c.text, background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left' }}>
                    <span style={{ width: 32, height: 32, borderRadius: 6, border: `1.5px solid ${c.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <ArrowsClockwise size={14} />
                    </span>
                    Circuit
                  </button>
                </div>
              </>
            )}
          </div>
          <button
            onClick={() => setOrderMode(v => !v)}
            disabled={blocks.length < 2}
            style={{
              display: 'flex', alignItems: 'center', gap: 8, borderRadius: 6, padding: '9px 16px', fontSize: 13, fontWeight: 600,
              cursor: blocks.length < 2 ? 'not-allowed' : 'pointer',
              border: `1px solid ${orderMode ? c.blue : c.border}`,
              background: blocks.length < 2 ? c.disabledBg : (orderMode ? c.blueBorder : c.bg),
              color: blocks.length < 2 ? c.disabled : (orderMode ? c.blue : c.text),
            }}
          >
            <ArrowsDownUp size={14} /> Order
          </button>
          <button
            onClick={openSessionTimerEditor}
            title={sessionTimerConfig ? 'Modifier le timer de la séance' : 'Créer un timer pour toute la séance'}
            style={{
              display: 'flex', alignItems: 'center', gap: 8, borderRadius: 6, padding: '9px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer',
              border: `1px solid ${sessionTimerConfig ? c.blue : c.border}`,
              background: sessionTimerConfig ? c.blueBorder : c.bg,
              color: sessionTimerConfig ? c.blue : c.text,
            }}
          >
            <Timer size={14} weight={sessionTimerConfig ? 'fill' : 'regular'} /> Timer
          </button>
        </div>

        {orderMode && (
          <div style={{ marginTop: 10, fontSize: 12, color: c.textMuted }}>
            Touch and hold a circle, then drag it left or right to reorder the blocks.
          </div>
        )}

        {/* Navigation entre blocs */}
        {blocks.length > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 24 }}>
            <button
              disabled={orderMode || activeBlockIndex === 0}
              onClick={() => setActiveBlockId(blocks[Math.max(0, activeBlockIndex - 1)]?.id)}
              style={{ display: 'flex', background: 'none', border: 'none', padding: 4, cursor: (orderMode || activeBlockIndex === 0) ? 'default' : 'pointer', color: (orderMode || activeBlockIndex === 0) ? c.borderDashed : c.text }}
            >
              <CaretLeft size={18} weight="bold" />
            </button>

            {orderMode ? (
              <SortableGroup ids={blocks.map(b => b.id)} onReorder={moveBlock} orientation="horizontal">
                {blocks.map((b, i) => {
                  const meta = BLOCK_META[b.type]
                  const Icon = meta.icon
                  const isActive = i === activeBlockIndex
                  return (
                    <SortableItem key={b.id} id={b.id}>
                      {({ attributes, listeners }) => (
                        <button {...attributes} {...listeners} onClick={() => setActiveBlockId(b.id)} style={{
                          position: 'relative', width: 44, height: 44, borderRadius: '50%', flexShrink: 0,
                          background: isActive ? c.text : c.disabledBg, color: isActive ? '#fff' : c.textMuted,
                          border: 'none', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                          gap: 1, cursor: 'grab', touchAction: 'none',
                        }}>
                          <Icon size={14} weight="fill" />
                          <span style={{ fontSize: 6, fontWeight: 800, letterSpacing: '0.2px', lineHeight: 1, textAlign: 'center' }}>{meta.badgeLabel}</span>
                          <span style={{
                            position: 'absolute', bottom: -2, right: -2, width: 16, height: 16, borderRadius: '50%',
                            background: c.bg, border: `1px solid ${c.border}`, color: c.text, fontSize: 9, fontWeight: 700,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                          }}>
                            {i + 1}
                          </span>
                        </button>
                      )}
                    </SortableItem>
                  )
                })}
              </SortableGroup>
            ) : blocks.map((b, i) => {
              const meta = BLOCK_META[b.type]
              const Icon = meta.icon
              const isActive = i === activeBlockIndex
              return (
                <button key={b.id} onClick={() => setActiveBlockId(b.id)} style={{
                  position: 'relative', width: 44, height: 44, borderRadius: '50%', flexShrink: 0,
                  background: isActive ? c.text : c.disabledBg, color: isActive ? '#fff' : c.textMuted,
                  border: 'none', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                  gap: 1, cursor: 'pointer',
                }}>
                  <Icon size={14} weight="fill" />
                  <span style={{ fontSize: 6, fontWeight: 800, letterSpacing: '0.2px', lineHeight: 1, textAlign: 'center' }}>{meta.badgeLabel}</span>
                  <span style={{
                    position: 'absolute', bottom: -2, right: -2, width: 16, height: 16, borderRadius: '50%',
                    background: c.bg, border: `1px solid ${c.border}`, color: c.text, fontSize: 9, fontWeight: 700,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    {i + 1}
                  </span>
                </button>
              )
            })}

            <button
              disabled={orderMode || activeBlockIndex >= blocks.length - 1}
              onClick={() => setActiveBlockId(blocks[Math.min(blocks.length - 1, activeBlockIndex + 1)]?.id)}
              style={{ display: 'flex', background: 'none', border: 'none', padding: 4, cursor: (orderMode || activeBlockIndex >= blocks.length - 1) ? 'default' : 'pointer', color: (orderMode || activeBlockIndex >= blocks.length - 1) ? c.borderDashed : c.text }}
            >
              <CaretRight size={18} weight="bold" />
            </button>
          </div>
        )}

        {/* Carte du bloc actif */}
        {activeBlock && (
          <div style={{ marginTop: 16, border: `1px solid ${c.border}`, borderRadius: 8, overflow: 'hidden' }}>
            <div style={{ display: 'flex', alignItems: 'center', padding: '14px 16px', borderBottom: `1px solid ${c.border}` }}>
              <span style={{ width: 20, flexShrink: 0 }} />
              <span style={{ flex: 1, textAlign: 'center', fontSize: 13, fontWeight: 700, letterSpacing: '0.6px', color: c.textMuted }}>
                {BLOCK_META[activeBlock.type].title}
              </span>
              <div style={{ position: 'relative', flexShrink: 0 }}>
                <button onClick={() => setBlockMenuOpen(v => !v)} style={{ display: 'flex', background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: c.textMuted }}>
                  <DotsThreeVertical size={18} weight="bold" />
                </button>
                {blockMenuOpen && (
                  <>
                    {/* absolute (pas fixed) : même raison que le backdrop du menu Add plus haut —
                        en vue côte à côte, un backdrop plein viewport intercepterait les clics
                        destinés aux autres panneaux tant que ce menu reste ouvert. */}
                    <div onClick={() => setBlockMenuOpen(false)} style={{ position: 'absolute', inset: 0, zIndex: 90 }} />
                    <div style={{
                      position: 'absolute', right: 0, top: '100%', marginTop: 6, width: 200, background: c.bg,
                      border: `1px solid ${c.border}`, borderRadius: 8, boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
                      zIndex: 100, padding: 8, display: 'flex', flexDirection: 'column', gap: 2,
                    }}>
                      {activeBlock.type === 'exercise' && (
                        <>
                          <button
                            onClick={openBlockTimerEditor}
                            style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', borderRadius: 6, fontSize: 14, color: c.text, background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left' }}
                          >
                            <Timer size={14} color={activeBlock.timerConfig ? c.blue : c.textMuted} />
                            {activeBlock.timerConfig ? 'Edit linked timer' : 'Create a linked timer'}
                          </button>
                          <div style={{ height: 1, background: c.border, margin: '4px 0' }} />
                        </>
                      )}
                      <button
                        onClick={() => { duplicateBlock(activeBlockIndex); setBlockMenuOpen(false) }}
                        style={{ padding: '10px 12px', borderRadius: 6, fontSize: 14, color: c.text, background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left' }}
                      >
                        Duplicate this part
                      </button>
                      <button
                        onClick={() => { removeBlock(activeBlockIndex); setBlockMenuOpen(false) }}
                        style={{ padding: '10px 12px', borderRadius: 6, fontSize: 14, color: '#DC2626', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left' }}
                      >
                        Delete this part
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* Un bloc circuit n'a jamais d'exercices propres : toCircuitBlock renvoie
                exercises: [] et les mouvements du circuit sont persistés comme program_exercises
                à part. Sans ce || isCircuitBlock, on retombait sur l'état vide "Create from
                library" au rechargement, et le texte du circuit devenait invisible et
                immodifiable — comme ses vidéos et son mode de résultat. */}
            {activeBlock.exercises?.length > 0 || isCircuitBlock ? (
              <div style={{ padding: 16 }}>
                <SortableGroup ids={activeBlock.exercises.map(ex => ex.id)} onReorder={moveExercise}>
                  {activeBlock.exercises.map((ex, idx) => (
                    <SortableItem key={ex.id} id={ex.id}>
                      {({ attributes, listeners }) => (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: idx === activeBlock.exercises.length - 1 ? 14 : 10, background: c.bg }}>
                          <span {...attributes} {...listeners} style={{ display: 'flex', flexShrink: 0, cursor: 'grab', touchAction: 'none', color: c.textFaint }}>
                            <DotsSixVertical size={16} />
                          </span>
                          <button
                            onClick={() => openExerciseVideo(ex)}
                            title="Voir la vidéo"
                            style={{
                              width: 56, height: 56, flexShrink: 0, borderRadius: 6, background: c.text, color: '#fff',
                              display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center',
                              fontSize: 9, fontWeight: 700, textTransform: 'uppercase', padding: 4, lineHeight: 1.2,
                              border: 'none', cursor: 'pointer', fontFamily: 'inherit',
                            }}
                          >
                            {ex.name}
                          </button>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 15, fontWeight: 600, color: c.text, textDecoration: 'underline' }}>{ex.name}</div>
                            {ex.muscles && (
                              <span style={{ display: 'inline-block', marginTop: 6, fontSize: 11, color: c.textMuted, background: c.disabledBg, borderRadius: 5, padding: '2px 8px' }}>
                                {ex.muscles}
                              </span>
                            )}
                            {(() => {
                              const focusGroups = getExerciseFocusGroups(ex)
                              if (focusGroups.length === 0) return null
                              const isAuto = !ex.focus_muscles
                              return (
                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, marginTop: 6, marginLeft: 6, fontSize: 11, fontWeight: 700, color: '#B91C1C', background: '#FEF2F2', border: '1px solid #FCA5A5', borderRadius: 20, padding: '2px 8px' }}>
                                  <Target size={11} /> {REAL_MUSCLE_GROUPS.filter(g => focusGroups.includes(g.key)).map(g => g.label).join(', ')}
                                  {isAuto && <span style={{ fontWeight: 500, opacity: 0.75 }}> (auto)</span>}
                                </span>
                              )
                            })()}
                          </div>
                          <div style={{ position: 'relative', flexShrink: 0, display: 'flex', alignItems: 'center', gap: 10 }}>
                            <button
                              onClick={() => openMaterielPicker(ex)}
                              title={ex.materiel ? `Matériel : ${ex.materiel}` : 'Indiquer le matériel nécessaire'}
                              style={{ display: 'flex', background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: ex.materiel ? c.blue : c.textMuted }}
                            >
                              <Backpack size={18} weight={ex.materiel ? 'fill' : 'regular'} />
                            </button>
                            <button
                              onClick={() => setExerciseMenuOpenId(v => v === ex.id ? null : ex.id)}
                              style={{ display: 'flex', background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: c.textMuted }}
                            >
                              <DotsThreeVertical size={18} weight="bold" />
                            </button>
                            {exerciseMenuOpenId === ex.id && (
                              <>
                                <div onClick={() => setExerciseMenuOpenId(null)} style={{ position: 'fixed', inset: 0, zIndex: 90 }} />
                                <div style={{
                                  position: 'absolute', right: 0, top: '100%', marginTop: 6, width: 190, background: c.bg,
                                  border: `1px solid ${c.border}`, borderRadius: 8, boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
                                  zIndex: 100, padding: 8, display: 'flex', flexDirection: 'column', gap: 2,
                                }}>
                                  <button
                                    onClick={() => { setFocusPickerExerciseId(ex.id); setExerciseMenuOpenId(null) }}
                                    style={{ padding: '10px 12px', borderRadius: 6, fontSize: 14, color: c.text, background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left' }}
                                  >
                                    Focus muscles
                                  </button>
                                  <button
                                    onClick={() => openReplaceExercisePicker(ex.id)}
                                    style={{ padding: '10px 12px', borderRadius: 6, fontSize: 14, color: c.text, background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left' }}
                                  >
                                    Replace exercise
                                  </button>
                                  <button
                                    onClick={() => removeExerciseFromActiveBlock(ex.id)}
                                    style={{ padding: '10px 12px', borderRadius: 6, fontSize: 14, color: '#DC2626', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left' }}
                                  >
                                    Delete exercise
                                  </button>
                                </div>
                              </>
                            )}
                            {focusPickerExerciseId === ex.id && (
                              <>
                                <div onClick={() => setFocusPickerExerciseId(null)} style={{ position: 'fixed', inset: 0, zIndex: 90 }} />
                                <div style={{
                                  position: 'absolute', right: 0, top: '100%', marginTop: 6, width: 260, background: c.bg,
                                  border: `1px solid ${c.border}`, borderRadius: 8, boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
                                  zIndex: 100, padding: 12,
                                }}>
                                  <div style={{ fontSize: 11, fontWeight: 700, color: c.textMuted, textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 4 }}>
                                    <Target size={12} /> Focus — muscles à ressentir
                                  </div>
                                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: 10 }}>
                                    {REAL_MUSCLE_GROUPS.map(g => {
                                      const active = getExerciseFocusGroups(ex).includes(g.key)
                                      return (
                                        <button key={g.key} onClick={() => toggleExerciseFocusGroup(ex, g.key)} style={{
                                          background: active ? '#FEF2F2' : c.bg, border: `1px solid ${active ? '#FCA5A5' : c.border}`,
                                          color: active ? '#B91C1C' : c.textMuted, borderRadius: 16, padding: '4px 9px', fontSize: 11, fontWeight: 700, cursor: 'pointer',
                                        }}>
                                          {g.label}
                                        </button>
                                      )
                                    })}
                                  </div>
                                  <button onClick={() => setFocusPickerExerciseId(null)} style={{ background: c.blue, color: '#fff', border: 'none', borderRadius: 6, padding: '7px 14px', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
                                    Done
                                  </button>
                                </div>
                              </>
                            )}
                            {materielPickerExerciseId === ex.id && (
                              <>
                                <div onClick={() => setMaterielPickerExerciseId(null)} style={{ position: 'fixed', inset: 0, zIndex: 90 }} />
                                <div style={{
                                  position: 'absolute', right: 0, top: '100%', marginTop: 6, width: 260, background: c.bg,
                                  border: `1px solid ${c.border}`, borderRadius: 8, boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
                                  zIndex: 100, padding: 12,
                                }}>
                                  <div style={{ fontSize: 11, fontWeight: 700, color: c.textMuted, textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 4 }}>
                                    <Backpack size={12} /> Matériel pour cet exercice
                                  </div>
                                  <input
                                    type="text"
                                    value={draftMateriel}
                                    onChange={e => setDraftMateriel(e.target.value)}
                                    onKeyDown={e => e.key === 'Enter' && confirmMaterielPicker()}
                                    placeholder="Ex. haltères 8kg, tapis"
                                    autoFocus
                                    style={{ ...input, marginBottom: 10 }}
                                  />
                                  <button onClick={confirmMaterielPicker} style={{ background: c.blue, color: '#fff', border: 'none', borderRadius: 6, padding: '7px 14px', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
                                    Done
                                  </button>
                                </div>
                              </>
                            )}
                          </div>
                        </div>
                      )}
                    </SortableItem>
                  ))}
                </SortableGroup>

                <button onClick={openFollowExercisePicker} style={{
                  display: 'flex', alignItems: 'center', gap: 8, border: 'none', background: 'none',
                  padding: '4px 0 20px', color: c.blue, fontWeight: 600, fontSize: 14, cursor: 'pointer',
                }}>
                  <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 20, height: 20, borderRadius: '50%', border: `1.5px solid ${c.blue}`, flexShrink: 0 }}>
                    <Plus size={11} weight="bold" />
                  </span>
                  Follow with another exercise (Superset / Triset / Circuit)
                </button>

                {isCircuitBlock ? (
                  <>
                  {/* Les vidéos d'abord : en séance, le coach les montre avant de lire la
                      consigne. L'explication reste sous le texte, et le mode de résultat ferme
                      le bloc. */}
                  <div style={{ marginBottom: 10 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: c.textFaint, textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: 6 }}>
                      Vidéos du circuit
                    </div>
                    <VideoListEditor
                      videos={activeBlock.circuitVideos || []}
                      onAdd={v => { majCircuit({ circuitVideos: [...(activeBlock.circuitVideos || []), v] }) }}
                      onRemove={idx => { majCircuit({ circuitVideos: (activeBlock.circuitVideos || []).filter((_, i) => i !== idx) }) }}
                      onUpdateUrl={(idx, url) => { majCircuit({ circuitVideos: (activeBlock.circuitVideos || []).map((v, i) => i === idx ? { ...v, video_url: url } : v) }) }}
                    />
                  </div>
                  <textarea
                    key={activeBlock.id}
                    defaultValue={activeBlock.circuitNote || ''}
                    onChange={e => {
                      const value = e.target.value
                      setBlocks(blocks.map((b, i) => (i === activeBlockIndex ? { ...b, circuitNote: value } : b)))
                      setUnsavedChanges(true)
                      e.target.style.height = 'auto'
                      e.target.style.height = `${e.target.scrollHeight}px`
                    }}
                    placeholder="Write the circuit"
                    rows={10}
                    style={{
                      width: '100%', boxSizing: 'border-box', border: `1px solid ${c.border}`, borderRadius: 8,
                      padding: '12px 14px', fontSize: 14, lineHeight: 1.5, outline: 'none', resize: 'none',
                      background: c.bg, fontFamily: 'inherit', color: c.text, overflow: 'hidden', minHeight: 220,
                    }}
                  />
                  <div style={{ marginTop: 10 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: c.textFaint, textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: 6 }}>
                      Ce qu&apos;on note à la fin
                    </div>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      {[{ key: null, label: 'Au choix du sportif' }, ...CIRCUIT_MODES].map(m => {
                        const actif = (activeBlock.circuitResultMode || null) === m.key
                        return (
                          <button key={m.key || 'libre'} type="button" onClick={() => majCircuit({ circuitResultMode: m.key })}
                            style={{
                              background: actif ? c.blue : c.bg, color: actif ? '#fff' : c.text,
                              border: `1px solid ${actif ? c.blue : c.border}`, borderRadius: 20,
                              padding: '6px 12px', fontSize: 12, fontWeight: 700, cursor: 'pointer',
                            }}>
                            {m.label}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                  </>
                ) : activityMode === 'cardio' ? (
                  // Pas de grille SET en mode cardio : un seul réglage d'allure (base + %low/%high)
                  // par exercice — l'allure ne varie pas set par set (voir updatePaceValue).
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    {activeBlock.exercises.map(ex => {
                      const pace = activeBlock.paceValues?.[ex.id] || { base: '', pctLow: '', pctHigh: '' }
                      const hasNote = Boolean(activeBlock.setNotes?.[setCellKey('note', ex.id)])
                      const cardioStructure = activeBlock.cardioStructures?.[ex.id] || null
                      const hasSteps = hasCardioSteps(cardioStructure)
                      const stepEditorOpen = cardioStepEditorExId === ex.id
                      return (
                        <div key={ex.id} style={{ border: `1px solid ${c.border}`, borderRadius: 8, padding: '14px 16px' }}>
                          <div style={{ fontSize: 14, fontWeight: 600, color: c.text, textDecoration: 'underline', marginBottom: 10 }}>{ex.name}</div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                            <select
                              value={pace.base}
                              onChange={e => updatePaceValue(ex.id, 'base', e.target.value)}
                              style={{ width: 140, boxSizing: 'border-box', border: `1px solid ${c.border}`, borderRadius: 6, padding: '8px 8px', fontSize: 13, outline: 'none', fontFamily: 'inherit', color: pace.base ? c.text : c.textFaint, background: c.bg }}
                            >
                              <option value="">Référence</option>
                              {PACE_BASES.map(b => <option key={b.key} value={b.key}>{b.label}</option>)}
                            </select>
                            <input
                              type="number"
                              placeholder="%1"
                              value={pace.pctLow}
                              onChange={e => updatePaceValue(ex.id, 'pctLow', e.target.value)}
                              style={{ width: 60, boxSizing: 'border-box', textAlign: 'center', border: `1px solid ${c.border}`, borderRadius: 6, padding: '8px 6px', fontSize: 14, outline: 'none', fontFamily: 'inherit' }}
                            />
                            <span style={{ color: c.textMuted, fontSize: 13 }}>–</span>
                            <input
                              type="number"
                              placeholder="%2"
                              value={pace.pctHigh}
                              onChange={e => updatePaceValue(ex.id, 'pctHigh', e.target.value)}
                              style={{ width: 60, boxSizing: 'border-box', textAlign: 'center', border: `1px solid ${c.border}`, borderRadius: 6, padding: '8px 6px', fontSize: 14, outline: 'none', fontFamily: 'inherit' }}
                            />
                            <span style={{ fontSize: 13, color: c.textMuted }}>%</span>
                          </div>
                          <div style={{ display: 'flex', gap: 8 }}>
                            <button
                              onClick={() => openSetNotesModal('note', ex.id)}
                              style={{
                                display: 'flex', alignItems: 'center', gap: 6, borderRadius: 6, padding: '6px 10px', fontSize: 12, cursor: 'pointer',
                                border: `1px solid ${hasNote ? c.blue : c.border}`, background: hasNote ? c.blueBorder : c.bg, color: hasNote ? c.blue : c.text,
                              }}
                            >
                              <FileText size={14} /> Notes
                            </button>
                            <button
                              onClick={() => setCardioStepEditorExId(stepEditorOpen ? null : ex.id)}
                              title="Structurer l'effort en plusieurs steps (échauffement/effort/récup), pour l'export .FIT montre"
                              style={{
                                display: 'flex', alignItems: 'center', gap: 6, borderRadius: 6, padding: '6px 10px', fontSize: 12, cursor: 'pointer',
                                border: `1px solid ${hasSteps ? c.blue : c.border}`, background: hasSteps ? c.blueBorder : c.bg, color: hasSteps ? c.blue : c.text,
                              }}
                            >
                              <ListBullets size={14} />
                              {hasSteps ? `${cardioStructure.blocks.length} bloc${cardioStructure.blocks.length > 1 ? 's' : ''} de steps` : 'Structurer en steps'}
                            </button>
                          </div>
                          {stepEditorOpen && (
                            <div style={{ marginTop: 12, paddingTop: 12, borderTop: `1px solid ${c.border}` }}>
                              <CardioStepEditor
                                value={cardioStructure}
                                onChange={structure => updateCardioStructure(ex.id, structure)}
                              />
                              {hasSteps && (
                                <button
                                  onClick={() => updateCardioStructure(ex.id, null)}
                                  style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 6, border: 'none', background: 'none', padding: '4px 2px', cursor: 'pointer', color: '#991B1B', fontSize: 12, fontWeight: 600 }}
                                >
                                  <X size={13} /> Retirer la structure détaillée
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                ) : (
                  <>
                    {activeBlock.sets.map((s, i) => (
                      <div key={s.id}>
                        <div style={{ border: `1px solid ${c.border}`, borderRadius: 8, padding: '14px 16px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                            <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.5px', background: c.text, color: '#fff', padding: '4px 10px', borderRadius: 4 }}>
                              SET {i + 1}
                            </span>
                            {i > 0 && (
                              <button onClick={() => removeSet(s.id)} style={{ display: 'flex', background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: c.textMuted }}>
                                <X size={16} />
                              </button>
                            )}
                          </div>
                          {activeBlock.exercises.map(ex => {
                            const hasNote = Boolean(activeBlock.setNotes?.[setCellKey(s.id, ex.id)])
                            const value = activeBlock.setValues?.[setCellKey(s.id, ex.id)] || { reps: '', kg: '', tempo: '' }
                            return (
                              <div key={ex.id} style={{ marginBottom: 10 }}>
                                <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap', marginBottom: 6 }}>
                                  <span style={{ fontSize: 14, fontWeight: 600, color: c.text, textDecoration: 'underline' }}>{ex.name}</span>
                                  {ex.muscles && (
                                    <span style={{ fontSize: 11, color: c.textMuted, background: c.disabledBg, borderRadius: 5, padding: '2px 8px' }}>
                                      {ex.muscles}
                                    </span>
                                  )}
                                </div>
                                {canManageCatalog && (
                                  <button
                                    onClick={() => openAdvancedSettings(ex)}
                                    style={{ display: 'block', border: 'none', background: 'none', padding: 0, marginBottom: 8, color: c.blue, fontSize: 12, textDecoration: 'underline', cursor: 'pointer' }}
                                  >
                                    Advanced settings
                                  </button>
                                )}
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                                  <span style={{ fontSize: 12, color: c.textMuted }}>Tempo</span>
                                  <input
                                    type="text"
                                    inputMode="text"
                                    maxLength={4}
                                    placeholder="3010"
                                    value={value.tempo || ''}
                                    onChange={e => updateSetValue(s.id, ex.id, 'tempo', e.target.value.toUpperCase().replace(/[^0-9X]/g, ''))}
                                    style={{ width: 70, boxSizing: 'border-box', textAlign: 'center', letterSpacing: '2px', border: `1px solid ${c.border}`, borderRadius: 6, padding: '6px 6px', fontSize: 14, outline: 'none', fontFamily: 'inherit' }}
                                  />
                                </div>
                                <button
                                  onClick={() => openSetNotesModal(s.id, ex.id)}
                                  style={{
                                    display: 'flex', alignItems: 'center', gap: 6, borderRadius: 6, padding: '6px 10px', fontSize: 12, cursor: 'pointer', marginBottom: 10,
                                    border: `1px solid ${hasNote ? c.blue : c.border}`, background: hasNote ? c.blueBorder : c.bg, color: hasNote ? c.blue : c.text,
                                  }}
                                >
                                  <FileText size={14} /> Notes
                                </button>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                  <input
                                    type="text"
                                    placeholder=""
                                    value={value.reps}
                                    onChange={e => updateSetValue(s.id, ex.id, 'reps', e.target.value)}
                                    style={{ width: 60, boxSizing: 'border-box', textAlign: 'center', border: `1px solid ${c.border}`, borderRadius: 6, padding: '8px 6px', fontSize: 14, outline: 'none', fontFamily: 'inherit' }}
                                  />
                                  <span style={{ fontSize: 13, color: c.textMuted }}>rep</span>
                                  <input
                                    type="number"
                                    step="0.5"
                                    min="0"
                                    placeholder=""
                                    value={value.kg}
                                    onChange={e => updateSetValue(s.id, ex.id, 'kg', e.target.value)}
                                    style={{ width: 60, boxSizing: 'border-box', textAlign: 'center', border: `1px solid ${c.border}`, borderRadius: 6, padding: '8px 6px', fontSize: 14, outline: 'none', fontFamily: 'inherit' }}
                                  />
                                  <span style={{ fontSize: 13, color: c.textMuted }}>kg</span>
                                  {activeBlock.sets.length > 1 && (value.reps || value.kg) && (
                                    <div style={{ position: 'relative' }}>
                                      <button
                                        onClick={() => setCopyMenuOpenKey(k => k === setCellKey(s.id, ex.id) ? null : setCellKey(s.id, ex.id))}
                                        title="Dupliquer reps/kg"
                                        style={{ display: 'flex', alignItems: 'center', gap: 4, border: 'none', background: 'none', padding: '4px 6px', cursor: 'pointer', color: c.blue, fontSize: 12 }}
                                      >
                                        <CopySimple size={14} />
                                      </button>
                                      {copyMenuOpenKey === setCellKey(s.id, ex.id) && (
                                        <>
                                          <div onClick={() => setCopyMenuOpenKey(null)} style={{ position: 'fixed', inset: 0, zIndex: 90 }} />
                                          <div style={{
                                            position: 'absolute', left: 0, top: '100%', marginTop: 4, background: c.bg, border: `1px solid ${c.border}`,
                                            borderRadius: 8, boxShadow: '0 8px 24px rgba(0,0,0,0.12)', zIndex: 100, padding: 6,
                                            display: 'flex', flexDirection: 'column', gap: 2, width: 170, whiteSpace: 'nowrap',
                                          }}>
                                            {i < activeBlock.sets.length - 1 && (
                                              <button
                                                onClick={() => { copySetValueToNextSet(s.id, ex.id); setCopyMenuOpenKey(null) }}
                                                style={{ textAlign: 'left', padding: '6px 8px', borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: 'pointer', border: 'none', background: 'none', color: c.text }}
                                              >
                                                Set suivant
                                              </button>
                                            )}
                                            <button
                                              onClick={() => { copySetValueToAllSets(s.id, ex.id); setCopyMenuOpenKey(null) }}
                                              style={{ textAlign: 'left', padding: '6px 8px', borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: 'pointer', border: 'none', background: 'none', color: c.text }}
                                            >
                                              Tous les sets
                                            </button>
                                          </div>
                                        </>
                                      )}
                                    </div>
                                  )}
                                </div>
                              </div>
                            )
                          })}
                        </div>
                        {i < activeBlock.sets.length - 1 && <RestDivider seconds={activeBlock.restSeconds} onChange={updateBlockRest} />}
                      </div>
                    ))}

                    <button onClick={addSet} style={{
                      display: 'flex', alignItems: 'center', gap: 8, border: 'none', background: 'none',
                      padding: '14px 0 4px', color: c.blue, fontWeight: 600, fontSize: 14, cursor: 'pointer',
                    }}>
                      <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 20, height: 20, borderRadius: '50%', border: `1.5px solid ${c.blue}`, flexShrink: 0 }}>
                        <Plus size={11} weight="bold" />
                      </span>
                      Add set
                    </button>
                    <RestDivider seconds={activeBlock.restSeconds} onChange={updateBlockRest} />
                  </>
                )}
              </div>
            ) : (
              <div style={{ padding: 16 }}>
                <button onClick={openExercisePickerForBlock} style={{
                  width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                  border: `1.5px solid ${c.blue}`, color: c.blue, fontWeight: 700, fontSize: 14, borderRadius: 6,
                  padding: '10px', background: c.bg, cursor: 'pointer',
                }}>
                  <Plus size={15} weight="bold" /> Create from library
                </button>
              </div>
            )}

            {!['exercise', 'circuit'].includes(activeBlock.type) && (
              <>
                <button onClick={openDescModal} style={{
                  display: 'flex', alignItems: 'center', gap: 10, padding: '2px 16px 16px', width: '100%',
                  border: 'none', background: 'none', cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit',
                }}>
                  <span style={{ flex: 1, fontStyle: 'italic', fontSize: 14, color: activeBlock.name ? c.text : c.textFaint }}>
                    {activeBlock.name || BLOCK_META[activeBlock.type].namePlaceholder}
                  </span>
                  <PencilSimple size={16} style={{ color: c.textMuted, flexShrink: 0 }} />
                </button>

                <div style={{ padding: '0 16px 16px' }}>
                  <button onClick={openDescModal} style={{
                    display: 'flex', alignItems: 'flex-start', gap: 10, background: c.disabledBg, borderRadius: 8,
                    padding: '12px 14px', width: '100%', border: 'none', cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit',
                  }}>
                    <span style={{ flex: 1, fontStyle: 'italic', fontSize: 14, color: activeBlock.description ? c.text : c.textFaint, whiteSpace: 'pre-wrap' }}>
                      {activeBlock.description || BLOCK_META[activeBlock.type].descriptionPlaceholder}
                    </span>
                    <PencilSimple size={16} style={{ color: c.textMuted, flexShrink: 0, marginTop: 2 }} />
                  </button>
                </div>

                <button onClick={openDescModal} style={{
                  display: 'flex', alignItems: 'center', gap: 10, padding: '0 16px 18px', width: '100%',
                  border: 'none', background: 'none', cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit',
                }}>
                  <span style={{ flex: 1, fontStyle: 'italic', fontSize: 14, color: activeBlock.note ? c.text : c.textFaint, whiteSpace: 'pre-wrap' }}>
                    {activeBlock.note || 'Write a note'}
                  </span>
                  <PencilSimple size={16} style={{ color: c.textMuted, flexShrink: 0 }} />
                </button>
              </>
            )}
          </div>
        )}
        </>
        )}

        {sessionType === 'explication' && (
          <div style={{ marginTop: 8 }}>
            <label style={{ fontSize: 13, color: c.textMuted, marginBottom: 6, display: 'block' }}>Video link</label>
            <input
              value={explicationVideo}
              onChange={e => { setExplicationVideo(e.target.value); setUnsavedChanges(true) }}
              placeholder="https://…"
              style={{ ...input, width: '100%' }}
            />
          </div>
        )}

        {/* Modal Description (nom + description + notes) */}
        {descModalOpen && (
          <>
            <div onClick={closeDescModal} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 200 }} />
            <div style={{
              position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', zIndex: 201,
              width: 640, maxWidth: 'calc(100vw - 32px)', maxHeight: 'calc(100vh - 64px)', overflowY: 'auto',
              background: c.bg, borderRadius: 10, boxShadow: '0 20px 60px rgba(0,0,0,0.25)',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px 24px', borderBottom: `1px solid ${c.border}` }}>
                <span style={{ fontSize: 22, fontWeight: 700, color: c.text }}>Description</span>
                <button onClick={closeDescModal} style={{ display: 'flex', background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: c.text }}>
                  <X size={20} />
                </button>
              </div>

              <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 20 }}>
                <div>
                  <input
                    value={draftName}
                    onChange={e => setDraftName(e.target.value)}
                    placeholder="Name (optional)"
                    style={{ ...input, fontSize: 15, padding: '11px 14px' }}
                  />
                </div>

                <div>
                  <label style={{ ...label, fontSize: 15, fontWeight: 700, marginBottom: 8 }}>Description</label>
                  <div style={{ border: `1px solid ${c.border}`, borderRadius: 6 }}>
                    <div style={{ position: 'relative' }}>
                      <div ref={descriptionBackdropRef} aria-hidden style={{
                        position: 'absolute', inset: 0, padding: '12px 14px', fontSize: 14, lineHeight: 1.5,
                        fontFamily: 'inherit', whiteSpace: 'pre-wrap', wordBreak: 'break-word', color: c.text,
                        pointerEvents: 'none', overflow: 'hidden',
                      }}>
                        {renderHighlightedDescription(draftDescription)}
                      </div>
                      <textarea
                        ref={descriptionRef}
                        value={draftDescription}
                        onChange={handleDescriptionChange}
                        onScroll={e => { if (descriptionBackdropRef.current) descriptionBackdropRef.current.scrollTop = e.target.scrollTop }}
                        onBlur={() => setMentionQuery(null)}
                        placeholder={activeBlock ? BLOCK_META[activeBlock.type].descriptionPlaceholder : ''}
                        rows={3}
                        style={{
                          position: 'relative', width: '100%', boxSizing: 'border-box', border: 'none', borderRadius: '6px 6px 0 0',
                          padding: '12px 14px', fontSize: 14, lineHeight: 1.5, outline: 'none', resize: 'none', background: 'transparent',
                          fontFamily: 'inherit', color: 'transparent', caretColor: c.text,
                        }}
                      />
                      {mentionQuery !== null && mentionMatches.length > 0 && (
                        <div style={{
                          position: 'absolute', left: 0, right: 0, top: '100%', background: c.bg,
                          border: `1px solid ${c.border}`, borderRadius: 8, boxShadow: '0 12px 32px rgba(0,0,0,0.18)',
                          zIndex: 10, padding: 6, display: 'flex', flexDirection: 'column', gap: 1,
                          maxHeight: 320, overflowY: 'auto',
                        }}>
                          {mentionMatches.map((m, i) => (
                            <button
                              key={m.id}
                              onMouseDown={e => e.preventDefault()}
                              onClick={() => pickMovement(m.name)}
                              style={{
                                display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '12px 14px', borderRadius: 6, fontSize: 15,
                                color: c.text, background: i === 0 ? c.blueBorder : 'none', border: 'none', cursor: 'pointer', textAlign: 'left',
                              }}
                            >
                              <span style={{ flex: 1 }}>{m.name}</span>
                              {m.videoUrl && <VideoCamera size={15} style={{ color: c.blue, flexShrink: 0 }} />}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 14px', borderTop: `1px solid ${c.border}`, borderRadius: '0 0 6px 6px', background: c.disabledBg, flexWrap: 'wrap' }}>
                      <button onClick={openExercisePicker} style={{
                        display: 'inline-flex', alignItems: 'center', gap: 6, border: `1px solid ${c.blue}`, color: c.blue,
                        fontWeight: 700, fontSize: 13, borderRadius: 6, padding: '6px 12px', background: c.bg, cursor: 'pointer',
                      }}>
                        <Plus size={13} weight="bold" /> Exercises
                      </button>
                      {canManageCatalog && (
                        <div style={{ position: 'relative' }}>
                          <button onClick={() => setPresetsMenuOpen(v => !v)} style={{
                            display: 'inline-flex', alignItems: 'center', gap: 6, border: `1px solid ${c.border}`, color: c.text,
                            fontWeight: 700, fontSize: 13, borderRadius: 6, padding: '6px 12px', background: c.bg, cursor: 'pointer',
                          }}>
                            <Heartbeat size={13} /> Pré-construites
                          </button>
                          {presetsMenuOpen && (
                            <>
                              <div onClick={() => setPresetsMenuOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 210 }} />
                              <div style={{
                                position: 'absolute', bottom: '100%', left: 0, marginBottom: 6, width: 280, maxHeight: 280, overflowY: 'auto',
                                background: c.bg, border: `1px solid ${c.border}`, borderRadius: 8, boxShadow: '0 12px 32px rgba(0,0,0,0.18)',
                                zIndex: 211, padding: 6,
                              }}>
                                {activationPresets === null ? (
                                  <div style={{ padding: 12, fontSize: 13, color: c.textMuted }}>Chargement…</div>
                                ) : activationPresets.length === 0 ? (
                                  <div style={{ padding: 12, fontSize: 13, color: c.textMuted }}>
                                    Aucune activation pré-construite — gère-les dans Bibliothèque → Activations.
                                  </div>
                                ) : activationPresets.map(preset => (
                                  <button
                                    key={preset.id}
                                    onClick={() => applyPreset(preset)}
                                    style={{
                                      display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '10px 12px', borderRadius: 6,
                                      fontSize: 13, fontWeight: 600, color: c.text, background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left',
                                    }}
                                  >
                                    <span style={{ flex: 1 }}>{preset.name}</span>
                                    {preset.videos?.length > 0 && <VideoCamera size={13} style={{ color: c.blue, flexShrink: 0 }} />}
                                  </button>
                                ))}
                              </div>
                            </>
                          )}
                        </div>
                      )}
                      <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: c.textMuted }}>
                        <Info size={13} /> You can also use the # character to add an exercise
                      </span>
                    </div>
                  </div>
                </div>

                <div>
                  <label style={{ ...label, fontSize: 15, fontWeight: 700, marginBottom: 8 }}>Notes (optional)</label>
                  <div style={{ border: `1px solid ${c.border}`, borderRadius: 6, overflow: 'hidden' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 2, padding: '8px 10px', borderBottom: `1px solid ${c.border}` }}>
                      {[TextB, TextItalic, LinkSimple, ListBullets, TextTSlash].map((Icon, i) => (
                        <button key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 28, height: 28, border: 'none', background: 'none', borderRadius: 4, color: c.textMuted, cursor: 'pointer' }}>
                          <Icon size={15} />
                        </button>
                      ))}
                    </div>
                    <textarea
                      value={draftNote}
                      onChange={e => setDraftNote(e.target.value)}
                      placeholder="Write a note"
                      rows={2}
                      style={{ width: '100%', boxSizing: 'border-box', border: 'none', padding: '12px 14px', fontSize: 14, outline: 'none', resize: 'none', background: 'transparent', fontFamily: 'inherit', color: c.text }}
                    />
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, padding: '16px 24px', borderTop: `1px solid ${c.border}` }}>
                <button onClick={closeDescModal} style={{
                  border: `1px solid ${c.border}`, color: c.text, fontWeight: 600, fontSize: 14, borderRadius: 6,
                  padding: '9px 20px', background: c.bg, cursor: 'pointer',
                }}>
                  Close
                </button>
                <button onClick={confirmDescModal} style={{
                  border: `1px solid ${c.blue}`, color: c.blue, fontWeight: 600, fontSize: 14, borderRadius: 6,
                  padding: '9px 20px', background: c.bg, cursor: 'pointer',
                }}>
                  Ok
                </button>
              </div>
            </div>
          </>
        )}

        {/* Modale timer (séance ou bloc) : configure seulement (EMOM/AMRAP/TABATA/Perso) — le
            lancement réel se fait à l'exécution de la séance, voir openSessionTimerEditor. */}
        {timerEditor && (
          <>
            <div onClick={closeTimerEditor} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 200 }} />
            <div style={{
              position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', zIndex: 201,
              width: 420, maxWidth: 'calc(100vw - 32px)', maxHeight: 'calc(100vh - 64px)', overflowY: 'auto',
              background: c.bg, borderRadius: 10, boxShadow: '0 20px 60px rgba(0,0,0,0.25)',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px 24px', borderBottom: `1px solid ${c.border}` }}>
                <span style={{ fontSize: 20, fontWeight: 700, color: c.text }}>
                  {timerEditor.scope === 'session' ? 'Timer de la séance' : 'Timer du bloc'}
                </span>
                <button onClick={closeTimerEditor} style={{ display: 'flex', background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: c.text }}>
                  <X size={20} />
                </button>
              </div>
              <div style={{ padding: 24 }}>
                <TimerConfigEditor value={timerDraft} onChange={setTimerDraft} />
              </div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '16px 24px', borderTop: `1px solid ${c.border}` }}>
                <button onClick={removeTimerEditor} style={{ border: 'none', color: '#DC2626', fontWeight: 600, fontSize: 14, background: 'none', cursor: 'pointer', padding: '9px 4px' }}>
                  Retirer le timer
                </button>
                <div style={{ display: 'flex', gap: 10 }}>
                  <button onClick={closeTimerEditor} style={{ border: `1px solid ${c.border}`, color: c.text, fontWeight: 600, fontSize: 14, borderRadius: 6, padding: '9px 20px', background: c.bg, cursor: 'pointer' }}>
                    Annuler
                  </button>
                  <button onClick={saveTimerEditor} style={{ border: `1px solid ${c.blue}`, color: c.blue, fontWeight: 600, fontSize: 14, borderRadius: 6, padding: '9px 20px', background: c.bg, cursor: 'pointer' }}>
                    Ok
                  </button>
                </div>
              </div>
            </div>
          </>
        )}

        {/* Modale "Create from library" pour warmup/cooldown : bibliothèque d'activations
            pré-construites plutôt que la recherche mouvement par mouvement. */}
        {warmupLibraryOpen && (
          <>
            <div onClick={() => setWarmupLibraryOpen(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 200 }} />
            <div style={{
              position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', zIndex: 201,
              width: 480, maxWidth: 'calc(100vw - 32px)', maxHeight: 'calc(100vh - 64px)', display: 'flex', flexDirection: 'column',
              background: c.bg, borderRadius: 10, boxShadow: '0 20px 60px rgba(0,0,0,0.25)', overflow: 'hidden',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px 24px', borderBottom: `1px solid ${c.border}` }}>
                <span style={{ fontSize: 22, fontWeight: 700, color: c.text }}>Activations</span>
                <button onClick={() => setWarmupLibraryOpen(false)} style={{ display: 'flex', background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: c.text }}>
                  <X size={20} />
                </button>
              </div>

              <div style={{ flex: 1, overflowY: 'auto', padding: '8px 16px' }}>
                {activationPresets === null ? (
                  <div style={{ padding: '20px 8px', fontSize: 14, color: c.textMuted }}>Chargement…</div>
                ) : activationPresets.length === 0 ? (
                  <div style={{ padding: '20px 8px', fontSize: 14, color: c.textMuted }}>
                    Aucune activation pré-construite — gère-les dans Bibliothèque → Activations.
                  </div>
                ) : activationPresets.map(preset => (
                  <div key={preset.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 8px', borderBottom: `1px solid ${c.border}` }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 15, fontWeight: 600, color: c.text }}>{preset.name}</div>
                      {preset.videos?.length > 0 && (
                        <div style={{ fontSize: 12, color: c.textMuted, marginTop: 2 }}>{preset.videos.length} mouvement{preset.videos.length > 1 ? 's' : ''}</div>
                      )}
                    </div>
                    <button onClick={() => applyPresetToActiveBlock(preset)} style={{
                      display: 'inline-flex', alignItems: 'center', gap: 6, border: `1px solid ${c.blue}`, color: c.blue,
                      fontWeight: 700, fontSize: 13, borderRadius: 6, padding: '7px 14px', background: c.bg, cursor: 'pointer', flexShrink: 0,
                    }}>
                      <Plus size={13} weight="bold" /> Ajouter
                    </button>
                  </div>
                ))}
              </div>

              <div style={{ padding: '14px 24px', borderTop: `1px solid ${c.border}` }}>
                <button onClick={openMovementPickerDirectly} style={{
                  border: 'none', background: 'none', color: c.textMuted, fontSize: 13, fontWeight: 600,
                  textDecoration: 'underline', cursor: 'pointer', padding: 0,
                }}>
                  Chercher un mouvement précis à la place
                </button>
              </div>
            </div>
          </>
        )}

        {/* Modale Exercises (Create from library) */}
        {exercisesModalOpen && (
          <>
            <div onClick={closeExercisesModal} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 200 }} />
            <div style={{
              position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', zIndex: 201,
              width: 1100, maxWidth: 'calc(100vw - 32px)', height: 'calc(100vh - 64px)', display: 'flex', flexDirection: 'column',
              background: c.bg, borderRadius: 10, boxShadow: '0 20px 60px rgba(0,0,0,0.25)', overflow: 'hidden',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px 24px', borderBottom: `1px solid ${c.border}` }}>
                <span style={{ fontSize: 22, fontWeight: 700, color: c.text }}>{replacingExerciseId ? 'Replace exercise' : 'Exercises'}</span>
                <button onClick={closeExercisesModal} style={{ display: 'flex', background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: c.text }}>
                  <X size={20} />
                </button>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, padding: '14px 24px', borderBottom: `1px solid ${c.border}`, flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', gap: 24 }}>
                  <span style={{
                    fontSize: 13, fontWeight: 700, letterSpacing: '0.3px', textTransform: 'uppercase',
                    color: c.text, paddingBottom: 10, borderBottom: `2px solid ${c.text}`,
                  }}>
                    Explore
                  </span>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <div style={{ position: 'relative' }}>
                    <MagnifyingGlass size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: c.textMuted }} />
                    <input
                      value={exerciseSearch}
                      onChange={e => setExerciseSearch(e.target.value)}
                      placeholder="Search"
                      style={{ ...input, width: 220, paddingLeft: 30 }}
                    />
                  </div>
                  {canManageCatalog && (
                    <button onClick={openCreateMovement} style={{
                      border: `1px dashed ${c.blue}`, color: c.blue, background: 'none', borderRadius: 6,
                      padding: '9px 14px', fontSize: 13, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap',
                    }}>
                      + Nouveau mouvement
                    </button>
                  )}
                  {isCircuitBlock && (
                    <button
                      onClick={confirmCircuitSelection}
                      disabled={pendingCircuitExercises.length === 0}
                      style={{
                        background: pendingCircuitExercises.length === 0 ? c.disabledBg : c.blue,
                        color: pendingCircuitExercises.length === 0 ? c.disabled : '#fff',
                        border: 'none', borderRadius: 6, padding: '9px 18px', fontSize: 13, fontWeight: 700,
                        cursor: pendingCircuitExercises.length === 0 ? 'not-allowed' : 'pointer',
                      }}
                    >
                      Add ({pendingCircuitExercises.length})
                    </button>
                  )}
                </div>
              </div>

              <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
                <div style={{ width: 260, flexShrink: 0, borderRight: `1px solid ${c.border}`, overflowY: 'auto', padding: 20 }}>
                  {isCircuitBlock && pendingCircuitExercises.length > 0 && (
                    <div style={{ marginBottom: 20, display: 'flex', flexDirection: 'column', gap: 6 }}>
                      <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.5px', color: c.textMuted }}>
                        SELECTED ({pendingCircuitExercises.length})
                      </div>
                      {pendingCircuitExercises.map(ex => (
                        <div key={ex.name} style={{
                          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
                          background: c.blueBorder, border: `1px solid ${c.blueBorder}`, borderRadius: 6, padding: '6px 10px',
                        }}>
                          <span style={{ fontSize: 12, fontWeight: 600, color: c.blue, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {ex.name}
                          </span>
                          <button onClick={() => toggleCircuitPending(ex)} style={{ display: 'flex', flexShrink: 0, background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: c.blue }}>
                            <X size={13} weight="bold" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                  <div style={{ fontSize: 13, color: c.text, marginBottom: 12 }}>{filteredExercises.length} exercise(s)</div>
                  {activityMode === 'cardio' ? (
                    <div style={{ fontSize: 12, color: c.textMuted, lineHeight: 1.5 }}>
                      Mode Cardio : seuls les mouvements Run / Row / Ski Erg / Bike sont proposés.
                    </div>
                  ) : (
                    <>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                        <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.5px', color: c.textMuted }}>MUSCLES</span>
                        {selectedMuscles.length > 0 && (
                          <button onClick={() => setSelectedMuscles([])} style={{ border: 'none', background: 'none', color: c.blue, cursor: 'pointer', padding: 0, fontSize: 11, fontWeight: 600 }}>
                            NONE
                          </button>
                        )}
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
                        {REAL_MUSCLE_GROUPS.map(group => {
                          const active = selectedMuscles.includes(group.key)
                          return (
                            <button key={group.key} onClick={() => toggleMuscle(group.key)} style={{
                              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
                              background: 'none', border: 'none', cursor: 'pointer', padding: 0,
                            }}>
                              <span style={{
                                width: 36, height: 36, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                fontSize: 11, fontWeight: 700, background: active ? c.blue : c.disabledBg, color: active ? '#fff' : c.textMuted,
                              }}>
                                {group.label.slice(0, 2).toUpperCase()}
                              </span>
                              <span style={{ fontSize: 10, color: c.textMuted, textAlign: 'center' }}>{group.label}</span>
                            </button>
                          )
                        })}
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', margin: '20px 0 14px' }}>
                        <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.5px', color: c.textMuted }}>ARTICULATIONS</span>
                        {selectedJoints.length > 0 && (
                          <button onClick={() => setSelectedJoints([])} style={{ border: 'none', background: 'none', color: c.blue, cursor: 'pointer', padding: 0, fontSize: 11, fontWeight: 600 }}>
                            NONE
                          </button>
                        )}
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
                        {JOINT_GROUPS.map(group => {
                          const active = selectedJoints.includes(group.key)
                          return (
                            <button key={group.key} onClick={() => toggleJoint(group.key)} style={{
                              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
                              background: 'none', border: 'none', cursor: 'pointer', padding: 0,
                            }}>
                              <span style={{
                                width: 36, height: 36, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                fontSize: 11, fontWeight: 700, background: active ? c.blue : c.disabledBg, color: active ? '#fff' : c.textMuted,
                              }}>
                                {group.label.slice(0, 2).toUpperCase()}
                              </span>
                              <span style={{ fontSize: 10, color: c.textMuted, textAlign: 'center' }}>{group.label}</span>
                            </button>
                          )
                        })}
                      </div>
                    </>
                  )}
                </div>

                <div style={{ flex: 1, overflowY: 'auto', padding: '8px 24px' }}>
                  {filteredExercises.map(ex => {
                    const alreadyInBlock = activeBlock?.exercises?.some(e => e.name === ex.name)
                    const isPending = pendingCircuitExercises.some(p => p.name === ex.name)
                    const added = alreadyInBlock || (isCircuitBlock && isPending)
                    return (
                      <div key={ex.id} style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '14px 0', borderBottom: `1px solid ${c.border}` }}>
                        <div style={{
                          width: 64, height: 64, flexShrink: 0, borderRadius: 6, background: c.text, color: '#fff',
                          display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center',
                          fontSize: 9, fontWeight: 700, textTransform: 'uppercase', padding: 4, lineHeight: 1.2,
                        }}>
                          {ex.name}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 15, fontWeight: 600, color: c.text, textDecoration: 'underline' }}>{ex.name}</div>
                          {ex.muscles && (
                            <span style={{ display: 'inline-block', marginTop: 6, fontSize: 11, color: c.textMuted, background: c.disabledBg, borderRadius: 5, padding: '2px 8px' }}>
                              {ex.muscles}
                            </span>
                          )}
                        </div>
                        <button
                          onClick={() => {
                            // Détour séries/récup réservé au coach (canManageCatalog) et à la toute
                            // première sélection du bloc — pas pour un ajout en superset
                            // (addingSecondaryExercise) ni en circuit, et jamais en cardio où
                            // l'allure se règle par exercice (base + %low/%high), voir la vue
                            // cardio ci-dessous. Le sportif en "Séance libre" ajoute toujours
                            // directement avec 1 série de base (voir addExerciseToActiveBlock).
                            if (replacingExerciseId) {
                              replaceExerciseInActiveBlock(ex)
                            } else if (isCircuitBlock) {
                              if (!alreadyInBlock) toggleCircuitPending(ex)
                            } else if (!canManageCatalog || addingSecondaryExercise || activityMode === 'cardio') {
                              addExerciseToActiveBlock(ex)
                            } else {
                              startExerciseConfig(ex)
                            }
                          }}
                          disabled={!activeBlock || (!replacingExerciseId && alreadyInBlock)}
                          style={{
                            display: 'flex', alignItems: 'center', justifyContent: 'center', width: 32, height: 32, borderRadius: '50%',
                            border: `1.5px solid ${added ? c.blue : c.border}`, background: added ? c.blue : c.bg,
                            color: added ? '#fff' : c.text,
                            cursor: activeBlock && (replacingExerciseId || !alreadyInBlock) ? 'pointer' : 'not-allowed', flexShrink: 0,
                          }}
                        >
                          {added ? <Check size={16} weight="bold" /> : <Plus size={16} />}
                        </button>
                      </div>
                    )
                  })}
                  {filteredExercises.length === 0 && (
                    <div style={{ padding: '40px 0', textAlign: 'center' }}>
                      <div style={{ fontSize: 14, color: c.textMuted, marginBottom: canManageCatalog ? 14 : 0 }}>No exercise matches your filters.</div>
                      {canManageCatalog && (
                        <button onClick={openCreateMovement} style={{
                          border: `1px dashed ${c.blue}`, color: c.blue, background: 'none', borderRadius: 6,
                          padding: '9px 18px', fontSize: 13, fontWeight: 600, cursor: 'pointer',
                        }}>
                          + Créer{exerciseSearch.trim() ? ` « ${exerciseSearch.trim()} »` : ''} comme nouveau mouvement
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </>
        )}

        {/* Création rapide d'un mouvement absent du catalogue, sans quitter la modale Exercises —
            seul le nom est requis (muscles/vidéo facultatifs, complétables plus tard depuis
            /movements). Se referme en sélectionnant directement le mouvement créé. */}
        {createMovementOpen && (
          <>
            <div onClick={() => setCreateMovementOpen(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 210 }} />
            <div style={{
              position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', zIndex: 211,
              width: 520, maxWidth: 'calc(100vw - 32px)', maxHeight: 'calc(100vh - 64px)', overflowY: 'auto',
              background: c.bg, borderRadius: 10, boxShadow: '0 20px 60px rgba(0,0,0,0.25)',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px 24px', borderBottom: `1px solid ${c.border}` }}>
                <span style={{ fontSize: 22, fontWeight: 700, color: c.text }}>Nouveau mouvement</span>
                <button onClick={() => setCreateMovementOpen(false)} style={{ display: 'flex', background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: c.text }}>
                  <X size={20} />
                </button>
              </div>

              <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 18 }}>
                <div>
                  <span style={label}>Nom *</span>
                  <input
                    value={newMovementName}
                    onChange={e => setNewMovementName(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && createMovement()}
                    placeholder="Ex: Développé incliné haltères…"
                    autoFocus
                    style={input}
                  />
                </div>

                <div>
                  <span style={label}>Muscles (facultatif)</span>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {REAL_MUSCLE_GROUPS.map(group => {
                      const active = newMovementMuscles.includes(group.key)
                      return (
                        <button key={group.key} onClick={() => toggleNewMovementMuscle(group.key)} style={{
                          border: `1.5px solid ${active ? c.blue : c.border}`, background: active ? c.blueBorder : c.bg,
                          color: active ? c.blue : c.textMuted, borderRadius: 20, padding: '5px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer',
                        }}>
                          {group.label}
                        </button>
                      )
                    })}
                  </div>
                </div>

                <div>
                  <span style={label}>Articulations (facultatif)</span>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {JOINT_GROUPS.map(group => {
                      const active = newMovementJoints.includes(group.key)
                      return (
                        <button key={group.key} onClick={() => toggleNewMovementJoint(group.key)} style={{
                          border: `1.5px solid ${active ? c.blue : c.border}`, background: active ? c.blueBorder : c.bg,
                          color: active ? c.blue : c.textMuted, borderRadius: 20, padding: '5px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer',
                        }}>
                          {group.label}
                        </button>
                      )
                    })}
                  </div>
                </div>

                <div>
                  <span style={label}>Vidéo (facultatif)</span>
                  <input
                    value={newMovementVideoUrl}
                    onChange={e => setNewMovementVideoUrl(e.target.value)}
                    placeholder="Lien YouTube…"
                    style={input}
                  />
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, padding: '16px 24px', borderTop: `1px solid ${c.border}` }}>
                <button onClick={() => setCreateMovementOpen(false)} style={{
                  border: `1px solid ${c.border}`, color: c.text, fontWeight: 600, fontSize: 14, borderRadius: 6,
                  padding: '9px 20px', background: c.bg, cursor: 'pointer',
                }}>
                  Annuler
                </button>
                <button
                  onClick={createMovement}
                  disabled={!newMovementName.trim() || creatingMovement}
                  style={{
                    border: 'none', color: '#fff', fontWeight: 700, fontSize: 14, borderRadius: 6, padding: '9px 20px',
                    background: (!newMovementName.trim() || creatingMovement) ? c.disabledBg : c.blue,
                    cursor: (!newMovementName.trim() || creatingMovement) ? 'not-allowed' : 'pointer',
                  }}
                >
                  {creatingMovement ? '…' : 'Créer et sélectionner'}
                </button>
              </div>
            </div>
          </>
        )}

        {/* Advanced settings (coach uniquement) : muscles + vidéo du mouvement, retrouvé par nom
            dans le catalogue partagé (movements) — voir openAdvancedSettings/saveAdvancedSettings. */}
        {advancedSettingsExercise && (
          <>
            <div onClick={closeAdvancedSettings} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 210 }} />
            <div style={{
              position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', zIndex: 211,
              width: 520, maxWidth: 'calc(100vw - 32px)', maxHeight: 'calc(100vh - 64px)', overflowY: 'auto',
              background: c.bg, borderRadius: 10, boxShadow: '0 20px 60px rgba(0,0,0,0.25)',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px 24px', borderBottom: `1px solid ${c.border}` }}>
                <span style={{ fontSize: 22, fontWeight: 700, color: c.text }}>{advancedSettingsExercise.name}</span>
                <button onClick={closeAdvancedSettings} style={{ display: 'flex', background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: c.text }}>
                  <X size={20} />
                </button>
              </div>

              <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 18 }}>
                <div>
                  <span style={label}>Muscles</span>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {REAL_MUSCLE_GROUPS.map(group => {
                      const active = advancedDraftMuscles.includes(group.key)
                      return (
                        <button key={group.key} onClick={() => toggleAdvancedDraftMuscle(group.key)} style={{
                          border: `1.5px solid ${active ? c.blue : c.border}`, background: active ? c.blueBorder : c.bg,
                          color: active ? c.blue : c.textMuted, borderRadius: 20, padding: '5px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer',
                        }}>
                          {group.label}
                        </button>
                      )
                    })}
                  </div>
                </div>

                <div>
                  <span style={label}>Vidéo</span>
                  <input
                    value={advancedDraftVideoUrl}
                    onChange={e => setAdvancedDraftVideoUrl(e.target.value)}
                    placeholder="Lien YouTube…"
                    style={input}
                  />
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, padding: '16px 24px', borderTop: `1px solid ${c.border}` }}>
                <button onClick={closeAdvancedSettings} style={{
                  border: `1px solid ${c.border}`, color: c.text, fontWeight: 600, fontSize: 14, borderRadius: 6,
                  padding: '9px 20px', background: c.bg, cursor: 'pointer',
                }}>
                  Annuler
                </button>
                <button
                  onClick={() => saveAdvancedSettings(advancedSettingsExercise)}
                  disabled={savingAdvancedSettings}
                  style={{
                    border: 'none', color: '#fff', fontWeight: 700, fontSize: 14, borderRadius: 6, padding: '9px 20px',
                    background: savingAdvancedSettings ? c.disabledBg : c.blue,
                    cursor: savingAdvancedSettings ? 'not-allowed' : 'pointer',
                  }}
                >
                  {savingAdvancedSettings ? '…' : 'Enregistrer'}
                </button>
              </div>
            </div>
          </>
        )}

        {/* Modales de config après choix d'un exercice (coach uniquement) : nombre de séries puis temps de récup */}
        {configStep === 'sets' && (
          <>
            <div onClick={closeExerciseConfig} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 210 }} />
            <div style={{
              position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', zIndex: 211,
              width: 520, maxWidth: 'calc(100vw - 32px)', background: c.bg, borderRadius: 10, boxShadow: '0 20px 60px rgba(0,0,0,0.25)',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px 24px', borderBottom: `1px solid ${c.border}` }}>
                <span style={{ fontSize: 22, fontWeight: 700, color: c.text }}>Number of sets</span>
                <button onClick={closeExerciseConfig} style={{ display: 'flex', background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: c.text }}>
                  <X size={20} />
                </button>
              </div>
              <div style={{ padding: '40px 24px', display: 'flex', justifyContent: 'center' }}>
                <input
                  type="number"
                  min={1}
                  value={pendingSets}
                  onChange={e => setPendingSets(Math.max(1, parseInt(e.target.value) || 1))}
                  autoFocus
                  style={{
                    width: 120, boxSizing: 'border-box', textAlign: 'center', fontSize: 20, fontWeight: 600,
                    padding: '10px 12px', border: `1.5px solid ${c.blueBorder}`, borderRadius: 8, outline: 'none',
                    color: c.text, fontFamily: 'inherit',
                  }}
                />
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, padding: '16px 24px', borderTop: `1px solid ${c.border}` }}>
                <button onClick={closeExerciseConfig} style={{
                  border: `1px solid ${c.border}`, color: c.text, fontWeight: 600, fontSize: 14, borderRadius: 6,
                  padding: '9px 20px', background: c.bg, cursor: 'pointer',
                }}>
                  Close
                </button>
                <button onClick={confirmSetsStep} style={{
                  border: `1px solid ${c.blue}`, color: c.blue, fontWeight: 600, fontSize: 14, borderRadius: 6,
                  padding: '9px 20px', background: c.bg, cursor: 'pointer',
                }}>
                  Next
                </button>
              </div>
            </div>
          </>
        )}

        {configStep === 'rest' && (
          <>
            <div onClick={closeExerciseConfig} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 210 }} />
            <div style={{
              position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', zIndex: 211,
              width: 520, maxWidth: 'calc(100vw - 32px)', background: c.bg, borderRadius: 10, boxShadow: '0 20px 60px rgba(0,0,0,0.25)',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px 24px', borderBottom: `1px solid ${c.border}` }}>
                <span style={{ fontSize: 22, fontWeight: 700, color: c.text }}>Rest time</span>
                <button onClick={closeExerciseConfig} style={{ display: 'flex', background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: c.text }}>
                  <X size={20} />
                </button>
              </div>
              <div style={{ padding: '28px 24px 8px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 24 }}>
                  {REST_PRESETS.map(preset => {
                    const active = pendingRest === preset.seconds
                    return (
                      <button key={preset.seconds} onClick={() => setPendingRest(preset.seconds)} style={{
                        padding: '9px 4px', borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: 'pointer',
                        border: `1.5px solid ${active ? c.blue : c.border}`, color: active ? c.blue : c.text,
                        background: c.bg,
                      }}>
                        {preset.label}
                      </button>
                    )
                  })}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
                  <input
                    type="number"
                    min={0}
                    value={Math.floor(pendingRest / 60)}
                    onChange={e => setPendingRest(Math.max(0, parseInt(e.target.value) || 0) * 60 + (pendingRest % 60))}
                    style={{
                      width: 70, boxSizing: 'border-box', textAlign: 'center', fontSize: 18, fontWeight: 600,
                      padding: '10px 12px', border: `1.5px solid ${c.blueBorder}`, borderRadius: 8, outline: 'none',
                      color: c.text, fontFamily: 'inherit',
                    }}
                  />
                  <span style={{ fontSize: 14, color: c.textMuted }}>min</span>
                  <input
                    type="number"
                    min={0}
                    max={59}
                    value={pendingRest % 60}
                    onChange={e => {
                      const secs = Math.min(59, Math.max(0, parseInt(e.target.value) || 0))
                      setPendingRest(Math.floor(pendingRest / 60) * 60 + secs)
                    }}
                    style={{
                      width: 70, boxSizing: 'border-box', textAlign: 'center', fontSize: 18, fontWeight: 600,
                      padding: '10px 12px', border: `1.5px solid ${c.blueBorder}`, borderRadius: 8, outline: 'none',
                      color: c.text, fontFamily: 'inherit',
                    }}
                  />
                  <span style={{ fontSize: 14, color: c.textMuted }}>s</span>
                </div>
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, padding: '16px 24px', borderTop: `1px solid ${c.border}` }}>
                <button onClick={closeExerciseConfig} style={{
                  border: `1px solid ${c.border}`, color: c.text, fontWeight: 600, fontSize: 14, borderRadius: 6,
                  padding: '9px 20px', background: c.bg, cursor: 'pointer',
                }}>
                  Close
                </button>
                <button onClick={confirmRestStep} style={{
                  border: `1px solid ${c.blue}`, color: c.blue, fontWeight: 600, fontSize: 14, borderRadius: 6,
                  padding: '9px 20px', background: c.bg, cursor: 'pointer',
                }}>
                  Add
                </button>
              </div>
            </div>
          </>
        )}

        {/* Modale Notes — attachée à un (set, exercice) précis d'un bloc exercice */}
        {notesModalOpen && (
          <>
            <div onClick={closeSetNotesModal} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 220 }} />
            <div style={{
              position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', zIndex: 221,
              width: 560, maxWidth: 'calc(100vw - 32px)', background: c.bg, borderRadius: 10, boxShadow: '0 20px 60px rgba(0,0,0,0.25)',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px 24px', borderBottom: `1px solid ${c.border}` }}>
                <span style={{ fontSize: 22, fontWeight: 700, color: c.text }}>Notes</span>
                <button onClick={closeSetNotesModal} style={{ display: 'flex', background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: c.text }}>
                  <X size={20} />
                </button>
              </div>

              <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div style={{ border: `1px solid ${c.border}`, borderRadius: 6, overflow: 'hidden' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 2, padding: '8px 10px', borderBottom: `1px solid ${c.border}` }}>
                    {[TextB, TextItalic, LinkSimple, ListBullets, TextTSlash].map((Icon, i) => (
                      <button key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 28, height: 28, border: 'none', background: 'none', borderRadius: 4, color: c.textMuted, cursor: 'pointer' }}>
                        <Icon size={15} />
                      </button>
                    ))}
                  </div>
                  <textarea
                    value={draftSetNote}
                    onChange={e => setDraftSetNote(e.target.value)}
                    placeholder="Write a note"
                    rows={4}
                    autoFocus
                    style={{ width: '100%', boxSizing: 'border-box', border: 'none', padding: '12px 14px', fontSize: 14, outline: 'none', resize: 'none', background: 'transparent', fontFamily: 'inherit', color: c.text }}
                  />
                </div>

                <label style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 15, color: c.text, cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={applyNoteToNextSets}
                    onChange={e => setApplyNoteToNextSets(e.target.checked)}
                    style={{ width: 18, height: 18, accentColor: c.blue }}
                  />
                  Apply to the next sets
                </label>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, padding: '16px 24px', borderTop: `1px solid ${c.border}` }}>
                <button onClick={closeSetNotesModal} style={{
                  border: `1px solid ${c.border}`, color: c.text, fontWeight: 600, fontSize: 14, borderRadius: 6,
                  padding: '9px 20px', background: c.bg, cursor: 'pointer',
                }}>
                  Close
                </button>
                <button onClick={clearSetNotesModal} style={{
                  border: `1px solid ${c.border}`, color: c.text, fontWeight: 600, fontSize: 14, borderRadius: 6,
                  padding: '9px 20px', background: c.bg, cursor: 'pointer',
                }}>
                  Clear
                </button>
                <button onClick={confirmSetNotesModal} style={{
                  border: `1px solid ${c.blue}`, color: c.blue, fontWeight: 600, fontSize: 14, borderRadius: 6,
                  padding: '9px 20px', background: c.bg, cursor: 'pointer',
                }}>
                  Ok
                </button>
              </div>
            </div>
          </>
        )}

        {videoModalExercise && (() => {
          const videoId = extractYouTubeId(videoModalExercise.videoUrl)
          return (
            <div onClick={() => setVideoModalExercise(null)} style={{
              position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', zIndex: 230,
              display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
            }}>
              {videoId ? (
                <div onClick={e => e.stopPropagation()} style={{ width: '100%', maxWidth: 640, background: '#000', borderRadius: 10, overflow: 'hidden', position: 'relative' }}>
                  <button onClick={() => setVideoModalExercise(null)} style={{ position: 'absolute', top: 8, right: 8, zIndex: 2, background: 'rgba(0,0,0,.6)', color: '#fff', border: 'none', borderRadius: '50%', width: 32, height: 32, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <X size={16} />
                  </button>
                  <div style={{ position: 'relative', paddingTop: '56.25%' }}>
                    <iframe src={`https://www.youtube.com/embed/${videoId}?autoplay=1`} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', border: 'none' }}
                      allow="autoplay; encrypted-media; picture-in-picture" allowFullScreen />
                  </div>
                </div>
              ) : (
                <a href={videoModalExercise.videoUrl} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 8, padding: '12px 20px', fontWeight: 700, textDecoration: 'none', color: c.text }}>
                  Ouvrir la vidéo ↗
                </a>
              )}
            </div>
          )
        })()}
      </div>
    </div>
  )
}
