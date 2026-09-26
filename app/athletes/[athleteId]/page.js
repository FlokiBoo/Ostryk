'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import FicheSportifCoach from '@/app/components/coach/FicheSportifCoach'
import Seance, { sessionProgressKey } from '@/app/components/athlete/Seance'
import { sectionDeSeance } from '@/lib/sectionsTexte'

// Fiche sportif côté coach. Branche FicheSportifCoach sur les données réelles.
//
// Deux fonctionnalités du composant restent inertes tant que les lots A4/A7 de
// docs/audit-schema-2026-09.md ne sont pas passés en base : le badge "Coachée" et la planification
// d'un rendez-vous (is_coached, coaching_schedule.starts_at), et le badge "Personnalisée"
// (customized_at). Elles ne s'affichent simplement pas — le reste fonctionne.
//
// "Lancer le coaching" ouvre l'écran de séance commun au sportif et au coach (Seance.js, mode
// coach) : séries écrites avec entered_by_role = 'coach' et prescription figée (lot A8), note
// privée par exercice (lot A9, private_coach_note), notation et récapitulatif en fin de séance.

// difficulty est saisi sur une échelle 1-5 en feedback post-séance (voir WeeklyStatsBlock).
function labelEffort(difficulty) {
  if (difficulty == null) return null
  if (difficulty <= 2) return 'Facile'
  if (difficulty === 3) return 'Ok'
  return 'Dur'
}

// Le composant raisonne en blocs × tours ; Ostryk stocke une liste plate d'exercices portant chacun
// un nombre de séries. Une séance = UN bloc, dont le nombre de tours est le plus grand nombre de
// séries qu'il contient — côté composant, prescriptionDe retombe sur la dernière série connue pour
// les exercices qui en ont moins. Un bloc par exercice (première version) donnait un onglet "Bloc A,
// B, C…" par mouvement en mode coaching, illisible. Les supersets restent lisibles par l'ordre des
// exercices, superset_group ne sert pas à découper.
function blocsDeSeance(session, setsParExercice) {
  const exos = [...(session.program_exercises || [])]
    .filter(e => e.name)
    .sort((a, b) => (a.order_index ?? 0) - (b.order_index ?? 0))

  if (exos.length === 0) {
    return [{ id: 'A', texte: session.coach_notes || session.activation || 'Séance sans exercices détaillés.' }]
  }

  return [{
    id: 'A',
    tours: Math.max(1, ...exos.map(e => parseInt(e.sets, 10) || 1)),
    exercices: exos.map(e => {
      const nbSeries = parseInt(e.sets, 10) || 1
      const kg = e.kg != null ? Number(e.kg) : null
      // reps est du texte libre : "8", "8-10", "max", "AMRAP". parseInt donne la borne basse quand
      // il y en a une ; sinon on garde le texte pour l'affichage (prescritTexte) et 1 pour le
      // stepper, qui a besoin d'un nombre.
      const nombre = parseInt(e.reps, 10)
      const faites = [...(setsParExercice[e.id] || [])].sort((a, b) => a.set_index - b.set_index)
      return {
        id: e.id,
        nom: e.name,
        unite: kg != null ? 'kg' : null,
        pas: 2.5,
        prescritTexte: Number.isNaN(nombre) && e.reps ? String(e.reps) : null,
        prescrit: Array.from({ length: nbSeries }, () => ({ kg, reps: Number.isNaN(nombre) ? 1 : nombre })),
        realise: faites.length
          ? faites.map(s => ({ kg: s.kg_done != null ? Number(s.kg_done) : null, reps: parseInt(s.reps_done, 10) || 0 }))
          : null,
      }
    }),
  }]
}

function debutDeSemaine(decalageSemaines = 0) {
  const d = new Date()
  const jour = (d.getDay() + 6) % 7
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() - jour - decalageSemaines * 7)
  return d
}

