import { describe, it, expect, vi } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import React from 'react'

import RightPanel from './RightPanel'

import { EditorControlsProvider, useEditorControls } from '@/context/EditorControlsContext'
import { UserPreferencesProvider } from '@/context/UserPreferencesContext'
import type { MetadataControls } from '@/context/EditorControlsContext'

vi.mock('@/components/ui/DailyScripture', () => ({
  default: () => <div data-testid="daily-scripture" />,
}))

vi.mock('@/components/mood/MoodPicker', () => ({
  default: ({ onChange }: { onChange: (mood: number | null, label: string | null) => void }) => (
    <div data-testid="mood-picker-panel">
      <button onClick={() => onChange(3, 'Hopeful')}>Pick Hopeful</button>
    </div>
  ),
}))

vi.mock('@/components/scripture/ScriptureRefInput', () => ({
  default: ({ onAdd }: { onAdd: (ref: { reference: string; passageId: string }) => void }) => (
    <div data-testid="scripture-ref-input-panel">
      <button onClick={() => onAdd({ reference: 'John 1:1', passageId: 'JHN.1.1' })}>
        Add John 1:1
      </button>
    </div>
  ),
}))

vi.mock('@/components/tags/TagInput', () => ({
  default: () => <div data-testid="tag-input-panel" />,
}))

vi.mock('@/hooks/useScriptureRef', () => ({
  useScriptureRef: () => ({ text: 'Mocked verse text.', isLoading: false, error: null }),
}))

vi.mock('@/context/UserPreferencesContext', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/context/UserPreferencesContext')>()
  return {
    ...actual,
    useUserPreferences: () => ({ scriptureTranslation: 'NLT' }),
    UserPreferencesProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  }
})

function Wrapper({ children }: { children: React.ReactNode }) {
  return (
    <EditorControlsProvider>
      <UserPreferencesProvider>{children}</UserPreferencesProvider>
    </EditorControlsProvider>
  )
}

function EditorRegistrar({
  onReady,
}: {
  onReady: (reg: ReturnType<typeof useEditorControls>['register']) => void
}) {
  const { register } = useEditorControls()
  onReady(register)
  return null
}

