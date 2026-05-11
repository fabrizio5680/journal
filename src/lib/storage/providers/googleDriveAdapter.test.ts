import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { EntryFile } from '../types'

import { GoogleDriveAdapter } from './googleDriveAdapter'
import { GoogleDriveError } from './googleDriveTypes'

const USER_ID = 'test-uid'

function makeEntry(): EntryFile {
  return {
    schemaVersion: 1,
    app: 'quiet-dwelling',
    date: '2026-04-13',
    content: { type: 'doc', content: [] },
    searchText: 'A quiet test',
    mood: null,
    moodLabel: null,
    tags: [],
    scriptureRefs: [],
    wordCount: 3,
    createdAt: '2026-04-13T00:00:00.000Z',
    updatedAt: '2026-04-13T00:00:00.000Z',
  }
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function seedDriveState() {
  localStorage.setItem(
    `google_drive_token_${USER_ID}`,
    JSON.stringify({
      accessToken: 'access-token',
      expiresAt: Date.now() + 120_000,
      scope: 'https://www.googleapis.com/auth/drive.file',
    }),
  )
  localStorage.setItem(
    `google_drive_connection_${USER_ID}`,
    JSON.stringify({
      accountEmail: 'drive@example.com',
      rootFolderId: 'root-folder',
      connectedAt: '2026-04-13T00:00:00.000Z',
    }),
  )
}

function mockFetchSequence(responses: Response[]) {
  const fetchMock = vi.fn(async () => {
    const response = responses.shift()
    if (!response) throw new Error('No mocked response left.')
    return response
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

describe('GoogleDriveAdapter', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    localStorage.clear()
    seedDriveState()
  })

  it('creates missing folders and uploads a new entry JSON file', async () => {
    const fetchMock = mockFetchSequence([
      jsonResponse({ files: [] }),
      jsonResponse({ id: 'entries-folder' }),
      jsonResponse({ files: [] }),
      jsonResponse({ id: 'year-folder' }),
      jsonResponse({ files: [] }),
      jsonResponse({ id: 'month-folder' }),
      jsonResponse({ files: [] }),
      jsonResponse({ id: 'entry-file', headRevisionId: 'revision-1' }),
    ])

    const result = await new GoogleDriveAdapter(USER_ID).saveEntry(makeEntry())

    expect(result.revisionId).toBe('revision-1')
    expect(result.metadata.providerFileId).toBe('entry-file')
    const uploadCall = fetchMock.mock.calls[fetchMock.mock.calls.length - 1] as unknown[]
    const uploadUrl = uploadCall[0] as string
    const uploadInit = uploadCall[1] as { method?: string; body?: unknown }
    expect(uploadUrl).toContain('/upload/drive/v3/files')
    expect(uploadUrl).toContain('uploadType=multipart')
    expect(uploadInit.method).toBe('POST')
    expect(String(uploadInit.body)).toContain('"name":"2026-04-13.json"')
    expect(String(uploadInit.body)).toContain('"app":"quiet-dwelling"')
  })

  it('updates an existing entry when the expected revision still matches', async () => {
    const fetchMock = mockFetchSequence([
      jsonResponse({ files: [{ id: 'entries-folder', name: 'entries' }] }),
      jsonResponse({ files: [{ id: 'year-folder', name: '2026' }] }),
      jsonResponse({ files: [{ id: 'month-folder', name: '04' }] }),
      jsonResponse({
        files: [{ id: 'entry-file', name: '2026-04-13.json', headRevisionId: 'revision-1' }],
      }),
      jsonResponse({ id: 'entry-file', headRevisionId: 'revision-2' }),
    ])

    const result = await new GoogleDriveAdapter(USER_ID).saveEntry(makeEntry(), 'revision-1')

    expect(result.revisionId).toBe('revision-2')
    const uploadCall = fetchMock.mock.calls[fetchMock.mock.calls.length - 1] as unknown[]
    const uploadUrl = uploadCall[0] as string
    const uploadInit = uploadCall[1] as { method?: string; body?: unknown }
    expect(uploadUrl).toContain('/upload/drive/v3/files/entry-file')
    expect(uploadInit.method).toBe('PATCH')
  })

  it('detects revision conflicts before upload', async () => {
    mockFetchSequence([
      jsonResponse({ files: [{ id: 'entries-folder', name: 'entries' }] }),
      jsonResponse({ files: [{ id: 'year-folder', name: '2026' }] }),
      jsonResponse({ files: [{ id: 'month-folder', name: '04' }] }),
      jsonResponse({
        files: [{ id: 'entry-file', name: '2026-04-13.json', headRevisionId: 'revision-2' }],
      }),
    ])

    await expect(
      new GoogleDriveAdapter(USER_ID).saveEntry(makeEntry(), 'revision-1'),
    ).rejects.toMatchObject({ code: 'conflict' })
  })

  it('maps 401 responses to reconnect and marks local connection state', async () => {
    mockFetchSequence([jsonResponse({ error: { message: 'Unauthorized' } }, 401)])

    await expect(new GoogleDriveAdapter(USER_ID).listEntryMetadata()).rejects.toMatchObject({
      code: 'reconnect',
    })
    expect(localStorage.getItem(`google_drive_connection_${USER_ID}`)).toContain(
      '"reconnectRequired":true',
    )
  })

  it('maps Drive storage quota errors to storage-full', async () => {
    mockFetchSequence([
      jsonResponse({ files: [{ id: 'entries-folder', name: 'entries' }] }),
      jsonResponse({ files: [{ id: 'year-folder', name: '2026' }] }),
      jsonResponse({ files: [{ id: 'month-folder', name: '04' }] }),
      jsonResponse({ files: [] }),
      jsonResponse(
        {
          error: {
            message: 'Storage quota exceeded',
            errors: [{ reason: 'storageQuotaExceeded' }],
          },
        },
        403,
      ),
    ])

    await expect(new GoogleDriveAdapter(USER_ID).saveEntry(makeEntry())).rejects.toMatchObject({
      code: 'storage-full',
      name: GoogleDriveError.name,
    })
  })
})
