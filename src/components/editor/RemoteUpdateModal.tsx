import { createPortal } from 'react-dom'
import { useEffect, useState } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'

import { GoogleDriveAdapter } from '@/lib/storage/providers/googleDriveAdapter'
import type { EntryFile } from '@/lib/storage/types'

interface Props {
  userId: string
  date: string
  localContent: object | null
  onKeepMine: () => void
  onKeepTheirs: (remoteEntry: EntryFile) => void
  onClose: () => void
}

function ReadOnlyEditor({ content }: { content: object | null }) {
  const editor = useEditor({
    extensions: [StarterKit],
    content: content ?? undefined,
    editable: false,
    editorProps: {
      attributes: {
        class: 'outline-none text-on-surface text-sm leading-relaxed font-display font-light',
      },
    },
  })

  useEffect(() => {
    if (!editor) return
    if (content === null) {
      editor.commands.setContent('')
    } else {
      const current = editor.getJSON()
      if (JSON.stringify(current) !== JSON.stringify(content)) {
        editor.commands.setContent(content, { emitUpdate: false })
      }
    }
  }, [editor, content])

  if (!editor) return null
  return <EditorContent editor={editor} />
}

export default function RemoteUpdateModal({
  userId,
  date,
  localContent,
  onKeepMine,
  onKeepTheirs,
  onClose,
}: Props) {
  const [remoteEntry, setRemoteEntry] = useState<EntryFile | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    const adapter = new GoogleDriveAdapter(userId)
    adapter
      .getEntry(date)
      .then((entry) => {
        if (cancelled) return
        setRemoteEntry(entry)
        setLoading(false)
      })
      .catch(() => {
        if (cancelled) return
        setError('Could not load the remote version. Please try again.')
        setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [userId, date])

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 md:items-center"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="bg-surface-container-lowest flex max-h-[90vh] w-full flex-col overflow-hidden rounded-t-3xl shadow-2xl md:max-w-4xl md:rounded-3xl">
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between px-6 pt-5 pb-3">
          <p className="text-on-surface text-base font-semibold">Compare versions</p>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="text-on-surface-variant/60 hover:text-on-surface-variant -mr-1 rounded-full p-1 transition-colors"
          >
            <span className="material-symbols-outlined text-[20px]">close</span>
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 pb-4">
          {loading && (
            <p className="text-on-surface-variant py-8 text-center text-sm">
              Loading remote version…
            </p>
          )}
          {error && <p className="text-error py-8 text-center text-sm">{error}</p>}
          {!loading && !error && (
            <div className="flex flex-col gap-4 md:flex-row">
              <div className="flex-1">
                <p className="text-on-surface-variant mb-2 text-xs font-semibold tracking-wide uppercase">
                  Mine (this device)
                </p>
                <div className="bg-surface-container min-h-[8rem] rounded-2xl p-4">
                  <ReadOnlyEditor content={localContent} />
                </div>
              </div>
              <div className="flex-1">
                <p className="text-on-surface-variant mb-2 text-xs font-semibold tracking-wide uppercase">
                  Remote (another device)
                </p>
                <div className="bg-surface-container min-h-[8rem] rounded-2xl p-4">
                  {remoteEntry ? (
                    <ReadOnlyEditor content={remoteEntry.content} />
                  ) : (
                    <p className="text-on-surface-variant text-sm italic">No content</p>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        {!loading && !error && (
          <div className="border-outline-variant/20 flex shrink-0 justify-end gap-2 border-t px-6 py-4">
            <button
              type="button"
              onClick={onKeepMine}
              className="bg-surface-container text-on-surface-variant rounded-full px-4 py-2 text-sm font-semibold transition-opacity hover:opacity-80"
            >
              Keep mine
            </button>
            <button
              type="button"
              onClick={() => remoteEntry && onKeepTheirs(remoteEntry)}
              disabled={!remoteEntry}
              className="bg-primary text-on-primary rounded-full px-4 py-2 text-sm font-semibold transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              Keep theirs
            </button>
          </div>
        )}
      </div>
    </div>,
    document.body,
  )
}
