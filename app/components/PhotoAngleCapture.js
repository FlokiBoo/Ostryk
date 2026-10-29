'use client'

import { useState, useRef, forwardRef, useImperativeHandle } from 'react'
import { Camera } from '@phosphor-icons/react'

function angleBetween(a, b, c) {
  const v1 = { x: a.x - b.x, y: a.y - b.y }
  const v2 = { x: c.x - b.x, y: c.y - b.y }
  const dot = v1.x * v2.x + v1.y * v2.y
  const mag1 = Math.hypot(v1.x, v1.y)
  const mag2 = Math.hypot(v2.x, v2.y)
  const cos = Math.max(-1, Math.min(1, dot / (mag1 * mag2)))
  return (Math.acos(cos) * 180) / Math.PI
}

function isCCW(a1, a2) {
  let diff = a2 - a1
  while (diff < -Math.PI) diff += 2 * Math.PI
  while (diff > Math.PI) diff -= 2 * Math.PI
  return diff < 0
}

// Découpe `text` (peut contenir des \n explicites) en lignes qui tiennent dans maxWidth avec la
// police déjà réglée sur ctx.
function wrapText(ctx, text, maxWidth) {
  const lines = []
  text.split('\n').forEach(paragraph => {
    const words = paragraph.split(/\s+/).filter(Boolean)
    if (!words.length) { lines.push(''); return }
    let current = ''
    words.forEach(word => {
      const test = current ? `${current} ${word}` : word
      if (current && ctx.measureText(test).width > maxWidth) {
        lines.push(current)
        current = word
      } else {
        current = test
      }
    })
    if (current) lines.push(current)
  })
  return lines
}

