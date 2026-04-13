import { useCallback, useEffect, useRef, useState } from 'react'
import { useParams, Navigate } from 'react-router-dom'
import type { Editor } from '@tiptap/core'

import { useEntry } from '@/hooks/useEntry'
import { useSaveStatus } from '@/context/SaveStatusContext'
import EntryEditor from '@/components/editor/EntryEditor'
import EditorToolbar from '@/components/editor/EditorToolbar'
import MetadataChips from '@/components/editor/MetadataChips'
import FloatingActionBar from '@/components/fab/FloatingActionBar'

export default function EntryPage() {
  const { date } = useParams<{ date: string }>()

  if (!date) return <Navigate to="/" replace />

  return <EntryEditorView date={date} />
}

function EntryEditorView({ date }: { date: string }) {
  const { entry, isLoading, markDirty, save } = useEntry(date)
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
        <MetadataChips
          mood={entry?.mood ?? null}
          moodLabel={entry?.moodLabel ?? null}
          tags={entry?.tags ?? []}
          onMoodClick={() => {}}
          onTagClick={() => {}}
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
      />
    </>
  )
}
