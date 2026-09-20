'use client'

import { useState, useEffect } from 'react'
import { ClipboardText, UsersThree, Play, Repeat, Barbell, Clock, CalendarBlank, CaretRight, ClockCounterClockwise } from '@phosphor-icons/react'
import { WEEK_DAYS } from '@/lib/weekDays'
import ObjectivesBlock from '@/app/components/ObjectivesBlock'
import SwipeCarousel from './SwipeCarousel'
import ChooseDaysModal from './ChooseDaysModal'

// Aucune durée réelle n'est connue avant d'avoir fait la séance (duration_minutes n'existe qu'en
// feedback post-séance) — estimation grossière à partir du nombre de séries prescrites, juste pour
// donner un ordre de grandeur sur la carte "Séance du jour".
function estimateDurationMin(exercises) {
  const base = 5
  const perExo = (exercises || []).filter(e => e.name).reduce((sum, e) => sum + (parseInt(e.sets, 10) || 3) * 1.5, 0)
  return Math.round(base + perExo)
}

// Page d'accueil : la séance du jour doit être visible immédiatement, sans scroll. "Objectifs"
// (déplacé depuis l'onglet Stats, qui garde le reste) et "Séance du jour" sont en tête.
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
  router, token, setActiveTab,
  recurringTodayCounts = {},
  athlete, objectives, setObjectives,
  onUpdateProgramDays,
}) {
  const [leaderGroups, setLeaderGroups] = useState([])
  // Programmes pour lesquels l'athlète a fermé le popup de choix de jours sans valider — masqué
  // seulement pour cette visite (pas persisté), il redemandera à la prochaine ouverture tant que
  // athlete_days_of_week reste vide.
  const [dismissedDayPickerIds, setDismissedDayPickerIds] = useState(new Set())
  const [showAllPast, setShowAllPast] = useState(false)

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

  return (
    <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
      {recurringDisplayEntries.length > 0 && (
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--ostryk-text2)', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: 8 }}>Séance récurrente</div>
          {recurringDisplayEntries.length === 1 ? (
            renderDayCard(recurringDisplayEntries[0], true)
          ) : (
            <SwipeCarousel activeColor="var(--bordeaux)" peek slides={recurringDisplayEntries.map((entry, i) => ({
              key: entry.session.id,
              content: (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--ostryk-text3)', textAlign: 'center' }}>
                    {i + 1}/{recurringDisplayEntries.length}
                  </div>
                  {renderDayCard(entry, i === 0)}
                </div>
              ),
            }))} />
          )}
        </div>
      )}

      {programEntries.length > 0 && (
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--ostryk-text2)', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: 8 }}>Séance du jour</div>
          {programEntries.length === 1 ? (
            renderDayCard(programEntries[0], recurringDisplayEntries.length === 0)
          ) : (
            <SwipeCarousel activeColor="var(--bordeaux)" peek slides={programEntries.map((entry, i) => ({
              key: entry.session.id,
              content: (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--ostryk-text3)', textAlign: 'center' }}>
                    {i + 1}/{programEntries.length}
                  </div>
                  {renderDayCard(entry, recurringDisplayEntries.length === 0 && i === 0)}
                </div>
              ),
            }))} />
          )}
        </div>
      )}

      {pastEntries.length > 0 && (
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--ostryk-text2)', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 5 }}>
            <ClockCounterClockwise size={13} weight="light" /> Séances passées
          </div>
          <div style={{ background: 'var(--card-white)', border: '1px solid var(--ostryk-border)', borderRadius: 'var(--ostryk-card-radius)', margin: '0 2px', overflow: 'hidden' }}>
            {visiblePast.map((entry, i) => (
              <button key={entry.session.id} onClick={() => openSession(entry.session.id)} style={{
                display: 'flex', alignItems: 'center', gap: 10, width: '100%', textAlign: 'left',
                background: 'none', border: 'none', borderTop: i > 0 ? '1px solid var(--ostryk-border)' : 'none',
                padding: '12px 14px', cursor: 'pointer', fontFamily: 'inherit',
              }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--bordeaux)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {entry.session.title || 'Séance'}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--ostryk-text3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {[
                      entry.date ? new Date(entry.date).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }) : null,
                      entry.program.title,
                    ].filter(Boolean).join(' · ')}
                  </div>
                </div>
                {entry.skipped && (
                  <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--ostryk-text3)', border: '1px solid var(--ostryk-border)', borderRadius: 20, padding: '2px 7px', flexShrink: 0 }}>Non faite</span>
                )}
                <CaretRight size={14} weight="bold" color="var(--vert-foret)" style={{ flexShrink: 0 }} />
              </button>
            ))}
            {pastEntries.length > 5 && (
              <button onClick={() => setShowAllPast(v => !v)} style={{
                background: 'none', border: 'none', borderTop: '1px solid var(--ostryk-border)', width: '100%',
                padding: '10px 14px', fontSize: 12, fontWeight: 700, color: 'var(--vert-foret)', cursor: 'pointer', fontFamily: 'inherit',
              }}>
                {showAllPast ? 'Réduire' : `Voir tout (${pastEntries.length})`}
              </button>
            )}
          </div>
        </div>
      )}

      {/* isCoachView (?coach=1) est vrai à la fois quand un coach prévisualise un VRAI client et
          quand il consulte son propre profil sportif via "Switch to athlete" (voir backHref dans
          app/s/[token]/page.js — même distinction déjà faite là-bas) : dans ce second cas ce sont
          bien ses objectifs perso, pas ceux d'un client, ils doivent rester visibles. Placé après
          Séance récurrente/Séance du jour (plutôt qu'en tête) pour que la séance à faire reste
          visible sans scroll — un objectif avec échéance ne doit pas la repousser sous la ligne
          de flottaison. */}
      {(!isCoachView || athlete?.is_coach) && athlete?.id && (
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--ostryk-text2)', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: 8 }}>Objectifs</div>
          <ObjectivesBlock athleteId={athlete.id} objectives={objectives} setObjectives={setObjectives} isCoach={false} bare />
        </div>
      )}

      {noteBlocks.map(b => (
        <div key={b.id} style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 'var(--rl)', overflow: 'hidden' }}>
          {b.title && (
            <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--border)' }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>{b.title}</span>
            </div>
          )}
          {b.content && (
            <div className="font-editorial" style={{ padding: 14, fontSize: 14, color: 'var(--text)', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{b.content}</div>
          )}
        </div>
      ))}

      {leaderGroups.map(g => (
        <div key={g.id} style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 'var(--rl)', overflow: 'hidden' }}>
          <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--border)', fontSize: 13, fontWeight: 700, color: 'var(--text2)', display: 'flex', alignItems: 'center', gap: 6 }}>
            <UsersThree size={14} /> {g.name}
          </div>
          {g.sessions.map(s => (
            <div key={s.id} style={{
              display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', borderBottom: '1px solid var(--border)',
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
      ))}

      {programs.length === 0 && (
        <div style={{ textAlign: 'center', color: 'var(--text3)', padding: '40px 20px', border: '1px dashed var(--border2)', borderRadius: 'var(--rl)', background: 'var(--bg)' }}>
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 12 }}><ClipboardText size={36} /></div>
          <div style={{ fontWeight: 600, color: 'var(--text)', marginBottom: 4 }}>Aucun programme actif</div>
          {!isCoachView && (
            <>
              <div style={{ fontSize: 13, marginBottom: 16 }}>Sélectionne ton premier programme pour commencer.</div>
              <button onClick={() => setActiveTab?.('templates')} style={{
                background: 'var(--green)', color: '#fff', border: 'none', borderRadius: 'var(--rl)',
                padding: '11px 20px', fontSize: 14, fontWeight: 700, cursor: 'pointer',
              }}>
                Choisir un programme
              </button>
            </>
          )}
        </div>
      )}

      {boardPrograms.length === 0 && programs.length > 0 && (
        <div style={{ textAlign: 'center', color: 'var(--text3)', padding: '20px', fontSize: 13 }}>
          Aucun programme épinglé au tableau de bord
        </div>
      )}

      {!isCoachView && dayPickerProgram && onUpdateProgramDays && (
        <ChooseDaysModal
          program={dayPickerProgram}
          onSave={async (days) => {
            await onUpdateProgramDays(dayPickerProgram.id, days)
          }}
          onDismiss={() => setDismissedDayPickerIds(prev => new Set(prev).add(dayPickerProgram.id))}
        />
      )}

    </div>
  )
}
