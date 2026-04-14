import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

import MetadataChips from './MetadataChips'

describe('MetadataChips', () => {
  const defaultProps = {
    mood: null as null,
    moodLabel: null,
    tags: [] as string[],
    tagVocabulary: [] as string[],
    onMoodClick: vi.fn(),
    onTagClick: vi.fn(),
    onMoodChange: vi.fn(),
    onTagsChange: vi.fn(),
    onNewTag: vi.fn(),
  }

  it('renders "Add mood" slot when mood is null', () => {
    render(<MetadataChips {...defaultProps} />)
    expect(screen.getByText('Add mood')).toBeInTheDocument()
  })

  it('renders mood emoji and label when mood is set', () => {
    render(
      <MetadataChips
        {...defaultProps}
        mood={3}
        moodLabel="Calm"
      />,
    )
    expect(screen.getByText('🙂 Calm')).toBeInTheDocument()
  })

  it('renders mood emoji with default label when moodLabel is null', () => {
    render(
      <MetadataChips
        {...defaultProps}
        mood={5}
        moodLabel={null}
      />,
    )
    expect(screen.getByText('🥳 Radiant')).toBeInTheDocument()
  })

  it('renders tag chips for each tag', () => {
    render(
      <MetadataChips
        {...defaultProps}
        tags={['gratitude', 'morning']}
      />,
    )
    expect(screen.getByText('gratitude')).toBeInTheDocument()
    expect(screen.getByText('morning')).toBeInTheDocument()
  })

  it('calls onMoodClick when mood chip is clicked', () => {
    const onMoodClick = vi.fn()
    render(<MetadataChips {...defaultProps} onMoodClick={onMoodClick} />)
    fireEvent.click(screen.getByText('Add mood'))
    expect(onMoodClick).toHaveBeenCalledOnce()
  })

  it('calls onTagClick when add tag button is clicked', () => {
    const onTagClick = vi.fn()
    render(<MetadataChips {...defaultProps} onTagClick={onTagClick} />)
    fireEvent.click(screen.getByText('+ Add tag'))
    expect(onTagClick).toHaveBeenCalledOnce()
  })
})
