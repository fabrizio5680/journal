import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render } from '@testing-library/react'
import React from 'react'

import EntryEditor from './EntryEditor'

let mockSpellcheckEnabled = true

vi.mock('@/context/UserPreferencesContext', () => ({
  useUserPreferences: () => ({
    editorFontSize: 'medium',
    spellcheckEnabled: mockSpellcheckEnabled,
  }),
}))

vi.mock('@/lib/device', () => ({
  isMobileDevice: () => false,
}))

const mockUseEditor = vi.fn()

vi.mock('@tiptap/react', () => ({
  useEditor: (...args: unknown[]) => mockUseEditor(...args),
  EditorContent: () => <div data-testid="editor-content" />,
}))

vi.mock('@tiptap/react/menus', () => ({
  BubbleMenu: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
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
      chain: vi.fn(() => ({
        focus: vi.fn().mockReturnThis(),
        toggleBold: vi.fn().mockReturnThis(),
        toggleItalic: vi.fn().mockReturnThis(),
        toggleBulletList: vi.fn().mockReturnThis(),
        toggleHeading: vi.fn().mockReturnThis(),
        run: vi.fn(),
      })),
    }
  }

  beforeEach(() => {
    vi.clearAllMocks()
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

  it('applies bottom padding to the wrapper for scroll clearance', () => {
    getJSON.mockReturnValue({ type: 'doc', content: [] })
    const { container } = render(<EntryEditor content={null} onUpdate={vi.fn()} />)

    const wrapper = container.firstChild as HTMLElement
    expect(wrapper.className).toContain('pb-40')
    expect(wrapper.className).toContain('md:pb-32')
  })

  it('passes spellcheck="true" to editorProps.attributes when spellcheckEnabled is true and not mobile', () => {
    mockSpellcheckEnabled = true
    getJSON.mockReturnValue({ type: 'doc', content: [] })
    render(<EntryEditor content={null} onUpdate={vi.fn()} />)

    const lastCall = mockUseEditor.mock.calls[mockUseEditor.mock.calls.length - 1][0] as {
      editorProps: { attributes: Record<string, string> }
    }
    expect(lastCall.editorProps.attributes.spellcheck).toBe('true')
  })

  it('passes spellcheck="false" to editorProps.attributes when spellcheckEnabled is false', () => {
    mockSpellcheckEnabled = false
    getJSON.mockReturnValue({ type: 'doc', content: [] })
    render(<EntryEditor content={null} onUpdate={vi.fn()} />)

    const lastCall = mockUseEditor.mock.calls[mockUseEditor.mock.calls.length - 1][0] as {
      editorProps: { attributes: Record<string, string> }
    }
    expect(lastCall.editorProps.attributes.spellcheck).toBe('false')
  })
})
