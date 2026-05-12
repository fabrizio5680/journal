import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { onAuthStateChanged, type User } from 'firebase/auth'

import { subscribeDriveLoadProgress, type DriveLoadProgress } from '@/lib/storage/driveLoadProgress'
import {
  subscribeProviderConnection,
  type ProviderConnectionState,
} from '@/lib/storage/providerConnection'
import type { StorageProvider, SyncStatus } from '@/lib/storage/types'
import { auth } from '@/lib/firebase'

const DISCONNECTED_PROVIDER_STATE: ProviderConnectionState = {
  status: 'disconnected',
  deviceConnected: false,
}

interface SaveStatusContextValue {
  isDirty: boolean
  lastSaved: Date | null
  syncStatus: SyncStatus
  storageProvider?: StorageProvider
  storageAccountEmail?: string
  appAccountEmail?: string | null
  driveLoadProgress: DriveLoadProgress | null
  setDirty: (v: boolean) => void
  setLastSaved: (d: Date) => void
  setEntrySyncStatus: (status: SyncStatus) => void
}

const SaveStatusContext = createContext<SaveStatusContextValue | null>(null)

export function SaveStatusProvider({ children }: { children: ReactNode }) {
  const [isDirty, setDirty] = useState(false)
  const [lastSaved, setLastSaved] = useState<Date | null>(null)
  const [entrySyncStatus, setEntrySyncStatus] = useState<SyncStatus>('saved-local')
  const [user, setUser] = useState<User | null>(null)
  const [connection, setConnection] = useState<ProviderConnectionState>(DISCONNECTED_PROVIDER_STATE)
  const [driveLoadProgress, setDriveLoadProgress] = useState<DriveLoadProgress | null>(null)

  useEffect(() => onAuthStateChanged(auth, setUser), [])

  useEffect(() => {
    if (!user) return
    return subscribeProviderConnection(user.uid, setConnection)
  }, [user])

  useEffect(() => subscribeDriveLoadProgress(setDriveLoadProgress), [])

  const activeConnection = user ? connection : DISCONNECTED_PROVIDER_STATE
  const syncStatus =
    activeConnection.status === 'reconnect'
      ? 'reconnect'
      : activeConnection.status === 'connected'
        ? entrySyncStatus
        : 'saved-local'

  return (
    <SaveStatusContext.Provider
      value={{
        isDirty,
        lastSaved,
        syncStatus,
        storageProvider: activeConnection.activeStorageProvider,
        storageAccountEmail: activeConnection.storageAccountEmail,
        appAccountEmail: user?.email,
        driveLoadProgress,
        setDirty,
        setLastSaved,
        setEntrySyncStatus,
      }}
    >
      {children}
    </SaveStatusContext.Provider>
  )
}

// Context files legitimately export both a provider component and a consumer hook.
// eslint-disable-next-line react-refresh/only-export-components
export function useSaveStatus() {
  const ctx = useContext(SaveStatusContext)
  if (!ctx) throw new Error('useSaveStatus must be used within SaveStatusProvider')
  return ctx
}
