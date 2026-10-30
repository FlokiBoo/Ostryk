'use client'

import { useId, useRef, useState } from 'react'

// Courbe d'une mesure dans le temps (poids, tour de taille…) : un point par date de saisie, placé
// à sa vraie position dans le temps — trois pesées en une semaine puis rien pendant un mois doivent
// se voir comme telles, pas comme quatre points régulièrement espacés.
// Une seule série : pas de légende, le titre de la carte dit ce qui est tracé. Survol ou toucher :
// la valeur et la date du point le plus proche.

const jourMs = 86400000
const tempsDe = d => new Date(`${d}T12:00:00`).getTime()
const dateCourte = d => new Date(`${d}T12:00:00`).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })
const fmt = v => (Math.round(v * 10) / 10).toLocaleString('fr-FR')

// Bornes de l'axe vertical : arrondies, avec un peu d'air, et jamais un écart nul (une seule mesure,
// ou toujours la même valeur).
function bornes(valeurs) {
  let min = Math.min(...valeurs), max = Math.max(...valeurs)
  const marge = Math.max((max - min) * 0.15, Math.abs(max) * 0.01, 0.5)
  min -= marge; max += marge
  const pas = niceStep((max - min) / 3)
  return { min: Math.floor(min / pas) * pas, max: Math.ceil(max / pas) * pas, pas }
}

function niceStep(brut) {
  const p = Math.pow(10, Math.floor(Math.log10(brut)))
  const n = brut / p
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * p
}

export default function CourbeDatee({ points, unite = '', couleur = '#2D3A30', hauteur = 160, surface = '#FFFFFF', grille = '#EFE8DE', texte = '#625B50', compact = false }) {
  const [survol, setSurvol] = useState(null)
  const svgRef = useRef(null)
  const idTitre = useId()

  if (!points?.length) return null

  const largeur = 600
  const gauche = compact ? 8 : 40, droite = compact ? 8 : 14, haut = 12, bas = compact ? 8 : 24
  const valeurs = points.map(p => p.valeur)
  const { min, max, pas } = bornes(valeurs)
  const t0 = tempsDe(points[0].date)
  // Au moins une semaine de large : une mesure unique (ou deux le même jour) reste au milieu.
  const t1 = Math.max(tempsDe(points[points.length - 1].date), t0 + 7 * jourMs)
  const decalage = points.length === 1 ? 3.5 * jourMs : 0
  const x = d => gauche + ((tempsDe(d) + decalage - t0) / (t1 - t0)) * (largeur - gauche - droite)
  const y = v => haut + (1 - (v - min) / (max - min)) * (hauteur - haut - bas)

  const chemin = points.map((p, i) => `${i ? 'L' : 'M'}${x(p.date).toFixed(1)},${y(p.valeur).toFixed(1)}`).join(' ')
  const graduations = []
  for (let v = min; v <= max + pas / 2; v += pas) graduations.push(v)

  const pointer = (e) => {
    const rect = svgRef.current.getBoundingClientRect()
    const px = ((e.clientX - rect.left) / rect.width) * largeur
    let meilleur = 0
    points.forEach((p, i) => { if (Math.abs(x(p.date) - px) < Math.abs(x(points[meilleur].date) - px)) meilleur = i })
    setSurvol(meilleur)
  }

  const actif = survol !== null ? points[survol] : null
  const dernier = points[points.length - 1]

  return (
    <div style={{ position: 'relative' }}>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${largeur} ${hauteur}`}
        preserveAspectRatio="none"
        role="img"
        aria-labelledby={idTitre}
        onPointerMove={pointer}
        onPointerDown={pointer}
        onPointerLeave={() => setSurvol(null)}
        style={{ width: '100%', height: hauteur, display: 'block', touchAction: 'pan-y', cursor: 'crosshair' }}
      >
        <title id={idTitre}>{`${points.length} mesure${points.length > 1 ? 's' : ''}, dernière : ${fmt(dernier.valeur)} ${unite} le ${dateCourte(dernier.date)}`}</title>
        {!compact && graduations.map(v => (
          <g key={v}>
            <line x1={gauche} x2={largeur - droite} y1={y(v)} y2={y(v)} stroke={grille} strokeWidth="1" vectorEffect="non-scaling-stroke" />
          </g>
        ))}
        <path d={chemin} fill="none" stroke={couleur} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
        {actif ? (
          <line x1={x(actif.date)} x2={x(actif.date)} y1={haut} y2={hauteur - bas} stroke={grille} strokeWidth="1" vectorEffect="non-scaling-stroke" />
        ) : null}
      </svg>
      {/* Points et libellés en HTML par-dessus le SVG étiré (preserveAspectRatio="none") : des
          cercles SVG y deviendraient des ellipses et le texte serait déformé. */}
      <div aria-hidden="true" style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
        {points.map((p, i) => (
          <span key={p.date} style={{
            position: 'absolute', left: `${(x(p.date) / largeur) * 100}%`, top: y(p.valeur),
            width: i === survol || i === points.length - 1 ? 10 : 8, height: i === survol || i === points.length - 1 ? 10 : 8,
            transform: 'translate(-50%, -50%)', borderRadius: '50%', background: couleur, boxShadow: `0 0 0 2px ${surface}`,
          }} />
        ))}
        {!compact && graduations.map(v => (
          <span key={v} style={{ position: 'absolute', left: 0, top: y(v), transform: 'translateY(-50%)', fontSize: 10, color: texte, fontVariantNumeric: 'tabular-nums' }}>{fmt(v)}</span>
        ))}
        {!compact ? (
          <>
            <span style={{ position: 'absolute', left: `${(gauche / largeur) * 100}%`, bottom: 2, fontSize: 10, color: texte }}>{dateCourte(points[0].date)}</span>
            {points.length > 1 ? <span style={{ position: 'absolute', right: `${(droite / largeur) * 100}%`, bottom: 2, fontSize: 10, color: texte }}>{dateCourte(dernier.date)}</span> : null}
          </>
        ) : null}
        {actif ? (
          <span style={{
            position: 'absolute', top: 0,
            left: `${Math.min(Math.max((x(actif.date) / largeur) * 100, 12), 88)}%`, transform: 'translate(-50%, -100%)',
            background: '#2D2620', color: '#fff', borderRadius: 6, padding: '4px 8px', fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap',
          }}>
            {fmt(actif.valeur)} {unite} · {dateCourte(actif.date)}
          </span>
        ) : null}
      </div>
    </div>
  )
}
