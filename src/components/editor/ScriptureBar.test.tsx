import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import ScriptureBar from './ScriptureBar'

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

// ---- helpers ----

const sampleRefs: ScriptureRef[] = [
  { reference: 'John 3:16', passageId: 'JHN.3.16' },
  { reference: 'Romans 8:28', passageId: 'ROM.8.28' },
]

const defaultProps = {
  scriptureRefs: [] as ScriptureRef[],
  scriptureTranslation: 'NLT' as const,
  onScriptureRefsChange: vi.fn(),
}

beforeEach(() => {
  vi.clearAllMocks()
})

// ---- tests ----

describe('ScriptureBar', () => {
  it('renders the "+ scripture" button when there are no refs', () => {
    render(<ScriptureBar {...defaultProps} />)
    expect(screen.getByRole('button', { name: /Add scripture reference/i })).toBeInTheDocument()
  })

  it('clicking "+ scripture" shows ScriptureRefInput', async () => {
    const user = userEvent.setup()
    render(<ScriptureBar {...defaultProps} />)

    expect(screen.queryByTestId('scripture-ref-input')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /Add scripture reference/i }))

    expect(screen.getByTestId('scripture-ref-input')).toBeInTheDocument()
  })

  it('clicking "+ scripture" a second time hides ScriptureRefInput (toggle)', async () => {
    const user = userEvent.setup()
    render(<ScriptureBar {...defaultProps} />)

    const addBtn = screen.getByRole('button', { name: /Add scripture reference/i })
    await user.click(addBtn)
    expect(screen.getByTestId('scripture-ref-input')).toBeInTheDocument()

    await user.click(addBtn)
    expect(screen.queryByTestId('scripture-ref-input')).not.toBeInTheDocument()
  })

  it('renders a ScriptureChip for each existing ref', () => {
    render(<ScriptureBar {...defaultProps} scriptureRefs={sampleRefs} />)

    expect(screen.getByTestId('scripture-chip-JHN.3.16')).toBeInTheDocument()
    expect(screen.getByTestId('scripture-chip-ROM.8.28')).toBeInTheDocument()
    expect(screen.getByText('John 3:16')).toBeInTheDocument()
    expect(screen.getByText('Romans 8:28')).toBeInTheDocument()
  })

  it('calls onScriptureRefsChange with the ref filtered out when remove is clicked', () => {
    const onScriptureRefsChange = vi.fn()
    render(
      <ScriptureBar
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

  it('calls onScriptureRefsChange with the new ref appended when ScriptureRefInput fires onAdd', async () => {
    const onScriptureRefsChange = vi.fn()
    const user = userEvent.setup()

    render(
      <ScriptureBar
        {...defaultProps}
        scriptureRefs={[]}
        onScriptureRefsChange={onScriptureRefsChange}
      />,
    )

    // Open the input
    await user.click(screen.getByRole('button', { name: /Add scripture reference/i }))

    // Trigger the mock onAdd
    await user.click(screen.getByRole('button', { name: /Mock Add/i }))

    expect(onScriptureRefsChange).toHaveBeenCalledOnce()
    expect(onScriptureRefsChange).toHaveBeenCalledWith([
      { reference: 'John 3:16', passageId: 'JHN.3.16' },
    ])
  })

  it('hides ScriptureRefInput after a ref is added', async () => {
    const user = userEvent.setup()
    render(<ScriptureBar {...defaultProps} />)

    await user.click(screen.getByRole('button', { name: /Add scripture reference/i }))
    expect(screen.getByTestId('scripture-ref-input')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /Mock Add/i }))
    expect(screen.queryByTestId('scripture-ref-input')).not.toBeInTheDocument()
  })
})
