'use client'

import { useEffect, useRef, useState } from 'react'
import { Barcode, Camera, CaretLeft, CaretRight, MagnifyingGlass, Plus, Trash, X } from '@phosphor-icons/react'
import { REPAS, jourLocal, repasDuMoment, totaux, valeursPourQuantite } from '@/lib/nutrition'

// Onglet Nutrition du sportif : sa journée repas par repas, ses totaux face aux objectifs du coach,
// et l'ajout d'un aliment — recherche (aliments partagés + CIQUAL), scan du code-barres (Open Food
// Facts), ou, pour un produit inconnu, deux photos (nom puis valeurs) lues par Claude. L'aliment
// créé ainsi sert à tout le monde ; le coach le vérifie ensuite dans Nutrition › Aliments.

const carte = { background: 'var(--card-white)', borderRadius: 'var(--ostryk-card-radius, 14px)', padding: 16, border: '1px solid var(--border)' }
const bouton = { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 'var(--r)', padding: '12px 14px', fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }
const boutonPlein = { ...bouton, background: 'var(--green)', color: '#fff', border: 'none' }
const boutonClair = { ...bouton, background: 'var(--bg2)', color: 'var(--text)', border: '1px solid var(--border)' }
const champ = { width: '100%', boxSizing: 'border-box', padding: '10px 12px', border: '1px solid var(--border2)', borderRadius: 'var(--r)', fontSize: 16, background: 'var(--bg)', color: 'var(--text)', fontFamily: 'inherit', outline: 'none' }
const fmt = v => (v === null || v === undefined ? '—' : Math.round(v))

function decalerJour(jour, delta) {
  const [a, m, j] = jour.split('-').map(Number)
  return jourLocal(new Date(a, m - 1, j + delta))
}

function libelleJour(jour) {
  const auj = jourLocal()
  if (jour === auj) return "Aujourd'hui"
  if (jour === decalerJour(auj, -1)) return 'Hier'
  const [a, m, j] = jour.split('-').map(Number)
  return new Date(a, m - 1, j).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })
}

// Photo du téléphone (souvent 4000 px, plusieurs Mo) → JPEG ~1400 px en base64 : assez net pour lire
// une étiquette, assez léger pour la limite de taille des requêtes Vercel (4,5 Mo pour les deux).
async function photoEnBase64(fichier) {
  const url = URL.createObjectURL(fichier)
  try {
    const img = await new Promise((ok, ko) => { const i = new Image(); i.onload = () => ok(i); i.onerror = ko; i.src = url })
    const echelle = Math.min(1, 1400 / Math.max(img.naturalWidth, img.naturalHeight))
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(img.naturalWidth * echelle)
    canvas.height = Math.round(img.naturalHeight * echelle)
    canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height)
    return canvas.toDataURL('image/jpeg', 0.82).split(',')[1]
  } finally {
    URL.revokeObjectURL(url)
  }
}

