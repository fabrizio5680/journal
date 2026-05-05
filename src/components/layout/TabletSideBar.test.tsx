import { describe, it, expect, vi } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import React from 'react'

import TabletSideBar from './TabletSideBar'

import { FocusModeProvider } from '@/context/FocusModeContext'
import { EditorControlsProvider, useEditorControls } from '@/context/EditorControlsContext'

function Wrapper({ children }: { children: React.ReactNode }) {
  return (
    <FocusModeProvider>
      <EditorControlsProvider>{children}</EditorControlsProvider>
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

describe('TabletSideBar', () => {
  describe('visibility classes', () => {
    it('has md:flex and xl:hidden classes for tablet-only display', () => {
      render(
        <Wrapper>
          <TabletSideBar />
        </Wrapper>,
      )
      const panel = screen.getByTestId('tablet-sidebar')
      expect(panel.className).toContain('md:flex')
      expect(panel.className).toContain('xl:hidden')
    })

    it('has translate-x-0 when not in focus mode', () => {
      render(
        <Wrapper>
          <TabletSideBar />
        </Wrapper>,
      )
      const panel = screen.getByTestId('tablet-sidebar')
      expect(panel.className).toContain('translate-x-0')
      expect(panel.className).not.toContain('translate-x-full')
    })

    it('has translate-x-full when in focus mode', async () => {
      render(
        <Wrapper>
          <TabletSideBar />
        </Wrapper>,
      )
      await userEvent.click(screen.getByRole('button', { name: /enter focus mode/i }))
      const panel = screen.getByTestId('tablet-sidebar')
      expect(panel.className).toContain('translate-x-full')
      expect(panel.className).not.toContain('translate-x-0')
    })
  })

  describe('focus toggle button', () => {
    it('renders the focus toggle button', () => {
      render(
        <Wrapper>
          <TabletSideBar />
        </Wrapper>,
      )
      expect(screen.getByRole('button', { name: /enter focus mode/i })).toBeInTheDocument()
    })

    it('calls toggleFocus when clicked', async () => {
      render(
        <Wrapper>
          <TabletSideBar />
        </Wrapper>,
      )
      await userEvent.click(screen.getByRole('button', { name: /enter focus mode/i }))
      expect(screen.getByRole('button', { name: /exit focus mode/i })).toBeInTheDocument()
    })

    it('shows "Focus" label text', () => {
      render(
        <Wrapper>
          <TabletSideBar />
        </Wrapper>,
      )
      expect(screen.getByText('Focus')).toBeInTheDocument()
    })
  })

  describe('mic button', () => {
    it('renders mic button when isEditorActive and dictation.isSupported', () => {
      let doRegister: ReturnType<typeof useEditorControls>['register']

      render(
        <Wrapper>
          <EditorRegistrar
            onReady={(r) => {
              doRegister = r
            }}
          />
          <TabletSideBar />
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
          wordCount: 0,
        })
      })

      expect(screen.getByRole('button', { name: /dictate/i })).toBeInTheDocument()
    })

    it('does not render mic button when editor is not active', () => {
      render(
        <Wrapper>
          <TabletSideBar />
        </Wrapper>,
      )
      expect(screen.queryByRole('button', { name: /dictate/i })).not.toBeInTheDocument()
    })

    it('shows stop-dictation button when listening', () => {
      let doRegister: ReturnType<typeof useEditorControls>['register']

      render(
        <Wrapper>
          <EditorRegistrar
            onReady={(r) => {
              doRegister = r
            }}
          />
          <TabletSideBar />
        </Wrapper>,
      )

      act(() => {
        doRegister!({
          dictation: {
            isSupported: true,
            state: 'listening',
            errorMessage: null,
            interimTranscript: null,
            onStart: vi.fn(),
            onStop: vi.fn(),
          },
          fontSize: 'medium',
          onFontSizeChange: vi.fn(),
          wordCount: 0,
        })
      })

      expect(screen.getByRole('button', { name: /stop dictation/i })).toBeInTheDocument()
    })

    it('calls onStart when mic button clicked while idle', async () => {
      let doRegister: ReturnType<typeof useEditorControls>['register']
      const onStart = vi.fn()

      render(
        <Wrapper>
          <EditorRegistrar
            onReady={(r) => {
              doRegister = r
            }}
          />
          <TabletSideBar />
        </Wrapper>,
      )

      act(() => {
        doRegister!({
          dictation: {
            isSupported: true,
            state: 'idle',
            errorMessage: null,
            onStart,
            onStop: vi.fn(),
          },
          fontSize: 'medium',
          onFontSizeChange: vi.fn(),
          wordCount: 0,
        })
      })

      await userEvent.click(screen.getByRole('button', { name: /dictate/i }))
      expect(onStart).toHaveBeenCalled()
    })

    it('calls onStop when mic button clicked while listening', async () => {
      let doRegister: ReturnType<typeof useEditorControls>['register']
      const onStop = vi.fn()

      render(
        <Wrapper>
          <EditorRegistrar
            onReady={(r) => {
              doRegister = r
            }}
          />
          <TabletSideBar />
        </Wrapper>,
      )

      act(() => {
        doRegister!({
          dictation: {
            isSupported: true,
            state: 'listening',
            errorMessage: null,
            interimTranscript: null,
            onStart: vi.fn(),
            onStop,
          },
          fontSize: 'medium',
          onFontSizeChange: vi.fn(),
          wordCount: 0,
        })
      })

      await userEvent.click(screen.getByRole('button', { name: /stop dictation/i }))
      expect(onStop).toHaveBeenCalled()
    })
  })

  describe('font size button', () => {
    it('renders font size button when isEditorActive and onFontSizeChange provided', () => {
      let doRegister: ReturnType<typeof useEditorControls>['register']

      render(
        <Wrapper>
          <EditorRegistrar
            onReady={(r) => {
              doRegister = r
            }}
          />
          <TabletSideBar />
        </Wrapper>,
      )

      act(() => {
        doRegister!({
          dictation: null,
          fontSize: 'medium',
          onFontSizeChange: vi.fn(),
          wordCount: 0,
        })
      })

      expect(screen.getByRole('button', { name: /text size: medium/i })).toBeInTheDocument()
    })

    it('does not render font size button when editor is not active', () => {
      render(
        <Wrapper>
          <TabletSideBar />
        </Wrapper>,
      )
      expect(screen.queryByRole('button', { name: /text size/i })).not.toBeInTheDocument()
    })

    it('has text-primary class when font size is not medium', () => {
      let doRegister: ReturnType<typeof useEditorControls>['register']

      render(
        <Wrapper>
          <EditorRegistrar
            onReady={(r) => {
              doRegister = r
            }}
          />
          <TabletSideBar />
        </Wrapper>,
      )

      act(() => {
        doRegister!({
          dictation: null,
          fontSize: 'large',
          onFontSizeChange: vi.fn(),
          wordCount: 0,
        })
      })

      const fontBtn = screen.getByRole('button', { name: /text size: large/i })
      expect(fontBtn).toHaveClass('text-primary')
    })

    it('cycles font size on click (medium → large)', async () => {
      let doRegister: ReturnType<typeof useEditorControls>['register']
      const onFontSizeChange = vi.fn()

      render(
        <Wrapper>
          <EditorRegistrar
            onReady={(r) => {
              doRegister = r
            }}
          />
          <TabletSideBar />
        </Wrapper>,
      )

      act(() => {
        doRegister!({
          dictation: null,
          fontSize: 'medium',
          onFontSizeChange,
          wordCount: 0,
        })
      })

      await userEvent.click(screen.getByRole('button', { name: /text size: medium/i }))
      expect(onFontSizeChange).toHaveBeenCalledWith('large')
    })
  })

  describe('word count', () => {
    it('renders word count when isEditorActive', () => {
      let doRegister: ReturnType<typeof useEditorControls>['register']

      render(
        <Wrapper>
          <EditorRegistrar
            onReady={(r) => {
              doRegister = r
            }}
          />
          <TabletSideBar />
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

    it('uses singular "word" for count of 1', () => {
      let doRegister: ReturnType<typeof useEditorControls>['register']

      render(
        <Wrapper>
          <EditorRegistrar
            onReady={(r) => {
              doRegister = r
            }}
          />
          <TabletSideBar />
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

    it('does not render word count when editor is not active', () => {
      render(
        <Wrapper>
          <TabletSideBar />
        </Wrapper>,
      )
      expect(screen.queryByText(/words?/)).not.toBeInTheDocument()
    })
  })

  describe('interim transcript', () => {
    it('renders interim transcript when listening', () => {
      let doRegister: ReturnType<typeof useEditorControls>['register']

      render(
        <Wrapper>
          <EditorRegistrar
            onReady={(r) => {
              doRegister = r
            }}
          />
          <TabletSideBar />
        </Wrapper>,
      )

      act(() => {
        doRegister!({
          dictation: {
            isSupported: true,
            state: 'listening',
            errorMessage: null,
            interimTranscript: 'hello world',
            onStart: vi.fn(),
            onStop: vi.fn(),
          },
          fontSize: 'medium',
          onFontSizeChange: vi.fn(),
          wordCount: 2,
        })
      })

      expect(screen.getByText('hello world')).toBeInTheDocument()
    })

    it('does not render transcript when not listening', () => {
      let doRegister: ReturnType<typeof useEditorControls>['register']

      render(
        <Wrapper>
          <EditorRegistrar
            onReady={(r) => {
              doRegister = r
            }}
          />
          <TabletSideBar />
        </Wrapper>,
      )

      act(() => {
        doRegister!({
          dictation: {
            isSupported: true,
            state: 'idle',
            errorMessage: null,
            interimTranscript: 'ghost text',
            onStart: vi.fn(),
            onStop: vi.fn(),
          },
          fontSize: 'medium',
          onFontSizeChange: vi.fn(),
          wordCount: 0,
        })
      })

      expect(screen.queryByText('ghost text')).not.toBeInTheDocument()
    })
  })

  describe('no localStorage usage', () => {
    it('does not read pref_sidebar_expanded from localStorage', () => {
      localStorage.setItem('pref_sidebar_expanded', 'true')
      const getSpy = vi.spyOn(Storage.prototype, 'getItem')

      render(
        <Wrapper>
          <TabletSideBar />
        </Wrapper>,
      )

      const calls = getSpy.mock.calls.map((c) => c[0])
      expect(calls).not.toContain('pref_sidebar_expanded')
      getSpy.mockRestore()
    })

    it('does not write pref_sidebar_expanded to localStorage', async () => {
      const setSpy = vi.spyOn(Storage.prototype, 'setItem')

      render(
        <Wrapper>
          <TabletSideBar />
        </Wrapper>,
      )

      // Click focus toggle — no localStorage write should occur for sidebar key
      await userEvent.click(screen.getByRole('button', { name: /enter focus mode/i }))

      const calls = setSpy.mock.calls.map((c) => c[0])
      expect(calls).not.toContain('pref_sidebar_expanded')
      setSpy.mockRestore()
    })
  })
})
