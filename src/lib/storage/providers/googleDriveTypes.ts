export const GOOGLE_DRIVE_PROVIDER = 'googleDrive' as const
export const GOOGLE_DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file'
export const GOOGLE_DRIVE_ROOT_FOLDER_NAME = 'Quiet Dwelling'

export interface GoogleDriveTokenState {
  accessToken: string
  expiresAt: number
  scope: string
}

export interface GoogleDriveStoredConnection {
  accountEmail: string
  rootFolderId: string
  connectedAt: string
  reconnectRequired?: boolean
}

export type GoogleDriveErrorCode =
  | 'reconnect'
  | 'storage-full'
  | 'conflict'
  | 'retryable'
  | 'unknown'

export class GoogleDriveError extends Error {
  code: GoogleDriveErrorCode
  status?: number

  constructor(code: GoogleDriveErrorCode, message: string, status?: number) {
    super(message)
    this.name = 'GoogleDriveError'
    this.code = code
    this.status = status
  }
}