// Le code-barres est lu sur une photo plutôt qu'en vidéo : l'appareil photo natif fait la mise au
// point tout seul et marche pareil dans le navigateur et dans l'app iOS/Android. BarcodeDetector
// (Chrome Android) quand il existe, sinon ZXing — Safari et la WebView iOS ne l'ont pas.
async function lireCodeBarres(fichier) {
  if (typeof window !== 'undefined' && 'BarcodeDetector' in window) {
    try {
      const detecteur = new window.BarcodeDetector({ formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e'] })
      const codes = await detecteur.detect(await createImageBitmap(fichier))
      if (codes[0]?.rawValue) return codes[0].rawValue
    } catch { /* on retente avec ZXing */ }
  }
  const [{ BrowserMultiFormatReader }, { BarcodeFormat, DecodeHintType }] = await Promise.all([import('@zxing/browser'), import('@zxing/library')])
  const hints = new Map([
    [DecodeHintType.POSSIBLE_FORMATS, [BarcodeFormat.EAN_13, BarcodeFormat.EAN_8, BarcodeFormat.UPC_A, BarcodeFormat.UPC_E]],
    [DecodeHintType.TRY_HARDER, true],
  ])
  const url = URL.createObjectURL(fichier)
  try {
    const resultat = await new BrowserMultiFormatReader(hints).decodeFromImageUrl(url)
    return resultat.getText()
  } catch {
    return null
  } finally {
    URL.revokeObjectURL(url)
  }
}

function Jauge({ label, valeur, objectif, unite, couleur }) {
  const ratio = objectif ? Math.min(1, valeur / objectif) : 0
  const depasse = objectif && valeur > objectif * 1.05
  return (
    <div style={{ flex: 1, minWidth: 0 }}>
      <div style={{ fontSize: 11, color: 'var(--text3)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.4 }}>{label}</div>
      <div style={{ fontSize: 15, fontWeight: 800, margin: '2px 0 6px', color: depasse ? 'var(--bordeaux)' : 'var(--text)' }}>
        {fmt(valeur)}<span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text3)' }}>{objectif ? ` / ${fmt(objectif)}` : ''} {unite}</span>
      </div>
      {objectif ? (
        <div style={{ height: 6, borderRadius: 3, background: 'var(--bg2)', overflow: 'hidden' }}>
          <div style={{ width: `${ratio * 100}%`, height: '100%', background: depasse ? 'var(--bordeaux)' : couleur, borderRadius: 3 }} />
        </div>
      ) : null}
    </div>
  )
}

// demandeAjout : compteur incrémenté par le « + » de la barre d'onglets (« Noter ce que je mange »),
// qui ouvre directement l'ajout sur aujourd'hui, au repas du moment.
export default function NutritionTab({ token, demandeAjout = 0 }) {
  const [jour, setJour] = useState(() => jourLocal())
  const [entrees, setEntrees] = useState([])
  const [objectifs, setObjectifs] = useState({})
  const [chargement, setChargement] = useState(true)
  const [erreur, setErreur] = useState(null)
  const [ajout, setAjout] = useState(null) // repas pour lequel la feuille d'ajout est ouverte

  // Ajusté pendant le rendu plutôt que dans un effet (même règle que le lint react-hooks) : 0 au
  // départ, pour que la toute première demande, celle qui monte l'onglet, ouvre aussi l'ajout.
  const [demandeVue, setDemandeVue] = useState(0)
  if (demandeAjout !== demandeVue) {
    setDemandeVue(demandeAjout)
    setJour(jourLocal())
    setAjout(repasDuMoment())
  }

  useEffect(() => {
    let actif = true
    fetch(`/api/athlete-view/${token}/nutrition/journal?jour=${jour}`, { cache: 'no-store' })
      .then(r => r.json().then(j => ({ ok: r.ok, j })))
      .then(({ ok, j }) => {
        if (!actif) return
        if (!ok) { setErreur(j.error || 'Chargement impossible.'); return }
        setErreur(null)
        setEntrees(j.entrees || [])
        setObjectifs(j.objectifs || {})
      })
      .catch(() => actif && setErreur('Pas de connexion. Réessaie dans un instant.'))
      .finally(() => actif && setChargement(false))
    return () => { actif = false }
  }, [token, jour])

  const supprimer = async (id) => {
    const avant = entrees
    setEntrees(prev => prev.filter(e => e.id !== id))
    const res = await fetch(`/api/athlete-view/${token}/nutrition/journal?id=${id}`, { method: 'DELETE' }).catch(() => null)
    if (!res?.ok) { setEntrees(avant); alert('Suppression impossible, réessaie.') }
  }

  const t = totaux(entrees)
  const restant = objectifs.kcal ? Math.round(objectifs.kcal - t.kcal) : null

  return (
    <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <button aria-label="Jour précédent" onClick={() => setJour(j => decalerJour(j, -1))} style={{ ...boutonClair, padding: 8 }}><CaretLeft size={18} /></button>
        <div style={{ flex: 1, textAlign: 'center', fontFamily: 'var(--font-title)', color: 'var(--title)', fontWeight: 700, fontSize: 18, textTransform: 'capitalize' }}>{libelleJour(jour)}</div>
        <button aria-label="Jour suivant" disabled={jour >= jourLocal()} onClick={() => setJour(j => decalerJour(j, 1))} style={{ ...boutonClair, padding: 8, opacity: jour >= jourLocal() ? 0.35 : 1 }}><CaretRight size={18} /></button>
      </div>

      <div style={carte}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 14 }}>
          <span style={{ fontSize: 30, fontWeight: 800, fontFamily: 'var(--font-title)', color: 'var(--title)' }}>{t.kcal}</span>
          <span style={{ fontSize: 13, color: 'var(--text3)' }}>kcal{objectifs.kcal ? ` sur ${fmt(objectifs.kcal)}` : ''}</span>
          {restant !== null ? (
            <span style={{ marginLeft: 'auto', fontSize: 12, fontWeight: 700, color: restant < 0 ? 'var(--bordeaux)' : 'var(--green)' }}>
              {restant < 0 ? `${-restant} de trop` : `reste ${restant}`}
            </span>
          ) : null}
        </div>
        <div style={{ display: 'flex', gap: 14 }}>
          <Jauge label="Protéines" valeur={t.proteines} objectif={objectifs.proteines} unite="g" couleur="var(--green)" />
          <Jauge label="Glucides" valeur={t.glucides} objectif={objectifs.glucides} unite="g" couleur="#A07A3F" />
          <Jauge label="Lipides" valeur={t.lipides} objectif={objectifs.lipides} unite="g" couleur="#6B7F96" />
        </div>
        {!objectifs.kcal && !objectifs.proteines ? (
          <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 12 }}>Ton coach n&apos;a pas encore fixé d&apos;objectifs : tu vois tes totaux de la journée.</div>
        ) : null}
      </div>

      {erreur ? <div style={{ ...carte, color: 'var(--bordeaux)', fontSize: 13 }}>{erreur}</div> : null}

      {REPAS.map(r => {
        const liste = entrees.filter(e => e.repas === r.key)
        const kcal = totaux(liste).kcal
        return (
          <div key={r.key} style={carte}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: liste.length ? 8 : 0 }}>
              <span style={{ fontWeight: 800, fontSize: 15, flex: 1 }}>{r.label}</span>
              {liste.length ? <span style={{ fontSize: 12, color: 'var(--text3)' }}>{kcal} kcal</span> : null}
              <button aria-label={`Ajouter ${r.au}`} onClick={() => setAjout(r.key)} style={{ ...boutonPlein, padding: '6px 10px', fontSize: 13 }}><Plus size={14} weight="bold" /> Ajouter</button>
            </div>
            {liste.map(e => (
              <div key={e.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderTop: '1px solid var(--border)' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.nom}</div>
                  <div style={{ fontSize: 12, color: 'var(--text3)' }}>{fmt(e.quantite_g)} g · P {fmt(e.proteines)} · G {fmt(e.glucides)} · L {fmt(e.lipides)}</div>
                </div>
                <span style={{ fontSize: 13, fontWeight: 700 }}>{fmt(e.kcal)}</span>
                <button aria-label={`Retirer ${e.nom}`} onClick={() => supprimer(e.id)} style={{ background: 'none', border: 'none', color: 'var(--text3)', cursor: 'pointer', padding: 4, display: 'flex' }}><Trash size={16} /></button>
              </div>
            ))}
          </div>
        )
      })}
      {chargement ? <div style={{ fontSize: 13, color: 'var(--text3)', textAlign: 'center' }}>Chargement…</div> : null}

      {ajout ? (
        <FeuilleAjout
          token={token}
          jour={jour}
          repasInitial={ajout}
          onFermer={() => setAjout(null)}
          onAjoute={e => setEntrees(prev => [...prev, e])}
        />
      ) : null}
    </div>
  )
}

