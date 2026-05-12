import { doc, onSnapshot, serverTimestamp, setDoc, type DocumentData } from 'firebase/firestore'

import { localEntryCache } from './localEntryCache'
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
import type { StorageProvider } from './types'

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

export async function disconnectGoogleDriveProvider(userId: string) {
  const adapter = new GoogleDriveAdapter(userId)
  await adapter.disconnect()
  clearGoogleDriveAuthState(userId)
}

export async function backfillGoogleDriveMetadata(userId: string) {
  const adapter = new GoogleDriveAdapter(userId)
  const metadata = await adapter.listEntryMetadata()

  await Promise.all(
    metadata.map(async (item) => {
      const updated = await localEntryCache.updateMetadata(userId, item.date, {
        provider: GOOGLE_DRIVE_PROVIDER,
        providerFileId: item.providerFileId,
        lastSeenRevisionId: item.lastSeenRevisionId,
        lastSyncedAt: item.lastSyncedAt,
        syncStatus: 'synced',
        syncError: undefined,
      })
      if (!updated) await localEntryCache.saveMetadata(userId, item)
    }),
  )
}
