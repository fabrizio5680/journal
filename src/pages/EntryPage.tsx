import { useCallback, useEffect, useRef, useState } from 'react'
import { useParams, Navigate, useNavigate } from 'react-router-dom'
import { format, parseISO } from 'date-fns'
import type { Editor } from '@tiptap/core'

import { useEntry } from '@/hooks/useEntry'
import { useTagVocabulary } from '@/hooks/useTagVocabulary'
import { useSaveStatus } from '@/context/SaveStatusContext'
import EntryEditor from '@/components/editor/EntryEditor'
import EditorToolbar from '@/components/editor/EditorToolbar'
import MetadataChips from '@/components/editor/MetadataChips'
import FloatingActionBar from '@/components/fab/FloatingActionBar'

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/

export default function EntryPage() {
  const { date } = useParams<{ date: string }>()

  if (!date || !DATE_REGEX.test(date)) return <Navigate to="/history" replace />

  return <EntryEditorView date={date} />
}

function EntryEditorView({ date }: { date: string }) {
  const navigate = useNavigate()
  const { entry, isLoading, markDirty, save } = useEntry(date)
  const { vocabulary, addToVocabulary } = useTagVocabulary()
  const { setDirty, setLastSaved } = useSaveStatus()

  const [editorInstance, setEditorInstance] = useState<Editor | null>(null)
  const [liveWordCount, setLiveWordCount] = useState(0)
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

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
        {/* Back button + historical date */}
        <div className="mb-6 flex items-center gap-3">
          <button
            onClick={() => navigate(-1)}
            aria-label="Go back"
            className="hover:bg-surface-container text-on-surface-variant flex items-center gap-1 rounded-full px-3 py-1.5 text-sm transition-colors"
          >
            <span className="material-symbols-outlined text-[18px]">arrow_back</span>
            Back
          </button>
          <span className="text-on-surface-variant text-sm">
            {format(parseISO(date), 'EEEE, MMMM d, yyyy')}
          </span>
        </div>

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

      <FloatingActionBar wordCount={liveWordCount} onSave={handleSave} />
    </>
  )
}