// Place 3 points sur une photo (origine → sommet → extrémité) et calcule l'angle au sommet.
// Composant partagé entre GoniometerView (test articulaire suivi) et QuickAngleModal (mesure
// ponctuelle sans sauvegarde).
const PhotoAngleCapture = forwardRef(function PhotoAngleCapture({ onAngleChange }, ref) {
  const canvasRef = useRef(null)
  const stageRef = useRef(null)
  const fileInputRef = useRef(null)
  const imgRef = useRef(null)
  const pointsRef = useRef([])
  const dragIndexRef = useRef(-1)
  const [hasImage, setHasImage] = useState(false)
  const [pointCount, setPointCount] = useState(0)
  const [angle, setAngle] = useState(null)
  const [note, setNote] = useState('')
  // 'en_cours' | 'ok' | null. Le téléchargement prend un instant (composition + encodage PNG) sans
  // rien afficher : on retapait le bouton et l'image partait deux fois (retour terrain).
  const [telechargement, setTelechargement] = useState(null)
  const telechargementRef = useRef(false)

  useImperativeHandle(ref, () => ({
    getSnapshot() {
      if (angle == null || !canvasRef.current) return null
      return new Promise(resolve => {
        canvasRef.current.toBlob(blob => resolve({ angle, blob }), 'image/jpeg', 0.85)
      })
    },
    reset() {
      pointsRef.current = []
      setPointCount(0)
      setAngle(null)
      setNote('')
      onAngleChange(null)
      draw()
    },
  }))

  function draw() {
    const canvas = canvasRef.current
    const img = imgRef.current
    if (!canvas || !img) return
    const ctx = canvas.getContext('2d')
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height)

    const points = pointsRef.current
    if (points.length >= 2) {
      ctx.strokeStyle = '#3FC1B0'
      ctx.lineWidth = 2.5
      ctx.beginPath()
      ctx.moveTo(points[0].x, points[0].y)
      ctx.lineTo(points[1].x, points[1].y)
      ctx.stroke()
    }
    if (points.length === 3) {
      ctx.beginPath()
      ctx.moveTo(points[1].x, points[1].y)
      ctx.lineTo(points[2].x, points[2].y)
      ctx.stroke()

      const angA = Math.atan2(points[0].y - points[1].y, points[0].x - points[1].x)
      const angC = Math.atan2(points[2].y - points[1].y, points[2].x - points[1].x)
      ctx.beginPath()
      ctx.strokeStyle = '#F2A93B'
      ctx.lineWidth = 2
      ctx.arc(points[1].x, points[1].y, 34, angA, angC, isCCW(angA, angC))
      ctx.stroke()
    }

    const labels = ['A', 'B', 'C']
    points.forEach((p, i) => {
      ctx.beginPath()
      ctx.arc(p.x, p.y, 9, 0, Math.PI * 2)
      ctx.fillStyle = i === 1 ? '#F2A93B' : '#EDEFF2'
      ctx.fill()
      ctx.lineWidth = 2
      ctx.strokeStyle = '#0D1117'
      ctx.stroke()
      ctx.font = '600 13px "IBM Plex Mono", monospace'
      ctx.fillStyle = '#EDEFF2'
      ctx.textAlign = 'center'
      ctx.fillText(labels[i], p.x, p.y - 16)
    })
  }

  function setupCanvas() {
    const canvas = canvasRef.current
    const stage = stageRef.current
    const img = imgRef.current
    const maxW = stage.clientWidth - 2
    const maxH = stage.clientHeight - 2
    const ratio = Math.min(maxW / img.width, maxH / img.height, 1) || 1
    canvas.width = img.width * ratio
    canvas.height = img.height * ratio
    pointsRef.current = []
    setPointCount(0)
    setAngle(null)
    setNote('')
    onAngleChange(null)
    setHasImage(true)
    draw()
  }

  function handleFile(e) {
    const file = e.target.files[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      const img = new Image()
      img.onload = () => { imgRef.current = img; setupCanvas() }
      img.src = ev.target.result
    }
    reader.readAsDataURL(file)
  }

  function getPos(e) {
    const canvas = canvasRef.current
    const rect = canvas.getBoundingClientRect()
    const scaleX = canvas.width / rect.width
    const scaleY = canvas.height / rect.height
    return { x: (e.clientX - rect.left) * scaleX, y: (e.clientY - rect.top) * scaleY }
  }

  function hitTestPoint(pos) {
    const points = pointsRef.current
    for (let i = 0; i < points.length; i++) {
      if (Math.hypot(points[i].x - pos.x, points[i].y - pos.y) < 22) return i
    }
    return -1
  }

  function computeAngle() {
    const points = pointsRef.current
    const a = angleBetween(points[0], points[1], points[2])
    setAngle(a)
    onAngleChange(a)
  }

  function onPointerDown(e) {
    if (!imgRef.current) return
    const pos = getPos(e)
    const hit = hitTestPoint(pos)
    if (hit !== -1) {
      dragIndexRef.current = hit
    } else if (pointsRef.current.length < 3) {
      pointsRef.current = [...pointsRef.current, pos]
      setPointCount(pointsRef.current.length)
      draw()
      if (pointsRef.current.length === 3) computeAngle()
    }
  }

  function onPointerMove(e) {
    if (dragIndexRef.current === -1) return
    const pos = getPos(e)
    pointsRef.current[dragIndexRef.current] = pos
    draw()
    if (pointsRef.current.length === 3) computeAngle()
  }

  function onPointerUp() { dragIndexRef.current = -1 }

  function undoPoint() {
    pointsRef.current = pointsRef.current.slice(0, -1)
    setPointCount(pointsRef.current.length)
    setAngle(null)
    onAngleChange(null)
    draw()
  }

  // Compose la photo annotée + un panneau texte (angle + note libre) dans un seul canvas, puis
  // déclenche le téléchargement — pour pouvoir partager la mesure sans capture d'écran manuelle.
  async function downloadImage() {
    const canvas = canvasRef.current
    if (!canvas || angle == null || telechargementRef.current) return
    // Verrou synchrone : deux appuis rapprochés arrivent avant le re-rendu qui grise le bouton.
    telechargementRef.current = true
    setTelechargement('en_cours')

    const panelWidth = 320
    const padding = 24
    const composite = document.createElement('canvas')
    composite.width = canvas.width + panelWidth
    composite.height = Math.max(canvas.height, 200)
    const ctx = composite.getContext('2d')
    ctx.fillStyle = '#161B22'
    ctx.fillRect(0, 0, composite.width, composite.height)
    ctx.drawImage(canvas, 0, 0)

    let y = padding
    ctx.textAlign = 'left'
    ctx.textBaseline = 'top'
    ctx.font = '700 34px "IBM Plex Mono", monospace'
    ctx.fillStyle = '#F2A93B'
    ctx.fillText(`${angle.toFixed(1)}°`, canvas.width + padding, y)
    y += 56

    if (note.trim()) {
      ctx.strokeStyle = '#2A3140'
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(canvas.width + padding, y)
      ctx.lineTo(composite.width - padding, y)
      ctx.stroke()
      y += 20

      ctx.font = '15px -apple-system, sans-serif'
      ctx.fillStyle = '#EDEFF2'
      const lines = wrapText(ctx, note.trim(), panelWidth - padding * 2)
      lines.forEach(line => {
        if (y > composite.height - padding) return
        ctx.fillText(line, canvas.width + padding, y)
        y += 22
      })
    }

    const nom = `angle-${angle.toFixed(0)}deg.png`
    let fait = false
    try {
      const blob = await new Promise(resolve => composite.toBlob(resolve, 'image/png'))
      if (!blob) return
      // Sur téléphone (et dans les apps iOS/Android, où un lien de téléchargement ne fait rien),
      // la feuille de partage du système propose Enregistrer l'image / Envoyer — comme le PDF de
      // séance (lib/seancePdf.js). Sinon, téléchargement classique.
      const fichier = new File([blob], nom, { type: 'image/png' })
      const mobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent)
      if (mobile && navigator.canShare?.({ files: [fichier] })) {
        try {
          await navigator.share({ files: [fichier] })
          fait = true
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
      // Révoquer tout de suite peut couper le téléchargement avant que le navigateur l'ait lu.
      setTimeout(() => URL.revokeObjectURL(url), 1000)
      fait = true
    } finally {
      telechargementRef.current = false
      setTelechargement(fait ? 'ok' : null)
      if (fait) setTimeout(() => setTelechargement(t => (t === 'ok' ? null : t)), 2000)
    }
  }

  const hints = [
    "Place le point A (origine du segment)",
    "Place le point B (sommet — c'est ici que l'angle se calcule)",
    "Place le point C (extrémité du deuxième segment)",
  ]

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, padding: '0 20px', gap: 10 }}>
      <div style={{ flex: 1, display: 'flex', gap: 12, minHeight: 0, flexWrap: 'wrap' }}>
        <div ref={stageRef} style={{
          flex: '2 1 240px', position: 'relative', borderRadius: 14, overflow: 'hidden', background: '#161B22',
          border: '1px solid #2A3140', display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 240,
        }}>
          {/* Le canvas reste monté même sans image (juste masqué) : setupCanvas() est appelé depuis
              img.onload, donc s'il n'existait dans le DOM qu'après hasImage=true, canvasRef.current
              serait encore null au premier chargement — plantage ("Cannot set properties of null"). */}
          {!hasImage && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14, padding: 30, textAlign: 'center' }}>
              <Camera size={34} />
              <p style={{ color: '#7C8493', fontSize: 13, margin: 0, maxWidth: 220, lineHeight: 1.5 }}>
                Charge une photo, place 3 points : origine → sommet → extrémité. L&apos;angle se calcule au sommet.
              </p>
              <button onClick={() => fileInputRef.current?.click()} style={{ background: '#F2A93B', color: '#1a1400', border: 'none', borderRadius: 10, padding: '12px 24px', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
                Charger une photo
              </button>
            </div>
          )}
          <canvas
            ref={canvasRef}
            style={{ maxWidth: '100%', maxHeight: '100%', touchAction: 'none', display: hasImage ? 'block' : 'none' }}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerLeave={onPointerUp}
          />
          {/* Superposé directement sur la photo (pas seulement affiché sous la stage) : sur certains
              écrans, la zone photo + le reste du panneau dépasse la hauteur visible et le nombre
              affiché plus bas se retrouve hors-écran (retour terrain : "j'ai les points mais pas
              l'angle en nombre") — ce badge reste visible sans avoir à faire défiler. */}
          {hasImage && angle != null && (
            <div style={{
              position: 'absolute', top: 10, left: 10, background: 'rgba(13,17,23,0.85)',
              border: '1px solid #F2A93B', borderRadius: 10, padding: '5px 12px', pointerEvents: 'none',
              fontFamily: "'IBM Plex Mono', monospace", fontSize: 22, fontWeight: 700, color: '#F2A93B',
            }}>
              {angle.toFixed(1)}°
            </div>
          )}
          {/* Pas d'attribut "capture" : sur mobile il force l'ouverture directe de l'appareil photo et
              empêche de choisir une image déjà existante (ex. un screenshot) dans la photothèque.
              display:none plutôt qu'un positionnement hors-écran : sur WKWebView (app iOS), un input
              file cliqué par programmation (fileInputRef.current.click()) alors qu'il est display:none
              peut ne pas ouvrir le sélecteur — on le garde techniquement visible (opacité nulle, 1px,
              hors du flux) pour que le déclenchement synthétique reste fiable. */}
          <input ref={fileInputRef} type="file" accept="image/*"
            style={{ position: 'absolute', width: 1, height: 1, padding: 0, margin: -1, overflow: 'hidden', clip: 'rect(0,0,0,0)', border: 0, opacity: 0 }}
            onChange={handleFile} />
        </div>

        {hasImage && (
          <div style={{ flex: '1 1 200px', display: 'flex', flexDirection: 'column', minHeight: 160 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#7C8493', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: 6 }}>
              Notes
            </div>
            <textarea
              value={note}
              onChange={e => setNote(e.target.value)}
              placeholder="Observations, consignes, contexte…"
              style={{
                flex: 1, resize: 'none', borderRadius: 14, border: '1px solid #2A3140', background: '#161B22',
                color: '#EDEFF2', fontSize: 13, lineHeight: 1.6, padding: 14, outline: 'none', fontFamily: 'inherit',
              }}
            />
          </div>
        )}
      </div>

      {hasImage && (
        <>
          <div style={{ textAlign: 'center', color: '#7C8493', fontSize: 11 }}>
            {pointCount < 3 ? hints[pointCount] : "Glisse les points pour ajuster · angle recalculé en direct"}
          </div>
          {angle != null && (
            <div style={{ textAlign: 'center' }}>
              <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 40, fontWeight: 600 }}>{angle.toFixed(1)}</span>
              <sup style={{ fontSize: 18, color: '#7C8493' }}>°</sup>
            </div>
          )}
          {/* flexWrap + flex-basis (pas juste flex:1) : sans ça, 3 boutons avec du texte ne
              rétrécissent pas sous leur largeur de contenu sur un écran étroit et débordent hors
              de l'écran au lieu de passer à la ligne (retour terrain : bouton Télécharger coupé). */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            <button onClick={undoPoint} disabled={pointCount === 0} style={{ flex: '1 1 100px', minWidth: 0, padding: '11px 8px', borderRadius: 10, border: '1px solid #2A3140', background: 'transparent', color: '#7C8493', fontSize: 12, fontWeight: 600, cursor: pointCount === 0 ? 'default' : 'pointer', opacity: pointCount === 0 ? 0.4 : 1, fontFamily: 'inherit' }}>
              Annuler point
            </button>
            <button onClick={() => fileInputRef.current?.click()} style={{ flex: '1 1 100px', minWidth: 0, padding: '11px 8px', borderRadius: 10, border: '1px solid #3FC1B0', background: 'transparent', color: '#3FC1B0', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
              Nouvelle photo
            </button>
            <button onClick={downloadImage} disabled={angle == null || telechargement === 'en_cours'} title={angle == null ? 'Place les 3 points pour pouvoir télécharger' : ''} style={{
              flex: '1 1 100px', minWidth: 0, padding: '11px 8px', borderRadius: 10, border: '1px solid #F2A93B', background: 'transparent',
              color: '#F2A93B', fontSize: 12, fontWeight: 600, cursor: angle == null || telechargement === 'en_cours' ? 'default' : 'pointer',
              opacity: angle == null || telechargement === 'en_cours' ? 0.4 : 1, fontFamily: 'inherit',
            }}>
              {telechargement === 'en_cours' ? 'Préparation…' : telechargement === 'ok' ? '✓ Image prête' : '⬇ Télécharger'}
            </button>
          </div>
        </>
      )}
    </div>
  )
})

export default PhotoAngleCapture
