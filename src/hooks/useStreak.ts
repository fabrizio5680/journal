import { useEffect, useState } from 'react'
import { onAuthStateChanged } from 'firebase/auth'
import { format, subDays, parseISO, differenceInDays } from 'date-fns'

import { auth } from '@/lib/firebase'
import { EntryRepository } from '@/lib/storage/entryRepository'

interface StreakResult {
  current: number
  longest: number
}

function computeStreaks(dates: string[]): StreakResult {
  if (dates.length === 0) return { current: 0, longest: 0 }

  const ascending = [...dates].sort()

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
    let unsubscribeRepository: (() => void) | null = null
    let cancelled = false

    async function refresh(userId: string) {
      try {
        const metadata = await EntryRepository.listMetadata(userId)
        if (!cancelled) setStreak(computeStreaks(metadata.map((entry) => entry.date)))
      } catch {
        if (!cancelled) setStreak({ current: 0, longest: 0 })
      }
    }

    const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
      unsubscribeRepository?.()
      unsubscribeRepository = null

      if (!user) {
        setStreak({ current: 0, longest: 0 })
        return
      }

      void refresh(user.uid)
      unsubscribeRepository = EntryRepository.subscribe(user.uid, () => void refresh(user.uid))
    })

    return () => {
      cancelled = true
      unsubscribeAuth()
      unsubscribeRepository?.()
    }
  }, [])

  return streak
}
