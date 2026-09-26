'use client'

import { useState, useRef } from 'react'
import { FRONT_MUSCLES, BACK_MUSCLES, FRONT_VIEWBOX, BACK_VIEWBOX } from '@/app/data/bodyMap'
import { shareCardImage } from '@/lib/shareCard'
import { MUSCLE_GROUPS, COLOR_BY_GROUP } from './MuscleAnatomyDiagram'

const MUSCLE_MAP = {
  'pectoraux':       ['pec', 'poitrine', 'chest', 'pectoral'],
  'deltoïde-antérieur': ['delt', 'épaule', 'epaule', 'shoulder'],
  'deltoïde-latéral':   ['delt', 'épaule', 'epaule', 'shoulder'],
  'deltoïde-postérieur': ['delt', 'épaule', 'epaule', 'shoulder'],
  'cou':             ['cou', 'neck', 'cervical'],
  'biceps':          ['bicep', 'bras'],
  'abdominaux':      ['abdo', 'abs', 'core', 'gainage', 'ventre'],
  'obliques':        ['oblique', 'gainage latéral'],
  'quadriceps':      ['quad', 'quadricep', 'cuisse'],
  'adducteurs':      ['adducteur'],
  'trapèzes':        ['trap', 'trapèze', 'trapeze'],
  'grand dorsal':    ['dorsal', 'dorsaux', 'dos'],
  'triceps':         ['tricep', 'triceps'],
  'avant-bras':      ['avant-bras', 'avant bras', 'forearm', 'préhension', 'prehension', 'grip'],
  'lombaires':       ['lombaire', 'bas du dos', 'lower back', 'érecteur', 'erecteur'],
  'fessiers':        ['fessier', 'glute', 'fesse', 'glutéaux', 'rotateur', 'piriforme'],
  'ischio-jambiers': ['ischio', 'hamstring', 'ij'],
  'mollets':         ['mollet', 'calf', 'calves', 'gastro', 'soléaire', 'soleaire'],
  'tibial':          ['tibial', 'tibialis', 'jambier antérieur'],
  'psoas':           ['psoas', 'fléchisseur de hanche', 'flechisseur de hanche'],
  'pieds':           ['pied', 'foot', 'plantaire', 'voûte plantaire', 'voute plantaire'],
}

const CITATIONS = [
  { texte: "La douleur est temporaire. Abandonner dure pour toujours.", auteur: "Lance Armstrong" },
  { texte: "Je n'ai pas échoué. J'ai juste trouvé 10 000 façons qui ne fonctionnent pas.", auteur: "Thomas Edison" },
  { texte: "Impossible is nothing.", auteur: "Muhammad Ali" },
  { texte: "La différence entre l'impossible et le possible réside dans la détermination.", auteur: "Tommy Lasorda" },
  { texte: "Je ne perds jamais. Soit je gagne, soit j'apprends.", auteur: "Nelson Mandela" },
  { texte: "Ce que l'esprit peut concevoir et croire, il peut l'accomplir.", auteur: "Muhammad Ali" },
  { texte: "Les champions ne sont pas faits dans les salles de sport. Ils sont faits de ce qu'ils ont en eux.", auteur: "Muhammad Ali" },
  { texte: "La sueur, c'est de la graisse qui pleure.", auteur: "Anonyme" },
  { texte: "Le succès, c'est se relever une fois de plus que le nombre de fois où on est tombé.", auteur: "Winston Churchill" },
  { texte: "Je joue chaque match comme si c'était le dernier.", auteur: "Zinédine Zidane" },
  { texte: "Plus fort est celui qui se lève après chaque chute.", auteur: "Vince Lombardi" },
  { texte: "Le talent gagne des matchs, mais le travail d'équipe et l'intelligence gagnent des championnats.", auteur: "Michael Jordan" },
  { texte: "Il n'y a pas de raccourcis vers un endroit qui vaut le déplacement.", auteur: "Beverly Sills" },
  { texte: "Chaque matin tu as le choix. Continue à dormir avec tes rêves ou te lever et les réaliser.", auteur: "Anonyme" },
  { texte: "Ce n'est pas la montagne que nous conquérons, mais nous-mêmes.", auteur: "Edmund Hillary" },
  { texte: "Quelqu'un quelque part s'entraîne pendant que toi tu ne le fais pas. Quand vous vous rencontrez, il gagnera.", auteur: "Tom Fleming" },
  { texte: "La gloire n'est pas de ne jamais tomber, mais de se relever à chaque chute.", auteur: "Confucius" },
  { texte: "Je peux accepter l'échec, tout le monde échoue. Mais je ne peux pas accepter de ne pas essayer.", auteur: "Michael Jordan" },
  { texte: "Le secret, c'est de commencer.", auteur: "Mark Twain" },
  { texte: "Aujourd'hui tu as fait ce que d'autres ne feront jamais.", auteur: "Anonyme" },
  { texte: "Il m'a fallu 17 ans et 114 jours pour devenir une star en une nuit.", auteur: "Lionel Messi" },
  { texte: "Plus dure sera la lutte, plus grande sera la victoire.", auteur: "Thomas Paine" },
  { texte: "Repoussez vos limites ou elles vous repousseront.", auteur: "Anonyme" },
  { texte: "Si vous êtes nuls, vous avez intérêt à être fort.", auteur: "Anonyme" },
  { texte: "Échouer sans essayer, est-ce vraiment échouer ?", auteur: "Anonyme" },
  { texte: "Don't be average, chase excellence.", auteur: "Anonyme" },
]

