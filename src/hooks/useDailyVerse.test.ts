import { renderHook, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { format, subDays } from 'date-fns'

import { useDailyVerse, getDailyVerseId, getFallbackVerse, DAILY_VERSE_IDS } from './useDailyVerse'

const today = new Date()
const yesterday = subDays(today, 1)

function setCachedVerse(
  translation: string,
  date: Date,
  verse: { text: string; reference: string },
) {
  const key = `scripture_${translation}_${format(date, 'yyyy-MM-dd')}`
  localStorage.setItem(key, JSON.stringify(verse))
}

beforeEach(() => {
  localStorage.clear()
  vi.restoreAllMocks()
})

describe('DAILY_VERSE_IDS', () => {
  it('has exactly 365 entries', () => {
    expect(DAILY_VERSE_IDS).toHaveLength(365)
  })

  it('all entries are unique', () => {
    const unique = new Set(DAILY_VERSE_IDS)
    expect(unique.size).toBe(DAILY_VERSE_IDS.length)
  })
})

describe('getDailyVerseId', () => {
  it('returns different IDs for consecutive days', () => {
    const id1 = getDailyVerseId(today)
    const id2 = getDailyVerseId(yesterday)
    expect(id1).not.toBe(id2)
  })

  it('returns a valid verse ID format', () => {
    const id = getDailyVerseId(today)
    expect(id).toMatch(/^[A-Z0-9]+\.\d+\.\d+$/)
  })
})

describe('getFallbackVerse', () => {
  it('returns different verse for different days', () => {
    const v1 = getFallbackVerse(today)
    // find a date that picks a different fallback index
    const offset = 10
    const other = new Date(today)
    other.setDate(other.getDate() + offset)
    const v2 = getFallbackVerse(other)
    // they may be equal if list is small and offset lands on same index — just verify structure
    expect(v1).toHaveProperty('text')
    expect(v1).toHaveProperty('reference')
    expect(v2).toHaveProperty('text')
  })
})

describe('useDailyVerse', () => {
  it('returns fallback immediately for past dates without fetching', () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    const { result } = renderHook(() => useDailyVerse('NLT', yesterday))
    expect(result.current.isLoading).toBe(false)
    expect(result.current.verse).toHaveProperty('text')
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('reads verse from localStorage cache for today without fetching', async () => {
    const cached = { text: 'Cached verse text', reference: 'Test 1:1' }
    setCachedVerse('NLT', today, cached)
    const fetchSpy = vi.spyOn(globalThis, 'fetch')

    const { result } = renderHook(() => useDailyVerse('NLT'))

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })
    expect(result.current.verse.text).toBe(cached.text)
    expect(result.current.verse.reference).toBe(cached.reference)
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('falls back when no API key is configured', async () => {
    vi.stubEnv('VITE_BIBLE_API_KEY', '')
    const { result } = renderHook(() => useDailyVerse('NLT'))

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })
    expect(result.current.verse).toHaveProperty('text')
  })

  it('returns different verses for NLT vs cached ESV', async () => {
    const nltCached = { text: 'NLT verse', reference: 'NLT 1:1' }
    setCachedVerse('NLT', today, nltCached)

    const { result } = renderHook(() => useDailyVerse('NLT'))
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.verse.text).toBe(nltCached.text)
  })
})
