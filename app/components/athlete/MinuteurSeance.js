'use client'

import { createContext, useContext, useState, useSyncExternalStore } from 'react'
import EmbeddedTimer from '@/app/components/EmbeddedTimer'
import TimerConfigEditor, { defaultTimerConfig } from '@/app/components/TimerConfigEditor'
import { unlockAudio } from '@/lib/audioBeep'
import { unlockSpeech } from '@/lib/speak'

// Minuteur de séance (AMRAP, EMOM, Tabata, For Time, Perso), commun au sportif et au coaching.
// Panneau fixé en haut de l'écran, la séance défile en dessous. Trois vues : moitié d'écran,
// minuteur plein écran, ou séance « plein écran » avec le minuteur réduit en bandeau. Le chrono
// (EmbeddedTimer) reste monté au même endroit de l'arbre quelle que soit la vue, sinon il repartirait
// de zéro. Téléphone en paysage : le minuteur lancé passe d'office en plein écran, lisible de loin.

const Contexte = createContext(null)
export const useMinuteur = () => useContext(Contexte)

const BANDEAU = 'calc(56px + env(safe-area-inset-top, 0px))'
const PAYSAGE = '(orientation: landscape) and (max-height: 540px)'

function usePaysageTelephone() {
  return useSyncExternalStore(
    (cb) => {
      const mq = window.matchMedia(PAYSAGE)
      mq.addEventListener('change', cb)
      return () => mq.removeEventListener('change', cb)
    },
    () => window.matchMedia(PAYSAGE).matches,
    () => false
  )
}

const rond = {
  background: 'var(--bg)', border: '1px solid var(--border2)', borderRadius: 20, height: 34, minWidth: 34,
  padding: '0 10px', fontSize: 13, fontWeight: 600, color: 'var(--text2)', cursor: 'pointer', fontFamily: 'inherit', flex: 'none',
}

export function MinuteurProvider({ children }) {
  const [ouvert, setOuvert] = useState(false)
  const [config, setConfig] = useState(() => defaultTimerConfig('AMRAP'))
  const [lancement, setLancement] = useState(0) // 0 = écran de réglage ; sinon clé du chrono lancé
  const [vue, setVue] = useState('moitie') // 'moitie' | 'minuteur' | 'seance'
  const paysage = usePaysageTelephone()

  const vueEffective = lancement && paysage ? 'minuteur' : vue
  const reduit = vueEffective === 'seance'
  const hauteur = vueEffective === 'minuteur' ? '100svh' : reduit ? BANDEAU : '50svh'

  const fermer = () => { setOuvert(false); setLancement(0); setVue('moitie') }
  const lancer = () => {
    // Débloque le son et la voix pendant le geste de l'utilisateur (iOS les refuse sinon).
    unlockAudio()
    unlockSpeech()
    setLancement(Date.now())
  }

  return (
    <Contexte.Provider value={{ ouvert, ouvrir: () => setOuvert(true) }}>
      {ouvert ? (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, height: hauteur, zIndex: 850, boxSizing: 'border-box',
          paddingTop: 'env(safe-area-inset-top, 0px)', background: 'var(--bg2)', borderBottom: '1px solid var(--border)',
          boxShadow: '0 4px 14px rgba(0,0,0,0.08)', display: 'flex', flexDirection: reduit ? 'row' : 'column',
          alignItems: reduit ? 'center' : 'stretch', transition: 'height .2s ease',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 10px', flex: 'none' }}>
            <button type="button" onClick={fermer} aria-label="Fermer le minuteur" style={rond}>✕</button>
            {!reduit && lancement ? <button type="button" onClick={() => setLancement(0)} style={rond}>Régler</button> : null}
            {!reduit ? <span style={{ flex: 1 }} /> : null}
            {reduit ? (
              <button type="button" onClick={() => setVue('moitie')} aria-label="Agrandir le minuteur" style={rond}>⤢</button>
            ) : paysage && lancement ? null : vue === 'minuteur' ? (
              <button type="button" onClick={() => setVue('moitie')} style={rond}>⤡ Moitié</button>
            ) : (
              <>
                <button type="button" onClick={() => setVue('seance')} style={rond}>Séance ⤢</button>
                <button type="button" onClick={() => setVue('minuteur')} style={rond}>Minuteur ⤢</button>
              </>
            )}
          </div>

          <div style={{ flex: 1, minHeight: 0, height: reduit ? '100%' : undefined, containerType: 'size', overflow: lancement ? 'hidden' : 'auto' }}>
            {lancement ? (
              <EmbeddedTimer key={lancement} config={config} decompteDepart={5} compact={reduit} />
            ) : reduit ? (
              <button type="button" onClick={() => setVue('moitie')} style={{ ...rond, border: 'none', background: 'none', height: '100%' }}>
                Minuteur à régler
              </button>
            ) : (
              <div style={{ padding: '0 16px 16px', maxWidth: 520, margin: '0 auto' }}>
                <TimerConfigEditor value={config} onChange={setConfig} />
                <button type="button" onClick={lancer} style={{
                  width: '100%', marginTop: 16, padding: 13, borderRadius: 12, border: 'none', background: 'var(--green)',
                  color: '#fff', fontSize: 15, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
                }}>
                  ▶ Lancer
                </button>
              </div>
            )}
          </div>
        </div>
      ) : null}
      <div style={{ paddingTop: ouvert ? hauteur : 0 }}>{children}</div>
    </Contexte.Provider>
  )
}
