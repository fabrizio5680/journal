import {
  deleteField,
  doc,
  onSnapshot,
  serverTimestamp,
  setDoc,
  updateDoc,
  type DocumentData,
} from 'firebase/firestore'

import { localEntryCache } from './localEntryCache'
import { GoogleDriveAdapter } from './providers/googleDriveAdapter'
import {
  clearGoogleDriveAuthState,
  getStoredGoogleDriveConnection,
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
  }
}

export function getDeviceProviderState(userId: string, metadata: ProviderMetadata) {
  const local = getStoredGoogleDriveConnection(userId)
  const isDriveActive = metadata.activeStorageProvider === GOOGLE_DRIVE_PROVIDER
  const isDeviceConnected =
    isDriveActive &&
    !!local &&
    local.rootFolderId === metadata.storageRootFolderId &&
    !local.reconnectRequired

  return {
    ...metadata,
    status: !isDriveActive ? 'disconnected' : isDeviceConnected ? 'connected' : 'reconnect',
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

  await updateDoc(doc(db, 'users', userId), {
    activeStorageProvider: deleteField(),
    storageAccountEmail: deleteField(),
    storageRootFolderId: deleteField(),
    storageConnectedAt: deleteField(),
  })
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
