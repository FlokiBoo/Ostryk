'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { Eye, EyeSlash } from '@phosphor-icons/react'
import { supabase } from '@/lib/supabase'
import PasswordChecklist from '@/app/components/PasswordChecklist'
import { isPasswordValid } from '@/lib/passwordPolicy'

// Page du lien d'invitation personnel (voir app/api/rejoindre/[token]/route.js) : le client choisit
// son mot de passe, le compte est rattaché à la fiche que le coach a déjà créée, puis il entre
// directement dans son espace.

const etiquette = { fontSize: 11, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.4px' }

const champ = {
  width: '100%', boxSizing: 'border-box', padding: '12px 14px', border: '1px solid var(--border2)', borderRadius: 'var(--r)',
  fontSize: 16, outline: 'none', background: 'var(--bg2)', color: 'var(--text)', fontFamily: 'inherit',
}

export default function RejoindrePage() {
  const { token } = useParams()
  const router = useRouter()
  const [infos, setInfos] = useState(null) // { prenom, email, active } | { invalide: true }
  const [prenom, setPrenom] = useState('')
  const [nom, setNom] = useState('')
  const [naissance, setNaissance] = useState('')
  const [taille, setTaille] = useState('')
  const [poids, setPoids] = useState('')
  const [poidsCible, setPoidsCible] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [voir, setVoir] = useState(false)
  const [cgu, setCgu] = useState(false)
  const [envoi, setEnvoi] = useState(false)
  const [erreur, setErreur] = useState('')

  useEffect(() => {
    let actif = true
    fetch(`/api/rejoindre/${token}`).then(async r => {
      const json = await r.json().catch(() => ({}))
      if (!actif) return
      if (!r.ok) { setInfos({ invalide: true }); return }
      setInfos(json)
      if (json.email) setEmail(json.email)
      if (json.prenom) setPrenom(json.prenom)
      if (json.nom) setNom(json.nom)
    }).catch(() => { if (actif) setInfos({ invalide: true }) })
    return () => { actif = false }
  }, [token])

  const valider = async (e) => {
    e.preventDefault()
    setErreur('')
    if (!prenom.trim()) { setErreur('Ton prénom est requis.'); return }
    if (!cgu) { setErreur('Merci d’accepter les CGU et la politique de confidentialité.'); return }
    if (!isPasswordValid(password)) { setErreur('Le mot de passe ne respecte pas encore toutes les règles.'); return }
    setEnvoi(true)
    const res = await fetch(`/api/rejoindre/${token}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
        email, password, prenom, nom,
        birth_date: naissance || null, height: taille || null, weight: poids || null, target_weight: poidsCible || null,
      }),
    })
    const json = await res.json().catch(() => ({}))
    if (!res.ok) {
      setEnvoi(false)
      if (json.active) setInfos(i => ({ ...i, active: true }))
      setErreur(json.error || 'Activation impossible, réessaie.')
      return
    }
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim().toLowerCase(), password })
    if (error) { router.push('/login'); return }
    router.push(`/s/${token}`)
  }

  return (
    <div style={{ minHeight: '100svh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg2)', padding: 20 }}>
      <div style={{ width: '100%', maxWidth: 380, background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 'var(--rl)', padding: '32px 28px' }}>
        <div style={{ textAlign: 'center', marginBottom: 20 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo-ostryk-transparent.png" alt="OSTRYK" style={{ width: 130, height: 'auto', margin: '0 auto 4px' }} />
        </div>

        {infos === null ? (
          <p style={{ textAlign: 'center', color: 'var(--text3)', fontSize: 14 }}>Chargement…</p>
        ) : infos.invalide ? (
          <>
            <p style={{ fontSize: 15, color: 'var(--text)', textAlign: 'center', margin: '0 0 8px' }}>Ce lien d’invitation n’est pas valide.</p>
            <p style={{ fontSize: 13, color: 'var(--text3)', textAlign: 'center', margin: 0 }}>Demande à ton coach de te le renvoyer.</p>
          </>
        ) : infos.active ? (
          <>
            <p style={{ fontSize: 15, color: 'var(--text)', textAlign: 'center', margin: '0 0 16px' }}>
              {infos.prenom ? `${infos.prenom}, ton` : 'Ton'} compte est déjà activé.
            </p>
            <button type="button" onClick={() => router.push('/login')} style={{
              width: '100%', background: 'var(--green)', color: '#fff', border: 'none', borderRadius: 'var(--r)', padding: 14, fontSize: 15, fontWeight: 700, cursor: 'pointer',
            }}>
              Se connecter
            </button>
          </>
        ) : (
          <form onSubmit={valider} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ textAlign: 'center', marginBottom: 4 }}>
              <div style={{ fontFamily: 'var(--font-title)', fontSize: 20, color: 'var(--bordeaux)' }}>
                {infos.prenom ? `Bienvenue ${infos.prenom}` : 'Bienvenue'}
              </div>
              <div style={{ fontSize: 13, color: 'var(--text3)', marginTop: 4 }}>Ton coach t’a préparé ton espace. Vérifie tes informations et choisis ton mot de passe pour y accéder.</div>
            </div>

            <div style={{ display: 'flex', gap: 10 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <label style={etiquette} htmlFor="rejoindre-prenom">Prénom</label>
                <input id="rejoindre-prenom" autoComplete="given-name" required value={prenom} onChange={e => setPrenom(e.target.value)} style={{ ...champ, marginTop: 5 }} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <label style={etiquette} htmlFor="rejoindre-nom">Nom</label>
                <input id="rejoindre-nom" autoComplete="family-name" value={nom} onChange={e => setNom(e.target.value)} style={{ ...champ, marginTop: 5 }} />
              </div>
            </div>

            <div>
              <label style={etiquette} htmlFor="rejoindre-naissance">Date de naissance</label>
              <input id="rejoindre-naissance" type="date" value={naissance} onChange={e => setNaissance(e.target.value)} style={{ ...champ, marginTop: 5 }} />
            </div>

            <div style={{ display: 'flex', gap: 10 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <label style={etiquette} htmlFor="rejoindre-taille">Taille (cm)</label>
                <input id="rejoindre-taille" type="number" inputMode="numeric" placeholder="175" value={taille} onChange={e => setTaille(e.target.value)} style={{ ...champ, marginTop: 5 }} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <label style={etiquette} htmlFor="rejoindre-poids">Poids (kg)</label>
                <input id="rejoindre-poids" type="number" inputMode="decimal" step="0.1" placeholder="70.5" value={poids} onChange={e => setPoids(e.target.value)} style={{ ...champ, marginTop: 5 }} />
              </div>
            </div>

            <div>
              <label style={etiquette} htmlFor="rejoindre-cible">Poids cible (kg) · optionnel, mais conseillé</label>
              <input id="rejoindre-cible" type="number" inputMode="decimal" step="0.1" placeholder="65.0" value={poidsCible} onChange={e => setPoidsCible(e.target.value)} style={{ ...champ, marginTop: 5 }} />
            </div>

            <div>
              <label style={etiquette} htmlFor="rejoindre-email">Email</label>
              <input id="rejoindre-email" type="email" autoComplete="email" required value={email} onChange={e => setEmail(e.target.value)} style={{ ...champ, marginTop: 5 }} />
            </div>

            <label style={{ ...etiquette, marginBottom: -7 }} htmlFor="rejoindre-mdp">Mot de passe</label>
            <div style={{ position: 'relative' }}>
              <input id="rejoindre-mdp" type={voir ? 'text' : 'password'} autoComplete="new-password" required value={password} onChange={e => setPassword(e.target.value)} style={{ ...champ, paddingRight: 46 }} />
              <button type="button" aria-label={voir ? 'Masquer le mot de passe' : 'Afficher le mot de passe'} onClick={() => setVoir(v => !v)} style={{
                position: 'absolute', right: 4, top: '50%', transform: 'translateY(-50%)', width: 40, height: 40, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text3)', display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                {voir ? <EyeSlash size={18} /> : <Eye size={18} />}
              </button>
            </div>
            <PasswordChecklist password={password} />

            <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 12, color: 'var(--text2)', cursor: 'pointer', lineHeight: 1.4 }}>
              <input type="checkbox" checked={cgu} onChange={e => setCgu(e.target.checked)} style={{ marginTop: 2, accentColor: 'var(--green)' }} />
              <span>J&apos;accepte les <a href="/cgu" style={{ color: 'var(--green)' }}>CGU</a> et la <a href="/confidentialite" style={{ color: 'var(--green)' }}>politique de confidentialité</a>.</span>
            </label>

            {erreur ? <p role="alert" style={{ fontSize: 13, color: '#A32D2D', margin: 0 }}>{erreur}</p> : null}

            <button type="submit" disabled={envoi} style={{
              width: '100%', background: 'var(--green)', color: '#fff', border: 'none', borderRadius: 'var(--r)', padding: 14, fontSize: 15, fontWeight: 700,
              cursor: 'pointer', opacity: envoi ? 0.6 : 1, marginTop: 4,
            }}>
              {envoi ? 'Activation…' : 'Activer mon compte'}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
