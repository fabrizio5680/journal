import { describe, expect, it, beforeEach } from 'vitest'

// The MemoryEntryCache is used in test environment (no real IndexedDB in jsdom).
// localEntryCache is a MemoryEntryCache when IndexedDB is unavailable.
import { localEntryCache } from './localEntryCache'
import type { EntryFile } from './types'

const USER_ID = 'sync-state-test-uid'

function makeEntry(date: string, text = 'Hello world'): EntryFile {
  return {
    schemaVersion: 1,
    app: 'quiet-dwelling',
    date,
    content: { type: 'doc', content: [] },
    searchText: text,
    mood: null,
    moodLabel: null,
    tags: [],
    scriptureRefs: [],
    wordCount: text.trim().split(/\s+/).length,
    createdAt: `${date}T00:00:00.000Z`,
    updatedAt: `${date}T00:00:00.000Z`,
  }
}

describe('localEntryCache syncState store', () => {
  beforeEach(async () => {
    // Clear any lingering syncState by setting it to defaults
    await localEntryCache.setSyncState(USER_ID, {
      driveStartPageToken: null,
      driveEntriesFolderId: null,
      monthFolderIds: [],
      lastDeltaPollAt: null,
    })
    // Actually clear by getting a fresh state — simulate fresh start
    // by relying on the fact that MemoryEntryCache starts fresh per module import
  })

  it('getSyncState returns null when not set (using a fresh user ID)', async () => {
    const freshUserId = `fresh-user-${Date.now()}`
    const result = await localEntryCache.getSyncState(freshUserId)
    expect(result).toBeNull()
  })

  it('setSyncState partial patch merges with existing state (does not wipe unset fields)', async () => {
    const testUserId = `partial-patch-${Date.now()}`

    // Set initial state with all fields
    await localEntryCache.setSyncState(testUserId, {
      driveStartPageToken: 'token-abc',
      driveEntriesFolderId: 'folder-xyz',
      monthFolderIds: ['jan', 'feb'],
      lastDeltaPollAt: '2026-05-01T00:00:00.000Z',
    })

    // Patch only one field
    await localEntryCache.setSyncState(testUserId, {
      driveStartPageToken: 'new-token',
    })

    const state = await localEntryCache.getSyncState(testUserId)
    expect(state).not.toBeNull()
    // Updated field
    expect(state?.driveStartPageToken).toBe('new-token')
    // Other fields should be preserved
    expect(state?.driveEntriesFolderId).toBe('folder-xyz')
    expect(state?.lastDeltaPollAt).toBe('2026-05-01T00:00:00.000Z')
  })

  it('setSyncState with null values stores nulls', async () => {
    const testUserId = `null-values-${Date.now()}`

    await localEntryCache.setSyncState(testUserId, {
      driveStartPageToken: 'token-to-clear',
    })

    await localEntryCache.setSyncState(testUserId, {
      driveStartPageToken: null,
    })

    const state = await localEntryCache.getSyncState(testUserId)
    expect(state?.driveStartPageToken).toBeNull()
  })

  it('setSyncState preserves userId field', async () => {
    const testUserId = `userId-test-${Date.now()}`

    await localEntryCache.setSyncState(testUserId, {
      driveStartPageToken: 'token-abc',
    })

    const state = await localEntryCache.getSyncState(testUserId)
    expect(state?.userId).toBe(testUserId)
  })

  it('setSyncState initializes with defaults when no prior state exists', async () => {
    const testUserId = `defaults-test-${Date.now()}`

    await localEntryCache.setSyncState(testUserId, { driveStartPageToken: 'initial' })

    const state = await localEntryCache.getSyncState(testUserId)
    expect(state?.driveEntriesFolderId).toBeNull()
    expect(state?.monthFolderIds).toEqual([])
    expect(state?.lastDeltaPollAt).toBeNull()
  })
})

describe('localEntryCache entry generations', () => {
  it('saveEntry persists and increments localGen', async () => {
    const userId = `gen-save-${Date.now()}`
    const date = '2026-05-11'

    await localEntryCache.saveEntry(userId, makeEntry(date, 'first'), 'saved-local')
    expect((await localEntryCache.getEntrySnapshot(userId, date)).localGen).toBe(1)

    await localEntryCache.saveEntry(userId, makeEntry(date, 'second'), 'saved-local')
    expect((await localEntryCache.getEntrySnapshot(userId, date)).localGen).toBe(2)
  })

  it('commitEntry returns stale when baseGen is older than the stored generation', async () => {
    const userId = `gen-stale-${Date.now()}`
    const date = '2026-05-12'

    await localEntryCache.saveEntry(userId, makeEntry(date, 'current'), 'saved-local')
    const result = await localEntryCache.commitEntry(
      userId,
      makeEntry(date, 'stale'),
      'saved-local',
      {
        baseGen: 0,
      },
    )

    expect(result).toMatchObject({ kind: 'stale', currentGen: 1 })
    expect((await localEntryCache.getEntry(userId, date))?.searchText).toBe('current')
  })
})
