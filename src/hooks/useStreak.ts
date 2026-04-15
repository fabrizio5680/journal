import { useEffect, useState } from 'react'
import { collection, query, where, orderBy, limit, onSnapshot } from 'firebase/firestore'
import { onAuthStateChanged } from 'firebase/auth'
import { format, subDays, parseISO, differenceInDays } from 'date-fns'

import { auth, db } from '@/lib/firebase'

interface StreakResult {
  current: number
  longest: number
}

function computeStreaks(dates: string[]): StreakResult {
  if (dates.length === 0) return { current: 0, longest: 0 }

  // Sort ascending for longest streak calculation
  const ascending = [...dates].sort()

  // Longest streak via sliding window
  let longest = 1
  let window = 1
  for (let i = 1; i < ascending.length; i++) {
    const diff = differenceInDays(parseISO(ascending[i]), parseISO(ascending[i - 1]))
    if (diff === 1) {
      window++
      if (window > longest) longest = window
    } else {
      window = 1
    }
  }

  // Current streak — count back from today (or yesterday if today has no entry)
  const dateSet = new Set(dates)
  const todayStr = format(new Date(), 'yyyy-MM-dd')
  const yesterdayStr = format(subDays(new Date(), 1), 'yyyy-MM-dd')

  let startDate: Date | null = null
  if (dateSet.has(todayStr)) {
    startDate = new Date()
  } else if (dateSet.has(yesterdayStr)) {
    startDate = subDays(new Date(), 1)
  }

  if (!startDate) return { current: 0, longest }

  let current = 0
  let checkDate = startDate
  while (dateSet.has(format(checkDate, 'yyyy-MM-dd'))) {
    current++
    checkDate = subDays(checkDate, 1)
  }

  return { current, longest }
}

export function useStreak(): StreakResult {
  const [streak, setStreak] = useState<StreakResult>({ current: 0, longest: 0 })

  useEffect(() => {
    let unsubscribeSnapshot: (() => void) | null = null

    const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
      unsubscribeSnapshot?.()
      unsubscribeSnapshot = null

      if (!user) {
        setStreak({ current: 0, longest: 0 })
        return
      }

      const entriesRef = collection(db, 'users', user.uid, 'entries')
      const q = query(
        entriesRef,
        where('deleted', '==', false),
        orderBy('date', 'desc'),
        limit(365),
      )

      unsubscribeSnapshot = onSnapshot(
        q,
        (snapshot) => {
          const dates = snapshot.docs.map((doc) => doc.id)
          setStreak(computeStreaks(dates))
        },
        () => {
          setStreak({ current: 0, longest: 0 })
        },
      )
    })

    return () => {
      unsubscribeAuth()
      unsubscribeSnapshot?.()
    }
  }, [])

  return streak
}
