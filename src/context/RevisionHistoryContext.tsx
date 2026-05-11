import { createContext, useContext, useState, useRef, useCallback, type ReactNode } from 'react'

import type { EntryRevision } from '@/types'

interface RevisionHistoryContextValue {
  isOpen: boolean
  currentDate: string | null
  hasEntry: boolean
  onRestore: ((revision: EntryRevision) => Promise<void>) | null
  open: () => void
  close: () => void
  register: (date: string, onRestore: (revision: EntryRevision) => Promise<void>) => void
  unregister: () => void
}

const RevisionHistoryContext = createContext<RevisionHistoryContextValue | null>(null)

export function RevisionHistoryProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false)
  const [currentDate, setCurrentDate] = useState<string | null>(null)
  const [hasEntry, setHasEntry] = useState(false)

  // Store the restore callback in a ref to avoid re-registering on every render.
  const restoreCallbackRef = useRef<((revision: EntryRevision) => Promise<void>) | null>(null)
  // Expose as state so consumers re-render when it changes.
  const [onRestore, setOnRestore] = useState<((revision: EntryRevision) => Promise<void>) | null>(
    null,
  )

  const open = useCallback(() => setIsOpen(true), [])
  const close = useCallback(() => setIsOpen(false), [])

  const register = useCallback(
    (date: string, handler: (revision: EntryRevision) => Promise<void>) => {
      setCurrentDate(date)
      setHasEntry(true)
      if (restoreCallbackRef.current !== handler) {
        restoreCallbackRef.current = handler
        // Wrap in arrow to satisfy React's "functions in state" convention.
        setOnRestore(() => handler)
      }
    },
    [],
  )

  const unregister = useCallback(() => {
    setCurrentDate(null)
    setHasEntry(false)
    restoreCallbackRef.current = null
    setOnRestore(null)
  }, [])

  return (
    <RevisionHistoryContext.Provider
      value={{ isOpen, currentDate, hasEntry, onRestore, open, close, register, unregister }}
    >
      {children}
    </RevisionHistoryContext.Provider>
  )
}

// Context files legitimately export both a provider component and a consumer hook.
// eslint-disable-next-line react-refresh/only-export-components
export function useRevisionHistory() {
  const ctx = useContext(RevisionHistoryContext)
  if (!ctx) throw new Error('useRevisionHistory must be used within RevisionHistoryProvider')
  return ctx
}
