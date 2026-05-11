import { onSchedule } from 'firebase-functions/v2/scheduler'
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

export const sendDailyReminders = onSchedule(
  { schedule: '5 * * * *', region: FUNCTIONS_REGION },
  async () => {
    const db = getFirestore()
    const messaging = getMessaging()
    const now = new Date()

    const usersSnap = await db.collection('users').where('reminderEnabled', '==', true).get()

    const jobs = usersSnap.docs.map(async (userDoc) => {
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
          `sendDailyReminders: removed ${staleTokens.length} stale token(s) for ${userDoc.id}`,
        )
      }

      console.warn(
        `sendDailyReminders: sent to ${userDoc.id} (${batchResponse.successCount}/${tokens.length} ok)`,
      )
    })

    await Promise.all(jobs)
  },
)
