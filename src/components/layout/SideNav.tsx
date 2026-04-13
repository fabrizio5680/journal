import { NavLink, useNavigate } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { onAuthStateChanged, type User } from 'firebase/auth'
import clsx from 'clsx'

import { auth } from '@/lib/firebase'
import { useStreak } from '@/hooks/useStreak'

const NAV_ITEMS = [
  { label: 'Journal', icon: 'edit_note', to: '/' },
  { label: 'History', icon: 'calendar_month', to: '/history' },
  { label: 'Insights', icon: 'bar_chart', to: '/insights' },
  { label: 'Settings', icon: 'settings', to: '/settings' },
]

export default function SideNav() {
  const [user, setUser] = useState<User | null>(null)
  const { current: streakCount } = useStreak()
  const navigate = useNavigate()

  useEffect(() => {
    return onAuthStateChanged(auth, setUser)
  }, [])

  return (
    <nav className="bg-surface-container-low fixed top-0 left-0 z-30 hidden h-screen w-64 flex-col px-4 py-8 md:flex">
      {/* Logo + brand */}
      <div className="mb-8 flex items-center gap-3">
        <div className="bg-primary-container flex h-10 w-10 shrink-0 items-center justify-center rounded-xl">
          <span className="material-symbols-outlined text-on-primary-container">edit_note</span>
        </div>
        <div className="flex flex-col">
          <span className="text-on-surface text-xl leading-none font-black">Reflect</span>
          <span className="text-on-surface-variant text-xs">The Quiet Sanctuary</span>
        </div>
      </div>

      {/* Nav items */}
      <div className="flex flex-col gap-1">
        {NAV_ITEMS.map(({ label, icon, to }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={({ isActive }) =>
              clsx(
                'flex items-center gap-3 rounded-xl px-4 py-3 transition-colors duration-300',
                isActive
                  ? 'bg-surface-container-lowest text-primary scale-[0.98] font-bold shadow-sm'
                  : 'text-on-surface-variant hover:bg-surface-bright',
              )
            }
          >
            <span className="material-symbols-outlined text-xl">{icon}</span>
            <span>{label}</span>
          </NavLink>
        ))}
      </div>

      {/* Bottom section */}
      <div className="mt-auto flex flex-col gap-4">
        <button
          onClick={() => navigate('/')}
          className="bg-primary hover:bg-primary-dim text-on-primary w-full rounded-full px-4 py-3 font-bold transition-colors"
        >
          New Entry
        </button>

        {user && (
          <div className="flex items-center gap-3 px-1">
            {user.photoURL ? (
              <img
                src={user.photoURL}
                alt={user.displayName ?? 'User'}
                className="h-8 w-8 shrink-0 rounded-full"
              />
            ) : (
              <div className="bg-primary-container flex h-8 w-8 shrink-0 items-center justify-center rounded-full">
                <span className="material-symbols-outlined text-on-primary-container text-sm">
                  person
                </span>
              </div>
            )}
            <div className="flex min-w-0 flex-col">
              <span className="text-on-surface truncate text-sm font-medium">
                {user.displayName}
              </span>
              {streakCount > 0 && (
                <span className="text-on-surface-variant text-xs">🔥 {streakCount} day streak</span>
              )}
            </div>
          </div>
        )}
      </div>
    </nav>
  )
}
