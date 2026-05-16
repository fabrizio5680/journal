import { createHash } from 'node:crypto'

import { onSchedule } from 'firebase-functions/v2/scheduler'
import { HttpsError, onCall } from 'firebase-functions/v2/https'
import { defineSecret, defineString } from 'firebase-functions/params'
import { initializeApp, getApps } from 'firebase-admin/app'
import { getFirestore, FieldValue } from 'firebase-admin/firestore'
import { getMessaging } from 'firebase-admin/messaging'
import { format } from 'date-fns'
import { toZonedTime } from 'date-fns-tz'

if (getApps().length === 0) {
  initializeApp()
}

const APP_BASE_URL = 'https://thequietdwelling.com'

const FUNCTIONS_REGION = 'europe-west2'
const GOOGLE_DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file'
const GOOGLE_DRIVE_ROOT_FOLDER_NAME = 'Quiet Dwelling'
const GOOGLE_OAUTH_REDIRECT_URI = 'postmessage'
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token'
const GOOGLE_DRIVE_API = 'https://www.googleapis.com/drive/v3'
const FOLDER_MIME_TYPE = 'application/vnd.google-apps.folder'

const GOOGLE_CLIENT_ID = defineString('GOOGLE_CLIENT_ID')
const GOOGLE_CLIENT_SECRET = defineSecret('GOOGLE_CLIENT_SECRET')

interface GoogleTokenResponse {
  access_token?: string
  expires_in?: number
  refresh_token?: string
  scope?: string
  error?: string
  error_description?: string
}

interface DriveFile {
  id: string
  name?: string
}

type GoogleFetchInit = NonNullable<Parameters<typeof fetch>[1]>

function googleClientId() {
  const clientId = GOOGLE_CLIENT_ID.value() || process.env.GOOGLE_CLIENT_ID
  if (!clientId) {
    throw new HttpsError('failed-precondition', 'Google Drive OAuth client is not configured.')
  }
  return clientId
}

function googleClientSecret() {
  const secret = GOOGLE_CLIENT_SECRET.value() || process.env.GOOGLE_CLIENT_SECRET
  if (!secret) {
    throw new HttpsError('failed-precondition', 'Google Drive OAuth secret is not configured.')
  }
  return secret
}

function googleDriveOAuthRef(uid: string) {
  return getFirestore().collection('users').doc(uid).collection('private').doc('googleDriveOAuth')
}

function escapeDriveQueryValue(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/'/g, "\\'")
}

async function parseGoogleResponse<T>(response: Response): Promise<T> {
  const data = (await response.json()) as T & {
    error?: { message?: string }
    error_description?: string
  }
  if (!response.ok) {
    const message =
      data.error_description ??
      (typeof data.error === 'object' ? data.error.message : undefined) ??
      response.statusText
    throw new HttpsError('internal', message)
  }
  return data
}

async function exchangeCodeForTokens(code: string): Promise<GoogleTokenResponse> {
  const body = new URLSearchParams({
    code,
    client_id: googleClientId(),
    client_secret: googleClientSecret(),
    redirect_uri: GOOGLE_OAUTH_REDIRECT_URI,
    grant_type: 'authorization_code',
  })

  const tokens = await parseGoogleResponse<GoogleTokenResponse>(
    await fetch(GOOGLE_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    }),
  )

  if (!tokens.access_token) {
    throw new HttpsError('failed-precondition', 'Google Drive did not return an access token.')
  }
  if (!tokens.scope?.split(' ').includes(GOOGLE_DRIVE_SCOPE)) {
    throw new HttpsError('permission-denied', 'Google Drive permission was not granted.')
  }

  return tokens
}

