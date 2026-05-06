import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, fireEvent, waitFor, within } from '@testing-library/react'
import React from 'react'

import MetadataBar from './MetadataBar'

import { renderWithProviders } from '@/test/render'
import { MOODS } from '@/lib/moods'
import type { ScriptureRef } from '@/types'
import * as FocusModeContext from '@/context/FocusModeContext'

// ---- module mocks ----

vi.mock('@/context/FocusModeContext', async () => {
  const actual = await vi.importActual<typeof import('@/context/FocusModeContext')>(
    '@/context/FocusModeContext',
  )
  return {
    ...actual,
    useFocusMode: vi.fn().mockReturnValue({ isFocused: false, toggle: vi.fn(), exit: vi.fn() }),
  }
})

// Render portal content inline so jsdom can query it
vi.mock('react-dom', async () => {
  const actual = await vi.importActual<typeof import('react-dom')>('react-dom')
  return { ...actual, createPortal: (node: React.ReactNode) => node }
})

vi.mock('@/components/scripture/ScriptureRefInput', () => ({
  default: ({ onAdd }: { onAdd: (ref: ScriptureRef) => void }) => (
    <button
      type="button"
      data-testid="mock-scripture-input"
      onClick={() => onAdd({ reference: 'John 3:16', passageId: 'john-3-16' })}
    >
      mock-scripture-input
    </button>
  ),
}))

// TagInput uses UserPreferencesContext; mock it so we don't need the full provider tree
vi.mock('@/components/tags/TagInput', () => ({
  default: ({
    tags,
  }: {
    tags: string[]
    vocabulary: string[]
    onChange: unknown
    onNewTag?: unknown
  }) => (
    <div data-testid="tag-input">
      {tags.map((t) => (
        <span key={t} data-testid={`tag-${t}`}>
          {t}
        </span>
      ))}
    </div>
  ),
}))

// ---- helpers ----

/**
 * The sheet (MetadataSheet) is always in the DOM (CSS translateY animation).
 * "Open" state = transform: translateY(0px) or translateY(<small>px)
 * "Closed" state = transform: translateY(100%)
 * We detect open state via the sheet div's style attribute.
 */
function getSheetDiv() {
  // The sheet is the fixed bottom div with rounded-t-3xl
  return document.querySelector('.fixed.bottom-0') as HTMLElement | null
}

function isSheetOpen() {
  const sheet = getSheetDiv()
  if (!sheet) return false
  const transform = sheet.style.transform
  // Open = translateY(0px), Closed = translateY(100%)
  return transform !== 'translateY(100%)'
}

// ---- test data ----

const defaultProps = {
  mood: null as 1 | 2 | 3 | 4 | 5 | null,
  moodLabel: null as string | null,
  tags: [] as string[],
  tagVocabulary: ['prayer', 'gratitude'] as string[],
  onMoodChange: vi.fn(),
  onTagsChange: vi.fn(),
  onNewTag: vi.fn(),
  scriptureRefs: [] as ScriptureRef[],
  scriptureTranslation: 'NLT' as const,
  onScriptureRefsChange: vi.fn(),
}

beforeEach(() => {
  vi.clearAllMocks()
})

function openSheet() {
  const bar = screen.getByTestId('metadata-bar')
  const outerBtn = bar.querySelector('button') as HTMLButtonElement
  fireEvent.click(outerBtn)
}

// ---- tests ----