// Chargement hors composant : le setState ne se fait qu'après l'await, et l'effet peut annuler
// son résultat si le coach a changé de sportif entre-temps.
async function chargerFiche(athleteId) {
    const [{ data: athlete }, { data: programs }, { data: completions }, { data: sets }, { data: objectives }, { data: membres }] = await Promise.all([
      supabase.from('athletes').select('*').eq('id', athleteId).single(),
      supabase.from('programs').select('*, program_sessions(*, program_exercises(*))')
        .eq('athlete_id', athleteId).neq('archived', true).order('created_at', { ascending: false }),
      supabase.from('program_completions').select('*').eq('athlete_id', athleteId),
      supabase.from('program_exercise_sets').select('*').eq('athlete_id', athleteId),
      supabase.from('athlete_objectives').select('*').eq('athlete_id', athleteId).order('target_date'),
      supabase.from('group_members').select('groups(name)').eq('athlete_id', athleteId),
    ])

    if (!athlete) return { erreur: 'Sportif introuvable.' }

    const programme = (programs || []).find(p => !p.is_workout && !p.is_microcycle && (p.program_sessions || []).length > 1)
      || (programs || [])[0] || null

    const parSession = new Map((completions || []).map(c => [c.program_session_id, c]))
    const setsParExercice = {}
    for (const s of (sets || [])) {
      (setsParExercice[s.program_exercise_id] ||= []).push(s)
    }

    const sessions = [...((programme?.program_sessions) || [])]
      .filter(s => s.session_type !== 'recurrent')
      .sort((a, b) => (a.order_index ?? 0) - (b.order_index ?? 0))

    const seances = sessions.map(s => {
      const c = parSession.get(s.id)
      const statut = !c ? 'a_venir' : (c.skipped ? 'manquee' : 'faite')
      const blocs = blocsDeSeance(s, setsParExercice)
      const nbSeries = blocs.reduce((n, b) => n + (b.exercices || []).reduce((m, e) => m + e.prescrit.length, 0), 0)
      return {
        id: s.id,
        titre: s.title || 'Séance',
        type: s.activity_mode === 'cardio' ? 'endurance' : 'force',
        statut,
        date: c?.completed_at || s.date || null,
        duree_min: c?.duration_minutes ?? null,
        effort: labelEffort(c?.difficulty),
        // entered_by_role arrive au lot A8 : impossible de savoir aujourd'hui qui a saisi.
        saisie_coach: false,
        duree_estimee_min: Math.max(5, Math.round(5 + nbSeries * 1.5)),
        blocs,
      }
    })

    const faitesAvecDate = (completions || []).filter(c => !c.skipped && c.completed_at)
    const semainePrevues = programme?.athlete_days_of_week?.length || programme?.recommended_sessions_per_week || 3
    const quatreSemaines = [3, 2, 1, 0].map(k => {
      const debut = debutDeSemaine(k)
      const fin = debutDeSemaine(k - 1)
      return { faites: faitesAvecDate.filter(c => { const d = new Date(c.completed_at); return d >= debut && d < fin }).length, prevues: semainePrevues }
    })
    const restantes = seances.filter(s => s.statut === 'a_venir').length
    const difficultes = (completions || []).filter(c => c.difficulty != null).map(c => c.difficulty)
    const moyenne = difficultes.length ? Math.round(difficultes.reduce((a, b) => a + b, 0) / difficultes.length) : null

    return { data: {
      // Pour l'écran de coaching (CoachingSeance) : séances telles qu'en base et séries du sportif.
      brut: { sessionsParId: Object.fromEntries(sessions.map(s => [s.id, s])), setsParExercice, completions: parSession },
      athlete: {
        id: athlete.id,
        nom: athlete.name || 'Sportif',
        is_1to1_client: !!athlete.is_1to1_client,
        groupes: (membres || []).map(m => m.groups?.name).filter(Boolean),
        objectifs: (objectives || []).filter(o => !o.completed_at).map(o => ({ id: o.id, titre: o.text, date: o.target_date })),
      },
      programme: {
        id: programme?.id,
        titre: programme?.title || 'Aucun programme',
        duration_weeks: programme?.duration_weeks || Math.max(1, Math.ceil(sessions.length / semainePrevues)),
        semaine_courante: Math.min(
          programme?.duration_weeks || 99,
          Math.max(1, Math.ceil((seances.filter(s => s.statut !== 'a_venir').length + 1) / semainePrevues))
        ),
        athlete_days_of_week: programme?.athlete_days_of_week || [],
        // Projection à partir d'aujourd'hui sur les séances qui RESTENT, pas depuis la date
        // d'assignation : sur un programme entamé il y a deux mois, partir de created_at affichait
        // une date de fin déjà passée.
        fin_estimee: restantes
          ? new Date(Date.now() + Math.ceil(restantes / semainePrevues) * 7 * 86400000).toISOString()
          : null,
      },
      stats: {
        semaineFaites: quatreSemaines[3].faites,
        semainePrevues,
        quatreSemaines,
        effortMoyen: labelEffort(moyenne) || '—',
      },
      seances,
    } }
}