async function refreshAccessToken(uid: string): Promise<{
  accessToken: string
  expiresAt: number
  scope: string
}> {
  const oauthRef = googleDriveOAuthRef(uid)
  const snap = await oauthRef.get()
  const refreshToken = snap.get('refreshToken') as string | undefined

  if (!refreshToken) {
    await getFirestore().collection('users').doc(uid).set(
      {
        storageTokenStatus: 'reconnect',
        storageTokenErrorAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    )
    throw new HttpsError('failed-precondition', 'Google Drive needs to be reconnected.')
  }

  const body = new URLSearchParams({
    refresh_token: refreshToken,
    client_id: googleClientId(),
    client_secret: googleClientSecret(),
    grant_type: 'refresh_token',
  })

  let tokens: GoogleTokenResponse
  try {
    tokens = await parseGoogleResponse<GoogleTokenResponse>(
      await fetch(GOOGLE_TOKEN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body,
      }),
    )
  } catch (error) {
    await getFirestore().collection('users').doc(uid).set(
      {
        storageTokenStatus: 'reconnect',
        storageTokenErrorAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    )
    throw error
  }

  if (!tokens.access_token) {
    throw new HttpsError('failed-precondition', 'Google Drive did not return an access token.')
  }

  await getFirestore().collection('users').doc(uid).set(
    {
      storageTokenStatus: 'valid',
      storageTokenRefreshedAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  )

  return {
    accessToken: tokens.access_token,
    expiresAt: Date.now() + (tokens.expires_in ?? 3600) * 1000,
    scope: tokens.scope ?? GOOGLE_DRIVE_SCOPE,
  }
}

async function driveFetch<T>(accessToken: string, path: string, init: GoogleFetchInit = {}) {
  return parseGoogleResponse<T>(
    await fetch(`${GOOGLE_DRIVE_API}${path}`, {
      ...init,
      headers: {
        ...init.headers,
        Authorization: `Bearer ${accessToken}`,
      },
    }),
  )
}

async function findDriveFolder(
  accessToken: string,
  name: string,
  parentId?: string,
): Promise<DriveFile | null> {
  const query = [
    `name = '${escapeDriveQueryValue(name)}'`,
    'trashed = false',
    `mimeType = '${FOLDER_MIME_TYPE}'`,
    parentId ? `'${escapeDriveQueryValue(parentId)}' in parents` : undefined,
  ]
    .filter(Boolean)
    .join(' and ')
  const params = new URLSearchParams({
    q: query,
    spaces: 'drive',
    fields: 'files(id,name)',
    pageSize: '1',
  })
  const data = await driveFetch<{ files?: DriveFile[] }>(accessToken, `/files?${params}`)
  return data.files?.[0] ?? null
}

async function ensureDriveFolder(accessToken: string, name: string, parentId?: string) {
  const existing = await findDriveFolder(accessToken, name, parentId)
  if (existing) return existing.id

  const created = await driveFetch<DriveFile>(accessToken, '/files?fields=id', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name,
      mimeType: FOLDER_MIME_TYPE,
      ...(parentId ? { parents: [parentId] } : {}),
    }),
  })
  return created.id
}

async function fetchDriveAccountEmail(accessToken: string): Promise<string> {
  const about = await driveFetch<{ user?: { emailAddress?: string } }>(
    accessToken,
    '/about?fields=user(emailAddress)',
  )
  return about.user?.emailAddress ?? 'Google Drive account'
}

function requireAuth(request: { auth?: { uid?: string } }) {
  const uid = request.auth?.uid
  if (!uid) throw new HttpsError('unauthenticated', 'User must be signed in.')
  return uid
}

/** Returns true if currentHHMM falls within the 60-minute window starting at reminderHHMM. */
export function isWithinReminderWindow(currentHHMM: string, reminderHHMM: string): boolean {
  const [rHH, rMM] = reminderHHMM.split(':').map(Number)
  const [cHH, cMM] = currentHHMM.split(':').map(Number)
  if (Number.isNaN(rHH) || Number.isNaN(rMM) || Number.isNaN(cHH) || Number.isNaN(cMM)) {
    return false
  }
  const minutesSinceReminder = cHH * 60 + cMM - (rHH * 60 + rMM)
  return minutesSinceReminder >= 0 && minutesSinceReminder < 60
}

/** Builds a data-only FCM message for a given token. Data-only (no notification key) prevents
 *  the browser from auto-displaying a notification while the service worker also calls
 *  showNotification(), which would produce a double notification on Android Chrome PWA. */
export function buildReminderMessage(token: string, baseUrl: string) {
  return {
    token,
    data: {
      title: 'Time to reflect ✨',
      body: 'Your sanctuary is waiting.',
      icon: `${baseUrl}/icons/web-app-manifest-192x192.png`,
      link: `${baseUrl}/`,
    },
  }
}

export function logSafeUserId(uid: string) {
  return createHash('sha256').update(uid).digest('hex').slice(0, 12)
}

