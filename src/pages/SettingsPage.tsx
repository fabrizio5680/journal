import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { doc, updateDoc, onSnapshot } from 'firebase/firestore'
import { signOut, onAuthStateChanged, type User } from 'firebase/auth'
import { getToken } from 'firebase/messaging'

import { auth, db, messagingPromise } from '@/lib/firebase'
import { useUserPreferences } from '@/context/UserPreferencesContext'

type Translation = 'NLT' | 'MSG' | 'ESV'

function Toggle({
  enabled,
  onChange,
  id,
  label,
}: {
  enabled: boolean
  onChange: (v: boolean) => void
  id: string
  label: string
}) {
  return (
    <button
      id={id}
      role="switch"
      aria-checked={enabled}
      aria-label={label}
      onClick={() => onChange(!enabled)}
      className={`relative inline-flex h-7 w-12 shrink-0 cursor-pointer rounded-full transition-colors duration-200 focus:outline-none ${
        enabled ? 'bg-primary' : 'bg-surface-container-high'
      }`}
    >
      <span
        className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform duration-200 mt-1 ${
          enabled ? 'translate-x-6' : 'translate-x-1'
        }`}
      />
    </button>
  )
}

export default function SettingsPage() {
  const [user, setUser] = useState<User | null>(null)
  const navigate = useNavigate()
  const { grainEnabled, scriptureTranslation } = useUserPreferences()

  const [reminderEnabled, setReminderEnabled] = useState(false)
  const [reminderTime, setReminderTime] = useState('20:00')
  const [notifError, setNotifError] = useState<string | null>(null)

  // Load reminder fields from user doc once
  useEffect(() => {
    let unsubscribe: (() => void) | null = null
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u)
      if (!u) return
      unsubscribe = onSnapshot(doc(db, 'users', u.uid), (snap) => {
        const data = snap.data()
        if (!data) return
        setReminderEnabled(data.reminderEnabled ?? false)
        setReminderTime(data.reminderTime ?? '20:00')
      })
    })
    return () => {
      unsub()
      unsubscribe?.()
    }
  }, [])

  async function updateUserDoc(fields: Record<string, unknown>) {
    if (!user) return
    await updateDoc(doc(db, 'users', user.uid), fields)
  }

  async function handleReminderToggle(enabled: boolean) {
    setNotifError(null)
    if (!enabled) {
      setReminderEnabled(false)
      await updateUserDoc({ reminderEnabled: false, fcmToken: null })
      return
    }

    const permission = await Notification.requestPermission()
    if (permission !== 'granted') {
      setNotifError('Notification permission denied. Please enable it in your browser settings.')
      return
    }

    const messaging = await messagingPromise
    if (!messaging) {
      setNotifError('Push notifications are not supported in this browser.')
      return
    }

    const vapidKey = import.meta.env.VITE_FIREBASE_VAPID_KEY as string | undefined
    if (!vapidKey) {
      setNotifError('Push notifications are not configured.')
      return
    }

    try {
      const fcmToken = await getToken(messaging, { vapidKey })
      const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone
      setReminderEnabled(true)
      await updateUserDoc({
        fcmToken,
        reminderEnabled: true,
        reminderTime,
        reminderTimezone: timezone,
      })
    } catch {
      setNotifError('Failed to register for notifications. Please try again.')
    }
  }

  async function handleTimeChange(value: string) {
    setReminderTime(value)
    await updateUserDoc({ reminderTime: value })
  }

  async function handleGrainToggle(enabled: boolean) {
    await updateUserDoc({ grainEnabled: enabled })
  }

  async function handleTranslationChange(translation: Translation) {
    await updateUserDoc({ scriptureTranslation: translation })
    // Clear cached scripture so it re-fetches with the new translation
    const today = new Date().toISOString().slice(0, 10)
    localStorage.removeItem(`scripture_${translation}_${today}`)
    // Also clear the old translation cache
    ;(['NLT', 'MSG', 'ESV'] as Translation[]).forEach((t) => {
      if (t !== translation) localStorage.removeItem(`scripture_${t}_${today}`)
    })
  }

  async function handleSignOut() {
    await signOut(auth)
    navigate('/login')
  }

  return (
    <div className="mx-auto max-w-lg px-4 py-8">
      {/* Header */}
      <div className="mb-8 flex items-center gap-4">
        {user?.photoURL ? (
          <img
            src={user.photoURL}
            alt={user.displayName ?? 'User'}
            className="h-16 w-16 rounded-full object-cover"
          />
        ) : (
          <div className="bg-primary-container flex h-16 w-16 shrink-0 items-center justify-center rounded-full">
            <span className="material-symbols-outlined text-on-primary-container text-3xl">
              person
            </span>
          </div>
        )}
        <div>
          <p className="text-on-surface text-2xl font-bold">{user?.displayName}</p>
          <p className="text-on-surface-variant text-sm">{user?.email}</p>
        </div>
      </div>

      {/* Notifications */}
      <div className="bg-surface-container-lowest mb-4 rounded-[2rem] p-6">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="material-symbols-outlined text-primary">notifications</span>
            <span className="text-on-surface font-semibold">Daily Reminder</span>
          </div>
          <Toggle
            id="reminder-toggle"
            label="Daily Reminder"
            enabled={reminderEnabled}
            onChange={handleReminderToggle}
          />
        </div>

        {notifError && <p className="text-error mb-3 text-xs">{notifError}</p>}

        {reminderEnabled && (
          <div className="mt-2">
            <label
              htmlFor="reminder-time"
              className="text-on-surface-variant mb-1 block text-xs font-medium"
            >
              Reminder time
            </label>
            <input
              id="reminder-time"
              type="time"
              value={reminderTime}
              onChange={(e) => handleTimeChange(e.target.value)}
              className="bg-surface-container text-on-surface rounded-xl px-4 py-2 text-sm focus:outline-none"
            />
          </div>
        )}
      </div>

      {/* Appearance */}
      <div className="bg-surface-container-lowest mb-4 rounded-[2rem] p-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="material-symbols-outlined text-primary">texture</span>
            <span className="text-on-surface font-semibold">Paper Grain Texture</span>
          </div>
          <Toggle id="grain-toggle" label="Paper Grain Texture" enabled={grainEnabled} onChange={handleGrainToggle} />
        </div>
      </div>

      {/* Scripture */}
      <div className="bg-surface-container-lowest mb-4 rounded-[2rem] p-6">
        <div className="mb-4 flex items-center gap-3">
          <span className="material-symbols-outlined text-primary">menu_book</span>
          <span className="text-on-surface font-semibold">Daily Scripture Translation</span>
        </div>
        <div className="flex gap-2">
          {(['NLT', 'MSG', 'ESV'] as Translation[]).map((t) => (
            <button
              key={t}
              onClick={() => handleTranslationChange(t)}
              className={
                scriptureTranslation === t
                  ? 'bg-primary-container text-primary rounded-full px-4 py-2 text-sm font-semibold'
                  : 'bg-surface-container text-on-surface-variant rounded-full px-4 py-2 text-sm'
              }
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      {/* Account */}
      <div className="bg-surface-container-lowest rounded-[2rem] p-6">
        <button
          onClick={handleSignOut}
          className="bg-error-container text-on-error-container w-full rounded-full py-3 px-6 font-semibold transition-opacity hover:opacity-80"
        >
          <span className="flex items-center justify-center gap-2">
            <span className="material-symbols-outlined text-base">logout</span>
            Sign Out
          </span>
        </button>
      </div>
    </div>
  )
}
