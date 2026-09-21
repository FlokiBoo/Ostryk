'use client'

import { useState } from 'react'
import { PersonSimpleRun, Lightning, Barbell, Heartbeat, CaretLeft, Play, NotePencil, Trophy } from '@phosphor-icons/react'

// "Séance libre" enchaîne deux choix avant de créer la séance :
// 1. Standard/Cardio — même distinction que côté coach (voir app/programs/.../page.js), pour que
//    la recherche de mouvement propose directement Run/Row/Ski Erg/Bike plutôt que la bibliothèque force.
// 2. Maintenant/Plus tard — "Maintenant" ouvre direct la séance en cours (comme avant : le sportif
//    ajoute ses exercices et logue ses performances en direct, à la volée). "Plus tard" ouvre le
//    même éditeur "blocks" que le coach (SessionBlockEditor) pour construire la séance à l'avance
//    (exercices, séries/récup ou allure cardio), sans la lancer tout de suite.
export default function AddActionSheet({ onClose, onAddActivity, onFreeSession, onAddRecord }) {
  const [step, setStep] = useState('root') // 'root' | 'mode' | 'timing'
  const [mode, setMode] = useState(null)

  const pickMode = (m) => { setMode(m); setStep('timing') }

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.4)', zIndex: 600, display: 'flex', alignItems: 'flex-end' }}>
      <div onClick={e => e.stopPropagation()} style={{
        background: 'var(--bg)', borderRadius: '20px 20px 0 0', padding: '20px 16px', width: '100%', maxWidth: 480, margin: '0 auto',
        display: 'flex', flexDirection: 'column', gap: 10, paddingBottom: 'calc(20px + env(safe-area-inset-bottom))',
      }}>
        <div style={{ width: 36, height: 4, borderRadius: 2, background: 'var(--border2)', margin: '0 auto 8px' }} />

        {step === 'root' && (
          <>
            <button onClick={onAddActivity} style={{
              display: 'flex', alignItems: 'center', gap: 12, background: 'var(--bg2)', border: '1px solid var(--border)',
              borderRadius: 'var(--rl)', padding: '16px', cursor: 'pointer', textAlign: 'left',
            }}>
              <span style={{ display: 'flex' }}><PersonSimpleRun size={24} /></span>
              <div>
                <div style={{ fontWeight: 700, fontSize: 15 }}>Ajouter une activité</div>
                <div style={{ fontSize: 12, color: 'var(--text3)' }}>Choisis une discipline, note ton bien-être et tes résultats</div>
              </div>
            </button>

            <button onClick={() => setStep('mode')} style={{
              display: 'flex', alignItems: 'center', gap: 12, background: 'var(--bg2)', border: '1px solid var(--border)',
              borderRadius: 'var(--rl)', padding: '16px', cursor: 'pointer', textAlign: 'left',
            }}>
              <span style={{ display: 'flex' }}><Lightning size={24} /></span>
              <div>
                <div style={{ fontWeight: 700, fontSize: 15 }}>Séance libre</div>
                <div style={{ fontSize: 12, color: 'var(--text3)' }}>Ajoute des exercices et note tes performances</div>
              </div>
            </button>

            {/* Le "+" proposait d'ajouter une activité mais pas un record, alors que c'est le même
                geste dans la tête du sportif (retour testeur). Raccourci vers l'écran Performances,
                où vit déjà toute la saisie (choix du mouvement, unité, détection du PR) — plutôt
                qu'un second formulaire de saisie à maintenir en parallèle. */}
            {onAddRecord && (
              <button onClick={onAddRecord} style={{
                display: 'flex', alignItems: 'center', gap: 12, background: 'var(--bg2)', border: '1px solid var(--border)',
                borderRadius: 'var(--rl)', padding: '16px', cursor: 'pointer', textAlign: 'left',
              }}>
                <span style={{ display: 'flex' }}><Trophy size={24} /></span>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 15 }}>Ajouter un record</div>
                  <div style={{ fontSize: 12, color: 'var(--text3)' }}>Note une nouvelle perf sur un mouvement suivi</div>
                </div>
              </button>
            )}

            <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text3)', fontSize: 14, fontWeight: 600, cursor: 'pointer', padding: '8px 0', textAlign: 'center' }}>
              Annuler
            </button>
          </>
        )}

        {step === 'mode' && (
          <>
            <button onClick={() => setStep('root')} style={{
              display: 'inline-flex', alignItems: 'center', gap: 4, background: 'none', border: 'none',
              color: 'var(--text3)', fontSize: 13, fontWeight: 600, cursor: 'pointer', padding: '0 0 4px', alignSelf: 'flex-start',
            }}>
              <CaretLeft size={14} /> Retour
            </button>

            <button onClick={() => pickMode('standard')} style={{
              display: 'flex', alignItems: 'center', gap: 12, background: 'var(--bg2)', border: '1px solid var(--border)',
              borderRadius: 'var(--rl)', padding: '16px', cursor: 'pointer', textAlign: 'left',
            }}>
              <span style={{ display: 'flex' }}><Barbell size={24} /></span>
              <div>
                <div style={{ fontWeight: 700, fontSize: 15 }}>Standard</div>
                <div style={{ fontSize: 12, color: 'var(--text3)' }}>Musculation, circuit... choisis librement dans le catalogue</div>
              </div>
            </button>

            <button onClick={() => pickMode('cardio')} style={{
              display: 'flex', alignItems: 'center', gap: 12, background: 'var(--bg2)', border: '1px solid var(--border)',
              borderRadius: 'var(--rl)', padding: '16px', cursor: 'pointer', textAlign: 'left',
            }}>
              <span style={{ display: 'flex' }}><Heartbeat size={24} /></span>
              <div>
                <div style={{ fontWeight: 700, fontSize: 15 }}>Cardio</div>
                <div style={{ fontSize: 12, color: 'var(--text3)' }}>Course, rameur, ski erg... avec une allure en % VMA/Seuil</div>
              </div>
            </button>

            <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text3)', fontSize: 14, fontWeight: 600, cursor: 'pointer', padding: '8px 0', textAlign: 'center' }}>
              Annuler
            </button>
          </>
        )}

        {step === 'timing' && (
          <>
            <button onClick={() => setStep('mode')} style={{
              display: 'inline-flex', alignItems: 'center', gap: 4, background: 'none', border: 'none',
              color: 'var(--text3)', fontSize: 13, fontWeight: 600, cursor: 'pointer', padding: '0 0 4px', alignSelf: 'flex-start',
            }}>
              <CaretLeft size={14} /> Retour
            </button>

            <button onClick={() => onFreeSession(mode, 'now')} style={{
              display: 'flex', alignItems: 'center', gap: 12, background: 'var(--bg2)', border: '1px solid var(--border)',
              borderRadius: 'var(--rl)', padding: '16px', cursor: 'pointer', textAlign: 'left',
            }}>
              <span style={{ display: 'flex' }}><Play size={24} weight="fill" /></span>
              <div>
                <div style={{ fontWeight: 700, fontSize: 15 }}>Maintenant, en direct</div>
                <div style={{ fontSize: 12, color: 'var(--text3)' }}>Ajoute tes exercices et note tes performances au fur et à mesure</div>
              </div>
            </button>

            <button onClick={() => onFreeSession(mode, 'later')} style={{
              display: 'flex', alignItems: 'center', gap: 12, background: 'var(--bg2)', border: '1px solid var(--border)',
              borderRadius: 'var(--rl)', padding: '16px', cursor: 'pointer', textAlign: 'left',
            }}>
              <span style={{ display: 'flex' }}><NotePencil size={24} /></span>
              <div>
                <div style={{ fontWeight: 700, fontSize: 15 }}>Programmer pour plus tard</div>
                <div style={{ fontSize: 12, color: 'var(--text3)' }}>Prépare la séance (exercices, séries, allure) sans la lancer tout de suite</div>
              </div>
            </button>

            <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text3)', fontSize: 14, fontWeight: 600, cursor: 'pointer', padding: '8px 0', textAlign: 'center' }}>
              Annuler
            </button>
          </>
        )}
      </div>
    </div>
  )
}
