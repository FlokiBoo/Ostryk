'use client'

import { useMemo, useRef, useState } from 'react'

/*
  Rendu client d'une section texte (échauffement, retour au calme) — SectionTexteVideo de la
  maquette Seance.jsx. Composant UNIQUE, utilisé à la fois par l'écran de séance du sportif
  (Seance.js), l'écran de préparation (SessionCard) et l'aperçu du coach à côté de l'éditeur
  (SessionBlockEditor) : ce que le coach voit est exactement ce que verra le client.

  - Carrousel des mouvements cités qui ont une vidéo (ordre des jetons, dédoublonné, dose en
    légende), suivi des vidéos de l'ancien format (sans mouvement). Vignette fixe : la vidéo ne se
    charge qu'au tap (onLireVideo).
  - "Le détail" : le texte tel que le coach l'a écrit ; un mouvement avec vidéo est cliquable et
    amène le carrousel sur sa vignette, et la ligne de la vignette affichée est surlignée.
    Mouvement sans vidéo : en noir, non cliquable ; disparu de la bibliothèque : son nom conservé.

  section     : { titre, contenu, videosLibres } (lib/sectionsTexte.js)
  mouvements  : { [id]: { id, nom, video_url } } — au moins les mouvements cités
  fait/onValider : validation de la section (écran de séance) ; sans onValider, lecture seule
  apercu      : aperçu coach — liste en plus les mouvements cités sans vidéo
*/

const T = {
  blanc: '#FFFFFF',
  bordeaux: '#6D1A22',
  vert: '#2D3A30',
  texte: '#2D2620',
  texteSec: '#625B50',
  texteCorps: '#5A5348',
  clair: '#F5EFE6',
  bleu: '#2F5D8C',
  bleuFond: '#EAF0F6',
  surligne: '#FBF3E7',
}
const LARGEUR_VIGNETTE = 208 // 200 + 8 de gouttière

function extractYouTubeId(url) {
  if (!url) return null
  const m = url.match(/(?:youtu\.be\/|youtube\.com\/(?:shorts\/|watch\?v=|embed\/))([a-zA-Z0-9_-]{6,})/)
  return m ? m[1] : null
}

const flecheStyle = (cote) => ({
  position: 'absolute', [cote]: 4, top: 64, transform: 'translateY(-50%)', width: 36, height: 36, borderRadius: '50%',
  border: 'none', background: 'rgba(255,255,255,0.94)', boxShadow: '0 2px 8px rgba(45,38,32,0.18)', color: T.vert,
  fontSize: 16, cursor: 'pointer',
})

