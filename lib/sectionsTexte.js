// Échauffement et retour au calme d'une séance : modèle de contenu partagé par l'éditeur coach (à
// jetons #) et l'écran de séance du sportif.
//
// Une section = une liste ordonnée de lignes, stockée telle quelle en JSON sur la séance
// (program_sessions.warmup_content / cooldown_content, supabase/migrations/…_sections_texte.sql) :
//
//   [{ texte: "2 tours, sans forcer :" },
//    { mouvementId: "<uuid movements.id>", texte: "8 répétitions" },   // un jeton par ligne,
//    { texte: "Prends ton temps sur le deuxième." }]                    // texte = la dose
//
// Le jeton porte l'identifiant du mouvement, jamais son nom seul : renommer un mouvement ne casse
// aucune séance. Pas de HTML stocké : rendu éditeur et rendu client peuvent diverger sans migration.
// mouvementNom (facultatif) garde le nom au moment de l'écriture, pour un rendu de repli si le
// mouvement disparaît de la bibliothèque.
//
// Anciennes données, jamais migrées en base (converties à la lecture, voir sectionDeSeance) :
//   1. program_sessions.activation (texte libre) + activation_videos ([{ name, video_url }], vidéos
//      nommées à la main, sans lien avec la bibliothèque) — ~800 séances ;
//   2. bloc "warmup" / "cooldown" de l'éditeur de séance : warmup_block { name, description, note }
//      + exercices block_type 'warmup' | 'cooldown' dans program_exercises — quelques séances.
// La conversion n'est écrite en base que quand le coach enregistre depuis le nouvel éditeur.

export const SECTIONS = {
  echauffement: { colonne: 'warmup_content', bloc: 'warmup', titre: 'Échauffement' },
  retourAuCalme: { colonne: 'cooldown_content', bloc: 'cooldown', titre: 'Retour au calme' },
}

// Contenu lu en base → lignes valides, ou null si la colonne est vide / illisible.
export function normaliserContenu(valeur) {
  if (!Array.isArray(valeur)) return null
  const lignes = []
  for (const l of valeur) {
    if (!l || typeof l !== 'object') continue
    if (typeof l.texte !== 'string' && !l.mouvementId) continue
    const texte = typeof l.texte === 'string' ? l.texte : ''
    if (typeof l.mouvementId === 'string' && l.mouvementId) {
      lignes.push({ mouvementId: l.mouvementId, texte, ...(typeof l.mouvementNom === 'string' ? { mouvementNom: l.mouvementNom } : {}) })
    } else {
      lignes.push({ texte })
    }
  }
  return lignes
}

const cle = (nom) => (nom || '').trim().toLowerCase()

// Texte libre → lignes { texte }, en gardant au plus une ligne vide d'affilée (aération du coach).
export function lignesDeTexte(texte) {
  const out = []
  for (const brut of (texte || '').replace(/\r\n?/g, '\n').split('\n')) {
    const t = brut.trimEnd()
    if (t === '' && (out.length === 0 || out[out.length - 1].texte === '')) continue
    out.push({ texte: t })
  }
  while (out.length && out[out.length - 1].texte === '') out.pop()
  return out
}

/*
  Section d'une séance, quelle que soit la façon dont elle a été saisie.
    session     : ligne program_sessions (avec `exercises` ou `program_exercises` pour les anciens blocs)
    type        : 'echauffement' | 'retourAuCalme'
    mouvements  : bibliothèque [{ id, name }] — sert à retrouver l'id d'un exercice d'ancien bloc
  Retourne null si la section est vide, sinon :
    { titre, contenu, videosLibres, source }
      contenu      : lignes au format ci-dessus
      videosLibres : [{ nom, video_url }] — vidéos de l'ancien format, sans mouvement associé
      source       : 'contenu' | 'bloc' | 'activation' (d'où vient ce qu'on affiche)
*/
export function sectionDeSeance(session, type, mouvements = []) {
  const def = SECTIONS[type]
  if (!def || !session) return null

  const contenu = normaliserContenu(session[def.colonne])
  if (contenu) return contenu.length ? { titre: def.titre, contenu, videosLibres: [], source: 'contenu' } : null

  const exos = (session.exercises || session.program_exercises || []).filter(e => e.block_type === def.bloc && e.name)
  const meta = session[`${def.bloc}_block`]
  if (exos.length || meta?.description) {
    const parNom = new Map(mouvements.map(m => [cle(m.name), m]))
    const lignes = lignesDeTexte(meta?.description)
    ;[...exos].sort((a, b) => (a.order_index ?? 0) - (b.order_index ?? 0)).forEach(e => {
      const m = parNom.get(cle(e.name))
      const dose = (e.note || '').replace(/\s+/g, ' ').trim()
      lignes.push(m ? { mouvementId: m.id, texte: dose, mouvementNom: m.name } : { texte: dose ? `${e.name.trim()} — ${dose}` : e.name.trim() })
    })
    if (meta?.note) lignes.push(...lignesDeTexte(meta.note))
    return lignes.length ? { titre: meta?.name || def.titre, contenu: lignes, videosLibres: [], source: 'bloc' } : null
  }

  if (type === 'echauffement') {
    const lignes = lignesDeTexte(session.activation)
    const videosLibres = (session.activation_videos || [])
      .filter(v => v?.video_url)
      .map(v => ({ nom: (v.name || '').trim() || 'Vidéo', video_url: v.video_url }))
    if (lignes.length || videosLibres.length) return { titre: def.titre, contenu: lignes, videosLibres, source: 'activation' }
  }
  return null
}

// Mouvements cités, dans l'ordre d'apparition des jetons, dédoublonnés.
export function mouvementsCites(contenu) {
  const vus = new Set()
  const out = []
  for (const l of contenu || []) {
    if (!l.mouvementId || vus.has(l.mouvementId)) continue
    vus.add(l.mouvementId)
    out.push(l.mouvementId)
  }
  return out
}
