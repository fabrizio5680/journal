import type { StorageProvider, SyncStatus } from './types'

export function syncStatusLabel(input: {
  syncStatus: SyncStatus
  storageProvider?: StorageProvider
  storageAccountEmail?: string
  appAccountEmail?: string | null
  savedLocalSuffix?: string
}) {
  const driveEmail =
    input.storageProvider === 'googleDrive' &&
    input.storageAccountEmail &&
    input.storageAccountEmail !== input.appAccountEmail
      ? ` · ${input.storageAccountEmail}`
      : ''

  switch (input.syncStatus) {
    case 'sync-pending':
      return 'Sync pending'
    case 'synced':
      return input.storageProvider === 'googleDrive'
        ? `Synced to Google Drive${driveEmail}`
        : 'Synced'
    case 'reconnect':
      return 'Reconnect Google Drive'
    case 'conflict':
      return 'Conflict needs review'
    case 'storage-full':
      return 'Provider storage full'
    case 'indexing':
      return 'Indexing your journal...'
    case 'saved-local':
    default:
      return input.savedLocalSuffix ? `Saved locally ${input.savedLocalSuffix}` : 'Saved locally'
  }
}

export function syncStatusIcon(syncStatus: SyncStatus, isOnline: boolean) {
  if (!isOnline) return 'cloud_off'
  switch (syncStatus) {
    case 'synced':
      return 'cloud_done'
    case 'sync-pending':
    case 'indexing':
      return 'sync'
    case 'reconnect':
      return 'cloud_off'
    case 'conflict':
      return 'error'
    case 'storage-full':
      return 'sd_card_alert'
    case 'saved-local':
    default:
      return 'save'
  }
}
