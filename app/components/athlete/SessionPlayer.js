'use client'

import { useState, useEffect, useRef } from 'react'
import { CaretLeft, X, Play, Timer, Check } from '@phosphor-icons/react'
import Toast from '@/app/components/Toast'
import TempoBadge from '@/app/components/TempoBadge'

// Dupliqué depuis app/s/[token]/page.js (mêmes petites fonctions pures utilisées pour le même champ
// `rest`/vidéos YouTube) — composant volontairement autonome plutôt qu'un import cross-fichier
// vers un fichier de 2600+ lignes non pensé comme lib partagée (même convention que
// SessionBlockEditor.js/app/programs/.../page.js dans ce repo).
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

// Empêche l'écran de s'éteindre pendant la séance — surtout utile pendant un repos où l'athlète ne
// touche pas l'écran, il n'a alors plus à le rallumer manuellement à chaque tour. Se ré-acquiert
// automatiquement si l'app revient au premier plan après une mise en veille (le wake lock est
// relâché par le système dès que l'onglet passe en arrière-plan, contrairement à un simple minuteur).
function useKeepAwake(active) {
  useEffect(() => {
    let lock = null
    let cancelled = false
    async function acquire() {
      try {
        if (active && 'wakeLock' in navigator) lock = await navigator.wakeLock.request('screen')
      } catch (e) {
        // Wake lock indisponible (navigateur non supporté, onglet en arrière-plan...) — on continue sans.
      }
    }
    acquire()
    const onVisible = () => { if (document.visibilityState === 'visible' && !cancelled) acquire() }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      cancelled = true
      document.removeEventListener('visibilitychange', onVisible)
      if (lock) lock.release().catch(() => {})
    }
  }, [active])
}

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

// Regroupe la liste à plat des exercices en blocs (exercice seul, ou groupe superset entier) —
// même principe que le carrousel de blocs de l'éditeur coach (app/programs/[athleteId]/
// [programId]/page.js), réécrit ici sur la forme de données du côté athlète.
function computeBlocks(exos) {
  const blocks = []
  let i = 0
  while (i < exos.length) {
    const g = exos[i].superset_group
    if (!g) { blocks.push({ type: 'solo', exos: [exos[i]] }); i++; continue }
    let j = i
    while (j < exos.length && exos[j].superset_group === g) j++
    blocks.push({ type: 'superset', exos: exos.slice(i, j) })
    i = j
  }
  return blocks
}

// Nombre de séries déjà validées (reps_done rempli) en tête de liste. Les sets sont créés et
// remplis dans l'ordre (set_index, voir ensureExerciseSets/handleValidate côté page.js), donc un
// simple compte de tête suffit à retrouver où l'athlète s'était arrêté — utilisé pour resynchroniser
// blockIndex/validatedCount/round sur les données déjà en base (jamais perdues) plutôt que sur un
// simple useState (lui, perdu) quand le WebView mobile recharge toute la page en repassant au
// premier plan : voir SessionPlayer, SingleExerciseScreen, SupersetScreen ci-dessous.
function countValidatedSets(sets) {
  let n = 0
  for (const s of sets) {
    if (s.reps_done == null || s.reps_done === '') break
    n++
  }
  return n
}

