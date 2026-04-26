import { useCallback, useEffect, useRef, useState } from 'react'
import { format } from 'date-fns'
import { useNavigate } from 'react-router-dom'
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
import FloatingActionBar from '@/components/fab/FloatingActionBar'

export default function TodayPage() {
  usePageTitle("Today's Entry")
  const today = format(new Date(), 'yyyy-MM-dd')
  const navigate = useNavigate()
  const { entry, isLoading, markDirty, save, deleteEntry } = useEntry(today)
  const { vocabulary, addToVocabulary } = useTagVocabulary()
  const { setDirty, setLastSaved } = useSaveStatus()
  const { editorFontSize, updateEditorFontSize, scriptureTranslation } = useUserPreferences()
  const { register, unregister } = useEditorControls()
  const { verse } = useDailyVerse(scriptureTranslation)
  const placeholder = verse ? `${verse.text} — ${verse.reference}` : undefined

  const [editorInstance, setEditorInstance] = useState<Editor | null>(null)
  const [liveWordCount, setLiveWordCount] = useState(0)
  const [typingStarted, setTypingStarted] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
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

  const handleDeleteConfirm = useCallback(async () => {
    await deleteEntry()
    setShowDeleteConfirm(false)
    navigate('/history')
  }, [deleteEntry, navigate])

  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current)
    }
  }, [])

  if (isLoading) {
    return (
      <div className="mx-auto max-w-2xl animate-pulse px-6 pt-14">
        <div className="bg-surface-container mb-6 h-4 w-32 rounded-xl" />
        <div className="bg-surface-container mb-3 h-8 w-2/3 rounded-xl" />
        <div className="bg-surface-container mb-2 h-5 w-full rounded-xl" />
        <div className="bg-surface-container mb-2 h-5 w-5/6 rounded-xl" />
        <div className="bg-surface-container h-5 w-4/6 rounded-xl" />
      </div>
    )
  }

  return (
    <>
      <EditorToolbar editor={editorInstance} />

      <div className="mx-auto max-w-2xl px-6 pt-4 md:pt-14">
        {entry && (
          <div className="mb-2 flex justify-end">
            <button
              onClick={() => setShowDeleteConfirm(true)}
              aria-label="More options"
              className="hover:bg-surface-container text-on-surface-variant flex h-9 w-9 items-center justify-center rounded-full transition-colors"
            >
              <span className="material-symbols-outlined text-[20px]">more_vert</span>
            </button>
          </div>
        )}

        <MetadataChips
          mood={entry?.mood ?? null}
          moodLabel={entry?.moodLabel ?? null}
          tags={entry?.tags ?? []}
          tagVocabulary={vocabulary}
          scriptureRefs={entry?.scriptureRefs ?? []}
          scriptureTranslation={scriptureTranslation}
          onMoodChange={handleMoodChange}
          onTagsChange={handleTagsChange}
          onNewTag={addToVocabulary}
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

      {showDeleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-6 backdrop-blur-sm">
          <div className="bg-surface-container-lowest border-outline-variant/10 w-full max-w-sm rounded-[2rem] border p-8 shadow-2xl">
            <h2 className="font-display text-on-surface mb-2 text-2xl font-semibold">
              Move to Trash?
            </h2>
            <p className="text-on-surface-variant/70 mb-8 text-sm leading-relaxed">
              This entry will be permanently deleted after 30 days.
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="bg-surface-container text-on-surface-variant rounded-full px-5 py-2.5 text-sm font-medium transition-colors hover:brightness-95"
              >
                Cancel
              </button>
              <button
                onClick={() => void handleDeleteConfirm()}
                className="bg-error text-on-error rounded-full px-5 py-2.5 text-sm font-semibold transition-colors hover:brightness-95"
              >
                Move to Trash
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