export function randomCitation() {
  return CITATIONS[Math.floor(Math.random() * CITATIONS.length)]
}

export function parseMusclesFromText(text) {
  if (!text) return []
  const lower = text.toLowerCase()
  const active = new Set()
  for (const [group, keywords] of Object.entries(MUSCLE_MAP)) {
    if (keywords.some(k => lower.includes(k))) active.add(group)
  }
  return [...active]
}

const NEUTRAL = '#E8C9AE'
const STROKE  = '#C9A47E'

// Schéma anatomique adapté de "body-muscles" (Ivan Vulović, Apache 2.0)
// https://github.com/vulovix/body-muscles
// Même code couleur/numérotation que MuscleAnatomyDiagram (Tips) : chaque groupe travaillé
// garde sa couleur dédiée au lieu d'un simple surlignage binaire.
// secondary : groupes sollicités en second, même couleur atténuée. Exporté pour Seance.js.
export function BodySVG({ active, secondary = [], view, width = 130 }) {
  const isFront = view === 'front'
  const list = isFront ? FRONT_MUSCLES : BACK_MUSCLES
  const viewBox = isFront ? FRONT_VIEWBOX : BACK_VIEWBOX

  return (
    <svg viewBox={viewBox} style={{ width, height: 'auto' }}>
      {list.map(m => (
        <path
          key={m.id}
          d={m.path}
          fill={m.group && (active.includes(m.group) || secondary.includes(m.group)) ? (COLOR_BY_GROUP[m.group] || NEUTRAL) : NEUTRAL}
          fillOpacity={m.group && !active.includes(m.group) && secondary.includes(m.group) ? 0.4 : 1}
          stroke={STROKE}
          strokeWidth="0.15"
          strokeLinejoin="round"
        />
      ))}
      <text x={isFront ? 17.5 : 54.5} y="91.5" textAnchor="middle" fontSize="2.4" fill={STROKE} fontWeight="700" fontFamily="sans-serif" letterSpacing="0.3">
        {isFront ? 'AVANT' : 'ARRIÈRE'}
      </text>
    </svg>
  )
}

