import { doc, onSnapshot, serverTimestamp, setDoc, type DocumentData } from 'firebase/firestore'

import { setDriveLoadProgress } from './driveLoadProgress'
import { EntryRepository } from './entryRepository'
import { localEntryCache } from './localEntryCache'
import { pollDriveDeltas } from './deltaPoll'
import { GoogleDriveAdapter } from './providers/googleDriveAdapter'
import {
  clearGoogleDriveAuthState,
  getStoredGoogleDriveConnection,
  hydrateGoogleDriveConnectionFromMetadata,
  isGoogleDriveLocallyDisconnected,
  setStoredGoogleDriveConnection,
} from './providers/googleDriveAuth'
import { GOOGLE_DRIVE_PROVIDER } from './providers/googleDriveTypes'
import { syncCoordinator } from './syncCoordinator'
import type { EntryFile, EntryMetadata, StorageProvider } from './types'

import { db } from '@/lib/firebase'

export interface ProviderMetadata {
  activeStorageProvider?: Extract<StorageProvider, 'googleDrive'>
  storageAccountEmail?: string
  storageRootFolderId?: string
  storageConnectedAt?: string
  storageTokenStatus?: 'valid' | 'reconnect'
}

export interface ProviderConnectionState extends ProviderMetadata {
  status: 'disconnected' | 'connected' | 'reconnect'
  deviceConnected: boolean
}

function timestampToIso(value: unknown): string | undefined {
  if (!value) return undefined
  if (typeof value === 'string') return value
  if (typeof value === 'object' && 'toDate' in value && typeof value.toDate === 'function') {
    return value.toDate().toISOString()
  }
  return undefined
}

function metadataFromDoc(data: DocumentData | undefined): ProviderMetadata {
  return {
    activeStorageProvider: data?.activeStorageProvider,
    storageAccountEmail: data?.storageAccountEmail,
    storageRootFolderId: data?.storageRootFolderId,
    storageConnectedAt: timestampToIso(data?.storageConnectedAt),
    storageTokenStatus: data?.storageTokenStatus,
  }
}

function isEntryFile(value: unknown): value is EntryFile {
  if (!value || typeof value !== 'object') return false
  const entry = value as Partial<EntryFile>
  return (
    entry.schemaVersion === 1 &&
    entry.app === 'quiet-dwelling' &&
    typeof entry.date === 'string' &&
    entry.date.length === 10 &&
    typeof entry.content === 'object' &&
    entry.content !== null &&
    typeof entry.searchText === 'string' &&
    (entry.mood === null ||
      entry.mood === 1 ||
      entry.mood === 2 ||
      entry.mood === 3 ||
      entry.mood === 4 ||
      entry.mood === 5) &&
    (entry.moodLabel === null || typeof entry.moodLabel === 'string') &&
    Array.isArray(entry.tags) &&
    Array.isArray(entry.scriptureRefs) &&
    typeof entry.wordCount === 'number' &&
    typeof entry.createdAt === 'string' &&
    typeof entry.updatedAt === 'string'
  )
}

async function saveProviderMetadataOnly(userId: string, item: EntryMetadata) {
  const updated = await localEntryCache.updateMetadata(userId, item.date, {
    provider: GOOGLE_DRIVE_PROVIDER,
    providerFileId: item.providerFileId,
    lastSeenRevisionId: item.lastSeenRevisionId,
    lastSyncedAt: item.lastSyncedAt,
    syncStatus: 'synced',
    syncError: undefined,
  })
  if (!updated) await localEntryCache.saveMetadata(userId, item)
}

export function getDeviceProviderState(userId: string, metadata: ProviderMetadata) {
  const isDriveActive = metadata.activeStorageProvider === GOOGLE_DRIVE_PROVIDER
  const isLocallyDisconnected = isGoogleDriveLocallyDisconnected(userId)
  if (
    isDriveActive &&
    !isLocallyDisconnected &&
    metadata.storageAccountEmail &&
    metadata.storageRootFolderId &&
    metadata.storageConnectedAt
  ) {
    hydrateGoogleDriveConnectionFromMetadata(userId, {
      accountEmail: metadata.storageAccountEmail,
      rootFolderId: metadata.storageRootFolderId,
      connectedAt: metadata.storageConnectedAt,
    })
  }
  const hydratedLocal = getStoredGoogleDriveConnection(userId)
  const isDeviceConnected =
    isDriveActive &&
    !isLocallyDisconnected &&
    !!metadata.storageRootFolderId &&
    !hydratedLocal?.reconnectRequired
  const requiresReconnect =
    isDriveActive &&
    (metadata.storageTokenStatus === 'reconnect' ||
      !metadata.storageRootFolderId ||
      hydratedLocal?.reconnectRequired)

  return {
    ...metadata,
    status:
      !isDriveActive || isLocallyDisconnected
        ? 'disconnected'
        : requiresReconnect
          ? 'reconnect'
          : 'connected',
    deviceConnected: isDeviceConnected,
  } satisfies ProviderConnectionState
}

