import type {
  DateRange,
  EntryFile,
  EntryMetadata,
  EntryRevisionMetadata,
  ProviderConnection,
  SaveResult,
  SearchFilters,
  SearchHit,
  StorageProviderAdapter,
} from '../types'
import { toMetadata } from '../entryFormat'

import {
  getStoredGoogleDriveConnection,
  getValidGoogleDriveAccessToken,
  markGoogleDriveReconnectRequired,
  requestGoogleDriveAccessToken,
  revokeGoogleDriveAccess,
  setStoredGoogleDriveConnection,
} from './googleDriveAuth'
import {
  GOOGLE_DRIVE_PROVIDER,
  GOOGLE_DRIVE_ROOT_FOLDER_NAME,
  GoogleDriveError,
  type GoogleDriveStoredConnection,
} from './googleDriveTypes'

const DRIVE_API = 'https://www.googleapis.com/drive/v3'
const DRIVE_UPLOAD_API = 'https://www.googleapis.com/upload/drive/v3'
const FOLDER_MIME_TYPE = 'application/vnd.google-apps.folder'
const ENTRY_MIME_TYPE = 'application/json'

type FetchInit = NonNullable<Parameters<typeof fetch>[1]>

interface DriveFile {
  id: string
  name: string
  mimeType?: string
  headRevisionId?: string
  modifiedTime?: string
}

function escapeDriveQueryValue(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/'/g, "\\'")
}

function entryPathParts(date: string) {
  const [year, month] = date.split('-')
  return { year, month, fileName: `${date}.json` }
}

function metadataFromDriveFile(file: DriveFile, date: string): EntryMetadata {
  return {
    date,
    mood: null,
    moodLabel: null,
    tags: [],
    wordCount: 0,
    hasContent: true,
    updatedAt: file.modifiedTime ?? new Date().toISOString(),
    provider: GOOGLE_DRIVE_PROVIDER,
    providerFileId: file.id,
    lastSeenRevisionId: file.headRevisionId ?? null,
    lastSyncedAt: file.modifiedTime,
    syncStatus: 'synced',
    deletedAt: null,
  }
}

export class GoogleDriveAdapter implements StorageProviderAdapter {
  provider = GOOGLE_DRIVE_PROVIDER

  constructor(
    private readonly userId: string,
    private readonly loginHint?: string | null,
  ) {}

  async connect(): Promise<ProviderConnection> {
    await requestGoogleDriveAccessToken({
      userId: this.userId,
      loginHint: this.loginHint,
      prompt: 'select_account',
    })
    const accountEmail = await this.fetchAccountEmail()
    const rootFolderId = await this.ensureFolder(GOOGLE_DRIVE_ROOT_FOLDER_NAME)
    await this.ensureFolder('entries', rootFolderId)

    const connection: GoogleDriveStoredConnection = {
      accountEmail,
      rootFolderId,
      connectedAt: new Date().toISOString(),
    }
    setStoredGoogleDriveConnection(this.userId, connection)

    return {
      provider: GOOGLE_DRIVE_PROVIDER,
      accountEmail,
      rootFolderId,
      rootPath: `My Drive/${GOOGLE_DRIVE_ROOT_FOLDER_NAME}`,
      connectedAt: connection.connectedAt,
    }
  }

  async disconnect(): Promise<void> {
    await revokeGoogleDriveAccess(this.userId)
  }

  async getEntry(date: string): Promise<EntryFile | null> {
    const file = await this.findEntryFile(date)
    if (!file) return null
    return this.downloadEntryFile(file.id)
  }

  async saveEntry(entry: EntryFile, expectedRevisionId?: string): Promise<SaveResult> {
    const { monthFolderId, fileName } = await this.ensureEntryFolder(entry.date)
    const existing = await this.findFile(fileName, monthFolderId, ENTRY_MIME_TYPE)

    if (
      existing?.headRevisionId &&
      expectedRevisionId &&
      existing.headRevisionId !== expectedRevisionId
    ) {
      throw new GoogleDriveError('conflict', 'Google Drive has a newer version of this entry.')
    }

    const uploaded = existing
      ? await this.uploadFile('PATCH', `${DRIVE_UPLOAD_API}/files/${existing.id}`, entry, {
          name: fileName,
          mimeType: ENTRY_MIME_TYPE,
        })
      : await this.uploadFile('POST', `${DRIVE_UPLOAD_API}/files`, entry, {
          name: fileName,
          mimeType: ENTRY_MIME_TYPE,
          parents: [monthFolderId],
        })

    const revisionId = uploaded.headRevisionId ?? null
    return {
      metadata: {
        ...toMetadata(entry, 'synced'),
        provider: GOOGLE_DRIVE_PROVIDER,
        providerFileId: uploaded.id,
        lastSeenRevisionId: revisionId,
        lastSyncedAt: new Date().toISOString(),
      },
      revisionId,
    }
  }

