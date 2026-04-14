import { useEffect, useState } from 'react'
import { onAuthStateChanged, type User } from 'firebase/auth'
import { format, formatDistanceToNow } from 'date-fns'
import clsx from 'clsx'

import { auth } from '@/lib/firebase'
import { useSaveStatus } from '@/context/SaveStatusContext'
import { useFocusMode } from '@/context/FocusModeContext'

export default function TopBar() {
  const [user, setUser] = useState<User | null>(null)
  const now = new Date()
  const { isDirty, lastSaved } = useSaveStatus()
  const { isFocused } = useFocusMode()

  useEffect(() => {
    return onAuthStateChanged(auth, setUser)
  }, [])

  const saveLabel = isDirty
    ? 'Saving...'
    : lastSaved
      ? `Draft saved ${formatDistanceToNow(lastSaved, { addSuffix: true })}`
      : null

  return (
    <header
      className={clsx(
        'bg-surface/80 fixed top-0 right-0 left-0 z-40 flex items-center justify-between px-4 py-3 backdrop-blur-md transition-all duration-500 md:hidden',
        isFocused && '-translate-y-full opacity-0 pointer-events-none',
      )}
    >
      {/* Left: day + date */}
      <div className="flex flex-col">
        <span className="text-on-surface-variant text-xs tracking-[0.2em] uppercase">
          {format(now, 'EEEE')}
        </span>
        <span className="text-primary text-lg leading-tight font-bold">
          {format(now, 'MMMM d')}
        </span>
      </div>

      {/* Centre: save status */}
      {saveLabel && (
        <span className="text-on-surface-variant absolute left-1/2 -translate-x-1/2 text-xs">
          {saveLabel}
        </span>
      )}

      {/* Right: search + avatar */}
      <div className="flex items-center gap-2">
        <button
          aria-label="Search"
          className="hover:bg-surface-container flex h-9 w-9 items-center justify-center rounded-full transition-colors"
        >
          <span className="material-symbols-outlined text-on-surface-variant">search</span>
        </button>

        {user?.photoURL ? (
          <img
            src={user.photoURL}
            alt={user.displayName ?? 'User'}
            className="h-8 w-8 rounded-full"
          />
        ) : (
          <div className="bg-primary-container flex h-8 w-8 items-center justify-center rounded-full">
            <span className="material-symbols-outlined text-on-primary-container text-sm">
              person
            </span>
          </div>
        )}
      </div>
    </header>
  )
}
