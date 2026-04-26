import { useCallback, useEffect, useRef, useState } from 'react'
import { useParams, Navigate, useNavigate } from 'react-router-dom'
import { format, parseISO } from 'date-fns'
import type { Editor } from '@tiptap/core'

import { useEntry } from '@/hooks/useEntry'
import { usePageTitle } from '@/hooks/usePageTitle'
import { useTagVocabulary } from '@/hooks/useTagVocabulary'
import { useSaveStatus } from '@/context/SaveStatusContext'
import { useDictation } from '@/hooks/useDictation'
import { useUserPreferences } from '@/context/UserPreferencesContext'
import { useEditorControls } from '@/context/EditorControlsContext'
import { useDailyVerse } from '@/hooks/useDailyVerse'
import EntryEditor from '@/components/editor/EntryEditor'
import EditorToolbar from '@/components/editor/EditorToolbar'
import MetadataChips from '@/components/editor/MetadataChips'
import ScriptureBar from '@/components/editor/ScriptureBar'
import FloatingActionBar from '@/components/fab/FloatingActionBar'

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/

export default function EntryPage() {
  const { date } = useParams<{ date: string }>()

  if (!date || !DATE_REGEX.test(date)) return <Navigate to="/history" replace />

  return <EntryEditorView date={date} />
}

function EntryEditorView({ date }: { date: string }) {
  usePageTitle(format(parseISO(date), 'MMMM d, yyyy'))
  const navigate = useNavigate()
  const { entry, isLoading, markDirty, save } = useEntry(date)
  const { vocabulary, addToVocabulary } = useTagVocabulary()
  const { setDirty, setLastSaved } = useSaveStatus()
  const { editorFontSize, updateEditorFontSize, scriptureTranslation } = useUserPreferences()
  const { register, unregister } = useEditorControls()
  const { verse } = useDailyVerse(scriptureTranslation, parseISO(date))
  const placeholder = verse ? `${verse.text} — ${verse.reference}` : undefined

  const [editorInstance, setEditorInstance] = useState<Editor | null>(null)
  const [liveWordCount, setLiveWordCount] = useState(0)
  const [typingStarted, setTypingStarted] = useState(false)

  const wordCount = typingStarted ? liveWordCount : (entry?.wordCount ?? 0)
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

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
  ])

  useEffect(() => () => unregister(), [unregister])

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

  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current)
    }
  }, [])

  if (isLoading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <span className="text-on-surface-variant text-sm">Loading...</span>
      </div>
    )
  }

  return (
    <>
      <EditorToolbar editor={editorInstance} />

      <div className="mx-auto max-w-2xl px-6 pt-4 md:pt-14">
        <div className="mb-6 flex items-center gap-3">
          <button
            onClick={() => navigate(-1)}
            aria-label="Go back"
            className="hover:bg-surface-container text-on-surface-variant flex items-center gap-1 rounded-full px-3 py-1.5 text-sm transition-colors"
          >
            <span className="material-symbols-outlined text-[18px]">arrow_back</span>
            Back
          </button>
          <span className="text-on-surface-variant flex-1 text-sm">
            {format(parseISO(date), 'EEEE, MMMM d, yyyy')}
          </span>
        </div>

        <ScriptureBar
          scriptureRefs={entry?.scriptureRefs ?? []}
          scriptureTranslation={scriptureTranslation}
          onScriptureRefsChange={handleScriptureRefsChange}
        />
        <MetadataChips
          mood={entry?.mood ?? null}
          moodLabel={entry?.moodLabel ?? null}
          tags={entry?.tags ?? []}
          tagVocabulary={vocabulary}
          onMoodChange={handleMoodChange}
          onTagsChange={handleTagsChange}
          onNewTag={addToVocabulary}
        />

        <EntryEditor
          key={date}
          content={entry?.content ?? null}
          onUpdate={handleUpdate}
          onEditorReady={setEditorInstance}
          placeholder={placeholder}
        />
      </div>

      {/* Word count — above bottom nav, mobile only */}
      <div
        data-testid="word-count"
        className="text-on-surface-variant/40 pointer-events-none fixed bottom-[3.5rem] left-1/2 z-30 -translate-x-1/2 text-[10px] tracking-wide md:hidden"
      >
        {wordCount} {wordCount === 1 ? 'word' : 'words'}
      </div>

      {/* Desktop FAB — voice, font cycle, word count */}
      <FloatingActionBar
        wordCount={wordCount}
        dictation={{
          isSupported,
          state: dictationState,
          errorMessage,
          interimTranscript,
          onStart: start,
          onStop: stop,
        }}
        fontSize={editorFontSize}
        onFontSizeChange={updateEditorFontSize}
      />
    </>
  )
}
