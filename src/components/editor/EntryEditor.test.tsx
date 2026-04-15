import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render } from '@testing-library/react'

import EntryEditor from './EntryEditor'

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

vi.mock('@tiptap/extension-placeholder', () => ({
  default: { configure: vi.fn(() => ({})) },
}))

vi.mock('@tiptap/extension-character-count', () => ({
  default: {},
}))

vi.mock('@tiptap/extension-heading', () => ({
  default: { configure: vi.fn(() => ({})) },
}))

describe('EntryEditor', () => {
  const setContent = vi.fn()
  const getJSON = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()

    mockUseEditor.mockReturnValue({
      commands: { setContent },
      getJSON,
      isEmpty: false,
      isActive: vi.fn(() => false),
      chain: vi.fn(() => ({
        focus: vi.fn().mockReturnThis(),
        toggleBold: vi.fn().mockReturnThis(),
        toggleItalic: vi.fn().mockReturnThis(),
        toggleBulletList: vi.fn().mockReturnThis(),
        toggleHeading: vi.fn().mockReturnThis(),
        run: vi.fn(),
      })),
    })
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
})
