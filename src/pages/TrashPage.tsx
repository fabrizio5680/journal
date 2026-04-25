import { useState, useEffect } from 'react'
import { onAuthStateChanged } from 'firebase/auth'
import {
  collection,
  query,
  where,
  orderBy,
  onSnapshot,
  setDoc,
  deleteDoc,
  doc,
} from 'firebase/firestore'

import { auth, db } from '@/lib/firebase'
import { usePageTitle } from '@/hooks/usePageTitle'
import TrashEntryCard from '@/components/history/TrashEntryCard'
import type { Entry } from '@/types'

export default function TrashPage() {
  usePageTitle('Trash')
  const [uid, setUid] = useState<string | null>(null)
  const [entries, setEntries] = useState<Entry[]>([])
  const [confirmDeleteDate, setConfirmDeleteDate] = useState<string | null>(null)

  useEffect(() => {
    return onAuthStateChanged(auth, (user) => {
      setUid(user?.uid ?? null)
    })
  }, [])

  useEffect(() => {
    if (!uid) return

    const q = query(
      collection(db, 'users', uid, 'entries'),
      where('deleted', '==', true),
      orderBy('deletedAt', 'desc'),
    )

    return onSnapshot(
      q,
      (snap) => {
        const list: Entry[] = []
        snap.forEach((d) => list.push(d.data() as Entry))
        setEntries(list)
      },
      (err) => {
        console.error('[TrashPage] onSnapshot error:', err)
        setEntries([])
      },
    )
  }, [uid])

  const handleRestore = async (date: string) => {
    if (!uid) return
    const entryRef = doc(db, 'users', uid, 'entries', date)
    await setDoc(entryRef, { deleted: false, deletedAt: null }, { merge: true })
  }

  const handleDeleteForever = async (date: string) => {
    if (!uid) return
    const entryRef = doc(db, 'users', uid, 'entries', date)
    await deleteDoc(entryRef)
    setConfirmDeleteDate(null)
  }

  return (
    <div className="mx-auto max-w-2xl px-6 pt-8 md:pt-16">
      {/* Header */}
      <div className="mb-10">
        <p className="text-on-surface-variant/50 mb-2 text-[10px] tracking-[0.25em] uppercase">
          Deleted entries
        </p>
        <h1 className="font-display text-on-surface text-[3rem] leading-none font-light tracking-tight">
          Trash
        </h1>
        <p className="text-on-surface-variant/60 mt-2 text-sm">
          Entries are permanently deleted after 30 days.
        </p>
      </div>

      {/* Entry list */}
      {entries.length === 0 ? (
        <div className="flex flex-col items-center gap-4 py-24 text-center">
          <span className="material-symbols-outlined text-on-surface-variant/20 text-[56px]">
            delete
          </span>
          <p className="font-display text-on-surface-variant text-2xl font-light italic">
            Your trash is empty.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {entries.map((entry) => (
            <TrashEntryCard
              key={entry.date}
              entry={entry}
              onRestore={handleRestore}
              onDeleteForever={(date) => setConfirmDeleteDate(date)}
            />
          ))}
        </div>
      )}

      {/* Delete forever confirmation dialog */}
      {confirmDeleteDate && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-6 backdrop-blur-sm"
        >
          <div className="bg-surface-container-lowest border-outline-variant/10 w-full max-w-sm rounded-[2rem] border p-8 shadow-2xl">
            <h2 className="font-display text-on-surface mb-2 text-2xl font-semibold">
              Permanently delete?
            </h2>
            <p className="text-on-surface-variant/70 mb-8 text-sm leading-relaxed">
              This cannot be undone.
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setConfirmDeleteDate(null)}
                className="bg-surface-container text-on-surface-variant rounded-full px-5 py-2.5 text-sm font-medium transition-colors hover:brightness-95"
              >
                Cancel
              </button>
              <button
                onClick={() => handleDeleteForever(confirmDeleteDate)}
                className="bg-error text-on-error rounded-full px-5 py-2.5 text-sm font-semibold transition-colors hover:brightness-95"
              >
                Delete Forever
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