// Bannière de repos discrète (par opposition à TimerModal, plein écran, utilisé ailleurs dans
// l'app et inchangé) — décompte local, appelle onDone automatiquement à 0 : c'est ce callback
// qui fait avancer le player sans action de l'utilisateur (retour auto sur A1 en super série).
function RestBanner({ seconds, onDone }) {
  const [remaining, setRemaining] = useState(seconds)
  const onDoneRef = useRef(onDone)
  useEffect(() => { onDoneRef.current = onDone })

  const finish = () => {
    try { navigator.vibrate?.([120, 60, 120]) } catch (e) { /* vibration indisponible, tant pis */ }
    onDoneRef.current?.()
  }

  // seconds ne change jamais sur une instance donnée (RestBanner est toujours remonté à neuf pour
  // chaque repos, jamais réutilisé pour un décompte différent) — décompte lancé une seule fois au montage.
  useEffect(() => {
    if (!seconds || seconds <= 0) { onDoneRef.current?.(); return }
    const interval = setInterval(() => {
      setRemaining(r => {
        if (r <= 1) { clearInterval(interval); finish(); return 0 }
        return r - 1
      })
    }, 1000)
    return () => clearInterval(interval)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div style={{
      background: 'var(--vert-foret)', color: '#fff', borderRadius: 'var(--ostryk-card-radius)',
      padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700, fontSize: 14,
    }}>
      <Timer size={16} weight="light" />
      <span style={{ flex: 1 }}>Repos : {remaining}s</span>
      <button onClick={() => setRemaining(r => r + 15)} style={{
        background: 'rgba(255,255,255,0.15)', border: 'none', color: '#fff', borderRadius: 'var(--ostryk-pill-radius)',
        fontSize: 12, fontWeight: 700, padding: '5px 10px', cursor: 'pointer',
      }}>
        +15s
      </button>
      <button onClick={() => onDoneRef.current?.()} style={{
        background: 'none', border: 'none', color: 'rgba(255,255,255,0.85)', fontSize: 12, textDecoration: 'underline',
        padding: '5px 4px', cursor: 'pointer',
      }}>
        passer
      </button>
    </div>
  )
}

function VideoThumbnail({ url }) {
  const [open, setOpen] = useState(false)
  const videoId = extractYouTubeId(url)
  const thumbSrc = videoId ? `https://img.youtube.com/vi/${videoId}/hqdefault.jpg` : null

  return (
    <>
      <button onClick={() => setOpen(true)} style={{
        position: 'relative', width: '100%', aspectRatio: '16/9', border: 'none', padding: 0, cursor: 'pointer',
        borderRadius: 'var(--ostryk-card-radius)', overflow: 'hidden', background: '#2D2620',
        backgroundImage: thumbSrc ? `url(${thumbSrc})` : undefined, backgroundSize: 'cover', backgroundPosition: 'center',
      }}>
        <span style={{
          position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
          width: 56, height: 56, borderRadius: '50%', background: 'rgba(255,255,255,0.9)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#2D2620',
        }}>
          <Play size={22} weight="fill" />
        </span>
      </button>
      {open && videoId && (
        <div onClick={() => setOpen(false)} style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,.8)', zIndex: 800,
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
        }}>
          <div onClick={e => e.stopPropagation()} style={{ width: '100%', maxWidth: 560, background: '#000', borderRadius: 'var(--ostryk-card-radius)', overflow: 'hidden', position: 'relative' }}>
            <button onClick={() => setOpen(false)} style={{ position: 'absolute', top: 8, right: 8, zIndex: 2, background: 'rgba(0,0,0,.6)', color: '#fff', border: 'none', borderRadius: '50%', width: 32, height: 32, cursor: 'pointer' }}><X size={16} /></button>
            <div style={{ position: 'relative', paddingTop: '56.25%' }}>
              {/* Pas d'autoplay ici — contrairement à VideoButton (ouvert depuis l'écran de
                  préparation, inchangé), le player lance la vidéo seulement au tap. */}
              <iframe src={`https://www.youtube.com/embed/${videoId}`} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', border: 'none' }}
                allow="autoplay; encrypted-media; picture-in-picture" allowFullScreen />
            </div>
          </div>
        </div>
      )}
      {open && !videoId && (
        <div onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', zIndex: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <a href={url} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 'var(--r)', padding: '12px 20px', fontWeight: 700 }}>Ouvrir la vidéo ↗</a>
        </div>
      )}
    </>
  )
}

