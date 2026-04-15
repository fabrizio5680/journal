import { onCall, HttpsError } from 'firebase-functions/v2/https'
import { onSchedule } from 'firebase-functions/v2/scheduler'
import Algolia from 'algoliasearch'
import { getFirestore } from 'firebase-admin/firestore'
import { getMessaging } from 'firebase-admin/messaging'
import { initializeApp, getApps } from 'firebase-admin/app'
import { format } from 'date-fns'
import { toZonedTime } from 'date-fns-tz'

if (getApps().length === 0) initializeApp()

const algoliaClient = Algolia(process.env.ALGOLIA_APP_ID!, process.env.ALGOLIA_ADMIN_KEY!)

export const getSearchKey = onCall({ region: 'us-central1' }, async (request) => {
  const uid = request.auth?.uid
  if (!uid) throw new HttpsError('unauthenticated', 'Login required')

  const nowPlusOneHour = Math.floor(Date.now() / 1000) + 3600

  const key = algoliaClient.generateSecuredApiKey(process.env.ALGOLIA_SEARCH_ONLY_KEY!, {
    filters: `userId:${uid} AND deleted:false`,
    validUntil: nowPlusOneHour,
    userToken: uid,
  })
  return { key }
})

export const sendDailyReminders = onSchedule('every 5 minutes', async () => {
  const db = getFirestore()
  const messaging = getMessaging()
  const now = new Date()

  // Get all users with reminders enabled
  const usersSnap = await db
    .collection('users')
    .where('reminderEnabled', '==', true)
    .where('fcmToken', '!=', null)
    .get()

  const promises = usersSnap.docs.map(async (userDoc) => {
    const user = userDoc.data()
    const { reminderTime, reminderTimezone, fcmToken } = user as {
      reminderTime: string
      reminderTimezone: string
      fcmToken: string
    }

    // Check if current time is within this 5-minute window for user's timezone
    const zonedNow = toZonedTime(now, reminderTimezone)
    const currentHHMM = format(zonedNow, 'HH:mm')
    const [rHH, rMM] = reminderTime.split(':').map(Number)
    const [cHH, cMM] = currentHHMM.split(':').map(Number)
    const minutesSinceReminder = cHH * 60 + cMM - (rHH * 60 + rMM)
    if (minutesSinceReminder < 0 || minutesSinceReminder >= 5) return

    // Check if user has written today in their timezone
    const today = format(zonedNow, 'yyyy-MM-dd')
    const entrySnap = await db
      .collection('users')
      .doc(userDoc.id)
      .collection('entries')
      .doc(today)
      .get()

    if (entrySnap.exists && !entrySnap.data()?.deleted) return // already wrote today

    // Send FCM push
    await messaging.send({
      token: fcmToken,
      notification: {
        title: 'Time to reflect ✨',
        body: 'Your sanctuary is waiting.',
      },
      webpush: {
        notification: { icon: '/icons/icon-192.png' },
        fcmOptions: { link: '/' },
      },
    })
  })

  await Promise.allSettled(promises)
})
