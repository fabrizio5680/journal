import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import MetadataBar from './MetadataBar'

import type { ScriptureRef } from '@/types'

// ---- module mocks ----

vi.mock('@/components/scripture/ScriptureChip', () => ({
  default: ({
    ref_,
    onRemove,
  }: {
    ref_: ScriptureRef
    translation: string
    onRemove?: () => void
  }) => (
    <div data-testid={`scripture-chip-${ref_.passageId}`}>
      <span>{ref_.reference}</span>
      {onRemove && (
        <button type="button" aria-label={`Remove ${ref_.reference}`} onClick={onRemove}>
          ×
        </button>
      )}
    </div>
  ),
}))

vi.mock('@/components/scripture/ScriptureRefInput', () => ({
  default: ({ onAdd }: { translation: string; onAdd: (ref: ScriptureRef) => void }) => (
    <div data-testid="scripture-ref-input">
      <button
        type="button"
        onClick={() => onAdd({ reference: 'John 3:16', passageId: 'JHN.3.16' })}
      >
        Mock Add
      </button>
    </div>
  ),
}))

vi.mock('@/components/mood/MoodPicker', () => ({
  default: ({
    value,
    onChange,
  }: {
    value: number | null
    label: string | null
    onChange: (mood: number | null, label: string | null) => void
  }) => (
    <div data-testid="mood-picker">
      <button type="button" onClick={() => onChange(3, 'Hopeful')}>
        Pick Hopeful
      </button>
      {value !== null && (
        <button type="button" onClick={() => onChange(null, null)}>
          Clear Mood
        </button>
      )}
    </div>
  ),
}))

vi.mock('@/components/tags/TagInput', () => ({
  default: ({
    tags,
    onChange,
  }: {
    tags: string[]
    vocabulary: string[]
    onChange: (tags: string[]) => void
    onNewTag?: (tag: string) => void
  }) => (
    <div data-testid="tag-input">
      <button type="button" onClick={() => onChange([...tags, 'faith'])}>
        Add Faith
      </button>
    </div>
  ),
}))

// ---- helpers ----

const sampleRefs: ScriptureRef[] = [
  { reference: 'John 3:16', passageId: 'JHN.3.16' },
  { reference: 'Romans 8:28', passageId: 'ROM.8.28' },
]

