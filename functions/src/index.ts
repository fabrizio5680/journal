import { createHmac } from 'node:crypto'
import { resolve } from 'node:path'

import { onCall, HttpsError } from 'firebase-functions/v2/https'
import { onSchedule } from 'firebase-functions/v2/scheduler'
import { initializeApp, getApps } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'
import { getMessaging } from 'firebase-admin/messaging'
import { format } from 'date-fns'
import { toZonedTime } from 'date-fns-tz'
import { config as dotenvConfig } from 'dotenv'

dotenvConfig({ path: resolve(__dirname, '../.env.local') })
dotenvConfig({ path: resolve(__dirname, '../.env') })

if (getApps().length === 0) {
  initializeApp()
}

const { ALGOLIA_APP_ID, ALGOLIA_SEARCH_ONLY_KEY, ALGOLIA_INDEX_NAME } = process.env

const FUNCTIONS_REGION = 'europe-west2'
const SEARCH_INDEX_NAME = ALGOLIA_INDEX_NAME || 'journal_entries'

if (!ALGOLIA_APP_ID) {
  throw new Error('Missing ALGOLIA_APP_ID')
}

if (!ALGOLIA_SEARCH_ONLY_KEY) {
  throw new Error('Missing ALGOLIA_SEARCH_ONLY_KEY')
}

function generateSecuredApiKey(
  parentApiKey: string,
  restrictions: Record<string, string | number | boolean>,
): string {
  const queryParameters = Object.entries(restrictions)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`)
    .join('&')

  const signature = createHmac('sha256', parentApiKey).update(queryParameters).digest('hex')
  return Buffer.from(`${signature}${queryParameters}`).toString('base64')
}

export const getSearchKey = onCall({ region: FUNCTIONS_REGION }, async (request) => {
  const uid = request.auth?.uid
  if (!uid) {
    throw new HttpsError('unauthenticated', 'Login required')
  }

  const escapedUid = uid.replace(/[\\"]/g, '\\$&')

  const validUntil = Math.floor(Date.now() / 1000) + 60 * 60

  const key = generateSecuredApiKey(ALGOLIA_SEARCH_ONLY_KEY, {
    // Keep non-deleted records even if older docs are missing the `deleted` field.
    filters: `userId:"${escapedUid}" AND NOT deleted:true`,
    restrictIndices: SEARCH_INDEX_NAME,
    validUntil,
    userToken: uid,
  })

  return { key, appId: ALGOLIA_APP_ID, indexName: SEARCH_INDEX_NAME }
})

export const sendDailyReminders = onSchedule(
  { schedule: 'every 5 minutes', region: FUNCTIONS_REGION },
  async () => {
    const db = getFirestore()
    const messaging = getMessaging()
    const now = new Date()

    const usersSnap = await db
      .collection('users')
      .where('reminderEnabled', '==', true)
      .where('fcmToken', '!=', null)
      .get()

    const jobs = usersSnap.docs.map(async (userDoc) => {
      const user = userDoc.data() as {
        reminderTime?: string
        reminderTimezone?: string
        fcmToken?: string
      }

      if (!user.reminderTime || !user.reminderTimezone || !user.fcmToken) {
        return
      }

      const zonedNow = toZonedTime(now, user.reminderTimezone)
      const currentHHMM = format(zonedNow, 'HH:mm')

      const [rHH, rMM] = user.reminderTime.split(':').map(Number)
      const [cHH, cMM] = currentHHMM.split(':').map(Number)

      if (Number.isNaN(rHH) || Number.isNaN(rMM) || Number.isNaN(cHH) || Number.isNaN(cMM)) {
        return
      }

      const minutesSinceReminder = cHH * 60 + cMM - (rHH * 60 + rMM)
      if (minutesSinceReminder < 0 || minutesSinceReminder >= 5) {
        return
      }

      const today = format(zonedNow, 'yyyy-MM-dd')
      const entrySnap = await db
        .collection('users')
        .doc(userDoc.id)
        .collection('entries')
        .doc(today)
        .get()

      if (entrySnap.exists && !entrySnap.data()?.deleted) {
        return
      }

      await messaging.send({
        token: user.fcmToken,
        notification: {
          title: 'Time to reflect ✨',
          body: 'Your sanctuary is waiting.',
        },
        webpush: {
          notification: {
            icon: '/icons/icon-192.png',
          },
          fcmOptions: {
            link: '/',
          },
        },
      })
    })

    await Promise.allSettled(jobs)
  },
)