  async listEntryMetadata(range?: DateRange): Promise<EntryMetadata[]> {
    const connection = this.getConnection()
    const entriesFolder = await this.ensureFolder('entries', connection.rootFolderId)
    const files = await this.listJsonFilesRecursive(entriesFolder)

    return files
      .map((file) => {
        const date = file.name.replace(/\.json$/, '')
        return metadataFromDriveFile(file, date)
      })
      .filter((item) => item.date.length === 10)
      .filter((item) => !range?.from || item.date >= range.from)
      .filter((item) => !range?.to || item.date <= range.to)
      .sort((a, b) => b.date.localeCompare(a.date))
  }

  async searchEntries(_query: string, _filters?: SearchFilters): Promise<SearchHit[]> {
    return []
  }

  async listRevisions(date: string): Promise<EntryRevisionMetadata[]> {
    const file = await this.findEntryFile(date)
    if (!file) return []
    const data = await this.driveFetch<{
      revisions?: Array<{ id: string; modifiedTime?: string }>
    }>(`${DRIVE_API}/files/${file.id}/revisions?fields=revisions(id,modifiedTime)`)
    return (data.revisions ?? []).map((revision) => ({
      revisionId: revision.id,
      updatedAt: revision.modifiedTime ?? '',
    }))
  }

  async getRevision(date: string, revisionId: string): Promise<EntryFile> {
    const file = await this.findEntryFile(date)
    if (!file) throw new Error('Entry not found in Google Drive.')
    return this.driveFetch<EntryFile>(
      `${DRIVE_API}/files/${file.id}/revisions/${revisionId}?alt=media`,
    )
  }

  private getConnection(): GoogleDriveStoredConnection {
    const connection = getStoredGoogleDriveConnection(this.userId)
    if (!connection?.rootFolderId) {
      throw new GoogleDriveError('reconnect', 'Google Drive is not connected.')
    }
    return connection
  }

  private async fetchAccountEmail(): Promise<string> {
    const about = await this.driveFetch<{ user?: { emailAddress?: string } }>(
      `${DRIVE_API}/about?fields=user(emailAddress)`,
    )
    return about.user?.emailAddress ?? 'Google Drive account'
  }

  private async ensureEntryFolder(date: string) {
    const connection = this.getConnection()
    const entriesFolderId = await this.ensureFolder('entries', connection.rootFolderId)
    const { year, month, fileName } = entryPathParts(date)
    const yearFolderId = await this.ensureFolder(year, entriesFolderId)
    const monthFolderId = await this.ensureFolder(month, yearFolderId)
    return { monthFolderId, fileName }
  }

  private async findEntryFile(date: string): Promise<DriveFile | null> {
    const { monthFolderId, fileName } = await this.ensureEntryFolder(date)
    return this.findFile(fileName, monthFolderId, ENTRY_MIME_TYPE)
  }

