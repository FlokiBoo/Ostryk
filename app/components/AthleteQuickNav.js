'use client'

import { useState, useEffect } from 'react'
import { User, ChartLineUp, Ruler, Bone, Key, EnvelopeSimple, PencilSimple, Warning, CheckCircle } from '@phosphor-icons/react'
import { supabase } from '@/lib/supabase'
import TrackedMovementsBlock from './TrackedMovementsBlock'
import GoniometerView from './GoniometerView'
import { unlockAudio } from '@/lib/audioBeep'
import { unlockSpeech } from '@/lib/speak'
import { JOINT_TESTS, isQualitativeJoint, QUALITY_LEVELS, qualityLevel, HAND_POSITION_OPTIONS, handPositionLabel } from '@/lib/jointTests'
import { ADMP_NORMS, isADMPJoint, analyzeADMPRisk } from '@/lib/jointTestThresholds'

function calcAge(birthDate) {
  if (!birthDate) return null
  const birth = new Date(birthDate)
  const now = new Date()
  let age = now.getFullYear() - birth.getFullYear()
  const m = now.getMonth() - birth.getMonth()
  if (m < 0 || (m === 0 && now.getDate() < birth.getDate())) age--
  return age
}

const SECTIONS = [
  { key: 'infos', Icon: User, label: 'Infos' },
  { key: 'metrics', Icon: ChartLineUp, label: 'Metrics' },
  { key: 'mensurations', Icon: Ruler, label: 'Mensurations' },
  { key: 'tests', Icon: Bone, label: 'Tests articulaires' },
]

function FullscreenSection({ title, onClose, children }) {
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'var(--bg2)', zIndex: 600, display: 'flex', flexDirection: 'column' }}>
      <div style={{ background: 'var(--bg)', borderBottom: '1px solid var(--border)', padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
        <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 22, color: 'var(--text2)', cursor: 'pointer', padding: '2px 4px', lineHeight: 1 }}>←</button>
        <div style={{ fontFamily: 'var(--font-title)', color: 'var(--title)', fontWeight: 700, fontSize: 17, display: 'flex', alignItems: 'center', gap: 8 }}>{title}</div>
      </div>
      <div style={{ flex: 1, overflowY: 'auto', maxWidth: 480, width: '100%', margin: '0 auto', boxSizing: 'border-box', padding: 16 }}>
        {children}
      </div>
    </div>
  )
}

function ComingSoon({ label }) {
  return (
    <div style={{ textAlign: 'center', color: 'var(--text3)', padding: '60px 20px', border: '1px dashed var(--border2)', borderRadius: 'var(--rl)', background: 'var(--bg)' }}>
      <div style={{ fontSize: 36, marginBottom: 12 }}>🚧</div>
      <div style={{ fontWeight: 600 }}>{label} — bientôt disponible</div>
    </div>
  )
}

