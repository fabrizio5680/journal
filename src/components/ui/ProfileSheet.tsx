import { signOut, type User } from 'firebase/auth'
import { Link } from 'react-router-dom'
import clsx from 'clsx'

import { auth } from '@/lib/firebase'

interface ProfileSheetProps {
  user: User
  isOpen: boolean
  onClose: () => void
}

const NAV_ROWS = [
  { label: 'History', icon: 'calendar_month', to: '/history' },
  { label: 'Insights', icon: 'bar_chart', to: '/insights' },
  { label: 'Settings', icon: 'settings', to: '/settings' },
]

export default function ProfileSheet({ user, isOpen, onClose }: ProfileSheetProps) {
  async function handleSignOut() {
    onClose()
    await signOut(auth)
  }

  return (
    <>
      <div
        className={clsx(
          'fixed inset-0 z-50 bg-black/30 backdrop-blur-sm transition-opacity duration-300',
          isOpen ? 'opacity-100' : 'pointer-events-none opacity-0',
        )}
        onClick={onClose}
      />

      <div
        className={clsx(
          'bg-surface-container-lowest fixed bottom-0 left-0 z-50 w-full rounded-t-[2rem] pb-10 shadow-2xl transition-transform duration-300',
          isOpen ? 'translate-y-0' : 'translate-y-full',
        )}
      >
        <div className="bg-outline-variant/30 mx-auto mt-3 mb-6 h-1 w-10 rounded-full" />

        <div className="flex flex-col items-center gap-2 px-6 pb-6">
          {user.photoURL ? (
            <img
              src={user.photoURL}
              alt={user.displayName ?? 'User'}
              className="ring-outline-variant/30 h-14 w-14 rounded-full ring-2"
            />
          ) : (
            <div className="bg-primary-container flex h-14 w-14 items-center justify-center rounded-full">
              <span className="material-symbols-outlined text-on-primary-container text-2xl">
                person
              </span>
            </div>
          )}
          <span className="text-on-surface text-base font-semibold">
            {user.displayName ?? 'You'}
          </span>
        </div>

        <div className="border-outline-variant/15 border-t" />

        <nav className="px-4 pt-2">
          {NAV_ROWS.map(({ label, icon, to }) => (
            <Link
              key={to}
              to={to}
              onClick={onClose}
              className="text-on-surface hover:bg-surface-container flex items-center gap-4 rounded-2xl px-4 py-3.5 transition-colors"
            >
              <span className="material-symbols-outlined text-on-surface-variant text-[22px]">
                {icon}
              </span>
              <span className="text-sm font-medium">{label}</span>
            </Link>
          ))}
        </nav>

        <div className="border-outline-variant/15 mx-4 mt-2 border-t" />

        <button
          onClick={() => void handleSignOut()}
          className="text-error hover:bg-error/5 mx-4 mt-2 flex w-[calc(100%-2rem)] items-center gap-4 rounded-2xl px-4 py-3.5 transition-colors"
        >
          <span className="material-symbols-outlined text-[22px]">logout</span>
          <span className="text-sm font-medium">Sign out</span>
        </button>
      </div>
    </>
  )
}