function FeuilleAjout({ token, jour, repasInitial, onFermer, onAjoute }) {
  // 'recherche' → 'quantite' ; ou 'recherche' → (scan inconnu) 'photos' → 'verification' → 'quantite'
  const [etape, setEtape] = useState('recherche')
  const [repas, setRepas] = useState(repasInitial)
  const [aliment, setAliment] = useState(null)
  const [codeBarres, setCodeBarres] = useState(null)
  const [message, setMessage] = useState(null)

  const choisir = (a) => { setAliment(a); setMessage(null); setEtape('quantite') }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'var(--bg)', zIndex: 650, display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 16px', paddingTop: 'calc(14px + env(safe-area-inset-top))', borderBottom: '1px solid var(--border)' }}>
        <button aria-label="Fermer" onClick={onFermer} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2, display: 'flex', color: 'var(--text2)' }}><X size={22} /></button>
        <select value={repas} onChange={e => setRepas(e.target.value)} style={{ ...champ, width: 'auto', fontWeight: 700, fontSize: 15, padding: '6px 10px' }}>
          {REPAS.map(r => <option key={r.key} value={r.key}>{r.label}</option>)}
        </select>
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: 16, maxWidth: 480, width: '100%', margin: '0 auto', boxSizing: 'border-box', display: 'flex', flexDirection: 'column', gap: 12, paddingBottom: 'calc(24px + env(safe-area-inset-bottom))' }}>
        {message ? <div style={{ background: 'var(--bordeaux-light)', color: 'var(--bordeaux)', borderRadius: 'var(--r)', padding: '10px 12px', fontSize: 13 }}>{message}</div> : null}
        {etape === 'recherche' ? (
          <EtapeRecherche
            token={token}
            onChoisir={choisir}
            onInconnu={(code) => { setCodeBarres(code); setMessage(code ? 'Produit inconnu. Prends-le en photo : il sera ajouté pour tout le monde.' : null); setEtape('photos') }}
            onMessage={setMessage}
          />
        ) : null}
        {etape === 'photos' ? (
          <EtapePhotos token={token} onLu={(extraction, photos) => { setAliment({ brouillon: extraction, photos }); setMessage(null); setEtape('verification') }} onMessage={setMessage} />
        ) : null}
        {etape === 'verification' ? (
          <EtapeVerification token={token} brouillon={aliment?.brouillon} photos={aliment?.photos} codeBarres={codeBarres} onCree={choisir} onMessage={setMessage} />
        ) : null}
        {etape === 'quantite' && aliment ? (
          <EtapeQuantite
            token={token} jour={jour} repas={repas} aliment={aliment}
            onRetour={() => setEtape('recherche')}
            onAjoute={e => { onAjoute(e); onFermer() }}
            onMessage={setMessage}
          />
        ) : null}
      </div>
    </div>
  )
}