describe('RightPanel — editor controls section', () => {
  it('does not show editor controls when no editor is active', () => {
    render(
      <Wrapper>
        <RightPanel />
      </Wrapper>,
    )
    expect(screen.queryByRole('button', { name: /dictate/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /text size/i })).not.toBeInTheDocument()
  })

  it('shows dictation and font size controls when editor is active', () => {
    let doRegister: ReturnType<typeof useEditorControls>['register']

    render(
      <Wrapper>
        <EditorRegistrar
          onReady={(r) => {
            doRegister = r
          }}
        />
        <RightPanel />
      </Wrapper>,
    )

    act(() => {
      doRegister!({
        dictation: {
          isSupported: true,
          state: 'idle',
          errorMessage: null,
          onStart: vi.fn(),
          onStop: vi.fn(),
        },
        fontSize: 'medium',
        onFontSizeChange: vi.fn(),
        wordCount: 5,
      })
    })

    expect(screen.getByRole('button', { name: /dictate/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /text size: medium/i })).toBeInTheDocument()
  })

  it('hides dictation button when dictation is not supported', () => {
    let doRegister: ReturnType<typeof useEditorControls>['register']

    render(
      <Wrapper>
        <EditorRegistrar
          onReady={(r) => {
            doRegister = r
          }}
        />
        <RightPanel />
      </Wrapper>,
    )

    act(() => {
      doRegister!({
        dictation: {
          isSupported: false,
          state: 'idle',
          errorMessage: null,
          onStart: vi.fn(),
          onStop: vi.fn(),
        },
        fontSize: 'medium',
        onFontSizeChange: vi.fn(),
        wordCount: 0,
      })
    })

    expect(screen.queryByRole('button', { name: /dictate/i })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /text size: medium/i })).toBeInTheDocument()
  })

  it('shows stop label when dictation is listening', () => {
    let doRegister: ReturnType<typeof useEditorControls>['register']

    render(
      <Wrapper>
        <EditorRegistrar
          onReady={(r) => {
            doRegister = r
          }}
        />
        <RightPanel />
      </Wrapper>,
    )

    act(() => {
      doRegister!({
        dictation: {
          isSupported: true,
          state: 'listening',
          errorMessage: null,
          onStart: vi.fn(),
          onStop: vi.fn(),
        },
        fontSize: 'medium',
        onFontSizeChange: vi.fn(),
        wordCount: 10,
      })
    })

    expect(screen.getByRole('button', { name: /stop dictation/i })).toBeInTheDocument()
  })

  it('calls onStop when listening button is clicked', async () => {
    let doRegister: ReturnType<typeof useEditorControls>['register']
    const onStop = vi.fn()

    render(
      <Wrapper>
        <EditorRegistrar
          onReady={(r) => {
            doRegister = r
          }}
        />
        <RightPanel />
      </Wrapper>,
    )

    act(() => {
      doRegister!({
        dictation: {
          isSupported: true,
          state: 'listening',
          errorMessage: null,
          onStart: vi.fn(),
          onStop,
        },
        fontSize: 'medium',
        onFontSizeChange: vi.fn(),
        wordCount: 3,
      })
    })

    await userEvent.click(screen.getByRole('button', { name: /stop dictation/i }))
    expect(onStop).toHaveBeenCalled()
  })

  it('font size cycle calls onFontSizeChange with next size', async () => {
    let doRegister: ReturnType<typeof useEditorControls>['register']
    const onFontSizeChange = vi.fn()

    render(
      <Wrapper>
        <EditorRegistrar
          onReady={(r) => {
            doRegister = r
          }}
        />
        <RightPanel />
      </Wrapper>,
    )

    act(() => {
      doRegister!({
        dictation: null,
        fontSize: 'small',
        onFontSizeChange,
        wordCount: 0,
      })
    })

    await userEvent.click(screen.getByRole('button', { name: /text size: small/i }))
    expect(onFontSizeChange).toHaveBeenCalledWith('medium')
  })

  it('displays word count from context', () => {
    let doRegister: ReturnType<typeof useEditorControls>['register']

    render(
      <Wrapper>
        <EditorRegistrar
          onReady={(r) => {
            doRegister = r
          }}
        />
        <RightPanel />
      </Wrapper>,
    )

    act(() => {
      doRegister!({
        dictation: null,
        fontSize: 'medium',
        onFontSizeChange: vi.fn(),
        wordCount: 42,
      })
    })

    expect(screen.getByText('42 words')).toBeInTheDocument()
  })

  it('displays singular word for count of 1', () => {
    let doRegister: ReturnType<typeof useEditorControls>['register']

    render(
      <Wrapper>
        <EditorRegistrar
          onReady={(r) => {
            doRegister = r
          }}
        />
        <RightPanel />
      </Wrapper>,
    )

    act(() => {
      doRegister!({
        dictation: null,
        fontSize: 'medium',
        onFontSizeChange: vi.fn(),
        wordCount: 1,
      })
    })

    expect(screen.getByText('1 word')).toBeInTheDocument()
  })

  it('shows dictation error message when state is error', () => {
    let doRegister: ReturnType<typeof useEditorControls>['register']

    render(
      <Wrapper>
        <EditorRegistrar
          onReady={(r) => {
            doRegister = r
          }}
        />
        <RightPanel />
      </Wrapper>,
    )

    act(() => {
      doRegister!({
        dictation: {
          isSupported: true,
          state: 'error',
          errorMessage: 'Microphone not available',
          onStart: vi.fn(),
          onStop: vi.fn(),
        },
        fontSize: 'medium',
        onFontSizeChange: vi.fn(),
        wordCount: 0,
      })
    })

    expect(screen.getByText('Microphone not available')).toBeInTheDocument()
  })

  it('font size icon is text-primary when size is not medium', () => {
    let doRegister: ReturnType<typeof useEditorControls>['register']

    render(
      <Wrapper>
        <EditorRegistrar
          onReady={(r) => {
            doRegister = r
          }}
        />
        <RightPanel />
      </Wrapper>,
    )

    act(() => {
      doRegister!({
        dictation: null,
        fontSize: 'large',
        onFontSizeChange: vi.fn(),
        wordCount: 0,
        metadata: buildMetadata(),
      })
    })

    const fontBtn = screen.getByRole('button', { name: /text size: large/i })
    expect(fontBtn).toHaveClass('text-primary')
  })

  it('font size icon is not text-primary when size is medium', () => {
    let doRegister: ReturnType<typeof useEditorControls>['register']

    render(
      <Wrapper>
        <EditorRegistrar
          onReady={(r) => {
            doRegister = r
          }}
        />
        <RightPanel />
      </Wrapper>,
    )

    act(() => {
      doRegister!({
        dictation: null,
        fontSize: 'medium',
        onFontSizeChange: vi.fn(),
        wordCount: 0,
        metadata: buildMetadata(),
      })
    })

    const fontBtn = screen.getByRole('button', { name: /text size: medium/i })
    expect(fontBtn).not.toHaveClass('text-primary')
  })
})

