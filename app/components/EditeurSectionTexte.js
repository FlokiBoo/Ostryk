'use client'

import { useEffect, useRef, useState } from 'react'

/*
  Éditeur des sections texte d'une séance (échauffement, retour au calme) — maquette
  EditeurSectionTexte.jsx. Saisie libre + jeton de mouvement déclenché par "#".

  Sortie (onChange, à chaque frappe) : lignes [{ texte } | { mouvementId, texte, mouvementNom }],
  format décrit dans lib/sectionsTexte.js. Un seul jeton par ligne : ce qui le suit sur la ligne est
  la dose. Un second jeton sur la même ligne est gardé en texte (son nom), rien ne se perd.

  Jeton bleu = mouvement avec vidéo, gris = sans vidéo — relu depuis la bibliothèque à chaque
  ouverture, donc un mouvement qui reçoit une vidéo plus tard passe au bleu partout. Un mouvement
  introuvable (retiré de la bibliothèque) garde son nom enregistré, barré, sans lien.

  bibliotheque : [{ id, nom, video_url }]. Composant non contrôlé (contentEditable) : le contenu
  initial n'est lu qu'au montage — changer `key` pour recharger un autre contenu.

  Création à la volée (si onCreerMouvement est fourni) : "+ Créer « … »" toujours proposé en bas
  de la liste, même quand des mouvements correspondent. Nom pré-rempli avec ce qui suit le #,
  muscles et vidéo facultatifs. onCreerMouvement({ nom, muscles, video_url }) doit renvoyer le
  mouvement créé avec son identifiant définitif ({ id, nom, video_url }) ou lever une erreur : le
  jeton n'est inséré qu'après une création réussie côté serveur, jamais sur un id provisoire.
  muscles : libellés proposés en puces (sélection multiple).
*/

const T = {
  page: '#EFEAE0',
  blanc: '#FFFFFF',
  bordeaux: '#6D1A22',
  texte: '#2D2620',
  texteSec: '#625B50',
  bordure: '#D9CFC1',
  filet: '#F0EBE2',
  bleu: '#2F5D8C',
  bleuFond: '#EAF0F6',
  grisFond: '#EFE8DE',
}

const NB_SUGGESTIONS = 6
// "#" puis 0 à 28 caractères : lettres, chiffres (90/90, 4-6), espaces, tirets, apostrophes.
const DECLENCHEUR = /#([\p{L}\p{N}\-'/ ]{0,28})$/u

function styleJeton(etat) {
  const couleurs = {
    video: [T.bleu, T.bleuFond],
    sansVideo: [T.texteSec, T.grisFond],
    introuvable: [T.texteSec, T.grisFond],
  }[etat]
  return `color:${couleurs[0]};background:${couleurs[1]};border-radius:6px;padding:1px 5px;font-weight:500;${etat === 'introuvable' ? 'text-decoration:line-through;' : ''}`
}

function creerJeton(id, nom, etat) {
  const span = document.createElement('span')
  span.contentEditable = 'false'
  span.dataset.mouvement = id
  span.dataset.nom = nom
  span.textContent = nom
  span.title = etat === 'introuvable' ? 'Mouvement introuvable dans la bibliothèque' : etat === 'video' ? 'Vidéo liée' : 'Sans vidéo'
  span.setAttribute('style', styleJeton(etat))
  return span
}

