import { type ReactNode, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { doc, updateDoc, getDoc, onSnapshot, arrayUnion, arrayRemove } from 'firebase/firestore'
import { signOut, onAuthStateChanged, type User } from 'firebase/auth'
import { getToken } from 'firebase/messaging'

import { auth, db, messagingPromise } from '@/lib/firebase'
import { useUserPreferences } from '@/context/UserPreferencesContext'
import type { EditorFontSize } from '@/context/UserPreferencesContext'
import { useEncryption } from '@/context/EncryptionContext'
import { EncryptionSetupModal } from '@/components/encryption/EncryptionSetupModal'
import { EncryptionUnlockModal } from '@/components/encryption/EncryptionUnlockModal'
import { usePageTitle } from '@/hooks/usePageTitle'
import { isMobileDevice } from '@/lib/device'

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
        className={`mt-1 inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition-transform duration-200 ${
          enabled ? 'translate-x-6' : 'translate-x-1'
        }`}
      />
    </button>
  )
}

function SettingsSection({ children }: { children: ReactNode }) {
  return <div className="bg-surface-container-lowest mb-3 rounded-[1.75rem] p-6">{children}</div>
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
  const {
    grainEnabled,
    scriptureTranslation,
    editorFontSize,
    updateEditorFontSize,
    spellcheckEnabled,
    updateSpellcheck,
  } = useUserPreferences()
  const { isEnabled, isUnlocked, lock, disable } = useEncryption()
  const [showSetupModal, setShowSetupModal] = useState(false)
  const [showUnlockModal, setShowUnlockModal] = useState(false)
  const [disablePassphrase, setDisablePassphrase] = useState('')
  const [showDisableConfirm, setShowDisableConfirm] = useState(false)
  const [disableError, setDisableError] = useState<string | null>(null)

  const [reminderEnabled, setReminderEnabled] = useState(false)
  const [reminderTime, setReminderTime] = useState('20:00')
  const [fcmTokens, setFcmTokens] = useState<string[]>([])
  const [currentDeviceToken, setCurrentDeviceToken] = useState<string | null>(null)
  const [notifError, setNotifError] = useState<string | null>(null)

  useEffect(() => {
    let unsubscribe: (() => void) | null = null
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u)
      if (!u) return
      unsubscribe = onSnapshot(
        doc(db, 'users', u.uid),
        (snap) => {
          const data = snap.data()
          if (!data) return
          setReminderEnabled(data.reminderEnabled ?? false)
          setReminderTime(data.reminderTime ?? '20:00')
          setFcmTokens(data.fcmTokens ?? [])
        },
        () => {
          setReminderEnabled(false)
          setReminderTime('20:00')
          setFcmTokens([])
        },
      )

      if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
        messagingPromise.then(async (messaging) => {
          if (!messaging) return
          const vapidKey = import.meta.env.VITE_FIREBASE_VAPID_KEY as string | undefined
          if (!vapidKey) return
          try {
            const token = await getToken(messaging, { vapidKey })
            const storedToken = localStorage.getItem(`fcm_device_token_${u.uid}`)
            if (storedToken && storedToken !== token) {
              // Token rotated — swap in Firestore silently
              const userRef = doc(db, 'users', u.uid)
              await updateDoc(userRef, {
                fcmTokens: arrayUnion(token),
              })
              // Remove old token separately (arrayRemove needs the exact value)
              await updateDoc(userRef, {
                fcmTokens: arrayRemove(storedToken),
              })
              localStorage.setItem(`fcm_device_token_${u.uid}`, token)
            }
            setCurrentDeviceToken(token)
          } catch {
            // permission granted but token unavailable — treat device as unregistered
          }
        })
      }
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
      const tokenToRemove = currentDeviceToken
      if (tokenToRemove && user) {
        const userRef = doc(db, 'users', user.uid)
        await updateDoc(userRef, { fcmTokens: arrayRemove(tokenToRemove) })
        const snap = await getDoc(userRef)
        const remaining: string[] = snap.data()?.fcmTokens ?? []
        if (remaining.length === 0) {
          await updateDoc(userRef, { reminderEnabled: false })
        }
        localStorage.removeItem(`fcm_device_token_${user.uid}`)
        setCurrentDeviceToken(null)
      }
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
      const token = await getToken(messaging, { vapidKey })
      const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone
      setCurrentDeviceToken(token)
      await updateUserDoc({
        fcmTokens: arrayUnion(token),
        reminderEnabled: true,
        reminderTime,
        reminderTimezone: timezone,
      })
      if (user) localStorage.setItem(`fcm_device_token_${user.uid}`, token)
    } catch {
      setNotifError('Failed to register for notifications. Please try again.')
    }
  }

  async function handleTimeChange(value: string) {
    setReminderTime(value)
    await updateUserDoc({ reminderTime: value })
  }

  async function handleDisableEncryption() {
    setDisableError(null)
    try {
      await disable(disablePassphrase)
      setShowDisableConfirm(false)
      setDisablePassphrase('')
    } catch {
      setDisableError('Incorrect passphrase.')
    }
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
            className="ring-outline-variant/20 h-16 w-16 rounded-full object-cover ring-2"
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
            enabled={!!currentDeviceToken && fcmTokens.includes(currentDeviceToken)}
            onChange={handleReminderToggle}
          />
        </SettingsRow>

        {notifError && <p className="text-error mt-3 text-xs">{notifError}</p>}

        {reminderEnabled && (
          <div className="border-outline-variant/20 mt-4 border-t pt-4">
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
        <div className="border-outline-variant/20 mt-4 border-t pt-4">
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-3">
              <span className="material-symbols-outlined text-primary text-[20px]">
                format_size
              </span>
              <span className="text-on-surface text-sm font-medium">
                Editor Text Size (this device)
              </span>
            </div>
            <div className="flex gap-1.5 pl-8">
              {(['small', 'medium', 'large'] as EditorFontSize[]).map((size) => (
                <button
                  key={size}
                  onClick={() => updateEditorFontSize(size)}
                  className={
                    editorFontSize === size
                      ? 'bg-primary text-on-primary rounded-full px-3 py-1.5 text-xs font-semibold capitalize'
                      : 'bg-surface-container text-on-surface-variant/70 hover:text-on-surface-variant rounded-full px-3 py-1.5 text-xs capitalize transition-colors'
                  }
                >
                  {size}
                </button>
              ))}
            </div>
          </div>
        </div>
        {!isMobileDevice() && (
          <div className="border-outline-variant/20 mt-4 border-t pt-4">
            <SettingsRow icon="spellcheck" label="Spell Check">
              <Toggle
                id="spellcheck-toggle"
                label="Spell Check"
                enabled={spellcheckEnabled}
                onChange={updateSpellcheck}
              />
            </SettingsRow>
          </div>
        )}
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
                    : 'bg-surface-container text-on-surface-variant/70 hover:text-on-surface-variant rounded-full px-3 py-1.5 text-xs transition-colors'
                }
              >
                {t}
              </button>
            ))}
          </div>
        </SettingsRow>
      </SettingsSection>

      {/* Privacy & Encryption */}
      <SettingsSection>
        <p className="text-on-surface-variant/60 mb-4 text-xs font-medium tracking-wide">
          Privacy &amp; Encryption
        </p>
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <span className="material-symbols-outlined text-primary mt-0.5 text-[20px]">
              {isEnabled ? 'lock' : 'lock_open'}
            </span>
            <div>
              <p className="text-on-surface text-sm font-medium">End-to-end Encryption</p>
              <p className="text-on-surface-variant/70 mt-0.5 text-xs">
                {isEnabled
                  ? isUnlocked
                    ? 'Enabled — session is unlocked'
                    : 'Enabled — session is locked'
                  : 'Encrypt entry content so only you can read it'}
              </p>
            </div>
          </div>
          {!isEnabled && (
            <button
              onClick={() => setShowSetupModal(true)}
              aria-label="Enable encryption"
              className="bg-primary text-on-primary hover:bg-primary-dim shrink-0 rounded-full px-3 py-1.5 text-xs font-medium transition-colors"
            >
              Enable
            </button>
          )}
          {isEnabled && isUnlocked && (
            <button
              onClick={lock}
              className="bg-surface-container text-on-surface-variant hover:text-on-surface shrink-0 rounded-full px-3 py-1.5 text-xs font-medium transition-colors"
            >
              Lock session
            </button>
          )}
          {isEnabled && !isUnlocked && (
            <button
              onClick={() => setShowUnlockModal(true)}
              className="bg-primary text-on-primary hover:bg-primary-dim shrink-0 rounded-full px-3 py-1.5 text-xs font-medium transition-colors"
            >
              Unlock
            </button>
          )}
        </div>

        {isEnabled && isUnlocked && (
          <div className="border-outline-variant/20 mt-4 border-t pt-4">
            {!showDisableConfirm ? (
              <button
                onClick={() => setShowDisableConfirm(true)}
                className="text-on-surface-variant/60 hover:text-error text-sm transition-colors"
              >
                Disable encryption…
              </button>
            ) : (
              <div className="flex flex-col gap-2">
                <p className="text-on-surface-variant text-xs">
                  Enter your passphrase to confirm disabling encryption.
                </p>
                {disableError && <p className="text-error text-xs">{disableError}</p>}
                <input
                  type="password"
                  value={disablePassphrase}
                  onChange={(e) => {
                    setDisablePassphrase(e.target.value)
                    setDisableError(null)
                  }}
                  className="bg-surface-container text-on-surface rounded-xl px-4 py-2 text-sm focus:outline-none"
                  placeholder="Passphrase…"
                />
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      setShowDisableConfirm(false)
                      setDisablePassphrase('')
                      setDisableError(null)
                    }}
                    className="text-on-surface-variant hover:text-on-surface rounded-xl px-3 py-1.5 text-xs transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => void handleDisableEncryption()}
                    disabled={disablePassphrase.length === 0}
                    className="text-error hover:text-error-dim rounded-xl px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-50"
                  >
                    Confirm Disable
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
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

      {showSetupModal && <EncryptionSetupModal onClose={() => setShowSetupModal(false)} />}
      {showUnlockModal && <EncryptionUnlockModal onClose={() => setShowUnlockModal(false)} />}
    </div>
  )
}