function EtapeRecherche({ token, onChoisir, onInconnu, onMessage }) {
  const [q, setQ] = useState('')
  const [resultats, setResultats] = useState([])
  const [recherche, setRecherche] = useState(false)
  const [scan, setScan] = useState(false)
  const [codeManuel, setCodeManuel] = useState('')
  const fichierRef = useRef(null)

  useEffect(() => {
    const texte = q.trim()
    if (texte.length < 2) return
    let actif = true
    const minuteur = setTimeout(() => {
      setRecherche(true)
      fetch(`/api/athlete-view/${token}/nutrition/recherche?q=${encodeURIComponent(texte)}`)
        .then(r => r.json())
        .then(j => { if (actif) setResultats(j.resultats || []) })
        .catch(() => {})
        .finally(() => actif && setRecherche(false))
    }, 250)
    return () => { actif = false; clearTimeout(minuteur) }
  }, [q, token])

  const chercherCode = async (code) => {
    setScan(true)
    onMessage(null)
    try {
      const res = await fetch(`/api/athlete-view/${token}/nutrition/code-barres?code=${encodeURIComponent(code)}`)
      const j = await res.json()
      if (!res.ok) { onMessage(j.error || 'Code-barres invalide.'); return }
      if (j.aliment) onChoisir(j.aliment)
      else onInconnu(code.replace(/\D/g, ''))
    } catch {
      onMessage('Pas de connexion. Réessaie dans un instant.')
    } finally {
      setScan(false)
    }
  }

  const photoCode = async (e) => {
    const f = e.target.files?.[0]
    e.target.value = ''
    if (!f) return
    setScan(true)
    const code = await lireCodeBarres(f).catch(() => null)
    if (!code) { setScan(false); onMessage('Code-barres illisible. Recommence de plus près et bien à plat, ou tape les chiffres en dessous.'); return }
    chercherCode(code)
  }

  return (
    <>
      <div style={{ position: 'relative' }}>
        <MagnifyingGlass size={18} style={{ position: 'absolute', left: 12, top: 12, color: 'var(--text3)' }} />
        <input autoFocus value={q} onChange={e => setQ(e.target.value)} placeholder="Rechercher un aliment" style={{ ...champ, paddingLeft: 38 }} />
      </div>

      <input ref={fichierRef} type="file" accept="image/*" capture="environment" onChange={photoCode} style={{ display: 'none' }} />
      <button onClick={() => fichierRef.current?.click()} disabled={scan} style={boutonPlein}>
        <Barcode size={20} /> {scan ? 'Lecture du code-barres…' : 'Scanner un code-barres'}
      </button>
      <form onSubmit={e => { e.preventDefault(); if (codeManuel.trim()) chercherCode(codeManuel) }} style={{ display: 'flex', gap: 8 }}>
        <input value={codeManuel} onChange={e => setCodeManuel(e.target.value)} inputMode="numeric" placeholder="ou tape les chiffres du code" style={{ ...champ, fontSize: 14 }} />
        <button type="submit" disabled={scan || !codeManuel.trim()} style={{ ...boutonClair, padding: '0 14px' }}>OK</button>
      </form>

      {recherche ? <div style={{ fontSize: 13, color: 'var(--text3)' }}>Recherche…</div> : null}
      {(q.trim().length >= 2 ? resultats : []).map(a => (
        <button key={`${a.source}-${a.id}`} onClick={() => onChoisir(a)} style={{ ...carte, padding: '10px 12px', textAlign: 'left', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10, fontFamily: 'inherit', color: 'var(--text)' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 600 }}>{a.nom}{a.marque ? <span style={{ color: 'var(--text3)', fontWeight: 500 }}> · {a.marque}</span> : null}</div>
            <div style={{ fontSize: 12, color: 'var(--text3)' }}>
              pour 100 g : {fmt(a.pour100.kcal)} kcal · P {fmt(a.pour100.proteines)} · G {fmt(a.pour100.glucides)} · L {fmt(a.pour100.lipides)}
              {a.statut === 'a_verifier' ? ' · ajouté par un sportif' : ''}
            </div>
          </div>
        </button>
      ))}
      {q.trim().length >= 2 && !recherche && resultats.length === 0 ? (
        <div style={{ fontSize: 13, color: 'var(--text3)' }}>Aucun aliment trouvé.</div>
      ) : null}

      <button onClick={() => onInconnu(null)} style={{ ...boutonClair, marginTop: 8 }}>
        <Camera size={18} /> Créer un aliment à partir de photos
      </button>
    </>
  )
}