// ── Metadata section ──────────────────────────────────────────────────────────

function buildMetadata(overrides: Partial<MetadataControls> = {}): MetadataControls {
  return {
    mood: null,
    moodLabel: null,
    tags: [],
    tagVocabulary: [],
    scriptureRefs: [],
    scriptureTranslation: 'NLT',
    onMoodChange: vi.fn(),
    onTagsChange: vi.fn(),
    onNewTag: vi.fn(),
    onScriptureRefsChange: vi.fn(),
    ...overrides,
  }
}

describe('RightPanel — metadata section', () => {
  it('does not show metadata when no editor is active', () => {
    render(
      <Wrapper>
        <RightPanel />
      </Wrapper>,
    )

    expect(screen.queryByTestId('mood-picker-panel')).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: /add scripture reference/i }),
    ).not.toBeInTheDocument()
    expect(screen.queryByTestId('tag-input-panel')).not.toBeInTheDocument()
  })

  it('does not show metadata when editor is active but metadata is null', () => {
    let doRegister: ReturnType<typeof useEditorControls>['register']

    render(
      <Wrapper>
        <EditorRegistrar
          onReady={(r) => {
            doRegister = r
          }}
        />
        <RightPanel />
      </Wrapper>,
    )

    act(() => {
      doRegister!({
        dictation: null,
        fontSize: 'medium',
        onFontSizeChange: vi.fn(),
        wordCount: 0,
        metadata: null,
      })
    })

    expect(screen.queryByTestId('mood-picker-panel')).not.toBeInTheDocument()
  })

  it('MoodPicker is NOT visible by default (mood section collapsed)', () => {
    let doRegister: ReturnType<typeof useEditorControls>['register']

    render(
      <Wrapper>
        <EditorRegistrar
          onReady={(r) => {
            doRegister = r
          }}
        />
        <RightPanel />
      </Wrapper>,
    )

    act(() => {
      doRegister!({
        dictation: null,
        fontSize: 'medium',
        onFontSizeChange: vi.fn(),
        wordCount: 0,
        metadata: buildMetadata(),
      })
    })

    expect(screen.queryByTestId('mood-picker-panel')).not.toBeInTheDocument()
  })

  it('selecting a mood calls onMoodChange after expanding the mood section', async () => {
    let doRegister: ReturnType<typeof useEditorControls>['register']
    const onMoodChange = vi.fn()

    render(
      <Wrapper>
        <EditorRegistrar
          onReady={(r) => {
            doRegister = r
          }}
        />
        <RightPanel />
      </Wrapper>,
    )

    act(() => {
      doRegister!({
        dictation: null,
        fontSize: 'medium',
        onFontSizeChange: vi.fn(),
        wordCount: 0,
        metadata: buildMetadata({ onMoodChange }),
      })
    })

    // Expand mood section first
    await userEvent.click(screen.getByRole('button', { name: /expand section/i }))
    await userEvent.click(screen.getByRole('button', { name: /pick hopeful/i }))
    expect(onMoodChange).toHaveBeenCalledWith(3, 'Hopeful')
  })

  it('shows TagInput always when editor is active with metadata', () => {
    let doRegister: ReturnType<typeof useEditorControls>['register']

    render(
      <Wrapper>
        <EditorRegistrar
          onReady={(r) => {
            doRegister = r
          }}
        />
        <RightPanel />
      </Wrapper>,
    )

    act(() => {
      doRegister!({
        dictation: null,
        fontSize: 'medium',
        onFontSizeChange: vi.fn(),
        wordCount: 0,
        metadata: buildMetadata(),
      })
    })

    expect(screen.getByTestId('tag-input-panel')).toBeInTheDocument()
  })

  it('shows "Add scripture reference" button and reveals ScriptureRefInput on click', async () => {
    let doRegister: ReturnType<typeof useEditorControls>['register']

    render(
      <Wrapper>
        <EditorRegistrar
          onReady={(r) => {
            doRegister = r
          }}
        />
        <RightPanel />
      </Wrapper>,
    )

    act(() => {
      doRegister!({
        dictation: null,
        fontSize: 'medium',
        onFontSizeChange: vi.fn(),
        wordCount: 0,
        metadata: buildMetadata(),
      })
    })

    expect(screen.queryByTestId('scripture-ref-input-panel')).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: /add scripture reference/i }))

    expect(screen.getByTestId('scripture-ref-input-panel')).toBeInTheDocument()
  })

  it('adding a scripture ref calls onScriptureRefsChange and closes the input', async () => {
    let doRegister: ReturnType<typeof useEditorControls>['register']
    const onScriptureRefsChange = vi.fn()

    render(
      <Wrapper>
        <EditorRegistrar
          onReady={(r) => {
            doRegister = r
          }}
        />
        <RightPanel />
      </Wrapper>,
    )

    act(() => {
      doRegister!({
        dictation: null,
        fontSize: 'medium',
        onFontSizeChange: vi.fn(),
        wordCount: 0,
        metadata: buildMetadata({ onScriptureRefsChange }),
      })
    })

    await userEvent.click(screen.getByRole('button', { name: /add scripture reference/i }))
    await userEvent.click(screen.getByRole('button', { name: /add john 1:1/i }))

    expect(onScriptureRefsChange).toHaveBeenCalledWith([
      { reference: 'John 1:1', passageId: 'JHN.1.1' },
    ])
    expect(screen.queryByTestId('scripture-ref-input-panel')).not.toBeInTheDocument()
  })

  it('shows existing scripture references', () => {
    let doRegister: ReturnType<typeof useEditorControls>['register']

    render(
      <Wrapper>
        <EditorRegistrar
          onReady={(r) => {
            doRegister = r
          }}
        />
        <RightPanel />
      </Wrapper>,
    )

    act(() => {
      doRegister!({
        dictation: null,
        fontSize: 'medium',
        onFontSizeChange: vi.fn(),
        wordCount: 0,
        metadata: buildMetadata({
          scriptureRefs: [{ reference: 'Psalm 23:1', passageId: 'PSA.23.1' }],
        }),
      })
    })

    expect(screen.getByText('Psalm 23:1')).toBeInTheDocument()
  })

  it('removing a scripture ref calls onScriptureRefsChange without that ref', async () => {
    let doRegister: ReturnType<typeof useEditorControls>['register']
    const onScriptureRefsChange = vi.fn()

    render(
      <Wrapper>
        <EditorRegistrar
          onReady={(r) => {
            doRegister = r
          }}
        />
        <RightPanel />
      </Wrapper>,
    )

    act(() => {
      doRegister!({
        dictation: null,
        fontSize: 'medium',
        onFontSizeChange: vi.fn(),
        wordCount: 0,
        metadata: buildMetadata({
          scriptureRefs: [
            { reference: 'Psalm 23:1', passageId: 'PSA.23.1' },
            { reference: 'John 3:16', passageId: 'JHN.3.16' },
          ],
          onScriptureRefsChange,
        }),
      })
    })

    await userEvent.click(screen.getByRole('button', { name: /remove psalm 23:1/i }))

    expect(onScriptureRefsChange).toHaveBeenCalledWith([
      { reference: 'John 3:16', passageId: 'JHN.3.16' },
    ])
  })
})

