'use client'

import { useState, useEffect } from 'react'
import { ClipboardText, UsersThree, Play, Repeat, Barbell, Clock, CalendarBlank, CaretRight, ClockCounterClockwise, LockSimpleOpen } from '@phosphor-icons/react'
import { WEEK_DAYS } from '@/lib/weekDays'
import ObjectivesBlock from '@/app/components/ObjectivesBlock'
import SwipeCarousel from './SwipeCarousel'
import ChooseDaysModal from './ChooseDaysModal'
import AccueilClient, { joursDeLaSemaine, isoLocal, styleLibelleSection } from './AccueilClient'

// Un programme multi-séances que personne n'a daté (ni le coach via day_of_week, ni le sportif via
// athlete_days_of_week) doit d'abord demander son rythme hebdomadaire — c'est ChooseDaysModal, plus
// bas. Le conseil du coach y plafonne la sélection quand il existe (voir le commentaire du popup). Le prédicat est exporté parce que app/s/[token]/page.js doit savoir si ce popup est en
// attente : il passe avant le rappel d'abonnement dans la file des popups, sinon les deux
// s'affichent l'un sur l'autre au même chargement.
export function hasPendingDayPicker(programs, completions, skippedSessions) {
  return (programs || []).filter(p => p.pinned_board !== false && !p.archived && !p.group_id).some(prog => {
    const progression = prog.sessions.filter(s => s.session_type !== 'recurrent')
    if (progression.length <= 1) return false
    if (progression.some(s => s.day_of_week != null)) return false
    if (prog.athlete_days_of_week?.length) return false
    return progression.some(s => !(completions.has(s.id) && !skippedSessions.has(s.id)))
  })
}

// Aucune durée réelle n'est connue avant d'avoir fait la séance (duration_minutes n'existe qu'en
// feedback post-séance) — estimation grossière à partir du nombre de séries prescrites, juste pour
// donner un ordre de grandeur sur la carte "Séance du jour".
function estimateDurationMin(exercises) {
  const base = 5
  const perExo = (exercises || []).filter(e => e.name).reduce((sum, e) => sum + (parseInt(e.sets, 10) || 3) * 1.5, 0)
  return Math.round(base + perExo)
}

// Couleur de la séance sur l'accueil (force / endurance / mobilité) : l'app ne stocke pas de type
// par séance, on le déduit du mode cardio de la séance ou du type d'activité du programme.
function typeSeance(session, program) {
  if (session.activity_mode === 'cardio') return 'endurance'
  const t = (program.activity_type || '').toLowerCase()
  if (/mobil|yoga|stretch|souplesse|pilates/.test(t)) return 'mobilite'
  if (/course|run|trail|v[ée]lo|cycl|natation|swim|cardio|endurance|marche|rameur|row/.test(t)) return 'endurance'
  return 'force'
}

// Aperçu du contenu : les noms d'exercices, trois par ligne, trois lignes au plus.
function blocsSeance(exercises) {
  const noms = (exercises || []).filter(e => e.name).map(e => e.name.trim())
  const lignes = []
  for (let i = 0; i < noms.length && lignes.length < 3; i += 3) lignes.push(noms.slice(i, i + 3).join(', '))
  const reste = noms.length - 9
  if (reste > 0) lignes[lignes.length - 1] += ` + ${reste} autre${reste > 1 ? 's' : ''}`
  return lignes
}

const titreSection = { ...styleLibelleSection, fontWeight: 400, marginBottom: 12 }

