'use client'

import { useEffect, useState } from 'react'
import { X } from '@phosphor-icons/react'
import { NIVEAUX_ACTIVITE, OBJECTIFS, besoinCalorique } from '@/lib/calculApport'

// Calculateur d'apport du sportif (onglet Nutrition) : besoin calorique calé sur le calculateur de
// Julien Venesson (voir lib/calculApport.js), puis répartition par défaut — protéines 1,8 g/kg,
// lipides 1,2 g/kg, les glucides complètent les calories. Tout reste modifiable : changer les
// calories, les protéines ou les lipides recalcule les glucides ; changer les glucides recalcule
// les calories. Enregistré comme objectifs journaliers (les jauges de l'onglet).

const PROTEINES_PAR_KG = 1.8
const LIPIDES_PAR_KG = 1.2

const champ = { width: '100%', boxSizing: 'border-box', padding: '10px 12px', border: '1px solid var(--border2)', borderRadius: 'var(--r)', fontSize: 16, background: 'var(--bg)', color: 'var(--text)', fontFamily: 'inherit', outline: 'none' }
const etiquette = { fontSize: 11, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: 5, display: 'block' }
const carte = { background: 'var(--card-white)', borderRadius: 'var(--ostryk-card-radius, 14px)', padding: 16, border: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 12 }

const nombre = v => { const n = parseFloat(String(v).replace(',', '.')); return Number.isFinite(n) ? n : null }

function ageDepuis(naissance) {
  if (!naissance) return ''
  const n = new Date(naissance + 'T00:00:00'); const a = new Date()
  let age = a.getFullYear() - n.getFullYear()
  if (a.getMonth() < n.getMonth() || (a.getMonth() === n.getMonth() && a.getDate() < n.getDate())) age--
  return age > 0 ? String(age) : ''
}

// Glucides = ce qui reste des calories une fois protéines (4 kcal/g) et lipides (9 kcal/g) comptés.
const glucidesRestants = (kcal, p, l) => Math.max(0, Math.round(((nombre(kcal) || 0) - (nombre(p) || 0) * 4 - (nombre(l) || 0) * 9) / 4))

function Champ({ label, id, children }) {
  return <div style={{ flex: 1, minWidth: 0 }}><label htmlFor={id} style={etiquette}>{label}</label>{children}</div>
}

