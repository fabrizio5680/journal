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
  save: (data: Partial<Entry>) => Promise<{ stale: boolean }>
  wordCount: number
}

export function useEntry(date: string): UseEntryReturn {
  const [uid, setUid] = useState<string | null | undefined>(undefined)
  const [entry, setEntry] = useState<Entry | null>(null)
  const [metadata, setMetadata] = useState<EntryMetadata | null>(null)
  const [isDirty, setIsDirty] = useState(false)
  const [loadedKey, setLoadedKey] = useState<string | null>(null)

  const isDirtyRef = useRef(false)
  const saveGenerationRef = useRef(0)
  const entryGenRef = useRef(0)

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
        const nextState = await EntryRepository.getEntryState(activeUid, date)
        const [nextMetadata] = await EntryRepository.listMetadata(activeUid, {
          from: date,
          to: date,
        })
        if (cancelled) return
        setLoadedKey(currentKey)
        if (!isDirtyRef.current) {
          setEntry(nextEntry)
          setMetadata(nextMetadata ?? null)
          entryGenRef.current = nextState.kind === 'committed' ? nextState.gen : 0
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
    saveGenerationRef.current++
  }, [])

  const save = useCallback(
    async (data: Partial<Entry>): Promise<{ stale: boolean }> => {
      if (!uid) return { stale: false }

      const entryPatch: Partial<Entry> = { ...data }
      delete entryPatch.date

      const isContentSave = 'content' in data
      const genAtStart = saveGenerationRef.current

      const result = await EntryRepository.saveEntry(uid, date, entryPatch, {
        baseGen: isContentSave ? entryGenRef.current : undefined,
      })

      if (result.stale) {
        entryGenRef.current = result.gen ?? entryGenRef.current
        return { stale: true }
      }

      if (isContentSave && genAtStart !== saveGenerationRef.current) {
        return { stale: true }
      }

      setEntry(result.entry)
      setMetadata(result.metadata)
      entryGenRef.current = result.gen ?? entryGenRef.current
      setIsDirty(false)
      isDirtyRef.current = false
      return { stale: false }
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
