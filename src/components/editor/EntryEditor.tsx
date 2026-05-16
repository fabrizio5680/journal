import { useEffect } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import { BubbleMenu, FloatingMenu } from '@tiptap/react/menus'
import StarterKit from '@tiptap/starter-kit'
import Placeholder from '@tiptap/extension-placeholder'
import CharacterCount from '@tiptap/extension-character-count'
import Heading from '@tiptap/extension-heading'
import type { Editor } from '@tiptap/core'
import { format } from 'date-fns'

import { useUserPreferences } from '@/context/UserPreferencesContext'

const DEFAULT_PLACEHOLDER = 'The silence this morning feels different...'

const FONT_SIZE_CLASS: Record<string, string> = {
  small: 'text-[1.1rem]',
  medium: 'text-[1.35rem]',
  large: 'text-[1.6rem]',
}

function buildExtensions(placeholderText: string) {
  return [
    StarterKit.configure({ heading: false }),
    Placeholder.configure({ placeholder: placeholderText }),
    CharacterCount,
    Heading.configure({ levels: [2] }),
  ]
}

interface EntryEditorProps {
  content: object | null
  onUpdate: (editor: Editor) => void
  onEditorReady?: (editor: Editor) => void
  placeholder?: string
  isDirty?: boolean
}

export default function EntryEditor({
  content,
  onUpdate,
  onEditorReady,
  placeholder,
  isDirty,
}: EntryEditorProps) {
  const { editorFontSize } = useUserPreferences()
  const fontSizeClass = FONT_SIZE_CLASS[editorFontSize] ?? FONT_SIZE_CLASS.medium

  const editor = useEditor({
    extensions: buildExtensions(placeholder ?? DEFAULT_PLACEHOLDER),
    editorProps: {
      attributes: {
        class:
          'outline-none bg-transparent leading-[1.9] font-light text-on-surface min-h-[60vh] w-full font-display',
        spellcheck: 'true',
      },
      // Keep cursor above the fixed BottomNav on mobile (nav ≈ 72px tall).
      // scrollThreshold triggers a scroll before the cursor enters the nav zone;
      // scrollMargin keeps it comfortably clear after scrolling.
      scrollThreshold: { top: 0, bottom: 120, left: 0, right: 0 },
      scrollMargin: { top: 0, bottom: 120, left: 0, right: 0 },
    },
    onUpdate({ editor }) {
      onUpdate(editor)
    },
  })

  // Notify parent when editor is ready
  useEffect(() => {
    if (editor && onEditorReady) {
      onEditorReady(editor)
    }
  }, [editor, onEditorReady])

  // Update placeholder when the verse loads async
  useEffect(() => {
    if (!editor) return
    editor.setOptions({ extensions: buildExtensions(placeholder ?? DEFAULT_PLACEHOLDER) })
  }, [editor, placeholder])

  // Load initial content from Firestore once editor is ready
  useEffect(() => {
    if (!editor) return
    if (isDirty) return

    // Keep the editor in sync when the loaded entry changes.
    // Use emitUpdate=false so hydrating content doesn't trigger autosave.
    if (content === null) {
      if (!editor.isEmpty) {
        editor.commands.setContent('', { emitUpdate: false })
      }
      return
    }

    const currentContent = editor.getJSON()
    if (JSON.stringify(currentContent) !== JSON.stringify(content)) {
      const { from, to } = editor.state.selection
      editor.commands.setContent(content, { emitUpdate: false })
      const docSize = editor.state.doc.content.size
      editor.commands.setTextSelection({
        from: Math.min(from, docSize),
        to: Math.min(to, docSize),
      })
    }
  }, [editor, content, isDirty])

  if (!editor) return null

  return (
    <div className={`relative pb-40 md:pb-32 ${fontSizeClass}`}>
      <BubbleMenu editor={editor}>
        <div className="bg-surface-container-lowest border-outline-variant/15 flex gap-0.5 rounded-xl border p-1 shadow-xl">
          <BubbleButton
            onClick={() => editor.chain().focus().toggleBold().run()}
            active={editor.isActive('bold')}
            label="Bold"
            icon="format_bold"
          />
          <BubbleButton
            onClick={() => editor.chain().focus().toggleItalic().run()}
            active={editor.isActive('italic')}
            label="Italic"
            icon="format_italic"
          />
        </div>
      </BubbleMenu>

      <FloatingMenu
        editor={editor}
        shouldShow={({ editor, state }) => {
          if (!editor.isEditable) return false
          const { selection } = state
          if (!selection.empty) return false
          const { $from } = selection
          const parent = $from.parent
          return parent.type.name === 'paragraph' && parent.content.size === 0
        }}
      >
        <div className="bg-surface-container-lowest border-outline-variant/15 flex gap-0.5 rounded-xl border p-1 shadow-xl">
          <BubbleButton
            onClick={() =>
              editor
                .chain()
                .focus()
                .insertContent([
                  {
                    type: 'heading',
                    attrs: { level: 2 },
                    content: [{ type: 'text', text: format(new Date(), 'p') }],
                  },
                  { type: 'paragraph' },
                ])
                .run()
            }
            active={false}
            label="Insert time"
            icon="schedule"
          />
        </div>
      </FloatingMenu>

      <EditorContent editor={editor} />
    </div>
  )
}

function BubbleButton({
  onClick,
  active,
  label,
  icon,
}: {
  onClick: () => void
  active: boolean
  label: string
  icon: string
}) {
  return (
    <button
      onMouseDown={(e) => {
        e.preventDefault() // prevent editor blur
        onClick()
      }}
      aria-label={label}
      className={`flex h-9 w-9 items-center justify-center rounded-lg transition-colors ${
        active
          ? 'bg-primary-container text-primary'
          : 'text-on-surface-variant hover:bg-surface-container'
      }`}
    >
      <span className="material-symbols-outlined text-[18px]">{icon}</span>
    </button>
  )
}