const defaultProps = {
  mood: null as null,
  moodLabel: null,
  tags: [] as string[],
  tagVocabulary: [] as string[],
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

// ---- tests ----

describe('MetadataBar', () => {
  // Mood chip
  it('renders mood chip placeholder when mood is null', () => {
    render(<MetadataBar {...defaultProps} />)
    expect(screen.getByRole('button', { name: '+ mood' })).toBeInTheDocument()
  })

  it('renders mood emoji and label when mood is set', () => {
    render(<MetadataBar {...defaultProps} mood={3} moodLabel="Hopeful" />)
    expect(screen.getByText('🌱')).toBeInTheDocument()
    expect(screen.getByText('Hopeful')).toBeInTheDocument()
  })

  it('renders mood emoji with default label when moodLabel is null', () => {
    render(<MetadataBar {...defaultProps} mood={5} moodLabel={null} />)
    expect(screen.getByText('😄')).toBeInTheDocument()
    expect(screen.getByText('Joyful')).toBeInTheDocument()
  })

  it('renders Weary emoji (😮‍💨) when moodLabel="Weary" and mood=1, not Sorrowful emoji (😢)', () => {
    render(<MetadataBar {...defaultProps} mood={1} moodLabel="Weary" />)
    expect(screen.getByText('😮‍💨')).toBeInTheDocument()
    expect(screen.getByText('Weary')).toBeInTheDocument()
    expect(screen.queryByText('😢')).not.toBeInTheDocument()
  })

  it('renders Sorrowful emoji (😢) when moodLabel="Sorrowful" and mood=1, not Weary emoji (😮‍💨)', () => {
    render(<MetadataBar {...defaultProps} mood={1} moodLabel="Sorrowful" />)
    expect(screen.getByText('😢')).toBeInTheDocument()
    expect(screen.getByText('Sorrowful')).toBeInTheDocument()
    expect(screen.queryByText('😮‍💨')).not.toBeInTheDocument()
  })

  // Tag chips
  it('renders tag chips for each tag', () => {
    render(<MetadataBar {...defaultProps} tags={['gratitude', 'morning']} />)
    expect(screen.getByText('gratitude')).toBeInTheDocument()
    expect(screen.getByText('morning')).toBeInTheDocument()
  })

  // Scripture chips
  it('renders a ScriptureChip for each existing ref', () => {
    render(<MetadataBar {...defaultProps} scriptureRefs={sampleRefs} />)
    expect(screen.getByTestId('scripture-chip-JHN.3.16')).toBeInTheDocument()
    expect(screen.getByTestId('scripture-chip-ROM.8.28')).toBeInTheDocument()
    expect(screen.getByText('John 3:16')).toBeInTheDocument()
    expect(screen.getByText('Romans 8:28')).toBeInTheDocument()
  })

  // Mood picker toggle
  it('clicking mood chip shows MoodPicker', async () => {
    const user = userEvent.setup()
    render(<MetadataBar {...defaultProps} />)

    expect(screen.queryByTestId('mood-picker')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '+ mood' }))
    expect(screen.getByTestId('mood-picker')).toBeInTheDocument()
  })

  it('clicking mood chip a second time hides MoodPicker (toggle)', async () => {
    const user = userEvent.setup()
    render(<MetadataBar {...defaultProps} />)

    const moodBtn = screen.getByRole('button', { name: '+ mood' })
    await user.click(moodBtn)
    expect(screen.getByTestId('mood-picker')).toBeInTheDocument()

    await user.click(moodBtn)
    expect(screen.queryByTestId('mood-picker')).not.toBeInTheDocument()
  })

  // Scripture picker toggle
  it('renders the "+ scripture" button', () => {
    render(<MetadataBar {...defaultProps} />)
    expect(screen.getByRole('button', { name: /Add scripture reference/i })).toBeInTheDocument()
  })

  it('clicking "+ scripture" shows ScriptureRefInput', async () => {
    const user = userEvent.setup()
    render(<MetadataBar {...defaultProps} />)

    expect(screen.queryByTestId('scripture-ref-input')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /Add scripture reference/i }))
    expect(screen.getByTestId('scripture-ref-input')).toBeInTheDocument()
  })

  it('clicking "+ scripture" a second time hides ScriptureRefInput (toggle)', async () => {
    const user = userEvent.setup()
    render(<MetadataBar {...defaultProps} />)

    const addBtn = screen.getByRole('button', { name: /Add scripture reference/i })
    await user.click(addBtn)
    expect(screen.getByTestId('scripture-ref-input')).toBeInTheDocument()

    await user.click(addBtn)
    expect(screen.queryByTestId('scripture-ref-input')).not.toBeInTheDocument()
  })

  // Tag picker toggle
  it('clicking "+ tag" shows TagInput', async () => {
    const user = userEvent.setup()
    render(<MetadataBar {...defaultProps} />)

    expect(screen.queryByTestId('tag-input')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /Add tag/i }))
    expect(screen.getByTestId('tag-input')).toBeInTheDocument()
  })

  it('clicking "+ tag" a second time hides TagInput (toggle)', async () => {
    const user = userEvent.setup()
    render(<MetadataBar {...defaultProps} />)

    const tagBtn = screen.getByRole('button', { name: /Add tag/i })
    await user.click(tagBtn)
    expect(screen.getByTestId('tag-input')).toBeInTheDocument()

    await user.click(tagBtn)
    expect(screen.queryByTestId('tag-input')).not.toBeInTheDocument()
  })

  // Mutual exclusion
  it('opening scripture picker closes mood picker', async () => {
    const user = userEvent.setup()
    render(<MetadataBar {...defaultProps} />)

    await user.click(screen.getByRole('button', { name: '+ mood' }))
    expect(screen.getByTestId('mood-picker')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /Add scripture reference/i }))
    expect(screen.queryByTestId('mood-picker')).not.toBeInTheDocument()
    expect(screen.getByTestId('scripture-ref-input')).toBeInTheDocument()
  })

  it('opening tag picker closes scripture picker', async () => {
    const user = userEvent.setup()
    render(<MetadataBar {...defaultProps} />)

    await user.click(screen.getByRole('button', { name: /Add scripture reference/i }))
    expect(screen.getByTestId('scripture-ref-input')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /Add tag/i }))
    expect(screen.queryByTestId('scripture-ref-input')).not.toBeInTheDocument()
    expect(screen.getByTestId('tag-input')).toBeInTheDocument()
  })

  // Callbacks
  it('calls onScriptureRefsChange with ref filtered out when remove is clicked', () => {
    const onScriptureRefsChange = vi.fn()
    render(
      <MetadataBar
        {...defaultProps}
        scriptureRefs={sampleRefs}
        onScriptureRefsChange={onScriptureRefsChange}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: /Remove John 3:16/i }))

    expect(onScriptureRefsChange).toHaveBeenCalledOnce()
    expect(onScriptureRefsChange).toHaveBeenCalledWith([
      { reference: 'Romans 8:28', passageId: 'ROM.8.28' },
    ])
  })

  it('calls onScriptureRefsChange with new ref appended when ScriptureRefInput fires onAdd', async () => {
    const onScriptureRefsChange = vi.fn()
    const user = userEvent.setup()

    render(
      <MetadataBar
        {...defaultProps}
        scriptureRefs={[]}
        onScriptureRefsChange={onScriptureRefsChange}
      />,
    )

    await user.click(screen.getByRole('button', { name: /Add scripture reference/i }))
    await user.click(screen.getByRole('button', { name: /Mock Add/i }))

    expect(onScriptureRefsChange).toHaveBeenCalledOnce()
    expect(onScriptureRefsChange).toHaveBeenCalledWith([
      { reference: 'John 3:16', passageId: 'JHN.3.16' },
    ])
  })

  it('hides ScriptureRefInput after a ref is added', async () => {
    const user = userEvent.setup()
    render(<MetadataBar {...defaultProps} />)

    await user.click(screen.getByRole('button', { name: /Add scripture reference/i }))
    expect(screen.getByTestId('scripture-ref-input')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /Mock Add/i }))
    expect(screen.queryByTestId('scripture-ref-input')).not.toBeInTheDocument()
  })

  it('calls onMoodChange and closes picker when a mood is selected', async () => {
    const onMoodChange = vi.fn()
    const user = userEvent.setup()

    render(<MetadataBar {...defaultProps} onMoodChange={onMoodChange} />)

    await user.click(screen.getByRole('button', { name: '+ mood' }))
    await user.click(screen.getByRole('button', { name: 'Pick Hopeful' }))

    expect(onMoodChange).toHaveBeenCalledOnce()
    expect(onMoodChange).toHaveBeenCalledWith(3, 'Hopeful')
    expect(screen.queryByTestId('mood-picker')).not.toBeInTheDocument()
  })
})
