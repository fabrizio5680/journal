import { type ReactNode, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { doc, updateDoc, getDoc, onSnapshot, arrayUnion, arrayRemove } from 'firebase/firestore'
import { signOut, onAuthStateChanged, type User } from 'firebase/auth'
import { getToken } from 'firebase/messaging'

import { auth, db, messagingPromise } from '@/lib/firebase'
import { useUserPreferences } from '@/context/UserPreferencesContext'
import type { EditorFontSize } from '@/context/UserPreferencesContext'
import { usePageTitle } from '@/hooks/usePageTitle'
import { isMobileDevice } from '@/lib/device'
import {
  backfillGoogleDriveMetadata,
  connectGoogleDriveProvider,
  disconnectGoogleDriveProvider,
  getDeviceProviderState,
  type ProviderConnectionState,
} from '@/lib/storage/providerConnection'

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

function StorageStatusText({
  state,
  appEmail,
}: {
  state: ProviderConnectionState
  appEmail?: string | null
}) {
  if (state.status === 'disconnected') {
    return <span className="text-on-surface-variant/60 text-xs">Not connected</span>
  }

  if (state.status === 'reconnect') {
    return <span className="text-error text-xs font-medium">Google Drive · reconnect needed</span>
  }

  const differs = state.storageAccountEmail && state.storageAccountEmail !== appEmail

  return (
    <span className="text-on-surface-variant/70 text-xs">
      Google Drive · {state.storageAccountEmail ?? 'connected'} · connected
      {differs ? (
        <span className="text-primary block pt-1">Drive account differs from app account.</span>
      ) : null}
    </span>
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

  const [reminderEnabled, setReminderEnabled] = useState(false)
  const [reminderTime, setReminderTime] = useState('20:00')
  const [fcmTokens, setFcmTokens] = useState<string[]>([])
  const [currentDeviceToken, setCurrentDeviceToken] = useState<string | null>(null)
  const [notifError, setNotifError] = useState<string | null>(null)
  const [storageState, setStorageState] = useState<ProviderConnectionState>({
    status: 'disconnected',
    deviceConnected: false,
  })
  const [storageError, setStorageError] = useState<string | null>(null)
  const [storageAction, setStorageAction] = useState<'connect' | 'disconnect' | null>(null)
  const [isSyncing, setIsSyncing] = useState(false)

  useEffect(() => {
    let unsubscribe: (() => void) | null = null
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u)
      if (!u) {
        setStorageState({ status: 'disconnected', deviceConnected: false })
        return
      }
      unsubscribe = onSnapshot(
        doc(db, 'users', u.uid),
        (snap) => {
          const data = snap.data()
          if (!data) return
          setReminderEnabled(data.reminderEnabled ?? false)
          setReminderTime(data.reminderTime ?? '20:00')
          setFcmTokens(data.fcmTokens ?? [])
          setStorageState(
            getDeviceProviderState(u.uid, {
              activeStorageProvider: data.activeStorageProvider,
              storageAccountEmail: data.storageAccountEmail,
              storageRootFolderId: data.storageRootFolderId,
              storageConnectedAt: data.storageConnectedAt,
              storageTokenStatus: data.storageTokenStatus,
            }),
          )
        },
        () => {
          setReminderEnabled(false)
          setReminderTime('20:00')
          setFcmTokens([])
          setStorageState({ status: 'disconnected', deviceConnected: false })
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

  async function handleConnectDrive() {
    if (!user) return
    setStorageError(null)
    setStorageAction('connect')
    try {
      await connectGoogleDriveProvider(user.uid, user.email)
    } catch (error) {
      setStorageError(error instanceof Error ? error.message : 'Google Drive connection failed.')
    } finally {
      setStorageAction(null)
    }
  }

  async function handleDisconnectDrive() {
    if (!user) return
    const confirmed = window.confirm(
      'Disconnect Google Drive on this device? Your journal entries will remain saved locally.',
    )
    if (!confirmed) return

    setStorageError(null)
    setStorageAction('disconnect')
    try {
      await disconnectGoogleDriveProvider(user.uid)
      setStorageState((current) => ({ ...current, status: 'disconnected', deviceConnected: false }))
    } catch (error) {
      setStorageError(error instanceof Error ? error.message : 'Google Drive disconnect failed.')
    } finally {
      setStorageAction(null)
    }
  }

  async function handleSyncFromDrive() {
    if (!user) return
    setStorageError(null)
    setIsSyncing(true)
    try {
      await backfillGoogleDriveMetadata(user.uid)
    } catch (error) {
      setStorageError(error instanceof Error ? error.message : 'Sync from Drive failed.')
    } finally {
      setIsSyncing(false)
    }
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

      {/* Storage */}
      <SettingsSection>
        <div className="mb-4 flex items-start gap-3">
          <span className="material-symbols-outlined text-primary text-[20px]">cloud</span>
          <div className="min-w-0 flex-1">
            <p className="text-on-surface text-sm font-medium">Storage</p>
            <p className="text-on-surface-variant/60 mt-1 text-xs leading-relaxed">
              Drive connection follows your account. This device can keep entries local.
            </p>
          </div>
        </div>

        <div className="border-outline-variant/20 space-y-3 border-t pt-4">
          <div className="flex items-start justify-between gap-4">
            <span className="text-on-surface-variant/50 text-xs font-medium">App account</span>
            <span className="text-on-surface-variant/70 text-right text-xs">
              {user?.email ?? user?.providerId ?? 'Signed in'} · signed in
            </span>
          </div>
          <div className="flex items-start justify-between gap-4">
            <span className="text-on-surface-variant/50 text-xs font-medium">Storage account</span>
            <span className="text-right">
              <StorageStatusText state={storageState} appEmail={user?.email} />
            </span>
          </div>
        </div>

        {storageState.status === 'connected' && (
          <p className="text-on-surface-variant/50 mt-3 text-xs">
            Backup snapshots saved to{' '}
            <span className="text-on-surface-variant/70 font-medium">
              Quiet Dwelling/conflicts/
            </span>{' '}
            in your Drive.{' '}
            <a
              href="https://drive.google.com"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary hover:underline"
            >
              Open Google Drive ↗
            </a>
          </p>
        )}

        {storageError && <p className="text-error mt-3 text-xs">{storageError}</p>}

        <div className="mt-5 flex justify-end gap-2">
          {storageState.status === 'connected' && (
            <button
              type="button"
              onClick={handleSyncFromDrive}
              disabled={storageAction !== null || isSyncing}
              className="text-on-surface-variant/60 hover:text-on-surface-variant rounded-full px-3 py-1.5 text-xs font-semibold transition-colors disabled:opacity-50"
            >
              {isSyncing ? 'Syncing...' : 'Sync from Drive'}
            </button>
          )}
          {storageState.status === 'connected' && (
            <button
              type="button"
              onClick={handleDisconnectDrive}
              disabled={storageAction !== null}
              className="text-on-surface-variant/60 hover:text-error rounded-full px-3 py-1.5 text-xs font-semibold transition-colors disabled:opacity-50"
            >
              Disconnect Google Drive
            </button>
          )}
          {storageState.status !== 'connected' && (
            <button
              type="button"
              onClick={handleConnectDrive}
              disabled={storageAction !== null}
              className="bg-primary text-on-primary rounded-full px-4 py-2 text-xs font-semibold transition-opacity disabled:opacity-50"
            >
              {storageAction === 'connect'
                ? 'Connecting...'
                : storageState.status === 'reconnect'
                  ? 'Reconnect Google Drive'
                  : 'Connect Google Drive'}
            </button>
          )}
        </div>
      </SettingsSection>

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
