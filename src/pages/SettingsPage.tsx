import { type ReactNode, useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { doc, updateDoc, getDoc, onSnapshot, arrayUnion, arrayRemove } from 'firebase/firestore'
import { signOut, onAuthStateChanged, type User } from 'firebase/auth'
import { getToken } from 'firebase/messaging'
import { httpsCallable } from 'firebase/functions'

import { auth, db, functions, messagingPromise } from '@/lib/firebase'
import { useUserPreferences } from '@/context/UserPreferencesContext'
import type { EditorFontSize } from '@/context/UserPreferencesContext'
import { useConsent } from '@/hooks/useConsent'
import { usePageTitle } from '@/hooks/usePageTitle'
import { EntryRepository } from '@/lib/storage/entryRepository'
import { localEntryCache } from '@/lib/storage/localEntryCache'
import {
  backfillGoogleDriveMetadata,
  connectGoogleDriveProvider,
  disconnectGoogleDriveProvider,
  getDeviceProviderState,
  type ProviderConnectionState,
} from '@/lib/storage/providerConnection'
import { GoogleDriveAdapter } from '@/lib/storage/providers/googleDriveAdapter'

type Translation = 'NLT' | 'MSG' | 'ESV'

interface DriveUsage {
  folderBytes: number
  driveUsage: number | null
  driveLimit: number | null
}

interface DeleteAccountResult {
  success: boolean
  refreshTokenRevoked?: boolean
}

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '0 B'
  if (bytes < 1024) return `${Math.round(bytes)} B`
  const units = ['KB', 'MB', 'GB', 'TB']
  let value = bytes / 1024
  let unitIndex = 0
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024
    unitIndex += 1
  }
  const formatted = value >= 100 ? value.toFixed(0) : value.toFixed(1)
  return `${formatted} ${units[unitIndex]}`
}

function formatDriveUsage(usage: DriveUsage): string {
  const folder = formatBytes(usage.folderBytes)
  if (usage.driveUsage === null || usage.driveLimit === null) {
    return folder
  }
  return `${folder} · ${formatBytes(usage.driveUsage)} of ${formatBytes(usage.driveLimit)} Drive used`
}

