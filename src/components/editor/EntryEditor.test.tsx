import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, fireEvent } from '@testing-library/react'
import { format } from 'date-fns'
import React from 'react'

import EntryEditor from './EntryEditor'

vi.mock('@/context/UserPreferencesContext', () => ({
  useUserPreferences: () => ({
    editorFontSize: 'medium',
  }),
}))

const mockUseEditor = vi.fn()

vi.mock('@tiptap/react', () => ({
  useEditor: (...args: unknown[]) => mockUseEditor(...args),
  EditorContent: () => <div data-testid="editor-content" />,
}))

vi.mock('@tiptap/react/menus', () => ({
  BubbleMenu: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  FloatingMenu: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="floating-menu">{children}</div>
  ),
}))

vi.mock('@tiptap/starter-kit', () => ({
  default: { configure: vi.fn(() => ({})) },
}))

const mockPlaceholderConfigure = vi.hoisted(() => vi.fn(() => ({})))

vi.mock('@tiptap/extension-placeholder', () => ({
  default: { configure: mockPlaceholderConfigure },
}))

vi.mock('@tiptap/extension-character-count', () => ({
  default: {},
}))

vi.mock('@tiptap/extension-heading', () => ({
  default: { configure: vi.fn(() => ({})) },
}))

describe('EntryEditor', () => {
  const setContent = vi.fn()
  const setTextSelection = vi.fn()
  const getJSON = vi.fn()

  let insertedContent: unknown = null

  function makeEditor(selectionFrom = 5, docSize = 20) {
    return {
      commands: { setContent, setTextSelection },
      state: {
        selection: { from: selectionFrom, to: selectionFrom },
        doc: { content: { size: docSize } },
      },
      getJSON,
      isEmpty: false,
      setOptions: vi.fn(),
      isActive: vi.fn(() => false),
      chain: vi.fn(() => {
        const chain: Record<string, unknown> = {
          focus: vi.fn(() => chain),
          toggleBold: vi.fn(() => chain),
          toggleItalic: vi.fn(() => chain),
          toggleBulletList: vi.fn(() => chain),
          toggleHeading: vi.fn(() => chain),
          insertContent: vi.fn((value: unknown) => {
            insertedContent = value
            return chain
          }),
          run: vi.fn(),
        }
        return chain
      }),
    }
  }

  beforeEach(() => {
    vi.clearAllMocks()
    insertedContent = null
    mockUseEditor.mockReturnValue(makeEditor())
  })

  it('hydrates editor when incoming content differs', () => {
    getJSON.mockReturnValue({ type: 'doc', content: [] })
    const incoming = {
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Hello' }] }],
    }

    render(<EntryEditor content={incoming} onUpdate={vi.fn()} />)

    expect(setContent).toHaveBeenCalledWith(incoming, { emitUpdate: false })
  })

  it('restores cursor position after setContent', () => {
    mockUseEditor.mockReturnValue(makeEditor(8, 20))
    getJSON.mockReturnValue({ type: 'doc', content: [] })
    const incoming = {
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Hello world' }] }],
    }

    render(<EntryEditor content={incoming} onUpdate={vi.fn()} />)

    expect(setContent).toHaveBeenCalledWith(incoming, { emitUpdate: false })
    expect(setTextSelection).toHaveBeenCalledWith({ from: 8, to: 8 })
  })

  it('clamps cursor to doc size when content shrinks', () => {
    mockUseEditor.mockReturnValue(makeEditor(50, 10))
    getJSON.mockReturnValue({ type: 'doc', content: [] })
    const incoming = {
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Hi' }] }],
    }

    render(<EntryEditor content={incoming} onUpdate={vi.fn()} />)

    expect(setTextSelection).toHaveBeenCalledWith({ from: 10, to: 10 })
  })

  it('clears editor when incoming content is null', () => {
    getJSON.mockReturnValue({
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Stale text' }] }],
    })

    const { rerender } = render(
      <EntryEditor
        content={{
          type: 'doc',
          content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Existing text' }] }],
        }}
        onUpdate={vi.fn()}
      />,
    )

    setContent.mockClear()

    rerender(<EntryEditor content={null} onUpdate={vi.fn()} />)

    expect(setContent).toHaveBeenCalledWith('', { emitUpdate: false })
  })

  it('does not reset editor when incoming content matches', () => {
    const sameContent = {
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Same text' }] }],
    }
    getJSON.mockReturnValue(sameContent)

    render(<EntryEditor content={sameContent} onUpdate={vi.fn()} />)

    expect(setContent).not.toHaveBeenCalled()
  })

  it('passes custom placeholder to Placeholder extension', () => {
    getJSON.mockReturnValue({ type: 'doc', content: [] })
    const customPlaceholder = 'He gives strength to the weary — Isaiah 40:29'

    render(<EntryEditor content={null} onUpdate={vi.fn()} placeholder={customPlaceholder} />)

    expect(mockPlaceholderConfigure).toHaveBeenCalledWith(
      expect.objectContaining({ placeholder: customPlaceholder }),
    )
  })

  it('uses default placeholder when none provided', () => {
    getJSON.mockReturnValue({ type: 'doc', content: [] })

    render(<EntryEditor content={null} onUpdate={vi.fn()} />)

    expect(mockPlaceholderConfigure).toHaveBeenCalledWith(
      expect.objectContaining({ placeholder: 'The silence this morning feels different...' }),
    )
  })

  it('BubbleMenu renders only bold and italic buttons', () => {
    getJSON.mockReturnValue({ type: 'doc', content: [] })
    const { getByRole, queryByRole } = render(<EntryEditor content={null} onUpdate={vi.fn()} />)

    expect(getByRole('button', { name: 'Bold' })).toBeTruthy()
    expect(getByRole('button', { name: 'Italic' })).toBeTruthy()
    expect(queryByRole('button', { name: 'Bullet list' })).toBeNull()
    expect(queryByRole('button', { name: 'Heading 2' })).toBeNull()
  })

  it('applies bottom padding to the wrapper for scroll clearance', () => {
    getJSON.mockReturnValue({ type: 'doc', content: [] })
    const { container } = render(<EntryEditor content={null} onUpdate={vi.fn()} />)

    const wrapper = container.firstChild as HTMLElement
    expect(wrapper.className).toContain('pb-40')
    expect(wrapper.className).toContain('md:pb-32')
  })

  it('does not reset editor content when isDirty is true', () => {
    const currentEditorContent = {
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'New typing' }] }],
    }
    getJSON.mockReturnValue(currentEditorContent)
    const staleContent = {
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Old saved' }] }],
    }

    render(<EntryEditor content={staleContent} onUpdate={vi.fn()} isDirty={true} />)

    expect(setContent).not.toHaveBeenCalled()
  })

  it('resets editor content when isDirty is false', () => {
    getJSON.mockReturnValue({ type: 'doc', content: [] })
    const incoming = {
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Loaded' }] }],
    }

    render(<EntryEditor content={incoming} onUpdate={vi.fn()} isDirty={false} />)

    expect(setContent).toHaveBeenCalledWith(incoming, { emitUpdate: false })
  })

  it('always passes spellcheck="true" to editorProps.attributes', () => {
    getJSON.mockReturnValue({ type: 'doc', content: [] })
    render(<EntryEditor content={null} onUpdate={vi.fn()} />)

    const lastCall = mockUseEditor.mock.calls[mockUseEditor.mock.calls.length - 1][0] as {
      editorProps: { attributes: Record<string, string> }
    }
    expect(lastCall.editorProps.attributes.spellcheck).toBe('true')
  })

  describe('FloatingMenu insert-time button', () => {
    afterEach(() => {
      vi.useRealTimers()
    })

    it('renders an "Insert time" button with the schedule icon inside the FloatingMenu', () => {
      getJSON.mockReturnValue({ type: 'doc', content: [] })
      const { getByRole, getByTestId } = render(<EntryEditor content={null} onUpdate={vi.fn()} />)

      const floatingMenu = getByTestId('floating-menu')
      expect(floatingMenu).toBeTruthy()

      const insertTimeBtn = getByRole('button', { name: 'Insert time' })
      expect(insertTimeBtn).toBeTruthy()
      // Button lives inside the FloatingMenu (which allows the editor to keep focus
      // via BubbleButton's onMouseDown preventDefault). A light containment assertion.
      expect(floatingMenu.contains(insertTimeBtn)).toBe(true)

      const icon = insertTimeBtn.querySelector('.material-symbols-outlined')
      expect(icon?.textContent).toBe('schedule')
    })

    it('clicking the button inserts an H2 heading with the current locale time and a paragraph', () => {
      const fakeNow = new Date('2026-05-16T09:14:00')
      vi.useFakeTimers()
      vi.setSystemTime(fakeNow)

      getJSON.mockReturnValue({ type: 'doc', content: [] })
      const { getByRole } = render(<EntryEditor content={null} onUpdate={vi.fn()} />)

      const insertTimeBtn = getByRole('button', { name: 'Insert time' })
      // BubbleButton fires the action onMouseDown (not onClick) to preserve editor focus
      fireEvent.mouseDown(insertTimeBtn)

      expect(insertedContent).toEqual([
        {
          type: 'heading',
          attrs: { level: 2 },
          content: [{ type: 'text', text: format(fakeNow, 'p') }],
        },
        { type: 'paragraph' },
      ])
    })

    it('insert-time button is mounted within a focus-preserving wrapper (BubbleButton onMouseDown.preventDefault)', () => {
      getJSON.mockReturnValue({ type: 'doc', content: [] })
      const { getByRole } = render(<EntryEditor content={null} onUpdate={vi.fn()} />)

      const insertTimeBtn = getByRole('button', { name: 'Insert time' })
      // Light assertion: the underlying BubbleButton calls preventDefault on mousedown
      // to keep the editor focused. We confirm the event is cancellable and that
      // preventDefault is honoured (defaultPrevented becomes true after dispatch).
      const evt = new MouseEvent('mousedown', { bubbles: true, cancelable: true })
      insertTimeBtn.dispatchEvent(evt)
      expect(evt.defaultPrevented).toBe(true)
    })
  })
})
