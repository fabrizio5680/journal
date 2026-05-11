import { doc, serverTimestamp, setDoc } from 'firebase/firestore'

import { bodyTextFromSearchText, createEntryFile, toEntry } from './entryFormat'
import { localEntryCache } from './localEntryCache'
import { GoogleDriveAdapter } from './providers/googleDriveAdapter'
import { GOOGLE_DRIVE_PROVIDER, GoogleDriveError } from './providers/googleDriveTypes'
import { syncCoordinator } from './syncCoordinator'
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
    if (entry) return toEntry(entry)
    if (!syncCoordinator.isConnectedOnDevice(userId)) return null

    try {
      const adapter = new GoogleDriveAdapter(userId)
      const driveEntry = await adapter.getEntry(date)
      if (!driveEntry) return null
      const [driveMetadata] = await adapter.listEntryMetadata({ from: date, to: date })
      await localEntryCache.saveEntry(userId, driveEntry, 'synced', {
        provider: GOOGLE_DRIVE_PROVIDER,
        providerFileId: driveMetadata?.providerFileId,
        lastSeenRevisionId: driveMetadata?.lastSeenRevisionId ?? null,
        lastSyncedAt: new Date().toISOString(),
      })
      return toEntry(driveEntry)
    } catch (error) {
      if (error instanceof GoogleDriveError && error.code === 'reconnect') {
        const [metadata] = await localEntryCache.listMetadata(userId, { from: date, to: date })
        if (metadata) {
          await localEntryCache.updateMetadata(userId, date, {
            provider: GOOGLE_DRIVE_PROVIDER,
            syncStatus: 'reconnect',
            syncError: error.message,
          })
        }
      }
      return null
    }
  },

  async saveEntry(userId: string, date: string, draft: EntryDraft) {
    const existing = await localEntryCache.getEntry(userId, date)
    const entry = createEntryFile(date, draft, existing ?? undefined)
    const shouldSync = syncCoordinator.isConnectedOnDevice(userId)
    const metadata = await localEntryCache.saveEntry(
      userId,
      entry,
      shouldSync ? 'sync-pending' : 'saved-local',
    )

    await setDoc(
      doc(db, 'users', userId),
      {
        lastEntryDate: date,
        lastEntrySavedAt: serverTimestamp(),
      },
      { merge: true },
    )

    emit(userId)
    if (shouldSync) void syncCoordinator.enqueue(userId, date)
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

syncCoordinator.subscribe(emit)

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