export default function SectionTexteVideo({ section, mouvements = {}, fait = false, onValider = null, onLireVideo = () => {}, apercu = false }) {
  const rail = useRef(null)
  const [index, setIndex] = useState(0)
  const [detailOuvert, setDetailOuvert] = useState(true)
  const contenu = useMemo(() => section?.contenu || [], [section])

  // Vignettes : mouvements cités avec vidéo (dose = texte de leur première ligne), puis anciennes vidéos.
  const vignettes = useMemo(() => {
    const vus = new Set()
    const out = []
    contenu.forEach(l => {
      if (!l.mouvementId || vus.has(l.mouvementId)) return
      const m = mouvements[l.mouvementId]
      if (!m?.video_url) return
      vus.add(l.mouvementId)
      out.push({ cle: l.mouvementId, nom: m.nom, video_url: m.video_url, dose: l.texte || '' })
    })
    ;(section?.videosLibres || []).forEach((v, i) => out.push({ cle: `libre-${i}`, nom: v.nom, video_url: v.video_url, dose: '' }))
    return out
  }, [contenu, mouvements, section])

  const sansVideo = useMemo(() => [...new Set(contenu
    .filter(l => l.mouvementId && mouvements[l.mouvementId] && !mouvements[l.mouvementId].video_url)
    .map(l => mouvements[l.mouvementId].nom))], [contenu, mouvements])

  // Borné : dans l'aperçu coach, le contenu change à la frappe et une vignette peut disparaître.
  const courant = Math.min(index, Math.max(0, vignettes.length - 1))
  const aller = (i) => rail.current?.scrollTo({ left: Math.max(0, Math.min(vignettes.length - 1, i)) * LARGEUR_VIGNETTE, behavior: 'smooth' })

  if (!section) return null

  if (fait) {
    return (
      <div style={{ background: T.blanc, borderRadius: 12, padding: '10px 12px', display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ width: 20, height: 20, borderRadius: '50%', background: T.vert, color: T.blanc, fontSize: 11, display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}>✓</span>
        <span style={{ fontSize: 13, flex: 1 }}>{section.titre} terminé</span>
        {onValider ? (
          <button type="button" onClick={() => onValider(false)} style={{ background: 'none', border: 'none', color: T.texteSec, fontSize: 12, textDecoration: 'underline', height: 44, padding: '0 4px', cursor: 'pointer', fontFamily: 'inherit' }}>
            Revoir
          </button>
        ) : null}
      </div>
    )
  }

  return (
    <div>
      {vignettes.length > 0 ? (
        <>
          <div style={{ position: 'relative', margin: '0 -14px' }}>
            <div
              ref={rail}
              onScroll={e => setIndex(Math.min(vignettes.length - 1, Math.round(e.currentTarget.scrollLeft / LARGEUR_VIGNETTE)))}
              style={{ display: 'flex', gap: 8, overflowX: 'auto', scrollSnapType: 'x mandatory', padding: '0 14px', scrollbarWidth: 'none' }}
            >
              {vignettes.map((v, i) => {
                const id = extractYouTubeId(v.video_url)
                return (
                  <div key={v.cle} style={{ flex: 'none', width: 200, scrollSnapAlign: 'start', background: T.blanc, borderRadius: 14, padding: 8, marginRight: i === vignettes.length - 1 ? 14 : 0 }}>
                    <button type="button" onClick={() => onLireVideo({ nom: v.nom, video_url: v.video_url })} aria-label={`Lire la vidéo de ${v.nom}`} style={{
                      position: 'relative', display: 'block', width: '100%', height: 112, border: 'none', padding: 0, borderRadius: 10, overflow: 'hidden', cursor: 'pointer',
                      background: id ? `center/cover url(https://img.youtube.com/vi/${id}/hqdefault.jpg)` : 'linear-gradient(140deg,#5A5348,#2D2620)',
                    }}>
                      <span style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <span style={{ width: 38, height: 38, borderRadius: '50%', background: 'rgba(245,239,230,0.92)', color: T.bordeaux, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14 }}>▶</span>
                      </span>
                      <span style={{ position: 'absolute', left: 8, bottom: 8, background: 'rgba(45,38,32,0.6)', color: T.clair, borderRadius: 100, fontSize: 10, padding: '2px 8px' }}>
                        {i + 1}/{vignettes.length}
                      </span>
                    </button>
                    <p style={{ fontSize: 13, margin: '8px 4px 2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{v.nom}</p>
                    <p style={{ fontSize: 11, color: T.texteSec, margin: '0 4px', minHeight: 15 }}>{v.dose || '—'}</p>
                  </div>
                )
              })}
            </div>
            {courant > 0 ? <button type="button" aria-label="Vidéo précédente" onClick={() => aller(courant - 1)} style={flecheStyle('left')}>‹</button> : null}
            {courant < vignettes.length - 1 ? <button type="button" aria-label="Vidéo suivante" onClick={() => aller(courant + 1)} style={flecheStyle('right')}>›</button> : null}
          </div>
          <div style={{ display: 'flex', justifyContent: 'center', gap: 5, margin: '10px 0 12px' }} aria-hidden="true">
            {vignettes.map((v, k) => (
              <span key={v.cle} style={{ width: k === courant ? 16 : 6, height: 6, borderRadius: 100, background: k === courant ? T.bordeaux : '#C9BFB0' }} />
            ))}
          </div>
        </>
      ) : apercu ? (
        <p style={{ fontSize: 12, color: T.texteSec, textAlign: 'center', margin: '0 0 12px' }}>Aucun mouvement avec vidéo — pas de carrousel.</p>
      ) : null}

      {contenu.length > 0 || apercu ? (
        <div style={{ background: T.blanc, borderRadius: 14, padding: '12px 14px' }}>
          <button type="button" onClick={() => setDetailOuvert(o => !o)} aria-expanded={detailOuvert} style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', background: 'none', border: 'none', padding: 0,
            minHeight: 28, cursor: 'pointer', fontFamily: 'inherit',
          }}>
            <span style={{ fontFamily: 'var(--font-title)', fontSize: 12, color: T.bordeaux, letterSpacing: '0.04em' }}>Le détail</span>
            <span style={{ fontSize: 12, color: T.texteSec }}>{detailOuvert ? '▴' : '▾'}</span>
          </button>
          {detailOuvert ? (
            <div style={{ fontSize: 13, lineHeight: 1.75, marginTop: 10 }}>
              {contenu.length === 0 ? <span style={{ color: T.texteSec }}>Rien pour l&apos;instant.</span> : null}
              {contenu.map((ligne, i) => {
                if (!ligne.mouvementId) return <div key={i} style={{ color: T.texteCorps, minHeight: ligne.texte ? undefined : 12 }}>{ligne.texte}</div>
                const m = mouvements[ligne.mouvementId]
                const idx = vignettes.findIndex(v => v.cle === ligne.mouvementId)
                const actif = idx !== -1 && idx === courant && vignettes.length > 1
                return (
                  <div key={i} style={{ background: actif ? T.surligne : 'transparent', borderRadius: 6, margin: '0 -4px', padding: '0 4px', transition: 'background .2s' }}>
                    {m?.video_url ? (
                      <button type="button" onClick={() => aller(idx)} style={{ border: 'none', background: T.bleuFond, color: T.bleu, borderRadius: 6, padding: '1px 5px', font: 'inherit', fontWeight: 500, cursor: 'pointer' }}>
                        {m.nom}
                      </button>
                    ) : (
                      <span style={{ fontWeight: 500 }}>{m?.nom || ligne.mouvementNom || 'Mouvement'}</span>
                    )}{' '}
                    <span style={{ color: T.texteCorps }}>{ligne.texte}</span>
                  </div>
                )
              })}
            </div>
          ) : null}
        </div>
      ) : null}

      {apercu && sansVideo.length ? (
        <p style={{ fontSize: 11, color: T.texteSec, margin: '10px 0 0', lineHeight: 1.5 }}>
          Sans vidéo, donc absent du carrousel : {sansVideo.join(', ')}.
        </p>
      ) : null}

      {onValider ? (
        <button type="button" onClick={() => onValider(true)} style={{
          width: '100%', marginTop: 12, background: T.vert, color: T.clair, border: 'none', borderRadius: 12, height: 48, fontSize: 14,
          cursor: 'pointer', fontFamily: 'inherit',
        }}>
          {section.titre} terminé
        </button>
      ) : null}
    </div>
  )
}

// Fenêtre de lecture d'une vidéo (vignette de section ou exercice) : YouTube intégré, format
// vertical pour un Short ; lien externe pour toute autre URL. video : { nom, video_url }.
export function FenetreVideo({ video, onFermer }) {
  const id = extractYouTubeId(video.video_url)
  const vertical = video.video_url.includes('/shorts/')
  return (
    <div onClick={onFermer} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.8)', zIndex: 900, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      {id ? (
        <div onClick={e => e.stopPropagation()} style={{ width: '100%', maxWidth: vertical ? 340 : 560, background: '#000', borderRadius: 14, overflow: 'hidden', position: 'relative' }}>
          <button type="button" aria-label="Fermer la vidéo" onClick={onFermer} style={{ position: 'absolute', top: 8, right: 8, zIndex: 2, background: 'rgba(0,0,0,.6)', color: '#fff', border: 'none', borderRadius: '50%', width: 36, height: 36, cursor: 'pointer' }}>✕</button>
          <div style={{ position: 'relative', paddingTop: vertical ? '177.78%' : '56.25%' }}>
            <iframe title={video.nom} src={`https://www.youtube.com/embed/${id}`} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', border: 'none' }}
              allow="autoplay; encrypted-media; picture-in-picture" allowFullScreen />
          </div>
        </div>
      ) : (
        <a href={video.video_url} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 12, padding: '12px 20px', fontWeight: 600, color: T.texte }}>
          Ouvrir la vidéo ↗
        </a>
      )}
    </div>
  )
}
