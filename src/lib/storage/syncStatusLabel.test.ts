import { describe, expect, it } from 'vitest'

import { syncStatusIcon, syncStatusLabel } from './syncStatusLabel'

describe('syncStatusLabel', () => {
  it('renders every user-facing sync state', () => {
    expect(syncStatusLabel({ syncStatus: 'saved-local' })).toBe('Saved locally')
    expect(syncStatusLabel({ syncStatus: 'saved-local', savedLocalSuffix: '2 minutes ago' })).toBe(
      'Saved locally 2 minutes ago',
    )
    expect(syncStatusLabel({ syncStatus: 'sync-pending' })).toBe('Sync pending')
    expect(syncStatusLabel({ syncStatus: 'reconnect' })).toBe('Reconnect Google Drive')
    expect(syncStatusLabel({ syncStatus: 'conflict' })).toBe('Conflict needs review')
    expect(syncStatusLabel({ syncStatus: 'storage-full' })).toBe('Provider storage full')
    expect(syncStatusLabel({ syncStatus: 'indexing' })).toBe('Indexing your journal...')
  })

  it('includes the Drive email only when it differs from the app account', () => {
    expect(
      syncStatusLabel({
        syncStatus: 'synced',
        storageProvider: 'googleDrive',
        storageAccountEmail: 'same@example.com',
        appAccountEmail: 'same@example.com',
      }),
    ).toBe('Synced to Google Drive')

    expect(
      syncStatusLabel({
        syncStatus: 'synced',
        storageProvider: 'googleDrive',
        storageAccountEmail: 'drive@example.com',
        appAccountEmail: 'app@example.com',
      }),
    ).toBe('Synced to Google Drive · drive@example.com')
  })

  it('uses cloud_off whenever the browser is offline', () => {
    expect(syncStatusIcon('synced', false)).toBe('cloud_off')
    expect(syncStatusIcon('saved-local', false)).toBe('cloud_off')
  })

  it('maps online states to Material Symbols icon names', () => {
    expect(syncStatusIcon('saved-local', true)).toBe('save')
    expect(syncStatusIcon('sync-pending', true)).toBe('sync')
    expect(syncStatusIcon('synced', true)).toBe('cloud_done')
    expect(syncStatusIcon('reconnect', true)).toBe('cloud_off')
    expect(syncStatusIcon('conflict', true)).toBe('error')
    expect(syncStatusIcon('storage-full', true)).toBe('sd_card_alert')
    expect(syncStatusIcon('indexing', true)).toBe('sync')
  })
})
