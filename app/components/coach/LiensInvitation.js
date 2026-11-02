'use client'

import { useState } from 'react'
import { CheckCircle, Copy } from '@phosphor-icons/react'

// Liens d'invitation personnels d'un client (app/rejoindre/[token]) : n'expirent pas et relient le
// compte créé à SA fiche — pas de doublon comme avec le lien général d'inscription. Deux versions :
// internet (iPhone, ordinateur) et app Android (?app=android : compte créé dans le navigateur puis
// envoi vers le Play Store). Utilisé sur la fiche client et dans la vue Semaine (AthleteQuickNav).
const LIENS = [
  { cle: 'web', titre: 'Internet — iPhone et ordinateur', suffixe: '', detail: 'Arrive directement dans son espace sur le site.' },
  { cle: 'android', titre: 'App Android', suffixe: '?app=android', detail: 'Crée son compte, puis est envoyé vers l’app pour s’y connecter.' },
]

export default function LiensInvitation({ token, prenom }) {
  const [copie, setCopie] = useState(null)
  const origine = typeof window !== 'undefined' ? window.location.origin : 'https://www.ostryk.fr'

  const partager = async (cle, lien) => {
    const texte = cle === 'android'
      ? `Salut ${prenom}, voici ton lien pour créer ton compte Ostryk et installer l'app Android : ${lien}`
      : `Salut ${prenom}, voici ton lien pour créer ton compte Ostryk : ${lien}`
    // Sur téléphone, la feuille de partage (SMS, WhatsApp…) ; sinon copie dans le presse-papiers.
    if (navigator.share) {
      try { await navigator.share({ text: texte }); return } catch { /* partage annulé : on copie */ }
    }
    try { await navigator.clipboard.writeText(lien); setCopie(cle); setTimeout(() => setCopie(null), 2000) } catch { /* presse-papiers refusé */ }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ fontSize: 12, color: 'var(--text3)', lineHeight: 1.45 }}>
        N&apos;expire pas et relie le compte à cette fiche. {prenom} vérifie ses infos et choisit son mot de passe.
      </div>
      {LIENS.map(({ cle, titre, suffixe, detail }) => {
        const lien = `${origine}/rejoindre/${token}${suffixe}`
        return (
          <div key={cle} style={{ display: 'flex', flexDirection: 'column', gap: 6, paddingTop: 8, borderTop: '1px solid var(--border)' }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)' }}>{titre}</div>
            <div style={{ fontSize: 11, color: 'var(--text3)' }}>{detail}</div>
            <div style={{ fontSize: 12, fontFamily: 'monospace', color: 'var(--text2)', background: 'var(--bg2)', borderRadius: 6, padding: '8px 10px', wordBreak: 'break-all' }}>
              {lien}
            </div>
            <button type="button" onClick={() => partager(cle, lien)} style={{
              background: copie === cle ? '#166534' : 'var(--bordeaux)', color: '#fff', border: 'none', borderRadius: 'var(--r)', padding: 11,
              fontSize: 14, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            }}>
              {copie === cle ? <><CheckCircle size={15} /> Lien copié</> : <><Copy size={15} /> Copier / partager</>}
            </button>
          </div>
        )
      })}
    </div>
  )
}
