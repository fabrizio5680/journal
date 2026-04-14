import { useState, useEffect, useCallback } from 'react'
import { doc, onSnapshot, updateDoc, arrayUnion } from 'firebase/firestore'
import { onAuthStateChanged } from 'firebase/auth'

import { auth, db } from '@/lib/firebase'

export function useTagVocabulary() {
  const [uid, setUid] = useState<string | null | undefined>(undefined)
  const [vocabulary, setVocabulary] = useState<string[]>([])

  useEffect(() => {
    return onAuthStateChanged(auth, (user) => {
      setUid(user?.uid ?? null)
    })
  }, [])

  useEffect(() => {
    if (!uid) return

    const userRef = doc(db, 'users', uid)
    return onSnapshot(userRef, (snap) => {
      if (snap.exists()) {
        setVocabulary((snap.data().tagVocabulary as string[]) ?? [])
      }
    })
  }, [uid])

  const addToVocabulary = useCallback(
    async (tag: string) => {
      if (!uid) return
      const userRef = doc(db, 'users', uid)
      await updateDoc(userRef, { tagVocabulary: arrayUnion(tag) })
    },
    [uid],
  )

  return { vocabulary, addToVocabulary }
}