// ── Phase 2 changes ───────────────────────────────────────────────────────────

describe('RightPanel — Phase 2: "Today\'s Word" not duplicated', () => {
  it('renders "Today\'s Word" text exactly once (owned by DailyScripture)', () => {
    render(
      <Wrapper>
        <RightPanel />
      </Wrapper>,
    )

    // DailyScripture mock renders a div — the label is NOT duplicated in RightPanel
    // There must be no standalone "Today's Word" text node rendered by RightPanel itself
    const allMatches = screen.queryAllByText(/today's word/i)
    expect(allMatches.length).toBe(0)
  })
})

describe('RightPanel — Phase 2: no "Add as verse" button', () => {
  it('does not render "Add as verse" or "Added as verse" button', () => {
    let doRegister: ReturnType<typeof useEditorControls>['register']

    render(
      <Wrapper>
        <EditorRegistrar
          onReady={(r) => {
            doRegister = r
          }}
        />
        <RightPanel />
      </Wrapper>,
    )

    act(() => {
      doRegister!({
        dictation: null,
        fontSize: 'medium',
        onFontSizeChange: vi.fn(),
        wordCount: 0,
        metadata: buildMetadata(),
      })
    })

    expect(screen.queryByRole('button', { name: /add as verse/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /added as verse/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /verse already added/i })).not.toBeInTheDocument()
  })
})

describe('RightPanel — Phase 2: scripture label singular vs plural', () => {
  function renderWithRefs(scriptureRefs: MetadataControls['scriptureRefs']) {
    let doRegister: ReturnType<typeof useEditorControls>['register']

    render(
      <Wrapper>
        <EditorRegistrar
          onReady={(r) => {
            doRegister = r
          }}
        />
        <RightPanel />
      </Wrapper>,
    )

    act(() => {
      doRegister!({
        dictation: null,
        fontSize: 'medium',
        onFontSizeChange: vi.fn(),
        wordCount: 0,
        metadata: buildMetadata({ scriptureRefs }),
      })
    })
  }

  it('shows "Scripture" (singular) when exactly 1 ref is present', () => {
    renderWithRefs([{ reference: 'John 3:16', passageId: 'JHN.3.16' }])
    expect(screen.getByText('Scripture')).toBeInTheDocument()
    expect(screen.queryByText('Scriptures')).not.toBeInTheDocument()
  })

  it('shows "Scriptures" (plural) when 0 refs are present', () => {
    renderWithRefs([])
    expect(screen.getByText('Scriptures')).toBeInTheDocument()
    expect(screen.queryByText('Scripture')).not.toBeInTheDocument()
  })

  it('shows "Scriptures" (plural) when 2+ refs are present', () => {
    renderWithRefs([
      { reference: 'John 3:16', passageId: 'JHN.3.16' },
      { reference: 'Psalm 23:1', passageId: 'PSA.23.1' },
    ])
    expect(screen.getByText('Scriptures')).toBeInTheDocument()
    expect(screen.queryByText('Scripture')).not.toBeInTheDocument()
  })
})

describe('RightPanel — Phase 2: mood collapsible', () => {
  function renderWithMoodMetadata(moodOverrides: Partial<MetadataControls> = {}) {
    let doRegister: ReturnType<typeof useEditorControls>['register']

    render(
      <Wrapper>
        <EditorRegistrar
          onReady={(r) => {
            doRegister = r
          }}
        />
        <RightPanel />
      </Wrapper>,
    )

    act(() => {
      doRegister!({
        dictation: null,
        fontSize: 'medium',
        onFontSizeChange: vi.fn(),
        wordCount: 0,
        metadata: buildMetadata(moodOverrides),
      })
    })
  }

  it('MoodPicker grid is NOT visible when collapsed by default', () => {
    renderWithMoodMetadata({ mood: 3, moodLabel: 'Hopeful' })

    expect(screen.queryByTestId('mood-picker-panel')).not.toBeInTheDocument()
  })

  it('shows mood pill when mood is set and collapsed', () => {
    renderWithMoodMetadata({ mood: 3, moodLabel: 'Hopeful' })

    expect(screen.getByText('Hopeful')).toBeInTheDocument()
    expect(screen.queryByText('Tap to set mood')).not.toBeInTheDocument()
  })

  it('shows "Tap to set mood" placeholder when no mood set and collapsed', () => {
    renderWithMoodMetadata({ mood: null, moodLabel: null })

    expect(screen.getByText('Tap to set mood')).toBeInTheDocument()
    expect(screen.queryByTestId('mood-picker-panel')).not.toBeInTheDocument()
  })

  it('expands to show MoodPicker after clicking the chevron toggle', async () => {
    renderWithMoodMetadata({ mood: null, moodLabel: null })

    expect(screen.queryByTestId('mood-picker-panel')).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: /expand section/i }))

    expect(screen.getByTestId('mood-picker-panel')).toBeInTheDocument()
  })

  it('collapses MoodPicker again after clicking the chevron a second time', async () => {
    renderWithMoodMetadata({ mood: null, moodLabel: null })

    const chevron = screen.getByRole('button', { name: /expand section/i })
    await userEvent.click(chevron)
    expect(screen.getByTestId('mood-picker-panel')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: /collapse section/i }))
    expect(screen.queryByTestId('mood-picker-panel')).not.toBeInTheDocument()
  })
})
