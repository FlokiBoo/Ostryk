'use client'

import { ChartBar, House, User } from '@phosphor-icons/react'

// Performances a été fusionné dans Stats : deux onglets à gauche du "+", un à droite. Chaque côté
// prend la même largeur pour que le "+" reste centré.
const TABS = [
  { key: 'wod', label: 'Accueil', Icon: House },
  { key: 'stats', label: 'Stats', Icon: ChartBar },
]
const TABS_RIGHT = [
  { key: 'profil', label: 'Profil', Icon: User },
]

export default function AthleteTabBar({ active, onChange, onAdd, addActive = false, unreadMessages = 0 }) {
  const renderTab = (t) => {
    const isActive = active === t.key
    return (
      <button key={t.key} onClick={() => onChange(t.key)} style={{
        flex: 1, background: 'none', border: 'none', cursor: 'pointer',
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
        padding: '10px 4px 8px', color: isActive ? 'var(--green)' : 'var(--text3)',
      }}>
        <span style={{ position: 'relative', lineHeight: 1, opacity: isActive ? 1 : 0.7 }}>
          <t.Icon size={22} weight={isActive ? 'fill' : 'regular'} />
          {t.key === 'profil' && unreadMessages > 0 && (
            <span style={{
              position: 'absolute', top: -4, right: -8, background: '#DC2626', color: '#fff',
              borderRadius: 20, minWidth: 15, height: 15, fontSize: 10, fontWeight: 800,
              display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 3px',
              border: '1.5px solid var(--bg)', lineHeight: 1,
            }}>
              {unreadMessages > 9 ? '9+' : unreadMessages}
            </span>
          )}
        </span>
        <span style={{ fontSize: 10, fontWeight: isActive ? 800 : 600 }}>{t.label}</span>
      </button>
    )
  }

  return (
    <div style={{
      position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 200,
      background: 'var(--bg)', borderTop: '1px solid var(--border)',
      display: 'flex', alignItems: 'center', paddingBottom: 'calc(env(safe-area-inset-bottom) + 14px)',
      maxWidth: 480, margin: '0 auto',
    }}>
      <div style={{ flex: 1, display: 'flex' }}>{TABS.map(renderTab)}</div>

      <button onClick={onAdd} style={{
        flex: '0 0 auto', width: 48, height: 48, borderRadius: '50%', margin: '0 6px',
        background: addActive ? 'var(--green-light)' : 'var(--green)', border: 'none', cursor: 'pointer',
        display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, color: addActive ? 'var(--green)' : '#fff',
        boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
      }} aria-label="Ajouter">
        +
      </button>

      <div style={{ flex: 1, display: 'flex' }}>{TABS_RIGHT.map(renderTab)}</div>
    </div>
  )
}
