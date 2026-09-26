'use client'

import { useState, useEffect, useRef, use, Suspense, Fragment } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import CelebrationModal, { parseMusclesFromText } from '@/app/components/CelebrationModal'
import MuscleAnatomyDiagram, { MUSCLE_GROUPS } from '@/app/components/MuscleAnatomyDiagram'
import FocusBodyDiagram from '@/app/components/FocusBodyDiagram'
import Toast from '@/app/components/Toast'
import SubscriptionScreen from '@/app/components/athlete/SubscriptionScreen'
import { SUBSCRIPTION_TIERS, FREE_SESSIONS_DEFAULT } from '@/lib/subscriptionTiers'
import AthleteTabBar from '@/app/components/AthleteTabBar'
import ChatHeaderButton from '@/app/components/ChatHeaderButton'
import NotificationBell from '@/app/components/NotificationBell'
import WodTab, { hasPendingDayPicker } from '@/app/components/athlete/WodTab'
import StatsTab from '@/app/components/athlete/StatsTab'
import TemplatesTab from '@/app/components/athlete/TemplatesTab'
import AddActionSheet from '@/app/components/athlete/AddActionSheet'
import AddActivityWizard from '@/app/components/athlete/AddActivityWizard'
import ProfilTab from '@/app/components/athlete/ProfilTab'
import Seance, { sessionProgressKey } from '@/app/components/athlete/Seance'
import SectionTexteVideo, { FenetreVideo } from '@/app/components/SectionTexteVideo'
import { sectionDeSeance } from '@/lib/sectionsTexte'
import TempoBadge, { getTempoDisplay } from '@/app/components/TempoBadge'
import { UNITS, unitOf, formatPerformance } from '@/app/components/TrackedMovementsBlock'
import TimerModal from '@/app/components/TimerModal'
import SplitTimerSession from '@/app/components/SplitTimerSession'
import WeeklyRecapPopup from '@/app/components/WeeklyRecapPopup'
import {
  House, WifiSlash, Bell, Target, Repeat, SkipForward, Lock, EyeSlash, Backpack, UsersThree,
  Lightning, PencilSimple, Calculator, CalendarBlank, Prohibit, Lightbulb, ChartBar, ChartLineUp,
  LinkSimple, Circle, Clock, DownloadSimple,
} from '@phosphor-icons/react'
import { annotatePaceReferences, formatPace, isRunMovement, isCardioMovementName, cardioMovementSortKey, is3030Movement, PACE_BASES, computePaceForBasePct, computeDistanceForBasePct, formatDistance, RACE_TARGETS, parsePaceInput } from '@/lib/raceEstimates'
import { hasCardioSteps } from '@/lib/cardioSteps'
import { buildCardioFitFile, downloadFitFile } from '@/lib/fitExport'
import { CIRCUIT_MODES } from '@/lib/circuitModes'
import { registerPushNotifications } from '@/lib/pushRegistration'
import { unlockAudio } from '@/lib/audioBeep'
import { unlockSpeech } from '@/lib/speak'

function computeLabels(exercises) {
  const labels = {}
  let letterIdx = 0, i = 0
  while (i < exercises.length) {
    const g = exercises[i].superset_group
    if (!g) {
      labels[exercises[i].id] = String.fromCharCode(65 + letterIdx)
      letterIdx++; i++
    } else {
      let j = i
      while (j < exercises.length && exercises[j].superset_group === g) j++
      const letter = String.fromCharCode(65 + letterIdx)
      for (let k = i; k < j; k++) labels[exercises[k].id] = `${letter}${k - i + 1}`
      letterIdx++; i = j
    }
  }
  return labels
}

const BIRTHDAY_MESSAGES = [
  'Joyeux anniversaire ! Ton coach et toute l’équipe OSTRYK te souhaitent une année pleine de progrès 🎉',
  'Une bougie de plus, une motivation en plus ! Joyeux anniversaire 🎂',
  'Aujourd’hui c’est ton jour ! Profite bien, et joyeux anniversaire de la part de ton coach.',
  'Joyeux anniversaire ! Que cette nouvelle année soit à la hauteur de tes efforts.',
  '🎈 Joyeux anniversaire ! On espère que ta journée sera aussi solide que tes séances.',
  'Toute l’équipe te souhaite un très joyeux anniversaire — repose-toi bien aujourd’hui, tu l’as mérité !',
  'Joyeux anniversaire ! Une année de plus, une force de plus.',
  '🎉 C’est ton anniversaire aujourd’hui — profites-en à fond, les séances peuvent attendre demain.',
  'Joyeux anniversaire ! Merci de faire partie de l’aventure, on est fiers de tes progrès.',
  'Une nouvelle année commence — joyeux anniversaire, et encore merci pour ta motivation sans faille !',
]

function isBirthdayToday(birthDate) {
  if (!birthDate) return false
  const d = new Date(birthDate + 'T00:00:00')
  const now = new Date()
  return d.getMonth() === now.getMonth() && d.getDate() === now.getDate()
}

// Convertit un temps de récup écrit librement par le coach ("90s", "2min", "1min30", "2-3min", "60"…)
// en secondes, pour pouvoir lancer un chrono en un clic. Un nombre seul est traité comme des
// secondes (aligné sur les valeurs réellement saisies : "60"/"90"/"180" à côté de "60s"/"90s"),
// une plage sans unité ("2-3") est traitée en minutes (le "min" est souvent omis dans ce cas).
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

// Nom du groupement selon le nombre d'exercices enchaînés — la terminologie change au-delà de 2
// (superset), 3 (triset) : au-delà, tout se range sous "giantset" plutôt que d'inventer un nom
// par palier.
function supersetGroupName(size) {
  if (size <= 2) return 'SUPERSET'
  if (size === 3) return 'TRISET'
  return 'GIANTSET'
}

function getSupersetFlow(exos, ei, labels) {
  const exo = exos[ei]
  if (!exo.superset_group) return null
  if (ei > 0 && exos[ei - 1].superset_group === exo.superset_group) return null
  const group = []
  for (let j = ei; j < exos.length && exos[j].superset_group === exo.superset_group; j++) group.push(exos[j])
  if (group.length < 2) return null
  const exoLabels = group.map(e => labels[e.id] || '?')
  return `${supersetGroupName(group.length)}, tu fais ${exoLabels.join(' puis ')} et ensuite tu prends la récup.`
}

function today() {
  const n = new Date()
  return [n.getFullYear(), String(n.getMonth()+1).padStart(2,'0'), String(n.getDate()).padStart(2,'0')].join('-')
}

export default function AthleteViewWrapper({ params }) {
  return (
    <Suspense>
      <AthleteView params={params} />
    </Suspense>
  )
}

function ensureDeviceCookie() {
  const match = document.cookie.match(/(?:^|; )cp_device=([^;]+)/)
  if (match) return decodeURIComponent(match[1])
  const id = crypto.randomUUID()
  document.cookie = `cp_device=${id}; path=/; max-age=${60 * 60 * 24 * 365 * 2}; SameSite=Lax`
  return id
}

