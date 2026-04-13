import { createContext, useContext, useState, type ReactNode } from 'react'

interface SaveStatusContextValue {
  isDirty: boolean
  lastSaved: Date | null
  setDirty: (v: boolean) => void
  setLastSaved: (d: Date) => void
}

const SaveStatusContext = createContext<SaveStatusContextValue | null>(null)

export function SaveStatusProvider({ children }: { children: ReactNode }) {
  const [isDirty, setDirty] = useState(false)
  const [lastSaved, setLastSaved] = useState<Date | null>(null)

  return (
    <SaveStatusContext.Provider value={{ isDirty, lastSaved, setDirty, setLastSaved }}>
      {children}
    </SaveStatusContext.Provider>
  )
}

// Context files legitimately export both a provider component and a consumer hook.
// eslint-disable-next-line react-refresh/only-export-components
export function useSaveStatus() {
  const ctx = useContext(SaveStatusContext)
  if (!ctx) throw new Error('useSaveStatus must be used within SaveStatusProvider')
  return ctx
}
