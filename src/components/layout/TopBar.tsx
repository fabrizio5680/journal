import { useEffect, useState } from 'react'
import { onAuthStateChanged, type User } from 'firebase/auth'
import { format, formatDistanceToNow } from 'date-fns'
import clsx from 'clsx'

import { auth } from '@/lib/firebase'
import { useSaveStatus } from '@/context/SaveStatusContext'
import { useFocusMode } from '@/context/FocusModeContext'
import { useSearch } from '@/context/SearchContext'
import ProfileSheet from '@/components/ui/ProfileSheet'
import { syncCoordinator } from '@/lib/storage/syncCoordinator'
import { syncStatusLabel } from '@/lib/storage/syncStatusLabel'

export default function TopBar() {
  const [user, setUser] = useState<User | null>(null)
  const [isProfileOpen, setIsProfileOpen] = useState(false)
  const now = new Date()
  const {
    isDirty,
    lastSaved,
    syncStatus,
    syncError,
    storageProvider,
    storageAccountEmail,
    appAccountEmail,
    driveLoadProgress,
  } = useSaveStatus()
  const { isFocused } = useFocusMode()
  const { openSearch } = useSearch()

  useEffect(() => {
    return onAuthStateChanged(auth, setUser)
  }, [])

  const driveProgressLabel = driveLoadProgress
    ? driveLoadProgress.total === 0
      ? 'Listing entries…'
      : `Indexing ${driveLoadProgress.loaded} / ${driveLoadProgress.total}…`
    : null

  const saveLabel = driveProgressLabel
    ? driveProgressLabel
    : isDirty
      ? 'Saving…'
      : lastSaved
        ? syncStatusLabel({
            syncStatus,
            storageProvider,
            storageAccountEmail,
            appAccountEmail,
            savedLocalSuffix: formatDistanceToNow(lastSaved, { addSuffix: true }),
          })
        : null

  return (
    <>
      <header
        className={clsx(
          'bg-surface/90 border-outline-variant/15 fixed top-0 right-0 left-0 z-40 flex items-center justify-between border-b px-5 py-3 backdrop-blur-md transition-all duration-500 md:hidden',
          isFocused && 'pointer-events-none -translate-y-full opacity-0',
        )}
      >
        {/* Left: date */}
        <div className="flex flex-col">
          <span className="font-display text-primary text-xl leading-none font-semibold">
            {format(now, 'MMMM d')}
          </span>
          <span className="text-on-surface-variant/70 text-[10px] tracking-[0.15em] uppercase">
            {format(now, 'EEEE')}
          </span>
        </div>

        {/* Centre: save status */}
        {saveLabel &&
          (syncStatus === 'sync-pending' && syncError ? (
            <button
              type="button"
              onClick={() => {
                const uid = auth.currentUser?.uid
                if (uid) syncCoordinator.retryStuck(uid)
              }}
              title={syncError}
              className="text-on-surface-variant/60 hover:text-on-surface-variant absolute left-1/2 -translate-x-1/2 cursor-pointer text-[10px] tracking-wide transition-colors hover:opacity-80"
            >
              {saveLabel}
            </button>
          ) : (
            <span className="text-on-surface-variant/60 absolute left-1/2 -translate-x-1/2 text-[10px] tracking-wide">
              {saveLabel}
            </span>
          ))}

        {/* Right: search + avatar */}
        <div className="flex items-center gap-2">
          <button
            aria-label="Search"
            onClick={openSearch}
            className="hover:bg-surface-container text-on-surface-variant flex h-8 w-8 items-center justify-center rounded-full transition-colors"
          >
            <span className="material-symbols-outlined text-[20px]">search</span>
          </button>

          <button
            aria-label="Open profile menu"
            onClick={() => setIsProfileOpen(true)}
            className="ring-outline-variant/30 rounded-full ring-1 transition-opacity hover:opacity-80"
          >
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
          </button>
        </div>
      </header>

      {user && (
        <ProfileSheet user={user} isOpen={isProfileOpen} onClose={() => setIsProfileOpen(false)} />
      )}
    </>
  )
}
