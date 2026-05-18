import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { deleteUser, onAuthStateChanged, signOut, type User } from 'firebase/auth'
import { doc, onSnapshot, serverTimestamp, setDoc, type Timestamp } from 'firebase/firestore'

import { auth, db } from '@/lib/firebase'

export const POLICY_VERSION = '1.0'
export const TOS_VERSION = '1.0'

export interface LegalAcceptanceRecord {
  ageAttested: boolean
  ageAttestedAt?: Timestamp
  acceptedPolicyVersion?: string
  acceptedTosVersion?: string
  policyAcceptedAt?: Timestamp
  tosAcceptedAt?: Timestamp
}

interface LegalAcceptanceContextValue {
  isLoading: boolean
  user: User | null
  record: LegalAcceptanceRecord | null
  requiresLegalAcceptance: boolean
  acceptLegalTerms: () => Promise<void>
  declineForAge: () => Promise<void>
}

const LegalAcceptanceContext = createContext<LegalAcceptanceContextValue>({
  isLoading: true,
  user: null,
  record: null,
  requiresLegalAcceptance: false,
  acceptLegalTerms: async () => {},
  declineForAge: async () => {},
})

function major(version: string | undefined): string | null {
  return version?.split('.')[0] ?? null
}

function hasCurrentMajor(storedVersion: string | undefined, requiredVersion: string): boolean {
  return major(storedVersion) === major(requiredVersion)
}

function readRecord(data: Record<string, unknown> | undefined): LegalAcceptanceRecord | null {
  if (!data) return null
  return {
    ageAttested: data.ageAttested === true,
    ageAttestedAt: data.ageAttestedAt as Timestamp | undefined,
    acceptedPolicyVersion:
      typeof data.acceptedPolicyVersion === 'string' ? data.acceptedPolicyVersion : undefined,
    acceptedTosVersion:
      typeof data.acceptedTosVersion === 'string' ? data.acceptedTosVersion : undefined,
    policyAcceptedAt: data.policyAcceptedAt as Timestamp | undefined,
    tosAcceptedAt: data.tosAcceptedAt as Timestamp | undefined,
  }
}

function isAccepted(record: LegalAcceptanceRecord | null): boolean {
  return (
    record?.ageAttested === true &&
    hasCurrentMajor(record.acceptedPolicyVersion, POLICY_VERSION) &&
    hasCurrentMajor(record.acceptedTosVersion, TOS_VERSION)
  )
}

export function LegalAcceptanceProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [record, setRecord] = useState<LegalAcceptanceRecord | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    let unsubscribeSnapshot: (() => void) | null = null

    const unsubscribeAuth = onAuthStateChanged(auth, (nextUser) => {
      unsubscribeSnapshot?.()
      unsubscribeSnapshot = null
      setUser(nextUser)
      setRecord(null)

      if (!nextUser) {
        setIsLoading(false)
        return
      }

      setIsLoading(true)
      unsubscribeSnapshot = onSnapshot(
        doc(db, 'users', nextUser.uid),
        (snapshot) => {
          setRecord(readRecord(snapshot.data()))
          setIsLoading(false)
        },
        () => {
          setRecord(null)
          setIsLoading(false)
        },
      )
    })

    return () => {
      unsubscribeAuth()
      unsubscribeSnapshot?.()
    }
  }, [])

  const acceptLegalTerms = useCallback(async () => {
    if (!user) return
    await setDoc(
      doc(db, 'users', user.uid),
      {
        ageAttested: true,
        ageAttestedAt: serverTimestamp(),
        acceptedPolicyVersion: POLICY_VERSION,
        acceptedTosVersion: TOS_VERSION,
        policyAcceptedAt: serverTimestamp(),
        tosAcceptedAt: serverTimestamp(),
      },
      { merge: true },
    )
  }, [user])

  const declineForAge = useCallback(async () => {
    const currentUser = auth.currentUser
    if (!currentUser) return

    try {
      await deleteUser(currentUser)
    } catch {
      await signOut(auth)
    }
  }, [])

  const value = useMemo<LegalAcceptanceContextValue>(
    () => ({
      isLoading,
      user,
      record,
      requiresLegalAcceptance: !isLoading && user !== null && !isAccepted(record),
      acceptLegalTerms,
      declineForAge,
    }),
    [acceptLegalTerms, declineForAge, isLoading, record, user],
  )

  return <LegalAcceptanceContext.Provider value={value}>{children}</LegalAcceptanceContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useLegalAcceptance(): LegalAcceptanceContextValue {
  return useContext(LegalAcceptanceContext)
}
