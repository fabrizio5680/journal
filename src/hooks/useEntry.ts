import { useState, useEffect, useRef, useCallback } from 'react'
import { doc, onSnapshot, setDoc, serverTimestamp } from 'firebase/firestore'
import { onAuthStateChanged } from 'firebase/auth'

import { auth, db } from '@/lib/firebase'
import { useEncryption, EncryptionLockedError } from '@/context/EncryptionContext'
import type { Entry } from '@/types'

function toDateTimestamp(date: string): number {
  return Math.floor(new Date(`${date}T00:00:00Z`).getTime() / 1000)
}

export interface UseEntryReturn {
  entry: Entry | null
  isLoading: boolean
  isLocked: boolean
  isDirty: boolean
  markDirty: () => void
  save: (data: Partial<Entry>) => Promise<void>
  wordCount: number
}

export function useEntry(date: string): UseEntryReturn {
  // undefined = auth not yet resolved; null = not signed in; string = signed in
  const [uid, setUid] = useState<string | null | undefined>(undefined)
  const [entry, setEntry] = useState<Entry | null>(null)
  const [isDirty, setIsDirty] = useState(false)
  const [isLocked, setIsLocked] = useState(false)
  // Track which "uid/date" key has been loaded so we can derive isLoading without
  // calling setState synchronously inside an effect body.
  const [loadedKey, setLoadedKey] = useState<string | null>(null)

  // Use a ref so the snapshot callback always reads the latest isDirty value
  // without causing the effect to re-subscribe.
  const isDirtyRef = useRef(false)
  // Counts how many save echoes to suppress. Each save increments this before
  // clearing isDirty; the snapshot listener decrements and skips setEntry once
  // per echo so our own writes never cause a setContent / cursor reset.
  const expectingEchoRef = useRef(0)

  const { decryptFields, encryptFields } = useEncryption()
  const decryptFieldsRef = useRef(decryptFields)
  useEffect(() => {
    decryptFieldsRef.current = decryptFields
  })

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
      async (snap) => {
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
            if (expectingEchoRef.current > 0) {
              expectingEchoRef.current -= 1
              return
            }
            if (data.deleted) {
              setEntry(null)
              return
            }
            try {
              const { content, contentText } = await decryptFieldsRef.current(data)
              setIsLocked(false)
              setEntry({ ...data, content, contentText })
            } catch (err) {
              if (err instanceof EncryptionLockedError) {
                setIsLocked(true)
                setEntry(null)
              } else {
                setEntry(null)
              }
            }
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

      // Encrypt content fields if encryption is enabled
      if (entryPatch.content !== undefined || entryPatch.contentText !== undefined) {
        const contentToEncrypt = entryPatch.content ?? ({} as object)
        const textToEncrypt = entryPatch.contentText ?? ''
        const encrypted = await encryptFields(contentToEncrypt, textToEncrypt)
        entryPatch.content = encrypted.content
        entryPatch.contentText = encrypted.contentText
        entryPatch.contentEncrypted = encrypted.contentEncrypted
      }

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

      expectingEchoRef.current += 1
      setIsDirty(false)
      isDirtyRef.current = false
    },
    [uid, date, entry, encryptFields],
  )

  return {
    entry,
    isLoading,
    isLocked,
    isDirty,
    markDirty,
    save,
    wordCount: entry?.wordCount ?? 0,
  }
}