  private async ensureFolder(name: string, parentId?: string): Promise<string> {
    const existing = await this.findFile(name, parentId, FOLDER_MIME_TYPE)
    if (existing) return existing.id

    const file = await this.driveFetch<DriveFile>(`${DRIVE_API}/files?fields=id`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name,
        mimeType: FOLDER_MIME_TYPE,
        ...(parentId ? { parents: [parentId] } : {}),
      }),
    })
    return file.id
  }

  private async findFile(
    name: string,
    parentId?: string,
    mimeType?: string,
  ): Promise<DriveFile | null> {
    const query = [
      `name = '${escapeDriveQueryValue(name)}'`,
      'trashed = false',
      parentId ? `'${escapeDriveQueryValue(parentId)}' in parents` : undefined,
      mimeType ? `mimeType = '${escapeDriveQueryValue(mimeType)}'` : undefined,
    ]
      .filter(Boolean)
      .join(' and ')

    const params = new URLSearchParams({
      q: query,
      spaces: 'drive',
      fields: 'files(id,name,mimeType,headRevisionId,modifiedTime)',
      pageSize: '1',
    })
    const data = await this.driveFetch<{ files?: DriveFile[] }>(`${DRIVE_API}/files?${params}`)
    return data.files?.[0] ?? null
  }

  private async listJsonFilesRecursive(parentId: string): Promise<DriveFile[]> {
    const children = await this.listChildren(parentId)
    const files = children.filter((item) => item.mimeType === ENTRY_MIME_TYPE)
    const folders = children.filter((item) => item.mimeType === FOLDER_MIME_TYPE)
    const nested = await Promise.all(
      folders.map((folder) => this.listJsonFilesRecursive(folder.id)),
    )
    return files.concat(nested.flat())
  }

  private async listChildren(parentId: string): Promise<DriveFile[]> {
    const files: DriveFile[] = []
    let pageToken: string | undefined

    do {
      const params = new URLSearchParams({
        q: `'${escapeDriveQueryValue(parentId)}' in parents and trashed = false`,
        spaces: 'drive',
        fields: 'nextPageToken,files(id,name,mimeType,headRevisionId,modifiedTime)',
        pageSize: '100',
      })
      if (pageToken) params.set('pageToken', pageToken)
      const data = await this.driveFetch<{ nextPageToken?: string; files?: DriveFile[] }>(
        `${DRIVE_API}/files?${params}`,
      )
      files.push(...(data.files ?? []))
      pageToken = data.nextPageToken
    } while (pageToken)

    return files
  }

  private async downloadEntryFile(fileId: string): Promise<EntryFile> {
    return this.driveFetch<EntryFile>(`${DRIVE_API}/files/${fileId}?alt=media`)
  }

  private async uploadFile(
    method: 'POST' | 'PATCH',
    url: string,
    entry: EntryFile,
    metadata: { name: string; mimeType: string; parents?: string[] },
  ): Promise<DriveFile> {
    const boundary = `quiet_dwelling_${crypto.randomUUID()}`
    const body = [
      `--${boundary}`,
      'Content-Type: application/json; charset=UTF-8',
      '',
      JSON.stringify(metadata),
      `--${boundary}`,
      'Content-Type: application/json; charset=UTF-8',
      '',
      JSON.stringify(entry),
      `--${boundary}--`,
      '',
    ].join('\r\n')
    const params = new URLSearchParams({
      uploadType: 'multipart',
      fields: 'id,name,headRevisionId,modifiedTime',
    })

    return this.driveFetch<DriveFile>(`${url}?${params}`, {
      method,
      headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
      body,
    })
  }

  private async driveFetch<T>(url: string, init: FetchInit = {}): Promise<T> {
    const accessToken = getValidGoogleDriveAccessToken(this.userId)
    if (!accessToken) {
      markGoogleDriveReconnectRequired(this.userId)
      throw new GoogleDriveError('reconnect', 'Google Drive needs to be reconnected.')
    }

    const response = await fetch(url, {
      ...init,
      headers: {
        ...init.headers,
        Authorization: `Bearer ${accessToken}`,
      },
    })

    if (!response.ok) {
      await this.handleErrorResponse(response)
    }

    if (response.status === 204) return undefined as T
    return response.json() as Promise<T>
  }

  private async handleErrorResponse(response: Response): Promise<never> {
    const status = response.status
    let reason = ''
    let message = response.statusText

    try {
      const body = (await response.json()) as {
        error?: { message?: string; errors?: Array<{ reason?: string }> }
      }
      reason = body.error?.errors?.[0]?.reason ?? ''
      message = body.error?.message ?? message
    } catch {
      // Keep status text when Drive does not return JSON.
    }

    if (status === 401) {
      markGoogleDriveReconnectRequired(this.userId)
      throw new GoogleDriveError('reconnect', message, status)
    }
    if (reason === 'storageQuotaExceeded' || reason === 'quotaExceeded') {
      throw new GoogleDriveError('storage-full', message, status)
    }
    if (status === 429 || status >= 500) {
      throw new GoogleDriveError('retryable', message, status)
    }

    throw new GoogleDriveError('unknown', message, status)
  }
}