function AthleteView({ params }) {
  const { token } = use(params)
  const router = useRouter()
  const searchParams = useSearchParams()
  const isCoachView = searchParams.get('coach') === '1'
  const [isCoach, setIsCoach] = useState(false)
  const [isGroupLeader, setIsGroupLeader] = useState(false)
  const targetSessionId = searchParams.get('session')
  const focusMode = searchParams.get('focus') === '1'
  // 'pr' (ancien onglet Performances) redirige vers Stats, qui l'a absorbé : vieux liens, favoris.
  const rawTab = searchParams.get('tab') || 'wod'
  const activeTab = rawTab === 'pr' ? 'stats' : rawTab
  const setActiveTab = (tab) => {
    const url = new URL(window.location.href)
    url.searchParams.set('tab', tab)
    router.replace(url.pathname + url.search)
  }
  const [showAddSheet, setShowAddSheet] = useState(false)
  const [showAddWizard, setShowAddWizard] = useState(false)

  // Dans l'app native, le contenu doit occuper tout l'écran (phone comme tablette) — le plafond à
  // 480px n'a de sens que pour le lien web (magic link ouvert sur desktop), où il évite un layout
  // mobile étiré sur un grand écran.
  const [isNative, setIsNative] = useState(false)
  useEffect(() => {
    import('@capacitor/core').then(({ Capacitor }) => setIsNative(Capacitor.isNativePlatform())).catch(() => {})
  }, [])

  // Onglets gardés montés une fois visités (display:none plutôt que démontage) : évite de
  // relancer tous les fetchs internes (stats, PR, profil...) et de réafficher leurs
  // "Chargement…" à chaque tap sur la tab bar — retour terrain : c'était systématique et pénible.
  const [visitedTabs, setVisitedTabs] = useState(() => new Set([activeTab]))
  useEffect(() => {
    setVisitedTabs(prev => prev.has(activeTab) ? prev : new Set(prev).add(activeTab))
  }, [activeTab])

  useEffect(() => {
    if (isCoachView) return
    let listeners = []
    let cancelled = false
    registerPushNotifications(token).then(l => { if (cancelled) l.forEach(x => x.remove()); else listeners = l })
    return () => { cancelled = true; listeners.forEach(l => l.remove()) }
  }, [token, isCoachView])
  const [athlete, setAthlete] = useState(null)
  // Player d'exécution (exercice/super série un bloc à la fois), lancé depuis l'écran de
  // préparation (SessionCard en playerMode) — remis à zéro à chaque changement de séance ciblée
  // pour ne pas rouvrir le player sur une autre séance après un retour au calendrier. Reset ajusté
  // pendant le rendu (pattern React officiel "Adjusting state when a prop changes") plutôt que
  // dans un effet, pour ne pas déclencher un second rendu superflu.
  // Persisté en localStorage (même convention que queueKey plus bas) : un WebView mobile peut
  // recharger toute la page quand l'app repasse en arrière-plan, ce qui perdrait ce useState et
  // renverrait l'athlète sur SessionCard au lieu du player — l'écran de séance (Seance.js) se resynchronise déjà
  // sur les séries en base (voir countValidatedSets), mais encore faut-il qu'il se remonte direct.
  const playerStartedKey = `coachpro_player_started_${token}`
  const [playerStarted, setPlayerStartedRaw] = useState(() => {
    try { return !!targetSessionId && localStorage.getItem(playerStartedKey) === targetSessionId } catch { return false }
  })
  const setPlayerStarted = (started) => {
    setPlayerStartedRaw(started)
    try {
      if (started && targetSessionId) localStorage.setItem(playerStartedKey, targetSessionId)
      else localStorage.removeItem(playerStartedKey)
    } catch { /* localStorage indisponible (navigation privée...) — pas bloquant */ }
  }
  const [playerStartedForSession, setPlayerStartedForSession] = useState(targetSessionId)
  if (targetSessionId !== playerStartedForSession) {
    setPlayerStartedForSession(targetSessionId)
    setPlayerStarted(false)
  }
  const [unreadMessages, setUnreadMessages] = useState(0)
  const [programs, setPrograms] = useState([])
  const [completions, setCompletions] = useState(new Set())
  const [skippedSessions, setSkippedSessions] = useState(new Set())
  // Date de validation par séance (program_completions.completed_at) — sert uniquement à ordonner
  // l'historique "Séances passées" de la page d'accueil, du plus récent au plus ancien.
  const [completionDates, setCompletionDates] = useState({})
  // Séance ouverte en dernier par le sportif et pas encore validée : tant qu'elle ne l'est pas,
  // c'est ELLE que la carte "Séance du jour" doit afficher, pas la suivante du programme (retour
  // terrain : ouvrir une séance sans la valider faisait aussitôt apparaître la suivante à sa
  // place, comme si elle avait été faite).
  // Stockée sur le compte (athletes.current_session_id, voir supabase_current_session.sql) pour
  // suivre le sportif d'un appareil à l'autre ; le localStorage (même convention que
  // playerStartedKey) n'est plus qu'un cache local : il tient l'affichage avant la réponse du
  // serveur, survit au rechargement complet que le WebView mobile provoque en arrière-plan, et
  // garde l'ancre juste hors ligne. Au chargement, c'est la valeur du compte qui fait foi.
  const openedSessionKey = `coachpro_opened_session_${token}`
  const [openedSessionId, setOpenedSessionId] = useState(() => {
    try { return localStorage.getItem(openedSessionKey) } catch { return null }
  })
  const rememberOpenedSessionLocally = (sessId) => {
    try {
      if (sessId) localStorage.setItem(openedSessionKey, sessId)
      else localStorage.removeItem(openedSessionKey)
    } catch { /* localStorage indisponible (navigation privée...) — pas bloquant */ }
  }
  const forgetOpenedSession = (sessId) => {
    setOpenedSessionId(prev => (prev === sessId ? null : prev))
    try {
      if (localStorage.getItem(openedSessionKey) === sessId) localStorage.removeItem(openedSessionKey)
    } catch { /* idem */ }
  }
  // Dernière valeur connue côté compte : évite de repousser au serveur ce qu'on vient d'en lire,
  // et de reposter la même ancre à chaque rendu.
  const syncedAnchorRef = useRef(undefined)
  // Un coach qui prévisualise la séance d'un client ne "fait" pas cette séance : il ne doit pas
  // déplacer l'ancre du sportif. Sur son propre profil sportif (is_coach), c'est bien lui qui
  // s'entraîne, ?coach=1 ou pas — même distinction que backHref plus bas.
  const canAnchorOpenedSession = !isCoachView || !!athlete?.is_coach
  // Ancre posée pendant le rendu (pattern React "Adjusting state when a prop changes"), comme le
  // reset de playerStarted juste au-dessus : un effet ne servirait qu'à déclencher un rendu de plus.
  if (focusMode && targetSessionId && canAnchorOpenedSession && openedSessionId !== targetSessionId) {
    setOpenedSessionId(targetSessionId)
    rememberOpenedSessionLocally(targetSessionId)
  }
  // L'écriture réseau, elle, ne peut pas se faire pendant le rendu. Tant que le profil n'est pas
  // chargé, syncedAnchorRef vaut undefined et on ne pousse rien : sinon on écraserait la valeur du
  // compte avec le cache local avant même de l'avoir lue.
  useEffect(() => {
    if (!athlete || !canAnchorOpenedSession) return
    if (syncedAnchorRef.current === undefined || syncedAnchorRef.current === openedSessionId) return
    syncedAnchorRef.current = openedSessionId
    fetch(`/api/athlete-view/${token}/current-session`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId: openedSessionId || null }),
    }).catch(() => { /* hors ligne : le cache local prend le relais jusqu'à la prochaine ouverture */ })
  }, [athlete, openedSessionId, canAnchorOpenedSession, token])
  const [openSessionId, setOpenSessionId] = useState(null)
  const [validating, setValidating] = useState(false)
  const [exerciseLogs, setExerciseLogs] = useState({})
  const [exerciseSets, setExerciseSets] = useState({})
  const [circuitLogs, setCircuitLogs] = useState({})
  const [activityRefreshKey, setActivityRefreshKey] = useState(0)
  const viewDate = today()
  const [celebration, setCelebration] = useState(null)
  const [freeGateUpsell, setFreeGateUpsell] = useState(null)
  const [showSubscription, setShowSubscription] = useState(false)
  const [pendingGroupSessions, setPendingGroupSessions] = useState([])
  // Ne se fie pas à navigator.onLine dès le premier rendu : ce signal est connu pour être
  // temporairement faux juste après une navigation (ex. "Switch to athlete" du coach), affichant
  // le bandeau hors-ligne alors que la connexion est bonne. On part de "en ligne" et on ne
  // bascule vraiment que si l'état persiste (voir l'effet ci-dessous).
  const [isOffline, setIsOffline] = useState(false)
  const [objectives, setObjectives] = useState([])
  const [noteBlocks, setNoteBlocks] = useState([])
  // Mouvements cités par les échauffements / retours au calme ({ [id]: { id, nom, video_url } }),
  // envoyés par l'API avec session.sections (voir app/api/athlete-view/[token]/route.js).
  const [mouvementsSections, setMouvementsSections] = useState({})
  const [selectedType, setSelectedType] = useState(null)
  const [toast, setToast] = useState(null)
  const [exerciseToast, setExerciseToast] = useState(null)
  const [runningTimer, setRunningTimer] = useState(null) // { config, label } | null
  const [sessionRecords, setSessionRecords] = useState([])
  const [trackedMovements, setTrackedMovements] = useState([])
  const [raceKnown, setRaceKnown] = useState({})
  const [renewalDismissed, setRenewalDismissed] = useState(false)
  const [birthdayDismissed, setBirthdayDismissed] = useState(false)
  const [birthdayMessage] = useState(() => BIRTHDAY_MESSAGES[Math.floor(Math.random() * BIRTHDAY_MESSAGES.length)])

  // File d'écritures de séance. Toutes les saisies y passent désormais, en ligne comme hors ligne :
  // elle est la copie locale de la séance en cours (localStorage, donc elle survit au rechargement
  // complet que le WebView provoque en repassant au premier plan), et la source de vérité tant que
  // Supabase n'a pas confirmé. Avant, une écriture partait en direct dès que navigator.onLine était
  // vrai — or en salle le wifi répond mais les requêtes échouent : l'erreur finissait en alert() et
  // la série était perdue, ramenant la séance à l'échauffement au retour dans l'app.
  const queueKey = `coachpro_offline_queue_${token}`
  const loadQueue = () => { try { return JSON.parse(localStorage.getItem(queueKey) || '[]') } catch { return [] } }
  const saveQueue = (q) => { try { localStorage.setItem(queueKey, JSON.stringify(q)) } catch { /* stockage plein/indisponible — pas bloquant */ } }
  const enqueue = (op) => { const q = loadQueue(); q.push(op); saveQueue(q) }

  // Correspondance id temporaire → id réel, persistée elle aussi. Elle ne peut pas vivre seulement
  // le temps d'un flush : l'écran garde ses ids temporaires jusqu'à ce que reloadExerciseSets soit
  // revenu, donc une série validée dans cette fenêtre est mise en file avec un id déjà résolu par
  // le flush précédent. Sans cette table, l'opération était jugée irrésoluble et abandonnée en
  // silence — la série n'arrivait jamais en base.
  const aliasKey = `coachpro_setid_alias_${token}`
  const loadAliases = () => { try { return JSON.parse(localStorage.getItem(aliasKey) || '{}') } catch { return {} } }
  const saveAliases = (m) => { try { localStorage.setItem(aliasKey, JSON.stringify(m)) } catch { /* pas bloquant */ } }

  const isTempSetId = id => typeof id === 'string' && id.startsWith('local-')
  const makeTempSetId = () => `local-${Date.now()}-${Math.random().toString(36).slice(2)}`

  // Un seul flush à la fois : l'effet de montage et l'événement `online` pouvaient le déclencher en
  // parallèle et rejouer la même file — avec un insert sec sur add_exercise_set, ça créait des
  // séries en double.
  const flushingRef = useRef(false)
  const flushTimerRef = useRef(null)
  const flushRetryRef = useRef(0)

  // Rejoue les opérations encore en attente par-dessus les séries venant de la base : ce que
  // l'athlète vient de saisir doit rester à l'écran même si rien n'est encore parti (mode avion),
  // et c'est ce qui permet à countValidatedSets de retrouver la bonne position au remontage.
  const applyQueueToSets = (setsMap) => {
    const q = loadQueue()
    if (!q.length) return setsMap
    const persisted = loadAliases()
    const out = {}
    Object.entries(setsMap).forEach(([k, v]) => { out[k] = v.map(row => ({ ...row })) })
    // Une création peut déjà être passée en base sans que la file ait été purgée (flush interrompu) :
    // la ligne existe alors avec son vrai id, et les mises à jour qui suivent la désignent encore par
    // son id temporaire. On garde la correspondance pour ne pas perdre ces valeurs à l'écran.
    const aliases = { ...persisted }
    const resolve = id => aliases[id] || id
    for (const op of q) {
      if (op.type === 'add_exercise_set') {
        const list = (out[op.exerciseId] ||= [])
        const existing = list.find(r => r.set_index === op.setIndex)
        if (existing) aliases[op.tempId] = existing.id
        else list.push({ id: op.tempId, athlete_id: op.athleteId, program_exercise_id: op.exerciseId, set_index: op.setIndex })
      } else if (op.type === 'exercise_set_field') {
        const target = resolve(op.setId)
        for (const list of Object.values(out)) {
          const row = list.find(r => r.id === target)
          if (row) { row[op.field] = op.value; break }
        }
      } else if (op.type === 'delete_exercise_set') {
        const target = resolve(op.setId)
        for (const k of Object.keys(out)) out[k] = out[k].filter(r => r.id !== target)
      }
    }
    Object.keys(out).forEach(k => out[k].sort((a, b) => a.set_index - b.set_index))
    return out
  }

  const reloadExerciseSets = async () => {
    if (!athlete) return
    const { data, error } = await supabase.from('program_exercise_sets').select('*')
      .eq('athlete_id', athlete.id).order('set_index')
    if (error) return
    const grouped = {}
    ;(data || []).forEach(s => { (grouped[s.program_exercise_id] ||= []).push(s) })
    setExerciseSets(applyQueueToSets(grouped))
  }

  // Rejoue la file dans l'ordre et NE RETIRE que ce qui est réellement passé. Avant, la clé était
  // effacée en bloc à la fin : une opération en échec au milieu emportait tout le reste avec elle.
  // L'ordre compte (un exercise_set_field référence le tempId créé par l'add_exercise_set qui le
  // précède), donc on s'arrête à la première erreur et on garde la suite pour le prochain essai.
  const flushQueue = async () => {
    if (flushingRef.current) return
    const q = loadQueue()
    if (!q.length) { flushRetryRef.current = 0; return }
    flushingRef.current = true

    const tempIdMap = loadAliases() // tempId -> id réel, conservé d'un flush à l'autre
    const resolveSetId = id => (isTempSetId(id) && tempIdMap[id]) ? tempIdMap[id] : id
    let done = 0
    let hasExerciseSetOps = false
    let failed = false

    try {
      for (const op of q) {
        if (op.type === 'exercise_log') {
          const { error } = await supabase.from('program_exercise_logs').upsert(
            { athlete_id: op.athleteId, program_exercise_id: op.exerciseId, ...op.updated },
            { onConflict: 'athlete_id,program_exercise_id' }
          )
          if (error) { failed = true; break }
          if (op.updated.kg_done || op.updated.reps_done || op.updated.sets_done || op.updated.note) {
            await supabase.from('exercise_performance_history').insert({
              athlete_id: op.athleteId,
              program_exercise_id: op.exerciseId,
              kg_done: op.updated.kg_done ? parseFloat(op.updated.kg_done) : null,
              reps_done: op.updated.reps_done || null,
              sets_done: op.updated.sets_done || null,
              note: op.updated.note || null,
            })
          }
        } else if (op.type === 'validate') {
          const { error } = await supabase.from('program_completions').upsert(
            { athlete_id: op.athleteId, program_session_id: op.sessId, skipped: false, ...op.feedback },
            { onConflict: 'athlete_id,program_session_id' }
          )
          if (error) { failed = true; break }
        } else if (op.type === 'add_exercise_set') {
          hasExerciseSetOps = true
          // upsert et non insert : rejouer une file partiellement passée (réseau coupé en plein
          // vol) ne doit jamais créer une deuxième ligne pour la même série.
          const { data, error } = await supabase.from('program_exercise_sets')
            .upsert({ athlete_id: op.athleteId, program_exercise_id: op.exerciseId, set_index: op.setIndex },
                    { onConflict: 'athlete_id,program_exercise_id,set_index' })
            .select().single()
          if (error || !data) { failed = true; break }
          tempIdMap[op.tempId] = data.id
          saveAliases(tempIdMap)
        } else if (op.type === 'exercise_set_field') {
          hasExerciseSetOps = true
          const realId = resolveSetId(op.setId)
          // Un id temporaire non résolu signifie que sa création n'est pas encore passée : on
          // s'arrête là plutôt que d'abandonner la saisie, le prochain essai la reprendra dans l'ordre.
          if (isTempSetId(realId)) { failed = true; break }
          const { error } = await supabase.from('program_exercise_sets').update({ [op.field]: op.value }).eq('id', realId)
          if (error) { failed = true; break }
        } else if (op.type === 'delete_exercise_set') {
          hasExerciseSetOps = true
          const realId = resolveSetId(op.setId)
          if (!isTempSetId(realId)) {
            const { error } = await supabase.from('program_exercise_sets').delete().eq('id', realId)
            if (error) { failed = true; break }
          }
        }
        done++
      }
    } catch { failed = true }

    // Les opérations qui suivent celles déjà passées peuvent référencer un tempId désormais résolu :
    // on réécrit les ids connus pour que le prochain essai reparte sur les vraies lignes.
    const rest = q.slice(done).map(op => {
      const next = { ...op }
      if (next.setId) next.setId = resolveSetId(next.setId)
      return next
    })
    saveQueue(rest)
    flushingRef.current = false

    if (hasExerciseSetOps && done > 0) await reloadExerciseSets()

    if (rest.length && failed) {
      // Nouvelle tentative à intervalle croissant (2s, 4s, 8s… plafonné à 30s) : en salle, le réseau
      // revient souvent sans que l'événement `online` soit jamais émis.
      flushRetryRef.current = Math.min(flushRetryRef.current + 1, 4)
      scheduleFlush(Math.min(2000 * 2 ** (flushRetryRef.current - 1), 30000))
    } else {
      flushRetryRef.current = 0
      // Plus rien en attente : les alias n'ont plus personne à résoudre.
      if (!rest.length) { try { localStorage.removeItem(aliasKey) } catch { /* pas bloquant */ } }
      if (done > 0) setToast('Synchronisé ✓')
    }
  }

  const scheduleFlush = (delay = 400) => {
    if (flushTimerRef.current) clearTimeout(flushTimerRef.current)
    flushTimerRef.current = setTimeout(() => { flushTimerRef.current = null; flushQueue() }, delay)
  }

  useEffect(() => {
    // Débounce avant d'afficher le bandeau hors-ligne : navigator.onLine peut être brièvement
    // faux juste après une navigation, le temps que le navigateur resynchronise son état réseau.
    // Si ça se rétablit avant la fin du délai (cas courant), l'utilisateur ne voit jamais rien.
    let offlineTimer = null
    const goOffline = () => { offlineTimer = setTimeout(() => setIsOffline(true), 2000) }
    const goOnline = () => {
      if (offlineTimer) { clearTimeout(offlineTimer); offlineTimer = null }
      setIsOffline(false)
      flushQueue()
    }
    // Retour au premier plan : c'est le moment où le réseau est le plus souvent revenu sans que
    // l'événement `online` ait jamais été émis (wifi de salle qui répond à nouveau, changement
    // d'app). On retente la file à chaque fois que l'onglet redevient visible.
    const onVisible = () => { if (document.visibilityState === 'visible') flushQueue() }
    window.addEventListener('offline', goOffline)
    window.addEventListener('online', goOnline)
    document.addEventListener('visibilitychange', onVisible)
    if (typeof navigator !== 'undefined' && !navigator.onLine) goOffline()
    else Promise.resolve().then(flushQueue)
    return () => {
      window.removeEventListener('offline', goOffline)
      window.removeEventListener('online', goOnline)
      document.removeEventListener('visibilitychange', onVisible)
      if (offlineTimer) clearTimeout(offlineTimer)
      if (flushTimerRef.current) clearTimeout(flushTimerRef.current)
    }
  }, [])

  const requireOnline = () => {
    if (isOffline) { alert('Tu es hors ligne. Cette action nécessite une connexion internet — réessaie une fois reconnecté.'); return false }
    return true
  }

  useEffect(() => {
    const strava = searchParams.get('strava')
    if (!strava) return
    const url = new URL(window.location.href)
    url.searchParams.delete('strava')
    if (strava === 'connected') {
      // `athlete` a été chargé au montage de la page, avant l'aller-retour OAuth Strava — sans
      // rechargement complet, les Réglages continuent d'afficher "Connecter Strava" même si
      // strava_athlete_id est bien à jour en base (retour terrain : semblait "ne pas marcher").
      window.location.href = url.pathname + url.search
      return
    }
    setToast('Erreur de connexion à Strava')
    router.replace(url.pathname + url.search)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (searchParams.get('programStarted') !== '1') return
    const url = new URL(window.location.href)
    url.searchParams.delete('programStarted')
    setToast('Programme démarré !')
    router.replace(url.pathname + url.search)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    async function load() {
      ensureDeviceCookie()
      const res = await fetch(`/api/athlete-view/${token}`, { cache: 'no-store' })
      if (res.status === 401) { router.push('/login'); return }
      if (res.status === 403) {
        const body = await res.json().catch(() => ({}))
        router.push(body.error === 'device_unverified' ? `/verify-device?token=${token}` : '/login')
        return
      }
      if (!res.ok) return
      const { athlete: ath, programs: progs, completions: comps, exerciseLogs: logs, movieMap, musclesMap, focusGroupsMap, objectives: objs, noteBlocks: blocks, mouvementsSections: mvtSections, exerciseSets: exoSets, raceKnown: rk, trackedMovements: tms, isCoach: coachFlag, isGroupLeader: leaderFlag, circuitLogs: cLogs } = await res.json()
      setAthlete(ath)
      // Ancre "séance en cours" : la valeur du compte fait foi au chargement, c'est elle qui suit
      // le sportif d'un appareil à l'autre. Exception, l'URL gagne s'il est justement en train
      // d'ouvrir une séance (?session=…&focus=1) : elle est forcément plus récente, et l'effet de
      // synchro plus haut se chargera de la pousser au serveur.
      // `undefined` (et pas `null`) = la colonne n'existe pas encore en base : on laisse alors le
      // cache local piloter, plutôt que d'effacer l'ancre du sportif à chaque chargement.
      if (ath.current_session_id !== undefined) {
        const serverAnchor = ath.current_session_id || null
        syncedAnchorRef.current = serverAnchor
        if (!(focusMode && targetSessionId)) {
          setOpenedSessionId(serverAnchor)
          rememberOpenedSessionLocally(serverAnchor)
        }
      }
      setObjectives(objs || [])
      setNoteBlocks(blocks || [])
      setMouvementsSections(mvtSections || {})
      setRaceKnown(rk || {})
      setTrackedMovements(tms || [])
      setIsCoach(!!coachFlag)
      setIsGroupLeader(!!leaderFlag)

      const logsMap = {}
      ;(logs || []).forEach(l => { logsMap[l.program_exercise_id] = l })
      setExerciseLogs(logsMap)

      const circuitLogsMap = {}
      ;(cLogs || []).forEach(l => { circuitLogsMap[`${l.program_session_id}::${l.circuit_id}`] = l })
      setCircuitLogs(circuitLogsMap)

      const setsMap = {}
      ;(exoSets || []).forEach(s => {
        if (!setsMap[s.program_exercise_id]) setsMap[s.program_exercise_id] = []
        setsMap[s.program_exercise_id].push(s)
      })
      // Les saisies encore en file (pas encore confirmées par Supabase) sont rejouées par-dessus la
      // réponse serveur : c'est ce qui fait qu'une séance reprend là où elle en était même si rien
      // n'est parti — mode avion, ou réponse d'API resservie depuis le cache du service worker.
      setExerciseSets(applyQueueToSets(setsMap))
      const completionSet = new Set((comps || []).map(c => c.program_session_id))
      setCompletions(completionSet)
      setSkippedSessions(new Set((comps || []).filter(c => c.skipped).map(c => c.program_session_id)))
      const datesMap = {}
      ;(comps || []).forEach(c => { if (c.completed_at) datesMap[c.program_session_id] = c.completed_at })
      setCompletionDates(datesMap)

      // Séance validée par le coach en direct pendant que l'athlète n'était pas connecté : on lui
      // montre le même bilan (citation, record, muscles) qu'une auto-validation, une seule fois.
      if (coachFlag !== true) {
        const pending = (comps || []).find(c => c.pending_celebration)
        if (pending) {
          setCelebration(pending.pending_celebration)
          await supabase.from('program_completions')
            .update({ pending_celebration: null })
            .eq('athlete_id', ath.id).eq('program_session_id', pending.program_session_id)
        }
      }

      const progList = (progs || []).map(p => ({
        ...p,
        sessions: [...(p.program_sessions || [])]
          .sort((a, b) => a.order_index - b.order_index)
          .map(s => ({
            ...s,
            exercises: [...(s.program_exercises || [])].sort((a, b) => a.order_index - b.order_index)
              .map(e => ({ ...e, video_url: (movieMap || {})[e.name?.trim().toLowerCase()] ?? e.video_url, movement_muscles: (musclesMap || {})[e.name?.trim().toLowerCase()] || null, movement_focus_groups: (focusGroupsMap || {})[e.name?.trim().toLowerCase()] || null }))
          }))
      }))
      setPrograms(progList)

      // Séance ciblée via l'URL (ex: lancée depuis l'espace coach) prioritaire sur l'auto-ouverture
      const allSessionIds = new Set(progList.flatMap(p => p.sessions.map(s => s.id)))
      if (targetSessionId && allSessionIds.has(targetSessionId)) {
        setOpenSessionId(targetSessionId)
        return
      }

      // Auto-ouvrir la première séance à faire du premier programme
      for (const prog of progList) {
        const next = prog.sessions.find(s => !completionSet.has(s.id))
        if (next) { setOpenSessionId(next.id); break }
      }

      // Rappel d'abonnement pour un compte gratuit : la gate de fin d'accès gratuit (voir validate)
      // ne se déclenche que si le sportif pousse un programme libre-service jusqu'à sa 3e séance —
      // beaucoup n'y arrivaient jamais et ne voyaient donc jamais parler d'abonnement. Ici, une
      // fois tous les 7 jours, et seulement après une première séance validée (un compte tout neuf
      // n'a pas à être accueilli par un paywall).
      const skippedSet = new Set((comps || []).filter(c => c.skipped).map(c => c.program_session_id))
      if (!isCoachView && !ath.is_coach && ath.subscription_status !== 'active' && completionSet.size > 0
          && !hasPendingDayPicker(progList, completionSet, skippedSet)) {
        const upsellKey = `coachpro_upsell_last_${token}`
        let lastShown = null
        try { lastShown = localStorage.getItem(upsellKey) } catch { /* localStorage indisponible — pas bloquant */ }
        const daysSince = lastShown ? (Date.now() - new Date(lastShown).getTime()) / 86400000 : Infinity
        if (daysSince >= 7) {
          setFreeGateUpsell({ programName: null })
          try { localStorage.setItem(upsellKey, new Date().toISOString()) } catch { /* idem */ }
        }
      }

      // Séances de groupe où le coach l'a marqué présent, à compléter (pas en vue coach — sauf
      // sur le profil perso du coach : "Switch to athlete" passe toujours par ?coach=1, donc
      // isCoachView y est vrai même quand c'est lui-même qui a participé et doit voir le rappel).
      if (!isCoachView || ath.is_coach) {
        const pendingRes = await fetch(`/api/athlete-view/${token}/pending-group-sessions`, { cache: 'no-store' })
        const pendingJson = await pendingRes.json().catch(() => ({}))
        setPendingGroupSessions(pendingJson.pending || [])
      }
    }
    load()
  }, [token])

  // Badge rouge "message non lu" sur l'onglet Profil de la barre de navigation, pour que le
  // sportif voie qu'il a un message du coach même sans avoir ouvert l'onglet.
  useEffect(() => {
    if (!athlete || isCoachView) return
    const refreshUnread = () => {
      fetch(`/api/messages/${athlete.id}`).then(r => r.json()).then(data => {
        const u = (data.messages || []).filter(m => m.sender_role === 'coach' && !m.read_by_athlete_at).length
        setUnreadMessages(u)
      })
    }
    refreshUnread()
    const channel = supabase
      .channel(`messages-tabbar-${athlete.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'messages', filter: `athlete_id=eq.${athlete.id}` }, refreshUnread)
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [athlete?.id, isCoachView])

  // Prévient le sportif quand son abonnement se renouvelle automatiquement dans ≤3 jours. Dérivé
  // au rendu plutôt que via un effet : `athlete` n'est jamais peuplé côté serveur (chargé par fetch
  // après montage), donc cette lecture localStorage ne s'exécute jamais avant l'hydratation client.
  const renewalDaysLeft = athlete?.subscription_current_period_end
    ? Math.ceil((new Date(athlete.subscription_current_period_end) - new Date()) / 86400000)
    : null
  const renewalDismissKey = athlete ? `coachpro_renewal_dismissed_${athlete.id}_${athlete.subscription_current_period_end}` : null
  const showRenewalPopup = !!athlete && athlete.subscription_status === 'active'
    && renewalDaysLeft != null && renewalDaysLeft >= 0 && renewalDaysLeft <= 3
    && !renewalDismissed && !!renewalDismissKey && !localStorage.getItem(renewalDismissKey)

  const dismissRenewalPopup = () => {
    if (renewalDismissKey) localStorage.setItem(renewalDismissKey, '1')
    setRenewalDismissed(true)
  }

  // Une seule fois par jour d'anniversaire (clé datée, comme le rappel de renouvellement) —
  // sinon le pop-up reviendrait à chaque rechargement de la page tant que c'est encore le jour J.
  const todayKey = (() => { const n = new Date(); return `${n.getFullYear()}-${n.getMonth() + 1}-${n.getDate()}` })()
  const birthdayDismissKey = athlete ? `coachpro_birthday_dismissed_${athlete.id}_${todayKey}` : null
  const showBirthdayPopup = !!athlete && isBirthdayToday(athlete.birth_date)
    && !birthdayDismissed && !!birthdayDismissKey && !localStorage.getItem(birthdayDismissKey)

  const dismissBirthdayPopup = () => {
    if (birthdayDismissKey) localStorage.setItem(birthdayDismissKey, '1')
    setBirthdayDismissed(true)
  }

  // Synchronise un résultat de séance (allure + distance) vers le mouvement Metrics correspondant
  // (ex: exercice nommé "6 min (Demi Cooper)" ou "5km Run") pour que VMA/Seuil60/Δ se recalculent.
  const syncRaceMetric = async (exerciseName, distanceKm, avgPaceStr) => {
    if (!athlete) return
    const target = RACE_TARGETS.find(t => t.match(exerciseName))
    if (!target) return
    // Priorité au mouvement dont le nom correspond exactement à l'exercice (ex: "6 min (Demi Cooper)") :
    // le simple filtrage par regex de RACE_TARGETS peut matcher plusieurs mouvements pour un même
    // target (ex: "6 min (Demi Cooper)" ET "6 min Echo Bike" matchent tous les deux "6min"), et .find()
    // retenait alors le premier de la liste au hasard plutôt que le bon.
    const tm = trackedMovements.find(m => m.name.trim().toLowerCase() === exerciseName.trim().toLowerCase())
      || trackedMovements.find(m => RACE_TARGETS.find(t => t.match(m.name)) === target)
    if (!tm) return

    const paceSec = parsePaceInput(avgPaceStr)
    let value = null
    if (tm.unit === 'distance_m') value = distanceKm ? Math.round(distanceKm * 1000) : null
    else if (tm.unit === 'time') value = (distanceKm && paceSec) ? Math.round(distanceKm * paceSec) : null
    if (value == null) return

    const date = today()
    const payload = {
      athlete_id: athlete.id, tracked_movement_id: tm.id, date, value,
      avg_pace: avgPaceStr?.trim() || null, distance_km: distanceKm || null,
    }
    const { data: existing } = await supabase.from('tracked_movement_entries').select('id')
      .eq('athlete_id', athlete.id).eq('tracked_movement_id', tm.id).eq('date', date).maybeSingle()
    if (existing) await supabase.from('tracked_movement_entries').update(payload).eq('id', existing.id)
    else await supabase.from('tracked_movement_entries').insert(payload)

    // Met à jour raceKnown localement (pas de re-fetch : évite les soucis de synchro de session).
    // Pour les tests re-jouables (6min/20min), la dernière valeur fait toujours foi (useLatest) :
    // un nouveau test remplace l'ancien même s'il est moins bon, pour refléter la forme actuelle.
    setRaceKnown(prev => {
      const cur = prev[target.key]
      if (target.kind === 'distance') {
        const D = target.useLatest ? value : (cur ? Math.max(cur.D, value) : value)
        return { ...prev, [target.key]: { T: target.fixedTimeSec, D } }
      }
      const T = target.useLatest ? value : (cur ? Math.min(cur.T, value) : value)
      return { ...prev, [target.key]: { T, D: target.distanceM } }
    })
  }

  // Enregistre l'allure cible du sportif pour une distance de course (10km/Semi/Marathon), pour référence future.
  const saveTargetPace = async (raceKey, pace) => {
    const res = await fetch(`/api/athlete-view/${token}/target-pace`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ raceKey, pace }),
    })
    const json = await res.json().catch(() => null)
    if (json?.targetPaces) setAthlete(prev => prev ? { ...prev, target_paces: json.targetPaces } : prev)
  }

  // Détecte automatiquement un nouveau record (1 à 6 reps) sur un mouvement suivi en kg
  const checkAutoRecord = async (exerciseName, updated) => {
    if (!athlete || !exerciseName) return
    const reps = parseInt(updated.reps_done)
    const kg = parseFloat(updated.kg_done)
    if (!reps || reps < 1 || reps > 6 || !kg) return

    const match = trackedMovements.find(m =>
      m.name.trim().toLowerCase() === exerciseName.trim().toLowerCase() && (m.unit === 'kg' || !m.unit)
    )
    if (!match) return

    const rmField = `rm${reps}`
    const { data: entries } = await supabase.from('tracked_movement_entries')
      .select(rmField).eq('tracked_movement_id', match.id).eq('athlete_id', athlete.id)
    const best = (entries || []).reduce((max, e) => (e[rmField] != null && e[rmField] > max) ? e[rmField] : max, 0)

    if (kg > best) {
      const { error } = await supabase.from('tracked_movement_entries').insert({
        tracked_movement_id: match.id, athlete_id: athlete.id, date: today(), [rmField]: kg,
      })
      if (!error) {
        setToast(`🏆 Nouveau record ${reps}RM : ${kg}kg !`)
        setSessionRecords(prev => [...prev, { name: match.name, label: `${reps}RM : ${kg}kg` }])
      }
    }
  }

  // Enregistre un résultat pour un mouvement suivi non-kg (temps, distance, calories...) dans Metrics,
  // et détecte au passage si c'est un nouveau record.
  const saveMetricResult = async (movement, value) => {
    if (!athlete || value == null || isNaN(value)) return
    const cfg = UNITS[movement.unit] || UNITS.kg
    const date = today()
    const { data: entries } = await supabase.from('tracked_movement_entries')
      .select('id, value, date').eq('tracked_movement_id', movement.id).eq('athlete_id', athlete.id)
    const vals = (entries || []).map(e => e.value).filter(v => v != null)
    const currentBest = vals.length ? (cfg.betterIsHigher ? Math.max(...vals) : Math.min(...vals)) : null
    const isNewRecord = currentBest == null || (cfg.betterIsHigher ? value > currentBest : value < currentBest)

    const existingToday = (entries || []).find(e => e.date === date)
    const payload = { tracked_movement_id: movement.id, athlete_id: athlete.id, date, value }
    // Perf non améliorante : proposer de la marquer quand même comme record affiché (ex: si les
    // conditions du test ont changé) plutôt que de rester silencieusement une simple entrée.
    if (!isNewRecord && currentBest != null) {
      const ok = confirm(
        `Cette performance (${formatPerformance(movement, value)}) n'améliore pas ton record actuel `
        + `(${formatPerformance(movement, currentBest)}). L'enregistrer quand même comme nouveau record ?`
      )
      if (ok) {
        await supabase.from('tracked_movement_entries').update({ is_pr: false })
          .eq('tracked_movement_id', movement.id).eq('athlete_id', athlete.id)
        payload.is_pr = true
      }
    }
    const { error } = existingToday
      ? await supabase.from('tracked_movement_entries').update(payload).eq('id', existingToday.id)
      : await supabase.from('tracked_movement_entries').insert(payload)
    if (error) return

    if (isNewRecord || payload.is_pr) {
      setToast(`🏆 Nouveau record : ${formatPerformance(movement, value)} !`)
      setSessionRecords(prev => [...prev, { name: movement.name, label: formatPerformance(movement, value) }])
    } else {
      setToast(`Résultat enregistré : ${formatPerformance(movement, value)}`)
    }
  }

  const unvalidate = async (sessId, progSessions) => {
    if (!athlete) return
    if (!requireOnline()) return
    setValidating(true)
    await supabase.from('program_completions')
      .delete()
      .eq('athlete_id', athlete.id)
      .eq('program_session_id', sessId)
    const newSet = new Set([...completions])
    newSet.delete(sessId)
    setCompletions(newSet)
    setSkippedSessions(prev => { const n = new Set(prev); n.delete(sessId); return n })
    setCompletionDates(prev => { const n = { ...prev }; delete n[sessId]; return n })
    setOpenSessionId(sessId)
    setValidating(false)
  }

  // Séance terminée : sa position n'a plus lieu d'être mémorisée. Les valeurs saisies, elles, ne
  // sont effacées nulle part ici — elles quittent la file uniquement quand Supabase les a acceptées
  // (voir flushQueue), pour qu'une validation faite hors réseau ne perde rien.
  const clearSessionProgress = (sessId) => {
    if (!athlete) return
    try { localStorage.removeItem(sessionProgressKey(athlete.id, sessId)) } catch { /* pas bloquant */ }
  }

  const skipSession = async (sessId, progSessions) => {
    if (!athlete) return
    if (!requireOnline()) return
    setValidating(true)
    await supabase.from('program_completions').upsert(
      { athlete_id: athlete.id, program_session_id: sessId, skipped: true },
      { onConflict: 'athlete_id,program_session_id' }
    )
    setCompletions(new Set([...completions, sessId]))
    setSkippedSessions(prev => new Set([...prev, sessId]))
    setCompletionDates(prev => ({ ...prev, [sessId]: prev[sessId] || new Date().toISOString() }))
    forgetOpenedSession(sessId)
    clearSessionProgress(sessId)
    setValidating(false)
  }

  const postponeSession = async (sessId, offset) => {
    if (!athlete) return
    if (!requireOnline()) return
    setValidating(true)
    const res = await fetch(`/api/athlete-view/${token}/postpone-session`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId: sessId, offset }),
    })
    const json = await res.json().catch(() => ({}))
    setValidating(false)
    if (!res.ok) { alert('Erreur : ' + (json.error || 'report impossible')); return }
    const orderById = new Map(json.order.map(o => [o.id, o.order_index]))
    setPrograms(prev => prev.map(p => {
      if (!p.sessions.some(s => s.id === sessId)) return p
      const reordered = [...p.sessions].sort((a, b) => (orderById.get(a.id) ?? a.order_index) - (orderById.get(b.id) ?? b.order_index))
      return { ...p, sessions: reordered }
    }))
  }

  // "Décaler" de l'accueil : date choisie pour la séance, séances suivantes recalées derrière
  // (voir reschedule-session). L'ordre du programme ne bouge pas, seules les dates changent.
  const rescheduleSession = async (sessId, date) => {
    if (!athlete) return
    if (!requireOnline()) return
    const res = await fetch(`/api/athlete-view/${token}/reschedule-session`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId: sessId, date }),
    })
    const json = await res.json().catch(() => ({}))
    if (!res.ok) { alert('Erreur : ' + (json.error || 'impossible de décaler la séance')); return }
    const dateById = new Map(json.dates.map(d => [d.id, d.date]))
    setPrograms(prev => prev.map(p => (
      p.sessions.some(s => dateById.has(s.id))
        ? { ...p, sessions: p.sessions.map(s => (dateById.has(s.id) ? { ...s, date: dateById.get(s.id) } : s)) }
        : p
    )))
  }

  const validate = async (sessId, progSessions, feedback = {}, opts = {}) => {
    if (!athlete) return
    const isUpdate = !!opts.isUpdate
    setValidating(true)

    if (isOffline) {
      enqueue({ type: 'validate', athleteId: athlete.id, sessId, feedback })
      const newSet = new Set([...completions, sessId])
      setCompletions(newSet)
      setSkippedSessions(prev => { const n = new Set(prev); n.delete(sessId); return n })
      setPendingGroupSessions(prev => prev.filter(p => p.ownSessionId !== sessId))
      setCompletionDates(prev => ({ ...prev, [sessId]: prev[sessId] || new Date().toISOString() }))
      if (!isUpdate) {
        forgetOpenedSession(sessId)
        clearSessionProgress(sessId)
        const next = progSessions.find(s => !newSet.has(s.id))
        setOpenSessionId(next?.id || null)
      }
      setValidating(false)
      setToast('Validation enregistrée localement (hors ligne)')
      return
    }

    await supabase.from('program_completions').upsert(
      { athlete_id: athlete.id, program_session_id: sessId, skipped: false, ...feedback },
      { onConflict: 'athlete_id,program_session_id' }
    )
    const newSet = new Set([...completions, sessId])
    setCompletions(newSet)
    setSkippedSessions(prev => { const n = new Set(prev); n.delete(sessId); return n })
    setPendingGroupSessions(prev => prev.filter(p => p.ownSessionId !== sessId))
    setCompletionDates(prev => ({ ...prev, [sessId]: prev[sessId] || new Date().toISOString() }))
    if (!isUpdate) {
      forgetOpenedSession(sessId)
      clearSessionProgress(sessId)
      const next = progSessions.find(s => !newSet.has(s.id))
      setOpenSessionId(next?.id || null)
    }
    setValidating(false)
    setToast(isUpdate ? 'Bilan mis à jour' : 'Séance validée')

    if (isUpdate) return

    // Popup de félicitation avec tonnage + muscles — sauf fin de séance depuis l'écran de séance
    // (Seance.js), qui montre déjà son propre bilan (durée, séries, muscles).
    const allSessions = programs.flatMap(p => p.sessions)
    const sess = allSessions.find(s => s.id === sessId)
    if (sess) {
      const exos = sess.exercises.filter(e => e.name)
      let tonnage = 0
      exos.forEach(e => {
        const log = exerciseLogs[e.id]
        if (log?.kg_done && log?.sets_done && log?.reps_done) {
          tonnage += (parseFloat(log.kg_done) || 0) * (parseInt(log.sets_done) || 0) * (parseInt(log.reps_done) || 0)
        }
      })
      const exerciseNames = new Set(exos.map(e => e.name.trim().toLowerCase()).filter(Boolean))
      let muscles = []
      if (exerciseNames.size > 0) {
        // Bibliothèque récupérée en entier plutôt que filtrée par .in('name', …), sensible à la
        // casse côté Postgres — sinon un nom mal accordé (ex. casse différente) est raté silencieusement.
        const { data: movData } = await supabase.from('movements').select('name, muscles, focus_groups')
        const matched = (movData || []).filter(m => exerciseNames.has(m.name.trim().toLowerCase()))
        const withFocus = matched.filter(m => m.focus_groups)
        const withoutFocus = matched.filter(m => !m.focus_groups)
        const fromFocus = withFocus.flatMap(m => m.focus_groups.split(',').filter(Boolean))
        const fromText = parseMusclesFromText(withoutFocus.map(m => m.muscles || '').join(', '))
        muscles = [...new Set([...fromFocus, ...fromText])]
      }
      // Cible manuellement choisie sur un exercice (picker "Focus") : toujours reprise dans le résumé,
      // même si le texte de la bibliothèque de mouvements ne mentionne pas ce muscle.
      const manualMuscles = exos.flatMap(e => e.focus_muscles ? e.focus_muscles.split(',') : [])
      muscles = [...new Set([...muscles, ...manualMuscles])]
      const celebrationPayload = { tonnage: Math.round(tonnage), muscles, records: sessionRecords }
      if (!opts.skipCelebration) setCelebration(celebrationPayload)
      setSessionRecords([])

      // Séance validée par le coach en direct (coaching en présentiel) : l'athlète n'est pas devant
      // son écran pour voir ce bilan maintenant, donc on le met de côté pour le lui montrer à sa
      // prochaine connexion, comme s'il venait de valider lui-même.
      if (isCoachView) {
        await supabase.from('program_completions')
          .update({ pending_celebration: celebrationPayload })
          .eq('athlete_id', athlete.id).eq('program_session_id', sessId)
        await supabase.from('notifications').insert({
          athlete_id: athlete.id, type: 'session_validated_by_coach',
          title: 'Ton coach a validé une séance pour toi',
          body: sess.title || null,
        })
      } else if (athlete.coach_id) {
        await supabase.from('notifications').insert({
          coach_id: athlete.coach_id, type: 'session_validated_by_athlete',
          title: `${athlete.name} a validé une séance`,
          body: sess.title || null,
        })
      }
    }

    // Dernière séance accessible sans abonnement dans un programme en libre-service (voir la gate
    // côté serveur dans /api/athlete-view/[token]/route.js) : encourage à s'abonner pour débloquer
    // la suite du programme + tous les programmes de la plateforme.
    if (athlete.subscription_status !== 'active') {
      const prog = programs.find(p => p.sessions.some(s => s.id === sessId))
      if (prog?.is_self_service) {
        const limit = prog.free_sessions_count ?? 3
        const sorted = [...prog.sessions].sort((a, b) => a.order_index - b.order_index)
        const isLastFreeSession = sorted.length > limit && sorted.findIndex(s => s.id === sessId) === limit - 1
        if (isLastFreeSession) setFreeGateUpsell({ programName: prog.title })
      }
    }
  }

  const saveExerciseLog = async (exerciseId, exerciseName, field, value) => {
    if (!athlete) return
    const existing = exerciseLogs[exerciseId] || {}
    const updated = { ...existing, [field]: value }
    setExerciseLogs(prev => ({ ...prev, [exerciseId]: updated }))

    if (isOffline) {
      enqueue({ type: 'exercise_log', athleteId: athlete.id, exerciseId, updated })
      setToast('Enregistré localement (hors ligne)')
      return
    }

    const { error: logErr } = await supabase.from('program_exercise_logs').upsert(
      { athlete_id: athlete.id, program_exercise_id: exerciseId, ...updated },
      { onConflict: 'athlete_id,program_exercise_id' }
    )
    if (logErr) { alert('Erreur log : ' + logErr.message); return }
    // Snapshot dans l'historique à chaque champ enregistré (charge, reps, séries ou note)
    if (updated.kg_done || updated.reps_done || updated.sets_done || updated.note) {
      const { error: histErr } = await supabase.from('exercise_performance_history').insert({
        athlete_id: athlete.id,
        program_exercise_id: exerciseId,
        kg_done: updated.kg_done ? parseFloat(updated.kg_done) : null,
        reps_done: updated.reps_done || null,
        sets_done: updated.sets_done || null,
        note: updated.note || null,
      })
      if (histErr) alert('Erreur historique : ' + histErr.message)
    }

    if (field === 'kg_done' || field === 'reps_done') {
      checkAutoRecord(exerciseName, updated)
    }
  }

  // Les trois écritures de séries passent maintenant toutes par la file, en ligne comme hors ligne.
  // Deux raisons : la ligne locale (id temporaire) existe immédiatement — l'ancien chemin "en ligne"
  // attendait l'insert Supabase, et si l'athlète validait sa série pendant ce délai, la ligne cible
  // n'existait pas encore, l'écran avançait quand même et la série partait à la poubelle ; et la
  // saisie survit au rechargement de la WebView même si rien n'est encore parti au serveur.
  const addExerciseSet = async (exerciseId) => {
    if (!athlete) return
    const current = exerciseSets[exerciseId] || []
    const nextIndex = current.length ? Math.max(...current.map(s => s.set_index)) + 1 : 1
    const tempId = makeTempSetId()
    setExerciseSets(prev => ({ ...prev, [exerciseId]: [...(prev[exerciseId] || []), { id: tempId, athlete_id: athlete.id, program_exercise_id: exerciseId, set_index: nextIndex }] }))
    enqueue({ type: 'add_exercise_set', tempId, athleteId: athlete.id, exerciseId, setIndex: nextIndex })
    scheduleFlush()
  }

  const ensureExerciseSets = async (exerciseId, count) => {
    if (!athlete) return
    const current = exerciseSets[exerciseId] || []
    const missing = count - current.length
    if (missing <= 0) return
    const startIndex = current.length ? Math.max(...current.map(s => s.set_index)) + 1 : 1
    const newRows = []
    for (let i = 0; i < missing; i++) {
      const tempId = makeTempSetId()
      const setIndex = startIndex + i
      newRows.push({ id: tempId, athlete_id: athlete.id, program_exercise_id: exerciseId, set_index: setIndex })
      enqueue({ type: 'add_exercise_set', tempId, athleteId: athlete.id, exerciseId, setIndex })
    }
    setExerciseSets(prev => ({ ...prev, [exerciseId]: [...(prev[exerciseId] || []), ...newRows] }))
    scheduleFlush()
  }

  const saveExerciseSet = async (exerciseId, setId, field, value) => {
    // kg_prescribed arrive déjà en nombre (Seance.js) : 0 kg prescrit reste 0, seul l'absent est null.
    const parsedValue = field === 'kg_done' ? (value === '' ? null : parseFloat(value))
      : field === 'kg_prescribed' ? (value === '' || value == null ? null : Number(value))
      : (value || null)
    setExerciseSets(prev => ({
      ...prev,
      [exerciseId]: (prev[exerciseId] || []).map(s => s.id === setId ? { ...s, [field]: parsedValue } : s),
    }))
    enqueue({ type: 'exercise_set_field', setId, field, value: parsedValue })
    scheduleFlush()
  }

  const deleteExerciseSet = async (exerciseId, setId) => {
    setExerciseSets(prev => ({ ...prev, [exerciseId]: (prev[exerciseId] || []).filter(s => s.id !== setId) }))
    const q = loadQueue()
    // Série jamais partie au serveur : on retire simplement ses opérations en attente, rien à
    // supprimer côté Supabase.
    const stillPending = q.some(op => op.type === 'add_exercise_set' && op.tempId === setId)
    const rest = q.filter(op => op.tempId !== setId && op.setId !== setId)
    if (stillPending) { saveQueue(rest); return }
    saveQueue([...rest, { type: 'delete_exercise_set', setId }])
    scheduleFlush()
  }

  // Crée une séance libre. mode 'standard' | 'cardio' — choisi dans AddActionSheet, même
  // distinction que côté coach (voir program_sessions.activity_mode). destination 'builder' ouvre
  // le même éditeur "blocks" que le coach (SessionBlockEditor, pour construire la séance avant de
  // la faire) ; 'focus' ouvre directement la vue plein écran (comme "▶ Lancer"), utilisé quand on
  // repart d'une séance déjà construite (voir duplicateFreeSession) et qu'il n'y a rien à (re)bâtir.
  const startFreeSession = async (sourceExercises = [], mode = 'standard', destination = 'builder') => {
    if (!athlete) return
    if (!requireOnline()) return
    const res = await fetch(`/api/athlete-view/${token}/free-session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ exercises: sourceExercises, activityMode: mode }),
    })
    const json = await res.json()
    if (!res.ok) { alert('Erreur : ' + (json?.error || 'impossible de créer la séance')); return }

    const newProg = { ...json.program, sessions: [json.session] }
    setPrograms(prev => [newProg, ...prev])
    if (destination === 'focus') {
      router.push(`/s/${token}?session=${json.session.id}&focus=1${isCoachView ? '&coach=1' : ''}`)
    } else {
      router.push(`/s/${token}/session/${json.session.id}`)
    }
  }

  // Repart d'une séance libre existante (mêmes exercices, sans les charges/notes déjà loguées)
  // pour que le sportif puisse l'enchaîner facilement et suivre sa progression dans l'historique —
  // contenu déjà connu, donc droit dans la vue plein écran plutôt que l'éditeur.
  const duplicateFreeSession = (session) => {
    const sourceExercises = (session.exercises || []).map(e => ({
      name: e.name, sets: e.sets, reps: e.reps, kg: e.kg,
      pace_base: e.pace_base, pct_low: e.pct_low, pct_high: e.pct_high,
    }))
    startFreeSession(sourceExercises, session.activity_mode || 'standard', 'focus')
  }

  const updateFreeSessionDate = async (sessionId, date) => {
    if (!requireOnline()) return
    setPrograms(prev => prev.map(p => ({
      ...p,
      sessions: p.sessions.map(s => s.id === sessionId ? { ...s, date } : s),
    })))
    const res = await fetch(`/api/athlete-view/${token}/free-session/date`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId, date }),
    })
    if (!res.ok) alert('Erreur lors de la mise à jour de la date.')
  }

  const [recurringTodayCounts, setRecurringTodayCounts] = useState({})
  useEffect(() => {
    const n = new Date()
    const localDate = [n.getFullYear(), String(n.getMonth() + 1).padStart(2, '0'), String(n.getDate()).padStart(2, '0')].join('-')
    fetch(`/api/athlete-view/${token}/recurring-log?date=${localDate}`).then(r => r.json()).then(data => setRecurringTodayCounts(data.counts || {}))
  }, [token])

  // "+1" rapide sur une séance récurrente — pas de formulaire de ressenti, juste un compteur qui
  // repart à zéro chaque jour (voir recurring-log/route.js, qui ne compte que les lignes du jour).
  const logRecurringCompletion = async (sessionId) => {
    if (!requireOnline()) return
    setRecurringTodayCounts(prev => ({ ...prev, [sessionId]: (prev[sessionId] || 0) + 1 }))
    const res = await fetch(`/api/athlete-view/${token}/recurring-log`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sessionId }),
    })
    if (!res.ok) {
      setRecurringTodayCounts(prev => ({ ...prev, [sessionId]: Math.max(0, (prev[sessionId] || 1) - 1) }))
      alert('Erreur lors de l\'enregistrement.')
    }
  }

  const updateProgramDays = async (programId, daysOfWeek) => {
    if (!requireOnline()) return
    setPrograms(prev => prev.map(p => p.id === programId ? { ...p, athlete_days_of_week: daysOfWeek } : p))
    const res = await fetch(`/api/athlete-view/${token}/program-days`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ programId, daysOfWeek }),
    })
    if (!res.ok) alert('Erreur lors de la mise à jour des jours.')
  }

  const addFreeExercise = async (sessionId, { name, sets, reps, kg, pace_base, pct_low, pct_high }) => {
    if (!requireOnline()) return
    const res = await fetch(`/api/athlete-view/${token}/free-session/exercise`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId, name, sets, reps, kg, pace_base, pct_low, pct_high }),
    })
    const json = await res.json()
    if (!res.ok) { alert('Erreur : ' + (json?.error || 'impossible d\'ajouter l\'exercice')); return }
    setPrograms(prev => prev.map(p => ({
      ...p,
      sessions: p.sessions.map(s => s.id === sessionId ? { ...s, exercises: [...s.exercises, json.exercise] } : s),
    })))
  }

  const toggleFreeSuperset = async (sessionId, exoA, exoB) => {
    if (!requireOnline()) return
    const group = (exoA.superset_group && exoA.superset_group === exoB.superset_group) ? null : (exoA.superset_group || exoB.superset_group || Math.random().toString(36).slice(2, 8))
    await Promise.all([
      supabase.from('program_exercises').update({ superset_group: group }).eq('id', exoA.id),
      supabase.from('program_exercises').update({ superset_group: group }).eq('id', exoB.id),
    ])
    setPrograms(prev => prev.map(p => ({
      ...p,
      sessions: p.sessions.map(s => s.id === sessionId
        ? { ...s, exercises: s.exercises.map(e => (e.id === exoA.id || e.id === exoB.id) ? { ...e, superset_group: group } : e) }
        : s),
    })))
  }

  // Note du coach écrite en direct pendant la séance (visible aussi par le sportif), juste après
  // l'activation — pas une donnée de suivi du sportif, donc à part des logs/complétions ci-dessus.
  const saveCoachNote = async (programSessionId, value) => {
    await supabase.from('program_sessions').update({ coach_notes: value }).eq('id', programSessionId)
    setPrograms(prev => prev.map(p => ({
      ...p, sessions: p.sessions.map(s => s.id === programSessionId ? { ...s, coach_notes: value } : s)
    })))
  }

  const saveCircuitLog = async (programSessionId, circuitId, fields) => {
    if (!requireOnline()) return
    const res = await fetch(`/api/athlete-view/${token}/circuit-log`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ programSessionId, circuitId, ...fields }),
    })
    const json = await res.json().catch(() => ({}))
    if (!res.ok) return
    setCircuitLogs(prev => ({ ...prev, [`${programSessionId}::${circuitId}`]: json.log }))
  }

  if (!athlete) return (
    <div style={{ padding: 40, textAlign: 'center', color: 'var(--text3)' }}>Chargement…</div>
  )

  if (focusMode && targetSessionId) {
    let focusSession = null, focusProgSessions = [], focusIsFreeSession = false
    for (const p of programs) {
      const idx = p.sessions.findIndex(s => s.id === targetSessionId)
      if (idx !== -1) { focusSession = p.sessions[idx]; focusProgSessions = p.sessions; focusIsFreeSession = !!p.title?.startsWith('Séance libre'); break }
    }
    // Séance récurrente : ni "skippable" ni "reportable" (dispo tous les jours, hors calendrier),
    // et "faite" se mesure via recurring_session_logs (repasse à zéro chaque jour) plutôt que
    // program_completions (un seul enregistrement pour toujours) — voir logRecurringCompletion.
    const isFocusRecurring = focusSession?.session_type === 'recurrent'
    const recurringTarget = focusSession?.recurring_daily_target || 1
    const recurringCount = focusSession ? (recurringTodayCounts[focusSession.id] || 0) : 0
    const isDone = isFocusRecurring
      ? recurringCount >= recurringTarget
      : (focusSession ? completions.has(focusSession.id) && !skippedSessions.has(focusSession.id) : false)
    const isFocusSkipped = isFocusRecurring ? false : (focusSession ? skippedSessions.has(focusSession.id) : false)
    const isFocusFree = focusIsFreeSession
    // En coaching en direct, "retour" doit ramener le coach à son tableau de bord — pas dans
    // l'espace du sportif (onglets Séance/Stats/Records/Profil), où il se retrouvait coincé sans
    // autre sortie que le petit bouton "Switch to coach" (retour terrain). Exception : sur son
    // propre profil (ath.is_coach), "Switch to athlete" passe aussi par ?coach=1, donc isCoachView
    // est vrai alors qu'il s'agit de sa propre séance — "retour" doit alors rester sur sa page séance.
    const backHref = (isCoachView && !athlete.is_coach) ? '/' : `/s/${token}`

    // isCoachView est vrai à la fois quand un coach prévisualise la séance d'un CLIENT (supervision,
    // pas d'exécution — l'ancienne vue reste adaptée : note coach, pas de "Démarrer") et quand un
    // coach est sur SA PROPRE séance (ath.is_coach, voir commentaire backHref ci-dessus) — dans ce
    // second cas c'est bien lui qui s'entraîne, donc le nouveau player doit s'afficher comme pour
    // n'importe quel client.
    const isOwnAthleteSession = !isCoachView || athlete.is_coach

    // L'écran de séance (Seance.js) ne gère pas encore les mouvements de
    // course (zone d'allure cible, logging distance/allure, intervalles — voir TODO.md, chantier
    // explicitement mis de côté à sa création) : il affiquerait à tort des steppers Reps/Poids sans
    // aucun sens pour un run. Tant que ce n'est pas repris, une séance contenant un run reste sur
    // l'ancienne vue (SessionCard) qui gère déjà tout ça correctement — pas de bouton "Démarrer".
    const focusSessionHasRun = !!focusSession?.exercises?.some(e => e.name && isRunMovement(e.name))

    const handleFocusSkip = () => {
      const currentIdx = focusProgSessions.findIndex(s => s.id === focusSession.id)
      const next = focusProgSessions.find((s, i) => i > currentIdx && !completions.has(s.id))
      skipSession(focusSession.id, focusProgSessions)
      router.push(next ? `/s/${token}?session=${next.id}&focus=1${isCoachView ? '&coach=1' : ''}` : backHref)
    }

    const playerActive = !!focusSession && playerStarted && isOwnAthleteSession && !focusSessionHasRun

    const workoutContent = (
      <>
        {/* L'écran de séance (Seance.js) a son propre en-tête (retour + titre) : pas de doublon. */}
        {!playerActive && (
        <div style={{ background: 'var(--bg)', borderBottom: '1px solid var(--border)', padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 10, position: 'sticky', top: 0, zIndex: 10 }}>
          <button onClick={() => router.push(backHref)} style={{ background: 'none', border: 'none', fontSize: 22, color: 'var(--text2)', cursor: 'pointer', padding: '2px 4px', lineHeight: 1, flexShrink: 0 }}>←</button>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 800, fontSize: 16, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{focusSession?.title || 'Séance'}</div>
            <div style={{ fontSize: 11, color: 'var(--text3)' }}>{athlete.name}</div>
          </div>
        </div>
        )}

        {playerActive ? (
          <Seance
            session={focusSession}
            athleteId={athlete.id}
            mouvementsSections={mouvementsSections}
            exerciseSets={exerciseSets}
            onEnsureExerciseSets={ensureExerciseSets}
            onSaveExerciseSet={saveExerciseSet}
            onQuitter={() => setPlayerStarted(false)}
            // Pas de notation côté client : la séance est validée avec sa durée, puis retour à
            // l'accueil. Une séance déjà faite (refaite depuis l'historique) met simplement à jour son bilan.
            onTerminer={async ({ duree_min }) => {
              await validate(focusSession.id, focusProgSessions, { duration_minutes: duree_min }, { isUpdate: isDone, skipCelebration: true })
              setPlayerStarted(false)
              router.push(`/s/${token}${isCoachView ? '?coach=1' : ''}`)
            }}
          />
        ) : (
        <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
          {focusSession ? (
            <SessionCard
              mouvementsSections={mouvementsSections}
              session={focusSession}
              idx={0}
              isOpen={true}
              isCompleted={isDone}
              isSkipped={isFocusSkipped}
              onToggle={() => {}}
              onValidate={isFocusRecurring ? () => logRecurringCompletion(focusSession.id) : (fb) => validate(focusSession.id, focusProgSessions, fb, { isUpdate: isDone })}
              onUnvalidate={(!isFocusRecurring && (isDone || isFocusSkipped)) ? () => unvalidate(focusSession.id, focusProgSessions) : null}
              onSkip={(!isCoachView && !isDone && !isFocusSkipped && !isFocusFree && !isFocusRecurring) ? handleFocusSkip : null}
              onPostpone={(!isCoachView && !isDone && !isFocusSkipped && !isFocusFree && !isFocusRecurring) ? (offset) => postponeSession(focusSession.id, offset) : null}
              isRecurring={isFocusRecurring}
              validating={validating}
              exerciseLogs={exerciseLogs}
              onSaveLog={saveExerciseLog}
              athleteId={athlete.id}
              trackedMovements={trackedMovements}
              onSaveMetricResult={saveMetricResult}
              exerciseSets={exerciseSets}
              onAddExerciseSet={addExerciseSet}
              onEnsureExerciseSets={ensureExerciseSets}
              onSaveExerciseSet={saveExerciseSet}
              onDeleteExerciseSet={deleteExerciseSet}
              isCoachView={isCoachView}
              isCoach={isCoach}
              raceKnown={raceKnown}
              onSyncRaceMetric={syncRaceMetric}
              targetPaces={athlete.target_paces}
              onSaveTargetPace={saveTargetPace}
              isFreeSession={focusIsFreeSession}
              onAddExercise={addFreeExercise}
              onToggleSuperset={toggleFreeSuperset}
              onDuplicateFreeSession={() => duplicateFreeSession(focusSession)}
              onUpdateFreeSessionDate={date => updateFreeSessionDate(focusSession.id, date)}
              circuitLogs={circuitLogs}
              onSaveCircuitLog={saveCircuitLog}
              onSaveCoachNote={saveCoachNote}
              isGroupLeader={isGroupLeader}
              onLaunchTimer={(config, label) => setRunningTimer({ config, label })}
              onExerciseSaved={() => setExerciseToast('Enregistré')}
              token={token}
              playerMode={isOwnAthleteSession}
              onStartPlayer={focusSessionHasRun ? null : () => setPlayerStarted(true)}
            />
          ) : (
            <div style={{ textAlign: 'center', color: 'var(--text3)', padding: '40px 20px' }}>Séance introuvable</div>
          )}
        </div>
        )}

        {celebration && (
          <CelebrationModal tonnage={celebration.tonnage} muscles={celebration.muscles} records={celebration.records} citation={celebration.citation} onClose={() => { setCelebration(null); router.push(backHref) }} />
        )}
        {!celebration && freeGateUpsell && (
          <FreeGateUpsellModal upsell={freeGateUpsell} onSeeOffers={() => { setFreeGateUpsell(null); setShowSubscription(true) }} onClose={() => setFreeGateUpsell(null)} />
        )}
        {showSubscription && (
          <SubscriptionScreen athlete={athlete} token={token} onClose={() => setShowSubscription(false)} />
        )}
        <Toast message={toast} show={!!toast} onDone={() => setToast(null)} />
        <Toast message={exerciseToast} show={!!exerciseToast} onDone={() => setExerciseToast(null)} position="top" />
      </>
    )

    if (runningTimer) {
      return (
        <SplitTimerSession config={runningTimer.config} timerLabel={runningTimer.label} onClose={() => setRunningTimer(null)}>
          {workoutContent}
        </SplitTimerSession>
      )
    }

    return (
      <div style={{ maxWidth: isNative ? 'none' : 480, margin: '0 auto', minHeight: '100svh', background: 'var(--bg2)', paddingBottom: 60 }}>
        {workoutContent}
      </div>
    )
  }

  return (
    <div style={{ maxWidth: isNative ? 'none' : 480, margin: '0 auto', minHeight: '100svh', background: 'var(--bg2)', paddingBottom: 90 }}>

      {/* Header */}
      <div style={{ background: 'var(--bg)', borderBottom: '1px solid var(--border)', padding: '14px 16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ fontFamily: 'var(--font-title)', color: 'var(--title)', fontWeight: 700, fontSize: 19, flex: 1 }}>{athlete.name}</div>
          {!isCoachView && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 2, flexShrink: 0 }}>
              <ChatHeaderButton athleteId={athlete.id} />
              <NotificationBell athleteId={athlete.id} />
            </div>
          )}
          {/* Aussi sur son propre profil sportif (athlete.is_coach) ouvert sans ?coach=1 : le coach
              doit toujours pouvoir revenir à son espace. */}
          {(isCoachView || athlete.is_coach) && (
            <button
              onClick={() => router.push('/')}
              style={{
                background: 'var(--green-light)', color: 'var(--green)',
                border: '1.5px solid #B8EAD8', borderRadius: 20,
                padding: '8px 14px', fontSize: 12, fontWeight: 700,
                cursor: 'pointer', flexShrink: 0, display: 'flex', alignItems: 'center', gap: 5
              }}
            >
              <House size={14} /> Switch to coach
            </button>
          )}
        </div>
      </div>

      {isOffline && (
        <div style={{ background: '#FEF3C7', borderBottom: '1px solid #FDE68A', padding: '8px 16px', display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ display: 'flex' }}><WifiSlash size={14} /></span>
          <span style={{ fontSize: 12, fontWeight: 600, color: '#92400E' }}>Hors ligne — tu vois les dernières données chargées. Les actions (valider, enregistrer) reprendront une fois reconnecté.</span>
        </div>
      )}

      {/* Bilan hebdomadaire auto (dimanche 18h → mardi 22h, une fois par semaine) — jamais côté
          coach qui prévisualise le compte d'un client (isCoachView). */}
      {!isCoachView && (
        <WeeklyRecapPopup
          athlete={athlete}
          onSeen={weekStart => setAthlete(a => ({ ...a, weekly_recap_shown_for: weekStart }))}
        />
      )}

      {visitedTabs.has('wod') && (
        <div style={{ display: activeTab === 'wod' ? 'block' : 'none' }}>
          <WodTab
            isCoachView={isCoachView}
            noteBlocks={noteBlocks}
            programs={programs} completions={completions} skippedSessions={skippedSessions}
            completionDates={completionDates} openedSessionId={openedSessionId}
            onOpenSubscription={() => setShowSubscription(true)}
            selectedType={selectedType} setSelectedType={setSelectedType}
            router={router} token={token} setActiveTab={setActiveTab}
            onUpdateProgramDays={updateProgramDays} isGroupLeader={isGroupLeader}
            athlete={athlete} objectives={objectives} setObjectives={setObjectives}
            recurringTodayCounts={recurringTodayCounts}
            onRescheduleSession={rescheduleSession}
          />
        </div>
      )}
      {visitedTabs.has('stats') && (
        <div style={{ display: activeTab === 'stats' ? 'block' : 'none' }}>
          <StatsTab
            athlete={athlete}
            activityRefreshKey={activityRefreshKey}
          />
        </div>
      )}
      {visitedTabs.has('templates') && (
        <div style={{ display: activeTab === 'templates' ? 'block' : 'none' }}>
          <TemplatesTab token={token} programs={programs} setActiveTab={setActiveTab} />
        </div>
      )}
      {visitedTabs.has('profil') && (
        <div style={{ display: activeTab === 'profil' ? 'block' : 'none' }}>
          <ProfilTab
            athlete={athlete} token={token} setActiveTab={setActiveTab}
            onWeightUpdate={w => setAthlete(a => ({ ...a, weight: w }))}
            onSexUpdate={s => setAthlete(a => ({ ...a, sex: s }))}
            onBadgeStandardUpdate={v => setAthlete(a => ({ ...a, badge_standard: v }))}
            onHeightUpdate={h => setAthlete(a => ({ ...a, height: h }))}
            onBirthDateUpdate={d => setAthlete(a => ({ ...a, birth_date: d }))}
          />
        </div>
      )}

      <AthleteTabBar active={activeTab} onChange={setActiveTab} onAdd={() => setShowAddSheet(true)} addActive={showAddSheet || showAddWizard} unreadMessages={unreadMessages} />

      {showAddSheet && (
        <AddActionSheet
          onClose={() => setShowAddSheet(false)}
          onAddActivity={() => { setShowAddSheet(false); setShowAddWizard(true) }}
          onFreeSession={(mode, timing) => { setShowAddSheet(false); startFreeSession([], mode, timing === 'now' ? 'focus' : 'builder') }}
          onAddRecord={() => {
            setShowAddSheet(false)
            setActiveTab('stats')
            // Les records sont en bas de Stats : on y descend une fois l'onglet affiché.
            setTimeout(() => document.getElementById('stats-records')?.scrollIntoView({ behavior: 'smooth' }), 300)
          }}
        />
      )}
      {showAddWizard && (
        <AddActivityWizard athleteId={athlete.id} onClose={() => setShowAddWizard(false)} onSaved={() => setActivityRefreshKey(k => k + 1)} />
      )}

      {celebration && (
        <CelebrationModal
          tonnage={celebration.tonnage}
          muscles={celebration.muscles}
          records={celebration.records}
          citation={celebration.citation}
          onClose={() => setCelebration(null)}
        />
      )}

      {!celebration && pendingGroupSessions.length > 0 && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1300, padding: 16 }}>
          <div style={{ background: 'var(--bg)', borderRadius: 'var(--rl)', padding: 20, maxWidth: 380, width: '100%', boxShadow: '0 20px 60px rgba(0,0,0,0.4)' }}>
            <div style={{ fontSize: 32, marginBottom: 8, textAlign: 'center' }}>🙋</div>
            <div style={{ fontFamily: 'var(--font-title)', color: 'var(--title)', fontSize: 17, fontWeight: 700, marginBottom: 4, textAlign: 'center' }}>
              Tu as participé à une séance !
            </div>
            <div style={{ fontSize: 13, color: 'var(--text3)', marginBottom: 16, textAlign: 'center' }}>
              Ton coach t&apos;a marqué présent. Complète tes résultats pour que ça compte dans ton suivi.
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {pendingGroupSessions.map(p => (
                <button key={p.runId} onClick={() => router.push(`/s/${token}?session=${p.ownSessionId}&focus=1${isCoachView ? '&coach=1' : ''}`)}
                  style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--green-light)', border: '1px solid #B8EAD8', borderRadius: 'var(--r)', padding: '12px 14px', cursor: 'pointer', textAlign: 'left' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--green)' }}>{p.title || 'Séance'}</div>
                    <div style={{ fontSize: 11, color: 'var(--text3)' }}>{new Date(p.date + 'T00:00:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })}</div>
                  </div>
                  <span style={{ color: 'var(--green)', fontWeight: 700 }}>→</span>
                </button>
              ))}
            </div>
            <button onClick={() => setPendingGroupSessions([])} style={{ marginTop: 12, background: 'none', border: 'none', color: 'var(--text3)', fontSize: 13, fontWeight: 600, cursor: 'pointer', width: '100%', padding: 6 }}>
              Plus tard
            </button>
          </div>
        </div>
      )}

      {!celebration && pendingGroupSessions.length === 0 && showBirthdayPopup && (
        <div onClick={dismissBirthdayPopup} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1300, padding: 16 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: 'var(--bg)', borderRadius: 'var(--rl)', padding: 20, maxWidth: 380, width: '100%', boxShadow: '0 20px 60px rgba(0,0,0,0.4)' }}>
            <div style={{ fontSize: 40, marginBottom: 8, textAlign: 'center' }}>🎂</div>
            <div style={{ fontFamily: 'var(--font-title)', color: 'var(--title)', fontSize: 17, fontWeight: 700, marginBottom: 4, textAlign: 'center' }}>
              Joyeux anniversaire !
            </div>
            <div style={{ fontSize: 13, color: 'var(--text3)', marginBottom: 16, textAlign: 'center' }}>
              {birthdayMessage}
            </div>
            <button onClick={dismissBirthdayPopup} style={{ background: 'var(--green)', color: '#fff', border: 'none', borderRadius: 'var(--r)', padding: '11px', fontSize: 14, fontWeight: 700, cursor: 'pointer', width: '100%' }}>
              Merci !
            </button>
          </div>
        </div>
      )}

      {!celebration && pendingGroupSessions.length === 0 && !showBirthdayPopup && showRenewalPopup && (
        <div onClick={dismissRenewalPopup} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1300, padding: 16 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: 'var(--bg)', borderRadius: 'var(--rl)', padding: 20, maxWidth: 380, width: '100%', boxShadow: '0 20px 60px rgba(0,0,0,0.4)' }}>
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 8 }}><Bell size={32} /></div>
            <div style={{ fontFamily: 'var(--font-title)', color: 'var(--title)', fontSize: 17, fontWeight: 700, marginBottom: 4, textAlign: 'center' }}>
              Renouvellement à venir
            </div>
            <div style={{ fontSize: 13, color: 'var(--text3)', marginBottom: 16, textAlign: 'center' }}>
              Ton abonnement se renouvelle automatiquement le{' '}
              {new Date(athlete.subscription_current_period_end).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}.
            </div>
            <button onClick={dismissRenewalPopup} style={{ background: 'var(--green)', color: '#fff', border: 'none', borderRadius: 'var(--r)', padding: '11px', fontSize: 14, fontWeight: 700, cursor: 'pointer', width: '100%' }}>
              Compris
            </button>
          </div>
        </div>
      )}

      {!celebration && pendingGroupSessions.length === 0 && !showBirthdayPopup && !showRenewalPopup && freeGateUpsell && (
        <FreeGateUpsellModal upsell={freeGateUpsell} onSeeOffers={() => { setFreeGateUpsell(null); setShowSubscription(true) }} onClose={() => setFreeGateUpsell(null)} />
      )}

      {showSubscription && (
        <SubscriptionScreen athlete={athlete} token={token} onClose={() => setShowSubscription(false)} />
      )}

      <Toast message={toast} show={!!toast} onDone={() => setToast(null)} />
    </div>
  )
}

// Deux déclencheurs, une seule modale : la gate atteinte en fin d'accès gratuit d'un programme
// (upsell.programName), et le rappel périodique pour un compte gratuit (voir loadAthlete) — avant,
// seule la gate existait, et un sportif qui ne poussait aucun programme jusqu'au bout ne voyait
// jamais parler d'abonnement (retour testeur).
// Le bouton n'envoie plus directement vers le checkout de la formule A : il ouvre l'écran des
// formules, où le sportif voit ce que chacune apporte avant de payer.
function FreeGateUpsellModal({ upsell, onSeeOffers, onClose }) {
  const isGate = !!upsell.programName
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1300, padding: 16 }}>
      <div style={{ background: 'var(--bg)', borderRadius: 'var(--rl)', padding: 20, maxWidth: 380, width: '100%', boxShadow: '0 20px 60px rgba(0,0,0,0.4)' }}>
        <div style={{ fontSize: 32, marginBottom: 8, textAlign: 'center' }}>{isGate ? '🎉' : '🔓'}</div>
        <div style={{ fontFamily: 'var(--font-title)', color: 'var(--title)', fontSize: 17, fontWeight: 700, marginBottom: 4, textAlign: 'center' }}>
          {isGate ? `Bravo pour ces ${FREE_SESSIONS_DEFAULT} séances !` : 'Tu es en accès gratuit'}
        </div>
        <div style={{ fontSize: 13, color: 'var(--text3)', marginBottom: 16, textAlign: 'center' }}>
          {isGate
            ? <>Tu as terminé l&apos;accès gratuit de « {upsell.programName} ». Abonne-toi pour débloquer la suite de ce programme, et l&apos;accès à tous les programmes de la plateforme.</>
            : <>Ton compte s&apos;arrête aux {FREE_SESSIONS_DEFAULT} premières séances de chaque programme. L&apos;abonnement débloque tout le catalogue, à partir de {SUBSCRIPTION_TIERS.A.amount.toFixed(2).replace('.', ',')}€/mois.</>}
        </div>
        <button onClick={onSeeOffers}
          style={{ background: 'var(--green)', color: '#fff', border: 'none', borderRadius: 'var(--r)', padding: '11px', fontSize: 14, fontWeight: 700, cursor: 'pointer', width: '100%', marginBottom: 8 }}>
          Voir les formules
        </button>
        <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text3)', fontSize: 13, fontWeight: 600, cursor: 'pointer', width: '100%', padding: 6 }}>
          Plus tard
        </button>
      </div>
    </div>
  )
}

const logInputStyle = {
  width: '100%', padding: '7px 9px', border: '1px solid var(--border2)',
  borderRadius: 'var(--r)', fontSize: 14, fontWeight: 700, outline: 'none',
  background: 'var(--bg)', color: 'var(--text)', boxSizing: 'border-box'
}

// Résultat d'un circuit : par défaut le sportif choisit lui-même ce qu'il renseigne (temps,
// tours, reps, ou tours + reps) — comportement conservé pour les circuits créés par le sportif
// dans ses séances libres. Si le coach a fixé un result_mode sur le circuit (template), ce choix
// est verrouillé : le sportif voit directement le bon champ, sans les boutons de sélection.
function CircuitLogger({ programSessionId, circuitId, log, onSave, resultMode = null }) {
  const [mode, setMode] = useState(resultMode || log?.mode || null)
  const [temps, setTemps] = useState(log?.temps || '')
  const [tours, setTours] = useState(log?.tours ?? '')
  const [reps, setReps] = useState(log?.reps || '')
  const [note, setNote] = useState(log?.note || '')
  const [validated, setValidated] = useState(false)

  const save = (patch = {}) => {
    onSave(programSessionId, circuitId, { mode, temps, tours, reps, note, ...patch })
  }

  const handleValidate = () => { save(); setValidated(true) }

  const chooseMode = (m) => {
    setMode(m)
    save({ mode: m })
  }

  return (
    <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px dashed #C7D2FE', display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: '#4338CA', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Mon résultat</div>
      {!resultMode && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {CIRCUIT_MODES.map(m => (
            <button key={m.key} onClick={() => chooseMode(m.key)} style={{
              background: mode === m.key ? '#4338CA' : 'var(--bg)', color: mode === m.key ? '#fff' : '#4338CA',
              border: '1px solid #C7D2FE', borderRadius: 20, padding: '5px 10px', fontSize: 12, fontWeight: 700, cursor: 'pointer',
            }}>
              {m.label}
            </button>
          ))}
        </div>
      )}
      {mode === 'temps' && (
        <input placeholder="Ex : 12:30" value={temps} onChange={e => { setTemps(e.target.value); setValidated(false) }} onBlur={() => save()} style={logInputStyle} />
      )}
      {(mode === 'tours' || mode === 'tours_reps') && (
        <input type="number" min="0" placeholder="Nombre de tours" value={tours} onChange={e => { setTours(e.target.value); setValidated(false) }} onBlur={() => save()} style={logInputStyle} />
      )}
      {(mode === 'reps' || mode === 'tours_reps') && (
        <input placeholder="Reps" value={reps} onChange={e => { setReps(e.target.value); setValidated(false) }} onBlur={() => save()} style={logInputStyle} />
      )}
      {mode && (
        <textarea placeholder="Comment c'était ?" value={note} onChange={e => { setNote(e.target.value); setValidated(false) }} onBlur={() => save()} rows={2}
          style={{ width: '100%', padding: '7px 9px', border: '1px solid var(--border2)', borderRadius: 'var(--r)', fontSize: 13, outline: 'none', background: 'var(--bg)', color: 'var(--text)', resize: 'none', boxSizing: 'border-box', fontFamily: 'inherit' }}
        />
      )}
      {mode && (
        <button onClick={handleValidate} style={{
          background: validated ? '#DCFCE7' : '#4338CA',
          color: validated ? '#166534' : '#fff',
          border: 'none', borderRadius: 20, padding: '9px', fontSize: 13, fontWeight: 700, cursor: 'pointer', width: '100%',
          transition: 'all .15s',
        }}>
          {validated ? '✓ Enregistré' : '✓ Valider ce circuit'}
        </button>
      )}
    </div>
  )
}

const TARGET_RACE_KEYS = [{ key: '10km', label: '10 km' }, { key: '21km', label: 'Semi' }, { key: '42km', label: 'Marathon' }]

function RunResultLogger({ exo, exerciseLogs, onSaveLog, onSyncRaceMetric, targetPaces, onSaveTargetPace }) {
  const log = exerciseLogs[exo.id] || {}
  const [intervals, setIntervals] = useState(log.intervals_done || [])

  const syncFromLog = (field, value) => {
    if (!onSyncRaceMetric) return
    const current = exerciseLogs[exo.id] || {}
    const distanceKm = field === 'distance_done' ? value : current.distance_done
    const avgPace = field === 'avg_pace_done' ? value : current.avg_pace_done
    onSyncRaceMetric(exo.name, distanceKm, avgPace)
  }

  const addInterval = () => {
    const next = [...intervals, { distance: '', pace: '' }]
    setIntervals(next)
  }
  const updateInterval = (i, field, val) => {
    setIntervals(prev => prev.map((it, idx) => idx === i ? { ...it, [field]: val } : it))
  }
  const commitIntervals = () => onSaveLog(exo.id, exo.name, 'intervals_done', intervals)
  const removeInterval = (i) => {
    const next = intervals.filter((_, idx) => idx !== i)
    setIntervals(next)
    onSaveLog(exo.id, exo.name, 'intervals_done', next)
  }

  const target = RACE_TARGETS.find(t => t.match(exo.name))
  const distanceOnly = target?.kind === 'distance'

  return (
    <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px dashed var(--border)', display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--green)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Ma séance</div>
      <div style={{ display: 'flex', gap: 8 }}>
        {!distanceOnly && (
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 10, color: 'var(--text3)', fontWeight: 600, marginBottom: 3 }}>Allure moyenne (min/km)</div>
            <input type="text" placeholder="ex: 5'30" defaultValue={log.avg_pace_done || ''}
              onBlur={e => { onSaveLog(exo.id, exo.name, 'avg_pace_done', e.target.value); syncFromLog('avg_pace_done', e.target.value) }}
              style={logInputStyle} />
          </div>
        )}
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 10, color: 'var(--text3)', fontWeight: 600, marginBottom: 3 }}>Distance parcourue (km)</div>
          <input type="number" step="0.01" min="0" placeholder="ex: 6.5" defaultValue={log.distance_done ?? ''}
            onBlur={e => { const v = e.target.value ? parseFloat(e.target.value) : null; onSaveLog(exo.id, exo.name, 'distance_done', v); syncFromLog('distance_done', v) }}
            style={logInputStyle} />
        </div>
      </div>

      {!distanceOnly && intervals.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {intervals.map((it, i) => (
            <div key={i} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <input type="number" step="0.01" min="0" placeholder="Distance (km)" value={it.distance}
                onChange={e => updateInterval(i, 'distance', e.target.value)}
                onBlur={commitIntervals}
                style={{ ...logInputStyle, fontSize: 12 }} />
              <input type="text" placeholder="Allure (min/km)" value={it.pace}
                onChange={e => updateInterval(i, 'pace', e.target.value)}
                onBlur={commitIntervals}
                style={{ ...logInputStyle, fontSize: 12 }} />
              <button onClick={() => removeInterval(i)} style={{ background: 'none', border: 'none', color: 'var(--text3)', fontSize: 16, cursor: 'pointer', padding: '0 2px', flexShrink: 0 }}>×</button>
            </div>
          ))}
        </div>
      )}

      {!distanceOnly && (
        <button onClick={addInterval} style={{ background: 'none', border: '1px dashed var(--border2)', borderRadius: 'var(--r)', padding: '7px', fontSize: 12, fontWeight: 600, color: 'var(--text3)', cursor: 'pointer' }}>
          + Ajouter un intervalle
        </button>
      )}

      {onSaveTargetPace && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, paddingTop: 8, borderTop: '1px dashed var(--border)' }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.5px', display: 'flex', alignItems: 'center', gap: 4 }}><Target size={11} /> Mes allures cibles</div>
          <div style={{ display: 'flex', gap: 6 }}>
            {TARGET_RACE_KEYS.map(r => (
              <div key={r.key} style={{ flex: 1 }}>
                <div style={{ fontSize: 10, color: 'var(--text3)', fontWeight: 600, marginBottom: 3 }}>{r.label}</div>
                <input type="text" placeholder="ex: 4'45" defaultValue={(targetPaces || {})[r.key] || ''}
                  onBlur={e => onSaveTargetPace(r.key, e.target.value)}
                  style={{ ...logInputStyle, fontSize: 12 }} />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function SessionCard({ session, idx, isOpen, isCompleted, isSkipped = false, onToggle, onValidate, onUnvalidate, onSkip, onPostpone, validating, exerciseLogs = {}, onSaveLog, athleteId, trackedMovements = [], onSaveMetricResult, exerciseSets = {}, onAddExerciseSet, onEnsureExerciseSets, onSaveExerciseSet, onDeleteExerciseSet, isCoachView, isCoach, raceKnown = {}, onSyncRaceMetric, targetPaces, onSaveTargetPace, isFreeSession = false, onAddExercise, onToggleSuperset, onDuplicateFreeSession, onUpdateFreeSessionDate, circuitLogs = {}, onSaveCircuitLog, isGroupLeader = false, onLaunchTimer, onSaveCoachNote, onExerciseSaved, isRecurring = false, token, playerMode = false, onStartPlayer, mouvementsSections = {} }) {
  const [showGroupPaces, setShowGroupPaces] = useState(false)
  const [showPostpone, setShowPostpone] = useState(false)
  const paceRefs = annotatePaceReferences(session.coach_notes, raceKnown)
  const [focusPicker, setFocusPicker] = useState(null) // exercise id being edited
  const [viewingFocus, setViewingFocus] = useState(null) // zones array being viewed
  const [focusOverrides, setFocusOverrides] = useState({})
  const [focusGroupOverrides, setFocusGroupOverrides] = useState({}) // focus du mouvement (par nom, lowercase)
  const [showTimer, setShowTimer] = useState(null) // null | { seconds, label }
  const [calcModal, setCalcModal] = useState(null) // null | { pace1, pace2 } (km/h)
  const [showMateriel, setShowMateriel] = useState(false)
  const [subscribingFromLock, setSubscribingFromLock] = useState(false)
  const provisionedSetsRef = useRef(new Set())

  const subscribeFromLock = async () => {
    setSubscribingFromLock(true)
    const res = await fetch(`/api/athlete-view/${token}/checkout`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tier: 'A' }),
    })
    const json = await res.json().catch(() => ({}))
    setSubscribingFromLock(false)
    if (json.error) { alert('Erreur : ' + json.error); return }
    window.location.assign(json.url)
  }

  const saveFocusMuscles = async (exerciseId, movementName, zones) => {
    if (!isCoach) { setFocusPicker(null); return }
    const value = zones.length ? zones.join(',') : null
    const name = movementName?.trim()
    // Écriture côté serveur (contrôle isCoach) : le focus est porté par le mouvement et vaut
    // pour toutes ses utilisations, actuelles et futures — le sportif ne doit jamais pouvoir l'écrire.
    const res = await fetch(`/api/athlete-view/${token}/focus-groups`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ exerciseId, movementName: name, zones }),
    })
    if (!res.ok) { setFocusPicker(null); return }
    if (name) setFocusGroupOverrides(prev => ({ ...prev, [name.toLowerCase()]: value }))
    setFocusOverrides(prev => ({ ...prev, [exerciseId]: null }))
    setFocusPicker(null)
  }
  // Exercices d'un ancien bloc échauffement / retour au calme : affichés dans leur section
  // (session.sections, voir lib/sectionsTexte.js), plus dans la liste des exercices.
  const exos = session.exercises.filter(e => e.name && !['warmup', 'cooldown'].includes(e.block_type))
  // Envoyées toutes prêtes par l'API ; calculées ici pour une séance créée côté client (séance libre).
  const sections = session.sections || {
    echauffement: sectionDeSeance(session, 'echauffement'),
    retourAuCalme: sectionDeSeance(session, 'retourAuCalme'),
  }
  const [videoSection, setVideoSection] = useState(null)
  // La liste condensée du mode player (juste nom + nb de séries, voir plus bas) n'affiche jamais la
  // note du coach — sans conséquence tant qu'elle mène à l'écran de séance (Seance.js), qui la montre à son tour,
  // mais pour une séance de course (redirigée vers cette vue complète, Seance.js ne gérant pas
  // encore le cardio) ce serait la seule vue jamais montrée à l'athlète. On bascule alors sur le
  // détail complet ci-dessous (note, zone d'allure, logging) plutôt que la liste condensée.
  const sessionHasRun = exos.some(e => isRunMovement(e.name))
  const labels = computeLabels(session.exercises)
  const [savedIds, setSavedIds] = useState({})
  // Une fois enregistré, l'exercice se replie automatiquement (retour terrain : la card pleine
  // taille reste ouverte et encombre l'écran pendant tout le reste de la séance) — un tap sur la
  // ligne repliée le rouvre pour corriger un chiffre ; ré-enregistrer le referme aussitôt.
  const [expandedOverride, setExpandedOverride] = useState({})
  // Position d'un circuit dans la séquence (0 = avant le 1er exercice, exos.length = après le
  // dernier) — cf. côté coach pour le détail du positionnement interleavé avec les exercices.
  const circuitSlot = (c) => Math.max(0, Math.min(c.afterExerciseIndex ?? 0, exos.length))
  const renderCircuit = (c) => (
    <div key={c.id} style={{ background: '#EEF2FF', border: '1px solid #C7D2FE', borderRadius: 'var(--r)', padding: '10px 12px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
        <div style={{ flex: 1, fontSize: 10, fontWeight: 800, color: '#4338CA', textTransform: 'uppercase', letterSpacing: '0.5px', display: 'flex', alignItems: 'center', gap: 4 }}><Repeat size={11} /> {c.name || 'Circuit'}</div>
        {c.timer && (
          <button onClick={() => { unlockAudio(); unlockSpeech(); onLaunchTimer?.(c.timer, c.name || 'Circuit') }}
            style={{ background: '#4338CA', color: '#fff', border: 'none', borderRadius: 'var(--r)', padding: '4px 10px', fontSize: 12, fontWeight: 700, flexShrink: 0, cursor: 'pointer' }}>
            ▶⏱ Timer
          </button>
        )}
      </div>
      {c.text && (
        <div style={{ fontSize: 13, color: 'var(--text)', lineHeight: 1.7, whiteSpace: 'pre-wrap', marginBottom: c.videos?.length > 0 ? 8 : 0 }}>{c.text}</div>
      )}
      {c.videos?.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {c.videos.map((v, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 13, fontWeight: 700, flex: 1, color: 'var(--text)' }}>{v.name}</span>
              {v.video_url && (
                <VideoButton url={v.video_url} label="▶ Voir"
                  style={{ background: '#4338CA', color: '#fff', borderRadius: 'var(--r)', padding: '4px 12px', fontSize: 12, fontWeight: 700, flexShrink: 0 }} />
              )}
            </div>
          ))}
        </div>
      )}
      {onSaveCircuitLog && (
        <CircuitLogger
          programSessionId={session.id}
          circuitId={c.id}
          log={circuitLogs[`${session.id}::${c.id}`]}
          onSave={onSaveCircuitLog}
          resultMode={c.result_mode || null}
        />
      )}
    </div>
  )

  // À l'ouverture, pré-remplit une ligne de série par série prescrite par le coach
  // (ex. "3 séries" -> 3 lignes Reps/Charge), au lieu d'attendre que le sportif clique "+ Ajouter".
  // Côté coach en direct (isCoachView), le coach saisit les résultats au fur et à mesure de la
  // séance réelle plutôt qu'à l'avance : une seule ligne s'ouvre, il ajoute la 2e/3e série lui-même
  // quand l'athlète l'a faite, peu importe le nombre de séries prescrit dans le programme.
  useEffect(() => {
    if (!isOpen || !onEnsureExerciseSets) return
    exos.forEach(exo => {
      const wanted = isCoachView ? 1 : parseInt(exo.sets, 10)
      if (!wanted || wanted < 1) return
      if (provisionedSetsRef.current.has(exo.id)) return
      provisionedSetsRef.current.add(exo.id)
      if ((exerciseSets[exo.id] || []).length === 0) onEnsureExerciseSets(exo.id, wanted)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen])

  const handleValidateExercise = (exo) => {
    const setsEl = document.getElementById(`log-sets-${exo.id}`)
    const repsEl = document.getElementById(`log-reps-${exo.id}`)
    const kgEl = document.getElementById(`log-kg-${exo.id}`)
    const noteEl = document.getElementById(`log-note-${exo.id}`)
    if (setsEl) onSaveLog(exo.id, exo.name, 'sets_done', setsEl.value)
    if (repsEl) onSaveLog(exo.id, exo.name, 'reps_done', repsEl.value)
    if (kgEl) onSaveLog(exo.id, exo.name, 'kg_done', kgEl.value)
    if (noteEl) onSaveLog(exo.id, exo.name, 'note', noteEl.value)
    ;(exerciseSets[exo.id] || []).forEach(s => {
      const repsSetEl = document.getElementById(`log-set-reps-${s.id}`)
      const kgSetEl = document.getElementById(`log-set-kg-${s.id}`)
      if (repsSetEl) onSaveExerciseSet(exo.id, s.id, 'reps_done', repsSetEl.value)
      if (kgSetEl) onSaveExerciseSet(exo.id, s.id, 'kg_done', kgSetEl.value)
    })
    setSavedIds(p => ({ ...p, [exo.id]: true }))
    setExpandedOverride(p => ({ ...p, [exo.id]: false }))
    onExerciseSaved?.()
  }

  return (
    <div style={{ background: 'var(--bg)', border: `1.5px solid ${isOpen ? (isCompleted ? 'var(--border2)' : 'var(--green)') : 'var(--border)'}`, borderRadius: 'var(--rl)', overflow: 'hidden', opacity: (isCompleted || isSkipped) ? 0.85 : 1 }}>
      <div onClick={onToggle} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px', cursor: 'pointer', borderBottom: isOpen ? '1px solid var(--border)' : 'none' }}>
        <div style={{
          width: 36, height: 36, borderRadius: '50%', flexShrink: 0,
          background: isCompleted ? '#DCFCE7' : isSkipped ? 'var(--bg2)' : (isOpen ? 'var(--green)' : 'var(--green-light)'),
          color: isCompleted ? '#166534' : isSkipped ? 'var(--text3)' : (isOpen ? '#fff' : 'var(--green)'),
          display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, fontWeight: 800
        }}>
          {isCompleted ? '✓' : isSkipped ? <SkipForward size={14} /> : idx + 1}
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--text)', display: 'flex', alignItems: 'center', gap: 6 }}>
            {session.locked && <span style={{ display: 'flex' }}><Lock size={13} /></span>}
            {session.hidden && <span style={{ display: 'flex' }}><EyeSlash size={13} /></span>}
            {session.title || `Séance ${idx + 1}`}
            {(session.materiel || exos.some(e => e.materiel?.trim())) && (
              <button onClick={e => { e.stopPropagation(); setShowMateriel(true) }} title="Matériel à prévoir pour cette séance"
                style={{ background: 'var(--bg2)', border: '1px solid var(--border2)', borderRadius: 20, padding: '2px 8px', display: 'flex', cursor: 'pointer', flexShrink: 0 }}>
                <Backpack size={13} />
              </button>
            )}
            {session.timer_config && (
              <button onClick={e => { e.stopPropagation(); unlockAudio(); unlockSpeech(); onLaunchTimer?.(session.timer_config, session.title || `Séance ${idx + 1}`) }}
                title="Lancer le timer de la séance"
                style={{ background: 'var(--green-light)', color: 'var(--green)', border: '1px solid #B8EAD8', borderRadius: 20, padding: '2px 8px', fontSize: 12, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 3, cursor: 'pointer', flexShrink: 0 }}>
                ▶⏱
              </button>
            )}
            {isGroupLeader && session.source_session_id && (
              <button onClick={e => { e.stopPropagation(); setShowGroupPaces(true) }} title="Voir les allures/distances de tout le groupe pour cette séance"
                style={{ background: 'var(--bg2)', border: '1px solid var(--border2)', borderRadius: 20, padding: '2px 8px', display: 'flex', cursor: 'pointer', flexShrink: 0 }}>
                <UsersThree size={13} />
              </button>
            )}
          </div>
          <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2 }}>
            {session.locked ? 'Réservé aux abonnés' : session.hidden ? 'Pas encore dévoilée' : `${exos.length} exercice${exos.length !== 1 ? 's' : ''}${isCompleted ? ' · déjà validée' : isSkipped ? ' · sautée' : ''}`}
          </div>
        </div>
        {isOpen && !isCompleted && !session.locked && !session.hidden && onValidate && (
          <button onClick={e => { e.stopPropagation(); onValidate() }} disabled={validating}
            style={{ background: 'var(--green)', color: '#fff', border: 'none', borderRadius: 20, padding: '5px 12px', fontSize: 12, fontWeight: 700, cursor: 'pointer', flexShrink: 0 }}>
            ✓ Validé
          </button>
        )}
        <span style={{ fontSize: 18, color: 'var(--text3)' }}>{isOpen ? '▲' : '▼'}</span>
      </div>

      {isOpen && session.locked && (
        <div style={{ padding: '20px 16px', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
          <Lock size={32} />
          <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--text)' }}>Cette séance fait partie d&apos;une formule payante</div>
          <div style={{ fontSize: 12, color: 'var(--text3)', maxWidth: 320 }}>
            L&apos;accès gratuit couvre les premières séances du programme. Passe à une formule payante pour continuer.
          </div>
          {!isCoachView && (
            <button onClick={subscribeFromLock} disabled={subscribingFromLock} style={{
              background: 'var(--green)', color: '#fff', border: 'none', borderRadius: 'var(--rl)',
              padding: '11px 20px', fontSize: 14, fontWeight: 700, cursor: 'pointer', marginTop: 4,
            }}>
              {subscribingFromLock ? '…' : "S'abonner"}
            </button>
          )}
        </div>
      )}

      {isOpen && session.hidden && (
        <div style={{ padding: '20px 16px', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
          <EyeSlash size={32} />
          <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--text)' }}>Séance pas encore dévoilée</div>
          <div style={{ fontSize: 12, color: 'var(--text3)', maxWidth: 320 }}>
            Ton coach garde le contenu secret jusqu&apos;à la séance en groupe — reviens juste après pour voir le détail et enregistrer ton résultat.
          </div>
        </div>
      )}

      {isOpen && !session.locked && !session.hidden && (
        <div style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          {(session.materiel || exos.some(e => e.materiel?.trim())) && (
            <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderLeft: '3px solid var(--bordeaux)', borderRadius: 'var(--r)', padding: '10px 12px' }}>
              <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--bordeaux)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 5 }}><Backpack size={13} /> Matériel à prévoir</div>
              {session.materiel && (
                <div style={{ fontSize: 13, color: 'var(--text)', lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>{session.materiel}</div>
              )}
              {exos.some(e => e.materiel?.trim()) && (
                <ul style={{ margin: session.materiel ? '6px 0 0' : 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 3 }}>
                  {exos.filter(e => e.materiel?.trim()).map(e => (
                    <li key={e.id} style={{ fontSize: 13, color: 'var(--text)' }}>
                      <span style={{ fontWeight: 700 }}>{e.name}</span> — {e.materiel}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
          {sections.echauffement && (
            <div>
              <div style={{ fontSize: 10, fontWeight: 800, color: 'var(--green)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 4 }}><Lightning size={11} /> {sections.echauffement.titre}</div>
              <SectionTexteVideo section={sections.echauffement} mouvements={mouvementsSections} onLireVideo={setVideoSection} />
            </div>
          )}
          {videoSection && <FenetreVideo video={videoSection} onFermer={() => setVideoSection(null)} />}
          {isCoachView && onSaveCoachNote ? (
            <textarea
              key={session.id}
              className="font-editorial"
              placeholder="Note libre pendant la séance…"
              defaultValue={session.coach_notes || ''}
              onBlur={ev => onSaveCoachNote(session.id, ev.target.value)}
              rows={2}
              style={{ width: '100%', boxSizing: 'border-box', background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 'var(--r)', padding: '10px 12px', fontSize: 13, color: 'var(--text2)', fontStyle: 'italic', lineHeight: 1.6, borderLeft: '3px solid var(--green)', outline: 'none', resize: 'vertical', fontFamily: 'inherit' }}
            />
          ) : session.coach_notes && (
            <div className="font-editorial" style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 'var(--r)', padding: '10px 12px', fontSize: 13, color: 'var(--text2)', fontStyle: 'italic', lineHeight: 1.6, borderLeft: '3px solid var(--green)' }}>
              {session.coach_notes}
            </div>
          )}
          {paceRefs.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {paceRefs.map((r, i) => (
                <div key={i} style={{ background: 'var(--green-light)', border: '1px solid #B8EAD8', borderRadius: 20, padding: '5px 10px', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontSize: 11, color: 'var(--green)', fontWeight: 600 }}>{r.raw}</span>
                  <span style={{ fontSize: 13, color: 'var(--green)', fontWeight: 800 }}>
                    {r.pace.lowKmh.toFixed(1) === r.pace.highKmh.toFixed(1)
                      ? `${formatPace(r.pace.lowKmh)}/km`
                      : `${formatPace(r.pace.highKmh)}–${formatPace(r.pace.lowKmh)}/km`}
                  </span>
                </div>
              ))}
            </div>
          )}
          {playerMode && !sessionHasRun ? (
            <>
              {(session.circuits || []).filter(c => circuitSlot(c) === 0).map(c => renderCircuit(c))}
              {/* Aperçu complet avant "Démarrer" (vidéo, cibles séries/reps/poids, consigne du
                  coach) — une fois lancé, l'écran de séance (Seance.js) prend le relais,
                  donc c'est ici et uniquement ici que l'athlète peut voir toute la séance à
                  l'avance. Volontairement en lecture seule (pas de timer récup cliquable, pas de
                  saisie) : la logique interactive reste dans Seance.js. */}
              {exos.map((exo, ei) => (
                <Fragment key={exo.id}>
                  <div style={{
                    background: 'var(--card-white)', border: '1px solid var(--ostryk-border)',
                    borderRadius: 'var(--ostryk-card-radius)', padding: '10px 14px',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span style={{
                        minWidth: 24, height: 24, borderRadius: '50%', background: 'var(--beige)', color: 'var(--bordeaux)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 800, padding: '0 4px', flexShrink: 0,
                      }}>
                        {labels[exo.id] || String.fromCharCode(65 + ei)}
                      </span>
                      <span style={{ fontWeight: 700, fontSize: 14, flex: 1 }}>{exo.name}</span>
                      {exo.video_url && (
                        <VideoButton url={exo.video_url} label="▶"
                          style={{ background: 'var(--green-light)', color: 'var(--green)', border: '1px solid #B8EAD8', borderRadius: 'var(--r)', padding: '4px 10px', fontSize: 13, fontWeight: 700, flexShrink: 0 }} />
                      )}
                    </div>
                    {(exo.sets || exo.reps || exo.kg || exo.rest) && (
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
                        {exo.sets && <Pill value={exo.sets} label="séries" />}
                        {exo.reps && <Pill value={exo.reps} label="reps" />}
                        {exo.kg && <Pill value={`${exo.kg} kg`} />}
                        {exo.rest && <Pill value={exo.rest} label="récup" color="#EFF6FF" textColor="#1D4ED8" />}
                      </div>
                    )}
                    <TempoBadge tempo={getTempoDisplay(exo.set_details)} />
                    {exo.note && <div style={{ fontSize: 12, color: 'var(--text2)', fontStyle: 'italic', marginTop: 8, lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{exo.note}</div>}
                  </div>
                  {(session.circuits || []).filter(c => circuitSlot(c) === ei + 1).map(c => renderCircuit(c))}
                </Fragment>
              ))}
              {onStartPlayer && exos.length > 0 && (
                <button onClick={onStartPlayer} style={{
                  background: 'var(--bordeaux)', color: '#fff', border: 'none', borderRadius: 'var(--ostryk-pill-radius)',
                  padding: '15px', fontSize: 15, fontWeight: 700, cursor: 'pointer', width: '100%', marginTop: 4,
                }}>
                  ▶ Démarrer l&apos;entraînement
                </button>
              )}
            </>
          ) : (
          <>
          {(session.circuits || []).filter(c => circuitSlot(c) === 0).map(c => renderCircuit(c))}
          {exos.map((exo, ei) => {
            const isCollapsed = savedIds[exo.id] && !expandedOverride[exo.id]
            const log = exerciseLogs[exo.id] || {}
            const summaryParts = [log.sets_done, log.reps_done].filter(Boolean).join('×') + (log.kg_done ? ` @ ${log.kg_done}kg` : '')
            return (
            <Fragment key={exo.id}>
            <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 'var(--r)', padding: '12px 14px' }}>
              <div onClick={isCollapsed ? () => setExpandedOverride(p => ({ ...p, [exo.id]: true })) : undefined}
                style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: (exo.note || (!isCollapsed && (exo.sets || exo.reps || exo.kg || getTempoDisplay(exo.set_details)))) ? 8 : 0, cursor: isCollapsed ? 'pointer' : 'default' }}>
                <div style={{
                  minWidth: 24, height: 24, borderRadius: '50%',
                  background: isCollapsed ? '#DCFCE7' : 'var(--green-light)', color: isCollapsed ? '#166534' : 'var(--green)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 800, padding: '0 4px', flexShrink: 0,
                }}>
                  {isCollapsed ? '✓' : (labels[exo.id] || String.fromCharCode(65 + ei))}
                </div>
                <span style={{ fontWeight: 700, fontSize: 15, flex: 1 }}>{exo.name}</span>
                {isCollapsed ? (
                  <span style={{ fontSize: 13, color: 'var(--text3)', fontWeight: 600 }}>{summaryParts || 'Enregistré'}</span>
                ) : (
                  <>
                    <TipsButton />
                    <ExerciseHistoryButton athleteId={athleteId} exerciseName={exo.name} />
                    {exo.video_url && (
                      <VideoButton url={exo.video_url} label="▶"
                        style={{ background: 'var(--green-light)', color: 'var(--green)', border: '1px solid #B8EAD8', borderRadius: 'var(--r)', padding: '4px 10px', fontSize: 13, fontWeight: 700, flexShrink: 0 }} />
                    )}
                    <button onClick={() => { unlockAudio(); unlockSpeech(); exo.timer_config ? onLaunchTimer?.(exo.timer_config, `Timer ${labels[exo.id] || ''}`) : setShowTimer({}) }}
                      style={{ background: 'var(--green-light)', color: 'var(--green)', border: '1px solid #B8EAD8', borderRadius: 'var(--r)', padding: '4px 10px', fontSize: 13, fontWeight: 700, flexShrink: 0, cursor: 'pointer' }}>
                      {exo.timer_config ? '▶⏱' : '⏱'}
                    </button>
                  </>
                )}
              </div>

              {/* Consigne du coach : reste visible même une fois la série "collapsée" (loggée) —
                  contrairement au détail sets/reps/pace ci-dessous, c'est une note permanente que
                  l'athlète doit pouvoir relire pendant tout l'exercice (ex: consigne de respiration
                  sur un run), pas un détail de saisie qui ne sert plus une fois enregistré. */}
              {!isCollapsed && <TempoBadge tempo={getTempoDisplay(exo.set_details)} />}
              {exo.note && <div style={{ fontSize: 12, color: 'var(--text2)', fontStyle: 'italic', marginTop: 4, lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{exo.note}</div>}

              {!isCollapsed && <>
              {(() => {
                const focusValue = focusOverrides[exo.id] !== undefined ? focusOverrides[exo.id] : exo.focus_muscles
                const manualZones = focusValue ? focusValue.split(',').filter(Boolean) : []
                const isAuto = manualZones.length === 0
                const movementKey = exo.name?.trim().toLowerCase()
                const movementFocus = focusGroupOverrides[movementKey] !== undefined ? focusGroupOverrides[movementKey] : exo.movement_focus_groups
                const autoZones = movementFocus ? movementFocus.split(',').filter(Boolean) : parseMusclesFromText(exo.movement_muscles || '')
                const zones = isAuto ? autoZones : manualZones
                if (zones.length === 0 && !isCoach) return null
                return (
                  <div style={{ marginBottom: 8 }}>
                    {zones.length > 0 ? (
                      <button onClick={() => setViewingFocus(zones)} style={{
                        background: '#FEF2F2', color: '#B91C1C', border: '1px solid #FCA5A5', borderRadius: 20,
                        padding: '5px 12px', fontSize: 12, fontWeight: 700, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6,
                      }}>
                        <Target size={12} /> FOCUS · {MUSCLE_GROUPS.filter(z => zones.includes(z.key)).map(z => z.label).join(', ')}
                        {isAuto && <span style={{ fontWeight: 500, opacity: 0.75 }}>(auto)</span>}
                        {isCoach && (
                          <span onClick={e => { e.stopPropagation(); setFocusPicker(exo.id) }} style={{ marginLeft: 2, display: 'inline-flex' }}><PencilSimple size={11} /></span>
                        )}
                      </button>
                    ) : (
                      <button onClick={() => setFocusPicker(exo.id)} style={{
                        background: 'none', border: '1px dashed var(--border2)', borderRadius: 20,
                        padding: '5px 12px', fontSize: 12, fontWeight: 700, cursor: 'pointer', color: 'var(--text3)',
                      }}>
                        + FOCUS
                      </button>
                    )}
                  </div>
                )
              })()}

              {(() => {
                const flow = getSupersetFlow(exos, ei, labels)
                return flow ? (
                  <div style={{ fontSize: 14, lineHeight: 1.4, color: '#6366f1', background: '#EEF2FF', border: '1px solid #C7D2FE', borderRadius: 10, padding: '10px 14px', marginBottom: 10, fontWeight: 700, letterSpacing: '0.2px' }}>
                    {flow}
                  </div>
                ) : null
              })()}
              {isRunMovement(exo.name) && (exo.pace_base || exo.pct_low != null || exo.pct_high != null) && (() => {
                const is3030 = is3030Movement(exo.name)
                const pace1 = is3030 ? computeDistanceForBasePct(exo.pace_base, exo.pct_low, raceKnown) : computePaceForBasePct(exo.pace_base, exo.pct_low, raceKnown)
                const pace2 = is3030 ? computeDistanceForBasePct(exo.pace_base, exo.pct_high, raceKnown) : computePaceForBasePct(exo.pace_base, exo.pct_high, raceKnown)
                const baseLabel = PACE_BASES.find(b => b.key === exo.pace_base)?.label || exo.pace_base
                const samePace = pace1 != null && pace2 != null && (is3030 ? pace1 === pace2 : pace1.toFixed(1) === pace2.toFixed(1))
                return (
                  <div style={{ background: 'var(--green-light)', border: '1px solid #B8EAD8', borderRadius: 'var(--r)', padding: '8px 10px', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--green)' }}>
                      {baseLabel} {exo.pct_low}{exo.pct_high != null && exo.pct_high !== exo.pct_low ? `-${exo.pct_high}` : ''}%
                    </span>
                    {pace1 == null && pace2 == null ? (
                      <span style={{ fontSize: 11, color: 'var(--text3)', fontStyle: 'italic' }}>Tests VMA/Seuil requis</span>
                    ) : is3030 ? (
                      <>
                        {pace1 != null && (
                          <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--green)' }}>Distance 1 (30s) : {formatDistance(pace1)}</span>
                        )}
                        {!samePace && pace2 != null && (
                          <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--green)' }}>Distance 2 (30s) : {formatDistance(pace2)}</span>
                        )}
                      </>
                    ) : (
                      <>
                        {pace1 != null && (
                          <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--green)' }}>Allure 1 : {formatPace(pace1)}/km</span>
                        )}
                        {!samePace && pace2 != null && (
                          <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--green)' }}>Allure 2 : {formatPace(pace2)}/km</span>
                        )}
                        <button onClick={() => setCalcModal({ pace1, pace2: samePace ? null : pace2 })}
                          title="Calculer la distance parcourue pour un temps donné"
                          style={{ background: 'var(--bg)', border: '1px solid #B8EAD8', borderRadius: 20, padding: '3px 9px', fontSize: 12, fontWeight: 700, color: 'var(--green)', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                          <Calculator size={12} /> Distance
                        </button>
                      </>
                    )}
                  </div>
                )
              })()}
              {hasCardioSteps(exo.cardio_structure) && (
                <button
                  onClick={() => {
                    const bytes = buildCardioFitFile({ exerciseName: exo.name, structure: exo.cardio_structure, known: raceKnown })
                    if (bytes) downloadFitFile(bytes, exo.name || 'seance')
                  }}
                  title="Télécharger cet exercice en .FIT pour ta montre (Garmin et compatibles)"
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 6, background: 'var(--bg)', border: '1px solid #B8EAD8',
                    borderRadius: 20, padding: '4px 10px', fontSize: 12, fontWeight: 700, color: 'var(--green)', cursor: 'pointer', marginBottom: 8,
                  }}
                >
                  <DownloadSimple size={13} /> Télécharger pour ma montre
                </button>
              )}
              {isRunMovement(exo.name) ? (
                exo.sets && (
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: exo.note ? 6 : 0 }}>
                    <Pill value={exo.sets} label="action" />
                    {exo.rest && <Pill value={exo.rest} label="repos" color="#EFF6FF" textColor="#1D4ED8" onClick={() => { unlockAudio(); unlockSpeech(); setShowTimer({ seconds: parseRestSeconds(exo.rest), label: 'RÉCUP' }) }} />}
                  </div>
                )
              ) : (exo.sets || exo.reps || exo.kg || exo.rest) && (
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: exo.note ? 6 : 0 }}>
                  {exo.sets && <Pill value={exo.sets} label="séries" />}
                  {exo.reps && <Pill value={exo.reps} label="reps" />}
                  {exo.kg && <Pill value={`${exo.kg} kg`} />}
                  {exo.rest && <Pill value={exo.rest} label="récup" color="#EFF6FF" textColor="#1D4ED8" onClick={() => { unlockAudio(); unlockSpeech(); setShowTimer({ seconds: parseRestSeconds(exo.rest), label: 'RÉCUP' }) }} />}
                </div>
              )}

              {/* Log client */}
              {onSaveLog && isRunMovement(exo.name) && (
                <RunResultLogger key={exo.id} exo={exo} exerciseLogs={exerciseLogs} onSaveLog={onSaveLog} onSyncRaceMetric={onSyncRaceMetric} targetPaces={targetPaces} onSaveTargetPace={onSaveTargetPace} />
              )}
              {onSaveLog && !isRunMovement(exo.name) && (
                <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px dashed var(--border)', display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--green)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Ma séance</div>
                  {onAddExerciseSet && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {(exerciseSets[exo.id] || []).map((s, sIdx) => {
                        const prev = sIdx > 0 ? (exerciseSets[exo.id] || [])[sIdx - 1] : null
                        const copyPrevious = () => {
                          if (!prev) return
                          const repsEl = document.getElementById(`log-set-reps-${s.id}`)
                          const kgEl = document.getElementById(`log-set-kg-${s.id}`)
                          const prevReps = document.getElementById(`log-set-reps-${prev.id}`)?.value ?? (prev.reps_done || '')
                          const prevKg = document.getElementById(`log-set-kg-${prev.id}`)?.value ?? (prev.kg_done ?? '')
                          if (repsEl) repsEl.value = prevReps
                          if (kgEl) kgEl.value = prevKg
                          onSaveExerciseSet(exo.id, s.id, 'reps_done', prevReps)
                          onSaveExerciseSet(exo.id, s.id, 'kg_done', prevKg)
                          setSavedIds(p => ({ ...p, [exo.id]: false }))
                        }
                        return (
                        <div key={s.id} style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
                          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text3)', width: 56, flexShrink: 0, paddingBottom: 8 }}>
                            Série {s.set_index}
                          </div>
                          <div style={{ flex: 1 }}>
                            <div style={{ fontSize: 10, color: 'var(--text3)', fontWeight: 600, marginBottom: 3 }}>Reps</div>
                            <input id={`log-set-reps-${s.id}`} type="text" placeholder={exo.reps || ''} defaultValue={s.reps_done || ''}
                              onChange={() => setSavedIds(p => ({ ...p, [exo.id]: false }))}
                              onBlur={e => onSaveExerciseSet(exo.id, s.id, 'reps_done', e.target.value)}
                              style={logInputStyle} />
                          </div>
                          <div style={{ flex: 1 }}>
                            <div style={{ fontSize: 10, color: 'var(--text3)', fontWeight: 600, marginBottom: 3 }}>Charge (kg)</div>
                            <input id={`log-set-kg-${s.id}`} type="text" placeholder={exo.kg ? `${exo.kg} kg` : ''} defaultValue={s.kg_done ?? ''}
                              onChange={() => setSavedIds(p => ({ ...p, [exo.id]: false }))}
                              onBlur={e => onSaveExerciseSet(exo.id, s.id, 'kg_done', e.target.value)}
                              style={logInputStyle} />
                          </div>
                          {prev && (
                            <button type="button" onClick={copyPrevious} title="Copier la série précédente"
                              style={{ background: 'var(--bg2)', border: '1px solid var(--border2)', borderRadius: 'var(--r)', fontSize: 13, color: 'var(--text3)', cursor: 'pointer', padding: '8px 9px', flexShrink: 0 }}>⧉</button>
                          )}
                          <button onClick={() => onDeleteExerciseSet(exo.id, s.id)}
                            style={{ background: 'none', border: 'none', fontSize: 16, color: 'var(--text3)', cursor: 'pointer', padding: '0 2px 8px' }}>×</button>
                        </div>
                        )
                      })}
                      <button onClick={() => onAddExerciseSet(exo.id)}
                        style={{ alignSelf: 'flex-start', background: 'none', border: '1px dashed var(--border2)', borderRadius: 'var(--r)', padding: '6px 12px', fontSize: 12, fontWeight: 700, color: 'var(--text3)', cursor: 'pointer' }}>
                        + Ajouter une série
                      </button>
                    </div>
                  )}
                  {(() => {
                    const match = trackedMovements.find(m =>
                      m.name.trim().toLowerCase() === exo.name.trim().toLowerCase() && m.unit && m.unit !== 'kg'
                    )
                    if (!match || !onSaveMetricResult) return null
                    return <MetricResultField movement={match} onSave={val => onSaveMetricResult(match, val)} />
                  })()}
                  <div>
                    <div style={{ fontSize: 10, color: 'var(--text3)', fontWeight: 600, marginBottom: 3 }}>Note</div>
                    <textarea id={`log-note-${exo.id}`} placeholder="Comment c'était ?"
                      defaultValue={exerciseLogs[exo.id]?.note || ''}
                      onChange={() => setSavedIds(p => ({ ...p, [exo.id]: false }))}
                      onBlur={e => onSaveLog(exo.id, exo.name, 'note', e.target.value)}
                      rows={2}
                      style={{ width: '100%', padding: '7px 9px', border: '1px solid var(--border2)', borderRadius: 'var(--r)', fontSize: 13, outline: 'none', background: 'var(--bg)', color: 'var(--text)', resize: 'none', boxSizing: 'border-box', fontFamily: 'inherit' }}
                    />
                  </div>
                  <button onClick={() => handleValidateExercise(exo)} style={{
                    background: savedIds[exo.id] ? '#DCFCE7' : 'var(--green)',
                    color: savedIds[exo.id] ? '#166534' : '#fff',
                    border: 'none', borderRadius: 20, padding: '9px', fontSize: 13, fontWeight: 700, cursor: 'pointer', width: '100%',
                    transition: 'all .15s',
                  }}>
                    {savedIds[exo.id] ? '✓ Enregistré' : '✓ Valider cet exercice'}
                  </button>
                </div>
              )}
              </>}
            </div>
            {(session.circuits || []).filter(c => circuitSlot(c) === ei + 1).map(c => renderCircuit(c))}
            </Fragment>
            )
          })}
          </>
          )}

          {sections.retourAuCalme && (
            <div>
              <div style={{ fontSize: 10, fontWeight: 800, color: 'var(--green)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 8 }}>{sections.retourAuCalme.titre}</div>
              <SectionTexteVideo section={sections.retourAuCalme} mouvements={mouvementsSections} onLireVideo={setVideoSection} />
            </div>
          )}

          {isFreeSession && onUpdateFreeSessionDate && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text3)', flexShrink: 0, display: 'inline-flex', alignItems: 'center', gap: 4 }}><CalendarBlank size={12} /> Date</span>
              <input type="date" value={session.date || ''} onChange={e => e.target.value && onUpdateFreeSessionDate(e.target.value)}
                style={{ flex: 1, boxSizing: 'border-box', padding: '7px 9px', border: '1px solid var(--border2)', borderRadius: 'var(--r)', fontSize: 13, fontWeight: 700, outline: 'none', background: 'var(--bg)', color: 'var(--text)' }} />
            </div>
          )}

          {isFreeSession && (
            <FreeExerciseAdder sessionId={session.id} exos={exos} onAdd={onAddExercise} onToggleSuperset={onToggleSuperset} activityMode={session.activity_mode} />
          )}

          {isFreeSession && exos.length > 0 && onDuplicateFreeSession && (
            <button onClick={onDuplicateFreeSession} style={{
              background: 'var(--bg2)', color: 'var(--text2)', border: '1px solid var(--border2)', borderRadius: 'var(--rl)',
              padding: '12px', fontSize: 13, fontWeight: 700, cursor: 'pointer', width: '100%',
            }}>
              ⧉ Dupliquer cette séance
            </button>
          )}

          {isSkipped ? (
            <>
              <div style={{ textAlign: 'center', padding: '10px 0', color: 'var(--text3)', fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5 }}>
                <SkipForward size={13} /> Séance sautée
              </div>
              {onUnvalidate && (
                <button onClick={onUnvalidate} disabled={validating}
                  style={{ background: 'var(--bg2)', color: 'var(--text2)', border: '1px solid var(--border2)', borderRadius: 'var(--rl)', padding: '12px', fontSize: 13, fontWeight: 700, cursor: 'pointer', width: '100%' }}>
                  {validating ? '…' : '↩ Annuler le saut'}
                </button>
              )}
            </>
          ) : (
            <>
              {onValidate && (
                <button
                  onClick={() => onValidate({})}
                  disabled={validating}
                  style={{
                    marginTop: 8, background: 'var(--green)', color: '#fff', border: 'none', borderRadius: 'var(--rl)',
                    padding: '15px', fontSize: 15, fontWeight: 700, cursor: validating ? 'default' : 'pointer', width: '100%',
                  }}
                >
                  {isRecurring
                    ? (validating ? 'Enregistrement…' : '✓ Valider la séance')
                    : (validating ? (isCompleted ? 'Mise à jour…' : 'Validation…') : (isCompleted ? '✓ Mettre à jour' : '✓ Valider la séance'))}
                </button>
              )}
              {isCompleted && onUnvalidate && (
                <button onClick={onUnvalidate} disabled={validating}
                  style={{ background: 'var(--bg2)', color: '#DC2626', border: '1px solid #FECACA', borderRadius: 'var(--rl)', padding: '12px', fontSize: 13, fontWeight: 700, cursor: 'pointer', width: '100%', marginTop: 4 }}>
                  {validating ? '…' : '↩ Annuler la validation'}
                </button>
              )}
              {(onSkip || onPostpone) && !isCompleted && (
                <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                  {onPostpone && (
                    <button onClick={() => setShowPostpone(true)} disabled={validating}
                      style={{ flex: 1, background: 'var(--bg2)', color: 'var(--text2)', border: '1px solid var(--border2)', borderRadius: 'var(--rl)', padding: '11px', fontSize: 13, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5 }}>
                      <SkipForward size={13} /> Reporter
                    </button>
                  )}
                  {onSkip && (
                    <button onClick={() => { if (confirm('Sauter cette séance sans la valider ? Tu passeras directement à la suivante.')) onSkip() }} disabled={validating}
                      style={{ flex: 1, background: 'var(--bg2)', color: 'var(--text2)', border: '1px solid var(--border2)', borderRadius: 'var(--rl)', padding: '11px', fontSize: 13, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5 }}>
                      <Prohibit size={13} /> Sauter
                    </button>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      )}

      {showPostpone && (
        <div onClick={() => setShowPostpone(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1200, padding: 16 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: 'var(--bg)', borderRadius: 'var(--rl)', padding: 20, maxWidth: 320, width: '100%', boxShadow: '0 20px 60px rgba(0,0,0,0.4)' }}>
            <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 4 }}>⏭ Reporter la séance</div>
            <div style={{ fontSize: 13, color: 'var(--text3)', marginBottom: 14 }}>De combien de séances veux-tu la décaler ?</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {[1, 2, 3].map(n => (
                <button key={n} onClick={() => { onPostpone(n); setShowPostpone(false) }}
                  style={{ background: 'var(--green-light)', color: 'var(--green)', border: '1px solid #B8EAD8', borderRadius: 'var(--r)', padding: '11px', fontSize: 14, fontWeight: 700, cursor: 'pointer', width: '100%' }}>
                  + {n} séance{n > 1 ? 's' : ''}
                </button>
              ))}
              <button onClick={() => setShowPostpone(false)} style={{ background: 'none', border: 'none', color: 'var(--text3)', fontSize: 13, fontWeight: 600, cursor: 'pointer', padding: '6px 0' }}>
                Annuler
              </button>
            </div>
          </div>
        </div>
      )}

      {focusPicker && (
        <FocusPicker
          initial={(() => {
            const exo = session.exercises.find(e => e.id === focusPicker)
            if (!exo) return []
            const manualVal = focusOverrides[focusPicker] !== undefined ? focusOverrides[focusPicker] : exo.focus_muscles
            if (manualVal) return manualVal.split(',').filter(Boolean)
            const movementKey = exo.name?.trim().toLowerCase()
            const movementFocus = focusGroupOverrides[movementKey] !== undefined ? focusGroupOverrides[movementKey] : exo.movement_focus_groups
            if (movementFocus) return movementFocus.split(',').filter(Boolean)
            return parseMusclesFromText(exo.movement_muscles || '')
          })()}
          onCancel={() => setFocusPicker(null)}
          onSave={zones => saveFocusMuscles(focusPicker, session.exercises.find(e => e.id === focusPicker)?.name, zones)}
        />
      )}

      {viewingFocus && (
        <FocusBodyDiagram groups={viewingFocus} onClose={() => setViewingFocus(null)} />
      )}

      {showTimer && <TimerModal onClose={() => setShowTimer(null)} presetSeconds={showTimer.seconds} presetLabel={showTimer.label} />}
      {calcModal && <PaceDistanceCalc pace1={calcModal.pace1} pace2={calcModal.pace2} onClose={() => setCalcModal(null)} />}
      {showMateriel && (
        <div onClick={() => setShowMateriel(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1300, padding: 16 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: 'var(--bg)', borderRadius: 'var(--rl)', padding: 20, maxWidth: 380, width: '100%', boxShadow: '0 20px 60px rgba(0,0,0,0.4)' }}>
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 8 }}><Backpack size={32} /></div>
            <div style={{ fontFamily: 'var(--font-title)', color: 'var(--title)', fontSize: 17, fontWeight: 700, marginBottom: 12, textAlign: 'center' }}>
              Matériel à prévoir
            </div>
            {session.materiel && (
              <div style={{ fontSize: 14, color: 'var(--text)', lineHeight: 1.7, whiteSpace: 'pre-wrap', marginBottom: exos.some(e => e.materiel?.trim()) ? 8 : 16 }}>{session.materiel}</div>
            )}
            {exos.some(e => e.materiel?.trim()) && (
              <ul style={{ margin: '0 0 16px', padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 4 }}>
                {exos.filter(e => e.materiel?.trim()).map(e => (
                  <li key={e.id} style={{ fontSize: 13, color: 'var(--text)' }}>
                    <span style={{ fontWeight: 700 }}>{e.name}</span> — {e.materiel}
                  </li>
                ))}
              </ul>
            )}
            <button onClick={() => setShowMateriel(false)} style={{ background: 'var(--green)', color: '#fff', border: 'none', borderRadius: 'var(--r)', padding: '11px', fontSize: 14, fontWeight: 700, cursor: 'pointer', width: '100%' }}>
              Compris
            </button>
          </div>
        </div>
      )}
      {showGroupPaces && (
        <GroupPacesModal token={token} sessionId={session.id} onClose={() => setShowGroupPaces(false)} />
      )}
    </div>
  )
}

function GroupPacesModal({ token, sessionId, onClose }) {
  const [state, setState] = useState({ loading: true, members: [] })

  useEffect(() => {
    fetch(`/api/athlete-view/${token}/group-session-paces?sessionId=${sessionId}`)
      .then(r => r.json())
      .then(data => setState({ loading: false, members: data.members || [] }))
      .catch(() => setState({ loading: false, members: [] }))
  }, [token, sessionId])

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1300, padding: 16 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: 'var(--bg)', borderRadius: 'var(--rl)', padding: 20, maxWidth: 420, width: '100%', maxHeight: '80svh', overflowY: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.4)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
          <div style={{ flex: 1, fontFamily: 'var(--font-title)', color: 'var(--title)', fontSize: 17, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}><UsersThree size={16} /> Allures du groupe</div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 20, color: 'var(--text3)', cursor: 'pointer', padding: '2px 4px', lineHeight: 1 }}>×</button>
        </div>
        {state.loading ? (
          <div style={{ textAlign: 'center', color: 'var(--text3)', padding: '20px 0' }}>Chargement…</div>
        ) : state.members.length === 0 ? (
          <div style={{ textAlign: 'center', color: 'var(--text3)', fontSize: 13, padding: '20px 0' }}>
            Aucune donnée — cette séance ne vient pas d&apos;un template partagé au groupe, ou personne d&apos;autre n&apos;a encore de test VMA/Seuil enregistré.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {state.members.map(m => (
              <div key={m.athleteId} style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 'var(--r)', padding: '10px 12px' }}>
                <div style={{ fontWeight: 700, fontSize: 14, marginBottom: m.exercises.length ? 6 : 0 }}>{m.athleteName}</div>
                {m.exercises.length === 0 ? (
                  <div style={{ fontSize: 12, color: 'var(--text3)', fontStyle: 'italic' }}>Tests VMA/Seuil requis</div>
                ) : m.exercises.map((ex, i) => (
                  <div key={i} style={{ fontSize: 12, color: 'var(--text2)', marginBottom: i < m.exercises.length - 1 ? 4 : 0 }}>
                    <span style={{ fontWeight: 600 }}>{ex.name}</span> — {ex.label1} : <strong style={{ color: 'var(--green)' }}>{ex.val1 || '—'}</strong>
                    {ex.val2 && ex.val2 !== ex.val1 && <> · {ex.label2} : <strong style={{ color: 'var(--green)' }}>{ex.val2}</strong></>}
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function FocusPicker({ initial, onCancel, onSave }) {
  const [selected, setSelected] = useState(initial)

  const toggle = (key) => setSelected(prev => prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key])

  return (
    <div onClick={onCancel} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1200, padding: 16 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: 'var(--bg)', borderRadius: 20, padding: 20, maxWidth: 380, width: '100%', boxShadow: '0 20px 60px rgba(0,0,0,0.4)', maxHeight: '90svh', overflowY: 'auto' }}>
        <div style={{ fontFamily: 'var(--font-title)', color: 'var(--title)', fontWeight: 700, fontSize: 17, marginBottom: 4, display: 'flex', alignItems: 'center', gap: 8 }}><Target size={16} /> Focus</div>
        <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 14 }}>Choisis le ou les muscles à ressentir</div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
          {MUSCLE_GROUPS.map(g => (
            <button key={g.key} onClick={() => toggle(g.key)} style={{
              background: selected.includes(g.key) ? '#FEF2F2' : 'var(--bg2)',
              border: `1px solid ${selected.includes(g.key) ? '#FCA5A5' : 'var(--border2)'}`,
              color: selected.includes(g.key) ? '#B91C1C' : 'var(--text2)',
              borderRadius: 20, padding: '7px 12px', fontSize: 12, fontWeight: 700, cursor: 'pointer',
            }}>
              {g.label}
            </button>
          ))}
        </div>

        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={onCancel} style={{ flex: 1, background: 'var(--bg2)', color: 'var(--text3)', border: '1px solid var(--border2)', borderRadius: 'var(--r)', padding: 11, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Annuler</button>
          <button onClick={() => onSave(selected)} style={{ flex: 2, background: 'var(--green)', color: '#fff', border: 'none', borderRadius: 'var(--r)', padding: 11, fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>Enregistrer</button>
        </div>
      </div>
    </div>
  )
}

// Calculateur "distance parcourue" : temps + une ou deux allures → distance(s) correspondante(s).
// Les allures 1/2 prescrites servent de valeurs par défaut, éditables (texte libre "M'SS").
function PaceDistanceCalc({ pace1, pace2, onClose }) {
  const [h, setH] = useState('')
  const [m, setM] = useState('')
  const [s, setS] = useState('')
  const [paceStr1, setPaceStr1] = useState(pace1 != null ? formatPace(pace1) : '')
  const [paceStr2, setPaceStr2] = useState(pace2 != null ? formatPace(pace2) : '')

  const totalSec = (parseInt(h) || 0) * 3600 + (parseInt(m) || 0) * 60 + (parseInt(s) || 0)

  const distanceFor = (paceStr) => {
    const secPerKm = parsePaceInput(paceStr)
    if (!secPerKm || !totalSec) return null
    return totalSec / secPerKm
  }

  const dist1 = distanceFor(paceStr1)
  const dist2 = paceStr2.trim() ? distanceFor(paceStr2) : null

  const fieldStyle = { width: '100%', boxSizing: 'border-box', textAlign: 'center', padding: '8px 4px', border: '1px solid var(--border2)', borderRadius: 'var(--r)', fontSize: 15, fontWeight: 700, outline: 'none', background: 'var(--bg2)', color: 'var(--text)' }

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1200, padding: 16 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: 'var(--bg)', borderRadius: 20, padding: 20, maxWidth: 340, width: '100%', boxShadow: '0 20px 60px rgba(0,0,0,0.4)' }}>
        <div style={{ fontFamily: 'var(--font-title)', color: 'var(--title)', fontWeight: 700, fontSize: 17, marginBottom: 4, display: 'flex', alignItems: 'center', gap: 8 }}><Calculator size={16} /> Calculateur distance</div>
        <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 16 }}>Temps à courir + allure → distance à parcourir.</div>

        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: 6 }}>Temps à courir</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6, marginBottom: 16 }}>
          <div>
            <input type="number" min="0" placeholder="h" value={h} onChange={e => setH(e.target.value)} style={fieldStyle} />
            <div style={{ fontSize: 9, color: 'var(--text3)', textAlign: 'center', marginTop: 2 }}>h</div>
          </div>
          <div>
            <input type="number" min="0" max="59" placeholder="min" value={m} onChange={e => setM(e.target.value)} style={fieldStyle} />
            <div style={{ fontSize: 9, color: 'var(--text3)', textAlign: 'center', marginTop: 2 }}>min</div>
          </div>
          <div>
            <input type="number" min="0" max="59" placeholder="s" value={s} onChange={e => setS(e.target.value)} style={fieldStyle} />
            <div style={{ fontSize: 9, color: 'var(--text3)', textAlign: 'center', marginTop: 2 }}>s</div>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 16 }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: 6 }}>Allure 1 (min/km)</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <input placeholder="ex: 4'30" value={paceStr1} onChange={e => setPaceStr1(e.target.value)} style={{ ...fieldStyle, flex: 1 }} />
              <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--green)', whiteSpace: 'nowrap' }}>
                {dist1 != null ? `${dist1.toFixed(2)} km` : '—'}
              </div>
            </div>
          </div>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: 6 }}>Allure 2 (min/km, optionnel)</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <input placeholder="ex: 4'45" value={paceStr2} onChange={e => setPaceStr2(e.target.value)} style={{ ...fieldStyle, flex: 1 }} />
              <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--green)', whiteSpace: 'nowrap' }}>
                {dist2 != null ? `${dist2.toFixed(2)} km` : '—'}
              </div>
            </div>
          </div>
        </div>

        <button onClick={onClose} style={{ background: 'var(--green)', color: '#fff', border: 'none', borderRadius: 'var(--r)', padding: 11, fontSize: 14, fontWeight: 700, cursor: 'pointer', width: '100%' }}>
          Fermer
        </button>
      </div>
    </div>
  )
}

function Pill({ value, label, color, textColor, onClick }) {
  return (
    <div onClick={onClick} style={{
      background: color || 'var(--green-light)', color: textColor || 'var(--green)', borderRadius: 20,
      padding: '3px 10px', fontSize: 13, fontWeight: 700, cursor: onClick ? 'pointer' : 'default',
    }}>
      {onClick ? '⏱ ' : ''}{value}{label ? ` ${label}` : ''}
    </div>
  )
}

function TipsButton() {
  const [open, setOpen] = useState(false)
  const [tips, setTips] = useState(null)
  const [selected, setSelected] = useState(null)

  const openModal = async (e) => {
    e.stopPropagation()
    setOpen(true)
    setSelected(null)
    const [{ data }, { data: hidden }] = await Promise.all([
      supabase.from('tips').select('*').order('order_index'),
      supabase.from('coach_hidden_content').select('content_id').eq('content_type', 'tip'),
    ])
    const hiddenIds = new Set((hidden || []).map(h => h.content_id))
    setTips((data || []).filter(t => !hiddenIds.has(t.id)))
  }

  return (
    <>
      <button onClick={openModal} style={{ background: 'var(--bg2)', border: '1px solid var(--border2)', color: 'var(--text2)', borderRadius: 'var(--r)', padding: '4px 10px', display: 'flex', cursor: 'pointer', flexShrink: 0 }}>
        <Lightbulb size={13} />
      </button>
      {open && (
        <div onClick={() => setOpen(false)} style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,.4)', zIndex: 200,
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16
        }}>
          <div onClick={e => e.stopPropagation()} style={{
            background: 'var(--bg)', borderRadius: 'var(--rl)', width: '100%', maxWidth: 480,
            maxHeight: '75vh', overflowY: 'auto', padding: 18
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
              {selected && (
                <button onClick={() => setSelected(null)} style={{ background: 'none', border: 'none', fontSize: 18, cursor: 'pointer', color: 'var(--text3)', padding: 0 }}>←</button>
              )}
              <div style={{ fontFamily: 'var(--font-title)', color: 'var(--title)', fontWeight: 700, fontSize: 18, flex: 1, display: 'flex', alignItems: 'center', gap: 8 }}><Lightbulb size={16} /> {selected ? selected.title : 'Tips'}</div>
              <button onClick={() => setOpen(false)} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: 'var(--text3)', padding: 0 }}>×</button>
            </div>

            {!tips ? (
              <div style={{ color: 'var(--text3)', fontSize: 13 }}>Chargement…</div>
            ) : selected ? (
              <div>
                {(selected.content || !selected.diagram) && (
                  <div className="font-editorial" style={{ fontSize: 14, color: 'var(--text2)', lineHeight: 1.6, whiteSpace: 'pre-wrap', marginBottom: selected.diagram ? 14 : 0 }}>
                    {selected.content || 'Pas encore d\'explication pour ce tip.'}
                  </div>
                )}
                {selected.diagram === 'muscle_anatomy' && <MuscleAnatomyDiagram />}
              </div>
            ) : tips.length === 0 ? (
              <div style={{ color: 'var(--text3)', fontSize: 13 }}>Aucun tip pour le moment.</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {tips.map(t => (
                  <button key={t.id} onClick={() => setSelected(t)} style={{
                    display: 'flex', alignItems: 'center', gap: 8, width: '100%', textAlign: 'left',
                    background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 'var(--r)',
                    padding: '12px 14px', fontSize: 14, fontWeight: 700, color: 'var(--text)', cursor: 'pointer'
                  }}>
                    <span style={{ flex: 1 }}>{t.title}</span>
                    <span style={{ color: 'var(--text3)' }}>›</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  )
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

function VideoButton({ url, label, style }) {
  const [open, setOpen] = useState(false)
  const videoId = extractYouTubeId(url)

  if (!videoId) {
    return (
      <a href={url} target="_blank" rel="noreferrer" style={{ textDecoration: 'none', ...style }}>{label}</a>
    )
  }

  const isVertical = url.includes('/shorts/')

  return (
    <>
      <button onClick={e => { e.stopPropagation(); setOpen(true) }} style={{ border: 'none', cursor: 'pointer', ...style }}>
        {label}
      </button>
      {open && (
        <div onClick={() => setOpen(false)} style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,.75)', zIndex: 300,
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
        }}>
          <div onClick={e => e.stopPropagation()} style={{
            width: '100%', maxWidth: isVertical ? 340 : 560, background: '#000',
            borderRadius: 'var(--rl)', overflow: 'hidden', position: 'relative',
          }}>
            <button onClick={() => setOpen(false)} style={{
              position: 'absolute', top: 8, right: 8, zIndex: 2, background: 'rgba(0,0,0,.6)',
              color: '#fff', border: 'none', borderRadius: '50%', width: 32, height: 32,
              fontSize: 18, cursor: 'pointer', lineHeight: 1,
            }}>×</button>
            <div style={{ position: 'relative', paddingTop: isVertical ? '177.78%' : '56.25%' }}>
              <iframe
                src={`https://www.youtube.com/embed/${videoId}?autoplay=1`}
                style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', border: 'none' }}
                allow="autoplay; encrypted-media; picture-in-picture"
                allowFullScreen
              />
            </div>
          </div>
        </div>
      )}
    </>
  )
}

