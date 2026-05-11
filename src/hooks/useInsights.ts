import { useEffect, useState } from 'react'
import { onAuthStateChanged } from 'firebase/auth'

import { auth } from '@/lib/firebase'
import { EntryRepository } from '@/lib/storage/entryRepository'

interface InsightsData {
  moodByDate: Array<{ date: string; mood: number; moodLabel: string | null }>
  topTags: Array<{ tag: string; count: number }>
  totalEntries: number
  totalWords: number
  isLoading: boolean
}

const EMPTY: InsightsData = {
  moodByDate: [],
  topTags: [],
  totalEntries: 0,
  totalWords: 0,
  isLoading: true,
}

async function loadInsights(userId: string): Promise<InsightsData> {
  const entries = await EntryRepository.listMetadata(userId)

  const moodByDate = entries
    .filter((entry) => entry.mood != null)
    .map((entry) => ({
      date: entry.date,
      mood: entry.mood as number,
      moodLabel: entry.moodLabel,
    }))
    .sort((a, b) => a.date.localeCompare(b.date))

  const tagCounts = new Map<string, number>()
  for (const entry of entries) {
    for (const tag of entry.tags) {
      tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + 1)
    }
  }

  const topTags = Array.from(tagCounts.entries())
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag))
    .slice(0, 10)

  return {
    moodByDate,
    topTags,
    totalEntries: entries.length,
    totalWords: entries.reduce((sum, entry) => sum + entry.wordCount, 0),
    isLoading: false,
  }
}

export function useInsights(): InsightsData {
  const [data, setData] = useState<InsightsData>(EMPTY)

  useEffect(() => {
    let cancelled = false
    let unsubscribeRepository: (() => void) | null = null

    async function refresh(userId: string) {
      try {
        const nextData = await loadInsights(userId)
        if (!cancelled) setData(nextData)
      } catch {
        if (!cancelled) setData({ ...EMPTY, isLoading: false })
      }
    }

    const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
      unsubscribeRepository?.()
      unsubscribeRepository = null

      if (!user) {
        setData({ ...EMPTY, isLoading: false })
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

  return data
}
