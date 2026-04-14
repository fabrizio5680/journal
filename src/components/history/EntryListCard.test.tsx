import { describe, it, expect, vi } from 'vitest'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithProviders } from '@/test/render'
import EntryListCard from './EntryListCard'
import type { Entry } from '@/types'
import { Timestamp } from 'firebase/firestore'

// Mock useNavigate
const mockNavigate = vi.fn()
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  }
})

function makeEntry(overrides: Partial<Entry> = {}): Entry {
  return {
    date: '2026-04-10',
    content: { type: 'doc', content: [] },
    contentText: 'This is the body of the journal entry for testing purposes.',
    mood: null,
    moodLabel: null,
    tags: [],
    wordCount: 10,
    deleted: false,
    deletedAt: null,
    createdAt: {} as Timestamp,
    updatedAt: {} as Timestamp,
    ...overrides,
  }
}

describe('EntryListCard', () => {
  it('renders the date label formatted correctly', () => {
    renderWithProviders(<EntryListCard entry={makeEntry()} />)
    expect(screen.getByText('Friday, April 10, 2026')).toBeTruthy()
  })

  it('renders title derived from first H2 node in Tiptap JSON', () => {
    const entry = makeEntry({
      content: {
        type: 'doc',
        content: [
          {
            type: 'heading',
            attrs: { level: 2 },
            content: [{ type: 'text', text: 'My Journal Title' }],
          },
        ],
      },
    })
    renderWithProviders(<EntryListCard entry={entry} />)
    expect(screen.getByText('My Journal Title')).toBeTruthy()
  })

  it('falls back to first 60 chars of contentText when no heading found', () => {
    const entry = makeEntry({
      content: { type: 'doc', content: [] },
      contentText: 'No heading here just plain text.',
    })
    renderWithProviders(<EntryListCard entry={entry} />)
    // Title (h3) should show the fallback text
    expect(screen.getByRole('heading', { level: 3 }).textContent).toBe(
      'No heading here just plain text.',
    )
  })

  it('renders truncated excerpt from contentText', () => {
    const longText = 'a'.repeat(200)
    const entry = makeEntry({ contentText: longText })
    renderWithProviders(<EntryListCard entry={entry} />)
    // The excerpt element should contain only the first 120 chars
    const excerpt = screen.getByText('a'.repeat(120))
    expect(excerpt).toBeTruthy()
    expect(excerpt.className).toContain('line-clamp-2')
  })

  it('renders mood chip when mood is set', () => {
    const entry = makeEntry({ mood: 4, moodLabel: 'Peaceful' })
    renderWithProviders(<EntryListCard entry={entry} />)
    expect(screen.getByText(/😊/)).toBeTruthy()
    expect(screen.getByText(/Peaceful/)).toBeTruthy()
  })

  it('does not render mood chip when mood is null', () => {
    renderWithProviders(<EntryListCard entry={makeEntry({ mood: null })} />)
    expect(screen.queryByText(/😊|😔|😐|🙂|🥳/)).toBeNull()
  })

  it('navigates to /entry/{date} when card is clicked', async () => {
    const user = userEvent.setup()
    renderWithProviders(<EntryListCard entry={makeEntry({ date: '2026-04-10' })} />)

    await user.click(screen.getByRole('button'))
    expect(mockNavigate).toHaveBeenCalledWith('/entry/2026-04-10')
  })

  it('navigates when Enter key is pressed on card', async () => {
    const user = userEvent.setup()
    renderWithProviders(<EntryListCard entry={makeEntry({ date: '2026-04-10' })} />)

    const card = screen.getByRole('button')
    card.focus()
    await user.keyboard('{Enter}')
    expect(mockNavigate).toHaveBeenCalledWith('/entry/2026-04-10')
  })
})
