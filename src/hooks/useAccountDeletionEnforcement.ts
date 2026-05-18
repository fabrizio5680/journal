import { useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { onIdTokenChanged, type User } from 'firebase/auth'
import { doc, onSnapshot } from 'firebase/firestore'

import { auth, db } from '@/lib/firebase'
import {
  hasSeenAccountDocument,
  markAccountDocumentSeen,
  signOutDeletedAccount,
} from '@/lib/accountCleanup'

const DELETED_AUTH_CODES = new Set([
  'auth/user-not-found',
  'auth/user-disabled',
  'auth/invalid-user-token',
  'auth/user-token-expired',
])

function errorCode(error: unknown): string | undefined {
  return typeof error === 'object' && error !== null && 'code' in error
    ? String((error as { code?: unknown }).code)
    : undefined
}

function isDeletedAuthError(error: unknown): boolean {
  const code = errorCode(error)
  return code !== undefined && DELETED_AUTH_CODES.has(code)
}

export function useAccountDeletionEnforcement(): void {
  const navigate = useNavigate()
  const cleanupStartedRef = useRef(false)
  const currentUserRef = useRef<User | null>(null)

  useEffect(() => {
    let unsubscribeUserDoc: (() => void) | null = null
    let disposed = false

    async function cleanup(userId: string) {
      if (cleanupStartedRef.current || disposed) return
      cleanupStartedRef.current = true
      await signOutDeletedAccount(userId)
      if (!disposed) navigate('/login', { replace: true })
    }

    async function verifyAuthUser(user: User) {
      try {
        await user.reload()
      } catch (error) {
        if (isDeletedAuthError(error)) await cleanup(user.uid)
      }
    }

    function watchUserDocument(user: User) {
      unsubscribeUserDoc?.()
      unsubscribeUserDoc = onSnapshot(
        doc(db, 'users', user.uid),
        (snapshot) => {
          if (snapshot.exists()) {
            markAccountDocumentSeen(user.uid)
            return
          }
          if (hasSeenAccountDocument(user.uid)) void cleanup(user.uid)
        },
        () => {
          void verifyAuthUser(user)
        },
      )
    }

    const unsubscribeToken = onIdTokenChanged(auth, (user) => {
      currentUserRef.current = user
      cleanupStartedRef.current = false
      unsubscribeUserDoc?.()
      unsubscribeUserDoc = null

      if (!user) return
      watchUserDocument(user)
      void verifyAuthUser(user)
    })

    const verifyCurrentUser = () => {
      const user = currentUserRef.current
      if (user) void verifyAuthUser(user)
    }

    window.addEventListener('focus', verifyCurrentUser)
    document.addEventListener('visibilitychange', verifyCurrentUser)
    const intervalId = window.setInterval(verifyCurrentUser, 5 * 60 * 1000)

    return () => {
      disposed = true
      unsubscribeToken()
      unsubscribeUserDoc?.()
      window.removeEventListener('focus', verifyCurrentUser)
      document.removeEventListener('visibilitychange', verifyCurrentUser)
      window.clearInterval(intervalId)
    }
  }, [navigate])
}