// Page d'accueil (onglet "Accueil") : rendue par AccueilClient — objectifs, semaine, séance du
// jour, catalogue — et complétée en dessous par ce qui n'entre pas dans la semaine (séances
// récurrentes, historique, notes du coach, groupes).
// "Séance du jour" montre en permanence la PROCHAINE séance non complétée de chaque programme
// actif — récurrente, datée par le coach, datée par l'athlète, ou même pas encore datée du tout
// (voir programEntries plus bas) — peu importe le jour où elle est prévue. Retour terrain : filtrer
// par "aujourd'hui" faisait disparaître une séance manquée sans que l'athlète s'en rende compte, ou
// la cachait avant son jour ; elle reste maintenant affichée, avec son jour prévu écrit sur la
// carte (dayKey), jusqu'à ce qu'elle soit validée.
export default function WodTab({
  isCoachView, noteBlocks,
  programs, completions, skippedSessions,
  completionDates = {}, openedSessionId = null,
  onOpenSubscription,
  router, token, setActiveTab,
  recurringTodayCounts = {},
  athlete, objectives, setObjectives,
  onUpdateProgramDays,
  onPostponeSession,
}) {
  const [leaderGroups, setLeaderGroups] = useState([])
  // Programmes pour lesquels l'athlète a fermé le popup de choix de jours sans valider — masqué
  // seulement pour cette visite (pas persisté), il redemandera à la prochaine ouverture tant que
  // athlete_days_of_week reste vide.
  const [dismissedDayPickerIds, setDismissedDayPickerIds] = useState(new Set())
  const [showAllPast, setShowAllPast] = useState(false)
  const [showObjectives, setShowObjectives] = useState(false)
  const [postponeTarget, setPostponeTarget] = useState(null)
  const [catalogue, setCatalogue] = useState([])

  const openSession = (sessionId) => {
    router.push(`/s/${token}?session=${sessionId}&focus=1${isCoachView ? '&coach=1' : ''}`)
  }

  // Un leader de groupe n'a pas accès à l'espace coach (/groups/...), confiné comme tout athlète à
  // /s/[token] — il pilote donc sa séance de groupe (présence, contenu, ressenti) depuis ici. Un
  // membre normal peut aussi voir apparaître le programme du groupe (sans bouton Lancer) si le
  // coach a réglé sa visibilité sur "Tout le monde" — le serveur tranche selon le rôle réel.
  useEffect(() => {
    if (isCoachView) return
    const n = new Date()
    const localDate = [n.getFullYear(), String(n.getMonth() + 1).padStart(2, '0'), String(n.getDate()).padStart(2, '0')].join('-')
    fetch(`/api/athlete-view/${token}/leader-groups?date=${localDate}`).then(r => r.json()).then(data => setLeaderGroups(data.groups || []))
  }, [isCoachView, token])

  // Un programme assigné à un groupe (fan-out depuis la fiche groupe) ne doit pas apparaître ici :
  // le sportif le suit en direct pendant la séance collective, pas en autonomie — l'afficher aussi
  // dans sa liste perso fait doublon avec ce qu'il vit en cours et surcharge l'écran pour rien.
  // Catalogue en libre-service ("Programmes" en bas de l'accueil) — inutile pour un client suivi
  // en 1:1, dont le coach construit lui-même les programmes.
  const showCatalogue = !isCoachView && !!athlete && !athlete.is_1to1_client
  useEffect(() => {
    if (!showCatalogue) return
    fetch(`/api/athlete-view/${token}/available-programs`).then(r => r.json()).then(data => setCatalogue(data.programs || [])).catch(() => {})
  }, [showCatalogue, token])

  const boardPrograms = programs.filter(p => p.pinned_board !== false && !p.archived && !p.group_id)

  // Deux façons d'obtenir un jour pour une séance : le coach le fixe séance par séance sur le
  // template (day_of_week), ou l'athlète choisit ses jours (athlete_days_of_week). Dans les deux
  // cas, comme pour un programme pas encore daté du tout, seule la PROCHAINE séance non complétée
  // compte désormais (voir programEntries plus bas) — le jour choisi n'est plus qu'une indication
  // écrite sur la carte, il ne conditionne plus sa visibilité (cas réel : Kévin Cosaque / VO2MAX).
  // Séance récurrente (session_type === 'recurrent') : vit hors du calendrier — elle ne compte pas
  // pour déterminer si un programme est "daté", elle est listée à part (voir recurringEntries plus
  // bas), et jamais "consommée" par la progression classique (reste proposable indéfiniment).
  const recurringEntries = []
  boardPrograms.forEach(prog => {
    prog.sessions.filter(s => s.session_type === 'recurrent').forEach(s => recurringEntries.push({ session: s, program: prog }))
  })

  const coachDatedPrograms = []
  const athleteDatedPrograms = []
  const unscheduledPrograms = []
  boardPrograms.forEach(prog => {
    if (prog.sessions.some(s => s.session_type !== 'recurrent' && s.day_of_week != null)) coachDatedPrograms.push(prog)
    else if (prog.athlete_days_of_week?.length) athleteDatedPrograms.push(prog)
    else if (!prog.sessions.every(s => s.session_type === 'recurrent')) unscheduledPrograms.push(prog)
  })
  const isValidated = (s) => completions.has(s.id) && !skippedSessions.has(s.id)
  // La séance que le sportif a ouverte en dernier reste la séance "en cours" tant qu'il ne l'a pas
  // validée — y compris s'il a rouvert une séance plus ancienne depuis l'historique. Sans ça, la
  // carte repartait sur la suivante du programme dès l'ouverture, comme si la séance ouverte était
  // faite (retour terrain). Une fois validée, la progression classique reprend la main.
  const nextUncompletedOf = (prog) => {
    const progressionSessions = prog.sessions.filter(s => s.session_type !== 'recurrent')
    const opened = openedSessionId
      ? progressionSessions.find(s => s.id === openedSessionId && !isValidated(s))
      : null
    return opened || progressionSessions.find(s => !isValidated(s))
  }

  // Une seule carte par programme actif, toujours affichée jusqu'à validation de la séance —
  // dayKey (quand connu) n'est là que pour l'affichage ("le jour choisi est écrit"), voir
  // renderDayCard. Un programme entièrement fini (plus de nextUncompleted, ex. une "Séance libre"
  // déjà faite) n'a simplement pas d'entrée, comme avant.
  const programEntries = []
  coachDatedPrograms.forEach(prog => {
    const next = nextUncompletedOf(prog)
    if (next) programEntries.push({ session: next, program: prog, isRecurring: false, dayKey: next.day_of_week ?? null })
  })
  // Jour "de référence" de l'athlète : chaque séance a une position fixe dans la rotation de ses
  // jours choisis (séance 1 → jour A, séance 2 → jour B, séance 3 → jour A, etc.) — ne sert plus
  // qu'à afficher le jour prévu sur la carte, plus à décider si la séance doit apparaître ou non.
  athleteDatedPrograms.forEach(prog => {
    const progressionSessions = prog.sessions.filter(s => s.session_type !== 'recurrent')
    const next = nextUncompletedOf(prog)
    if (!next) return
    const chosenDays = prog.athlete_days_of_week
    const idx = progressionSessions.findIndex(s => s.id === next.id)
    const dayKey = chosenDays.length ? chosenDays[idx % chosenDays.length] : null
    programEntries.push({ session: next, program: prog, isRecurring: false, dayKey })
  })
  unscheduledPrograms.forEach(prog => {
    const next = nextUncompletedOf(prog)
    if (next) programEntries.push({ session: next, program: prog, isRecurring: false, dayKey: null })
  })


  // Séance récurrente : hors calendrier, proposée tous les jours, affichée dans son propre encart
  // ("Séance récurrente"), séparé de "Séance du jour" — un programme classique n'a rien à voir avec
  // un WOD du jour qui revient indéfiniment, les mélanger dans une même carte prêtait à confusion.
  // S'ouvre comme n'importe quelle séance (voir openSession) — le compteur du jour
  // (recurring_session_logs) repart à zéro le lendemain sans faire disparaître la séance.
  const recurringDisplayEntries = recurringEntries.map(e => ({ ...e, isRecurring: true, dayKey: null }))

  // Historique : toutes les séances déjà passées (validées ou sautées), programmes archivés et
  // séances libres compris — le sportif doit pouvoir en rouvrir une pour la relire ou corriger son
  // bilan, sans qu'elle encombre "Séance du jour". Triées du plus récent au plus ancien ; les
  // lignes sans completed_at (anciennes validations) retombent sur l'ordre du programme.
  // Une séance sautée reste proposée sur la carte du jour (elle n'est pas "faite") : on l'exclut
  // alors de l'historique, sinon elle s'afficherait deux fois sur le même écran.
  const boardSessionIds = new Set(programEntries.map(e => e.session.id))
  const pastEntries = programs.flatMap(prog =>
    prog.sessions
      .filter(s => s.session_type !== 'recurrent' && completions.has(s.id) && !boardSessionIds.has(s.id) && !s.locked && !s.hidden)
      .map(s => ({ session: s, program: prog, date: completionDates[s.id] || null, skipped: skippedSessions.has(s.id) }))
  ).sort((a, b) => {
    if (a.date && b.date) return b.date.localeCompare(a.date)
    if (a.date) return -1
    if (b.date) return 1
    return (b.session.order_index ?? 0) - (a.session.order_index ?? 0)
  })
  const visiblePast = showAllPast ? pastEntries : pastEntries.slice(0, 5)

  // Un vrai programme multi-séances non daté doit demander à l'athlète son rythme hebdomadaire
  // (popup) — une "Séance libre" ponctuelle (1 seule séance) n'a pas de "rythme" à choisir, elle
  // reste juste accessible via sa carte dans "Séance du jour" ci-dessus sans popup.
  const programsNeedingDays = unscheduledPrograms.filter(prog =>
    prog.sessions.filter(s => s.session_type !== 'recurrent').length > 1
    && !dismissedDayPickerIds.has(prog.id)
    && nextUncompletedOf(prog)
  )
  const dayPickerProgram = programsNeedingDays[0] || null

  // isPrimary est fourni explicitement par l'appelant (pas dérivé de la position locale dans sa
  // propre liste) : "Séance récurrente" et "Séance du jour" sont deux sections indépendantes qui
  // appellent chacune renderDayCard avec leur propre premier élément — sans ça, les deux
  // affichaient chacune un CTA plein bordeaux le même jour, sans hiérarchie entre les deux (voir
  // overallFirstIsRecurring plus bas, qui détermine LEQUEL des deux premiers l'est vraiment).
  const renderDayCard = (entry, isPrimary) => {
    const { session: s, program, isRecurring, dayKey } = entry
    const exoCount = (s.exercises || []).filter(e => e.name).length
    const durationMin = estimateDurationMin(s.exercises)
    const isDone = !isRecurring && completions.has(s.id) && !skippedSessions.has(s.id)
    const recurringMet = isRecurring && (recurringTodayCounts[s.id] || 0) >= (s.recurring_daily_target || 1)
    // Indication écrite du jour prévu — n'a plus d'effet sur la visibilité de la carte (voir
    // programEntries plus haut) : la séance reste affichée avant comme après ce jour, tant qu'elle
    // n'est pas validée.
    const dayLabel = !isRecurring && dayKey != null ? WEEK_DAYS.find(d => d.key === dayKey)?.label : null
    return (
      <div key={s.id} style={{ background: 'var(--card-white)', border: '1px solid var(--ostryk-border)', borderRadius: 'var(--ostryk-card-radius)', padding: '16px', margin: '0 2px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        {isRecurring && (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 700, color: 'var(--vert-foret)' }}><Repeat size={12} weight="light" /> Tous les jours</span>
        )}
        {dayLabel && (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 700, color: 'var(--vert-foret)' }}><CalendarBlank size={12} weight="light" /> Prévue {dayLabel}</span>
        )}
        {/* Nom du programme : toujours affiché (même avec un seul programme actif, où il ne
            vivait auparavant que dans le sous-titre du carrousel, absent en dehors de ce mode) —
            retour terrain, doit rester visible et lisible en toutes circonstances. */}
        {program.title && (
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--ostryk-text2)', textTransform: 'uppercase', letterSpacing: '0.4px' }}>
            {program.title}
          </div>
        )}
        <div style={{ fontFamily: 'var(--font-title)', fontWeight: 600, fontSize: 22, color: 'var(--bordeaux)' }}>
          {s.title || 'Séance'}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, fontSize: 12, color: 'var(--ostryk-text2)' }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><Barbell size={13} weight="light" color="var(--vert-foret)" /> {exoCount} exercice{exoCount > 1 ? 's' : ''}</span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><Clock size={13} weight="light" color="var(--vert-foret)" /> ~{durationMin} min</span>
        </div>
        <button onClick={() => openSession(s.id)} style={{
          background: isPrimary ? 'var(--bordeaux)' : 'transparent',
          color: isPrimary ? '#fff' : 'var(--vert-foret)',
          border: isPrimary ? 'none' : '1.5px solid var(--vert-foret)',
          borderRadius: 'var(--ostryk-pill-radius)', padding: '12px', fontSize: 14, fontWeight: 700, cursor: 'pointer', width: '100%',
        }}>
          {(isDone || recurringMet) ? '✓ Lancer la séance' : 'Lancer la séance'}
        </button>
      </div>
    )
  }

  // Un compte gratuit n'entendait parler d'abonnement qu'au moment précis où il butait sur la
  // limite de séances d'un programme libre-service — autant dire presque jamais. Bandeau permanent
  // mais volontairement fin (une ligne), placé sous la semaine : la séance du jour reste en tête.
  const showUpsellBanner = !isCoachView && !athlete?.is_coach && athlete?.subscription_status !== 'active' && !!onOpenSubscription

  // Semaine de l'accueil (lundi → dimanche). Pas de calendrier daté en base : on y range
  //  - les séances validées cette semaine, au jour de leur validation (completed_at) ;
  //  - la prochaine séance de chaque programme (programEntries), sur son jour prévu s'il tombe plus
  //    tard dans la semaine, sinon AUJOURD'HUI — une séance en retard n'est jamais "manquée", elle
  //    reste à faire maintenant (même règle que l'ancienne carte "Séance du jour").
  // Les séances récurrentes, hors calendrier, gardent leur propre encart plus bas.
  const semaineDates = joursDeLaSemaine()
  const todayIdx = semaineDates.indexOf(isoLocal(new Date()))
  const toSeance = (s, prog, faite) => {
    const nbExos = (s.exercises || []).filter(e => e.name).length
    const exosLabel = `${nbExos} exercice${nbExos > 1 ? 's' : ''}`
    const libre = !!prog.title?.startsWith('Séance libre')
    return {
      id: s.id,
      titre: s.title || 'Séance',
      type: typeSeance(s, prog),
      faite,
      programme: libre ? null : prog.title,
      meta: faite ? exosLabel : `≈ ${estimateDurationMin(s.exercises)} minutes · ${exosLabel}`,
      blocs: faite ? [] : blocsSeance(s.exercises),
      decalable: !libre && !isCoachView && !!onPostponeSession,
      is_coached: !!s.is_coached,
    }
  }
  const semaine = semaineDates.map(date => ({ date, seances: [] }))
  programs.forEach(prog => prog.sessions.forEach(s => {
    if (s.session_type === 'recurrent' || s.hidden || !isValidated(s) || !completionDates[s.id]) return
    const idx = semaineDates.indexOf(isoLocal(new Date(completionDates[s.id])))
    if (idx !== -1) semaine[idx].seances.push(toSeance(s, prog, true))
  }))
  programEntries.forEach(({ session, program, dayKey }) => {
    const idx = dayKey != null && dayKey > todayIdx ? dayKey : todayIdx
    semaine[idx].seances.push(toSeance(session, program, false))
  })

  // Coach qui prévisualise un vrai client : ni objectifs ni ajout (voir le commentaire plus bas sur
  // isCoachView) — sur son propre profil sportif, ce sont bien ses objectifs.
  const showObjectivesRail = (!isCoachView || athlete?.is_coach) && !!athlete?.id
  const objectifs = showObjectivesRail
    ? (objectives || []).filter(o => !o.completed_at).map(o => ({ id: o.id, titre: o.text, date: o.target_date || null }))
    : []
  const prenom = (athlete?.name || '').trim().split(/\s+/)[0] || null

  return (
    <>
      <AccueilClient
        athlete={athlete ? { prenom, is_1to1_client: !!athlete.is_1to1_client } : null}
        objectifs={objectifs}
        semaine={semaine}
        programmes={catalogue.slice(0, 6).map(p => ({
          id: p.id,
          titre: p.title,
          sousTitre: `${p.sessionCount} séance${p.sessionCount > 1 ? 's' : ''}`,
        }))}
        onCommencerSeance={s => openSession(s.id)}
        onOuvrirSeance={s => openSession(s.id)}
        onDecalerSeance={onPostponeSession && !isCoachView ? s => setPostponeTarget(s) : null}
        onAjouterObjectif={showObjectivesRail ? () => setShowObjectives(true) : null}
        onOuvrirObjectifs={showObjectivesRail ? () => setShowObjectives(true) : null}
        onOuvrirProgramme={() => setActiveTab?.('templates')}
      >
        <div style={{ padding: '0 14px 16px', display: 'flex', flexDirection: 'column', gap: 24 }}>
          {showUpsellBanner && (
            <button onClick={onOpenSubscription} style={{
              display: 'flex', alignItems: 'center', gap: 9, width: '100%', textAlign: 'left',
              background: 'var(--card-white)', border: '1px solid var(--ostryk-border)', borderRadius: 14,
              padding: '10px 14px', cursor: 'pointer', fontFamily: 'inherit',
            }}>
              <span style={{ display: 'flex', flexShrink: 0, color: 'var(--bordeaux)' }}><LockSimpleOpen size={17} weight="light" /></span>
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: 'block', fontSize: 12.5, fontWeight: 700, color: 'var(--bordeaux)', lineHeight: 1.25 }}>
                  Tu es en accès gratuit
                </span>
                <span style={{ display: 'block', fontSize: 11.5, color: '#625B50', lineHeight: 1.3 }}>
                  Débloque tous les programmes
                </span>
              </span>
              <CaretRight size={13} weight="bold" color="var(--vert-foret)" style={{ flexShrink: 0 }} />
            </button>
          )}

          {recurringDisplayEntries.length > 0 && (
            <div>
              <h2 style={titreSection}>Séance récurrente</h2>
              {recurringDisplayEntries.length === 1 ? (
                renderDayCard(recurringDisplayEntries[0], false)
              ) : (
                <SwipeCarousel activeColor="var(--bordeaux)" peek slides={recurringDisplayEntries.map((entry, i) => ({
                  key: entry.session.id,
                  content: (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: '#625B50', textAlign: 'center' }}>
                        {i + 1}/{recurringDisplayEntries.length}
                      </div>
                      {renderDayCard(entry, false)}
                    </div>
                  ),
                }))} />
              )}
            </div>
          )}

          {pastEntries.length > 0 && (
            <div>
              <h2 style={{ ...titreSection, display: 'flex', alignItems: 'center', gap: 5 }}>
                <ClockCounterClockwise size={13} weight="light" /> Séances passées
              </h2>
              <div style={{ background: 'var(--card-white)', borderRadius: 20, overflow: 'hidden' }}>
                {visiblePast.map((entry, i) => (
                  <button key={entry.session.id} onClick={() => openSession(entry.session.id)} style={{
                    display: 'flex', alignItems: 'center', gap: 10, width: '100%', textAlign: 'left',
                    background: 'none', border: 'none', borderTop: i > 0 ? '1px solid var(--ostryk-border)' : 'none',
                    padding: '12px 16px', cursor: 'pointer', fontFamily: 'inherit',
                  }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--bordeaux)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {entry.session.title || 'Séance'}
                      </div>
                      <div style={{ fontSize: 11, color: '#625B50', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {[
                          entry.date ? new Date(entry.date).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }) : null,
                          entry.program.title,
                        ].filter(Boolean).join(' · ')}
                      </div>
                    </div>
                    {entry.skipped && (
                      <span style={{ fontSize: 10, fontWeight: 700, color: '#625B50', border: '1px solid var(--ostryk-border)', borderRadius: 20, padding: '2px 7px', flexShrink: 0 }}>Non faite</span>
                    )}
                    <CaretRight size={14} weight="bold" color="var(--vert-foret)" style={{ flexShrink: 0 }} />
                  </button>
                ))}
                {pastEntries.length > 5 && (
                  <button onClick={() => setShowAllPast(v => !v)} style={{
                    background: 'none', border: 'none', borderTop: '1px solid var(--ostryk-border)', width: '100%',
                    padding: '12px 16px', fontSize: 12, fontWeight: 700, color: 'var(--vert-foret)', cursor: 'pointer', fontFamily: 'inherit',
                  }}>
                    {showAllPast ? 'Réduire' : `Voir tout (${pastEntries.length})`}
                  </button>
                )}
              </div>
            </div>
          )}

          {noteBlocks.map(b => (
            <div key={b.id} style={{ background: 'var(--card-white)', borderRadius: 20, overflow: 'hidden' }}>
              {b.title && (
                <div style={{ padding: '14px 16px 0' }}>
                  <h2 style={{ ...styleLibelleSection, fontWeight: 400 }}>{b.title}</h2>
                </div>
              )}
              {b.content && (
                <div className="font-editorial" style={{ padding: '10px 16px 16px', fontSize: 14, color: 'var(--text)', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{b.content}</div>
              )}
            </div>
          ))}

          {leaderGroups.map(g => (
            <div key={g.id}>
              <h2 style={{ ...titreSection, display: 'flex', alignItems: 'center', gap: 6 }}>
                <UsersThree size={14} /> {g.name}
              </h2>
              <div style={{ background: 'var(--card-white)', borderRadius: 20, overflow: 'hidden' }}>
                {g.sessions.map((s, i) => (
                  <div key={s.id} style={{
                    display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', borderTop: i > 0 ? '1px solid var(--ostryk-border)' : 'none',
                  }}>
                    <span style={{ flex: 1, fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>{s.title || 'Séance'}</span>
                    {g.canLaunch && (
                      <button onClick={() => router.push(`/s/${token}/groupe/${s.id}`)} style={{
                        background: s.ranToday ? 'var(--bg2)' : 'var(--green)', color: s.ranToday ? 'var(--text2)' : '#fff',
                        border: s.ranToday ? '1px solid var(--border2)' : 'none', borderRadius: 20, padding: '6px 12px',
                        fontSize: 12, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0,
                      }}>
                        <Play size={11} weight="fill" />{s.ranToday ? 'Modifier' : 'Lancer'}
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}

          {programs.length === 0 && (
            <div style={{ textAlign: 'center', color: '#625B50', padding: '32px 20px', borderRadius: 20, background: 'var(--card-white)' }}>
              <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 12 }}><ClipboardText size={32} weight="light" /></div>
              <div style={{ fontFamily: 'var(--font-title)', fontSize: 18, color: 'var(--text)', marginBottom: 4 }}>Aucun programme actif</div>
              {!isCoachView && (
                <>
                  <div style={{ fontSize: 13, marginBottom: 16 }}>Sélectionne ton premier programme pour commencer.</div>
                  <button onClick={() => setActiveTab?.('templates')} style={{
                    background: 'var(--vert-foret)', color: '#F5EFE6', border: 'none', borderRadius: 12,
                    height: 48, padding: '0 20px', fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
                  }}>
                    Choisir un programme
                  </button>
                </>
              )}
            </div>
          )}

          {boardPrograms.length === 0 && programs.length > 0 && (
            <div style={{ textAlign: 'center', color: '#625B50', fontSize: 13 }}>
              Aucun programme épinglé au tableau de bord
            </div>
          )}
        </div>
      </AccueilClient>

      {showObjectives && (
        <div onClick={() => setShowObjectives(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 1200, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
          <div onClick={e => e.stopPropagation()} role="dialog" aria-label="Mes objectifs" style={{
            background: 'var(--bg2)', width: '100%', maxWidth: 480, maxHeight: '85svh', overflowY: 'auto',
            borderRadius: '20px 20px 0 0', padding: '18px 16px calc(24px + env(safe-area-inset-bottom, 0px))',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', marginBottom: 14 }}>
              <h2 style={{ ...styleLibelleSection, fontWeight: 400, flex: 1 }}>Mes objectifs</h2>
              <button onClick={() => setShowObjectives(false)} style={{ background: 'none', border: 'none', color: '#625B50', fontSize: 13, height: 44, padding: '0 4px', cursor: 'pointer', fontFamily: 'inherit' }}>
                Fermer
              </button>
            </div>
            <ObjectivesBlock athleteId={athlete.id} objectives={objectives} setObjectives={setObjectives} isCoach={false} bare />
          </div>
        </div>
      )}

      {postponeTarget && (
        <div onClick={() => setPostponeTarget(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 1200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div onClick={e => e.stopPropagation()} role="dialog" aria-label="Décaler la séance" style={{ background: 'var(--card-white)', borderRadius: 20, padding: 20, maxWidth: 320, width: '100%' }}>
            <div style={{ fontFamily: 'var(--font-title)', fontSize: 18, marginBottom: 4 }}>Décaler « {postponeTarget.titre} »</div>
            <div style={{ fontSize: 13, color: '#625B50', marginBottom: 14 }}>De combien de séances veux-tu la repousser dans ton programme ?</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {[1, 2, 3].map(n => (
                <button key={n} onClick={() => { onPostponeSession(postponeTarget.id, n); setPostponeTarget(null) }} style={{
                  height: 46, borderRadius: 12, border: '1px solid #D9CFC1', background: 'none', fontSize: 14, color: 'var(--text)', cursor: 'pointer', fontFamily: 'inherit',
                }}>
                  {n} séance{n > 1 ? 's' : ''} plus tard
                </button>
              ))}
              <button onClick={() => setPostponeTarget(null)} style={{ height: 44, background: 'none', border: 'none', color: '#625B50', fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>
                Annuler
              </button>
            </div>
          </div>
        </div>
      )}

      {!isCoachView && dayPickerProgram && onUpdateProgramDays && (
        <ChooseDaysModal
          program={dayPickerProgram}
          objectives={objectives}
          onSave={async (days) => {
            await onUpdateProgramDays(dayPickerProgram.id, days)
          }}
          onDismiss={() => setDismissedDayPickerIds(prev => new Set(prev).add(dayPickerProgram.id))}
        />
      )}
    </>
  )
}