function InfosSection({ athlete, onUpdate }) {
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState({
    name: athlete.name || '', email: athlete.email || '',
    birth_date: athlete.birth_date || '', weight: athlete.weight ?? '', height: athlete.height ?? '',
    address: athlete.address || '',
  })
  const [saving, setSaving] = useState(false)
  const [inviting, setInviting] = useState(false)
  const [inviteMsg, setInviteMsg] = useState('')

  const inputStyle = {
    width: '100%', boxSizing: 'border-box', padding: '10px 12px', border: '1px solid var(--border2)',
    borderRadius: 'var(--r)', fontSize: 14, outline: 'none', background: 'var(--bg2)', color: 'var(--text)',
  }

  const age = calcAge(athlete.birth_date)

  const save = async () => {
    setSaving(true)
    const { data, error } = await supabase.from('athletes').update({
      name: form.name.trim(), email: form.email.trim() || null,
      birth_date: form.birth_date || null,
      weight: form.weight ? parseFloat(form.weight) : null,
      height: form.height ? parseInt(form.height) : null,
      address: form.address.trim() || null,
    }).eq('id', athlete.id).select().single()
    setSaving(false)
    if (error) { alert('Erreur : ' + error.message); return }
    onUpdate(data)
    setEditing(false)
  }

  const sendInvite = async () => {
    if (!athlete.email) return
    setInviting(true)
    setInviteMsg('')
    const res = await fetch('/api/invite', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: athlete.email, athleteId: athlete.id, athleteName: athlete.name, redirectTo: window.location.origin }),
    })
    const json = await res.json()
    setInviting(false)
    setInviteMsg(json.error ? 'Erreur : ' + json.error : `✓ Invitation envoyée à ${athlete.email}`)
  }

  if (!editing) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 'var(--rl)', padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <Row label="Nom" value={athlete.name} />
          <Row label="Email" value={athlete.email || '—'} />
          <Row label="Date de naissance" value={athlete.birth_date ? `${new Date(athlete.birth_date + 'T00:00:00').toLocaleDateString('fr-FR')} (${age} ans)` : '—'} />
          <Row label="Poids" value={athlete.weight ? `${athlete.weight} kg` : '—'} />
          <Row label="Taille" value={athlete.height ? `${athlete.height} cm` : '—'} />
          <Row label="Adresse postale" value={athlete.address || '—'} />
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <button onClick={sendInvite} disabled={inviting || !athlete.email} style={{
            background: athlete.email ? 'var(--green)' : 'var(--border2)', color: '#fff', border: 'none',
            borderRadius: 'var(--r)', padding: 12, fontSize: 14, fontWeight: 700, cursor: athlete.email ? 'pointer' : 'default',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
          }}>
            {inviting ? '…' : athlete.email ? (athlete.auth_user_id ? <><Key size={15} /> Renvoyer un lien de connexion</> : <><EnvelopeSimple size={15} /> Envoyer le lien d&apos;invitation</>) : 'Ajoute un email pour inviter'}
          </button>
          {inviteMsg && <div style={{ fontSize: 12, color: inviteMsg.startsWith('Erreur') ? '#DC2626' : '#166534', fontWeight: 600 }}>{inviteMsg}</div>}
        </div>

        <button onClick={() => setEditing(true)} style={{ background: 'var(--bg2)', color: 'var(--text2)', border: '1px solid var(--border2)', borderRadius: 'var(--r)', padding: 12, fontSize: 14, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
          <PencilSimple size={15} /> Modifier
        </button>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <Field label="Nom complet"><input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} style={inputStyle} /></Field>
      <Field label="Email"><input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} style={inputStyle} /></Field>
      <Field label="Date de naissance"><input type="date" value={form.birth_date} onChange={e => setForm(f => ({ ...f, birth_date: e.target.value }))} style={inputStyle} /></Field>
      <div style={{ display: 'flex', gap: 10 }}>
        <Field label="Poids (kg)" style={{ flex: 1 }}><input type="number" step="0.1" value={form.weight} onChange={e => setForm(f => ({ ...f, weight: e.target.value }))} style={inputStyle} /></Field>
        <Field label="Taille (cm)" style={{ flex: 1 }}><input type="number" value={form.height} onChange={e => setForm(f => ({ ...f, height: e.target.value }))} style={inputStyle} /></Field>
      </div>
      <Field label="Adresse postale"><textarea rows={2} value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))} style={{ ...inputStyle, resize: 'none', fontFamily: 'inherit' }} /></Field>
      <div style={{ display: 'flex', gap: 8 }}>
        <button onClick={() => setEditing(false)} style={{ flex: 1, background: 'var(--bg2)', color: 'var(--text3)', border: '1px solid var(--border2)', borderRadius: 'var(--r)', padding: 11, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Annuler</button>
        <button onClick={save} disabled={saving} style={{ flex: 2, background: 'var(--green)', color: '#fff', border: 'none', borderRadius: 'var(--r)', padding: 11, fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>{saving ? '…' : 'Enregistrer'}</button>
      </div>
    </div>
  )
}

function getYouTubeId(url) {
  if (!url) return null
  const m = url.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|v\/|shorts\/))([^&\n?#]+)/)
  return m ? m[1] : null
}

function DafField({ dafOui, setDafOui, daf, setDaf }) {
  return (
    <div>
      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: 5 }}>
        Douleur Angle de Fermeture (DAF)
      </div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
        <button type="button" onClick={() => setDafOui(true)} style={{
          flex: 1, padding: '10px 12px', borderRadius: 'var(--r)', cursor: 'pointer', fontSize: 13, fontWeight: 700,
          border: `1px solid ${dafOui ? '#991B1B' : 'var(--border2)'}`,
          background: dafOui ? '#FEE2E2' : 'var(--bg2)', color: dafOui ? '#991B1B' : 'var(--text2)',
        }}>
          Oui
        </button>
        <button type="button" onClick={() => setDafOui(false)} style={{
          flex: 1, padding: '10px 12px', borderRadius: 'var(--r)', cursor: 'pointer', fontSize: 13, fontWeight: 700,
          border: `1px solid ${!dafOui ? 'var(--green)' : 'var(--border2)'}`,
          background: !dafOui ? 'var(--green-light)' : 'var(--bg2)', color: !dafOui ? 'var(--green)' : 'var(--text2)',
        }}>
          Non
        </button>
      </div>
      <textarea value={daf} onChange={e => setDaf(e.target.value)} rows={2}
        placeholder="Précisions (optionnel)…"
        style={{ width: '100%', boxSizing: 'border-box', padding: '10px 12px', border: '1px solid var(--border2)', borderRadius: 'var(--r)', fontSize: 13, outline: 'none', background: 'var(--bg2)', color: 'var(--text)', resize: 'vertical', fontFamily: 'inherit' }} />
    </div>
  )
}

