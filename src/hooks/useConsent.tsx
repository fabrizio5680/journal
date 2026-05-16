import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { onAuthStateChanged } from 'firebase/auth'
import { doc, onSnapshot, serverTimestamp, setDoc, type Timestamp } from 'firebase/firestore'

import { auth, db } from '@/lib/firebase'

export const CONSENT_VERSION = '1.0'

export interface ConsentSpecialCategories {
  religion: boolean
  mood: boolean
}

export interface ConsentRecord {
  consentGiven: boolean
  consentTimestamp?: Timestamp
  consentVersion?: string
  consentSpecialCategories: ConsentSpecialCategories
}

interface ConsentContextValue {
  isLoading: boolean
  consent: ConsentRecord | null
  requiresConsent: boolean
  canProcessMood: boolean
  canProcessReligion: boolean
  saveConsent: (categories: ConsentSpecialCategories) => Promise<void>
  withdrawConsent: () => Promise<void>
}

const defaultCategories: ConsentSpecialCategories = {
  religion: false,
  mood: false,
}

const ConsentContext = createContext<ConsentContextValue>({
  isLoading: true,
  consent: null,
  requiresConsent: false,
  canProcessMood: false,
  canProcessReligion: false,
  saveConsent: async () => {},
  withdrawConsent: async () => {},
})

function readConsent(data: Record<string, unknown> | undefined): ConsentRecord | null {
  if (!data || typeof data.consentVersion !== 'string') return null

  const special = data.consentSpecialCategories as Partial<ConsentSpecialCategories> | undefined
  return {
    consentGiven: data.consentGiven === true,
    consentTimestamp: data.consentTimestamp as Timestamp | undefined,
    consentVersion: data.consentVersion,
    consentSpecialCategories: {
      religion: special?.religion === true,
      mood: special?.mood === true,
    },
  }
}

export function ConsentProvider({ children }: { children: ReactNode }) {
  const [uid, setUid] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [consent, setConsent] = useState<ConsentRecord | null>(null)

  useEffect(() => {
    let unsubscribeSnapshot: (() => void) | null = null

    const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
      unsubscribeSnapshot?.()
      unsubscribeSnapshot = null
      setUid(user?.uid ?? null)
      setConsent(null)

      if (!user) {
        setIsLoading(false)
        return
      }

      setIsLoading(true)
      unsubscribeSnapshot = onSnapshot(
        doc(db, 'users', user.uid),
        (snapshot) => {
          setConsent(readConsent(snapshot.data()))
          setIsLoading(false)
        },
        () => {
          setConsent(null)
          setIsLoading(false)
        },
      )
    })

    return () => {
      unsubscribeAuth()
      unsubscribeSnapshot?.()
    }
  }, [])

  const saveConsent = useCallback(
    async (categories: ConsentSpecialCategories) => {
      if (!uid) return
      const consentGiven = categories.religion || categories.mood
      await setDoc(
        doc(db, 'users', uid),
        {
          consentGiven,
          consentTimestamp: serverTimestamp(),
          consentVersion: CONSENT_VERSION,
          consentSpecialCategories: categories,
        },
        { merge: true },
      )
    },
    [uid],
  )

  const withdrawConsent = useCallback(async () => {
    await saveConsent(defaultCategories)
  }, [saveConsent])

  const value = useMemo<ConsentContextValue>(() => {
    const categories = consent?.consentSpecialCategories ?? defaultCategories
    return {
      isLoading,
      consent,
      requiresConsent: !isLoading && uid !== null && consent?.consentVersion !== CONSENT_VERSION,
      canProcessMood: categories.mood,
      canProcessReligion: categories.religion,
      saveConsent,
      withdrawConsent,
    }
  }, [consent, isLoading, saveConsent, uid, withdrawConsent])

  return <ConsentContext.Provider value={value}>{children}</ConsentContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useConsent(): ConsentContextValue {
  return useContext(ConsentContext)
}
