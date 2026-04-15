import { useEffect } from 'react'
import { Outlet } from 'react-router-dom'
import clsx from 'clsx'

import SideNav from './SideNav'
import TopBar from './TopBar'
import BottomNav from './BottomNav'
import RightPanel from './RightPanel'

import SearchModal from '@/components/search/SearchModal'
import { useSearch } from '@/context/SearchContext'
import { useFocusMode } from '@/context/FocusModeContext'
import { useUserPreferences } from '@/context/UserPreferencesContext'

export default function AppShell() {
  const { isFocused, exit } = useFocusMode()
  const { openSearch } = useSearch()
  const { grainEnabled } = useUserPreferences()

  // Cmd/Ctrl+K global shortcut
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        openSearch()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [openSearch])

  return (
    <div className={clsx('bg-background min-h-screen', grainEnabled && 'grain-enabled')}>
      {/* Mobile: fixed top bar */}
      <TopBar />

      {/* Desktop: fixed left sidebar */}
      <SideNav />

      {/* Desktop: fixed right panel (xl only) */}
      <RightPanel />

      {/* Focus-mode exit button — fixed top-right, only visible when focused */}
      {isFocused && (
        <button
          onClick={exit}
          aria-label="Exit focus mode"
          className="bg-surface-container/80 text-on-surface-variant hover:text-primary hover:bg-surface-container fixed top-4 right-4 z-50 rounded-full p-2 backdrop-blur-sm transition-colors"
        >
          <span className="material-symbols-outlined">visibility</span>
        </button>
      )}

      {/* Main content area */}
      <main
        className={clsx(
          'min-h-screen transition-all duration-500',
          isFocused ? 'md:ml-0 xl:mr-0' : 'md:ml-64 xl:mr-80',
        )}
      >
        {/* pt-16 offsets fixed TopBar on mobile; pb-24 leaves room for BottomNav */}
        <div
          className={clsx(
            'transition-all duration-500 md:pt-0 md:pb-0',
            isFocused ? 'pt-0 pb-0' : 'pt-16 pb-24',
          )}
        >
          <Outlet />
        </div>
      </main>

      {/* Mobile: fixed bottom nav */}
      <BottomNav />

      {/* Full-screen search modal */}
      <SearchModal />
    </div>
  )
}