// Le tap sur la valeur centrale ouvre un pavé numérique (onOpenPad, optionnel) pour une saisie
// précise directe — plus rapide que d'incrémenter au pas quand l'écart avec la valeur voulue est
// grand (ex: passer de 10 à 67,5 kg). Les boutons +/- restent la voie rapide pour un petit ajustement.
function Stepper({ label, value, onChange, step = 1, suffix = '', onOpenPad }) {
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--ostryk-text2)', textTransform: 'uppercase', letterSpacing: '0.3px' }}>{label}</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <button onClick={() => onChange(Math.max(0, value - step))} style={{
          width: 34, height: 34, borderRadius: '50%', border: `1px solid var(--ostryk-border-input)`, background: 'var(--card-white)',
          fontSize: 18, fontWeight: 700, color: 'var(--vert-foret)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>−</button>
        {onOpenPad ? (
          <button onClick={onOpenPad} style={{
            minWidth: 56, textAlign: 'center', fontFamily: 'var(--font-title)', fontSize: 20, fontWeight: 600, color: 'var(--text)',
            background: 'none', border: 'none', padding: 0, cursor: 'pointer',
          }}>
            {value}{suffix}
          </button>
        ) : (
          <div style={{ minWidth: 56, textAlign: 'center', fontFamily: 'var(--font-title)', fontSize: 20, fontWeight: 600, color: 'var(--text)' }}>
            {value}{suffix}
          </div>
        )}
        <button onClick={() => onChange(value + step)} style={{
          width: 34, height: 34, borderRadius: '50%', border: `1px solid var(--ostryk-border-input)`, background: 'var(--card-white)',
          fontSize: 18, fontWeight: 700, color: 'var(--vert-foret)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>+</button>
      </div>
    </div>
  )
}