// citation : imposée par le coach quand il partage le récapitulatif d'une séance coachée (Seance.js,
// mode coach) ; sinon tirée au hasard.
export default function CelebrationModal({ tonnage, muscles, records = [], citation: citationImposee = null, onClose }) {
  const hasBody = muscles.length > 0
  const [citation] = useState(() => citationImposee || randomCitation())
  const [sharing, setSharing] = useState(false)
  const cardRef = useRef(null)

  const share = async () => {
    setSharing(true)
    await shareCardImage(cardRef.current, {
      filename: 'seance.png',
      title: 'Séance terminée 💪',
      text: tonnage > 0 ? `Séance terminée — ${tonnage.toLocaleString('fr-FR')} kg de tonnage 💪` : 'Séance terminée 💪',
    })
    setSharing(false)
  }

  return (
    <div
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16 }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{ background: 'var(--bg)', borderRadius: 20, padding: '24px 20px', maxWidth: 400, width: '100%', textAlign: 'center', boxShadow: '0 20px 60px rgba(0,0,0,0.4)', maxHeight: '92svh', overflowY: 'auto' }}
      >
      <div ref={cardRef}>
        <div style={{ fontSize: 52, lineHeight: 1, marginBottom: 8 }}>{records.length > 0 ? '🏆' : '🎉'}</div>
        <div style={{ fontFamily: 'var(--font-title)', color: 'var(--title)', fontSize: 23, fontWeight: 700, marginBottom: 4 }}>Bravo !</div>
        <div style={{ fontSize: 14, color: 'var(--text3)', marginBottom: 18 }}>Séance terminée 💪</div>

        {records.length > 0 && (
          <div style={{ background: 'linear-gradient(135deg, #FDE68A, #FCD34D)', border: '1px solid #F59E0B', borderRadius: 12, padding: '14px 16px', marginBottom: 18, textAlign: 'left' }}>
            <div style={{ fontSize: 12, fontWeight: 800, color: '#92400E', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 8 }}>
              🏆 Nouveau{records.length > 1 ? 'x' : ''} record{records.length > 1 ? 's' : ''} !
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {records.map((r, i) => (
                <div key={i} style={{ fontSize: 14, fontWeight: 700, color: '#78350F' }}>
                  {r.name} — {r.label}
                </div>
              ))}
            </div>
          </div>
        )}

        <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 12, padding: '14px 16px', marginBottom: tonnage > 0 ? 18 : 8, textAlign: 'left' }}>
          <div style={{ fontSize: 14, color: 'var(--text)', lineHeight: 1.6, fontStyle: 'italic', marginBottom: 8 }}>
            « {citation.texte} »
          </div>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--green)' }}>— {citation.auteur}</div>
        </div>

        {tonnage > 0 && (
          <div style={{ background: 'var(--green-light)', border: '1px solid #B8EAD8', borderRadius: 12, padding: '12px 16px', marginBottom: 18 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--green)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 4 }}>
              Tonnage de la séance
            </div>
            <div style={{ fontSize: 30, fontWeight: 800, color: 'var(--green)' }}>
              {tonnage.toLocaleString('fr-FR')} <span style={{ fontSize: 16 }}>kg</span>
            </div>
          </div>
        )}

        {hasBody && (
          <>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 12 }}>
              Muscles travaillés
            </div>
            <div style={{ display: 'flex', justifyContent: 'center', gap: 12, marginBottom: 16 }}>
              <BodySVG active={muscles} view="front" />
              <BodySVG active={muscles} view="back" />
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'center', marginBottom: 18 }}>
              {MUSCLE_GROUPS.filter(g => muscles.includes(g.key)).map(g => (
                <span key={g.key} style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 20, padding: '3px 10px 3px 3px' }}>
                  <span style={{ width: 18, height: 18, borderRadius: '50%', background: g.color, color: '#fff', fontSize: 10, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    {g.n}
                  </span>
                  <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)' }}>{g.label}</span>
                </span>
              ))}
            </div>
          </>
        )}
      </div>

        <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
          <button
            onClick={share}
            disabled={sharing}
            style={{ flex: 1, background: 'var(--bg2)', color: 'var(--text)', border: '1px solid var(--border2)', borderRadius: 20, padding: '13px 0', fontSize: 15, fontWeight: 700, cursor: 'pointer' }}
          >
            {sharing ? '…' : '📤 Partager'}
          </button>
          <button
            onClick={onClose}
            style={{ flex: 2, background: 'var(--green)', color: '#fff', border: 'none', borderRadius: 20, padding: '13px 0', fontSize: 15, fontWeight: 700, cursor: 'pointer' }}
          >
            Super ! 💪
          </button>
        </div>
      </div>
    </div>
  )
}
