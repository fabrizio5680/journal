import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import React from 'react'

import CollapsibleSideBar from './CollapsibleSideBar'

import { FocusModeProvider } from '@/context/FocusModeContext'
import { EditorControlsProvider, useEditorControls } from '@/context/EditorControlsContext'

const STORAGE_KEY = 'pref_sidebar_expanded'

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

beforeEach(() => {
  localStorage.clear()
})

describe('CollapsibleSideBar', () => {
  describe('initial state', () => {
    it('renders collapsed by default when localStorage is empty', () => {
      render(
        <Wrapper>
          <CollapsibleSideBar />
        </Wrapper>,
      )
      expect(screen.getByRole('button', { name: /expand sidebar/i })).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: /collapse sidebar/i })).not.toBeInTheDocument()
    })

    it('restores expanded state from localStorage', () => {
      localStorage.setItem(STORAGE_KEY, 'true')

      render(
        <Wrapper>
          <CollapsibleSideBar />
        </Wrapper>,
      )
      expect(screen.getByRole('button', { name: /collapse sidebar/i })).toBeInTheDocument()
    })
  })

  describe('expand / collapse toggle', () => {
    it('clicking the chevron button expands the panel', async () => {
      render(
        <Wrapper>
          <CollapsibleSideBar />
        </Wrapper>,
      )

      const expandBtn = screen.getByRole('button', { name: /expand sidebar/i })
      await userEvent.click(expandBtn)

      expect(screen.getByRole('button', { name: /collapse sidebar/i })).toBeInTheDocument()
    })

    it('clicking the chevron button again collapses the panel', async () => {
      render(
        <Wrapper>
          <CollapsibleSideBar />
        </Wrapper>,
      )

      await userEvent.click(screen.getByRole('button', { name: /expand sidebar/i }))
      await userEvent.click(screen.getByRole('button', { name: /collapse sidebar/i }))

      expect(screen.getByRole('button', { name: /expand sidebar/i })).toBeInTheDocument()
    })

    it('persists expanded state to localStorage on toggle', async () => {
      render(
        <Wrapper>
          <CollapsibleSideBar />
        </Wrapper>,
      )

      expect(localStorage.getItem(STORAGE_KEY)).not.toBe('true')

      await userEvent.click(screen.getByRole('button', { name: /expand sidebar/i }))

      expect(localStorage.getItem(STORAGE_KEY)).toBe('true')
    })

    it('persists collapsed state to localStorage when collapsing', async () => {
      localStorage.setItem(STORAGE_KEY, 'true')

      render(
        <Wrapper>
          <CollapsibleSideBar />
        </Wrapper>,
      )

      await userEvent.click(screen.getByRole('button', { name: /collapse sidebar/i }))

      expect(localStorage.getItem(STORAGE_KEY)).toBe('false')
    })
  })

  describe('thin strip icons (collapsed mode)', () => {
    it('shows focus toggle icon when collapsed', () => {
      render(
        <Wrapper>
          <CollapsibleSideBar />
        </Wrapper>,
      )

      // Focus toggle is always visible — both in thin strip and expanded panel
      expect(screen.getByRole('button', { name: /enter focus mode/i })).toBeInTheDocument()
    })

    it('shows mic icon in thin strip when editor is active with dictation support', () => {
      let doRegister: ReturnType<typeof useEditorControls>['register']

      render(
        <Wrapper>
          <EditorRegistrar
            onReady={(r) => {
              doRegister = r
            }}
          />
          <CollapsibleSideBar />
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

    it('shows format_size icon in thin strip when editor is active with font change callback', () => {
      let doRegister: ReturnType<typeof useEditorControls>['register']

      render(
        <Wrapper>
          <EditorRegistrar
            onReady={(r) => {
              doRegister = r
            }}
          />
          <CollapsibleSideBar />
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

    it('does not show mic icon when editor is not active', () => {
      render(
        <Wrapper>
          <CollapsibleSideBar />
        </Wrapper>,
      )

      expect(screen.queryByRole('button', { name: /dictate/i })).not.toBeInTheDocument()
    })

    it('font size button has text-primary class when size is not medium', () => {
      let doRegister: ReturnType<typeof useEditorControls>['register']

      render(
        <Wrapper>
          <EditorRegistrar
            onReady={(r) => {
              doRegister = r
            }}
          />
          <CollapsibleSideBar />
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
  })

  describe('expanded panel content', () => {
    it('shows word count in expanded panel when editor is active', async () => {
      let doRegister: ReturnType<typeof useEditorControls>['register']

      render(
        <Wrapper>
          <EditorRegistrar
            onReady={(r) => {
              doRegister = r
            }}
          />
          <CollapsibleSideBar />
        </Wrapper>,
      )

      act(() => {
        doRegister!({
          dictation: null,
          fontSize: 'medium',
          onFontSizeChange: vi.fn(),
          wordCount: 17,
        })
      })

      // Expand the sidebar
      await userEvent.click(screen.getByRole('button', { name: /expand sidebar/i }))

      expect(screen.getByText('17 words')).toBeInTheDocument()
    })

    it('shows mic button in expanded panel when editor is active', async () => {
      let doRegister: ReturnType<typeof useEditorControls>['register']

      render(
        <Wrapper>
          <EditorRegistrar
            onReady={(r) => {
              doRegister = r
            }}
          />
          <CollapsibleSideBar />
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

      await userEvent.click(screen.getByRole('button', { name: /expand sidebar/i }))

      expect(screen.getByRole('button', { name: /dictate/i })).toBeInTheDocument()
    })

    it('shows interim transcript in expanded panel while listening', async () => {
      let doRegister: ReturnType<typeof useEditorControls>['register']

      render(
        <Wrapper>
          <EditorRegistrar
            onReady={(r) => {
              doRegister = r
            }}
          />
          <CollapsibleSideBar />
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

      await userEvent.click(screen.getByRole('button', { name: /expand sidebar/i }))

      expect(screen.getByText('hello world')).toBeInTheDocument()
    })

    it('shows focus toggle button with label text in expanded panel', async () => {
      render(
        <Wrapper>
          <CollapsibleSideBar />
        </Wrapper>,
      )

      await userEvent.click(screen.getByRole('button', { name: /expand sidebar/i }))

      // When expanded, there are two focus toggle buttons (thin strip + expanded panel)
      const focusBtns = screen.getAllByRole('button', { name: /enter focus mode/i })
      expect(focusBtns.length).toBeGreaterThanOrEqual(2)
    })
  })

  describe('focus mode interaction', () => {
    it('focus mode collapses the expanded panel (effectivelyExpanded becomes false)', async () => {
      localStorage.setItem(STORAGE_KEY, 'true')

      render(
        <Wrapper>
          <CollapsibleSideBar />
        </Wrapper>,
      )

      // Panel content should be visible when expanded
      expect(screen.getByRole('button', { name: /collapse sidebar/i })).toBeInTheDocument()

      // When expanded, two focus toggle buttons exist (thin strip + expanded panel).
      // Click the first one (thin strip).
      const focusBtns = screen.getAllByRole('button', { name: /enter focus mode/i })
      await userEvent.click(focusBtns[0])

      // effectivelyExpanded = false when isFocused is true, so panel content hides
      // Only the thin strip focus button remains (shows "exit focus mode")
      expect(screen.queryByRole('button', { name: /collapse sidebar/i })).not.toBeInTheDocument()
    })

    it('thin strip focus button label changes to "Exit focus mode" when focused', async () => {
      render(
        <Wrapper>
          <CollapsibleSideBar />
        </Wrapper>,
      )

      await userEvent.click(screen.getByRole('button', { name: /enter focus mode/i }))
      expect(screen.getByRole('button', { name: /exit focus mode/i })).toBeInTheDocument()
    })

    it('thin strip remains visible (expand button still present) even in focus mode', async () => {
      render(
        <Wrapper>
          <CollapsibleSideBar />
        </Wrapper>,
      )

      await userEvent.click(screen.getByRole('button', { name: /enter focus mode/i }))

      // The chevron expand/collapse button in the thin strip is still present
      // In focus mode, sidebar is effectively collapsed so we see "expand sidebar" again
      expect(screen.getByRole('button', { name: /expand sidebar/i })).toBeInTheDocument()
    })
  })

  describe('font size cycle', () => {
    it('cycles font size via the thin strip format_size button', async () => {
      let doRegister: ReturnType<typeof useEditorControls>['register']
      const onFontSizeChange = vi.fn()

      render(
        <Wrapper>
          <EditorRegistrar
            onReady={(r) => {
              doRegister = r
            }}
          />
          <CollapsibleSideBar />
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

  describe('dictation controls', () => {
    it('clicking mic button in thin strip calls onStart when idle', async () => {
      let doRegister: ReturnType<typeof useEditorControls>['register']
      const onStart = vi.fn()

      render(
        <Wrapper>
          <EditorRegistrar
            onReady={(r) => {
              doRegister = r
            }}
          />
          <CollapsibleSideBar />
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

    it('clicking mic button while listening calls onStop', async () => {
      let doRegister: ReturnType<typeof useEditorControls>['register']
      const onStop = vi.fn()

      render(
        <Wrapper>
          <EditorRegistrar
            onReady={(r) => {
              doRegister = r
            }}
          />
          <CollapsibleSideBar />
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
          wordCount: 0,
        })
      })

      await userEvent.click(screen.getByRole('button', { name: /stop dictation/i }))
      expect(onStop).toHaveBeenCalled()
    })
  })
})
