import { describe, it, expect, vi } from 'vitest'
import { render, screen, act } from '@testing-library/react'

import { EditorControlsProvider, useEditorControls } from './EditorControlsContext'

function TestConsumer() {
  const { isEditorActive, fontSize, dictation, onFontSizeChange } = useEditorControls()
  return (
    <div>
      <span data-testid="active">{String(isEditorActive)}</span>
      <span data-testid="fontSize">{fontSize}</span>
      <span data-testid="dictationSupported">{String(dictation?.isSupported ?? false)}</span>
      <span data-testid="hasFontChange">{String(onFontSizeChange !== null)}</span>
    </div>
  )
}

function TestRegistrar({
  onRegisterReady,
}: {
  onRegisterReady: (
    register: ReturnType<typeof useEditorControls>['register'],
    unregister: () => void,
  ) => void
}) {
  const { register, unregister } = useEditorControls()
  onRegisterReady(register, unregister)
  return null
}

describe('EditorControlsContext', () => {
  it('starts inactive with medium font size', () => {
    render(
      <EditorControlsProvider>
        <TestConsumer />
      </EditorControlsProvider>,
    )
    expect(screen.getByTestId('active').textContent).toBe('false')
    expect(screen.getByTestId('fontSize').textContent).toBe('medium')
  })

  it('becomes active after register is called', () => {
    let doRegister: ReturnType<typeof useEditorControls>['register']
    const onFontSizeChange = vi.fn()

    render(
      <EditorControlsProvider>
        <TestRegistrar
          onRegisterReady={(reg) => {
            doRegister = reg
          }}
        />
        <TestConsumer />
      </EditorControlsProvider>,
    )

    expect(screen.getByTestId('active').textContent).toBe('false')

    act(() => {
      doRegister!({
        dictation: null,
        fontSize: 'large',
        onFontSizeChange,
      })
    })

    expect(screen.getByTestId('active').textContent).toBe('true')
    expect(screen.getByTestId('fontSize').textContent).toBe('large')
    expect(screen.getByTestId('hasFontChange').textContent).toBe('true')
  })

  it('becomes inactive after unregister is called', () => {
    let doRegister: ReturnType<typeof useEditorControls>['register']
    let doUnregister: () => void

    render(
      <EditorControlsProvider>
        <TestRegistrar
          onRegisterReady={(reg, unreg) => {
            doRegister = reg
            doUnregister = unreg
          }}
        />
        <TestConsumer />
      </EditorControlsProvider>,
    )

    act(() => {
      doRegister!({ dictation: null, fontSize: 'small', onFontSizeChange: vi.fn() })
    })
    expect(screen.getByTestId('active').textContent).toBe('true')

    act(() => {
      doUnregister!()
    })
    expect(screen.getByTestId('active').textContent).toBe('false')
  })

  it('exposes dictation controls when registered with dictation', () => {
    let doRegister: ReturnType<typeof useEditorControls>['register']

    render(
      <EditorControlsProvider>
        <TestRegistrar
          onRegisterReady={(reg) => {
            doRegister = reg
          }}
        />
        <TestConsumer />
      </EditorControlsProvider>,
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

    expect(screen.getByTestId('dictationSupported').textContent).toBe('true')
  })

  it('throws when used outside provider', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(() => render(<TestConsumer />)).toThrow(
      'useEditorControls must be used within EditorControlsProvider',
    )
    consoleError.mockRestore()
  })
})
