import { useEffect, useState } from 'react'
import { doc, onSnapshot } from 'firebase/firestore'
import { onAuthStateChanged } from 'firebase/auth'

import { auth, db } from '@/lib/firebase'
import DailyScripture from '@/components/ui/DailyScripture'

type Translation = 'NLT' | 'MSG' | 'ESV'

export default function RightPanel() {
  const [isOnline, setIsOnline] = useState(navigator.onLine)
  const [translation, setTranslation] = useState<Translation>('NLT')

  // Watch online/offline status
  useEffect(() => {
    const onOnline = () => setIsOnline(true)
    const onOffline = () => setIsOnline(false)
    window.addEventListener('online', onOnline)
    window.addEventListener('offline', onOffline)
    return () => {
      window.removeEventListener('online', onOnline)
      window.removeEventListener('offline', onOffline)
    }
  }, [])

  // Read translation preference from user doc
  useEffect(() => {
    let unsubscribeSnapshot: (() => void) | null = null

    const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
      unsubscribeSnapshot?.()
      unsubscribeSnapshot = null

      if (!user) return

      const userRef = doc(db, 'users', user.uid)
      unsubscribeSnapshot = onSnapshot(userRef, (snap) => {
        const data = snap.data()
        if (data?.scriptureTranslation) {
          setTranslation(data.scriptureTranslation as Translation)
        }
      })
    })

    return () => {
      unsubscribeAuth()
      unsubscribeSnapshot?.()
    }
  }, [])

  return (
    <aside className="bg-surface border-outline-variant/10 fixed top-0 right-0 z-30 hidden h-screen w-80 flex-col gap-6 border-l px-6 py-8 xl:flex">
      <DailyScripture translation={translation} />

      {/* Sync status */}
      <div className="text-on-surface-variant mt-auto flex items-center gap-2 text-xs">
        {isOnline ? (
          <>
            <span className="material-symbols-outlined text-primary text-base">cloud_done</span>
            <span>Synced to Cloud</span>
          </>
        ) : (
          <>
            <span className="material-symbols-outlined text-on-surface-variant text-base">
              cloud_off
            </span>
            <span>Offline — changes will sync</span>
          </>
        )}
      </div>
    </aside>
  )
}