export default function FicheSportifPage() {
  const { athleteId } = useParams()
  const router = useRouter()
  const [data, setData] = useState(null)
  const [erreur, setErreur] = useState(null)

  const rafraichir = useCallback(async () => {
    const res = await chargerFiche(athleteId)
    if (res.erreur) { setErreur(res.erreur); return null }
    setData(res.data)
    return res.data
  }, [athleteId])

  useEffect(() => {
    let actif = true
    chargerFiche(athleteId).then(res => {
      if (!actif) return
      if (res.erreur) setErreur(res.erreur)
      else setData(res.data)
    })
    return () => { actif = false }
  }, [athleteId])

  if (erreur) return <div style={{ padding: 24, color: 'var(--text2)' }}>{erreur}</div>
  if (!data) return <div style={{ padding: 24, color: 'var(--text3)' }}>Chargement…</div>

  return (
    <FicheSportifCoach
      athlete={data.athlete}
      programme={data.programme}
      stats={data.stats}
      seances={data.seances}
      renderCoaching={({ seance, fermer, terminee }) => (
        <CoachingSeance
          athleteId={athleteId}
          athleteNom={data.athlete.nom}
          brute={data.brut.sessionsParId[seance.id]}
          setsInitiaux={data.brut.setsParExercice}
          dejaFaite={!!data.brut.completions.get(seance.id) && !data.brut.completions.get(seance.id).skipped}
          onFermer={fermer}
          onTerminee={async () => { await rafraichir(); terminee(seance.id) }}
        />
      )}
      onVoirHistorique={() => router.push(`/programs/${athleteId}`)}
      // Le panneau de messagerie est global (ChatWidget dans app/layout.js), ouvert par événement.
      onMessage={() => window.dispatchEvent(new Event('open-chat-widget'))}
    />
  )
}

