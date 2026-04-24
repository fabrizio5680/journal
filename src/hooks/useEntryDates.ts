import { useState, useEffect } from 'react'
import { collection, query, where, onSnapshot } from 'firebase/firestore'
import { endOfMonth, format } from 'date-fns'

import { db } from '@/lib/firebase'

export function useEntryDates(userId: string, year: number, month: number): Set<string> {
  const [dates, setDates] = useState<Set<string>>(new Set())

  useEffect(() => {
    if (!userId) return

    const monthStr = String(month).padStart(2, '0')
    const startDate = `${year}-${monthStr}-01`
    const endDate = format(endOfMonth(new Date(year, month - 1)), 'yyyy-MM-dd')

    const entriesRef = collection(db, 'users', userId, 'entries')
    const q = query(
      entriesRef,
      where('deleted', '==', false),
      where('date', '>=', startDate),
      where('date', '<=', endDate),
    )

    const unsub = onSnapshot(
      q,
      (snapshot) => {
        const dateSet = new Set<string>()
        snapshot.forEach((doc) => {
          dateSet.add(doc.id)
        })
        setDates(dateSet)
      },
      () => {
        setDates(new Set())
      },
    )

    return unsub
  }, [userId, year, month])

  return dates
}
