'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Target, CalendarBlank, ClipboardText, CheckCircle, X } from '@phosphor-icons/react'
import { supabase } from '@/lib/supabase'
import SwipeCarousel from './athlete/SwipeCarousel'
import Toast from './Toast'
import { UNITS, formatPerformance } from './TrackedMovementsBlock'

function formatDateFr(date) {
  return new Date(date + 'T00:00:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })
}

function timeRemaining(dateStr) {
  const target = new Date(dateStr + 'T00:00:00')
  const now = new Date()
  now.setHours(0, 0, 0, 0)
  const diffDays = Math.round((target - now) / 86400000)
  if (diffDays < 0) return `Échéance dépassée (${Math.abs(diffDays)} j)`
  if (diffDays === 0) return "Aujourd'hui"
  const weeks = Math.floor(diffDays / 7)
  const months = Math.floor(diffDays / 30)
  return `${diffDays} j · ${weeks} sem. · ${months} mois`
}

// Version courte pour la carte carrousel côté athlète ("Dans 1 jour") — le détail (semaines/mois,
// date complète) reste dans la vue coach (timeRemaining/formatDateFr ci-dessus, inchangées).
function shortTimeRemaining(dateStr) {
  const target = new Date(dateStr + 'T00:00:00')
  const now = new Date()
  now.setHours(0, 0, 0, 0)
  const diffDays = Math.round((target - now) / 86400000)
  if (diffDays < 0) return `Échéance dépassée (${Math.abs(diffDays)} j)`
  if (diffDays === 0) return "Aujourd'hui"
  if (diffDays === 1) return 'Dans 1 jour'
  if (diffDays < 14) return `Dans ${diffDays} jours`
  if (diffDays < 60) return `Dans ${Math.round(diffDays / 7)} semaines`
  return `Dans ${Math.round(diffDays / 30)} mois`
}

// Échelle fixe (pas relative à la date de création, qui n'a rien à voir avec le début de la
// préparation) : plus l'échéance est proche, plus la barre est remplie. Au-delà de l'horizon,
// l'objectif est considéré "pas encore commencé" (barre vide) ; à J-0, elle est pleine.
const PROGRESS_HORIZON_DAYS = 180

function progressPercent(targetDate) {
  const end = new Date(targetDate + 'T00:00:00').getTime()
  const daysLeft = (end - Date.now()) / 86400000
  if (daysLeft <= 0) return 100
  return Math.max(0, Math.min(100, 100 * (1 - daysLeft / PROGRESS_HORIZON_DAYS)))
}

// Échéance proche (<= 2 mois) = urgent/actif -> bordeaux ; lointaine ou absente = neutre -> vert-forêt.
// Uniquement pour le rendu carrousel côté athlète (isCoach=false) — la vue coach garde le code
// couleur par priorité (PRIORITY_STYLES), inchangé.
const PROXIMITY_THRESHOLD_DAYS = 60
function proximityAccent(targetDate) {
  if (!targetDate) return { accent: 'var(--vert-foret)', accentLight: 'var(--vert-foret-light)' }
  const daysLeft = (new Date(targetDate + 'T00:00:00').getTime() - Date.now()) / 86400000
  return daysLeft <= PROXIMITY_THRESHOLD_DAYS
    ? { accent: 'var(--bordeaux)', accentLight: 'var(--bordeaux-light)' }
    : { accent: 'var(--vert-foret)', accentLight: 'var(--vert-foret-light)' }
}

const PRIORITY_OPTIONS = [
  { value: 1, label: '1 - Haute' },
  { value: 2, label: '2 - Moyenne' },
  { value: 3, label: '3 - Basse' },
]

const EMOJI_OPTIONS = ['🎯', '🏆', '🔥', '💪', '🚀', '⭐️', '✅', '🏁', '💯', '🥇', '🏃', '🏋️']

function EmojiPicker({ value, onChange }) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
      {EMOJI_OPTIONS.map(e => (
        <button key={e} type="button" onClick={() => onChange(e)} style={{
          width: 30, height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 16, borderRadius: 8, cursor: 'pointer',
          background: value === e ? 'var(--green-light)' : 'var(--bg2)',
          border: `1px solid ${value === e ? 'var(--green)' : 'var(--border2)'}`,
        }}>
          {e}
        </button>
      ))}
    </div>
  )
}

