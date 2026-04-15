import { useState, useEffect, useRef, useCallback } from 'react'
import { doc, onSnapshot, setDoc, serverTimestamp } from 'firebase/firestore'
import { onAuthStateChanged } from 'firebase/auth'

import { auth, db } from '@/lib/firebase'
import type { Entry } from '@/types'

function toDateTimestamp(date: string): number {
  return Math.floor(new Date(`${date}T00:00:00Z`).getTime() / 1000)
}

export interface UseEntryReturn {
  entry: Entry | null
  isLoading: boolean
  isDirty: boolean
  markDirty: () => void
  save: (data: Partial<Entry>) => Promise<void>
  deleteEntry: () => Promise<void>
  restoreEntry: () => Promise<void>
  wordCount: number
}

export function useEntry(date: string): UseEntryReturn {
  // undefined = auth not yet resolved; null = not signed in; string = signed in
  const [uid, setUid] = useState<string | null | undefined>(undefined)
  const [entry, setEntry] = useState<Entry | null>(null)
  const [isDirty, setIsDirty] = useState(false)
  // Track which "uid/date" key has been loaded so we can derive isLoading without
  // calling setState synchronously inside an effect body.
  const [loadedKey, setLoadedKey] = useState<string | null>(null)

  // Use a ref so the snapshot callback always reads the latest isDirty value
  // without causing the effect to re-subscribe.
  const isDirtyRef = useRef(false)

  useEffect(() => {
    return onAuthStateChanged(auth, (user) => {
      setUid(user?.uid ?? null)
    })
  }, [])

  useEffect(() => {
    if (!uid) return

    const entryRef = doc(db, 'users', uid, 'entries', date)
    const currentKey = `${uid}/${date}`

    const unsub = onSnapshot(
      entryRef,
      (snap) => {
        // Mark this key as loaded (in callback — not synchronous in effect body)
        setLoadedKey(currentKey)
        if (snap.exists()) {
          const data = snap.data() as Entry

          // Guard invariant: entry payload date must match the document day key.
          if (data.date !== date) {
            if (!isDirtyRef.current) setEntry(null)
            return
          }

          // Ignore remote updates while the user is typing.
          // Also treat soft-deleted entries as non-existent so the editor stays empty.
          if (!isDirtyRef.current) {
            setEntry(data.deleted ? null : data)
          }
        } else {
          if (!isDirtyRef.current) setEntry(null)
        }
      },
      () => {
        // Avoid uncaught listener errors from bubbling to the console.
        setLoadedKey(currentKey)
        if (!isDirtyRef.current) setEntry(null)
      },
    )

    return unsub
  }, [uid, date])

  const queryKey = uid != null ? `${uid}/${date}` : null
  const isLoading = uid === undefined || (queryKey !== null && loadedKey !== queryKey)

  const markDirty = useCallback(() => {
    setIsDirty(true)
    isDirtyRef.current = true
  }, [])

  const save = useCallback(
    async (data: Partial<Entry>) => {
      if (!uid) return

      // Explicitly ignore caller-provided date to keep doc id/date 1:1.
      const entryPatch: Partial<Entry> = { ...data }
      delete entryPatch.date

      const entryRef = doc(db, 'users', uid, 'entries', date)
      const isNew = entry === null

      await setDoc(
        entryRef,
        {
          ...entryPatch,
          userId: uid,
          date,
          dateTimestamp: toDateTimestamp(date),
          updatedAt: serverTimestamp(),
          ...(isNew
            ? {
                createdAt: serverTimestamp(),
                deleted: false,
                deletedAt: null,
              }
            : {}),
        },
        { merge: true },
      )

      setIsDirty(false)
      isDirtyRef.current = false
    },
    [uid, date, entry],
  )

  const deleteEntry = useCallback(async () => {
    if (!uid) return
    const entryRef = doc(db, 'users', uid, 'entries', date)
    await setDoc(entryRef, { deleted: true, deletedAt: serverTimestamp() }, { merge: true })
  }, [uid, date])

  const restoreEntry = useCallback(async () => {
    if (!uid) return
    const entryRef = doc(db, 'users', uid, 'entries', date)
    await setDoc(entryRef, { deleted: false, deletedAt: null }, { merge: true })
  }, [uid, date])

  return {
    entry,
    isLoading,
    isDirty,
    markDirty,
    save,
    deleteEntry,
    restoreEntry,
    wordCount: entry?.wordCount ?? 0,
  }
}
