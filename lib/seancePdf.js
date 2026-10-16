// Fiche PDF d'une séance, à imprimer ou à garder hors de l'app : même contenu que ce que voit le
// sportif (échauffement, exercices et super séries, circuits, retour au calme), plus une colonne
// « Réalisé » vide par série pour noter ses charges au crayon. Partagée par l'éditeur coach
// (SessionBlockEditor) et l'espace sportif (SessionCard dans app/s/[token]/page.js).
//
// Entrée = la séance telle qu'en base, lue par l'appelant :
//   session    : ligne program_sessions — title, coach_notes, materiel, circuits
//   exercises  : lignes program_exercises (ordre d'affichage), anciens blocs warmup/cooldown compris
//   sections   : { echauffement, retourAuCalme } (lib/sectionsTexte.js, sectionDeSeance)
//   mouvements : { [movements.id]: { nom } } — noms des mouvements cités dans les sections
//   sousTitre  : ligne sous le titre (prénom du sportif, programme…)
//
// jsPDF est chargé à la demande : il ne pèse que sur le clic, pas sur chaque page.

import { PACE_BASES } from '@/lib/raceEstimates'
import { unitesDeSerie } from '@/lib/unitesSerie'
import { hasCardioSteps } from '@/lib/cardioSteps'

// Polices standard du PDF (Helvetica, encodage WinAnsi) : pas d'emoji ni de flèches. Plutôt que
// d'embarquer une police de 300 Ko, on remplace les quelques signes courants et on retire le reste.
const WINANSI_EXTRA = '€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ'
function propre(texte) {
  return String(texte ?? '')
    .replace(/Δ/g, 'Delta').replace(/[→⇒]/g, '->').replace(/≈/g, '~').replace(/[≤]/g, '<=').replace(/[≥]/g, '>=')
    .replace(/ | /g, ' ')
    .split('').filter(ch => ch.charCodeAt(0) <= 0xFF || WINANSI_EXTRA.includes(ch)).join('')
    .replace(/[ \t]{2,}/g, ' ').replace(/[ \t]+\n/g, '\n').trim()
}

const rempli = v => v !== null && v !== undefined && v !== ''
const nombre = v => String(v).replace('.', ',')

function grouperEnBlocs(exos) {
  const groupes = []
  let i = 0
  while (i < exos.length) {
    const g = exos[i].superset_group
    if (!g) { groupes.push([exos[i]]); i++; continue }
    let j = i
    while (j < exos.length && exos[j].superset_group === g) j++
    groupes.push(exos.slice(i, j))
    i = j
  }
  return groupes
}

// Prescription d'une série, en clair : "8-10 reps × 60 kg", "30 sec", "12 reps × 20 kg · tempo 3010".
function prescriptionSerie(e, k, unites) {
  const d = (Array.isArray(e.set_details) ? e.set_details[k] : null) || {}
  const reps = d.reps || (k === 0 ? e.reps : null)
  const kg = rempli(d.kg) ? d.kg : (k === 0 && rempli(e.kg) ? e.kg : null)
  const parts = [
    reps ? `${reps}${/^\d+([-–/]\d+)?$/.test(String(reps).trim()) ? ' reps' : ''}` : null,
    unites.includes('sec') && rempli(d.sec) ? `${nombre(d.sec)} sec` : null,
    rempli(kg) ? `${nombre(kg)} kg` : null,
  ].filter(Boolean)
  return { texte: parts.join(' × '), tempo: d.tempo || null }
}

function ligneCardio(e) {
  const base = PACE_BASES.find(b => b.key === e.pace_base)?.label
  if (!base || (e.pct_low == null && e.pct_high == null)) return null
  const pct = e.pct_low != null && e.pct_high != null && e.pct_low !== e.pct_high ? `${e.pct_low}–${e.pct_high}` : (e.pct_low ?? e.pct_high)
  return `Allure : ${pct} % ${base}`
}

function lignesStructureCardio(structure) {
  if (!hasCardioSteps(structure)) return []
  const duree = d => {
    if (!d || d.type === 'open') return 'libre'
    if (d.type === 'distance') return d.value >= 1000 ? `${nombre(d.value / 1000)} km` : `${d.value} m`
    const m = Math.floor((d.value || 0) / 60), s = (d.value || 0) % 60
    return m ? `${m} min${s ? ` ${s} s` : ''}` : `${s} s`
  }
  const cible = t => {
    const base = t && PACE_BASES.find(b => b.key === t.base)?.label
    if (!base) return ''
    const pct = t.pctLow != null && t.pctHigh != null && t.pctLow !== t.pctHigh ? `${t.pctLow}–${t.pctHigh}` : (t.pctLow ?? t.pctHigh)
    return pct != null ? ` à ${pct} % ${base}` : ''
  }
  return structure.blocks.flatMap(b => {
    const steps = (b.steps || []).map(st => `${st.name || 'Step'} : ${duree(st.duration)}${cible(st.target)}${st.note ? ` (${st.note})` : ''}`)
    if ((b.repeat || 1) > 1) return [`${b.repeat} fois :`, ...steps.map(s => `   ${s}`)]
    return steps
  })
}