export async function handleExchangeGoogleDriveCode(request: {
  auth?: { uid?: string }
  data?: { code?: unknown }
}) {
  const uid = requireAuth(request)
  const code = typeof request.data?.code === 'string' ? request.data.code : ''
  if (!code) throw new HttpsError('invalid-argument', 'Google authorization code is required.')

  const tokens = await exchangeCodeForTokens(code)
  const existingRefreshTokenSnap = await googleDriveOAuthRef(uid).get()
  const refreshToken =
    tokens.refresh_token ?? (existingRefreshTokenSnap.get('refreshToken') as string | undefined)

  if (!refreshToken) {
    throw new HttpsError(
      'failed-precondition',
      'Google Drive did not return a refresh token. Please approve offline access.',
    )
  }

  const accessToken = tokens.access_token
  if (!accessToken) {
    throw new HttpsError('failed-precondition', 'Google Drive did not return an access token.')
  }
  const accountEmail = await fetchDriveAccountEmail(accessToken)
  const rootFolderId = await ensureDriveFolder(accessToken, GOOGLE_DRIVE_ROOT_FOLDER_NAME)
  await ensureDriveFolder(accessToken, 'entries', rootFolderId)
  const connectedAt = new Date().toISOString()

  const db = getFirestore()
  await db.runTransaction(async (transaction) => {
    transaction.set(
      googleDriveOAuthRef(uid),
      {
        provider: 'googleDrive',
        refreshToken,
        scope: tokens.scope ?? GOOGLE_DRIVE_SCOPE,
        accountEmail,
        rootFolderId,
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    )
    transaction.set(
      db.collection('users').doc(uid),
      {
        activeStorageProvider: 'googleDrive',
        storageAccountEmail: accountEmail,
        storageRootFolderId: rootFolderId,
        storageConnectedAt: FieldValue.serverTimestamp(),
        storageTokenStatus: 'valid',
      },
      { merge: true },
    )
  })

  return {
    provider: 'googleDrive',
    accountEmail,
    rootFolderId,
    rootPath: `My Drive/${GOOGLE_DRIVE_ROOT_FOLDER_NAME}`,
    connectedAt,
  }
}

export const exchangeGoogleDriveCode = onCall(
  { region: FUNCTIONS_REGION, secrets: [GOOGLE_CLIENT_SECRET] },
  handleExchangeGoogleDriveCode,
)

export function handleGetGoogleDriveAccessToken(request: { auth?: { uid?: string } }) {
  const uid = requireAuth(request)
  return refreshAccessToken(uid)
}

export const getGoogleDriveAccessToken = onCall(
  { region: FUNCTIONS_REGION, secrets: [GOOGLE_CLIENT_SECRET] },
  handleGetGoogleDriveAccessToken,
)

export const sendDailyReminders = onSchedule(
  { schedule: '5 * * * *', region: FUNCTIONS_REGION },
  async () => {
    const db = getFirestore()
    const messaging = getMessaging()
    const now = new Date()

    const usersSnap = await db.collection('users').where('reminderEnabled', '==', true).get()

    const jobs = usersSnap.docs.map(async (userDoc) => {
      const safeUserId = logSafeUserId(userDoc.id)
      const user = userDoc.data() as {
        reminderTime?: string
        reminderTimezone?: string
        fcmTokens?: string[]
        lastEntryDate?: string
      }

      const tokens = user.fcmTokens ?? []
      if (!user.reminderTime || !user.reminderTimezone || tokens.length === 0) {
        return
      }

      const zonedNow = toZonedTime(now, user.reminderTimezone)
      const currentHHMM = format(zonedNow, 'HH:mm')

      if (!isWithinReminderWindow(currentHHMM, user.reminderTime)) {
        return
      }

      const today = format(zonedNow, 'yyyy-MM-dd')
      if (user.lastEntryDate === today) {
        return
      }

      const baseUrl = APP_BASE_URL
      const batchResponse = await messaging.sendEach(
        tokens.map((token) => buildReminderMessage(token, baseUrl)),
      )

      const staleTokens = tokens.filter((_, i) => {
        const r = batchResponse.responses[i]
        return !r.success && r.error?.code === 'messaging/registration-token-not-registered'
      })

      if (staleTokens.length > 0) {
        await db
          .collection('users')
          .doc(userDoc.id)
          .update({ fcmTokens: FieldValue.arrayRemove(...staleTokens) })
        console.warn(
          `sendDailyReminders: removed ${staleTokens.length} stale token(s) for user ${safeUserId}`,
        )
      }

      console.warn(
        `sendDailyReminders: sent to user ${safeUserId} (${batchResponse.successCount}/${tokens.length} ok)`,
      )
    })

    await Promise.all(jobs)
  },
)