describe('MetadataBar', () => {
  // 1. Collapsed strip renders correctly
  it('renders the metadata-bar testid', () => {
    renderWithProviders(<MetadataBar {...defaultProps} />)
    expect(screen.getByTestId('metadata-bar')).toBeInTheDocument()
  })

  it('shows "+ Mood" placeholder when no mood is set', () => {
    renderWithProviders(<MetadataBar {...defaultProps} />)
    // Strip has a pill with text "+ Mood"
    const bar = screen.getByTestId('metadata-bar')
    expect(within(bar).getByText('+ Mood')).toBeInTheDocument()
  })

  it('shows scripture count 0 in the strip', () => {
    renderWithProviders(<MetadataBar {...defaultProps} />)
    // Two count spans exist in the strip (scripture=0, tag=0)
    const bar = screen.getByTestId('metadata-bar')
    const zeros = within(bar).getAllByText('0')
    expect(zeros.length).toBeGreaterThanOrEqual(2)
  })

  it('shows "Edit" text in the strip', () => {
    renderWithProviders(<MetadataBar {...defaultProps} />)
    const bar = screen.getByTestId('metadata-bar')
    expect(within(bar).getByText('Edit')).toBeInTheDocument()
  })

  it('sheet is closed on initial render', () => {
    renderWithProviders(<MetadataBar {...defaultProps} />)
    expect(isSheetOpen()).toBe(false)
  })

  // 2. Strip shows mood emoji when mood is set
  it('shows mood emoji in the strip when mood is set', () => {
    const mood = MOODS[0] // Sorrowful, value=1
    renderWithProviders(<MetadataBar {...defaultProps} mood={mood.value} moodLabel={mood.label} />)
    const bar = screen.getByTestId('metadata-bar')
    // The strip pill (inside the outer button, not in the sheet) shows the emoji
    const outerButton = bar.querySelector('button') as HTMLButtonElement
    expect(within(outerButton).getByText(mood.emoji)).toBeInTheDocument()
    expect(within(outerButton).getByText(mood.label)).toBeInTheDocument()
  })

  // 3. Tapping outer button opens sheet
  it('clicking outer button opens the sheet', () => {
    renderWithProviders(<MetadataBar {...defaultProps} />)
    expect(isSheetOpen()).toBe(false)
    openSheet()
    expect(isSheetOpen()).toBe(true)
  })

  // 4. Tapping mood pill opens sheet
  it('clicking mood pill opens the sheet', () => {
    renderWithProviders(<MetadataBar {...defaultProps} />)
    expect(isSheetOpen()).toBe(false)
    const bar = screen.getByTestId('metadata-bar')
    const moodPill = within(bar).getAllByRole('presentation')[0]
    fireEvent.click(moodPill)
    expect(isSheetOpen()).toBe(true)
  })

  // 5. Tapping scripture count opens sheet
  it('clicking scripture count pill opens the sheet', () => {
    renderWithProviders(<MetadataBar {...defaultProps} />)
    expect(isSheetOpen()).toBe(false)
    const bar = screen.getByTestId('metadata-bar')
    const pills = within(bar).getAllByRole('presentation')
    // pills[1] = scripture count
    fireEvent.click(pills[1])
    expect(isSheetOpen()).toBe(true)
  })

  // 6. Tapping tag count opens sheet
  it('clicking tag count pill opens the sheet', () => {
    renderWithProviders(<MetadataBar {...defaultProps} />)
    expect(isSheetOpen()).toBe(false)
    const bar = screen.getByTestId('metadata-bar')
    const pills = within(bar).getAllByRole('presentation')
    // pills[2] = tag count
    fireEvent.click(pills[2])
    expect(isSheetOpen()).toBe(true)
  })

  // 7. Sheet close button closes sheet
  it('clicking Close button closes the sheet', () => {
    renderWithProviders(<MetadataBar {...defaultProps} />)
    openSheet()
    expect(isSheetOpen()).toBe(true)

    const closeBtn = screen.getByRole('button', { name: 'Close' })
    fireEvent.click(closeBtn)
    expect(isSheetOpen()).toBe(false)
  })

  // 8. Backdrop click closes sheet
  it('clicking backdrop closes the sheet', () => {
    renderWithProviders(<MetadataBar {...defaultProps} />)
    openSheet()
    expect(isSheetOpen()).toBe(true)

    // The backdrop is the fixed inset-0 div (not the sheet div)
    const backdrop = document.querySelector('.fixed.inset-0') as HTMLElement
    expect(backdrop).toBeTruthy()
    fireEvent.click(backdrop)
    expect(isSheetOpen()).toBe(false)
  })

  // 9. Mood selection calls onMoodChange
  it('clicking a mood button in the sheet calls onMoodChange with correct args', () => {
    const onMoodChange = vi.fn()
    renderWithProviders(<MetadataBar {...defaultProps} onMoodChange={onMoodChange} />)
    openSheet()

    const targetMood = MOODS[0] // Sorrowful, value=1
    // The sheet's mood grid contains buttons with the mood label text
    const sheet = getSheetDiv()!
    const moodBtn = within(sheet).getByRole('button', { name: new RegExp(targetMood.label, 'i') })
    fireEvent.click(moodBtn)

    expect(onMoodChange).toHaveBeenCalledOnce()
    expect(onMoodChange).toHaveBeenCalledWith(targetMood.value, targetMood.label)
  })

  // 10. Mood deselection (toggle)
  it('clicking already-selected mood button calls onMoodChange with (null, null)', () => {
    const onMoodChange = vi.fn()
    const mood = MOODS[0] // Sorrowful
    renderWithProviders(
      <MetadataBar
        {...defaultProps}
        mood={mood.value}
        moodLabel={mood.label}
        onMoodChange={onMoodChange}
      />,
    )
    openSheet()

    const sheet = getSheetDiv()!
    const moodBtn = within(sheet).getByRole('button', { name: new RegExp(mood.label, 'i') })
    fireEvent.click(moodBtn)

    expect(onMoodChange).toHaveBeenCalledWith(null, null)
  })

  // 11. Scripture remove calls onScriptureRefsChange
  it('clicking remove scripture button calls onScriptureRefsChange with ref filtered out', () => {
    const onScriptureRefsChange = vi.fn()
    const refs: ScriptureRef[] = [{ reference: 'John 3:16', passageId: 'john-3-16' }]
    renderWithProviders(
      <MetadataBar
        {...defaultProps}
        scriptureRefs={refs}
        onScriptureRefsChange={onScriptureRefsChange}
      />,
    )
    openSheet()

    const removeBtn = screen.getByRole('button', { name: 'Remove John 3:16' })
    fireEvent.click(removeBtn)

    expect(onScriptureRefsChange).toHaveBeenCalledOnce()
    expect(onScriptureRefsChange).toHaveBeenCalledWith([])
  })

  // 12. Tags section renders TagInput with existing tags
  it('renders TagInput with existing tags visible in the sheet', () => {
    renderWithProviders(<MetadataBar {...defaultProps} tags={['prayer']} />)
    openSheet()

    expect(screen.getByTestId('tag-input')).toBeInTheDocument()
    expect(screen.getByTestId('tag-prayer')).toBeInTheDocument()
  })

  // 13. Add scripture flow
  it('clicking "Add scripture" shows mock input; clicking mock fires onScriptureRefsChange', async () => {
    const onScriptureRefsChange = vi.fn()
    renderWithProviders(
      <MetadataBar {...defaultProps} onScriptureRefsChange={onScriptureRefsChange} />,
    )
    openSheet()

    // The dashed "Add scripture" button is in the sheet
    const sheet = getSheetDiv()!
    const addScriptureBtn = within(sheet).getByRole('button', { name: /Add scripture/i })
    fireEvent.click(addScriptureBtn)

    // Mock scripture input should now appear
    expect(screen.getByTestId('mock-scripture-input')).toBeInTheDocument()

    // Click mock to trigger onAdd
    fireEvent.click(screen.getByTestId('mock-scripture-input'))

    await waitFor(() => {
      expect(onScriptureRefsChange).toHaveBeenCalledOnce()
      expect(onScriptureRefsChange).toHaveBeenCalledWith([
        { reference: 'John 3:16', passageId: 'john-3-16' },
      ])
    })
  })

  // ---- Additional coverage ----

  it('sheet contains Mood, Scripture, and Tags section labels', () => {
    renderWithProviders(<MetadataBar {...defaultProps} />)
    openSheet()
    const sheet = getSheetDiv()!
    expect(within(sheet).getByText('Mood')).toBeInTheDocument()
    expect(within(sheet).getByText('Scripture')).toBeInTheDocument()
    expect(within(sheet).getByText('Tags')).toBeInTheDocument()
  })

  it('"Entry details" heading is present in the sheet', () => {
    renderWithProviders(<MetadataBar {...defaultProps} />)
    openSheet()
    const sheet = getSheetDiv()!
    expect(within(sheet).getByText('Entry details')).toBeInTheDocument()
  })

  it('has md:hidden class on the root element', () => {
    renderWithProviders(<MetadataBar {...defaultProps} />)
    const bar = screen.getByTestId('metadata-bar')
    expect(bar.className).toContain('md:hidden')
  })

  it('strip shows correct scripture count when refs are passed', () => {
    renderWithProviders(
      <MetadataBar
        {...defaultProps}
        scriptureRefs={[
          { reference: 'John 3:16', passageId: 'j1' },
          { reference: 'Romans 8:28', passageId: 'r1' },
        ]}
      />,
    )
    const bar = screen.getByTestId('metadata-bar')
    const outerBtn = bar.querySelector('button') as HTMLButtonElement
    // The scripture count is in the strip's scripture pill
    const scripturePill = within(outerBtn).getAllByRole('presentation')[1]
    expect(within(scripturePill).getByText('2')).toBeInTheDocument()
  })

  it('strip shows correct tag count when tags are passed', () => {
    renderWithProviders(<MetadataBar {...defaultProps} tags={['prayer', 'gratitude', 'faith']} />)
    const bar = screen.getByTestId('metadata-bar')
    const outerBtn = bar.querySelector('button') as HTMLButtonElement
    // The tag count is in the strip's tag pill
    const tagPill = within(outerBtn).getAllByRole('presentation')[2]
    expect(within(tagPill).getByText('3')).toBeInTheDocument()
  })

  it('hides with opacity-0 and pointer-events-none when focus mode is active', () => {
    vi.mocked(FocusModeContext.useFocusMode).mockReturnValueOnce({
      isFocused: true,
      toggle: vi.fn(),
      exit: vi.fn(),
    })
    renderWithProviders(<MetadataBar {...defaultProps} />)
    const bar = screen.getByTestId('metadata-bar')
    expect(bar.className).toContain('opacity-0')
    expect(bar.className).toContain('pointer-events-none')
  })
})
