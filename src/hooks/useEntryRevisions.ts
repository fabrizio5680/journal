import { useState, useEffect, useRef, useCallback } from 'react'
import {
  collection,
  onSnapshot,
  addDoc,
  getDocs,
  deleteDoc,
  doc,
  query,
  orderBy,
  serverTimestamp,
} from 'firebase/firestore'
import { onAuthStateChanged } from 'firebase/auth'

import { auth, db } from '@/lib/firebase'
import { useEncryption, EncryptionLockedError } from '@/context/EncryptionContext'
import type { Entry, EntryRevision } from '@/types'

const MAX_REVISIONS = 10

function revisionsCollection(uid: string, date: string) {
  return collection(db, 'users', uid, 'entries', date, 'revisions')
}

export interface UseEntryRevisionsReturn {
  revisions: EntryRevision[]
  isLoading: boolean
  saveRevision: (entry: Entry) => Promise<void>
  scheduleRevision: (contentText: string, entry: Entry) => void
  cancelRevision: () => void
}

export function useEntryRevisions(date: string): UseEntryRevisionsReturn {
  const [uid, setUid] = useState<string | null | undefined>(undefined)
  const [revisions, setRevisions] = useState<EntryRevision[]>([])
  // Track which uid/date key the subscription has fired for — mirrors the
  // pattern in useEntry so setState is only called from snapshot callbacks.
  const [loadedKey, setLoadedKey] = useState<string | null>(null)

  const { encryptFields, decryptFields } = useEncryption()
  const encryptFieldsRef = useRef(encryptFields)
  const decryptFieldsRef = useRef(decryptFields)
  useEffect(() => {
    encryptFieldsRef.current = encryptFields
    decryptFieldsRef.current = decryptFields
  })

  useEffect(() => {
    return onAuthStateChanged(auth, (user) => {
      setUid(user?.uid ?? null)
    })
  }, [])

  useEffect(() => {
    if (!uid) return

    const q = query(revisionsCollection(uid, date), orderBy('savedAt', 'desc'))
    const currentKey = `${uid}/${date}`

    const unsub = onSnapshot(
      q,
      async (snap) => {
        const decrypted: EntryRevision[] = []
        for (const d of snap.docs) {
          const raw = d.data() as Omit<EntryRevision, 'id'>
          try {
            const { content, contentText } = await decryptFieldsRef.current({
              content: raw.content,
              contentText: raw.contentText,
              contentEncrypted: raw.contentEncrypted,
            })
            decrypted.push({ ...raw, id: d.id, content, contentText })
          } catch (err) {
            if (err instanceof EncryptionLockedError) {
              // Keep revision but mark content as locked placeholder
              decrypted.push({ ...raw, id: d.id, contentText: '[Encrypted]' })
            } else {
              decrypted.push({ ...raw, id: d.id })
            }
          }
        }
        setRevisions(decrypted)
        setLoadedKey(currentKey)
      },
      () => {
        setLoadedKey(currentKey)
      },
    )

    return unsub
  }, [uid, date])

  const subscriptionKey = uid != null ? `${uid}/${date}` : null
  const isLoading = uid === undefined || (subscriptionKey !== null && loadedKey !== subscriptionKey)
  // When logged out, revisions state may hold stale data from the previous user.
  // uid == null means no subscription is active, so expose an empty array.
  const visibleRevisions = uid == null ? [] : revisions

  // Refs so timer callbacks always see the latest values without stale closures
  const revisionsRef = useRef(revisions)
  const isLoadingRef = useRef(isLoading)
  useEffect(() => {
    revisionsRef.current = revisions
    isLoadingRef.current = isLoading
  })

  const revisionTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (revisionTimeoutRef.current) clearTimeout(revisionTimeoutRef.current)
    }
  }, [])

  async function saveRevision(entry: Entry): Promise<void> {
    if (!uid) return

    const colRef = revisionsCollection(uid, date)

    const encrypted = await encryptFieldsRef.current(entry.content, entry.contentText)

    await addDoc(colRef, {
      savedAt: serverTimestamp(),
      content: encrypted.content,
      contentText: encrypted.contentText,
      contentEncrypted: encrypted.contentEncrypted,
      mood: entry.mood ?? null,
      moodLabel: entry.moodLabel ?? null,
      tags: entry.tags,
      scriptureRefs: entry.scriptureRefs ?? [],
      wordCount: entry.wordCount,
    })

    // Prune oldest revisions beyond the limit
    const allSnap = await getDocs(query(colRef, orderBy('savedAt', 'asc')))
    const excess = allSnap.docs.length - MAX_REVISIONS
    if (excess > 0) {
      const toDelete = allSnap.docs.slice(0, excess)
      await Promise.all(toDelete.map((d) => deleteDoc(doc(colRef, d.id))))
    }
  }

  // Ref so scheduleRevision (useCallback with [] deps) always calls the latest
  // saveRevision without a stale closure over uid/date.
  const saveRevisionRef = useRef(saveRevision)
  useEffect(() => {
    saveRevisionRef.current = saveRevision
  })

  const cancelRevision = useCallback(() => {
    if (revisionTimeoutRef.current) {
      clearTimeout(revisionTimeoutRef.current)
      revisionTimeoutRef.current = null
    }
  }, [])

  const scheduleRevision = useCallback((contentText: string, entry: Entry) => {
    if (revisionTimeoutRef.current) clearTimeout(revisionTimeoutRef.current)
    revisionTimeoutRef.current = setTimeout(() => {
      revisionTimeoutRef.current = null
      if (isLoadingRef.current) return
      const currentRevisions = revisionsRef.current
      if (currentRevisions.length === 0) {
        void saveRevisionRef.current(entry)
      } else if (currentRevisions[0].contentText !== contentText) {
        void saveRevisionRef.current(entry)
      }
    }, 30_000)
  }, [])

  return { revisions: visibleRevisions, isLoading, saveRevision, scheduleRevision, cancelRevision }
}
