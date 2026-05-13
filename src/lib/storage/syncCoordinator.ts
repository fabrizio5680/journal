import { localEntryCache } from './localEntryCache'
import { conflictResolver } from './conflictResolver'
import { getDeviceFingerprint } from './deviceFingerprint'
import { toEntry } from './entryFormat'
import { GoogleDriveAdapter } from './providers/googleDriveAdapter'
import {
  getStoredGoogleDriveConnection,
  isGoogleDriveLocallyDisconnected,
} from './providers/googleDriveAuth'
import { GOOGLE_DRIVE_PROVIDER, GoogleDriveError } from './providers/googleDriveTypes'
import type { ManifestEntry } from './types'

type Listener = (userId: string) => void

const processingUsers = new Set<string>()
const newEnqueuesWhileProcessing = new Set<string>()
const scheduledRetries = new Map<string, ReturnType<typeof setTimeout>>()
const retryCounts = new Map<string, number>()
const listeners = new Set<Listener>()

function retryKey(userId: string, date: string) {
  return `${userId}:${date}`
}

function pushManifest(userId: string, adapter: GoogleDriveAdapter): void {
  void (async () => {
    try {
      const allMeta = await localEntryCache.listMetadata(userId)
      const manifestEntries: ManifestEntry[] = allMeta
        .filter((m) => m.providerFileId)
        .map((m) => ({
          date: m.date,
          mood: m.mood,
          moodLabel: m.moodLabel,
          tags: m.tags,
          wordCount: m.wordCount,
          providerFileId: m.providerFileId!,
        }))
      await adapter.writeManifest(manifestEntries)
    } catch {
      // non-fatal
    }
  })()
}

function notify(userId: string) {
  listeners.forEach((listener) => listener(userId))
}

function retryDelay(attempt: number) {
  const base = Math.min(30_000, 1000 * 2 ** attempt)
  return base + Math.floor(Math.random() * 500)
}

async function markStatus(
  userId: string,
  date: string,
  patch: Parameters<typeof localEntryCache.updateMetadata>[2],
) {
  await localEntryCache.updateMetadata(userId, date, patch)
  notify(userId)
}

async function syncOne(userId: string, date: string, isRetry = false): Promise<void> {
  const connection = getStoredGoogleDriveConnection(userId)
  if (!connection || connection.reconnectRequired || isGoogleDriveLocallyDisconnected(userId)) {
    await markStatus(userId, date, {
      provider: GOOGLE_DRIVE_PROVIDER,
      syncStatus: 'reconnect',
      syncError: 'Google Drive needs to be reconnected.',
    })
    return
  }

  const entry = await localEntryCache.getEntry(userId, date)
  if (!entry) {
    // Content missing from cache but metadata says sync-pending; clear the stuck state
    await markStatus(userId, date, {
      provider: GOOGLE_DRIVE_PROVIDER,
      syncStatus: 'saved-local',
      syncError: undefined,
    })
    return
  }

  const [metadata] = await localEntryCache.listMetadata(userId, { from: date, to: date })
  const adapter = new GoogleDriveAdapter(userId)

  try {
    const result = await adapter.saveEntry(entry, metadata?.lastSeenRevisionId ?? undefined)
    retryCounts.delete(retryKey(userId, date))
    await markStatus(userId, date, {
      provider: GOOGLE_DRIVE_PROVIDER,
      providerFileId: result.metadata.providerFileId,
      lastSeenRevisionId: result.revisionId,
      lastSyncedAt: new Date().toISOString(),
      syncStatus: 'synced',
      syncError: undefined,
      moodConflict: null,
      remoteRevisionId: null,
      remoteUpdatedAt: null,
    })
    pushManifest(userId, adapter)
  } catch (error) {
    if (!(error instanceof GoogleDriveError) || error.code !== 'conflict') {
      throw error
    }

    // Conflict: download remote, route through ConflictResolver
    const remoteEntry = await adapter.getEntry(date)
    if (!remoteEntry) {
      // Remote gone — just push local
      const result = await adapter.saveEntry(entry)
      retryCounts.delete(retryKey(userId, date))
      await markStatus(userId, date, {
        provider: GOOGLE_DRIVE_PROVIDER,
        providerFileId: result.metadata.providerFileId,
        lastSeenRevisionId: result.revisionId,
        lastSyncedAt: new Date().toISOString(),
        syncStatus: 'synced',
        syncError: undefined,
      })
      pushManifest(userId, adapter)
      return
    }

    const { deviceId, deviceLabel } = await getDeviceFingerprint(userId)
    const remoteRevisionId = metadata?.remoteRevisionId ?? metadata?.lastSeenRevisionId ?? 'unknown'

    // Record conflict (awaits backup, persists to IDB)
    const { conflict, proposedFile } = await conflictResolver.record(
      userId,
      date,
      entry,
      remoteEntry,
      deviceLabel,
      remoteRevisionId,
    )

    // Backup failed — surface blocking banner, do not merge
    if (conflict.backupStatus === 'failed') {
      await markStatus(userId, date, {
        provider: GOOGLE_DRIVE_PROVIDER,
        syncStatus: 'conflict',
        syncError: 'Conflict backup failed. Retry sync to attempt again.',
      })
      return
    }

    if (conflict.kinds.includes('mood')) {
      // Mood conflict — save proposed locally and wait for user resolution
      await localEntryCache.saveEntry(userId, proposedFile, 'merge-pending-mood', {
        provider: GOOGLE_DRIVE_PROVIDER,
        mergedFromDeviceId: deviceId,
        moodConflict: {
          remoteMood: remoteEntry.mood,
          remoteMoodLabel: remoteEntry.moodLabel,
          remoteDeviceLabel: deviceLabel,
        },
        syncError: undefined,
      })
      notify(userId)
      return
    }

    // No mood conflict — auto-accept proposed and push
    await localEntryCache.saveEntry(userId, proposedFile, 'sync-pending', {
      provider: GOOGLE_DRIVE_PROVIDER,
      mergedFromDeviceId: deviceId,
      syncError: undefined,
    })
    await localEntryCache.deleteConflict(userId, date)

    try {
      const [freshMeta] = await localEntryCache.listMetadata(userId, { from: date, to: date })
      const pushResult = await adapter.saveEntry(
        proposedFile,
        freshMeta?.lastSeenRevisionId ?? undefined,
      )
      retryCounts.delete(retryKey(userId, date))
      await markStatus(userId, date, {
        provider: GOOGLE_DRIVE_PROVIDER,
        providerFileId: pushResult.metadata.providerFileId,
        lastSeenRevisionId: pushResult.revisionId,
        lastSyncedAt: new Date().toISOString(),
        syncStatus: 'synced',
        syncError: undefined,
        moodConflict: null,
        remoteRevisionId: null,
        remoteUpdatedAt: null,
      })
      pushManifest(userId, adapter)
    } catch (pushError) {
      if (pushError instanceof GoogleDriveError && pushError.code === 'conflict' && !isRetry) {
        // Single retry of the full merge flow
        await syncOne(userId, date, true)
        return
      }
      await markStatus(userId, date, {
        provider: GOOGLE_DRIVE_PROVIDER,
        syncStatus: 'conflict',
        syncError: pushError instanceof Error ? pushError.message : 'Google Drive sync conflict.',
      })
    }
  }
}

