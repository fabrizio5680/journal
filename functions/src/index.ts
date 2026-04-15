import { onCall, HttpsError } from 'firebase-functions/v2/https'
import { onSchedule } from 'firebase-functions/v2/scheduler'
import { algoliasearch } from 'algoliasearch'
import { getFirestore } from 'firebase-admin/firestore'
import { getMessaging } from 'firebase-admin/messaging'
import { initializeApp, getApps } from 'firebase-admin/app'
import { format } from 'date-fns'
import { toZonedTime } from 'date-fns-tz'

if (getApps().length === 0) {
  initializeApp()
}

const {
  ALGOLIA_APP_ID,
  ALGOLIA_SEARCH_ONLY_KEY,
} = process.env

if (!ALGOLIA_APP_ID) {
  throw new Error('Missing ALGOLIA_APP_ID')
}

if (!ALGOLIA_SEARCH_ONLY_KEY) {
  throw new Error('Missing ALGOLIA_SEARCH_ONLY_KEY')
}

// v5 named import
const searchClient = algoliasearch(ALGOLIA_APP_ID, ALGOLIA_SEARCH_ONLY_KEY)

export const getSearchKey = onCall({ region: 'us-central1' }, async (request) => {
  const uid = request.auth?.uid
  if (!uid) {
    throw new HttpsError('unauthenticated', 'Login required')
  }

  const validUntil = Math.floor(Date.now() / 1000) + 60 * 60

  const key = searchClient.generateSecuredApiKey({
    filters: `userId:${uid} AND deleted:false`,
    validUntil,
    userToken: uid,
  })

  return { key, appId: ALGOLIA_APP_ID }
})

export const sendDailyReminders = onSchedule('every 5 minutes', async () => {
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

    if (
      Number.isNaN(rHH) ||
      Number.isNaN(rMM) ||
      Number.isNaN(cHH) ||
      Number.isNaN(cMM)
    ) {
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
})