function clearLocalStorageForUser(userId: string) {
  const exactKeys = [
    `fcm_device_token_${userId}`,
    `google_drive_connection_${userId}`,
    `google_drive_disconnected_${userId}`,
    `drive_token_refresh_lock_${userId}`,
  ]
  exactKeys.forEach((key) => localStorage.removeItem(key))
  for (let i = localStorage.length - 1; i >= 0; i -= 1) {
    const key = localStorage.key(i)
    if (key?.includes(userId)) localStorage.removeItem(key)
  }
}

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
  const { scriptureTranslation, editorFontSize, updateEditorFontSize } = useUserPreferences()
  const { canProcessMood, canProcessReligion, saveConsent, withdrawConsent } = useConsent()

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
  const [driveUsage, setDriveUsage] = useState<DriveUsage | null>(null)
  const [conflictAction, setConflictAction] = useState<'clear' | null>(null)
  const [conflictMessage, setConflictMessage] = useState<string | null>(null)
  const [exportStatus, setExportStatus] = useState<'idle' | 'exporting'>('idle')
  const [exportError, setExportError] = useState<string | null>(null)
  const [consentStatus, setConsentStatus] = useState<'idle' | 'saving'>('idle')
  const [consentError, setConsentError] = useState<string | null>(null)
  const [deleteStatus, setDeleteStatus] = useState<'idle' | 'deleting'>('idle')
  const [deleteError, setDeleteError] = useState<string | null>(null)

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

  useEffect(() => {
    if (!user?.uid || storageState.status !== 'connected') {
      setDriveUsage(null)
      return
    }
    let cancelled = false
    const adapter = new GoogleDriveAdapter(user.uid)
    adapter
      .getStorageUsage()
      .then((usage) => {
        if (!cancelled) setDriveUsage(usage)
      })
      .catch((error) => {
        console.warn('[SettingsPage] Drive usage fetch failed:', error)
        if (!cancelled) setDriveUsage(null)
      })
    return () => {
      cancelled = true
    }
  }, [user?.uid, storageState.status])

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

  async function handleClearConflictBackups() {
    if (!user) return
    const confirmed = window.confirm(
      'Delete all Quiet Dwelling conflict backup files from your Google Drive? Your main journal entries will not be deleted.',
    )
    if (!confirmed) return

    setStorageError(null)
    setConflictMessage(null)
    setConflictAction('clear')
    try {
      const adapter = new GoogleDriveAdapter(user.uid)
      const deletedCount = await adapter.clearConflictBackups()
      setConflictMessage(
        deletedCount === 1
          ? 'Deleted 1 conflict backup from Google Drive.'
          : `Deleted ${deletedCount} conflict backups from Google Drive.`,
      )
      const usage = await adapter.getStorageUsage()
      setDriveUsage(usage)
    } catch (error) {
      setStorageError(
        error instanceof Error ? error.message : 'Could not clear Drive conflict backups.',
      )
    } finally {
      setConflictAction(null)
    }
  }

  async function handleExportData() {
    if (!user) return
    setExportStatus('exporting')
    setExportError(null)
    try {
      const [profileSnap, entries] = await Promise.all([
        getDoc(doc(db, 'users', user.uid)),
        EntryRepository.listEntries(user.uid),
      ])
      const exportedAt = new Date().toISOString()
      const bundle = {
        schemaVersion: 1,
        app: 'quiet-dwelling',
        exportedAt,
        user: {
          uid: user.uid,
          displayName: user.displayName,
          email: user.email,
          photoURL: user.photoURL,
        },
        profile: profileSnap.data() ?? {},
        entries,
      }
      const blob = new Blob([JSON.stringify(bundle, null, 2)], {
        type: 'application/json;charset=utf-8',
      })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `quiet-dwelling-export-${exportedAt.slice(0, 10)}.json`
      document.body.appendChild(link)
      link.click()
      link.remove()
      URL.revokeObjectURL(url)
    } catch (error) {
      setExportError(error instanceof Error ? error.message : 'Data export failed.')
    } finally {
      setExportStatus('idle')
    }
  }

  async function handleConsentChange(category: 'mood' | 'religion', enabled: boolean) {
    setConsentStatus('saving')
    setConsentError(null)
    try {
      await saveConsent({
        mood: category === 'mood' ? enabled : canProcessMood,
        religion: category === 'religion' ? enabled : canProcessReligion,
      })
    } catch (error) {
      setConsentError(error instanceof Error ? error.message : 'Could not update consent.')
    } finally {
      setConsentStatus('idle')
    }
  }

  async function handleWithdrawConsent() {
    const confirmed = window.confirm(
      'Withdraw consent for mood and scripture processing? Existing entry data will stay saved, but new mood and scripture writes will be blocked.',
    )
    if (!confirmed) return

    setConsentStatus('saving')
    setConsentError(null)
    try {
      await withdrawConsent()
    } catch (error) {
      setConsentError(error instanceof Error ? error.message : 'Could not withdraw consent.')
    } finally {
      setConsentStatus('idle')
    }
  }

  async function handleDeleteAccount() {
    if (!user || deleteStatus === 'deleting') return

    const confirmed = window.confirm(
      'Delete your Quiet Dwelling account? This permanently removes your account, profile metadata, reminder tokens, and server-side Google Drive token.',
    )
    if (!confirmed) return

    const typed = window.prompt('Type DELETE to confirm account deletion.')
    if (typed !== 'DELETE') return

    const shouldDeleteDrive =
      storageState.status === 'connected' &&
      window.confirm(
        'Also permanently delete the Quiet Dwelling folder from your Google Drive? If you choose no, those files stay in your Drive.',
      )

    setDeleteStatus('deleting')
    setDeleteError(null)
    try {
      if (shouldDeleteDrive) {
        try {
          await new GoogleDriveAdapter(user.uid).deleteAppFolder()
        } catch {
          window.alert(
            'Quiet Dwelling could not delete the Drive folder automatically. Your account will still be deleted; you can delete the Quiet Dwelling folder manually in Google Drive.',
          )
        }
      }

      const deleteAccount = httpsCallable<Record<string, never>, DeleteAccountResult>(
        functions,
        'deleteAccount',
      )
      await deleteAccount({})
      await localEntryCache.clearUserData(user.uid)
      clearLocalStorageForUser(user.uid)
      await signOut(auth).catch(() => undefined)
      navigate('/login', { replace: true })
    } catch (error) {
      setDeleteError(error instanceof Error ? error.message : 'Account deletion failed.')
    } finally {
      setDeleteStatus('idle')
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
          {storageState.status === 'connected' && (
            <div className="flex items-start justify-between gap-4">
              <span className="text-on-surface-variant/50 text-xs font-medium">Drive usage</span>
              <span className="text-on-surface-variant/70 text-right text-xs">
                {driveUsage ? formatDriveUsage(driveUsage) : '—'}
              </span>
            </div>
          )}
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

        {conflictMessage && (
          <p className="text-primary mt-3 text-xs font-medium">{conflictMessage}</p>
        )}

        {storageError && <p className="text-error mt-3 text-xs">{storageError}</p>}

        <div className="mt-5 flex justify-end gap-2">
          {storageState.status === 'connected' && (
            <button
              type="button"
              onClick={handleClearConflictBackups}
              disabled={storageAction !== null || conflictAction !== null}
              className="text-on-surface-variant/60 hover:text-error rounded-full px-3 py-1.5 text-xs font-semibold transition-colors disabled:opacity-50"
            >
              {conflictAction === 'clear' ? 'Clearing...' : 'Clear conflict backups'}
            </button>
          )}
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

      {/* Data */}
      <SettingsSection>
        <div className="mb-4 flex items-start gap-3">
          <span className="material-symbols-outlined text-primary text-[20px]">download</span>
          <div className="min-w-0 flex-1">
            <p className="text-on-surface text-sm font-medium">Your Data</p>
            <p className="text-on-surface-variant/60 mt-1 text-xs leading-relaxed">
              Export your profile metadata and all journal entries stored on this device.
            </p>
          </div>
        </div>

        {exportError && <p className="text-error mb-3 text-xs">{exportError}</p>}

        <div className="flex justify-end">
          <button
            type="button"
            onClick={handleExportData}
            disabled={!user || exportStatus === 'exporting'}
            className="bg-primary text-on-primary rounded-full px-4 py-2 text-xs font-semibold transition-opacity disabled:opacity-50"
          >
            {exportStatus === 'exporting' ? 'Exporting...' : 'Export my data'}
          </button>
        </div>
      </SettingsSection>

      {/* Sensitive data consent */}
      <SettingsSection>
        <div className="mb-4 flex items-start gap-3">
          <span className="material-symbols-outlined text-primary text-[20px]">privacy_tip</span>
          <div className="min-w-0 flex-1">
            <p className="text-on-surface text-sm font-medium">Sensitive Data Consent</p>
            <p className="text-on-surface-variant/60 mt-1 text-xs leading-relaxed">
              Mood and scripture fields are optional. You can change consent at any time.
            </p>
          </div>
        </div>

        <div className="border-outline-variant/20 space-y-4 border-t pt-4">
          <SettingsRow icon="mood" label="Mood fields">
            <Toggle
              id="consent-mood-toggle"
              label="Mood fields consent"
              enabled={canProcessMood}
              onChange={(enabled) => void handleConsentChange('mood', enabled)}
            />
          </SettingsRow>
          <SettingsRow icon="menu_book" label="Scripture references">
            <Toggle
              id="consent-religion-toggle"
              label="Scripture references consent"
              enabled={canProcessReligion}
              onChange={(enabled) => void handleConsentChange('religion', enabled)}
            />
          </SettingsRow>
        </div>

        {consentError && <p className="text-error mt-3 text-xs">{consentError}</p>}

        <div className="mt-5 flex justify-end">
          <button
            type="button"
            onClick={handleWithdrawConsent}
            disabled={consentStatus === 'saving' || (!canProcessMood && !canProcessReligion)}
            className="text-on-surface-variant/60 hover:text-error rounded-full px-3 py-1.5 text-xs font-semibold transition-colors disabled:opacity-50"
          >
            {consentStatus === 'saving' ? 'Saving...' : 'Withdraw consent'}
          </button>
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
        <div>
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

      {/* Legal */}
      <SettingsSection>
        <div className="mb-4 flex items-center gap-3">
          <span className="material-symbols-outlined text-primary text-[20px]">policy</span>
          <span className="text-on-surface text-sm font-medium">Legal</span>
        </div>
        <div className="border-outline-variant/20 divide-outline-variant/20 divide-y border-t">
          {[
            ['Privacy Policy', '/privacy'],
            ['Terms of Service', '/terms'],
            ['Account deletion', '/account-deletion'],
          ].map(([label, to]) => (
            <Link
              key={to}
              to={to}
              className="text-on-surface-variant/70 hover:text-primary flex items-center justify-between py-3 text-sm transition-colors"
            >
              <span>{label}</span>
              <span className="material-symbols-outlined text-[18px]">chevron_right</span>
            </Link>
          ))}
        </div>
      </SettingsSection>

      {/* Delete account */}
      <SettingsSection>
        <div className="mb-4 flex items-start gap-3">
          <span className="material-symbols-outlined text-error text-[20px]">delete_forever</span>
          <div className="min-w-0 flex-1">
            <p className="text-on-surface text-sm font-medium">Delete Account</p>
            <p className="text-on-surface-variant/60 mt-1 text-xs leading-relaxed">
              Permanently remove your account and clear this device. You can also delete the Quiet
              Dwelling folder from your Google Drive during the flow.
            </p>
          </div>
        </div>

        {deleteError && <p className="text-error mb-3 text-xs">{deleteError}</p>}

        <div className="flex justify-end">
          <button
            type="button"
            onClick={handleDeleteAccount}
            disabled={!user || deleteStatus === 'deleting'}
            className="text-error hover:bg-error/10 rounded-full px-3 py-1.5 text-xs font-semibold transition-colors disabled:opacity-50"
          >
            {deleteStatus === 'deleting' ? 'Deleting...' : 'Delete account'}
          </button>
        </div>
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
