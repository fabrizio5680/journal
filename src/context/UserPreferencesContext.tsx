import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { doc, onSnapshot, updateDoc } from 'firebase/firestore'
import { onAuthStateChanged } from 'firebase/auth'

import { auth, db } from '@/lib/firebase'

type Translation = 'NLT' | 'MSG' | 'ESV'
export type EditorFontSize = 'small' | 'medium' | 'large'

const FONT_SIZE_KEY = 'pref_editor_font_size'
const SPELLCHECK_KEY = 'pref_spellcheck'

interface UserPreferences {
  grainEnabled: boolean
  scriptureTranslation: Translation
  editorFontSize: EditorFontSize
  spellcheckEnabled: boolean
}

interface UserPreferencesContextValue extends UserPreferences {
  updateEditorFontSize: (size: EditorFontSize) => Promise<void>
  updateSpellcheck: (enabled: boolean) => void
}

const defaultPreferences: UserPreferences = {
  grainEnabled: true,
  scriptureTranslation: 'NLT',
  editorFontSize: 'medium',
  spellcheckEnabled: true,
}

const UserPreferencesContext = createContext<UserPreferencesContextValue>({
  ...defaultPreferences,
  updateEditorFontSize: async () => {},
  updateSpellcheck: () => {},
})

export function UserPreferencesProvider({ children }: { children: ReactNode }) {
  const [prefs, setPrefs] = useState<UserPreferences>({
    ...defaultPreferences,
    editorFontSize: (localStorage.getItem(FONT_SIZE_KEY) as EditorFontSize) ?? 'medium',
    spellcheckEnabled: localStorage.getItem(SPELLCHECK_KEY) !== 'false',
  })

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
      unsubscribeSnapshot = onSnapshot(
        userRef,
        (snap) => {
          const data = snap.data()
          if (!data) return

          // Seed localStorage from Firestore on first snapshot if no local entry yet
          if (localStorage.getItem(FONT_SIZE_KEY) === null) {
            const seeded = (data.editorFontSize as EditorFontSize) ?? 'medium'
            localStorage.setItem(FONT_SIZE_KEY, seeded)
            setPrefs((prev) => ({
              ...prev,
              grainEnabled: data.grainEnabled ?? true,
              scriptureTranslation: (data.scriptureTranslation as Translation) ?? 'NLT',
              editorFontSize: seeded,
            }))
          } else {
            setPrefs((prev) => ({
              ...prev,
              grainEnabled: data.grainEnabled ?? true,
              scriptureTranslation: (data.scriptureTranslation as Translation) ?? 'NLT',
            }))
          }

          const detectedTz = Intl.DateTimeFormat().resolvedOptions().timeZone
          if (data.reminderEnabled === true && data.reminderTimezone !== detectedTz) {
            void updateDoc(userRef, { reminderTimezone: detectedTz })
          }
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
    localStorage.setItem(FONT_SIZE_KEY, size)
    setPrefs((prev) => ({ ...prev, editorFontSize: size }))
  }

  function updateSpellcheck(enabled: boolean) {
    localStorage.setItem(SPELLCHECK_KEY, String(enabled))
    setPrefs((prev) => ({ ...prev, spellcheckEnabled: enabled }))
  }

  return (
    <UserPreferencesContext.Provider value={{ ...prefs, updateEditorFontSize, updateSpellcheck }}>
      {children}
    </UserPreferencesContext.Provider>
  )
}

// Context files legitimately export both a provider component and a consumer hook.
// eslint-disable-next-line react-refresh/only-export-components
export function useUserPreferences(): UserPreferencesContextValue {
  return useContext(UserPreferencesContext)
}
