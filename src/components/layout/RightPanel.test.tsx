import { describe, it, expect, vi } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import React from 'react'

import RightPanel from './RightPanel'

import { FocusModeProvider } from '@/context/FocusModeContext'
import { EditorControlsProvider, useEditorControls } from '@/context/EditorControlsContext'
import { UserPreferencesProvider } from '@/context/UserPreferencesContext'

vi.mock('@/components/ui/DailyScripture', () => ({
  default: () => <div data-testid="daily-scripture" />,
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
    <FocusModeProvider>
      <EditorControlsProvider>
        <UserPreferencesProvider>{children}</UserPreferencesProvider>
      </EditorControlsProvider>
    </FocusModeProvider>
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
})
