import { NavLink, Link, useNavigate } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { onAuthStateChanged, type User } from 'firebase/auth'
import { format } from 'date-fns'
import clsx from 'clsx'

import { auth } from '@/lib/firebase'
import { useStreak } from '@/hooks/useStreak'
import { useFocusMode } from '@/context/FocusModeContext'
import { useSearch } from '@/context/SearchContext'

const NAV_ITEMS = [
  { label: 'Journal', icon: 'edit_note', to: '/' },
  { label: 'History', icon: 'calendar_month', to: '/history' },
  { label: 'Insights', icon: 'bar_chart', to: '/insights' },
  { label: 'Settings', icon: 'settings', to: '/settings' },
]

const now = new Date()

export default function SideNav() {
  const [user, setUser] = useState<User | null>(null)
  const { current: streakCount } = useStreak()
  const navigate = useNavigate()
  const { isFocused } = useFocusMode()
  const { openSearch } = useSearch()

  useEffect(() => {
    return onAuthStateChanged(auth, setUser)
  }, [])

  return (
    <nav
      className={clsx(
        'bg-surface-container-low border-outline-variant/20 fixed top-0 left-0 z-30 hidden h-screen w-64 flex-col border-r px-5 py-8 transition-all duration-500 md:flex',
        isFocused && 'md:pointer-events-none md:-translate-x-full md:opacity-0',
      )}
    >
      {/* Brand */}
      <div className="mb-8 px-1">
        <div className="mb-1 flex items-center gap-2.5">
          <div className="bg-primary/10 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg">
            <span className="material-symbols-outlined text-primary text-[18px]">edit_note</span>
          </div>
          <span className="font-display text-on-surface text-2xl leading-none font-semibold tracking-tight">
            Reflect
          </span>
        </div>
        <p className="text-on-surface-variant/60 pl-10 text-[10px] tracking-[0.18em] uppercase">
          The Quiet Sanctuary
        </p>
      </div>

      {/* Today's date — editorial feature */}
      <div className="border-outline-variant/25 mb-6 border-b px-1 pb-6">
        <p className="text-on-surface-variant mb-0.5 text-[10px] tracking-[0.2em] uppercase">
          {format(now, 'EEEE')}
        </p>
        <p className="font-display text-primary text-3xl leading-none font-light">
          {format(now, 'MMMM d')}
        </p>
        <p className="text-on-surface-variant/50 mt-0.5 text-[10px]">{format(now, 'yyyy')}</p>
      </div>

      {/* Nav items */}
      <div className="flex flex-col gap-0.5">
        {NAV_ITEMS.map(({ label, icon, to }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={({ isActive }) =>
              clsx(
                'flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-all duration-200',
                isActive
                  ? 'bg-surface-container-lowest text-primary font-semibold shadow-sm'
                  : 'text-on-surface-variant hover:bg-surface-container hover:text-on-surface',
              )
            }
          >
            <span className="material-symbols-outlined text-[20px]">{icon}</span>
            <span>{label}</span>
          </NavLink>
        ))}
      </div>

      {/* Secondary links */}
      <div className="mt-2 flex flex-col gap-0.5">
        <Link
          to="/trash"
          className="text-on-surface-variant/60 hover:text-on-surface-variant hover:bg-surface-container flex items-center gap-3 rounded-xl px-3 py-2 text-xs transition-colors"
        >
          <span className="material-symbols-outlined text-[18px]">delete</span>
          <span>Trash</span>
        </Link>

        <button
          onClick={openSearch}
          className="text-on-surface-variant hover:bg-surface-container flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-colors"
        >
          <span className="material-symbols-outlined text-[20px]">search</span>
          <span className="flex-1 text-left">Search</span>
          <kbd className="bg-surface-container-high text-on-surface-variant/60 rounded-md px-1.5 py-0.5 font-mono text-[9px]">
            ⌘K
          </kbd>
        </button>
      </div>

      {/* Bottom section */}
      <div className="mt-auto flex flex-col gap-4">
        <button
          onClick={() => navigate('/')}
          className="bg-primary hover:bg-primary-dim text-on-primary w-full rounded-full px-4 py-2.5 text-sm font-semibold shadow-sm transition-colors"
        >
          New Entry
        </button>

        {user && (
          <div className="border-outline-variant/20 flex items-center gap-3 border-t px-1 pt-1">
            {user.photoURL ? (
              <img
                src={user.photoURL}
                alt={user.displayName ?? 'User'}
                className="ring-outline-variant/30 h-7 w-7 shrink-0 rounded-full ring-1"
              />
            ) : (
              <div className="bg-primary-container flex h-7 w-7 shrink-0 items-center justify-center rounded-full">
                <span className="material-symbols-outlined text-on-primary-container text-sm">
                  person
                </span>
              </div>
            )}
            <div className="flex min-w-0 flex-col">
              <span className="text-on-surface truncate text-xs font-medium">
                {user.displayName}
              </span>
              {streakCount > 0 && (
                <span className="text-on-surface-variant/70 text-[10px]">
                  🔥 {streakCount}-day streak
                </span>
              )}
            </div>
          </div>
        )}
      </div>
    </nav>
  )
}