function CasePhoto({ titre, consigne, base64, onPhoto }) {
  const ref = useRef(null)
  return (
    <button onClick={() => ref.current?.click()} style={{ ...carte, display: 'flex', alignItems: 'center', gap: 12, textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit', color: 'var(--text)', borderStyle: base64 ? 'solid' : 'dashed' }}>
      <input ref={ref} type="file" accept="image/*" capture="environment" style={{ display: 'none' }}
        onChange={async e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) onPhoto(await photoEnBase64(f)) }} />
      {base64 ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={`data:image/jpeg;base64,${base64}`} alt="" style={{ width: 64, height: 64, objectFit: 'cover', borderRadius: 8, flexShrink: 0 }} />
      ) : (
        <span style={{ width: 64, height: 64, borderRadius: 8, background: 'var(--bg2)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><Camera size={26} /></span>
      )}
      <div>
        <div style={{ fontWeight: 700, fontSize: 14 }}>{titre}</div>
        <div style={{ fontSize: 12, color: 'var(--text3)' }}>{base64 ? 'Touche pour reprendre la photo' : consigne}</div>
      </div>
    </button>
  )
}

function EtapePhotos({ token, onLu, onMessage }) {
  const [photoNom, setPhotoNom] = useState(null)
  const [photoValeurs, setPhotoValeurs] = useState(null)
  const [analyse, setAnalyse] = useState(false)

  const analyser = async () => {
    setAnalyse(true)
    onMessage(null)
    try {
      const res = await fetch(`/api/athlete-view/${token}/nutrition/analyse`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ photoNom, photoValeurs }),
      })
      const j = await res.json().catch(() => ({}))
      if (res.ok && j.extraction?.lisible) { onLu(j.extraction, j.photos); return }
      if (res.ok) { onMessage("Ces photos ne montrent pas d'étiquette lisible. Reprends-les de plus près, ou saisis les valeurs à la main."); onLu({}, j.photos); return }
      onMessage(j.error || 'Lecture impossible.')
      // Photos bien envoyées mais lecture ratée : on passe quand même à la saisie manuelle.
      if (j.photos) onLu({}, j.photos)
    } catch {
      onMessage('Pas de connexion. Réessaie dans un instant.')
    } finally {
      setAnalyse(false)
    }
  }

  return (
    <>
      <div style={{ fontSize: 14, color: 'var(--text2)', lineHeight: 1.45 }}>Deux photos, et on lit l&apos;étiquette pour toi. Tu pourras corriger avant d&apos;enregistrer.</div>
      <CasePhoto titre="1. Le nom du produit" consigne="La face avant de l'emballage" base64={photoNom} onPhoto={setPhotoNom} />
      <CasePhoto titre="2. Les valeurs nutritionnelles" consigne="Le tableau, bien à plat et lisible" base64={photoValeurs} onPhoto={setPhotoValeurs} />
      <button onClick={analyser} disabled={!photoNom || !photoValeurs || analyse} style={{ ...boutonPlein, opacity: !photoNom || !photoValeurs ? 0.5 : 1 }}>
        {analyse ? 'Lecture de l’étiquette…' : 'Lire l’étiquette'}
      </button>
    </>
  )
}

