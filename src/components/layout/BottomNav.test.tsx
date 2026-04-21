import { describe, it, expect, vi } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { BrowserRouter } from 'react-router-dom'
import React from 'react'

import BottomNav from './BottomNav'

import { FocusModeProvider } from '@/context/FocusModeContext'
import { EditorControlsProvider, useEditorControls } from '@/context/EditorControlsContext'

function Wrapper({ children }: { children: React.ReactNode }) {
  return (
    <BrowserRouter>
      <FocusModeProvider>
        <EditorControlsProvider>{children}</EditorControlsProvider>
      </FocusModeProvider>
    </BrowserRouter>
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

describe('BottomNav', () => {
  it('renders Today link and Focus button', () => {
    render(
      <Wrapper>
        <BottomNav />
      </Wrapper>,
    )
    expect(screen.getByRole('link', { name: /today/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /enter focus mode/i })).toBeInTheDocument()
  })

  it('does not render editor controls when not on an editing page', () => {
    render(
      <Wrapper>
        <BottomNav />
      </Wrapper>,
    )
    expect(screen.queryByRole('button', { name: /dictate/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /text size/i })).not.toBeInTheDocument()
  })

  it('shows editor controls (Voice, Text cycle) when editor is active', () => {
    let doRegister: ReturnType<typeof useEditorControls>['register']

    render(
      <Wrapper>
        <EditorRegistrar
          onReady={(r) => {
            doRegister = r
          }}
        />
        <BottomNav />
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
      })
    })

    expect(screen.getByRole('button', { name: /dictate/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /text size: medium/i })).toBeInTheDocument()
  })

  it('hides Voice button when dictation is not supported', () => {
    let doRegister: ReturnType<typeof useEditorControls>['register']

    render(
      <Wrapper>
        <EditorRegistrar
          onReady={(r) => {
            doRegister = r
          }}
        />
        <BottomNav />
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
      })
    })

    expect(screen.queryByRole('button', { name: /dictate/i })).not.toBeInTheDocument()
  })

  it('font cycle calls onFontSizeChange with next size', async () => {
    let doRegister: ReturnType<typeof useEditorControls>['register']
    const onFontSizeChange = vi.fn()

    render(
      <Wrapper>
        <EditorRegistrar
          onReady={(r) => {
            doRegister = r
          }}
        />
        <BottomNav />
      </Wrapper>,
    )

    act(() => {
      doRegister!({
        dictation: null,
        fontSize: 'small',
        onFontSizeChange,
      })
    })

    await userEvent.click(screen.getByRole('button', { name: /text size: small/i }))
    expect(onFontSizeChange).toHaveBeenCalledWith('medium')
  })

  it('font cycle wraps large → small', async () => {
    let doRegister: ReturnType<typeof useEditorControls>['register']
    const onFontSizeChange = vi.fn()

    render(
      <Wrapper>
        <EditorRegistrar
          onReady={(r) => {
            doRegister = r
          }}
        />
        <BottomNav />
      </Wrapper>,
    )

    act(() => {
      doRegister!({ dictation: null, fontSize: 'large', onFontSizeChange })
    })

    await userEvent.click(screen.getByRole('button', { name: /text size: large/i }))
    expect(onFontSizeChange).toHaveBeenCalledWith('small')
  })

  it('Voice button shows stop label when listening', () => {
    let doRegister: ReturnType<typeof useEditorControls>['register']

    render(
      <Wrapper>
        <EditorRegistrar
          onReady={(r) => {
            doRegister = r
          }}
        />
        <BottomNav />
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
      })
    })

    expect(screen.getByRole('button', { name: /stop dictation/i })).toBeInTheDocument()
  })
})
