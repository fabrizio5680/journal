import { localEntryCache } from './localEntryCache'
import { getDeviceIdentity } from './deviceIdentity'
import { mergeEntries } from './mergeEngine'
import { GoogleDriveAdapter } from './providers/googleDriveAdapter'
import {
  getStoredGoogleDriveConnection,
  isGoogleDriveLocallyDisconnected,
} from './providers/googleDriveAuth'
import { GOOGLE_DRIVE_PROVIDER, GoogleDriveError } from './providers/googleDriveTypes'

type Listener = (userId: string) => void

const processingUsers = new Set<string>()
const scheduledRetries = new Map<string, ReturnType<typeof setTimeout>>()
const retryCounts = new Map<string, number>()
const listeners = new Set<Listener>()

function retryKey(userId: string, date: string) {
  return `${userId}:${date}`
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
  if (!entry) return

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
  } catch (error) {
    if (!(error instanceof GoogleDriveError) || error.code !== 'conflict') {
      throw error
    }

    // Conflict: download remote, merge, re-push
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
      return
    }

    const { id: deviceId, label: deviceLabel } = getDeviceIdentity()
    const { merged, moodConflict } = mergeEntries(entry, remoteEntry, deviceLabel)

    // Fire-and-forget backup
    const remoteRevisionId = metadata?.remoteRevisionId ?? metadata?.lastSeenRevisionId ?? 'unknown'
    void adapter.saveConflictBackup(remoteEntry, date, remoteRevisionId)

    // Save merged locally
    await localEntryCache.saveEntry(userId, merged, 'sync-pending', {
      provider: GOOGLE_DRIVE_PROVIDER,
      mergedFromDeviceId: deviceId,
    })

    if (moodConflict) {
      // Mood conflict — don't push yet, wait for user resolution
      await markStatus(userId, date, {
        provider: GOOGLE_DRIVE_PROVIDER,
        syncStatus: 'merge-pending-mood',
        moodConflict,
        syncError: undefined,
      })
      notify(userId)
      return
    }

    // No mood conflict — push merged
    try {
      const [freshMeta] = await localEntryCache.listMetadata(userId, { from: date, to: date })
      const pushResult = await adapter.saveEntry(merged, freshMeta?.lastSeenRevisionId ?? undefined)
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
    } catch (pushError) {
      if (pushError instanceof GoogleDriveError && pushError.code === 'conflict' && !isRetry) {
        // Single retry: re-run the whole merge flow once
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
    void this.syncPending(userId)
  },

  async resolveMoodConflict(
    userId: string,
    date: string,
    mood: 1 | 2 | 3 | 4 | 5 | null,
    moodLabel: string | null,
  ): Promise<void> {
    const entry = await localEntryCache.getEntry(userId, date)
    if (!entry) return
    const updated = { ...entry, mood, moodLabel, updatedAt: new Date().toISOString() }
    await localEntryCache.saveEntry(userId, updated, 'sync-pending', {
      moodConflict: null,
      syncError: undefined,
    })
    notify(userId)
    void this.enqueue(userId, date)
  },

  async syncPending(userId: string) {
    if (processingUsers.has(userId)) return
    processingUsers.add(userId)

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
    }
  },
}