// Écran de coaching en présentiel : l'écran de séance du sportif (Seance.js) en mode coach, branché
// directement sur Supabase (le coach est en ligne, face à son sportif — pas de file hors ligne).
function CoachingSeance({ athleteId, athleteNom, brute, setsInitiaux, dejaFaite, onFermer, onTerminee }) {
  const [mouvements, setMouvements] = useState(null)
  const [exerciseSets, setExerciseSets] = useState(() => {
    const out = {}
    for (const e of brute.program_exercises || []) {
      out[e.id] = [...(setsInitiaux[e.id] || [])].sort((a, b) => a.set_index - b.set_index)
    }
    return out
  })
  // Miroir synchrone de l'état : Seance enregistre plusieurs champs d'affilée, avant tout re-rendu.
  const setsRef = useRef(exerciseSets)
  const alerteRef = useRef(0)

  // Bibliothèque : vidéos des exercices et mouvements cités par l'échauffement / retour au calme.
  useEffect(() => {
    let actif = true
    supabase.from('movements').select('id, name, video_url, youtube_url').then(({ data }) => { if (actif) setMouvements(data || []) })
    return () => { actif = false }
  }, [])

  const session = useMemo(() => {
    if (!mouvements) return null
    const parNom = new Map(mouvements.map(m => [m.name.trim().toLowerCase(), m]))
    const exercises = [...(brute.program_exercises || [])]
      .sort((a, b) => (a.order_index ?? 0) - (b.order_index ?? 0))
      .map(e => {
        const m = parNom.get((e.name || '').trim().toLowerCase())
        return { ...e, video_url: m?.youtube_url || m?.video_url || e.video_url || null }
      })
    const base = { ...brute, exercises }
    return {
      ...base,
      sections: {
        echauffement: sectionDeSeance(base, 'echauffement', mouvements),
        retourAuCalme: sectionDeSeance(base, 'retourAuCalme', mouvements),
      },
    }
  }, [brute, mouvements])

  const mouvementsSections = useMemo(() => Object.fromEntries((mouvements || []).map(m => [m.id, { id: m.id, nom: m.name, video_url: m.youtube_url || m.video_url || null }])), [mouvements])

  const majSets = (fn) => {
    setsRef.current = fn(setsRef.current)
    setExerciseSets(setsRef.current)
  }

  // Séries manquantes créées localement (id provisoire) ; elles n'existent en base qu'à la première
  // écriture, par upsert sur (exercice, sportif, set_index).
  const ensureExerciseSets = (exerciseId, count) => majSets(prev => {
    const cur = prev[exerciseId] || []
    if (cur.length >= count) return prev
    const debut = cur.length ? Math.max(...cur.map(s => s.set_index)) + 1 : 1
    const ajout = Array.from({ length: count - cur.length }, (_, i) => ({ id: `coach-${exerciseId}-${debut + i}`, set_index: debut + i }))
    return { ...prev, [exerciseId]: [...cur, ...ajout] }
  })

  const saveExerciseSet = async (exerciseId, setId, champ, valeur) => {
    const ligne = (setsRef.current[exerciseId] || []).find(s => s.id === setId)
    if (!ligne) return
    const v = champ === 'kg_done' ? (valeur === '' || valeur == null ? null : parseFloat(valeur))
      : champ === 'kg_prescribed' ? (valeur === '' || valeur == null ? null : Number(valeur))
      : (valeur || null)
    majSets(prev => ({ ...prev, [exerciseId]: prev[exerciseId].map(s => (s.id === setId ? { ...s, [champ]: v } : s)) }))
    const { error } = await supabase.from('program_exercise_sets').upsert({
      program_exercise_id: exerciseId, athlete_id: athleteId, set_index: ligne.set_index, [champ]: v, entered_by_role: 'coach',
    }, { onConflict: 'program_exercise_id,athlete_id,set_index' })
    if (error && Date.now() - alerteRef.current > 5000) {
      alerteRef.current = Date.now()
      alert('Série non enregistrée : ' + error.message)
    }
  }

  const enregistrerNotePrivee = async ({ program_exercise_id, texte }) => {
    const { error } = await supabase.from('program_exercises').update({ private_coach_note: texte || null }).eq('id', program_exercise_id)
    if (error) throw new Error('Note non enregistrée : ' + error.message)
  }

  const enregistrerSeance = async (champs) => {
    const { error } = await supabase.from('program_completions').upsert({
      athlete_id: athleteId, program_session_id: brute.id, skipped: false,
      ...(dejaFaite ? {} : { completed_at: new Date().toISOString() }),
      ...champs,
    }, { onConflict: 'athlete_id,program_session_id' })
    if (error) throw new Error('Séance non enregistrée : ' + error.message)
  }

  // Partager : le sportif retrouve le bilan (citation + muscles) à sa prochaine ouverture de l'app,
  // comme pour toute séance validée par le coach (pending_celebration), et reçoit une notification.
  const partagerRecap = async ({ plaisir, difficulte, duree_min, citation, muscles }) => {
    const tonnage = Object.values(setsRef.current).flat()
      .reduce((t, s) => t + (parseFloat(s.kg_done) || 0) * (parseInt(s.reps_done, 10) || 0), 0)
    try {
      await enregistrerSeance({
        pleasure: plaisir, difficulty: difficulte, duration_minutes: duree_min,
        pending_celebration: { tonnage: Math.round(tonnage), muscles, records: [], citation },
      })
      await supabase.from('notifications').insert({
        athlete_id: athleteId, type: 'session_validated_by_coach',
        title: 'Ton coach a validé une séance pour toi', body: brute.title || null,
      })
    } catch (err) { alert(err.message); throw err }
  }

  const terminer = async ({ plaisir, difficulte, duree_min }) => {
    try {
      await enregistrerSeance({ pleasure: plaisir, difficulty: difficulte, duration_minutes: duree_min })
    } catch (err) { alert(err.message); return }
    try { localStorage.removeItem(sessionProgressKey(athleteId, brute.id)) } catch { /* pas bloquant */ }
    await onTerminee()
  }

  if (!session) return <div style={{ padding: 24, color: 'var(--text3)' }}>Chargement…</div>

  return (
    <Seance
      mode="coach"
      athleteNom={athleteNom}
      session={session}
      athleteId={athleteId}
      mouvementsSections={mouvementsSections}
      exerciseSets={exerciseSets}
      onEnsureExerciseSets={ensureExerciseSets}
      onSaveExerciseSet={saveExerciseSet}
      onEnregistrerNotePrivee={enregistrerNotePrivee}
      onPartagerRecap={partagerRecap}
      onTerminer={terminer}
      onQuitter={onFermer}
    />
  )
}