async function chargerLogo() {
  try {
    const res = await fetch('/logo-ostryk-transparent.png')
    if (!res.ok) return null
    const blob = await res.blob()
    return await new Promise(resolve => {
      const r = new FileReader()
      r.onload = () => resolve(r.result)
      r.onerror = () => resolve(null)
      r.readAsDataURL(blob)
    })
  } catch {
    return null
  }
}

export async function genererSeancePdf({ session, exercises = [], sections = {}, mouvements = {}, sousTitre = '' }) {
  const { jsPDF } = await import('jspdf')
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  const L = 210, H = 297, M = 16, largeur = L - 2 * M
  const VERT = [27, 94, 72], BORDEAUX = [109, 26, 34], GRIS = [110, 110, 110], TRAIT = [215, 215, 215]
  let y = M

  const place = h => { if (y + h > H - M) { doc.addPage(); y = M } }
  const texte = (t, { taille = 10, style = 'normal', couleur = [20, 20, 20], retrait = 0, interligne = 1.35, apres = 0 } = {}) => {
    const s = propre(t)
    if (!s) return
    doc.setFont('helvetica', style).setFontSize(taille).setTextColor(...couleur)
    const lignes = doc.splitTextToSize(s, largeur - retrait)
    const h = taille * 0.3528 * interligne
    lignes.forEach(l => { place(h); doc.text(l, M + retrait, y + h * 0.75); y += h })
    y += apres
  }
  const titreSection = (t, couleur = VERT) => {
    place(14)
    y += 3
    doc.setFont('helvetica', 'bold').setFontSize(9).setTextColor(...couleur)
    doc.text(propre(t).toUpperCase(), M, y + 3)
    doc.setDrawColor(...couleur).setLineWidth(0.4).line(M, y + 5, M + largeur, y + 5)
    y += 9
  }

  // En-tête
  const logo = await chargerLogo()
  if (logo) doc.addImage(logo, 'PNG', L - M - 26, M - 4, 26, 20.4)
  texte(session.title || 'Séance', { taille: 20, style: 'bold', apres: 1 })
  if (sousTitre) texte(sousTitre, { taille: 10, couleur: GRIS })
  y = Math.max(y, M + 18) + 2

  if (session.coach_notes?.trim()) {
    titreSection('Le mot du coach')
    texte(session.coach_notes, { taille: 10, style: 'italic', couleur: [60, 60, 60], apres: 1 })
  }

  const materielExos = exercises.filter(e => e.materiel?.trim() && !['warmup', 'cooldown'].includes(e.block_type))
  if (session.materiel?.trim() || materielExos.length) {
    titreSection('Matériel à prévoir', BORDEAUX)
    if (session.materiel?.trim()) texte(session.materiel, { apres: 1 })
    materielExos.forEach(e => texte(`• ${e.name} : ${e.materiel}`))
  }

  const section = (sec) => {
    if (!sec || !(sec.contenu?.length || sec.videosLibres?.length)) return
    titreSection(sec.titre)
    sec.contenu.forEach(l => {
      if (l.mouvementId) {
        const nom = mouvements[l.mouvementId]?.nom || l.mouvementNom || 'Mouvement'
        texte(`• ${nom}${l.texte ? ` — ${l.texte}` : ''}`, { retrait: 2 })
      } else if (l.texte?.trim()) {
        texte(l.texte.replace(/\*\*/g, ''))
      } else {
        y += 2
      }
    })
    ;(sec.videosLibres || []).forEach(v => texte(`• ${v.nom}`, { retrait: 2 }))
  }

  section(sections.echauffement)

  const exos = exercises.filter(e => e.name && !['warmup', 'cooldown'].includes(e.block_type))
  const circuits = session.circuits || []
  const slot = c => Math.max(0, Math.min(c.afterExerciseIndex ?? 0, exos.length))
  const circuit = c => {
    titreSection(c.name || 'Circuit', [67, 56, 202])
    if (c.text) texte(c.text, { apres: 1 })
    ;(c.videos || []).filter(v => v.name).forEach(v => texte(`• ${v.name}`, { retrait: 2 }))
  }

  if (exos.length) titreSection('Séance')
  circuits.filter(c => slot(c) === 0).forEach(circuit)

  let vus = 0
  grouperEnBlocs(exos).forEach((groupe, gi) => {
    const superset = groupe.length > 1
    place(16)
    if (superset) {
      texte(`${gi + 1}. Super série — enchaîne ${groupe.length} exercices sans pause`, { taille: 11, style: 'bold', couleur: VERT, apres: 1 })
    }
    groupe.forEach((e, i) => {
      place(14)
      const numero = superset ? `${gi + 1}${String.fromCharCode(97 + i)}` : `${gi + 1}`
      texte(`${numero}. ${e.name}`, { taille: 12, style: 'bold', retrait: superset ? 3 : 0 })
      const retrait = superset ? 8 : 5
      const unites = unitesDeSerie(e.set_details)
      const nbSeries = parseInt(e.sets, 10) || 0
      const infos = [
        nbSeries ? `${nbSeries} série${nbSeries > 1 ? 's' : ''}` : null,
        e.rest && !superset ? `récup ${e.rest}` : null,
      ].filter(Boolean).join(' · ')
      if (infos) texte(infos, { taille: 9, couleur: GRIS, retrait })
      const cardio = ligneCardio(e)
      if (cardio) texte(cardio, { retrait })
      lignesStructureCardio(e.cardio_structure).forEach(l => texte(l, { taille: 9.5, retrait }))

      // Une ligne par série : prévu, puis une case vide pour noter ce qui a été fait. Une série
      // laissée vide par le coach reprend la précédente, comme dans l'écran de séance (Seance.js).
      if (nbSeries) {
        const h = 6.2, xPrevu = M + retrait + 16, xFait = M + largeur - 46
        let precedente = { texte: '', tempo: null }
        for (let k = 0; k < nbSeries; k++) {
          place(h)
          const lue = prescriptionSerie(e, k, unites)
          const p = lue.texte || lue.tempo ? lue : precedente
          precedente = p
          doc.setFont('helvetica', 'normal').setFontSize(9).setTextColor(...GRIS)
          doc.text(`Série ${k + 1}`, M + retrait, y + 4.3)
          doc.setTextColor(20, 20, 20).setFontSize(10)
          const prevu = propre([p.texte, p.tempo ? `tempo ${p.tempo}` : null].filter(Boolean).join(' · '))
          doc.text(doc.splitTextToSize(prevu || '—', xFait - xPrevu - 3)[0], xPrevu, y + 4.3)
          doc.setDrawColor(...TRAIT).setLineWidth(0.3).roundedRect(xFait, y + 0.6, 46, h - 1.2, 1, 1)
          y += h
        }
        y += 0.5
      }
      if (e.note?.trim()) texte(e.note, { taille: 9.5, style: 'italic', couleur: [70, 70, 70], retrait })
      y += 2
    })
    if (superset) {
      const repos = groupe.map(e => e.rest).find(Boolean)
      if (repos) texte(`Récup ${repos} entre les tours`, { taille: 9, couleur: GRIS, retrait: 3, apres: 2 })
    }
    vus += groupe.length
    circuits.filter(c => slot(c) === vus).forEach(circuit)
  })
  // Circuits placés au-delà du dernier exercice (index périmé après une suppression).
  circuits.filter(c => (c.afterExerciseIndex ?? 0) > exos.length && exos.length > 0).forEach(circuit)

  section(sections.retourAuCalme)

  // Pied de page sur chaque page
  const pages = doc.getNumberOfPages()
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p)
    doc.setFont('helvetica', 'normal').setFontSize(8).setTextColor(...GRIS)
    doc.text('OSTRYK · ostryk.fr', M, H - 8)
    doc.text(`${p} / ${pages}`, L - M, H - 8, { align: 'right' })
  }
  return doc.output('blob')
}

// Nom de fichier lisible : "seance-haut-du-corps.pdf".
export function nomFichierSeance(titre) {
  const base = (titre || 'seance').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60)
  return `${base || 'seance'}.pdf`
}

// Sur téléphone (et dans les apps iOS/Android, où un lien de téléchargement ne fait rien), la
// feuille de partage du système propose Enregistrer / Imprimer / Envoyer. Sinon, téléchargement.
export async function telechargerSeancePdf(params) {
  const blob = await genererSeancePdf(params)
  const nom = nomFichierSeance(params.session?.title)
  const fichier = typeof File !== 'undefined' ? new File([blob], nom, { type: 'application/pdf' }) : null
  const mobile = typeof navigator !== 'undefined' && /iPhone|iPad|iPod|Android/i.test(navigator.userAgent)
  if (mobile && fichier && navigator.canShare?.({ files: [fichier] })) {
    try {
      await navigator.share({ files: [fichier], title: params.session?.title || 'Séance' })
      return
    } catch (e) {
      if (e?.name === 'AbortError') return
    }
  }
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = nom
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
