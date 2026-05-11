import { useEffect, useState } from 'react'
import { endOfMonth, format } from 'date-fns'

import { EntryRepository } from '@/lib/storage/entryRepository'

export function useEntryDates(userId: string, year: number, month: number): Set<string> {
  const [dates, setDates] = useState<Set<string>>(new Set())

  useEffect(() => {
    if (!userId) {
      const t = setTimeout(() => setDates(new Set()), 0)
      return () => clearTimeout(t)
    }

    let cancelled = false
    const monthStr = String(month).padStart(2, '0')
    const startDate = `${year}-${monthStr}-01`
    const endDate = format(endOfMonth(new Date(year, month - 1)), 'yyyy-MM-dd')

    async function loadDates() {
      try {
        const metadata = await EntryRepository.listMetadata(userId, {
          from: startDate,
          to: endDate,
        })
        if (!cancelled) setDates(new Set(metadata.map((entry) => entry.date)))
      } catch {
        if (!cancelled) setDates(new Set())
      }
    }

    void loadDates()
    const unsubscribe = EntryRepository.subscribe(userId, () => void loadDates())

    return () => {
      cancelled = true
      unsubscribe()
    }
  }, [userId, year, month])

  return dates
}
