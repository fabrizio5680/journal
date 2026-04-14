import { createContext, useContext, useState, type ReactNode } from 'react'

interface FocusModeContextValue {
  isFocused: boolean
  toggle: () => void
  exit: () => void
}

const FocusModeContext = createContext<FocusModeContextValue | null>(null)

export function FocusModeProvider({ children }: { children: ReactNode }) {
  const [isFocused, setIsFocused] = useState(false)

  const toggle = () => setIsFocused((v) => !v)
  const exit = () => setIsFocused(false)

  return (
    <FocusModeContext.Provider value={{ isFocused, toggle, exit }}>
      {children}
    </FocusModeContext.Provider>
  )
}

// Context files legitimately export both a provider component and a consumer hook.
// eslint-disable-next-line react-refresh/only-export-components
export function useFocusMode() {
  const ctx = useContext(FocusModeContext)
  if (!ctx) throw new Error('useFocusMode must be used within FocusModeProvider')
  return ctx
}
