import { useEffect, useState } from 'react'
import { collection, query, where, orderBy, limit, getDocs } from 'firebase/firestore'
import { onAuthStateChanged } from 'firebase/auth'

import { auth, db } from '@/lib/firebase'

interface InsightsData {
  moodByDate: Array<{ date: string; mood: number }>
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

export function useInsights(): InsightsData {
  const [data, setData] = useState<InsightsData>(EMPTY)

  useEffect(() => {
    let cancelled = false

    const unsubscribeAuth = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        setData({ ...EMPTY, isLoading: false })
        return
      }

      const entriesRef = collection(db, 'users', user.uid, 'entries')
      const q = query(
        entriesRef,
        where('deleted', '==', false),
        orderBy('date', 'desc'),
        limit(90),
      )

      try {
        const snapshot = await getDocs(q)
        if (cancelled) return

        const entries = snapshot.docs.map((doc) => doc.data())

        // moodByDate: entries with mood set, sorted ASC for chart display
        const moodByDate = entries
          .filter((e) => e.mood != null)
          .map((e) => ({ date: e.date as string, mood: e.mood as number }))
          .sort((a, b) => a.date.localeCompare(b.date))

        // topTags: flatten all tags, count occurrences, sort DESC then alpha, top 10
        const tagCounts = new Map<string, number>()
        for (const e of entries) {
          const tags = (e.tags as string[]) ?? []
          for (const tag of tags) {
            tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + 1)
          }
        }
        const topTags = Array.from(tagCounts.entries())
          .map(([tag, count]) => ({ tag, count }))
          .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag))
          .slice(0, 10)

        const totalEntries = entries.length
        const totalWords = entries.reduce((sum, e) => sum + ((e.wordCount as number) ?? 0), 0)

        setData({ moodByDate, topTags, totalEntries, totalWords, isLoading: false })
      } catch {
        if (cancelled) return
        setData({ ...EMPTY, isLoading: false })
      }
    })

    return () => {
      cancelled = true
      unsubscribeAuth()
    }
  }, [])

  return data
}
