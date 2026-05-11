import { useCallback, useEffect, useRef, useState } from 'react'
import type { Editor } from '@tiptap/core'

import { useEntry } from '@/hooks/useEntry'
import { useEntryRevisions } from '@/hooks/useEntryRevisions'
import { usePageTitle } from '@/hooks/usePageTitle'
import { useToday } from '@/hooks/useToday'
import { useTagVocabulary } from '@/hooks/useTagVocabulary'
import { useSaveStatus } from '@/context/SaveStatusContext'
import { useDictation } from '@/hooks/useDictation'
import { useUserPreferences } from '@/context/UserPreferencesContext'
import { useEditorControls } from '@/context/EditorControlsContext'
import { useRevisionHistory } from '@/context/RevisionHistoryContext'
import { useDailyVerse } from '@/hooks/useDailyVerse'
import EntryEditor from '@/components/editor/EntryEditor'
import MetadataBar from '@/components/editor/MetadataBar'
import type { EntryRevision } from '@/types'

export default function TodayPage() {
  usePageTitle("Today's Entry")
  const today = useToday()
  const { entry, isLoading, markDirty, save } = useEntry(today)
  const { saveRevision, scheduleRevision, cancelRevision } = useEntryRevisions(today)
  const { vocabulary, addToVocabulary } = useTagVocabulary()
  const { setDirty, setLastSaved } = useSaveStatus()
  const { editorFontSize, updateEditorFontSize, scriptureTranslation } = useUserPreferences()
  const { register: registerEditor, unregister: unregisterEditor } = useEditorControls()
  const { register: registerRevision, unregister: unregisterRevision } = useRevisionHistory()
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

      if (entry !== null) {
        scheduleRevision(editor.getText(), {
          ...entry,
          content: editor.getJSON(),
          contentText: editor.getText(),
          wordCount: editor.storage.characterCount.words(),
        })
      }

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
    [markDirty, save, scheduleRevision, entry, setDirty, setLastSaved],
  )

  const handleMoodChange = useCallback(
    async (mood: number | null, moodLabel: string | null) => {
      await save({ mood: mood as 1 | 2 | 3 | 4 | 5 | null, moodLabel })
    },
    [save],
  )

  const handleTagsChange = useCallback(
    async (tags: string[]) => {
      await save({ tags })
    },
    [save],
  )

  const handleScriptureRefsChange = useCallback(
    async (scriptureRefs: import('@/types').ScriptureRef[]) => {
      await save({ scriptureRefs })
    },
    [save],
  )

  const handleRestore = useCallback(
    async (revision: EntryRevision) => {
      if (!entry) return
      cancelRevision()
      // Snapshot current state as a safety backup before restoring
      await saveRevision(entry)
      await save({
        content: revision.content,
        contentText: revision.contentText,
        mood: revision.mood as 1 | 2 | 3 | 4 | 5 | null,
        moodLabel: revision.moodLabel,
        tags: revision.tags,
        scriptureRefs: revision.scriptureRefs,
        wordCount: revision.wordCount,
      })
      setLastSaved(new Date())
    },
    [entry, save, saveRevision, cancelRevision, setLastSaved],
  )

  // Register with revision history context when entry is loaded
  useEffect(() => {
    if (entry) {
      registerRevision(today, handleRestore)
    } else {
      unregisterRevision()
    }
  }, [entry, today, handleRestore, registerRevision, unregisterRevision])

  useEffect(() => () => unregisterRevision(), [unregisterRevision])

  // Register editor controls with BottomNav and RightPanel via context
  useEffect(() => {
    registerEditor({
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
    registerEditor,
    start,
    stop,
    updateEditorFontSize,
    wordCount,
    entry,
    vocabulary,
    scriptureTranslation,
    handleMoodChange,
    handleTagsChange,
    addToVocabulary,
    handleScriptureRefsChange,
  ])

  useEffect(() => () => unregisterEditor(), [unregisterEditor])

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
