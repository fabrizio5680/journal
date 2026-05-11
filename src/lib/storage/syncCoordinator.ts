import { localEntryCache } from './localEntryCache'
import { GoogleDriveAdapter } from './providers/googleDriveAdapter'
import {
  getStoredGoogleDriveConnection,
  hasUsableGoogleDriveToken,
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

async function syncOne(userId: string, date: string) {
  const connection = getStoredGoogleDriveConnection(userId)
  if (!connection || connection.reconnectRequired || !hasUsableGoogleDriveToken(userId)) {
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
  const result = await adapter.saveEntry(entry, metadata?.lastSeenRevisionId ?? undefined)
  retryCounts.delete(retryKey(userId, date))
  await markStatus(userId, date, {
    provider: GOOGLE_DRIVE_PROVIDER,
    providerFileId: result.metadata.providerFileId,
    lastSeenRevisionId: result.revisionId,
    lastSyncedAt: new Date().toISOString(),
    syncStatus: 'synced',
    syncError: undefined,
  })
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
    return !!connection && !connection.reconnectRequired
  },

  async enqueue(userId: string, date: string) {
    await localEntryCache.updateMetadata(userId, date, {
      provider: GOOGLE_DRIVE_PROVIDER,
      syncStatus: 'sync-pending',
      syncError: undefined,
    })
    void this.syncPending(userId)
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
            if (error.code === 'conflict') {
              await markStatus(userId, item.date, {
                provider: GOOGLE_DRIVE_PROVIDER,
                syncStatus: 'conflict',
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