export function subscribeProviderConnection(
  userId: string,
  onChange: (state: ProviderConnectionState) => void,
  onError?: () => void,
): () => void {
  return onSnapshot(
    doc(db, 'users', userId),
    (snapshot) => {
      onChange(getDeviceProviderState(userId, metadataFromDoc(snapshot.data())))
    },
    () => {
      onError?.()
      onChange({ status: 'disconnected', deviceConnected: false })
    },
  )
}

export async function connectGoogleDriveProvider(userId: string, loginHint?: string | null) {
  const adapter = new GoogleDriveAdapter(userId, loginHint)
  const connection = await adapter.connect()

  await setDoc(
    doc(db, 'users', userId),
    {
      activeStorageProvider: GOOGLE_DRIVE_PROVIDER,
      storageAccountEmail: connection.accountEmail,
      storageRootFolderId: connection.rootFolderId,
      storageConnectedAt: serverTimestamp(),
      storageTokenStatus: 'valid',
    },
    { merge: true },
  )

  setStoredGoogleDriveConnection(userId, {
    accountEmail: connection.accountEmail,
    rootFolderId: connection.rootFolderId ?? '',
    connectedAt: connection.connectedAt,
  })

  void backfillGoogleDriveMetadata(userId)
  void syncCoordinator.syncPending(userId)

  return connection
}

export function initDriveSyncListeners(userId: string): () => void {
  function runSync() {
    void syncCoordinator.syncPending(userId)
    void pollDriveDeltas(userId)
  }

  // Boot resume
  runSync()

  function handleOnline() {
    runSync()
  }

  function handleVisibilityChange() {
    if (!document.hidden) runSync()
  }

  function handlePageShow() {
    runSync()
  }

  if (typeof window !== 'undefined') {
    window.addEventListener('online', handleOnline)
    document.addEventListener('visibilitychange', handleVisibilityChange)
    window.addEventListener('pageshow', handlePageShow)
  }

  return () => {
    if (typeof window !== 'undefined') {
      window.removeEventListener('online', handleOnline)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      window.removeEventListener('pageshow', handlePageShow)
    }
  }
}

export async function disconnectGoogleDriveProvider(userId: string) {
  const adapter = new GoogleDriveAdapter(userId)
  await adapter.disconnect()
  clearGoogleDriveAuthState(userId)
}

export async function backfillGoogleDriveMetadata(userId: string) {
  const adapter = new GoogleDriveAdapter(userId)

  setDriveLoadProgress({ loaded: 0, total: 0 })
  try {
    const metadata = await adapter.listEntryMetadata()

    const total = metadata.length
    let loaded = 0
    setDriveLoadProgress({ loaded, total })

    for (const item of metadata) {
      // Hydrate guard: preserve in-flight local dirty entries
      const [existingMeta] = await localEntryCache.listMetadata(userId, {
        from: item.date,
        to: item.date,
      })
      const isDirty = existingMeta && existingMeta.syncStatus !== 'synced'
      if (isDirty) {
        setDriveLoadProgress({ loaded: ++loaded, total })
        continue
      }

      try {
        if (!item.providerFileId) throw new Error('Google Drive file id is missing.')
        const entry = await adapter.getEntryByFileId(item.providerFileId)
        if (!isEntryFile(entry)) throw new Error('Google Drive entry file is invalid.')

        await localEntryCache.saveEntry(userId, entry, 'synced', {
          provider: GOOGLE_DRIVE_PROVIDER,
          providerFileId: item.providerFileId,
          lastSeenRevisionId: item.lastSeenRevisionId,
          lastSyncedAt: item.lastSyncedAt ?? new Date().toISOString(),
          syncStatus: 'synced',
          syncError: undefined,
        })
      } catch {
        await saveProviderMetadataOnly(userId, item)
      }
      setDriveLoadProgress({ loaded: ++loaded, total })
    }

    EntryRepository.notifyChanged(userId)
  } finally {
    setDriveLoadProgress(null)
  }
}

// E2E helper: expose backfill for Playwright tests
if (import.meta.env.VITE_USE_EMULATOR === 'true' && typeof window !== 'undefined') {
  ;(
    window as typeof window & {
      __backfillForTest?: (userId: string) => Promise<void>
    }
  ).__backfillForTest = (userId: string) => backfillGoogleDriveMetadata(userId)
}