const PRIORITY_STYLES = {
  1: { bg: '#FEF2F2', border: '#FCA5A5', text: '#DC2626', textDate: '#B91C1C', bullet: '#DC2626' },
  2: { bg: '#FFF7ED', border: '#FDBA74', text: '#C2410C', textDate: '#C2410C', bullet: '#EA580C' },
  3: { bg: '#EFF6FF', border: '#93C5FD', text: '#1D4ED8', textDate: '#1D4ED8', bullet: '#2563EB' },
}

const completeFieldInput = {
  padding: '9px 11px', border: '1px solid var(--border2)', borderRadius: 'var(--r)',
  fontSize: 13, outline: 'none', background: 'var(--bg2)', color: 'var(--text)', fontFamily: 'inherit', flex: 1, minWidth: 0,
}

// Saisie du résultat d'un objectif terminé — même logique que MetricResultField (app/s/[token]/page.js,
// utilisé pendant une séance) mais dupliquée ici plutôt qu'importée : ce fichier n'est pas pensé
// comme lib partagée, même convention que documentée dans SessionBlockEditor.js.
// Différence : un bouton "Enregistrer" explicite plutôt qu'un onBlur, cette saisie ne vit que dans
// une modale ponctuelle, pas un champ toujours visible pendant la séance.
function ObjectiveResultInput({ metric, onSave, saving }) {
  const isTime = metric.unit === 'time'
  const cfg = UNITS[metric.unit] || UNITS.kg
  const [h, setH] = useState('')
  const [m, setM] = useState('')
  const [s, setS] = useState('')
  const [val, setVal] = useState('')

  const submit = () => {
    if (isTime) {
      const total = (parseInt(h, 10) || 0) * 3600 + (parseInt(m, 10) || 0) * 60 + (parseInt(s, 10) || 0)
      if (!total) return
      onSave(total)
    } else {
      if (!val) return
      onSave(parseFloat(val))
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.4px' }}>
        Résultat ({cfg.label})
      </div>
      {isTime ? (
        <div style={{ display: 'flex', gap: 6 }}>
          <input type="number" min="0" placeholder="h" value={h} onChange={e => setH(e.target.value)} style={completeFieldInput} />
          <input type="number" min="0" placeholder="min" value={m} onChange={e => setM(e.target.value)} style={completeFieldInput} />
          <input type="number" min="0" placeholder="sec" value={s} onChange={e => setS(e.target.value)} style={completeFieldInput} />
        </div>
      ) : (
        <input type="number" step="0.1" min="0" placeholder={`ex: 10 ${cfg.suffix}`} value={val} onChange={e => setVal(e.target.value)} style={completeFieldInput} />
      )}
      <button onClick={submit} disabled={saving} style={{ background: 'var(--green)', color: '#fff', border: 'none', borderRadius: 'var(--r)', padding: '9px 14px', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
        {saving ? '…' : 'Enregistrer le résultat'}
      </button>
    </div>
  )
}

export default function ObjectivesBlock({ athleteId, objectives, setObjectives, isCoach = true, bare = false }) {
  const [newText, setNewText] = useState('')
  const [newDate, setNewDate] = useState('')
  const [newPriority, setNewPriority] = useState(2)
  const [newEmoji, setNewEmoji] = useState('🎯')
  const [editingId, setEditingId] = useState(null)
  const [editForm, setEditForm] = useState({ text: '', target_date: '', priority: 2, emoji: '🎯' })
  const [saving, setSaving] = useState(false)
  const [showAddForm, setShowAddForm] = useState(false)
  // Finalisation d'un objectif : optionnellement lié à un mouvement suivi (Metrics) pour enregistrer
  // le résultat (ex: temps sur un Hyrox), ou juste marqué terminé sans donnée. Une fois complété
  // (completed_at posé), l'objectif sort de la liste active — voir le filtre sur `sorted` ci-dessous.
  const [completingObj, setCompletingObj] = useState(null)
  const [metricSearch, setMetricSearch] = useState('')
  const [metricSuggestions, setMetricSuggestions] = useState([])
  const [selectedMetric, setSelectedMetric] = useState(null)
  const [completing, setCompleting] = useState(false)
  const [toast, setToast] = useState(null)
  const [newMetricUnit, setNewMetricUnit] = useState('time')
  // Rempli quand une performance n'améliore pas le record actuel : suspend l'enregistrement le
  // temps de demander confirmation dans la modale (remplace l'ancien confirm() natif, hors charte).
  const [pendingResult, setPendingResult] = useState(null)
  // Objectif dont la suppression attend confirmation (voir removeObjective).
  const [deletingObj, setDeletingObj] = useState(null)

  const sorted = [...objectives].filter(o => !o.completed_at).sort((a, b) => {
    if (!a.target_date && !b.target_date) return 0
    if (!a.target_date) return 1
    if (!b.target_date) return -1
    return a.target_date.localeCompare(b.target_date)
  })

  const addObjective = async () => {
    const text = newText.trim()
    if (!text) return
    setSaving(true)
    const { data, error } = await supabase.from('athlete_objectives')
      .insert({ athlete_id: athleteId, text, target_date: newDate || null, priority: newPriority, emoji: newEmoji })
      .select().single()
    if (error) { alert('Erreur : ' + error.message); setSaving(false); return }
    if (data) setObjectives(prev => [...prev, data])
    setNewText(''); setNewDate(''); setNewPriority(2); setNewEmoji('🎯')
    setSaving(false)
    setShowAddForm(false)
  }

  const startEdit = (o) => {
    setEditingId(o.id)
    setEditForm({ text: o.text, target_date: o.target_date || '', priority: o.priority || 2, emoji: o.emoji || '🎯' })
  }

  const saveEdit = async () => {
    if (!editForm.text.trim()) return
    setSaving(true)
    const { data, error } = await supabase.from('athlete_objectives')
      .update({ text: editForm.text.trim(), target_date: editForm.target_date || null, priority: editForm.priority, emoji: editForm.emoji })
      .eq('id', editingId).select().single()
    if (error) { alert('Erreur : ' + error.message); setSaving(false); return }
    if (data) setObjectives(prev => prev.map(o => o.id === editingId ? data : o))
    setEditingId(null)
    setSaving(false)
  }

  // Suppression irréversible et sans historique : on passe par une modale de confirmation plutôt
  // que de supprimer au premier tap sur la croix (retour testeur). Même charte que la modale
  // "performance n'améliorant pas le record" plus bas, pas de confirm() natif.
  const removeObjective = async (id) => {
    setSaving(true)
    const { error } = await supabase.from('athlete_objectives').delete().eq('id', id)
    setSaving(false)
    if (error) { alert('Erreur : ' + error.message); setDeletingObj(null); return }
    setObjectives(prev => prev.filter(o => o.id !== id))
    setDeletingObj(null)
  }

  const openComplete = (obj) => {
    setCompletingObj(obj)
    setMetricSearch('')
    setMetricSuggestions([])
    setSelectedMetric(null)
    setNewMetricUnit('time')
    setPendingResult(null)
  }
  const closeComplete = () => { setCompletingObj(null); setPendingResult(null) }

  const searchMetrics = async (val) => {
    setMetricSearch(val)
    setSelectedMetric(null)
    if (val.trim().length < 2) { setMetricSuggestions([]); return }
    const { data } = await supabase.from('tracked_movements').select('id, name, unit').ilike('name', `%${val.trim()}%`).limit(8)
    setMetricSuggestions(data || [])
  }

  // Crée un nouveau mouvement suivi à la volée si l'objectif correspond à un événement pas encore
  // dans Metrics (ex: premier Hyrox du client) — même geste que "Créer <name>" ailleurs dans l'app
  // (bibliothèque de mouvements, activations...). Unité choisie par le sélecteur juste au-dessus
  // (kg/temps/reps) plutôt qu'imposée à "temps" par défaut — un objectif de force (ex. "Squat à
  // 100kg") tombait sinon sur un champ de saisie h/min/sec inadapté, forçant à sortir corriger
  // l'unité dans Metrics avant de pouvoir revenir enregistrer un résultat.
  const createMetricAndPick = async () => {
    const label = metricSearch.trim()
    if (!label) return
    setCompleting(true)
    const { data: existingLib } = await supabase.from('movements').select('id').ilike('name', label).maybeSingle()
    let libId = existingLib?.id
    if (!libId) {
      const { data: newLib } = await supabase.from('movements').insert({ name: label }).select().single()
      libId = newLib?.id
    }
    const { data, error } = await supabase.from('tracked_movements')
      .insert({ name: label, unit: newMetricUnit, category: 'Autre', movement_id: libId || null })
      .select().single()
    setCompleting(false)
    if (error) { alert('Erreur : ' + error.message); return }
    setSelectedMetric(data)
    setMetricSuggestions([])
  }

  const finishObjective = async (toastMessage) => {
    if (!completingObj) return
    const { error } = await supabase.from('athlete_objectives')
      .update({ completed_at: new Date().toISOString() })
      .eq('id', completingObj.id)
    if (error) { alert('Erreur : ' + error.message); return }
    setObjectives(prev => prev.filter(o => o.id !== completingObj.id))
    setCompletingObj(null)
    setToast(toastMessage || '✓ Objectif marqué comme terminé')
  }

  // Même logique que saveMetricResult (app/s/[token]/page.js) dupliquée ici (voir ObjectiveResultInput
  // plus haut) : détecte si la performance améliore le record actuel. Si non, on ne sauvegarde pas
  // tout de suite — pendingResult suspend l'écriture le temps de demander confirmation dans une
  // modale stylée (voir plus bas), plutôt que le confirm() natif du navigateur utilisé avant (seul
  // endroit de cet écran hors charte visuelle).
  const saveObjectiveResult = async (value) => {
    if (!selectedMetric || value == null || isNaN(value)) return
    setCompleting(true)
    const cfg = UNITS[selectedMetric.unit] || UNITS.kg
    const { data: entries } = await supabase.from('tracked_movement_entries')
      .select('id, value, date').eq('tracked_movement_id', selectedMetric.id).eq('athlete_id', athleteId)
    setCompleting(false)
    const vals = (entries || []).map(e => e.value).filter(v => v != null)
    const currentBest = vals.length ? (cfg.betterIsHigher ? Math.max(...vals) : Math.min(...vals)) : null
    const isNewRecord = currentBest == null || (cfg.betterIsHigher ? value > currentBest : value < currentBest)
    if (!isNewRecord && currentBest != null) {
      setPendingResult({ value, entries, currentBest })
      return
    }
    commitObjectiveResult({ value, entries, markAsPr: false, showTrophy: isNewRecord })
  }

  // Confirmation explicite ("Oui, enregistrer quand même") depuis la modale — équivalent du choix
  // "ok" dans l'ancien confirm() natif.
  const confirmNonImprovingResult = () => {
    if (!pendingResult) return
    commitObjectiveResult({ value: pendingResult.value, entries: pendingResult.entries, markAsPr: true, showTrophy: true })
  }

  const commitObjectiveResult = async ({ value, entries, markAsPr, showTrophy }) => {
    setCompleting(true)
    const date = new Date().toISOString().slice(0, 10)
    const existingToday = (entries || []).find(e => e.date === date)
    const payload = { tracked_movement_id: selectedMetric.id, athlete_id: athleteId, date, value }
    if (markAsPr) {
      await supabase.from('tracked_movement_entries').update({ is_pr: false })
        .eq('tracked_movement_id', selectedMetric.id).eq('athlete_id', athleteId)
      payload.is_pr = true
    }
    const { error } = existingToday
      ? await supabase.from('tracked_movement_entries').update(payload).eq('id', existingToday.id)
      : await supabase.from('tracked_movement_entries').insert(payload)
    setCompleting(false)
    setPendingResult(null)
    if (error) { alert('Erreur : ' + error.message); return }
    finishObjective(
      showTrophy
        ? `🏆 Nouveau record : ${formatPerformance(selectedMetric, value)} !`
        : `✓ Résultat enregistré : ${formatPerformance(selectedMetric, value)}`
    )
  }

  const inputStyle = {
    padding: '9px 11px', border: '1px solid var(--border2)', borderRadius: 'var(--r)',
    fontSize: 13, outline: 'none', background: 'var(--bg2)', color: 'var(--text)', fontFamily: 'inherit',
  }

  const content = (
    <>
      <div style={{ padding: bare ? 0 : 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
        {sorted.length === 0 && (
          <div style={{ fontSize: 13, color: 'var(--text3)', fontStyle: 'italic' }}>Aucun objectif défini</div>
        )}

        {isCoach && sorted.map(obj => {
          const isTop = obj.priority === 1
          const isEditing = editingId === obj.id
          const style = PRIORITY_STYLES[obj.priority] || PRIORITY_STYLES[2]
          return (
            <div key={obj.id} style={{ display: 'flex', alignItems: 'stretch', gap: 6 }}>
            <div style={{ background: style.bg, border: `1px solid ${style.border}`, borderRadius: 'var(--r)', padding: '10px 12px', flex: 1, minWidth: 0 }}>
              {isEditing ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <input autoFocus value={editForm.text} onChange={e => setEditForm(f => ({ ...f, text: e.target.value }))}
                    onKeyDown={e => e.key === 'Enter' && saveEdit()} style={inputStyle} />
                  <div style={{ display: 'flex', gap: 8 }}>
                    <input type="date" value={editForm.target_date} onChange={e => setEditForm(f => ({ ...f, target_date: e.target.value }))} style={{ ...inputStyle, flex: 1 }} />
                    <select value={editForm.priority} onChange={e => setEditForm(f => ({ ...f, priority: parseInt(e.target.value) }))} style={{ ...inputStyle, width: 120 }}>
                      {PRIORITY_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                  </div>
                  <EmojiPicker value={editForm.emoji} onChange={e => setEditForm(f => ({ ...f, emoji: e }))} />
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button onClick={() => setEditingId(null)} style={{ background: 'none', border: '1px solid var(--border2)', color: 'var(--text3)', borderRadius: 'var(--r)', padding: '7px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>Annuler</button>
                    <button onClick={saveEdit} disabled={saving} style={{ background: 'var(--green)', color: '#fff', border: 'none', borderRadius: 'var(--r)', padding: '7px 14px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>{saving ? '…' : 'Enregistrer'}</button>
                  </div>
                </div>
              ) : (
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                  <span style={{ color: style.bullet, fontSize: 14, marginTop: 1, flexShrink: 0 }}>▸</span>
                  <div style={{ flex: 1, minWidth: 0, cursor: 'pointer' }} onClick={() => startEdit(obj)} title="Cliquer pour modifier">
                    <div style={{ fontSize: isTop ? 16 : 14, fontWeight: isTop ? 800 : 600, color: style.text, lineHeight: 1.4, wordBreak: 'break-word' }}>
                      {obj.text}
                    </div>
                    {obj.target_date && (
                      <>
                        <div style={{ fontSize: 11, color: style.textDate, marginTop: 3, display: 'flex', alignItems: 'center', gap: 4 }}>
                          <CalendarBlank size={11} /> {formatDateFr(obj.target_date)} · {timeRemaining(obj.target_date)}
                        </div>
                        <div style={{ position: 'relative', marginTop: 14, marginBottom: 4, paddingTop: 6 }}>
                          <div style={{ height: 6, borderRadius: 20, background: 'rgba(255,255,255,0.6)', overflow: 'hidden' }}>
                            <div style={{
                              height: '100%', borderRadius: 20, background: style.bullet,
                              width: `${progressPercent(obj.target_date)}%`, transition: 'width 0.3s',
                            }} />
                          </div>
                          <div style={{
                            position: 'absolute', top: 0, fontSize: 15, lineHeight: 1,
                            left: `${progressPercent(obj.target_date)}%`, transform: 'translate(-50%, -50%)',
                          }}>
                            {obj.emoji || '🎯'}
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                  <button onClick={() => openComplete(obj)} title="Marquer comme terminé" style={{ background: 'none', border: 'none', color: 'var(--green)', display: 'flex', cursor: 'pointer', padding: 0, flexShrink: 0 }}><CheckCircle size={17} /></button>
                  <button onClick={() => setDeletingObj(obj)} title="Supprimer" style={{ background: 'none', border: 'none', color: 'var(--text3)', fontSize: 16, cursor: 'pointer', padding: 0, flexShrink: 0, lineHeight: 1 }}>×</button>
                </div>
              )}
            </div>
            {!isEditing && (
              <Link href={`/programs/${athleteId}?objective=${obj.id}`} title="Programmer cet objectif"
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 40, flexShrink: 0, background: 'var(--bg2)', border: '1px solid var(--border2)', borderRadius: 'var(--r)', textDecoration: 'none' }}>
                <ClipboardText size={16} />
              </Link>
            )}
            </div>
          )
        })}

        {/* Carrousel swipe côté athlète (isCoach=false) — pattern réutilisable partagé avec la
            page Performances (SwipeCarousel). Couleur par proximité d'échéance (bordeaux/vert-forêt)
            au lieu du code couleur par priorité utilisé côté coach ci-dessus. */}
        {!isCoach && sorted.length > 0 && (
          <SwipeCarousel
            activeColor="var(--bordeaux)"
            peek
            slides={sorted.map(obj => {
              const isEditing = editingId === obj.id
              const { accent, accentLight } = proximityAccent(obj.target_date)
              return {
                key: obj.id,
                content: (
                  <div style={{ background: accentLight, border: `1px solid ${accent}`, borderRadius: 'var(--ostryk-card-radius)', padding: '14px 16px', margin: '0 2px' }}>
                    {isEditing ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        <input autoFocus value={editForm.text} onChange={e => setEditForm(f => ({ ...f, text: e.target.value }))}
                          onKeyDown={e => e.key === 'Enter' && saveEdit()} style={inputStyle} />
                        <div style={{ display: 'flex', gap: 8 }}>
                          <input type="date" value={editForm.target_date} onChange={e => setEditForm(f => ({ ...f, target_date: e.target.value }))} style={{ ...inputStyle, flex: 1 }} />
                        </div>
                        <EmojiPicker value={editForm.emoji} onChange={e => setEditForm(f => ({ ...f, emoji: e }))} />
                        <div style={{ display: 'flex', gap: 8 }}>
                          <button onClick={() => setEditingId(null)} style={{ background: 'none', border: '1px solid var(--ostryk-border-input)', color: 'var(--ostryk-text2)', borderRadius: 'var(--r)', padding: '7px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>Annuler</button>
                          <button onClick={saveEdit} disabled={saving} style={{ background: 'var(--bordeaux)', color: '#fff', border: 'none', borderRadius: 'var(--r)', padding: '7px 14px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>{saving ? '…' : 'Enregistrer'}</button>
                        </div>
                      </div>
                    ) : (
                      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                        <div style={{ flex: 1, minWidth: 0, cursor: 'pointer' }} onClick={() => startEdit(obj)} title="Toucher pour modifier">
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontFamily: 'var(--font-title)', fontWeight: 600, fontSize: 20, color: accent, lineHeight: 1.3, wordBreak: 'break-word' }}>
                            <span>{obj.emoji || '🎯'}</span> {obj.text}
                          </div>
                          {obj.target_date && (
                            <>
                              <div style={{ fontSize: 13, color: 'var(--ostryk-text2)', marginTop: 5 }}>
                                {shortTimeRemaining(obj.target_date)}
                              </div>
                              <div style={{ height: 6, borderRadius: 'var(--ostryk-pill-radius)', background: 'rgba(255,255,255,0.6)', overflow: 'hidden', marginTop: 10 }}>
                                <div style={{
                                  height: '100%', borderRadius: 'var(--ostryk-pill-radius)', background: accent,
                                  width: `${progressPercent(obj.target_date)}%`, transition: 'width 0.3s',
                                }} />
                              </div>
                            </>
                          )}
                        </div>
                        <button onClick={() => openComplete(obj)} title="Marquer comme terminé" style={{ background: 'none', border: 'none', color: 'var(--vert-foret)', display: 'flex', cursor: 'pointer', padding: 0, flexShrink: 0 }}><CheckCircle size={18} /></button>
                        <button onClick={() => setDeletingObj(obj)} title="Supprimer" style={{ background: 'none', border: 'none', color: 'var(--ostryk-text3)', fontSize: 16, cursor: 'pointer', padding: 0, flexShrink: 0, lineHeight: 1 }}>×</button>
                      </div>
                    )}
                  </div>
                ),
              }
            })}
          />
        )}

        {/* Formulaire ajout */}
        {showAddForm ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: sorted.length > 0 ? 4 : 0 }}>
            <input
              autoFocus
              value={newText}
              onChange={e => setNewText(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && addObjective()}
              placeholder="Ajouter un objectif…"
              style={inputStyle}
            />
            <div style={{ display: 'flex', gap: 8 }}>
              <input type="date" value={newDate} onChange={e => setNewDate(e.target.value)} style={{ ...inputStyle, flex: 1 }} />
              <select value={newPriority} onChange={e => setNewPriority(parseInt(e.target.value))} style={{ ...inputStyle, width: 120 }}>
                {PRIORITY_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            <EmojiPicker value={newEmoji} onChange={setNewEmoji} />
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => { setShowAddForm(false); setNewText(''); setNewDate(''); setNewPriority(2); setNewEmoji('🎯') }}
                style={{ background: 'none', border: '1px solid var(--border2)', color: 'var(--text3)', borderRadius: 'var(--r)', padding: '9px 14px', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                Annuler
              </button>
              <button onClick={addObjective} disabled={saving || !newText.trim()}
                style={{ background: newText.trim() ? (isCoach ? 'var(--green)' : 'var(--bordeaux)') : 'var(--border2)', color: '#fff', border: 'none', borderRadius: 'var(--r)', padding: '9px 16px', fontSize: 13, fontWeight: 700, cursor: 'pointer', flexShrink: 0, marginLeft: 'auto' }}>
                {saving ? '…' : '+ Ajouter'}
              </button>
            </div>
          </div>
        ) : (
          <button onClick={() => setShowAddForm(true)} style={{
            marginTop: sorted.length > 0 ? 4 : 0,
            background: isCoach ? 'var(--bg2)' : 'var(--card-white)',
            border: `1px dashed ${isCoach ? 'var(--border2)' : 'var(--ostryk-border-input)'}`,
            color: isCoach ? 'var(--text2)' : 'var(--ostryk-text2)', borderRadius: isCoach ? 'var(--r)' : 'var(--ostryk-card-radius)', padding: '10px', fontSize: 13, fontWeight: 700, cursor: 'pointer',
          }}>
            + Ajouter un objectif
          </button>
        )}
      </div>

      {completingObj && (
        <div onClick={closeComplete} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 500, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: 'var(--bg)', borderRadius: 'var(--rl)', padding: 20, width: '100%', maxWidth: 420, maxHeight: '80vh', overflowY: 'auto', boxShadow: '0 8px 40px rgba(0,0,0,0.2)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <div style={{ flex: 1, fontFamily: 'var(--font-title)', color: 'var(--title)', fontWeight: 700, fontSize: 17 }}>Marquer comme terminé</div>
              <button onClick={closeComplete} style={{ background: 'none', border: 'none', fontSize: 20, color: 'var(--text3)', cursor: 'pointer', padding: 0, lineHeight: 1, display: 'flex' }}><X size={18} /></button>
            </div>
            <div style={{ fontSize: 13, color: 'var(--text3)', marginBottom: 16 }}>« {completingObj.text} »</div>

            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: 6 }}>
              Résultat (optionnel)
            </div>
            <div style={{ position: 'relative', marginBottom: 12 }}>
              <input
                placeholder="Chercher un mouvement suivi (ex: Hyrox, Triathlon M…)"
                value={metricSearch}
                onChange={e => searchMetrics(e.target.value)}
                style={{ ...inputStyle, width: '100%', boxSizing: 'border-box' }}
              />
              {metricSearch.trim().length >= 2 && !selectedMetric && (
                <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: 'var(--bg)', border: '1px solid var(--border2)', borderRadius: 'var(--r)', boxShadow: '0 4px 16px rgba(0,0,0,.12)', zIndex: 50, overflow: 'hidden', marginTop: 2 }}>
                  {metricSuggestions.map(m => (
                    <button key={m.id} onMouseDown={() => setSelectedMetric(m)}
                      style={{ display: 'block', width: '100%', padding: '9px 11px', textAlign: 'left', background: 'none', border: 'none', borderBottom: '1px solid var(--border)', fontSize: 13, fontWeight: 600, color: 'var(--text)', cursor: 'pointer' }}>
                      {m.name}
                    </button>
                  ))}
                  {!metricSuggestions.some(m => m.name.toLowerCase() === metricSearch.trim().toLowerCase()) && (
                    <div style={{ background: 'var(--bg2)', padding: '8px 11px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                      <div style={{ display: 'flex', gap: 4 }}>
                        {[{ key: 'kg', label: 'Kg' }, { key: 'time', label: 'Temps' }, { key: 'reps', label: 'Reps' }].map(u => (
                          <button key={u.key} type="button" onMouseDown={e => { e.preventDefault(); setNewMetricUnit(u.key) }} style={{
                            flex: 1, padding: '5px 0', borderRadius: 20, fontSize: 11, fontWeight: 700, cursor: 'pointer',
                            border: `1px solid ${newMetricUnit === u.key ? 'var(--green)' : 'var(--border2)'}`,
                            background: newMetricUnit === u.key ? 'var(--green-light)' : 'var(--bg)',
                            color: newMetricUnit === u.key ? 'var(--green)' : 'var(--text3)',
                          }}>
                            {u.label}
                          </button>
                        ))}
                      </div>
                      <button onMouseDown={createMetricAndPick}
                        style={{ display: 'block', width: '100%', padding: '9px 11px', textAlign: 'left', background: 'none', border: 'none', fontSize: 13, fontWeight: 700, color: 'var(--green)', cursor: 'pointer' }}>
                        + Créer « {metricSearch.trim()} »
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>

            {selectedMetric && !pendingResult && (
              <div style={{ marginBottom: 16 }}>
                <ObjectiveResultInput metric={selectedMetric} saving={completing} onSave={saveObjectiveResult} />
              </div>
            )}

            {pendingResult && (
              <div style={{ background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: 'var(--r)', padding: '12px 14px', marginBottom: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div style={{ fontSize: 13, color: '#92400E' }}>
                  Cette performance ({formatPerformance(selectedMetric, pendingResult.value)}) n&apos;améliore pas le record actuel
                  ({formatPerformance(selectedMetric, pendingResult.currentBest)}). L&apos;enregistrer quand même comme record affiché ?
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={() => setPendingResult(null)} disabled={completing} style={{
                    flex: 1, background: 'none', border: '1px solid var(--border2)', color: 'var(--text2)',
                    borderRadius: 'var(--r)', padding: '8px', fontSize: 12, fontWeight: 700, cursor: 'pointer',
                  }}>
                    Annuler
                  </button>
                  <button onClick={confirmNonImprovingResult} disabled={completing} style={{
                    flex: 1, background: '#92400E', color: '#fff', border: 'none',
                    borderRadius: 'var(--r)', padding: '8px', fontSize: 12, fontWeight: 700, cursor: 'pointer',
                  }}>
                    {completing ? '…' : 'Oui, enregistrer'}
                  </button>
                </div>
              </div>
            )}

            <button onClick={() => finishObjective()} disabled={completing} style={{
              width: '100%', background: 'none', border: '1px solid var(--border2)', color: 'var(--text2)',
              borderRadius: 'var(--r)', padding: '10px', fontSize: 13, fontWeight: 700, cursor: 'pointer',
            }}>
              Terminé sans résultat
            </button>
          </div>
        </div>
      )}
      {deletingObj && (
        <div onClick={() => setDeletingObj(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 500, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: 'var(--bg)', borderRadius: 'var(--rl)', padding: 20, width: '100%', maxWidth: 380, boxShadow: '0 8px 40px rgba(0,0,0,0.2)' }}>
            <div style={{ fontFamily: 'var(--font-title)', color: 'var(--title)', fontSize: 17, fontWeight: 700, marginBottom: 6 }}>
              Supprimer cet objectif ?
            </div>
            <div style={{ fontSize: 13, color: 'var(--text3)', marginBottom: 16 }}>
              « {deletingObj.emoji || '🎯'} {deletingObj.text} » sera définitivement supprimé. Si tu l&apos;as atteint, utilise plutôt ✓ pour le marquer comme terminé et garder le résultat.
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => setDeletingObj(null)} disabled={saving} style={{
                flex: 1, background: 'none', border: '1px solid var(--border2)', color: 'var(--text2)',
                borderRadius: 'var(--r)', padding: '10px', fontSize: 13, fontWeight: 700, cursor: 'pointer',
              }}>
                Annuler
              </button>
              <button onClick={() => removeObjective(deletingObj.id)} disabled={saving} style={{
                flex: 1, background: '#DC2626', color: '#fff', border: 'none',
                borderRadius: 'var(--r)', padding: '10px', fontSize: 13, fontWeight: 700, cursor: 'pointer',
              }}>
                {saving ? '…' : 'Supprimer'}
              </button>
            </div>
          </div>
        </div>
      )}
      <Toast message={toast} show={!!toast} onDone={() => setToast(null)} />
    </>
  )

  if (bare) return content

  return (
    <div style={{
      background: isCoach ? 'var(--bg)' : 'var(--card-white)',
      border: `1px solid ${isCoach ? 'var(--border)' : 'var(--ostryk-border)'}`,
      borderRadius: isCoach ? 'var(--rl)' : 'var(--ostryk-card-radius)', overflow: 'hidden',
    }}>
      <div style={{ padding: '12px 14px', borderBottom: `1px solid ${isCoach ? 'var(--border)' : 'var(--ostryk-border)'}` }}>
        {isCoach ? (
          <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.4px', display: 'inline-flex', alignItems: 'center', gap: 5 }}><Target size={13} /> Objectifs</span>
        ) : (
          <span style={{ fontFamily: 'var(--font-title)', fontWeight: 600, fontSize: 15, color: 'var(--bordeaux)', display: 'inline-flex', alignItems: 'center', gap: 6 }}><Target size={14} weight="light" color="var(--vert-foret)" /> Objectifs</span>
        )}
      </div>
      {content}
    </div>
  )
}
