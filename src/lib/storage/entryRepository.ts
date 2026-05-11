import { doc, serverTimestamp, setDoc } from 'firebase/firestore'

import { bodyTextFromSearchText, createEntryFile, toEntry } from './entryFormat'
import { localEntryCache } from './localEntryCache'
import type { DateRange, EntryDraft, EntryMetadata, SearchFilters, SearchHit } from './types'

import { db } from '@/lib/firebase'

type Listener = () => void

const listeners = new Map<string, Set<Listener>>()

function emit(userId: string) {
  listeners.get(userId)?.forEach((listener) => listener())
}

function excerptFor(text: string, query: string): string {
  const body = bodyTextFromSearchText(text)
  const normalizedQuery = query.trim().toLowerCase()
  if (!normalizedQuery) return body.slice(0, 160)

  const index = body.toLowerCase().indexOf(normalizedQuery)
  if (index < 0) return body.slice(0, 160)

  const start = Math.max(0, index - 50)
  return body.slice(start, start + 180).trim()
}

export const EntryRepository = {
  subscribe(userId: string, listener: Listener): () => void {
    const set = listeners.get(userId) ?? new Set<Listener>()
    set.add(listener)
    listeners.set(userId, set)
    return () => {
      set.delete(listener)
      if (set.size === 0) listeners.delete(userId)
    }
  },

  async getEntry(userId: string, date: string) {
    const entry = await localEntryCache.getEntry(userId, date)
    return entry ? toEntry(entry) : null
  },

  async saveEntry(userId: string, date: string, draft: EntryDraft) {
    const existing = await localEntryCache.getEntry(userId, date)
    const entry = createEntryFile(date, draft, existing ?? undefined)
    const metadata = await localEntryCache.saveEntry(userId, entry, 'saved-local')

    await setDoc(
      doc(db, 'users', userId),
      {
        lastEntryDate: date,
        lastEntrySavedAt: serverTimestamp(),
      },
      { merge: true },
    )

    emit(userId)
    return { entry: toEntry(entry), metadata }
  },

  async listMetadata(userId: string, range?: DateRange): Promise<EntryMetadata[]> {
    return localEntryCache.listMetadata(userId, range)
  },

  async listEntries(userId: string, range?: DateRange) {
    return localEntryCache.listEntries(userId, range)
  },

  async searchEntries(
    userId: string,
    query: string,
    filters?: SearchFilters,
  ): Promise<SearchHit[]> {
    const normalizedQuery = query.trim().toLowerCase()
    const entries = await localEntryCache.listEntries(userId, {
      from: filters?.dateFrom,
      to: filters?.dateTo,
    })
    const moodLabels = new Set(filters?.moodLabels ?? [])

    return entries
      .filter((entry) => moodLabels.size === 0 || moodLabels.has(entry.moodLabel ?? ''))
      .filter((entry) => {
        if (!normalizedQuery) return true
        return (entry.searchText ?? entry.contentText ?? '').toLowerCase().includes(normalizedQuery)
      })
      .map((entry) => ({
        objectID: `${userId}_${entry.date}`,
        date: entry.date,
        excerpt: excerptFor(entry.searchText ?? entry.contentText ?? '', query),
        mood: entry.mood,
        moodLabel: entry.moodLabel,
        tags: entry.tags,
        wordCount: entry.wordCount,
      }))
      .sort((a, b) => b.date.localeCompare(a.date))
  },
}

if (import.meta.env.VITE_USE_EMULATOR === 'true' && typeof window !== 'undefined') {
  ;(
    window as typeof window & {
      __seedEntriesForTest?: (
        userId: string,
        entries: Array<{ date: string } & EntryDraft>,
      ) => Promise<void>
    }
  ).__seedEntriesForTest = async (userId, entries) => {
    for (const entry of entries) {
      await EntryRepository.saveEntry(userId, entry.date, entry)
    }
  }
}
