import { toEntry } from './entryFormat'
import { localEntryCache } from './localEntryCache'
import { GoogleDriveAdapter } from './providers/googleDriveAdapter'
import { GOOGLE_DRIVE_PROVIDER, GoogleDriveError } from './providers/googleDriveTypes'
import { syncCoordinator } from './syncCoordinator'
import type { EntryFile, EntryMetadata } from './types'

import type { Entry } from '@/types'

export type HydrationState =
  | { kind: 'present'; entry: Entry; gen: number }
  | {
      kind: 'metadata-only'
      metadata: EntryMetadata
      reason: 'pending-download' | 'awaiting-network'
    }
  | { kind: 'missing' }
  | { kind: 'failed'; metadata: EntryMetadata; lastError: string; retryable: boolean }

export interface EntryHydration {
  get(date: string): Promise<HydrationState>
  retry(date: string): Promise<HydrationState>
  subscribe(date: string, fn: (s: HydrationState) => void): () => void
  destroy(): void
}

const MAX_ATTEMPTS = 5

function isEmptyEntry(entry: EntryFile): boolean {
  return (
    entry.wordCount === 0 &&
    entry.tags.length === 0 &&
    entry.mood == null &&
    (entry.scriptureRefs?.length ?? 0) === 0
  )
}

function retryDelay(attempt: number): number {
  return Math.min(30_000, 1_000 * 2 ** (attempt - 1))
}

export function openEntryHydration(userId: string): EntryHydration {
  const inFlight = new Map<string, Promise<HydrationState>>()
  const attempts = new Map<string, number>()
  const retryTimers = new Map<string, ReturnType<typeof setTimeout>>()
  const listeners = new Map<string, Set<(s: HydrationState) => void>>()

  function notify(date: string, state: HydrationState) {
    listeners.get(date)?.forEach((fn) => fn(state))
  }

  function scheduleRetry(date: string, metadata: EntryMetadata) {
    const attempt = attempts.get(date) ?? 0
    if (attempt >= MAX_ATTEMPTS) return

    const existing = retryTimers.get(date)
    if (existing !== undefined) clearTimeout(existing)

    const timer = setTimeout(() => {
      retryTimers.delete(date)
      inFlight.delete(date)
      const promise = doFetch(date, metadata)
      inFlight.set(date, promise)
      void promise.then((state) => {
        inFlight.delete(date)
        notify(date, state)
      })
    }, retryDelay(attempt))

    retryTimers.set(date, timer)
  }

  async function doFetch(date: string, metadata: EntryMetadata): Promise<HydrationState> {
    const adapter = new GoogleDriveAdapter(userId)
    const attempt = (attempts.get(date) ?? 0) + 1
    attempts.set(date, attempt)

    try {
      const driveEntry = await adapter.getEntry(date)

      if (!driveEntry) {
        await localEntryCache.updateMetadata(userId, date, {
          deletedAt: new Date().toISOString(),
        })
        return { kind: 'missing' }
      }

      if (isEmptyEntry(driveEntry)) {
        await localEntryCache.updateMetadata(userId, date, {
          deletedAt: new Date().toISOString(),
        })
        return { kind: 'missing' }
      }

      await localEntryCache.saveEntry(userId, driveEntry, 'synced', {
        provider: GOOGLE_DRIVE_PROVIDER,
        providerFileId: metadata.providerFileId,
        lastSeenRevisionId: metadata.lastSeenRevisionId ?? null,
        lastSyncedAt: new Date().toISOString(),
      })

      const snapshot = await localEntryCache.getEntrySnapshot(userId, driveEntry.date)
      return { kind: 'present', entry: toEntry(driveEntry), gen: snapshot.localGen }
    } catch (error) {
      const isReconnect = error instanceof GoogleDriveError && error.code === 'reconnect'
      if (isReconnect) {
        return { kind: 'failed', metadata, lastError: (error as Error).message, retryable: false }
      }

      const errorMessage = error instanceof Error ? error.message : String(error)
      const retryable = attempt < MAX_ATTEMPTS

      const state: HydrationState = { kind: 'failed', metadata, lastError: errorMessage, retryable }
      if (retryable) scheduleRetry(date, metadata)
      return state
    }
  }

  async function doGet(date: string): Promise<HydrationState> {
    const snapshot = await localEntryCache.getEntrySnapshot(userId, date)

    if (snapshot.entry && !isEmptyEntry(snapshot.entry)) {
      return { kind: 'present', entry: toEntry(snapshot.entry), gen: snapshot.localGen }
    }

    if (!snapshot.metadata) {
      if (!syncCoordinator.isConnectedOnDevice(userId)) return { kind: 'missing' }
      const adapter = new GoogleDriveAdapter(userId)
      try {
        const driveEntry = await adapter.getEntry(date)
        if (!driveEntry || isEmptyEntry(driveEntry)) return { kind: 'missing' }
        await localEntryCache.saveEntry(userId, driveEntry, 'synced', {
          provider: GOOGLE_DRIVE_PROVIDER,
          lastSyncedAt: new Date().toISOString(),
        })
        const snap2 = await localEntryCache.getEntrySnapshot(userId, driveEntry.date)
        return { kind: 'present', entry: toEntry(driveEntry), gen: snap2.localGen }
      } catch {
        return { kind: 'missing' }
      }
    }

    if (snapshot.entry && isEmptyEntry(snapshot.entry)) {
      await localEntryCache.updateMetadata(userId, date, {
        deletedAt: new Date().toISOString(),
      })
      return { kind: 'missing' }
    }

    // metadata-only row (entry absent from cache)
    if (!syncCoordinator.isConnectedOnDevice(userId)) {
      return { kind: 'metadata-only', metadata: snapshot.metadata, reason: 'awaiting-network' }
    }

    const online = typeof navigator !== 'undefined' ? navigator.onLine !== false : true
    if (!online) {
      return { kind: 'metadata-only', metadata: snapshot.metadata, reason: 'awaiting-network' }
    }

    return doFetch(date, snapshot.metadata)
  }

  function get(date: string): Promise<HydrationState> {
    const existing = inFlight.get(date)
    if (existing) return existing

    const promise = doGet(date).then((state) => {
      inFlight.delete(date)
      notify(date, state)
      return state
    })

    inFlight.set(date, promise)
    return promise
  }

  async function retry(date: string): Promise<HydrationState> {
    const existing = retryTimers.get(date)
    if (existing !== undefined) {
      clearTimeout(existing)
      retryTimers.delete(date)
    }
    attempts.delete(date)
    inFlight.delete(date)
    const state = await get(date)
    return state
  }

  function subscribe(date: string, fn: (s: HydrationState) => void): () => void {
    const set = listeners.get(date) ?? new Set()
    set.add(fn)
    listeners.set(date, set)
    void get(date)
    return () => {
      set.delete(fn)
      if (set.size === 0) listeners.delete(date)
    }
  }

  function destroy() {
    for (const timer of retryTimers.values()) clearTimeout(timer)
    retryTimers.clear()
    inFlight.clear()
    listeners.clear()
    attempts.clear()
  }

  return { get, retry, subscribe, destroy }
}