const CHAMPS = [
  ['kcal_100g', 'Énergie (kcal)'], ['proteines_100g', 'Protéines (g)'], ['glucides_100g', 'Glucides (g)'],
  ['sucres_100g', 'dont sucres (g)'], ['lipides_100g', 'Lipides (g)'], ['fibres_100g', 'Fibres (g)'], ['sel_100g', 'Sel (g)'],
]

function EtapeVerification({ token, brouillon = {}, photos, codeBarres, onCree, onMessage }) {
  const [form, setForm] = useState(() => {
    const f = { nom: brouillon.nom || '', marque: brouillon.marque || '', portion_g: brouillon.portion_g ?? '' }
    for (const [k] of CHAMPS) f[k] = brouillon[k] ?? ''
    return f
  })
  const [envoi, setEnvoi] = useState(false)
  const maj = (k, v) => setForm(prev => ({ ...prev, [k]: v }))

  const creer = async () => {
    setEnvoi(true)
    onMessage(null)
    try {
      const res = await fetch(`/api/athlete-view/${token}/nutrition/aliments`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, code_barres: codeBarres, photos }),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) { onMessage(j.error || 'Création impossible.'); return }
      onCree(j.aliment)
    } catch {
      onMessage('Pas de connexion. Réessaie dans un instant.')
    } finally {
      setEnvoi(false)
    }
  }

  return (
    <>
      <div style={{ fontSize: 14, color: 'var(--text2)', lineHeight: 1.45 }}>Vérifie ce qu&apos;on a lu : l&apos;aliment sera disponible pour tous les sportifs.</div>
      {brouillon.remarque ? <div style={{ background: '#FFF4E5', color: '#8A4B00', borderRadius: 'var(--r)', padding: '10px 12px', fontSize: 13 }}>{brouillon.remarque}</div> : null}
      <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--text3)' }}>Nom
        <input value={form.nom} onChange={e => maj('nom', e.target.value)} style={{ ...champ, marginTop: 4 }} />
      </label>
      <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--text3)' }}>Marque
        <input value={form.marque} onChange={e => maj('marque', e.target.value)} style={{ ...champ, marginTop: 4 }} />
      </label>
      <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--text)', marginTop: 4 }}>Pour 100 g</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        {CHAMPS.map(([k, label]) => (
          <label key={k} style={{ fontSize: 12, fontWeight: 700, color: 'var(--text3)' }}>{label}
            <input value={form[k]} onChange={e => maj(k, e.target.value)} inputMode="decimal" style={{ ...champ, marginTop: 4 }} />
          </label>
        ))}
        <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--text3)' }}>Portion (g)
          <input value={form.portion_g} onChange={e => maj('portion_g', e.target.value)} inputMode="decimal" style={{ ...champ, marginTop: 4 }} />
        </label>
      </div>
      <button onClick={creer} disabled={envoi || !form.nom.trim()} style={{ ...boutonPlein, marginTop: 4, opacity: form.nom.trim() ? 1 : 0.5 }}>
        {envoi ? 'Création…' : 'Créer l’aliment'}
      </button>
    </>
  )
}

