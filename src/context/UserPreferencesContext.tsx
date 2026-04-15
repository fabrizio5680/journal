import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { doc, onSnapshot } from 'firebase/firestore'
import { onAuthStateChanged } from 'firebase/auth'

import { auth, db } from '@/lib/firebase'

type Translation = 'NLT' | 'MSG' | 'ESV'

interface UserPreferences {
  grainEnabled: boolean
  scriptureTranslation: Translation
}

const defaultPreferences: UserPreferences = {
  grainEnabled: true,
  scriptureTranslation: 'NLT',
}

const UserPreferencesContext = createContext<UserPreferences>(defaultPreferences)

export function UserPreferencesProvider({ children }: { children: ReactNode }) {
  const [prefs, setPrefs] = useState<UserPreferences>(defaultPreferences)

  useEffect(() => {
    let unsubscribeSnapshot: (() => void) | null = null

    const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
      unsubscribeSnapshot?.()
      unsubscribeSnapshot = null

      if (!user) {
        setPrefs(defaultPreferences)
        return
      }

      const userRef = doc(db, 'users', user.uid)
      unsubscribeSnapshot = onSnapshot(userRef, (snap) => {
        const data = snap.data()
        if (!data) return
        setPrefs({
          grainEnabled: data.grainEnabled ?? true,
          scriptureTranslation: (data.scriptureTranslation as Translation) ?? 'NLT',
        })
      })
    })

    return () => {
      unsubscribeAuth()
      unsubscribeSnapshot?.()
    }
  }, [])

  return (
    <UserPreferencesContext.Provider value={prefs}>{children}</UserPreferencesContext.Provider>
  )
}

// Context files legitimately export both a provider component and a consumer hook.
// eslint-disable-next-line react-refresh/only-export-components
export function useUserPreferences(): UserPreferences {
  return useContext(UserPreferencesContext)
}
