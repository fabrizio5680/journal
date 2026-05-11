import { useState } from 'react'
import ReactDOM from 'react-dom'
import { formatDistanceToNow } from 'date-fns'
import clsx from 'clsx'

import { useEntryRevisions } from '@/hooks/useEntryRevisions'
import type { EntryRevision } from '@/types'

interface RevisionHistoryModalProps {
  date: string
  isOpen: boolean
  onClose: () => void
  onRestore: (revision: EntryRevision) => Promise<void>
}

export function RevisionHistoryModal({
  date,
  isOpen,
  onClose,
  onRestore,
}: RevisionHistoryModalProps) {
  const { revisions, isLoading } = useEntryRevisions(date)
  const [selected, setSelected] = useState<EntryRevision | null>(null)
  const [isRestoring, setIsRestoring] = useState(false)

  if (!isOpen) return null

  async function handleRestore() {
    if (!selected) return
    setIsRestoring(true)
    try {
      await onRestore(selected)
      onClose()
    } finally {
      setIsRestoring(false)
    }
  }

  function handleClose() {
    setSelected(null)
    onClose()
  }

  const modal = (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/30 backdrop-blur-sm md:items-center"
      onClick={(e) => {
        if (e.target === e.currentTarget) handleClose()
      }}
    >
      <div className="bg-surface-container-lowest flex w-full max-w-lg flex-col rounded-t-[2rem] shadow-2xl md:rounded-2xl">
        {/* Handle — mobile only */}
        <div className="bg-outline-variant/30 mx-auto mt-3 mb-1 h-1 w-10 rounded-full md:hidden" />

        {/* Header */}
        <div className="border-outline-variant/15 flex items-center justify-between border-b px-6 py-4">
          <h2 className="text-on-surface font-display text-lg font-semibold">Version History</h2>
          <button
            aria-label="Close version history"
            onClick={handleClose}
            className="text-on-surface-variant hover:bg-surface-container flex h-8 w-8 items-center justify-center rounded-full transition-colors"
          >
            <span className="material-symbols-outlined text-[20px]">close</span>
          </button>
        </div>

        {/* Body */}
        <div className="flex min-h-0 flex-col overflow-hidden md:flex-row">
          {/* Revision list */}
          <div className="border-outline-variant/15 flex w-full flex-col overflow-y-auto border-b md:w-52 md:shrink-0 md:border-r md:border-b-0">
            {isLoading && (
              <div className="flex items-center justify-center py-10">
                <span className="text-on-surface-variant animate-pulse text-sm">Loading…</span>
              </div>
            )}

            {!isLoading && revisions.length === 0 && (
              <div className="px-6 py-10 text-center">
                <span className="material-symbols-outlined text-on-surface-variant/40 text-3xl">
                  history
                </span>
                <p className="text-on-surface-variant mt-2 text-sm">No saved versions yet</p>
              </div>
            )}

            {!isLoading &&
              revisions.map((rev) => {
                const ts = rev.savedAt?.toDate()
                const timeLabel = ts ? formatDistanceToNow(ts, { addSuffix: true }) : 'Unknown time'
                const isSelected = selected?.id === rev.id

                return (
                  <button
                    key={rev.id}
                    onClick={() => setSelected(rev)}
                    className={clsx(
                      'flex flex-col gap-0.5 px-4 py-3 text-left transition-colors',
                      isSelected
                        ? 'bg-primary-container/40 text-on-surface'
                        : 'text-on-surface hover:bg-surface-container',
                    )}
                  >
                    <span className="text-sm leading-snug font-medium">{timeLabel}</span>
                    <span className="text-on-surface-variant text-xs">
                      {rev.wordCount} {rev.wordCount === 1 ? 'word' : 'words'}
                    </span>
                  </button>
                )
              })}
          </div>

          {/* Preview panel */}
          <div className="flex min-h-0 flex-1 flex-col">
            {selected ? (
              <>
                <div className="text-on-surface-variant flex-1 overflow-y-auto px-5 py-4 text-sm leading-relaxed whitespace-pre-wrap">
                  {selected.contentText || (
                    <span className="italic opacity-60">No text content</span>
                  )}
                </div>
                <div className="border-outline-variant/15 flex items-center justify-end gap-3 border-t px-5 py-3">
                  <button
                    onClick={handleClose}
                    className="text-on-surface-variant hover:text-on-surface rounded-xl px-4 py-2 text-sm transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => void handleRestore()}
                    disabled={isRestoring}
                    className="bg-primary text-on-primary hover:bg-primary-dim rounded-xl px-4 py-2 text-sm font-medium transition-colors disabled:opacity-50"
                  >
                    {isRestoring ? 'Restoring…' : 'Restore this version'}
                  </button>
                </div>
              </>
            ) : (
              <div className="flex flex-1 items-center justify-center px-6 py-10 text-center">
                <p className="text-on-surface-variant text-sm">
                  Select a version to preview its content
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )

  return ReactDOM.createPortal(modal, document.body)
}