// Pavé numérique pour une saisie directe (voir Stepper.onOpenPad) — decimal autorise la virgule
// (poids en kg), pas les reps (nombres entiers uniquement).
function NumericKeypad({ initialValue, decimal, onValidate, onClose }) {
  const [buf, setBuf] = useState('')
  const [error, setError] = useState('')
  const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', decimal ? ',' : '', '0', '←']

  const confirm = () => {
    const v = parseFloat(buf.replace(',', '.'))
    if (buf === '' || Number.isNaN(v)) { setError('Entre une valeur'); return }
    onValidate(v)
  }

  const keyStyle = {
    border: 'none', background: 'var(--beige)', borderRadius: 10, height: 44, fontSize: 17,
    color: 'var(--text)', cursor: 'pointer', fontFamily: 'inherit',
  }

  return (
    <div style={{ background: 'var(--card-white)', border: '1px solid var(--ostryk-border-input)', borderRadius: 'var(--ostryk-card-radius)', padding: 12 }}>
      <div style={{ fontFamily: 'var(--font-title)', fontSize: 22, textAlign: 'center', color: 'var(--bordeaux)', marginBottom: error ? 2 : 8 }}>
        {buf === '' ? initialValue : buf}
      </div>
      {error && <div style={{ fontSize: 12, color: '#A32D2D', textAlign: 'center', marginBottom: 8 }}>{error}</div>}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
        {keys.map((k, i) => k === '' ? <span key={i} /> : (
          <button key={i} type="button" style={keyStyle} onClick={() => {
            setError('')
            if (k === '←') setBuf(b => b.slice(0, -1))
            else setBuf(b => (b.length > 6 ? b : b + k))
          }}>
            {k}
          </button>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
        <button type="button" onClick={onClose} style={{ flex: 1, border: 'none', background: 'var(--beige)', color: 'var(--ostryk-text2)', borderRadius: 10, height: 44, fontSize: 14, cursor: 'pointer' }}>
          Annuler
        </button>
        <button type="button" onClick={confirm} style={{ flex: 2, border: 'none', background: 'var(--bordeaux)', color: '#fff', borderRadius: 10, height: 44, fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>
          Confirmer
        </button>
      </div>
    </div>
  )
}

// Corps commun exercice simple / membre d'une super série : vidéo, consigne, historique de
// séries, steppers, CTA. Le parent (SingleExerciseScreen / SupersetScreen) possède la machine à
// états (quelle série est courante, ce qui se passe après validation) — ce composant ne fait que
// remonter (reps, kg) au tap sur le CTA. Remonté à neuf par le parent (key sur exo.id + série
// courante) à chaque nouvelle série/exercice — pas d'effet de reset ici. initialReps/initialKg
// (fournis par le parent, voir lastValues) reprennent la valeur de la DERNIÈRE série validée sur
// cet exercice plutôt que de toujours retomber sur exo.reps/exo.kg (le plan prescrit) : en
// pratique le poids/les reps ne changent presque jamais d'une série à l'autre, donc revalider une
// série identique doit être un seul tap, pas une resaisie complète à chaque fois. Uniquement pour
// la toute première série (pas encore de valeur précédente), on retombe sur le plan du coach.
function ExerciseLogBody({ exo, totalSets, currentSetIndex, validatedCount, ctaLabel, onValidate, initialReps, initialKg }) {
  const [reps, setReps] = useState(() => initialReps ?? (parseInt(exo.reps, 10) || 10))
  const [kg, setKg] = useState(() => initialKg ?? (parseFloat(exo.kg) || 0))
  const [padField, setPadField] = useState(null) // 'reps' | 'kg' | null

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ fontFamily: 'var(--font-title)', color: 'var(--bordeaux)', fontWeight: 600, fontSize: 22, textAlign: 'center' }}>{exo.name}</div>

      {exo.video_url && <VideoThumbnail url={exo.video_url} />}

      <div style={{ textAlign: 'center' }}>
        <TempoBadge tempo={exo.set_details?.[currentSetIndex]?.tempo || null} />
      </div>

      {exo.note && (
        <div style={{ background: 'var(--card-white)', border: '1px solid var(--ostryk-border)', borderRadius: 'var(--ostryk-card-radius)', padding: '12px 14px', fontSize: 14, color: '#5A5348', whiteSpace: 'pre-wrap' }}>
          {exo.note}
        </div>
      )}

      {totalSets > 1 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {Array.from({ length: totalSets }, (_, i) => {
            const state = i < validatedCount ? 'done' : i === currentSetIndex ? 'current' : 'upcoming'
            return (
              <div key={i} style={{
                display: 'flex', alignItems: 'center', gap: 8, padding: '9px 12px', borderRadius: 'var(--r)',
                background: state === 'current' ? '#FBF3E7' : 'var(--card-white)',
                border: `1px solid ${state === 'current' ? '#F0DFC0' : 'var(--ostryk-border)'}`,
                opacity: state === 'upcoming' ? 0.5 : 1,
              }}>
                {state === 'done' ? (
                  <span style={{ display: 'flex', color: 'var(--vert-foret)' }}><Check size={14} weight="bold" /></span>
                ) : (
                  <span style={{ width: 14, display: 'inline-block' }} />
                )}
                <span style={{ fontSize: 13, fontWeight: 700, color: state === 'current' ? 'var(--bordeaux)' : 'var(--text)' }}>
                  Série {i + 1}
                </span>
              </div>
            )
          })}
        </div>
      )}

      <div style={{ display: 'flex', gap: 16, justifyContent: 'center' }}>
        <Stepper label="Reps" value={reps} onChange={setReps} onOpenPad={() => setPadField('reps')} />
        <Stepper label="Poids" value={kg} onChange={setKg} step={2.5} suffix=" kg" onOpenPad={() => setPadField('kg')} />
      </div>

      {padField && (
        <NumericKeypad
          initialValue={padField === 'reps' ? reps : kg}
          decimal={padField === 'kg'}
          onClose={() => setPadField(null)}
          onValidate={v => {
            if (padField === 'reps') setReps(Math.max(0, Math.round(v)))
            else setKg(Math.max(0, v))
            setPadField(null)
          }}
        />
      )}

      <button onClick={() => onValidate(reps, kg)} style={{
        background: 'var(--bordeaux)', color: '#fff', border: 'none', borderRadius: 'var(--ostryk-pill-radius)',
        padding: '15px', fontSize: 15, fontWeight: 700, cursor: 'pointer', width: '100%',
      }}>
        {ctaLabel}
      </button>
    </div>
  )
}

function PlayerHeader({ title, onBack, onClose }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 16px', borderBottom: '1px solid var(--ostryk-border)' }}>
      <button onClick={onBack} disabled={!onBack} style={{ background: 'none', border: 'none', display: 'flex', color: onBack ? 'var(--vert-foret)' : 'var(--ostryk-chip-border)', cursor: onBack ? 'pointer' : 'default', padding: 4 }}>
        <CaretLeft size={20} weight="light" />
      </button>
      <div style={{ flex: 1, textAlign: 'center', fontWeight: 700, fontSize: 13, color: 'var(--ostryk-text2)', textTransform: 'uppercase', letterSpacing: '0.4px' }}>{title}</div>
      <button onClick={onClose} style={{ background: 'none', border: 'none', display: 'flex', color: 'var(--vert-foret)', cursor: 'pointer', padding: 4 }}>
        <X size={20} weight="light" />
      </button>
    </div>
  )
}

