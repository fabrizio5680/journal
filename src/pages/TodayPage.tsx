import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Editor } from '@tiptap/core'
import { useLocation } from 'react-router-dom'
import { format } from 'date-fns'

import { useEntry } from '@/hooks/useEntry'
import { usePageTitle } from '@/hooks/usePageTitle'
import { useToday } from '@/hooks/useToday'
import { useTagVocabulary } from '@/hooks/useTagVocabulary'
import { useSaveStatus } from '@/context/SaveStatusContext'
import { useDictation } from '@/hooks/useDictation'
import { useUserPreferences } from '@/context/UserPreferencesContext'
import { useEditorControls } from '@/context/EditorControlsContext'
import { useConsent } from '@/hooks/useConsent'
import { useDailyVerse } from '@/hooks/useDailyVerse'
import EntryEditor from '@/components/editor/EntryEditor'
import MetadataBar from '@/components/editor/MetadataBar'

export default function TodayPage() {
  usePageTitle("Today's Entry")
  const { key: locationKey } = useLocation()
  const reactiveToday = useToday() // keeps midnight rollover working
  // eslint-disable-next-line react-hooks/exhaustive-deps -- locationKey and reactiveToday are intentional triggers, not values read inside the memo
  const today = useMemo(() => format(new Date(), 'yyyy-MM-dd'), [locationKey, reactiveToday])
  const { entry, isLoading, markDirty, save, metadata: entryMetadata } = useEntry(today)
  const { vocabulary, addToVocabulary } = useTagVocabulary()
  const { setDirty, setLastSaved, setEntrySyncStatus } = useSaveStatus()
  const { editorFontSize, updateEditorFontSize, scriptureTranslation } = useUserPreferences()
  const { register, unregister } = useEditorControls()
  const { canProcessMood, canProcessReligion } = useConsent()
  const { verse } = useDailyVerse(scriptureTranslation)
  const placeholder = verse ? `${verse.text} — ${verse.reference}` : undefined

  const [editorInstance, setEditorInstance] = useState<Editor | null>(null)
  const [liveWordCount, setLiveWordCount] = useState(0)
  const [typingStarted, setTypingStarted] = useState(false)
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const wordCount = typingStarted ? liveWordCount : (entry?.wordCount ?? 0)

  const {
    isSupported,
    state: dictationState,
    errorMessage,
    interimTranscript,
    start,
    stop,
  } = useDictation(
    useCallback(
      (text: string) => {
        if (!editorInstance) return
        const { from } = editorInstance.state.selection
        const precedingChar = from > 1 ? editorInstance.state.doc.textBetween(from - 1, from) : ''
        const needsLeadingSpace =
          precedingChar !== '' && precedingChar !== ' ' && precedingChar !== '\n'
        editorInstance
          .chain()
          .focus()
          .insertContent((needsLeadingSpace ? ' ' : '') + text.trimStart())
          .run()
      },
      [editorInstance],
    ),
  )

  const handleUpdate = useCallback(
    (editor: Editor) => {
      markDirty()
      setDirty(true)
      setTypingStarted(true)
      setLiveWordCount(editor.storage.characterCount.words())

      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current)
      saveTimeoutRef.current = setTimeout(async () => {
        await save({
          content: editor.getJSON(),
          contentText: editor.getText(),
          wordCount: editor.storage.characterCount.words(),
        })
        setDirty(false)
        setLastSaved(new Date())
      }, 1500)
    },
    [markDirty, save, setDirty, setLastSaved],
  )

  const handleMoodChange = useCallback(
    async (mood: number | null, moodLabel: string | null) => {
      if (!canProcessMood) return
      await save({ mood: mood as 1 | 2 | 3 | 4 | 5 | null, moodLabel })
    },
    [canProcessMood, save],
  )

  const handleTagsChange = useCallback(
    async (tags: string[]) => {
      await save({ tags })
    },
    [save],
  )

  const handleScriptureRefsChange = useCallback(
    async (scriptureRefs: import('@/types').ScriptureRef[]) => {
      if (!canProcessReligion) return
      await save({ scriptureRefs })
    },
    [canProcessReligion, save],
  )

  // Register editor controls with BottomNav and RightPanel via context
  useEffect(() => {
    register({
      dictation: {
        isSupported,
        state: dictationState,
        errorMessage,
        interimTranscript,
        onStart: start,
        onStop: stop,
      },
      fontSize: editorFontSize,
      onFontSizeChange: updateEditorFontSize,
      wordCount,
      metadata: {
        mood: entry?.mood ?? null,
        moodLabel: entry?.moodLabel ?? null,
        tags: entry?.tags ?? [],
        tagVocabulary: vocabulary,
        scriptureRefs: entry?.scriptureRefs ?? [],
        scriptureTranslation,
        canProcessMood,
        canProcessReligion,
        onMoodChange: handleMoodChange,
        onTagsChange: handleTagsChange,
        onNewTag: addToVocabulary,
        onScriptureRefsChange: handleScriptureRefsChange,
      },
    })
  }, [
    isSupported,
    dictationState,
    errorMessage,
    interimTranscript,
    editorFontSize,
    register,
    start,
    stop,
    updateEditorFontSize,
    wordCount,
    entry,
    vocabulary,
    scriptureTranslation,
    canProcessMood,
    canProcessReligion,
    handleMoodChange,
    handleTagsChange,
    addToVocabulary,
    handleScriptureRefsChange,
  ])

  useEffect(() => () => unregister(), [unregister])

  useEffect(() => {
    setEntrySyncStatus(entryMetadata?.syncStatus ?? 'saved-local')
  }, [entryMetadata?.syncStatus, setEntrySyncStatus])

  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current)
    }
  }, [])

  if (isLoading) {
    return (
      <div className="mx-auto max-w-2xl animate-pulse px-6 pt-1">
        <div className="bg-surface-container mb-6 h-4 w-32 rounded-xl" />
        <div className="bg-surface-container mb-3 h-8 w-2/3 rounded-xl" />
        <div className="bg-surface-container mb-2 h-5 w-full rounded-xl" />
        <div className="bg-surface-container mb-2 h-5 w-5/6 rounded-xl" />
        <div className="bg-surface-container h-5 w-4/6 rounded-xl" />
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-2xl px-6 pt-1">
      <MetadataBar
        mood={entry?.mood ?? null}
        moodLabel={entry?.moodLabel ?? null}
        tags={entry?.tags ?? []}
        tagVocabulary={vocabulary}
        onMoodChange={handleMoodChange}
        onTagsChange={handleTagsChange}
        onNewTag={addToVocabulary}
        scriptureRefs={entry?.scriptureRefs ?? []}
        scriptureTranslation={scriptureTranslation}
        canProcessMood={canProcessMood}
        canProcessReligion={canProcessReligion}
        onScriptureRefsChange={handleScriptureRefsChange}
      />

      <EntryEditor
        key={today}
        content={entry?.content ?? null}
        onUpdate={handleUpdate}
        onEditorReady={setEditorInstance}
        placeholder={placeholder}
      />
    </div>
  )
}
