import { describe, it, expect } from 'vitest'
import { screen } from '@testing-library/react'
import { Timestamp } from 'firebase/firestore'

import MoodSummaryBar from './MoodSummaryBar'

import { renderWithProviders } from '@/test/render'
import type { Entry } from '@/types'

function makeEntry(overrides: Partial<Entry> = {}): Entry {
  return {
    date: '2026-04-10',
    content: { type: 'doc', content: [] },
    contentText: '',
    mood: null,
    moodLabel: null,
    tags: [],
    wordCount: 0,
    deleted: false,
    deletedAt: null,
    createdAt: {} as Timestamp,
    updatedAt: {} as Timestamp,
    ...overrides,
  }
}

describe('MoodSummaryBar', () => {
  it('renders empty state when no entries have mood', () => {
    renderWithProviders(<MoodSummaryBar entries={[makeEntry()]} />)
    expect(screen.getByText('No entries yet this month.')).toBeTruthy()
  })

  it('renders empty state when entries array is empty', () => {
    renderWithProviders(<MoodSummaryBar entries={[]} />)
    expect(screen.getByText('No entries yet this month.')).toBeTruthy()
  })

  it('renders bar and caption for low avg mood (heavy)', () => {
    const entries = [makeEntry({ mood: 1 }), makeEntry({ mood: 1 })]
    renderWithProviders(<MoodSummaryBar entries={entries} />)
    expect(screen.getByText('A heavy month — be gentle with yourself.')).toBeTruthy()
  })

  it('renders caption for mixed avg mood', () => {
    const entries = [makeEntry({ mood: 2 }), makeEntry({ mood: 2 })]
    renderWithProviders(<MoodSummaryBar entries={entries} />)
    expect(screen.getByText('A mixed month — some light, some shadow.')).toBeTruthy()
  })

  it('renders caption for calm avg mood', () => {
    const entries = [makeEntry({ mood: 3 }), makeEntry({ mood: 3 })]
    renderWithProviders(<MoodSummaryBar entries={entries} />)
    expect(screen.getByText('A calm month — steady and grounded.')).toBeTruthy()
  })

  it('renders caption for peaceful avg mood', () => {
    const entries = [makeEntry({ mood: 4 }), makeEntry({ mood: 4 })]
    renderWithProviders(<MoodSummaryBar entries={entries} />)
    expect(screen.getByText("A peaceful month — you're finding your rhythm.")).toBeTruthy()
  })

  it('renders caption for radiant avg mood', () => {
    const entries = [makeEntry({ mood: 5 }), makeEntry({ mood: 5 })]
    renderWithProviders(<MoodSummaryBar entries={entries} />)
    expect(screen.getByText('A radiant month — your light is shining.')).toBeTruthy()
  })

  it('skips entries with null mood in average calculation', () => {
    const entries = [makeEntry({ mood: null }), makeEntry({ mood: 5 })]
    renderWithProviders(<MoodSummaryBar entries={entries} />)
    expect(screen.getByText('A radiant month — your light is shining.')).toBeTruthy()
  })

  it('renders bars for all mood ranges', () => {
    const entries = [
      makeEntry({ mood: 1 }),
      makeEntry({ mood: 2 }),
      makeEntry({ mood: 3 }),
      makeEntry({ mood: 4 }),
      makeEntry({ mood: 5 }),
    ]
    const { container } = renderWithProviders(<MoodSummaryBar entries={entries} />)
    const bars = container.querySelectorAll('.h-1.rounded-full')
    expect(bars.length).toBe(4)
  })
})