export default function CalculateurApport({ token, onFermer, onEnregistre }) {
  const [charge, setCharge] = useState(false)
  const [profil, setProfil] = useState({ sexe: 'H', age: '', poids: '', taille: '', activite: 'modere', objectif: 'maintenir' })
  const [besoin, setBesoin] = useState(null) // { metabolisme, maintien, min, max, cible } du dernier calcul
  const [macros, setMacros] = useState({ kcal: '', proteines: '', lipides: '', glucides: '' })
  const [envoi, setEnvoi] = useState(false)
  const [erreur, setErreur] = useState(null)

  // Calories + répartition par défaut à partir du profil. null tant qu'il manque une donnée.
  const calculer = (p) => {
    const poids = nombre(p.poids), taille = nombre(p.taille), age = nombre(p.age)
    if (!poids || !taille || !age) return null
    const b = besoinCalorique({ sexe: p.sexe, poids, taille, age, activite: p.activite, objectif: p.objectif })
    setBesoin(b)
    const target = b.cible
    const proteines = Math.round(poids * PROTEINES_PAR_KG)
    const lipides = Math.round(poids * LIPIDES_PAR_KG)
    return { kcal: String(target), proteines: String(proteines), lipides: String(lipides), glucides: String(glucidesRestants(target, proteines, lipides)) }
  }

  useEffect(() => {
    let actif = true
    fetch(`/api/athlete-view/${token}/nutrition/objectifs`, { cache: 'no-store' })
      .then(r => r.json().then(j => ({ ok: r.ok, j })))
      .then(({ ok, j }) => {
        if (!actif) return
        if (!ok) { setErreur(j.error || 'Chargement impossible.'); return }
        const p = {
          sexe: j.profil?.sexe === 'F' ? 'F' : 'H',
          age: ageDepuis(j.profil?.naissance),
          poids: j.profil?.poids ? String(j.profil.poids) : '',
          taille: j.profil?.taille ? String(j.profil.taille) : '',
          activite: 'modere', objectif: 'maintenir',
        }
        setProfil(p)
        // Objectifs déjà enregistrés : on les montre tels quels ; sinon, le calcul par défaut.
        const o = j.objectifs || {}
        const m = calculer(p)
        if (o.kcal) setMacros({ kcal: String(o.kcal), proteines: String(o.proteines ?? ''), lipides: String(o.lipides ?? ''), glucides: String(o.glucides ?? '') })
        else if (m) setMacros(m)
      })
      .catch(() => actif && setErreur('Pas de connexion. Réessaie dans un instant.'))
      .finally(() => actif && setCharge(true))
    return () => { actif = false }
  }, [token])

  // Une donnée du profil change : on refait tout le calcul (calories et répartition par défaut).
  const majProfil = (cle, valeur) => {
    const p = { ...profil, [cle]: valeur }
    setProfil(p)
    const m = calculer(p)
    if (m) setMacros(m)
  }

  // Modification à la main : les glucides complètent, sauf quand ce sont eux qu'on modifie.
  const majMacro = (cle, valeur) => {
    setMacros(m => {
      const n = { ...m, [cle]: valeur }
      if (cle === 'glucides') {
        n.kcal = String(Math.round((nombre(n.proteines) || 0) * 4 + (nombre(n.lipides) || 0) * 9 + (nombre(valeur) || 0) * 4))
      } else {
        n.glucides = String(glucidesRestants(n.kcal, n.proteines, n.lipides))
      }
      return n
    })
  }

  const poids = nombre(profil.poids)
  const parKg = (g) => (poids && nombre(g) != null ? ` · ${(nombre(g) / poids).toFixed(1).replace('.', ',')} g/kg` : '')
  const tropPeu = nombre(macros.kcal) != null && (nombre(macros.proteines) || 0) * 4 + (nombre(macros.lipides) || 0) * 9 > nombre(macros.kcal)

  const enregistrer = async () => {
    setErreur(null)
    setEnvoi(true)
    const corps = Object.fromEntries(Object.entries(macros).map(([k, v]) => [k, nombre(v)]))
    const res = await fetch(`/api/athlete-view/${token}/nutrition/objectifs`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corps),
    }).catch(() => null)
    const j = await res?.json().catch(() => ({}))
    setEnvoi(false)
    if (!res?.ok) { setErreur(j?.error || 'Enregistrement impossible, réessaie.'); return }
    onEnregistre(j.objectifs)
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'var(--bg)', zIndex: 650, display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 16px', paddingTop: 'calc(14px + env(safe-area-inset-top))', borderBottom: '1px solid var(--border)' }}>
        <button aria-label="Fermer" onClick={onFermer} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2, display: 'flex', color: 'var(--text2)' }}><X size={22} /></button>
        <span style={{ fontFamily: 'var(--font-title)', color: 'var(--title)', fontWeight: 700, fontSize: 17 }}>Calculer mon apport</span>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: 16, maxWidth: 480, width: '100%', margin: '0 auto', boxSizing: 'border-box', display: 'flex', flexDirection: 'column', gap: 12, paddingBottom: 'calc(24px + env(safe-area-inset-bottom))' }}>
        {!charge ? <div style={{ fontSize: 13, color: 'var(--text3)', textAlign: 'center' }}>Chargement…</div> : (
          <>
            <div style={carte}>
              <div style={{ fontWeight: 800, fontSize: 15 }}>Toi</div>
              <div style={{ display: 'flex', gap: 10 }}>
                <Champ label="Calcul" id="apport-sexe">
                  <select id="apport-sexe" value={profil.sexe} onChange={e => majProfil('sexe', e.target.value)} style={champ}>
                    <option value="H">Homme</option>
                    <option value="F">Femme</option>
                  </select>
                </Champ>
                <Champ label="Âge" id="apport-age">
                  <input id="apport-age" type="number" inputMode="numeric" value={profil.age} onChange={e => majProfil('age', e.target.value)} style={champ} />
                </Champ>
              </div>
              <div style={{ display: 'flex', gap: 10 }}>
                <Champ label="Poids (kg)" id="apport-poids">
                  <input id="apport-poids" type="number" inputMode="decimal" step="0.1" value={profil.poids} onChange={e => majProfil('poids', e.target.value)} style={champ} />
                </Champ>
                <Champ label="Taille (cm)" id="apport-taille">
                  <input id="apport-taille" type="number" inputMode="numeric" value={profil.taille} onChange={e => majProfil('taille', e.target.value)} style={champ} />
                </Champ>
              </div>
              <Champ label="Activité" id="apport-activite">
                <select id="apport-activite" value={profil.activite} onChange={e => majProfil('activite', e.target.value)} style={champ}>
                  {NIVEAUX_ACTIVITE.map(a => <option key={a.key} value={a.key}>{a.label}</option>)}
                </select>
              </Champ>
              <Champ label="Objectif" id="apport-objectif">
                <select id="apport-objectif" value={profil.objectif} onChange={e => majProfil('objectif', e.target.value)} style={champ}>
                  {OBJECTIFS.map(g => <option key={g.key} value={g.key}>{g.label}</option>)}
                </select>
              </Champ>
              {!poids || !nombre(profil.taille) || !nombre(profil.age) ? (
                <div style={{ fontSize: 12, color: 'var(--text3)' }}>Renseigne ton âge, ton poids et ta taille pour lancer le calcul.</div>
              ) : besoin ? (
                <div style={{ fontSize: 12, color: 'var(--text2)', lineHeight: 1.5, background: 'var(--bg2)', borderRadius: 'var(--r)', padding: '8px 10px' }}>
                  Métabolisme de base : <strong>{besoin.metabolisme} kcal</strong> · Maintien : <strong>{besoin.maintien} kcal</strong>
                  {besoin.min !== besoin.max ? <><br />Fourchette conseillée : <strong>{besoin.min} à {besoin.max} kcal</strong> (milieu retenu ci-dessous)</> : null}
                </div>
              ) : null}
            </div>

            <div style={carte}>
              <div style={{ fontWeight: 800, fontSize: 15 }}>Mes objectifs par jour</div>
              <div style={{ fontSize: 12, color: 'var(--text3)', lineHeight: 1.45 }}>
                Par défaut : protéines 1,8 g/kg, lipides 1,2 g/kg, les glucides complètent. Tu peux tout modifier.
              </div>
              <Champ label="Calories (kcal)" id="apport-kcal">
                <input id="apport-kcal" type="number" inputMode="numeric" value={macros.kcal} onChange={e => majMacro('kcal', e.target.value)} style={{ ...champ, fontWeight: 800 }} />
              </Champ>
              <Champ label={`Protéines (g)${parKg(macros.proteines)}`} id="apport-p">
                <input id="apport-p" type="number" inputMode="numeric" value={macros.proteines} onChange={e => majMacro('proteines', e.target.value)} style={champ} />
              </Champ>
              <Champ label={`Lipides (g)${parKg(macros.lipides)}`} id="apport-l">
                <input id="apport-l" type="number" inputMode="numeric" value={macros.lipides} onChange={e => majMacro('lipides', e.target.value)} style={champ} />
              </Champ>
              <Champ label={`Glucides (g)${parKg(macros.glucides)}`} id="apport-g">
                <input id="apport-g" type="number" inputMode="numeric" value={macros.glucides} onChange={e => majMacro('glucides', e.target.value)} style={champ} />
              </Champ>
              {tropPeu ? (
                <div style={{ fontSize: 12, color: 'var(--bordeaux)' }}>Protéines et lipides dépassent déjà tes calories : il ne reste rien pour les glucides.</div>
              ) : null}
            </div>
          </>
        )}

        {erreur ? <div role="alert" style={{ background: 'var(--bordeaux-light)', color: 'var(--bordeaux)', borderRadius: 'var(--r)', padding: '10px 12px', fontSize: 13 }}>{erreur}</div> : null}

        {charge ? (
          <button onClick={enregistrer} disabled={envoi || !nombre(macros.kcal)} style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 'var(--r)', padding: '14px', fontSize: 15, fontWeight: 700,
            cursor: 'pointer', fontFamily: 'inherit', background: 'var(--green)', color: '#fff', border: 'none', opacity: envoi || !nombre(macros.kcal) ? 0.5 : 1,
          }}>
            {envoi ? 'Enregistrement…' : 'Enregistrer mes objectifs'}
          </button>
        ) : null}
      </div>
    </div>
  )
}
