import { useEffect, useState } from 'react'
import { onAuthStateChanged } from 'firebase/auth'

import { auth } from '@/lib/firebase'
import { EntryRepository } from '@/lib/storage/entryRepository'

export interface RemoteUpdateBannerState {
  hasRemoteUpdate: boolean
  remoteUpdatedAt: string
}

export function useRemoteUpdateBanner(date: string): RemoteUpdateBannerState | null {
  const [uid, setUid] = useState<string | null>(null)
  const [state, setState] = useState<RemoteUpdateBannerState | null>(null)

  useEffect(() => {
    return onAuthStateChanged(auth, (user) => {
      setUid(user?.uid ?? null)
    })
  }, [])

  useEffect(() => {
    if (!uid) return

    let cancelled = false

    async function loadBannerState() {
      if (!uid || cancelled) return
      const [meta] = await EntryRepository.listMetadata(uid, { from: date, to: date })
      if (cancelled) return
      if (meta?.remoteRevisionId && meta.remoteUpdatedAt && meta.syncStatus !== 'synced') {
        setState({
          hasRemoteUpdate: true,
          remoteUpdatedAt: meta.remoteUpdatedAt,
        })
      } else {
        setState(null)
      }
    }

    void loadBannerState()
    const unsubscribe = EntryRepository.subscribe(uid, () => void loadBannerState())
    return () => {
      cancelled = true
      unsubscribe()
    }
  }, [uid, date])

  return state
}
