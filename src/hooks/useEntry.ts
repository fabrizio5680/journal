import { useCallback, useEffect, useRef, useState } from 'react'
import { onAuthStateChanged } from 'firebase/auth'

import { auth } from '@/lib/firebase'
import { EntryRepository } from '@/lib/storage/entryRepository'
import type { EntryMetadata } from '@/lib/storage/types'
import type { Entry } from '@/types'

export interface UseEntryReturn {
  entry: Entry | null
  isLoading: boolean
  isDirty: boolean
  metadata: EntryMetadata | null
  markDirty: () => void
  save: (data: Partial<Entry>) => Promise<void>
  wordCount: number
}

export function useEntry(date: string): UseEntryReturn {
  const [uid, setUid] = useState<string | null | undefined>(undefined)
  const [entry, setEntry] = useState<Entry | null>(null)
  const [metadata, setMetadata] = useState<EntryMetadata | null>(null)
  const [isDirty, setIsDirty] = useState(false)
  const [loadedKey, setLoadedKey] = useState<string | null>(null)

  const isDirtyRef = useRef(false)

  useEffect(() => {
    return onAuthStateChanged(auth, (user) => {
      setUid(user?.uid ?? null)
    })
  }, [])

  useEffect(() => {
    if (!uid) return

    const activeUid = uid
    const currentKey = `${uid}/${date}`
    let cancelled = false

    async function loadEntry() {
      try {
        const nextEntry = await EntryRepository.getEntry(activeUid, date)
        const [nextMetadata] = await EntryRepository.listMetadata(activeUid, {
          from: date,
          to: date,
        })
        if (cancelled) return
        setLoadedKey(currentKey)
        if (!isDirtyRef.current) {
          setEntry(nextEntry)
          setMetadata(nextMetadata ?? null)
        }
      } catch {
        if (cancelled) return
        setLoadedKey(currentKey)
        if (!isDirtyRef.current) {
          setEntry(null)
          setMetadata(null)
        }
      }
    }

    void loadEntry()
    const unsubscribe = EntryRepository.subscribe(activeUid, () => void loadEntry())

    return () => {
      cancelled = true
      unsubscribe()
    }
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

      const entryPatch: Partial<Entry> = { ...data }
      delete entryPatch.date

      const result = await EntryRepository.saveEntry(uid, date, entryPatch)
      setEntry(result.entry)
      setMetadata(result.metadata)
      setIsDirty(false)
      isDirtyRef.current = false
    },
    [uid, date],
  )

  return {
    entry,
    isLoading,
    isDirty,
    metadata,
    markDirty,
    save,
    wordCount: entry?.wordCount ?? 0,
  }
}
