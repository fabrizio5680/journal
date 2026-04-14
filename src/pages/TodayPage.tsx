import { useCallback, useEffect, useRef, useState } from 'react'
import { format } from 'date-fns'
import { useNavigate } from 'react-router-dom'
import type { Editor } from '@tiptap/core'

import { useEntry } from '@/hooks/useEntry'
import { useTagVocabulary } from '@/hooks/useTagVocabulary'
import { useSaveStatus } from '@/context/SaveStatusContext'
import { useDictation } from '@/hooks/useDictation'
import EntryEditor from '@/components/editor/EntryEditor'
import EditorToolbar from '@/components/editor/EditorToolbar'
import MetadataChips from '@/components/editor/MetadataChips'
import FloatingActionBar from '@/components/fab/FloatingActionBar'

export default function TodayPage() {
  const today = format(new Date(), 'yyyy-MM-dd')
  const navigate = useNavigate()
  const { entry, isLoading, markDirty, save, deleteEntry } = useEntry(today)
  const { vocabulary, addToVocabulary } = useTagVocabulary()
  const { setDirty, setLastSaved } = useSaveStatus()

  const [editorInstance, setEditorInstance] = useState<Editor | null>(null)
  const [liveWordCount, setLiveWordCount] = useState(0)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const {
    isSupported,
    state: dictationState,
    errorMessage,
    start,
    stop,
  } = useDictation(
    useCallback(
      (text: string) => {
        editorInstance
          ?.chain()
          .focus()
          .insertContent(text + ' ')
          .run()
      },
      [editorInstance],
    ),
  )

  const handleUpdate = useCallback(
    (editor: Editor) => {
      markDirty()
      setDirty(true)
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

  const handleSave = useCallback(async () => {
    if (!editorInstance) return
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current)
    await save({
      content: editorInstance.getJSON(),
      contentText: editorInstance.getText(),
      wordCount: editorInstance.storage.characterCount.words(),
    })
    setDirty(false)
    setLastSaved(new Date())
  }, [editorInstance, save, setDirty, setLastSaved])

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

  const handleDeleteConfirm = useCallback(async () => {
    await deleteEntry()
    setShowDeleteConfirm(false)
    navigate('/history')
  }, [deleteEntry, navigate])

  // Cleanup debounce on unmount
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
        {/* Delete button — only show when an entry exists */}
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
          onMoodChange={handleMoodChange}
          onTagsChange={handleTagsChange}
          onNewTag={addToVocabulary}
        />

        <EntryEditor
          content={entry?.content ?? null}
          onUpdate={handleUpdate}
          onEditorReady={setEditorInstance}
        />
      </div>

      <FloatingActionBar
        wordCount={liveWordCount}
        onSave={handleSave}
        dictation={{
          isSupported,
          state: dictationState,
          errorMessage,
          onStart: start,
          onStop: stop,
        }}
      />

      {/* Delete confirmation dialog */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-6 backdrop-blur-sm">
          <div className="bg-surface-container-lowest w-full max-w-sm rounded-[2rem] p-8 shadow-xl">
            <h2 className="text-on-surface mb-2 text-xl font-bold">Move to Trash?</h2>
            <p className="text-on-surface-variant mb-8 text-sm leading-relaxed">
              This entry will be permanently deleted after 30 days.
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="bg-surface-container text-on-surface rounded-full px-6 py-3 text-sm font-medium transition-colors hover:brightness-95"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteConfirm}
                className="bg-error text-on-error rounded-full px-6 py-3 text-sm font-bold transition-colors hover:brightness-95"
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