function MetricResultField({ movement, onSave }) {
  const isTime = movement.unit === 'time'
  const cfg = unitOf(movement)
  const [h, setH] = useState('')
  const [m, setM] = useState('')
  const [s, setS] = useState('')
  const [val, setVal] = useState('')
  const [saved, setSaved] = useState(false)

  const flash = () => { setSaved(true); setTimeout(() => setSaved(false), 1500) }

  const submitTime = () => {
    const total = (parseInt(h) || 0) * 3600 + (parseInt(m) || 0) * 60 + (parseInt(s) || 0)
    if (!total) return
    onSave(total)
    flash()
  }

  const submitValue = () => {
    if (!val) return
    onSave(parseFloat(val))
    flash()
  }

  return (
    <div style={{ background: 'var(--green-light)', border: '1px solid #B8EAD8', borderRadius: 'var(--r)', padding: '10px 12px' }}>
      <div style={{ fontSize: 10, fontWeight: 800, color: 'var(--green)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 6, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><ChartBar size={11} /> Résultat ({cfg.label})</span>
        {saved && <span>✓ Enregistré</span>}
      </div>
      {isTime ? (
        <div style={{ display: 'flex', gap: 6 }}>
          <input type="number" min="0" placeholder="h" value={h} onChange={e => setH(e.target.value)} onBlur={submitTime} style={logInputStyle} />
          <input type="number" min="0" placeholder="min" value={m} onChange={e => setM(e.target.value)} onBlur={submitTime} style={logInputStyle} />
          <input type="number" min="0" placeholder="sec" value={s} onChange={e => setS(e.target.value)} onBlur={submitTime} style={logInputStyle} />
        </div>
      ) : (
        <input type="number" step="0.1" min="0" placeholder={`ex: 10 ${cfg.suffix}`} value={val} onChange={e => setVal(e.target.value)} onBlur={submitValue} style={logInputStyle} />
      )}
    </div>
  )
}

function ExerciseHistoryButton({ athleteId, exerciseName }) {
  const [open, setOpen] = useState(false)
  const [entries, setEntries] = useState(null)

  const openModal = async (e) => {
    e.stopPropagation()
    setOpen(true)
    setEntries(null)
    const { data } = await supabase.from('exercise_performance_history')
      .select('kg_done, reps_done, sets_done, note, logged_at, program_exercises(name)')
      .eq('athlete_id', athleteId)
      .order('logged_at', { ascending: false })
    setEntries((data || []).filter(l => l.program_exercises?.name === exerciseName))
  }

  return (
    <>
      <button onClick={openModal} style={{ background: 'var(--bg2)', border: '1px solid var(--border2)', color: 'var(--text2)', borderRadius: 'var(--r)', padding: '4px 10px', display: 'flex', cursor: 'pointer', flexShrink: 0 }}>
        <ChartLineUp size={13} />
      </button>
      {open && (
        <div onClick={() => setOpen(false)} style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,.4)', zIndex: 200,
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16
        }}>
          <div onClick={e => e.stopPropagation()} style={{
            background: 'var(--bg)', borderRadius: 'var(--rl)', width: '100%', maxWidth: 480,
            maxHeight: '75vh', overflowY: 'auto', padding: 18
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
              <div style={{ fontFamily: 'var(--font-title)', color: 'var(--title)', fontWeight: 700, fontSize: 18, flex: 1, display: 'flex', alignItems: 'center', gap: 8 }}><ChartLineUp size={16} /> {exerciseName}</div>
              <button onClick={() => setOpen(false)} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: 'var(--text3)', padding: 0 }}>×</button>
            </div>

            {entries === null ? (
              <div style={{ color: 'var(--text3)', fontSize: 13 }}>Chargement…</div>
            ) : entries.length === 0 ? (
              <div style={{ color: 'var(--text3)', fontSize: 13 }}>Aucune charge enregistrée pour cet exercice.</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {(() => {
                  // Une seule carte par jour : garde la plus récente (entries déjà triées desc, valeurs déjà cumulées)
                  const seenDays = new Set()
                  const perDay = entries.filter(e => {
                    const day = e.logged_at.slice(0, 10)
                    if (seenDays.has(day)) return false
                    seenDays.add(day)
                    return true
                  })
                  return perDay
                })().map((e, i) => (
                  <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 3, background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 'var(--r)', padding: '10px 12px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div style={{ fontSize: 12, color: 'var(--text3)', minWidth: 90, flexShrink: 0 }}>
                        {new Date(e.logged_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })}
                      </div>
                      <div style={{ flex: 1, fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>
                        {e.kg_done != null && `${e.kg_done} kg`}
                        {(e.sets_done || e.reps_done) && (
                          <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text3)', marginLeft: e.kg_done != null ? 8 : 0 }}>
                            {[e.sets_done && `${e.sets_done} séries`, e.reps_done].filter(Boolean).join(' · ')}
                          </span>
                        )}
                      </div>
                    </div>
                    {e.note && (
                      <div style={{ fontSize: 12, color: 'var(--text2)', fontStyle: 'italic', paddingLeft: 100 }}>« {e.note} »</div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  )
}

// Ajout d'exercices en direct dans une séance libre : nom (bibliothèque ou texte libre, non
// sauvegardé dans la bibliothèque si inexistant), puis choix explicite entre un objectif à faire
// plus tard (séries/reps/charge cibles) ou une saisie en direct (séries réelles juste en dessous,
// via l'UI standard "+ Ajouter une série"). Supersérie possible avec l'exercice précédent.
function FreeExerciseAdder({ sessionId, exos, onAdd, onToggleSuperset, activityMode }) {
  const isCardio = activityMode === 'cardio'
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [mode, setMode] = useState('live') // 'live' | 'later'
  const [sets, setSets] = useState('')
  const [reps, setReps] = useState('')
  const [kg, setKg] = useState('')
  const [paceBase, setPaceBase] = useState('')
  const [pctLow, setPctLow] = useState('')
  const [pctHigh, setPctHigh] = useState('')
  const [suggestions, setSuggestions] = useState([])
  const [saving, setSaving] = useState(false)
  const [togglingSuperset, setTogglingSuperset] = useState(false)

  const searchMovements = async (val) => {
    if (val.trim().length < 2) { setSuggestions([]); return }
    // Mode cardio : ne propose que les mouvements Run/Row/Ski Erg/Bike (voir isCardioMovementName),
    // en chargeant un lot large avant de filtrer côté client (même limite que l'éditeur coach).
    let query = supabase.from('movements').select('name').ilike('name', `%${val.trim()}%`).order('name').limit(isCardio ? 500 : 6)
    const { data } = await query
    let names = (data || []).map(m => m.name)
    if (isCardio) {
      names = names.filter(isCardioMovementName)
        .sort((a, b) => cardioMovementSortKey(a) - cardioMovementSortKey(b))
        .slice(0, 6)
    }
    setSuggestions(names)
  }

  const reset = () => { setName(''); setMode('live'); setSets(''); setReps(''); setKg(''); setPaceBase(''); setPctLow(''); setPctHigh(''); setSuggestions([]); setOpen(false) }

  const add = async () => {
    if (!name.trim()) return
    setSaving(true)
    const fields = mode === 'later'
      ? (isCardio ? { name, pace_base: paceBase || null, pct_low: pctLow, pct_high: pctHigh } : { name, sets, reps, kg })
      : { name }
    await onAdd(sessionId, fields)
    setSaving(false)
    reset()
  }

  const last = exos[exos.length - 1]
  const prevLast = exos[exos.length - 2]
  const lastPairGrouped = last && prevLast && last.superset_group && last.superset_group === prevLast.superset_group

  const toggleSuperset = async () => {
    setTogglingSuperset(true)
    await onToggleSuperset(sessionId, prevLast, last)
    setTogglingSuperset(false)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {exos.length >= 2 && (
        <button onClick={toggleSuperset} disabled={togglingSuperset} style={{
          alignSelf: 'flex-start', background: lastPairGrouped ? '#EEF2FF' : 'none', color: '#6366f1',
          border: '1px solid #C7D2FE', borderRadius: 20, padding: '5px 12px', fontSize: 12, fontWeight: 700, cursor: 'pointer',
          display: 'flex', alignItems: 'center', gap: 5,
        }}>
          {togglingSuperset ? '…' : lastPairGrouped ? '✕ Retirer la supersérie' : <><LinkSimple size={12} /> Supersérie avec le précédent</>}
        </button>
      )}

      {!open ? (
        <button onClick={() => setOpen(true)} style={{ background: 'none', border: '2px dashed var(--border2)', borderRadius: 'var(--r)', padding: 10, fontSize: 13, fontWeight: 600, color: 'var(--text3)', cursor: 'pointer' }}>
          + Ajouter un exercice
        </button>
      ) : (
        <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 'var(--r)', padding: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ position: 'relative' }}>
            <input
              placeholder="Nom du mouvement"
              value={name}
              autoFocus
              onChange={e => { setName(e.target.value); searchMovements(e.target.value) }}
              onBlur={() => setTimeout(() => setSuggestions([]), 150)}
              style={{ width: '100%', boxSizing: 'border-box', padding: '9px 10px', border: '1px solid var(--border2)', borderRadius: 'var(--r)', fontSize: 14, fontWeight: 600, outline: 'none', background: 'var(--bg)', color: 'var(--text)' }}
            />
            {suggestions.length > 0 && (
              <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: 'var(--bg)', border: '1px solid var(--border2)', borderRadius: 'var(--r)', boxShadow: '0 4px 16px rgba(0,0,0,.12)', zIndex: 50, overflow: 'hidden', marginTop: 2 }}>
                {suggestions.map((sug, si) => (
                  <button key={si} onMouseDown={() => { setName(sug); setSuggestions([]) }}
                    style={{ display: 'block', width: '100%', padding: '8px 10px', textAlign: 'left', background: 'none', border: 'none', borderBottom: si < suggestions.length - 1 ? '1px solid var(--border)' : 'none', fontSize: 13, fontWeight: 600, color: 'var(--text)', cursor: 'pointer' }}>
                    {sug}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div style={{ display: 'flex', gap: 6 }}>
            <button onClick={() => setMode('live')} style={{
              flex: 1, background: mode === 'live' ? 'var(--green)' : 'var(--bg)', color: mode === 'live' ? '#fff' : 'var(--text2)',
              border: '1px solid ' + (mode === 'live' ? 'var(--green)' : 'var(--border2)'), borderRadius: 20, padding: '7px 4px', fontSize: 12, fontWeight: 700, cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
            }}>
              <Circle size={9} weight="fill" color="#DC2626" /> En direct
            </button>
            <button onClick={() => setMode('later')} style={{
              flex: 1, background: mode === 'later' ? 'var(--green)' : 'var(--bg)', color: mode === 'later' ? '#fff' : 'var(--text2)',
              border: '1px solid ' + (mode === 'later' ? 'var(--green)' : 'var(--border2)'), borderRadius: 20, padding: '7px 4px', fontSize: 12, fontWeight: 700, cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
            }}>
              <Clock size={12} /> Objectif, plus tard
            </button>
          </div>

          {mode === 'live' ? (
            <div style={{ fontSize: 11, color: 'var(--text3)' }}>
              {isCardio
                ? 'Le résultat (temps/allure) se note juste en dessous une fois le mouvement créé.'
                : 'Les séries (reps + charge) s’ajoutent juste en dessous une fois l’exercice créé.'}
            </div>
          ) : isCardio ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <select value={paceBase} onChange={e => setPaceBase(e.target.value)}
                style={{ flex: 1, minWidth: 0, padding: '7px 9px', border: '1px solid var(--border2)', borderRadius: 'var(--r)', fontSize: 13, outline: 'none', background: 'var(--bg)', color: paceBase ? 'var(--text)' : 'var(--text3)' }}>
                <option value="">Référence</option>
                {PACE_BASES.map(b => <option key={b.key} value={b.key}>{b.label}</option>)}
              </select>
              <input placeholder="%1" value={pctLow} onChange={e => setPctLow(e.target.value)}
                style={{ width: 52, flexShrink: 0, textAlign: 'center', padding: '7px 6px', border: '1px solid var(--border2)', borderRadius: 'var(--r)', fontSize: 13, outline: 'none', background: 'var(--bg)', color: 'var(--text)' }} />
              <span style={{ color: 'var(--text3)', fontSize: 12 }}>–</span>
              <input placeholder="%2" value={pctHigh} onChange={e => setPctHigh(e.target.value)}
                style={{ width: 52, flexShrink: 0, textAlign: 'center', padding: '7px 6px', border: '1px solid var(--border2)', borderRadius: 'var(--r)', fontSize: 13, outline: 'none', background: 'var(--bg)', color: 'var(--text)' }} />
              <span style={{ fontSize: 12, color: 'var(--text3)' }}>%</span>
            </div>
          ) : (
            <div style={{ display: 'flex', gap: 6 }}>
              <input placeholder="Séries" value={sets} onChange={e => setSets(e.target.value)}
                style={{ flex: 1, minWidth: 0, padding: '7px 9px', border: '1px solid var(--border2)', borderRadius: 'var(--r)', fontSize: 13, outline: 'none', background: 'var(--bg)', color: 'var(--text)' }} />
              <input placeholder="Reps" value={reps} onChange={e => setReps(e.target.value)}
                style={{ flex: 1, minWidth: 0, padding: '7px 9px', border: '1px solid var(--border2)', borderRadius: 'var(--r)', fontSize: 13, outline: 'none', background: 'var(--bg)', color: 'var(--text)' }} />
              <input placeholder="Kg" value={kg} onChange={e => setKg(e.target.value)}
                style={{ flex: 1, minWidth: 0, padding: '7px 9px', border: '1px solid var(--border2)', borderRadius: 'var(--r)', fontSize: 13, outline: 'none', background: 'var(--bg)', color: 'var(--text)' }} />
            </div>
          )}

          <div style={{ display: 'flex', gap: 6 }}>
            <button onClick={reset} style={{ background: 'none', border: '1px solid var(--border2)', borderRadius: 20, padding: '9px 14px', fontSize: 13, fontWeight: 700, color: 'var(--text3)', cursor: 'pointer' }}>
              Annuler
            </button>
            <button onClick={add} disabled={!name.trim() || saving} style={{
              flex: 1, background: name.trim() ? 'var(--green)' : 'var(--border2)', color: '#fff', border: 'none',
              borderRadius: 20, padding: '9px', fontSize: 13, fontWeight: 700, cursor: name.trim() ? 'pointer' : 'default',
            }}>
              {saving ? '…' : '+ Ajouter'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
