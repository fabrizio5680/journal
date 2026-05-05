import { createContext, useCallback, useContext, useState, type ReactNode } from 'react'

import type { DictationState } from '@/hooks/useDictation'
import type { EditorFontSize } from '@/context/UserPreferencesContext'
import type { ScriptureRef } from '@/types'

export interface DictationControls {
  isSupported: boolean
  state: DictationState
  errorMessage: string | null
  interimTranscript?: string | null
  onStart: () => void
  onStop: () => void
}

export interface MetadataControls {
  mood: 1 | 2 | 3 | 4 | 5 | null
  moodLabel: string | null
  tags: string[]
  tagVocabulary: string[]
  scriptureRefs: ScriptureRef[]
  scriptureTranslation: 'NLT' | 'MSG' | 'ESV'
  onMoodChange: (mood: number | null, label: string | null) => void
  onTagsChange: (tags: string[]) => void
  onNewTag: (tag: string) => void
  onScriptureRefsChange: (refs: ScriptureRef[]) => void
}

interface RegisteredControls {
  dictation: DictationControls | null
  fontSize: EditorFontSize
  onFontSizeChange: (size: EditorFontSize) => void
  wordCount?: number
  metadata?: MetadataControls | null
}

interface EditorControlsContextValue {
  isEditorActive: boolean
  dictation: DictationControls | null
  fontSize: EditorFontSize
  onFontSizeChange: ((size: EditorFontSize) => void) | null
  wordCount: number
  metadata: MetadataControls | null
  register: (controls: RegisteredControls) => void
  unregister: () => void
}

const EditorControlsContext = createContext<EditorControlsContextValue | null>(null)

export function EditorControlsProvider({ children }: { children: ReactNode }) {
  const [controls, setControls] = useState<RegisteredControls | null>(null)

  const register = useCallback((c: RegisteredControls) => setControls(c), [])
  const unregister = useCallback(() => setControls(null), [])

  return (
    <EditorControlsContext.Provider
      value={{
        isEditorActive: controls !== null,
        dictation: controls?.dictation ?? null,
        fontSize: controls?.fontSize ?? 'medium',
        onFontSizeChange: controls?.onFontSizeChange ?? null,
        wordCount: controls?.wordCount ?? 0,
        metadata: controls?.metadata ?? null,
        register,
        unregister,
      }}
    >
      {children}
    </EditorControlsContext.Provider>
  )
}

// Context files legitimately export both a provider component and a consumer hook.
// eslint-disable-next-line react-refresh/only-export-components
export function useEditorControls() {
  const ctx = useContext(EditorControlsContext)
  if (!ctx) throw new Error('useEditorControls must be used within EditorControlsProvider')
  return ctx
}
