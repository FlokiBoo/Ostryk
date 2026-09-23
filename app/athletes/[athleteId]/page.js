'use client'

import { useCallback, useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import FicheSportifCoach from '@/app/components/coach/FicheSportifCoach'

// Fiche sportif côté coach. Branche FicheSportifCoach sur les données réelles.
//
// Trois fonctionnalités du composant restent inertes tant que les lots A4/A7/A8 de
// docs/audit-schema-2026-09.md ne sont pas passés en base : le badge "Coachée" et la planification
// d'un rendez-vous (is_coached, coaching_schedule.starts_at), le badge "Personnalisée"
// (customized_at), et la note privée par exercice (private_coach_note). Elles ne s'affichent
// simplement pas — le reste fonctionne.
//
// La saisie des séries écrit dans program_exercise_sets avec ses colonnes actuelles seulement :
// kg_prescribed/reps_prescribed/entered_by_role attendent le lot A8, la prescription reste donc
// lisible côté programme mais n'est pas figée au moment de la saisie.

// difficulty est saisi sur une échelle 1-5 en feedback post-séance (voir WeeklyStatsBlock).
function labelEffort(difficulty) {
  if (difficulty == null) return null
  if (difficulty <= 2) return 'Facile'
  if (difficulty === 3) return 'Ok'
  return 'Dur'
}

// Le composant raisonne en blocs × tours ; Ostryk stocke des exercices portant un nombre de séries.
// Un bloc = un superset (superset_group), sinon un exercice seul. Le nombre de tours du bloc est le
// plus grand nombre de séries qu'il contient : côté composant, prescriptionDe retombe sur la
// dernière série connue pour les exercices qui en ont moins.
function blocsDeSeance(session, setsParExercice) {
  const exos = [...(session.program_exercises || [])]
    .filter(e => e.name)
    .sort((a, b) => (a.order_index ?? 0) - (b.order_index ?? 0))

  if (exos.length === 0) {
    return [{ id: 'A', texte: session.coach_notes || session.activation || 'Séance sans exercices détaillés.' }]
  }

  const groupes = []
  for (const e of exos) {
    const cle = e.superset_group || `solo-${e.id}`
    let g = groupes.find(x => x.cle === cle)
    if (!g) { g = { cle, exos: [] }; groupes.push(g) }
    g.exos.push(e)
  }

  return groupes.map((g, i) => ({
    id: String.fromCharCode(65 + i),
    tours: Math.max(1, ...g.exos.map(e => parseInt(e.sets, 10) || 1)),
    exercices: g.exos.map(e => {
      const nbSeries = parseInt(e.sets, 10) || 1
      const kg = e.kg != null ? Number(e.kg) : null
      // reps est du texte libre ("8", "8-10", "max") : parseInt donne la borne basse, et 1 à défaut.
      const reps = parseInt(e.reps, 10) || 1
      const faites = [...(setsParExercice[e.id] || [])].sort((a, b) => a.set_index - b.set_index)
      return {
        id: e.id,
        nom: e.name,
        unite: kg != null ? 'kg' : null,
        pas: 2.5,
        prescrit: Array.from({ length: nbSeries }, () => ({ kg, reps })),
        realise: faites.length
          ? faites.map(s => ({ kg: s.kg_done != null ? Number(s.kg_done) : null, reps: parseInt(s.reps_done, 10) || 0 }))
          : null,
      }
    }),
  }))
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
    const difficultes = (completions || []).filter(c => c.difficulty != null).map(c => c.difficulty)
    const moyenne = difficultes.length ? Math.round(difficultes.reduce((a, b) => a + b, 0) / difficultes.length) : null

    return { data: {
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
        fin_estimee: null,
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

  const enregistrerSerie = async (serie) => {
    // Colonnes du lot A8 volontairement absentes de l'insert : elles n'existent pas encore.
    const { error } = await supabase.from('program_exercise_sets').upsert({
      program_exercise_id: serie.program_exercise_id,
      athlete_id: serie.athlete_id,
      set_index: serie.set_index,
      kg_done: serie.kg_done,
      reps_done: serie.reps_done,
    }, { onConflict: 'program_exercise_id,athlete_id,set_index' })
    if (error) console.error('Série non enregistrée :', error.message)
  }

  const terminerCoaching = async (payload) => {
    const { error } = await supabase.from('program_completions').upsert({
      athlete_id: athleteId,
      program_session_id: payload.program_session_id,
      skipped: false,
      completed_at: new Date().toISOString(),
      duration_minutes: payload.duration_minutes,
    }, { onConflict: 'athlete_id,program_session_id' })
    if (error) { alert('Séance non enregistrée : ' + error.message); return }
    await rafraichir()
  }

  if (erreur) return <div style={{ padding: 24, color: 'var(--text2)' }}>{erreur}</div>
  if (!data) return <div style={{ padding: 24, color: 'var(--text3)' }}>Chargement…</div>

  return (
    <FicheSportifCoach
      athlete={data.athlete}
      programme={data.programme}
      stats={data.stats}
      seances={data.seances}
      onEnregistrerSerie={enregistrerSerie}
      onTerminerCoaching={terminerCoaching}
      onVoirHistorique={() => router.push(`/programs/${athleteId}`)}
      // Le panneau de messagerie est global (ChatWidget dans app/layout.js), ouvert par événement.
      onMessage={() => window.dispatchEvent(new Event('open-chat-widget'))}
    />
  )
}
