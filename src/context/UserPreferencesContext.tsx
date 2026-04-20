import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { doc, onSnapshot, updateDoc } from 'firebase/firestore'
import { onAuthStateChanged } from 'firebase/auth'

import { auth, db } from '@/lib/firebase'

type Translation = 'NLT' | 'MSG' | 'ESV'
export type EditorFontSize = 'small' | 'medium' | 'large'

interface UserPreferences {
  grainEnabled: boolean
  scriptureTranslation: Translation
  editorFontSize: EditorFontSize
}

interface UserPreferencesContextValue extends UserPreferences {
  updateEditorFontSize: (size: EditorFontSize) => Promise<void>
}

const defaultPreferences: UserPreferences = {
  grainEnabled: true,
  scriptureTranslation: 'NLT',
  editorFontSize: 'medium',
}

const UserPreferencesContext = createContext<UserPreferencesContextValue>({
  ...defaultPreferences,
  updateEditorFontSize: async () => {},
})

export function UserPreferencesProvider({ children }: { children: ReactNode }) {
  const [prefs, setPrefs] = useState<UserPreferences>(defaultPreferences)
  const [userId, setUserId] = useState<string | null>(null)

  useEffect(() => {
    let unsubscribeSnapshot: (() => void) | null = null

    const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
      unsubscribeSnapshot?.()
      unsubscribeSnapshot = null
      setUserId(user?.uid ?? null)

      if (!user) {
        setPrefs(defaultPreferences)
        return
      }

      const userRef = doc(db, 'users', user.uid)
      unsubscribeSnapshot = onSnapshot(
        userRef,
        (snap) => {
          const data = snap.data()
          if (!data) return
          setPrefs({
            grainEnabled: data.grainEnabled ?? true,
            scriptureTranslation: (data.scriptureTranslation as Translation) ?? 'NLT',
            editorFontSize: (data.editorFontSize as EditorFontSize) ?? 'medium',
          })
        },
        () => {
          setPrefs(defaultPreferences)
        },
      )
    })

    return () => {
      unsubscribeAuth()
      unsubscribeSnapshot?.()
    }
  }, [])

  async function updateEditorFontSize(size: EditorFontSize) {
    if (!userId) return
    await updateDoc(doc(db, 'users', userId), { editorFontSize: size })
  }

  return (
    <UserPreferencesContext.Provider value={{ ...prefs, updateEditorFontSize }}>
      {children}
    </UserPreferencesContext.Provider>
  )
}

// Context files legitimately export both a provider component and a consumer hook.
// eslint-disable-next-line react-refresh/only-export-components
export function useUserPreferences(): UserPreferencesContextValue {
  return useContext(UserPreferencesContext)
}
