import { useCallback, useEffect, useRef, useState } from 'react'
import { useParams, Navigate, useNavigate } from 'react-router-dom'
import { format, parseISO } from 'date-fns'
import { onAuthStateChanged } from 'firebase/auth'
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
import MetadataBar from '@/components/editor/MetadataBar'
import RemoteUpdateBanner from '@/components/editor/RemoteUpdateBanner'
import RemoteUpdateModal from '@/components/editor/RemoteUpdateModal'
import MoodConflictBanner from '@/components/editor/MoodConflictBanner'
import { EntryRepository } from '@/lib/storage/entryRepository'
import { auth } from '@/lib/firebase'
import type { EntryFile } from '@/lib/storage/types'

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/

export default function EntryPage() {
  const { date } = useParams<{ date: string }>()

  if (!date || !DATE_REGEX.test(date)) return <Navigate to="/history" replace />

  return <EntryEditorView date={date} />
}

function EntryEditorView({ date }: { date: string }) {
  usePageTitle(format(parseISO(date), 'MMMM d, yyyy'))
  const navigate = useNavigate()
  const { entry, isLoading, markDirty, save, metadata: entryMetadata } = useEntry(date)
  const { vocabulary, addToVocabulary } = useTagVocabulary()
  const { setDirty, setLastSaved, setEntrySyncStatus } = useSaveStatus()
  const { editorFontSize, updateEditorFontSize, scriptureTranslation } = useUserPreferences()
  const { register, unregister } = useEditorControls()
  const { verse } = useDailyVerse(scriptureTranslation, parseISO(date))
  const placeholder = verse ? `${verse.text} — ${verse.reference}` : undefined

  const [editorInstance, setEditorInstance] = useState<Editor | null>(null)
  const [liveWordCount, setLiveWordCount] = useState(0)
  const [typingStarted, setTypingStarted] = useState(false)
  const [showRemoteModal, setShowRemoteModal] = useState(false)
  const [userId, setUserId] = useState<string | null>(null)

  useEffect(() => {
    return onAuthStateChanged(auth, (user) => {
      setUserId(user?.uid ?? null)
    })
  }, [])

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

  const handleKeepMine = useCallback(async () => {
    if (!userId) return
    // Re-save local entry as sync-pending to push to Drive
    if (entry) {
      await EntryRepository.saveEntry(userId, date, {
        content: entry.content,
        contentText: entry.contentText,
        mood: entry.mood as 1 | 2 | 3 | 4 | 5 | null,
        moodLabel: entry.moodLabel,
        tags: entry.tags,
        scriptureRefs: entry.scriptureRefs,
        wordCount: entry.wordCount,
      })
    }
  }, [userId, date, entry])

  const handleKeepTheirs = useCallback(
    async (remoteEntry: EntryFile) => {
      if (!userId) return
      await EntryRepository.saveEntry(userId, date, {
        content: remoteEntry.content as object,
        mood: remoteEntry.mood,
        moodLabel: remoteEntry.moodLabel,
        tags: remoteEntry.tags,
        scriptureRefs: remoteEntry.scriptureRefs,
        wordCount: remoteEntry.wordCount,
      })
      setShowRemoteModal(false)
    },
    [userId, date],
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
      <div className="flex min-h-[60vh] items-center justify-center">
        <span className="text-on-surface-variant text-sm">Loading...</span>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-2xl px-6 pt-1 md:pt-12">
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

      {userId &&
      entryMetadata?.syncStatus === 'merge-pending-mood' &&
      entryMetadata.moodConflict ? (
        <MoodConflictBanner
          userId={userId}
          date={date}
          localMood={entry?.mood ?? null}
          localMoodLabel={entry?.moodLabel ?? null}
          conflict={entryMetadata.moodConflict}
        />
      ) : null}

      {userId && entryMetadata?.remoteRevisionId && entryMetadata.syncStatus !== 'synced' ? (
        <RemoteUpdateBanner
          userId={userId}
          date={date}
          onKeepMine={() => void handleKeepMine()}
          onView={() => setShowRemoteModal(true)}
        />
      ) : null}

      {showRemoteModal && userId ? (
        <RemoteUpdateModal
          userId={userId}
          date={date}
          localContent={entry?.content ?? null}
          onKeepMine={() => {
            void handleKeepMine()
            setShowRemoteModal(false)
          }}
          onKeepTheirs={(remoteEntry) => void handleKeepTheirs(remoteEntry)}
          onClose={() => setShowRemoteModal(false)}
        />
      ) : null}

      <EntryEditor
        key={date}
        content={entry?.content ?? null}
        onUpdate={handleUpdate}
        onEditorReady={setEditorInstance}
        placeholder={placeholder}
      />
    </div>
  )
}