// Séance : exécution d'un exercice simple, une série à la fois. Chaque série validée écrit
// immédiatement via onSaveExerciseSet (même table/queue offline que l'écran de préparation) ;
// un repos discret (RestBanner) s'affiche après chaque série tant que exo.rest est renseigné.
function SingleExerciseScreen({ exo, exerciseSets, onEnsureExerciseSets, onSaveExerciseSet, onSetSaved, blockLabel, onPrev, onNext, onExit }) {
  const totalSets = Math.max(1, parseInt(exo.sets, 10) || 1)
  const [validatedCount, setValidatedCount] = useState(() => Math.min(countValidatedSets(exerciseSets[exo.id] || []), totalSets))
  const [resting, setResting] = useState(false)
  const [lastValues, setLastValues] = useState(null)
  // Remonté à neuf par le parent (key=exo.id) à chaque nouveau bloc solo — validatedCount/resting
  // repartent donc déjà à 0/false sans effet de reset ; le ref ne sert qu'à éviter un double-appel
  // de provisionnement (React 18 strict mode invoque les effets deux fois en dev).
  const provisioned = useRef(false)

  useEffect(() => {
    if (provisioned.current) return
    provisioned.current = true
    if ((exerciseSets[exo.id] || []).length < totalSets) onEnsureExerciseSets(exo.id, totalSets)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const sets = exerciseSets[exo.id] || []

  const advance = () => {
    setResting(false)
    if (validatedCount + 1 >= totalSets) onNext()
  }

  const handleValidate = (reps, kg) => {
    const set = sets[validatedCount]
    if (set) {
      onSaveExerciseSet(exo.id, set.id, 'reps_done', String(reps))
      onSaveExerciseSet(exo.id, set.id, 'kg_done', String(kg))
    }
    setLastValues({ reps, kg })
    onSetSaved?.()
    setValidatedCount(c => c + 1)
    const restSeconds = parseRestSeconds(exo.rest)
    if (restSeconds) setResting(true)
    else advance()
  }

  return (
    <>
      <PlayerHeader title={blockLabel} onBack={onPrev} onClose={onExit} />
      <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>
        {resting ? (
          <RestBanner seconds={parseRestSeconds(exo.rest)} onDone={advance} />
        ) : (
          <ExerciseLogBody
            key={`${exo.id}:${validatedCount}`}
            exo={exo} totalSets={totalSets} currentSetIndex={validatedCount} validatedCount={validatedCount}
            ctaLabel="Valider la série" onValidate={handleValidate}
            initialReps={lastValues?.reps} initialKg={lastValues?.kg}
          />
        )}
      </div>
    </>
  )
}

// Super série : cycle A1 → A2 → … → repos → retour automatique sur A1, tour suivant. Aucune
// action requise pour repartir sur le tour suivant (RestBanner.onDone gère l'avance).
function SupersetScreen({ group, labels, exerciseSets, onEnsureExerciseSets, onSaveExerciseSet, onSetSaved, blockLabel, onPrev, onNext, onExit }) {
  const totalRounds = Math.max(1, parseInt(group[0]?.sets, 10) || 1)
  const [round, setRound] = useState(() => {
    const counts = group.map(exo => Math.min(countValidatedSets(exerciseSets[exo.id] || []), totalRounds))
    return Math.min(Math.min(...counts) + 1, totalRounds)
  })
  const [exoIdx, setExoIdx] = useState(() => {
    const counts = group.map(exo => Math.min(countValidatedSets(exerciseSets[exo.id] || []), totalRounds))
    const idx = counts.findIndex(c => c === Math.min(...counts))
    return idx === -1 ? 0 : idx
  })
  const [resting, setResting] = useState(false)
  // Une mémoire par exercice (A1/A2 n'ont pas le même poids/reps) — voir ExerciseLogBody.initialReps/initialKg.
  const [lastValuesByExo, setLastValuesByExo] = useState({})
  const provisioned = useRef(new Set())

  useEffect(() => {
    group.forEach(exo => {
      if (provisioned.current.has(exo.id)) return
      provisioned.current.add(exo.id)
      if ((exerciseSets[exo.id] || []).length < totalRounds) onEnsureExerciseSets(exo.id, totalRounds)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [group.map(e => e.id).join(',')])

  const exo = group[exoIdx]
  const isLastOfGroup = exoIdx === group.length - 1

  const advanceRound = () => {
    setResting(false)
    const nextRound = round + 1
    if (nextRound > totalRounds) { onNext(); return }
    setRound(nextRound)
    setExoIdx(0)
  }

  const handleValidate = (reps, kg) => {
    const sets = exerciseSets[exo.id] || []
    const set = sets[round - 1]
    if (set) {
      onSaveExerciseSet(exo.id, set.id, 'reps_done', String(reps))
      onSaveExerciseSet(exo.id, set.id, 'kg_done', String(kg))
    }
    setLastValuesByExo(prev => ({ ...prev, [exo.id]: { reps, kg } }))
    onSetSaved?.()
    if (!isLastOfGroup) { setExoIdx(i => i + 1); return }
    const restSeconds = Math.max(...group.map(e => parseRestSeconds(e.rest) || 0))
    if (restSeconds) setResting(true)
    else advanceRound()
  }

  if (!exo) return null

  return (
    <>
      <PlayerHeader title={`${blockLabel} · Tour ${round}/${totalRounds}`} onBack={onPrev} onClose={onExit} />
      <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ display: 'flex', gap: 10 }}>
          <div style={{ width: 4, borderRadius: 2, background: 'var(--bordeaux)', flexShrink: 0 }} />
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {group.map((e, i) => {
              const done = i < exoIdx
              const current = i === exoIdx
              return (
                <div key={e.id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{
                    width: 26, height: 26, borderRadius: '50%', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 11, fontWeight: 800, background: done ? 'var(--bordeaux)' : current ? 'var(--card-white)' : 'var(--beige)',
                    color: done ? '#fff' : current ? 'var(--bordeaux)' : 'var(--ostryk-text3)',
                    border: current ? '1.5px solid var(--bordeaux)' : 'none',
                  }}>
                    {labels[e.id] || i + 1}
                  </span>
                  <span style={{ fontSize: 13, fontWeight: current ? 700 : 600, color: current ? 'var(--text)' : 'var(--ostryk-text2)' }}>{e.name}</span>
                  {done && <span style={{ display: 'flex', color: 'var(--vert-foret)' }}><Check size={13} weight="bold" /></span>}
                </div>
              )
            })}
          </div>
        </div>

        {!isLastOfGroup && !resting && (
          <div style={{ fontSize: 12, color: 'var(--ostryk-text2)', fontStyle: 'italic', textAlign: 'center' }}>
            Pas de repos entre {labels[group[exoIdx].id]} et {labels[group[exoIdx + 1].id]} — enchaîne directement.
          </div>
        )}

        {resting ? (
          <RestBanner seconds={Math.max(...group.map(e => parseRestSeconds(e.rest) || 0))} onDone={advanceRound} />
        ) : (
          <ExerciseLogBody
            key={`${exo.id}:${round}`}
            exo={exo} totalSets={1} currentSetIndex={round - 1} validatedCount={0}
            ctaLabel={isLastOfGroup ? 'Valider — fin du tour, repos' : 'Valider'}
            onValidate={handleValidate}
            initialReps={lastValuesByExo[exo.id]?.reps} initialKg={lastValuesByExo[exo.id]?.kg}
          />
        )}
      </div>
    </>
  )
}

// Player d'exécution de séance — remplace la liste à plat pour le logging des exercices/super
// séries. Reçoit les mêmes fonctions d'écriture (avec queue offline) que l'écran de préparation
// (SessionCard) : aucune nouvelle logique de sauvegarde, seulement un nouvel enchaînement d'écrans.
export default function SessionPlayer({ session, exerciseSets, onEnsureExerciseSets, onSaveExerciseSet, onExit }) {
  useKeepAwake(true)
  const [toast, setToast] = useState(null)
  const exos = (session.exercises || []).filter(e => e.name)
  const labels = computeLabels(exos)
  const blocks = computeBlocks(exos)
  const isBlockDone = (block) => {
    if (block.type === 'solo') {
      const totalSets = Math.max(1, parseInt(block.exos[0].sets, 10) || 1)
      return countValidatedSets(exerciseSets[block.exos[0].id] || []) >= totalSets
    }
    const totalRounds = Math.max(1, parseInt(block.exos[0]?.sets, 10) || 1)
    return block.exos.every(exo => countValidatedSets(exerciseSets[exo.id] || []) >= totalRounds)
  }
  // Reprend sur le premier bloc pas encore entièrement validé plutôt que de toujours repartir de 0 —
  // ce qui permet à SessionPlayer de "résister" à un remount complet (WebView tuée puis recréée en
  // arrière-plan) en se resynchronisant sur les séries déjà en base, voir countValidatedSets ci-dessus.
  const [blockIndex, setBlockIndex] = useState(() => {
    const idx = blocks.findIndex(b => !isBlockDone(b))
    return idx === -1 ? Math.max(0, blocks.length - 1) : idx
  })

  if (blocks.length === 0) {
    return (
      <>
        <PlayerHeader title="Séance" onBack={null} onClose={onExit} />
        <div style={{ padding: 30, textAlign: 'center', color: 'var(--ostryk-text3)' }}>Aucun exercice dans cette séance.</div>
      </>
    )
  }

  const block = blocks[Math.min(blockIndex, blocks.length - 1)]
  const goPrev = blockIndex > 0 ? () => setBlockIndex(i => i - 1) : null
  const goNext = () => {
    if (blockIndex + 1 >= blocks.length) onExit()
    else setBlockIndex(i => i + 1)
  }

  if (block.type === 'solo') {
    return (
      <>
        <SingleExerciseScreen
          key={block.exos[0].id}
          exo={block.exos[0]}
          exerciseSets={exerciseSets} onEnsureExerciseSets={onEnsureExerciseSets} onSaveExerciseSet={onSaveExerciseSet}
          onSetSaved={() => setToast('✓ Série enregistrée')}
          blockLabel={`Exercice ${blockIndex + 1}/${blocks.length}`}
          onPrev={goPrev} onNext={goNext} onExit={onExit}
        />
        <Toast message={toast} show={!!toast} onDone={() => setToast(null)} position="top" />
      </>
    )
  }

  return (
    <>
      <SupersetScreen
        key={block.exos.map(e => e.id).join(',')}
        group={block.exos} labels={labels}
        exerciseSets={exerciseSets} onEnsureExerciseSets={onEnsureExerciseSets} onSaveExerciseSet={onSaveExerciseSet}
        onSetSaved={() => setToast('✓ Série enregistrée')}
        blockLabel="Super série"
        onPrev={goPrev} onNext={goNext} onExit={onExit}
      />
      <Toast message={toast} show={!!toast} onDone={() => setToast(null)} position="top" />
    </>
  )
}
