# Phase 11 — Settings + Notifications

## Goal

Build the Settings page with notification preferences, grain texture toggle, and scripture
translation selector. Implement the `sendDailyReminders` Cloud Function with Firebase Cloud
Messaging for push notifications.

## Prerequisites

- Phase 2 complete — `DailyScripture` built with default NLT, user doc exists
- Phase 1 complete — Firebase project set up, Functions deployable

## Checklist

- [ ] `SettingsPage.tsx` — full settings page (see SettingsPage section)
- [ ] FCM token request flow: permission → token → save to user doc
- [ ] `sendDailyReminders` Cloud Function — scheduled every 5 minutes (see Cloud Function section)
- [ ] `DailyScripture.tsx` — wire translation preference from user doc (was hardcoded NLT in Phase 2)
- [ ] Grain texture toggle: `AppShell.tsx` reads `grainEnabled` from user doc, adds CSS class to root div
- [ ] `globals.css` — grain overlay CSS (see Grain section)
- [ ] Wire `/settings` route and Settings nav item in `SideNav` + `BottomNav`
- [ ] **Unit**: notification toggle saves correct fields to Firestore user doc

## SettingsPage

**Location:** `src/pages/SettingsPage.tsx`

**Header:**

```
User avatar (w-16 h-16 rounded-full) + displayName text-2xl font-bold + email text-sm text-on-surface-variant
```

**Sections** (each in a card `bg-surface-container-lowest rounded-[2rem] p-6 mb-4`):

### Notifications section

```
[bell icon] "Daily Reminder"
Toggle switch (on/off) — default off

When toggled ON:
  1. request Notification.permission
  2. If granted: get FCM token via getToken(messaging, { vapidKey })
  3. Save to Firestore: { fcmToken, reminderEnabled: true, reminderTime, reminderTimezone }

When toggled OFF:
  Save to Firestore: { reminderEnabled: false, fcmToken: null }

[Time picker — visible only when enabled]
<input type="time" defaultValue="20:00" />
Save on change: { reminderTime: value }
Timezone: auto-detected → Intl.DateTimeFormat().resolvedOptions().timeZone
Saved as: { reminderTimezone: timezone }
```

### Appearance section

```
[texture icon] "Paper Grain Texture"
Toggle switch — default on
On change: save { grainEnabled } to user doc
```

### Scripture section

```
[menu_book icon] "Daily Scripture Translation"
Three buttons: NLT | MSG | ESV
Active: bg-primary-container text-primary rounded-full px-4 py-2 text-sm font-semibold
Inactive: bg-surface-container text-on-surface-variant rounded-full px-4 py-2 text-sm
On change: save { scriptureTranslation } to user doc
           clear localStorage scripture cache for today so it re-fetches with new translation
```

### Account section

```
[logout icon] "Sign Out" button
bg-error-container text-on-error-container rounded-full py-3 px-6 font-semibold
On click: signOut(auth) → navigate to /login
```

## Cloud Function — sendDailyReminders

**Location:** `functions/src/index.ts` (add alongside `getSearchKey`)

```ts
import { onSchedule } from 'firebase-functions/v2/scheduler'
import { getFirestore } from 'firebase-admin/firestore'
import { getMessaging } from 'firebase-admin/messaging'
import { format } from 'date-fns'
import { toZonedTime } from 'date-fns-tz'

export const sendDailyReminders = onSchedule('every 5 minutes', async () => {
  const db = getFirestore()
  const messaging = getMessaging()
  const now = new Date()

  // Get all users with reminders enabled
  const usersSnap = await db.collection('users')
    .where('reminderEnabled', '==', true)
    .where('fcmToken', '!=', null)
    .get()

  const promises = usersSnap.docs.map(async (userDoc) => {
    const user = userDoc.data()
    const { reminderTime, reminderTimezone, fcmToken } = user

    // Check if current time is within this 5-minute window for user's timezone
    const zonedNow = toZonedTime(now, reminderTimezone)
    const currentHHMM = format(zonedNow, 'HH:mm')
    const [rHH, rMM] = reminderTime.split(':').map(Number)
    const [cHH, cMM] = currentHHMM.split(':').map(Number)
    const minutesSinceReminder = (cHH * 60 + cMM) - (rHH * 60 + rMM)
    if (minutesSinceReminder < 0 || minutesSinceReminder >= 5) return

    // Check if user has written today in their timezone
    const today = format(zonedNow, 'yyyy-MM-dd')
    const entrySnap = await db
      .collection('users').doc(userDoc.id)
      .collection('entries').doc(today)
      .get()

    if (entrySnap.exists && !entrySnap.data()?.deleted) return  // already wrote today

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
```

**Additional function dependency:** `date-fns-tz` — add to `functions/package.json`.

## Grain Texture CSS

In `src/styles/globals.css`, add:

```css
/* Grain overlay — applied when .grain-enabled class is on root */
.grain-enabled::before {
  content: '';
  position: fixed;
  inset: 0;
  background-image: url('/textures/natural-paper.png');
  background-repeat: repeat;
  opacity: 0.04;
  pointer-events: none;
  z-index: 9999;
}
```

In `AppShell.tsx`:

```tsx
const { grainEnabled } = useUserPreferences()
<div className={clsx('min-h-screen', grainEnabled && 'grain-enabled')}>
```

`useUserPreferences` is a small hook that reads `grainEnabled` and `scriptureTranslation`
from the user doc via `onSnapshot`.

## DailyScripture (updated)

Replace hardcoded `'NLT'` default with `scriptureTranslation` from user doc:

```ts
const { scriptureTranslation } = useUserPreferences()
// Pass to DailyScripture — it uses this for the API call and localStorage cache key
```

## Unit Tests

```ts
// SettingsPage:
// - toggling notifications ON calls Notification.requestPermission, saves fcmToken + reminderEnabled: true
// - toggling notifications OFF saves reminderEnabled: false, fcmToken: null
// - changing reminder time saves reminderTime to user doc
// - changing translation saves scriptureTranslation and clears localStorage cache
// - grain toggle saves grainEnabled to user doc
```