export default function EditeurSectionTexte({ titre, contenu = [], bibliotheque = [], onChange = () => {}, onCreerMouvement = null, muscles = [] }) {
  const editeur = useRef(null)
  const [suggestions, setSuggestions] = useState(null) // { contexte, resultats, actif }
  const [creation, setCreation] = useState(null) // { contexte, nom, muscles, video, envoi, erreur }

  // Chargement initial — une div par ligne.
  useEffect(() => {
    const el = editeur.current
    if (!el || el.dataset.initialise) return
    el.dataset.initialise = '1'
    el.innerHTML = ''
    const parId = new Map(bibliotheque.map(m => [m.id, m]))
    ;(contenu.length ? contenu : [{ texte: '' }]).forEach(ligne => {
      const div = document.createElement('div')
      if (ligne.mouvementId) {
        const m = parId.get(ligne.mouvementId)
        div.appendChild(m
          ? creerJeton(m.id, m.nom, m.video_url ? 'video' : 'sansVideo')
          : creerJeton(ligne.mouvementId, ligne.mouvementNom || 'Mouvement supprimé', 'introuvable'))
        div.appendChild(document.createTextNode(` ${ligne.texte || ''}`))
      } else if (ligne.texte) {
        div.textContent = ligne.texte
      } else {
        div.appendChild(document.createElement('br'))
      }
      el.appendChild(div)
    })
    // Montage seulement : le contenu vit ensuite dans le DOM éditable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function lireContenu() {
    const lignes = [{ parts: [] }]
    const pousser = () => lignes.push({ parts: [] })
    const parcourir = (noeud) => {
      noeud.childNodes.forEach(n => {
        if (n.nodeType === 3) {
          if (n.textContent) lignes[lignes.length - 1].parts.push({ type: 'texte', valeur: n.textContent })
        } else if (n.nodeName === 'BR') {
          pousser()
        } else if (n.dataset?.mouvement) {
          lignes[lignes.length - 1].parts.push({ type: 'mouvement', id: n.dataset.mouvement, nom: n.dataset.nom || n.textContent })
        } else {
          if ((n.nodeName === 'DIV' || n.nodeName === 'P') && lignes[lignes.length - 1].parts.length) pousser()
          parcourir(n)
        }
      })
    }
    parcourir(editeur.current)
    // Lignes vides gardées (aération du coach), sauf en fin de texte.
    const out = lignes.map(l => {
      const jeton = l.parts.find(p => p.type === 'mouvement')
      const texte = l.parts
        .filter(p => p !== jeton)
        .map(p => (p.type === 'texte' ? p.valeur : p.nom))
        .join(' ')
        .replace(/ /g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
      return jeton ? { mouvementId: jeton.id, texte, mouvementNom: jeton.nom } : { texte }
    })
    while (out.length && !out[out.length - 1].mouvementId && !out[out.length - 1].texte) out.pop()
    return out
  }

  function contexteCourant() {
    const sel = window.getSelection()
    if (!sel?.rangeCount) return null
    const noeud = sel.focusNode
    if (!noeud || noeud.nodeType !== 3 || !editeur.current.contains(noeud)) return null
    const avant = noeud.textContent.slice(0, sel.focusOffset)
    const m = avant.match(DECLENCHEUR)
    if (!m) return null
    return { noeud, debut: sel.focusOffset - m[0].length, fin: sel.focusOffset, requete: m[1].trim() }
  }

  function insererJeton(contexte, mouvement) {
    const plage = document.createRange()
    const intact = contexte.noeud.isConnected && contexte.noeud.textContent.slice(contexte.debut, contexte.fin).startsWith('#')
    if (intact) {
      plage.setStart(contexte.noeud, contexte.debut)
      plage.setEnd(contexte.noeud, contexte.fin)
      plage.deleteContents()
    } else {
      // Le "#…" a été modifié entre-temps (fiche de création ouverte) : jeton sur une nouvelle ligne.
      const div = document.createElement('div')
      editeur.current.appendChild(div)
      plage.setStart(div, 0)
    }
    const jeton = creerJeton(mouvement.id, mouvement.nom, mouvement.video_url ? 'video' : 'sansVideo')
    const espace = document.createTextNode(' ')
    plage.insertNode(jeton)
    jeton.after(espace)
    const sel = window.getSelection()
    const nouvelle = document.createRange()
    nouvelle.setStart(espace, 1)
    nouvelle.collapse(true)
    sel.removeAllRanges()
    sel.addRange(nouvelle)
    setSuggestions(null)
    editeur.current.focus()
    onChange(lireContenu())
  }

  function rafraichirSuggestions() {
    if (creation) return
    const contexte = contexteCourant()
    if (!contexte) { setSuggestions(null); return }
    const q = contexte.requete.toLowerCase()
    // Début de nom d'abord, puis le reste des correspondances.
    const debut = [], ailleurs = []
    for (const m of bibliotheque) {
      const nom = m.nom.toLowerCase()
      if (!q || nom.startsWith(q)) debut.push(m)
      else if (nom.includes(q)) ailleurs.push(m)
    }
    setSuggestions({ contexte, resultats: [...debut, ...ailleurs].slice(0, NB_SUGGESTIONS), actif: 0 })
  }

  async function creer() {
    const nom = creation.nom.trim()
    if (!nom || creation.envoi) return
    const video = creation.video.trim()
    if (video && !/^https?:\/\//i.test(video)) { setCreation(c => ({ ...c, erreur: 'Le lien vidéo doit commencer par https://' })); return }
    setCreation(c => ({ ...c, envoi: true, erreur: null }))
    try {
      const mouvement = await onCreerMouvement({ nom, muscles: creation.muscles, video_url: video || null })
      if (!mouvement?.id) throw new Error('création impossible')
      const contexte = creation.contexte
      setCreation(null)
      insererJeton(contexte, mouvement)
    } catch (err) {
      setCreation(c => ({ ...c, envoi: false, erreur: err?.message || 'Création impossible, réessaie.' }))
    }
  }

  function surTouche(e) {
    if (!suggestions?.resultats.length) return
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      const n = suggestions.resultats.length
      setSuggestions(s => ({ ...s, actif: (s.actif + (e.key === 'ArrowDown' ? 1 : n - 1)) % n }))
    } else if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault()
      insererJeton(suggestions.contexte, suggestions.resultats[suggestions.actif])
    } else if (e.key === 'Escape') {
      e.preventDefault()
      setSuggestions(null)
    }
  }

  // Coller en texte brut : aucune mise en forme HTML importée d'une autre source.
  function surCollage(e) {
    e.preventDefault()
    const texte = e.clipboardData.getData('text/plain')
    document.execCommand('insertText', false, texte)
  }

  return (
    <div style={{ color: T.texte }}>
      <div style={{ background: T.page, borderRadius: 14, padding: 12 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10, marginBottom: 6, flexWrap: 'wrap' }}>
          <span style={{ fontFamily: 'var(--font-title)', fontSize: 13, color: T.bordeaux }}>{titre}</span>
          <span style={{ fontSize: 11, color: T.texteSec }}>
            Tape <strong style={{ fontWeight: 600 }}>#</strong> pour citer un mouvement · un mouvement par ligne
          </span>
        </div>

        <div style={{ position: 'relative' }}>
          <div
            ref={editeur}
            contentEditable
            suppressContentEditableWarning
            role="textbox"
            aria-multiline="true"
            aria-label={`Contenu de la section ${titre}`}
            onInput={() => { rafraichirSuggestions(); onChange(lireContenu()) }}
            onKeyDown={surTouche}
            onKeyUp={e => { if (!['ArrowDown', 'ArrowUp', 'Enter', 'Tab', 'Escape'].includes(e.key)) rafraichirSuggestions() }}
            onClick={rafraichirSuggestions}
            onPaste={surCollage}
            onBlur={() => setTimeout(() => setSuggestions(null), 150)}
            style={{
              minHeight: 150, background: T.blanc, border: `1px solid ${T.bordure}`, borderRadius: 10, padding: 10,
              fontSize: 14, lineHeight: 1.8, outline: 'none', whiteSpace: 'pre-wrap', wordBreak: 'break-word',
            }}
          />

          {suggestions ? (
            <div role="listbox" aria-label="Mouvements de la bibliothèque" style={{
              position: 'absolute', left: 10, right: 10, background: T.blanc, border: `1px solid ${T.bordure}`, borderRadius: 10,
              boxShadow: '0 6px 18px rgba(45,38,32,0.12)', overflow: 'hidden', zIndex: 20,
            }}>
              {suggestions.resultats.length === 0 ? (
                <p style={{ margin: 0, padding: '10px 12px', fontSize: 13, color: T.texteSec }}>
                  Aucun mouvement « {suggestions.contexte.requete} » dans la bibliothèque.
                </p>
              ) : suggestions.resultats.map((m, i) => (
                <button key={m.id} type="button" role="option" aria-selected={i === suggestions.actif}
                  onMouseDown={e => { e.preventDefault(); insererJeton(suggestions.contexte, m) }}
                  onMouseEnter={() => setSuggestions(s => ({ ...s, actif: i }))}
                  style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, width: '100%', textAlign: 'left',
                    border: 'none', background: i === suggestions.actif ? T.filet : 'none', padding: '9px 12px', fontSize: 13,
                    color: m.video_url ? T.bleu : T.texteSec, cursor: 'pointer', fontFamily: 'inherit',
                  }}>
                  <span>{m.nom}</span>
                  <span style={{ fontSize: 10, color: T.texteSec, flex: 'none' }}>{m.video_url ? 'vidéo' : 'sans vidéo'}</span>
                </button>
              ))}
              {onCreerMouvement ? (
                <button type="button"
                  onMouseDown={e => {
                    e.preventDefault()
                    setCreation({ contexte: suggestions.contexte, nom: suggestions.contexte.requete, muscles: [], video: '', envoi: false, erreur: null })
                    setSuggestions(null)
                  }}
                  style={{
                    display: 'block', width: '100%', textAlign: 'left', border: 'none', borderTop: `1px solid ${T.filet}`, background: '#FBF9F5',
                    padding: '9px 12px', fontSize: 13, color: T.bordeaux, cursor: 'pointer', fontFamily: 'inherit',
                  }}>
                  + Créer « {suggestions.contexte.requete || '…'} »
                </button>
              ) : null}
            </div>
          ) : null}

          {creation ? (
            <div role="dialog" aria-label="Nouveau mouvement" style={{
              position: 'absolute', left: 10, right: 10, background: T.blanc, border: `1px solid ${T.bordure}`, borderRadius: 12,
              boxShadow: '0 8px 22px rgba(45,38,32,0.16)', padding: 12, zIndex: 21,
            }}>
              <p style={{ fontFamily: 'var(--font-title)', fontSize: 12, color: T.bordeaux, margin: '0 0 10px' }}>Nouveau mouvement</p>

              <label htmlFor="nom-mouvement-section" style={{ fontSize: 11, color: T.texteSec, display: 'block', marginBottom: 4 }}>Nom</label>
              <input id="nom-mouvement-section" autoFocus value={creation.nom}
                onChange={e => { const nom = e.target.value; setCreation(c => ({ ...c, nom })) }}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); creer() } if (e.key === 'Escape') setCreation(null) }}
                style={{ width: '100%', boxSizing: 'border-box', border: `1px solid ${T.bordure}`, borderRadius: 8, height: 38, padding: '0 10px', fontFamily: 'inherit', fontSize: 14, marginBottom: 10 }} />

              {muscles.length ? (
                <>
                  <p style={{ fontSize: 11, color: T.texteSec, margin: '0 0 6px' }}>Muscles (facultatif)</p>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: 10 }}>
                    {muscles.map(m => {
                      const on = creation.muscles.includes(m)
                      return (
                        <button key={m} type="button" aria-pressed={on}
                          onClick={() => setCreation(c => ({ ...c, muscles: c.muscles.includes(m) ? c.muscles.filter(x => x !== m) : [...c.muscles, m] }))}
                          style={{
                            border: `1px solid ${on ? T.bordeaux : T.bordure}`, background: on ? T.bordeaux : T.blanc, color: on ? '#F5EFE6' : T.texte,
                            borderRadius: 100, fontSize: 11, padding: '5px 10px', cursor: 'pointer', fontFamily: 'inherit',
                          }}>
                          {m}
                        </button>
                      )
                    })}
                  </div>
                </>
              ) : null}

              <label htmlFor="video-mouvement-section" style={{ fontSize: 11, color: T.texteSec, display: 'block', marginBottom: 4 }}>Vidéo (facultatif)</label>
              <input id="video-mouvement-section" value={creation.video} placeholder="https://youtu.be/…"
                onChange={e => { const video = e.target.value; setCreation(c => ({ ...c, video, erreur: null })) }}
                style={{ width: '100%', boxSizing: 'border-box', border: `1px solid ${T.bordure}`, borderRadius: 8, height: 38, padding: '0 10px', fontFamily: 'inherit', fontSize: 14, marginBottom: 10 }} />

              {creation.erreur ? <p role="alert" style={{ fontSize: 12, color: T.bordeaux, margin: '0 0 10px' }}>{creation.erreur}</p> : null}

              <div style={{ display: 'flex', gap: 6 }}>
                <button type="button" onClick={() => setCreation(null)} style={{ flex: 1, border: `1px solid ${T.bordure}`, background: T.blanc, borderRadius: 8, height: 40, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>
                  Annuler
                </button>
                <button type="button" onClick={creer} disabled={!creation.nom.trim() || creation.envoi} style={{
                  flex: 2, border: 'none', background: T.bordeaux, color: '#F5EFE6', borderRadius: 8, height: 40, fontSize: 13, cursor: 'pointer',
                  fontFamily: 'inherit', opacity: !creation.nom.trim() || creation.envoi ? 0.6 : 1,
                }}>
                  {creation.envoi ? 'Création…' : 'Créer et insérer'}
                </button>
              </div>
            </div>
          ) : null}
        </div>

        <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 8, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 11, color: T.texteSec }}>
            <span style={{ color: T.bleu, background: T.bleuFond, borderRadius: 5, padding: '1px 5px' }}>bleu</span> vidéo liée
          </span>
          <span style={{ fontSize: 11, color: T.texteSec }}>
            <span style={{ color: T.texteSec, background: T.grisFond, borderRadius: 5, padding: '1px 5px' }}>gris</span> sans vidéo
          </span>
        </div>
      </div>
    </div>
  )
}
