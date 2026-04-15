import { type ReactNode, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { doc, updateDoc, onSnapshot } from 'firebase/firestore'
import { signOut, onAuthStateChanged, type User } from 'firebase/auth'
import { getToken } from 'firebase/messaging'

import { auth, db, messagingPromise } from '@/lib/firebase'
import { useUserPreferences } from '@/context/UserPreferencesContext'
import { usePageTitle } from '@/hooks/usePageTitle'

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
      className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full transition-colors duration-200 focus:outline-none ${
        enabled ? 'bg-primary' : 'bg-surface-container-high'
      }`}
    >
      <span
        className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition-transform duration-200 mt-1 ${
          enabled ? 'translate-x-6' : 'translate-x-1'
        }`}
      />
    </button>
  )
}

function SettingsSection({ children }: { children: ReactNode }) {
  return (
    <div className="bg-surface-container-lowest rounded-[1.75rem] p-6 mb-3">{children}</div>
  )
}

function SettingsRow({
  icon,
  label,
  children,
}: {
  icon: string
  label: string
  children: ReactNode
}) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-3">
        <span className="material-symbols-outlined text-primary text-[20px]">{icon}</span>
        <span className="text-on-surface text-sm font-medium">{label}</span>
      </div>
      {children}
    </div>
  )
}

export default function SettingsPage() {
  usePageTitle('Settings')
  const [user, setUser] = useState<User | null>(null)
  const navigate = useNavigate()
  const { grainEnabled, scriptureTranslation } = useUserPreferences()

  const [reminderEnabled, setReminderEnabled] = useState(false)
  const [reminderTime, setReminderTime] = useState('20:00')
  const [notifError, setNotifError] = useState<string | null>(null)

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
    const today = new Date().toISOString().slice(0, 10)
    localStorage.removeItem(`scripture_${translation}_${today}`)
    ;(['NLT', 'MSG', 'ESV'] as Translation[]).forEach((t) => {
      if (t !== translation) localStorage.removeItem(`scripture_${t}_${today}`)
    })
  }

  async function handleSignOut() {
    await signOut(auth)
    navigate('/login')
  }

  return (
    <div className="mx-auto max-w-lg px-4 py-8 md:pt-16">
      {/* Profile header */}
      <div className="mb-10 flex items-center gap-4">
        {user?.photoURL ? (
          <img
            src={user.photoURL}
            alt={user.displayName ?? 'User'}
            className="h-16 w-16 rounded-full object-cover ring-2 ring-outline-variant/20"
          />
        ) : (
          <div className="bg-primary-container flex h-16 w-16 shrink-0 items-center justify-center rounded-full">
            <span className="material-symbols-outlined text-on-primary-container text-3xl">
              person
            </span>
          </div>
        )}
        <div>
          <p className="font-display text-on-surface text-3xl font-light">{user?.displayName}</p>
          <p className="text-on-surface-variant/60 text-sm">{user?.email}</p>
        </div>
      </div>

      {/* Notifications */}
      <SettingsSection>
        <SettingsRow icon="notifications" label="Daily Reminder">
          <Toggle
            id="reminder-toggle"
            label="Daily Reminder"
            enabled={reminderEnabled}
            onChange={handleReminderToggle}
          />
        </SettingsRow>

        {notifError && <p className="text-error mt-3 text-xs">{notifError}</p>}

        {reminderEnabled && (
          <div className="mt-4 border-t border-outline-variant/20 pt-4">
            <label
              htmlFor="reminder-time"
              className="text-on-surface-variant/60 mb-2 block text-xs font-medium tracking-wide"
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
      </SettingsSection>

      {/* Appearance */}
      <SettingsSection>
        <SettingsRow icon="texture" label="Paper Grain Texture">
          <Toggle
            id="grain-toggle"
            label="Paper Grain Texture"
            enabled={grainEnabled}
            onChange={handleGrainToggle}
          />
        </SettingsRow>
      </SettingsSection>

      {/* Scripture */}
      <SettingsSection>
        <SettingsRow icon="menu_book" label="Scripture Translation">
          <div className="flex gap-1.5">
            {(['NLT', 'MSG', 'ESV'] as Translation[]).map((t) => (
              <button
                key={t}
                onClick={() => handleTranslationChange(t)}
                className={
                  scriptureTranslation === t
                    ? 'bg-primary text-on-primary rounded-full px-3 py-1.5 text-xs font-semibold'
                    : 'bg-surface-container text-on-surface-variant/70 rounded-full px-3 py-1.5 text-xs hover:text-on-surface-variant transition-colors'
                }
              >
                {t}
              </button>
            ))}
          </div>
        </SettingsRow>
      </SettingsSection>

      {/* Sign out */}
      <SettingsSection>
        <button
          onClick={handleSignOut}
          className="text-on-surface-variant/60 hover:text-error flex w-full items-center justify-center gap-2 py-1 text-sm font-medium transition-colors"
        >
          <span className="material-symbols-outlined text-[18px]">logout</span>
          Sign Out
        </button>
      </SettingsSection>
    </div>
  )
}