function EtapeQuantite({ token, jour, repas, aliment, onRetour, onAjoute, onMessage }) {
  const [quantite, setQuantite] = useState(String(aliment.portion_g || 100))
  const [envoi, setEnvoi] = useState(false)
  const q = Number(String(quantite).replace(',', '.')) || 0
  const v = valeursPourQuantite(aliment.pour100, q)
  const choix = [...new Set([aliment.portion_g, 50, 100, 150, 200].filter(Boolean).map(Number))]

  const ajouter = async () => {
    setEnvoi(true)
    onMessage(null)
    try {
      const res = await fetch(`/api/athlete-view/${token}/nutrition/journal`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jour, repas, source: aliment.source, id: aliment.id, quantite_g: q }),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) { onMessage(j.error || 'Ajout impossible.'); return }
      onAjoute(j.entree)
    } catch {
      onMessage('Pas de connexion. Réessaie dans un instant.')
    } finally {
      setEnvoi(false)
    }
  }

  return (
    <>
      <button onClick={onRetour} style={{ background: 'none', border: 'none', color: 'var(--text3)', fontSize: 13, cursor: 'pointer', padding: 0, textAlign: 'left', display: 'flex', alignItems: 'center', gap: 4 }}><CaretLeft size={14} /> Changer d&apos;aliment</button>
      <div>
        <div style={{ fontFamily: 'var(--font-title)', color: 'var(--title)', fontWeight: 700, fontSize: 20 }}>{aliment.nom}</div>
        {aliment.marque ? <div style={{ fontSize: 13, color: 'var(--text3)' }}>{aliment.marque}</div> : null}
      </div>
      <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--text3)' }}>Quantité (g)
        <input value={quantite} onChange={e => setQuantite(e.target.value)} inputMode="decimal" style={{ ...champ, marginTop: 4, fontSize: 22, fontWeight: 800 }} />
      </label>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {choix.map(c => (
          <button key={c} onClick={() => setQuantite(String(c))} style={{ ...boutonClair, padding: '6px 12px', fontSize: 13, background: q === c ? 'var(--green-light)' : 'var(--bg2)' }}>
            {c === aliment.portion_g ? `1 portion (${c} g)` : `${c} g`}
          </button>
        ))}
      </div>
      <div style={{ ...carte, display: 'flex', justifyContent: 'space-between', textAlign: 'center' }}>
        {[['kcal', v.kcal], ['Protéines', v.proteines], ['Glucides', v.glucides], ['Lipides', v.lipides]].map(([l, val]) => (
          <div key={l}><div style={{ fontSize: 18, fontWeight: 800 }}>{fmt(val)}</div><div style={{ fontSize: 11, color: 'var(--text3)' }}>{l}</div></div>
        ))}
      </div>
      <button onClick={ajouter} disabled={envoi || !(q > 0)} style={{ ...boutonPlein, opacity: q > 0 ? 1 : 0.5 }}>
        {envoi ? 'Ajout…' : `Ajouter ${REPAS.find(r => r.key === repas)?.au}`}
      </button>
    </>
  )
}