function TestLaunchView({ athleteId, testName, joint, movement, onClose, onPrev, onNext, hasPrev, hasNext }) {
  const qualitative = isQualitativeJoint(joint)
  const [previous, setPrevious] = useState(undefined) // undefined = chargement, null = aucun
  const [d, setD] = useState('')
  const [g, setG] = useState('')
  const [qualityD, setQualityD] = useState(null)
  const [handPosition, setHandPosition] = useState(null)
  const [note, setNote] = useState('')
  const [daf, setDaf] = useState('')
  const [dafOui, setDafOui] = useState(false)
  const [saving, setSaving] = useState(false)
  const [result, setResult] = useState(null)

  useEffect(() => {
    supabase.from('joint_test_entries').select('*')
      .eq('athlete_id', athleteId).eq('test_name', testName).eq('joint', joint)
      .order('date', { ascending: false }).order('created_at', { ascending: false })
      .limit(1).maybeSingle()
      .then(({ data }) => setPrevious(data || null))
  }, [athleteId, testName, joint])

  const pct = (oldVal, newVal) => {
    if (oldVal == null || oldVal === 0 || newVal == null) return null
    return Math.round(((newVal - oldVal) / oldVal) * 1000) / 10
  }

  const submit = async () => {
    if (qualitative) {
      if (!qualityD) return
      setSaving(true)
      const payload = { athlete_id: athleteId, test_name: testName, joint, quality_d: qualityD, hand_position: handPosition, note: note.trim() || null, daf: daf.trim() || null, daf_oui: dafOui }
      let { data, error } = await supabase.from('joint_test_entries').insert(payload).select().single()
      if (error?.message?.includes('hand_position')) {
        // Colonne "hand_position" pas encore migrée en base : réessaie sans ce champ.
        ;({ data, error } = await supabase.from('joint_test_entries').insert({ ...payload, hand_position: undefined }).select().single())
      }
      setSaving(false)
      if (error) { alert('Erreur : ' + error.message); return }
      setResult({ old: previous, new: data })
      return
    }
    if (!d.trim() && !g.trim()) return
    setSaving(true)
    const valueD = d.trim() ? parseFloat(d) : null
    const valueG = g.trim() ? parseFloat(g) : null
    const { data, error } = await supabase.from('joint_test_entries')
      .insert({ athlete_id: athleteId, test_name: testName, joint, value_d: valueD, value_g: valueG, daf: daf.trim() || null, daf_oui: dafOui })
      .select().single()
    setSaving(false)
    if (error) { alert('Erreur : ' + error.message); return }
    setResult({
      old: previous,
      new: data,
      pctD: pct(previous?.value_d, valueD),
      pctG: pct(previous?.value_g, valueG),
    })
  }

  // Sauvegarde la saisie en cours (si non déjà validée) avant de changer de test.
  const navigate = async (goTo) => {
    const hasUnsavedInput = !result && (qualitative ? !!qualityD : (d.trim() || g.trim()))
    if (hasUnsavedInput) await submit()
    goTo()
  }

  const ytId = movement?.youtube_url ? getYouTubeId(movement.youtube_url) : null

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'var(--bg2)', zIndex: 700, display: 'flex', flexDirection: 'column' }}>
      <div style={{ background: 'var(--bg)', borderBottom: '1px solid var(--border)', padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
        <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 22, color: 'var(--text2)', cursor: 'pointer', padding: '2px 4px', lineHeight: 1 }}>←</button>
        <div style={{ fontWeight: 800, fontSize: 16 }}>{testName}</div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', maxWidth: 480, width: '100%', margin: '0 auto', boxSizing: 'border-box', padding: 16 }}>
        {result ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'center', color: result.new.daf_oui ? '#DC2626' : '#16A34A', marginBottom: -4 }}>
              {result.new.daf_oui ? <Warning size={40} /> : <CheckCircle size={40} />}
            </div>
            <div style={{ textAlign: 'center', fontWeight: 800, fontSize: 17 }}>Test validé</div>

            {result.new.daf_oui && (
              <div style={{ background: '#FEE2E2', border: '1px solid #F1B8B8', borderRadius: 'var(--r)', padding: '10px 12px', textAlign: 'center', fontWeight: 700, color: '#991B1B', fontSize: 13, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                <Warning size={15} /> DAF présente — signal de danger
              </div>
            )}

            {qualitative ? (
              <div style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 'var(--rl)', padding: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
                {(() => {
                  const lvl = qualityLevel(result.new.quality_d)
                  return (
                    <span style={{ fontSize: 13, fontWeight: 700, color: lvl?.color, background: lvl?.bg, borderRadius: 20, padding: '4px 10px', alignSelf: 'flex-start' }}>
                      {lvl?.label}
                    </span>
                  )
                })()}
                {result.new.hand_position && (
                  <div style={{ fontSize: 12, color: 'var(--text3)' }}>Mains : {handPositionLabel(result.new.hand_position)}</div>
                )}
                {result.new.note && (
                  <div style={{ fontSize: 12, color: 'var(--text3)', fontStyle: 'italic' }}>« {result.new.note} »</div>
                )}
                {result.new.daf && (
                  <div style={{ fontSize: 12, color: '#991B1B' }}>DAF : {result.new.daf}</div>
                )}
              </div>
            ) : (
              [
                { label: 'Droite', old: result.old?.value_d, val: result.new.value_d, p: result.pctD },
                { label: 'Gauche', old: result.old?.value_g, val: result.new.value_g, p: result.pctG },
              ].filter(r => r.val != null).map(r => (
                <div key={r.label} style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 'var(--rl)', padding: 14 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: 8 }}>{r.label}</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ flex: 1, textAlign: 'center' }}>
                      <div style={{ fontSize: 11, color: 'var(--text3)' }}>Ancien</div>
                      <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--text3)' }}>{r.old != null ? `${r.old}°` : '—'}</div>
                    </div>
                    <div style={{ fontSize: 18, color: 'var(--text3)' }}>→</div>
                    <div style={{ flex: 1, textAlign: 'center' }}>
                      <div style={{ fontSize: 11, color: 'var(--text3)' }}>Nouveau</div>
                      <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--green)' }}>{r.val}°</div>
                    </div>
                    <div style={{ flex: 1, textAlign: 'center' }}>
                      <div style={{ fontSize: 11, color: 'var(--text3)' }}>Évolution</div>
                      <div style={{ fontSize: 16, fontWeight: 800, color: r.p == null ? 'var(--text3)' : r.p >= 0 ? '#166534' : '#DC2626' }}>
                        {r.p == null ? '—' : `${r.p > 0 ? '+' : ''}${r.p}%`}
                      </div>
                    </div>
                  </div>
                </div>
              ))
            )}

            {!qualitative && result.new.daf && (
              <div style={{ fontSize: 12, color: '#991B1B', textAlign: 'center' }}>DAF : {result.new.daf}</div>
            )}

            <button onClick={onClose} style={{ background: 'var(--green)', color: '#fff', border: 'none', borderRadius: 'var(--r)', padding: 13, fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>
              Terminé
            </button>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {ytId && (
              <div style={{ position: 'relative', paddingBottom: '56.25%', height: 0, borderRadius: 'var(--r)', overflow: 'hidden' }}>
                <iframe
                  src={`https://www.youtube.com/embed/${ytId}`}
                  style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', border: 'none' }}
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                />
              </div>
            )}

            {qualitative ? (
              <>
                {previous === undefined ? (
                  <div style={{ textAlign: 'center', color: 'var(--text3)', fontSize: 13 }}>Chargement…</div>
                ) : previous ? (
                  <div style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 'var(--r)', padding: '10px 12px', fontSize: 12, color: 'var(--text3)' }}>
                    Dernier test ({new Date(previous.date + 'T00:00:00').toLocaleDateString('fr-FR')}) :
                    {previous.quality_d != null && ` ${qualityLevel(previous.quality_d)?.label}`}
                    {previous.hand_position && ` · Mains : ${handPositionLabel(previous.hand_position)}`}
                  </div>
                ) : (
                  <div style={{ textAlign: 'center', color: 'var(--text3)', fontSize: 12, fontStyle: 'italic' }}>Aucun test précédent.</div>
                )}

                <div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: 6 }}>
                    Ressenti
                  </div>
                  <select value={qualityD || ''} onChange={e => setQualityD(e.target.value || null)}
                    style={{ width: '100%', boxSizing: 'border-box', padding: '11px 12px', borderRadius: 'var(--r)', border: '1px solid var(--border2)', fontSize: 13, fontWeight: 600, outline: 'none', background: 'var(--bg2)', color: 'var(--text)' }}>
                    <option value="" disabled>Choisis un niveau…</option>
                    {QUALITY_LEVELS.map(l => (
                      <option key={l.key} value={l.key}>{l.label} — {l.description}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: 6 }}>
                    Où as-tu posé les mains ?
                  </div>
                  <select value={handPosition || ''} onChange={e => setHandPosition(e.target.value || null)}
                    style={{ width: '100%', boxSizing: 'border-box', padding: '11px 12px', borderRadius: 'var(--r)', border: '1px solid var(--border2)', fontSize: 13, fontWeight: 600, outline: 'none', background: 'var(--bg2)', color: 'var(--text)' }}>
                    <option value="" disabled>Choisis…</option>
                    {HAND_POSITION_OPTIONS.map(o => (
                      <option key={o.key} value={o.key}>{o.label}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: 5 }}>Note (zone, douleur…)</div>
                  <textarea value={note} onChange={e => setNote(e.target.value)} rows={2}
                    style={{ width: '100%', boxSizing: 'border-box', padding: '10px 12px', border: '1px solid var(--border2)', borderRadius: 'var(--r)', fontSize: 13, outline: 'none', background: 'var(--bg2)', color: 'var(--text)', resize: 'vertical', fontFamily: 'inherit' }} />
                </div>

                <DafField dafOui={dafOui} setDafOui={setDafOui} daf={daf} setDaf={setDaf} />

                <button onClick={submit} disabled={saving || !qualityD}
                  style={{ background: qualityD ? 'var(--green)' : 'var(--border2)', color: '#fff', border: 'none', borderRadius: 'var(--r)', padding: 13, fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>
                  {saving ? '…' : '✓ Valider le test'}
                </button>
              </>
            ) : (
              <>
                {previous === undefined ? (
                  <div style={{ textAlign: 'center', color: 'var(--text3)', fontSize: 13 }}>Chargement…</div>
                ) : previous ? (
                  <div style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 'var(--r)', padding: '10px 12px', fontSize: 12, color: 'var(--text3)' }}>
                    Dernier test ({new Date(previous.date + 'T00:00:00').toLocaleDateString('fr-FR')}) :
                    {previous.value_d != null && ` D ${previous.value_d}°`}
                    {previous.value_g != null && ` · G ${previous.value_g}°`}
                  </div>
                ) : (
                  <div style={{ textAlign: 'center', color: 'var(--text3)', fontSize: 12, fontStyle: 'italic' }}>Aucun test précédent.</div>
                )}

                <div style={{ display: 'flex', gap: 10 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: 5 }}>Actif Droit (°)</div>
                    <input type="number" step="1" value={d} onChange={e => setD(e.target.value)}
                      style={{ width: '100%', boxSizing: 'border-box', padding: '12px', border: '1px solid var(--border2)', borderRadius: 'var(--r)', fontSize: 18, fontWeight: 700, textAlign: 'center', outline: 'none', background: 'var(--bg2)', color: 'var(--text)' }} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: 5 }}>Actif Gauche (°)</div>
                    <input type="number" step="1" value={g} onChange={e => setG(e.target.value)}
                      style={{ width: '100%', boxSizing: 'border-box', padding: '12px', border: '1px solid var(--border2)', borderRadius: 'var(--r)', fontSize: 18, fontWeight: 700, textAlign: 'center', outline: 'none', background: 'var(--bg2)', color: 'var(--text)' }} />
                  </div>
                </div>

                <DafField dafOui={dafOui} setDafOui={setDafOui} daf={daf} setDaf={setDaf} />

                <button onClick={submit} disabled={saving || (!d.trim() && !g.trim())}
                  style={{ background: (d.trim() || g.trim()) ? 'var(--green)' : 'var(--border2)', color: '#fff', border: 'none', borderRadius: 'var(--r)', padding: 13, fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>
                  {saving ? '…' : '✓ Valider le test'}
                </button>
              </>
            )}

            {(onPrev || onNext) && (
              <div style={{ display: 'flex', gap: 10 }}>
                <button onClick={() => navigate(onPrev)} disabled={!hasPrev || saving}
                  style={{ flex: 1, background: 'var(--bg)', border: '1px solid var(--border2)', borderRadius: 'var(--r)', padding: 16, fontSize: 22, fontWeight: 700, color: hasPrev ? 'var(--text)' : 'var(--text3)', cursor: hasPrev ? 'pointer' : 'default', opacity: hasPrev ? 1 : 0.4 }}>
                  ←
                </button>
                <button onClick={() => navigate(onNext)} disabled={!hasNext || saving}
                  style={{ flex: 1, background: 'var(--bg)', border: '1px solid var(--border2)', borderRadius: 'var(--r)', padding: 16, fontSize: 22, fontWeight: 700, color: hasNext ? 'var(--text)' : 'var(--text3)', cursor: hasNext ? 'pointer' : 'default', opacity: hasNext ? 1 : 0.4 }}>
                  →
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function TestsArticulairesSection({ athleteId }) {
  const [byName, setByName] = useState(null)
  const [editingName, setEditingName] = useState(null)
  const [urlDraft, setUrlDraft] = useState('')
  const [playingName, setPlayingName] = useState(null)
  const [saving, setSaving] = useState(false)
  const [launching, setLaunching] = useState(null) // { name, joint }
  const [showGonio, setShowGonio] = useState(false)
  const [latestByTest, setLatestByTest] = useState({})
  const [editingValue, setEditingValue] = useState(null) // { testName, side }
  const [valueDraft, setValueDraft] = useState('')
  const [disciplines, setDisciplines] = useState([])
  const [disciplineId, setDisciplineId] = useState(null)
  const [norms, setNorms] = useState(ADMP_NORMS)
  const [savingDiscipline, setSavingDiscipline] = useState(false)

  const allTestNames = JOINT_TESTS.flatMap(g => g.tests)
  const allTestEntries = JOINT_TESTS.flatMap(g => g.tests.map(t => ({ joint: g.joint, name: t })))

  const navigateLaunching = (dir) => {
    if (!launching) return
    const idx = allTestEntries.findIndex(e => e.joint === launching.joint && e.name === launching.name)
    if (idx === -1) return
    const nextIdx = idx + dir
    if (nextIdx < 0 || nextIdx >= allTestEntries.length) return
    setLaunching(allTestEntries[nextIdx])
  }

  useEffect(() => {
    async function load() {
      const { data: existing } = await supabase.from('movements').select('id, name, youtube_url')
      const map = {}
      ;(existing || []).forEach(m => { map[m.name.trim().toLowerCase()] = m })

      const missing = allTestNames.filter(n => !map[n.trim().toLowerCase()])
      if (missing.length) {
        const { data: created } = await supabase.from('movements').insert(missing.map(name => ({ name }))).select()
        ;(created || []).forEach(m => { map[m.name.trim().toLowerCase()] = m })
      }

      const byNameResult = {}
      allTestNames.forEach(n => { byNameResult[n] = map[n.trim().toLowerCase()] })
      setByName(byNameResult)
    }
    load()
  }, [])

  // Plusieurs articulations partagent les mêmes noms de test (ex. "Rotation externe (Actif)"
  // existe pour Épaule ET Hanche) : la clé doit combiner articulation + nom de test, sinon
  // une saisie sur l'un écrase la valeur de l'autre.
  const testKey = (joint, testName) => `${joint}::${testName}`

  const loadLatestValues = () => {
    if (!athleteId) return
    supabase.from('joint_test_entries').select('*')
      .eq('athlete_id', athleteId)
      .order('date', { ascending: false }).order('created_at', { ascending: false })
      .then(({ data }) => {
        const map = {}
        ;(data || []).forEach(e => { const k = testKey(e.joint, e.test_name); if (!map[k]) map[k] = e })
        setLatestByTest(map)
      })
  }

  useEffect(() => { loadLatestValues() }, [athleteId, showGonio, launching])

  useEffect(() => {
    supabase.from('disciplines').select('id, name').order('name').then(({ data }) => setDisciplines(data || []))
  }, [])

  useEffect(() => {
    if (!athleteId) return
    supabase.from('athletes').select('discipline_id').eq('id', athleteId).single()
      .then(({ data }) => setDisciplineId(data?.discipline_id || null))
  }, [athleteId])

  useEffect(() => {
    if (!disciplineId) return
    supabase.from('discipline_standards').select('joint, test_name, value_deg').eq('discipline_id', disciplineId)
      .then(({ data }) => {
        if (!data || !data.length) { setNorms(ADMP_NORMS); return }
        const built = {}
        data.forEach(row => {
          if (!built[row.joint]) built[row.joint] = {}
          built[row.joint][row.test_name] = row.value_deg
        })
        setNorms(built)
      })
  }, [disciplineId])

  const changeDiscipline = async (id) => {
    setSavingDiscipline(true)
    await supabase.from('athletes').update({ discipline_id: id || null }).eq('id', athleteId)
    setSavingDiscipline(false)
    setDisciplineId(id || null)
  }

  const startEditValue = (joint, testName, side, entry) => {
    setEditingValue({ joint, testName, side })
    setValueDraft(entry ? String((side === 'D' ? entry.value_d : entry.value_g) ?? '') : '')
  }

  const saveValue = async (joint) => {
    if (!editingValue) return
    const field = editingValue.side === 'D' ? 'value_d' : 'value_g'
    const parsed = valueDraft.trim() ? parseFloat(valueDraft) : null
    const entry = latestByTest[testKey(editingValue.joint, editingValue.testName)]
    if (entry) {
      // Une donnée existe déjà : on la remplace directement, pas de nouvel historique.
      await supabase.from('joint_test_entries').update({ [field]: parsed }).eq('id', entry.id)
    } else {
      await supabase.from('joint_test_entries')
        .insert({ athlete_id: athleteId, test_name: editingValue.testName, joint, [field]: parsed })
    }
    setEditingValue(null)
    loadLatestValues()
  }

  const deleteValue = async () => {
    if (!editingValue) return
    const entry = latestByTest[testKey(editingValue.joint, editingValue.testName)]
    if (!entry) return
    const field = editingValue.side === 'D' ? 'value_d' : 'value_g'
    await supabase.from('joint_test_entries').update({ [field]: null }).eq('id', entry.id)
    setEditingValue(null)
    loadLatestValues()
  }

  const startEdit = (name) => {
    setEditingName(name)
    setUrlDraft(byName[name]?.youtube_url || '')
  }

  const saveUrl = async () => {
    const movement = byName[editingName]
    if (!movement) return
    setSaving(true)
    const { data } = await supabase.from('movements').update({ youtube_url: urlDraft.trim() || null }).eq('id', movement.id).select().single()
    setSaving(false)
    if (data) setByName(prev => ({ ...prev, [editingName]: data }))
    setEditingName(null)
  }

  if (byName === null) {
    return <div style={{ textAlign: 'center', color: 'var(--text3)', fontSize: 13, padding: '30px 0' }}>Chargement…</div>
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <button onClick={() => { unlockAudio(); unlockSpeech(); setShowGonio(true) }} style={{
        background: '#0D1117', color: '#F2A93B', border: '1px solid #2A3140', borderRadius: 'var(--rl)',
        padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', fontFamily: 'inherit',
      }}>
        <Ruler size={20} />
        <span style={{ flex: 1, fontWeight: 700, fontSize: 14, textAlign: 'left' }}>Lancer le goniomètre</span>
        <span style={{ color: '#7C8493', fontSize: 18 }}>›</span>
      </button>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '0 2px' }}>
        <span style={{ fontSize: 12, color: 'var(--text3)' }}>Standard :</span>
        <select
          value={disciplineId || ''}
          onChange={e => changeDiscipline(e.target.value || null)}
          disabled={savingDiscipline}
          style={{
            flex: 1, fontSize: 12, fontWeight: 700, color: 'var(--text)', background: 'var(--bg)',
            border: '1px solid var(--border2)', borderRadius: 20, padding: '5px 10px', cursor: 'pointer',
          }}>
          {disciplines.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>
      </div>

      {JOINT_TESTS.map(group => (
        <div key={group.joint} style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 'var(--rl)', overflow: 'hidden' }}>
          <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--border)', fontWeight: 800, fontSize: 14 }}>
            {group.joint}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {group.tests.map((t, i) => {
              const movement = byName[t]
              const hasVideo = !!movement?.youtube_url
              const isEditing = editingName === t
              const entry = latestByTest[testKey(group.joint, t)]
              const hasData = group.qualitative
                ? entry && (entry.quality_d != null || entry.quality_g != null)
                : entry && (entry.value_d != null || entry.value_g != null)

              let admpBadge = null
              if (isADMPJoint(group.joint, norms) && entry) {
                const rd = analyzeADMPRisk(group.joint, t, entry.value_d, norms)
                const rg = analyzeADMPRisk(group.joint, t, entry.value_g, norms)
                const worst = [rd, rg].filter(Boolean).sort((a, b) => b.deficit - a.deficit)[0]
                if (worst?.atRisk) admpBadge = { label: `-${worst.deficit}° vs norme`, warn: true, color: '#991B1B', bg: '#FEE2E2' }
                else if (rd || rg) admpBadge = { label: 'OK', color: '#166534', bg: '#DCFCE7' }
              }
              return (
                <div key={t} style={{ borderTop: i > 0 ? '1px solid var(--border)' : 'none' }}>
                  <div style={{ padding: '10px 14px 6px', display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ flex: 1, fontSize: 13, color: 'var(--text2)' }}>{t}</div>
                    <button onClick={() => setLaunching({ name: t, joint: group.joint })}
                      style={{ background: 'var(--green)', color: '#fff', border: 'none', borderRadius: 20, padding: '4px 10px', fontSize: 12, fontWeight: 700, cursor: 'pointer', flexShrink: 0 }}>
                      ▶ Lancer
                    </button>
                  </div>

                  <div style={{ padding: '0 14px 10px', display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                    {hasData ? (
                      group.qualitative ? (
                        <>
                          {entry.quality_d != null && (() => {
                            const lvl = qualityLevel(entry.quality_d)
                            return (
                              <span style={{ fontSize: 11, fontWeight: 700, color: lvl?.color || 'var(--text2)', background: lvl?.bg || 'var(--bg2)', borderRadius: 20, padding: '3px 8px' }}>
                                {lvl?.label || entry.quality_d}
                              </span>
                            )
                          })()}
                          {entry.hand_position && (
                            <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text2)', background: 'var(--bg2)', border: '1px solid var(--border2)', borderRadius: 20, padding: '3px 8px' }}>
                              Mains : {handPositionLabel(entry.hand_position)}
                            </span>
                          )}
                          {entry.note && (
                            <span style={{ fontSize: 11, color: 'var(--text3)', fontStyle: 'italic' }}>« {entry.note} »</span>
                          )}
                        </>
                      ) : (
                        <>
                          {entry.value_d != null && (
                            <span onClick={() => startEditValue(group.joint, t, 'D', entry)}
                              style={{ fontSize: 11, fontWeight: 700, color: 'var(--text2)', background: 'var(--bg2)', border: '1px solid var(--border2)', borderRadius: 20, padding: '3px 8px', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                              D {entry.value_d}° <PencilSimple size={10} />
                            </span>
                          )}
                          {entry.value_g != null && (
                            <span onClick={() => startEditValue(group.joint, t, 'G', entry)}
                              style={{ fontSize: 11, fontWeight: 700, color: 'var(--text2)', background: 'var(--bg2)', border: '1px solid var(--border2)', borderRadius: 20, padding: '3px 8px', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                              G {entry.value_g}° <PencilSimple size={10} />
                            </span>
                          )}
                          {admpBadge && (
                            <span style={{ fontSize: 11, fontWeight: 700, color: admpBadge.color, background: admpBadge.bg, borderRadius: 20, padding: '3px 8px', display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                              {admpBadge.warn && <Warning size={11} />} {admpBadge.label}
                            </span>
                          )}
                        </>
                      )
                    ) : group.qualitative ? (
                      <span style={{ fontSize: 11, color: 'var(--text3)', fontStyle: 'italic' }}>Aucune donnée</span>
                    ) : (
                      <>
                        <button onClick={() => startEditValue(group.joint, t, 'D', null)}
                          style={{ fontSize: 11, fontWeight: 700, color: 'var(--text3)', background: 'none', border: '1px dashed var(--border2)', borderRadius: 20, padding: '3px 8px', cursor: 'pointer' }}>
                          + D
                        </button>
                        <button onClick={() => startEditValue(group.joint, t, 'G', null)}
                          style={{ fontSize: 11, fontWeight: 700, color: 'var(--text3)', background: 'none', border: '1px dashed var(--border2)', borderRadius: 20, padding: '3px 8px', cursor: 'pointer' }}>
                          + G
                        </button>
                      </>
                    )}

                    {entry?.daf_oui && (
                      <span style={{ fontSize: 11, fontWeight: 700, color: '#991B1B', background: '#FEE2E2', borderRadius: 20, padding: '3px 8px', display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                        <Warning size={11} /> DAF
                      </span>
                    )}

                    <div style={{ flex: 1 }} />

                    {hasVideo && (
                      <button onClick={() => setPlayingName(playingName === t ? null : t)}
                        style={{ background: 'var(--green-light)', color: 'var(--green)', border: '1px solid #B8EAD8', borderRadius: 'var(--r)', padding: '4px 10px', fontSize: 12, fontWeight: 700, cursor: 'pointer', flexShrink: 0 }}>
                        ▶
                      </button>
                    )}
                    <button onClick={() => startEdit(t)}
                      style={{ background: 'none', border: '1px solid var(--border2)', borderRadius: 'var(--r)', padding: '4px 8px', fontSize: 12, cursor: 'pointer', color: 'var(--text3)', flexShrink: 0, display: 'flex', alignItems: 'center' }}>
                      {hasVideo ? <PencilSimple size={12} /> : '+ Vidéo'}
                    </button>
                  </div>

                  {entry?.daf && (
                    <div style={{ padding: '0 14px 10px', fontSize: 11, color: '#991B1B' }}>DAF : {entry.daf}</div>
                  )}

                  {isEditing && (
                    <div style={{ padding: '0 14px 12px', display: 'flex', gap: 8 }}>
                      <input autoFocus value={urlDraft} onChange={e => setUrlDraft(e.target.value)}
                        placeholder="Lien YouTube…"
                        style={{ flex: 1, boxSizing: 'border-box', padding: '8px 10px', border: '1px solid var(--border2)', borderRadius: 'var(--r)', fontSize: 13, outline: 'none', background: 'var(--bg2)', color: 'var(--text)' }} />
                      <button onClick={() => setEditingName(null)} style={{ background: 'none', border: '1px solid var(--border2)', borderRadius: 'var(--r)', padding: '8px 10px', fontSize: 12, cursor: 'pointer', color: 'var(--text3)' }}>Annuler</button>
                      <button onClick={saveUrl} disabled={saving} style={{ background: 'var(--green)', color: '#fff', border: 'none', borderRadius: 'var(--r)', padding: '8px 12px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>{saving ? '…' : 'OK'}</button>
                    </div>
                  )}

                  {editingValue?.joint === group.joint && editingValue?.testName === t && (
                    <div style={{ padding: '0 14px 12px', display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text3)' }}>{editingValue.side} :</span>
                      <input autoFocus type="number" value={valueDraft} onChange={e => setValueDraft(e.target.value)}
                        placeholder="Degrés"
                        style={{ width: 90, boxSizing: 'border-box', padding: '8px 10px', border: '1px solid var(--border2)', borderRadius: 'var(--r)', fontSize: 13, outline: 'none', background: 'var(--bg2)', color: 'var(--text)' }} />
                      <button onClick={() => setEditingValue(null)} style={{ background: 'none', border: '1px solid var(--border2)', borderRadius: 'var(--r)', padding: '8px 10px', fontSize: 12, cursor: 'pointer', color: 'var(--text3)' }}>Annuler</button>
                      {entry && (
                        <button onClick={deleteValue} style={{ background: 'none', border: '1px solid #F1B8B8', borderRadius: 'var(--r)', padding: '8px 10px', fontSize: 12, fontWeight: 700, cursor: 'pointer', color: '#991B1B' }}>Supprimer</button>
                      )}
                      <button onClick={() => saveValue(group.joint)} style={{ background: 'var(--green)', color: '#fff', border: 'none', borderRadius: 'var(--r)', padding: '8px 12px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>Enregistrer</button>
                    </div>
                  )}

                  {playingName === t && hasVideo && (
                    <div style={{ padding: '0 14px 12px' }}>
                      <div style={{ position: 'relative', paddingBottom: '56.25%', height: 0, borderRadius: 'var(--r)', overflow: 'hidden' }}>
                        <iframe
                          src={`https://www.youtube.com/embed/${getYouTubeId(movement.youtube_url)}`}
                          style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', border: 'none' }}
                          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                          allowFullScreen
                        />
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      ))}
      <div style={{ textAlign: 'center', color: 'var(--text3)', fontSize: 12, fontStyle: 'italic', padding: '8px 0' }}>
        Chaque test est aussi ajouté à la bibliothèque de mouvements.
      </div>

      {launching && (
        <TestLaunchView
          key={`${launching.joint}::${launching.name}`}
          athleteId={athleteId}
          testName={launching.name}
          joint={launching.joint}
          movement={byName[launching.name]}
          onClose={() => setLaunching(null)}
          onPrev={() => navigateLaunching(-1)}
          onNext={() => navigateLaunching(1)}
          hasPrev={allTestEntries.findIndex(e => e.joint === launching.joint && e.name === launching.name) > 0}
          hasNext={allTestEntries.findIndex(e => e.joint === launching.joint && e.name === launching.name) < allTestEntries.length - 1}
        />
      )}

      {showGonio && (
        <GoniometerView athleteId={athleteId} onClose={() => setShowGonio(false)} />
      )}
    </div>
  )
}

function Row({ label, value }) {
  return (
    <div>
      <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.3px', marginBottom: 3 }}>{label}</div>
      <div style={{ fontWeight: 700, fontSize: 15 }}>{value}</div>
    </div>
  )
}

function Field({ label, children, style }) {
  return (
    <div style={style}>
      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: 5 }}>{label}</div>
      {children}
    </div>
  )
}

export default function AthleteQuickNav({ athlete, onUpdate }) {
  const [open, setOpen] = useState(null)

  return (
    <>
      <div style={{ display: 'flex', gap: 8 }}>
        {SECTIONS.map(s => (
          <button key={s.key} onClick={() => setOpen(s.key)} style={{
            flex: 1, background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 'var(--r)',
            padding: '10px 4px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, cursor: 'pointer', fontFamily: 'inherit',
          }}>
            <s.Icon size={18} />
            <span style={{ fontSize: 9, fontWeight: 700, color: 'var(--text2)', textAlign: 'center' }}>{s.label}</span>
          </button>
        ))}
      </div>

      {open === 'infos' && (
        <FullscreenSection title={<><User size={17} /> Infos</>} onClose={() => setOpen(null)}>
          <InfosSection athlete={athlete} onUpdate={a => { onUpdate?.(a); }} />
        </FullscreenSection>
      )}
      {open === 'metrics' && (
        <FullscreenSection title={<><ChartLineUp size={17} /> Metrics</>} onClose={() => setOpen(null)}>
          <TrackedMovementsBlock athleteId={athlete.id} isCoach />
        </FullscreenSection>
      )}
      {open === 'mensurations' && (
        <FullscreenSection title={<><Ruler size={17} /> Mensurations</>} onClose={() => setOpen(null)}>
          <ComingSoon label="Mensurations" />
        </FullscreenSection>
      )}
      {open === 'tests' && (
        <FullscreenSection title={<><Bone size={17} /> Tests articulaires</>} onClose={() => setOpen(null)}>
          <TestsArticulairesSection athleteId={athlete.id} />
        </FullscreenSection>
      )}
    </>
  )
}