function scheduleRetry(userId: string, date: string) {
  const key = retryKey(userId, date)
  if (scheduledRetries.has(key)) return
  const attempt = retryCounts.get(key) ?? 0
  retryCounts.set(key, attempt + 1)
  const timeout = setTimeout(() => {
    scheduledRetries.delete(key)
    void syncCoordinator.enqueue(userId, date)
  }, retryDelay(attempt))
  scheduledRetries.set(key, timeout)
}

export const syncCoordinator = {
  subscribe(listener: Listener): () => void {
    listeners.add(listener)
    return () => listeners.delete(listener)
  },

  isConnectedOnDevice(userId: string): boolean {
    const connection = getStoredGoogleDriveConnection(userId)
    return (
      !!connection && !connection.reconnectRequired && !isGoogleDriveLocallyDisconnected(userId)
    )
  },

  async enqueue(userId: string, date: string) {
    await localEntryCache.updateMetadata(userId, date, {
      provider: GOOGLE_DRIVE_PROVIDER,
      syncStatus: 'sync-pending',
      syncError: undefined,
    })
    if (processingUsers.has(userId)) {
      // syncPending already running — flag it to re-run after current batch finishes
      // so this entry isn't missed by the in-progress snapshot
      newEnqueuesWhileProcessing.add(userId)
      return
    }
    void this.syncPending(userId)
  },

  async resolveMoodConflict(
    userId: string,
    date: string,
    mood: 1 | 2 | 3 | 4 | 5 | null,
    moodLabel: string | null,
  ): Promise<void> {
    const store = await localEntryCache.getConflict(userId, date)
    if (store) {
      // Resolve through ConflictResolver: apply user's mood choice onto the proposed content
      const proposedEntry = toEntry(store.proposedFile)
      await conflictResolver.resolve(userId, date, {
        kind: 'custom',
        entry: { ...proposedEntry, mood, moodLabel },
      })
    } else {
      // Fallback for entries without a ConflictRecord (pre-migration or content-only merge)
      const entry = await localEntryCache.getEntry(userId, date)
      if (!entry) return
      const updated = { ...entry, mood, moodLabel, updatedAt: new Date().toISOString() }
      await localEntryCache.saveEntry(userId, updated, 'sync-pending', {
        moodConflict: null,
        syncError: undefined,
      })
    }
    notify(userId)
    void this.enqueue(userId, date)
  },

  async syncPending(userId: string) {
    if (processingUsers.has(userId)) return
    processingUsers.add(userId)
    newEnqueuesWhileProcessing.delete(userId)

    try {
      const pending = (await localEntryCache.listMetadata(userId)).filter(
        (item) => item.syncStatus === 'sync-pending',
      )

      for (const item of pending) {
        try {
          await syncOne(userId, item.date)
        } catch (error) {
          if (error instanceof GoogleDriveError) {
            if (error.code === 'reconnect') {
              await markStatus(userId, item.date, {
                provider: GOOGLE_DRIVE_PROVIDER,
                syncStatus: 'reconnect',
                syncError: error.message,
              })
              break
            }
            if (error.code === 'storage-full') {
              await markStatus(userId, item.date, {
                provider: GOOGLE_DRIVE_PROVIDER,
                syncStatus: 'storage-full',
                syncError: error.message,
              })
              continue
            }
            if (error.code === 'retryable') {
              scheduleRetry(userId, item.date)
              continue
            }
          }

          await markStatus(userId, item.date, {
            provider: GOOGLE_DRIVE_PROVIDER,
            syncStatus: 'sync-pending',
            syncError: error instanceof Error ? error.message : 'Google Drive sync failed.',
          })
          scheduleRetry(userId, item.date)
        }
      }
    } finally {
      processingUsers.delete(userId)
      // Re-run if new enqueues arrived while this batch was processing
      if (newEnqueuesWhileProcessing.has(userId)) {
        newEnqueuesWhileProcessing.delete(userId)
        void this.syncPending(userId)
      }
    }
  },
}
