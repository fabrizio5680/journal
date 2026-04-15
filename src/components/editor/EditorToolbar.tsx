import type { Editor } from '@tiptap/core'

interface EditorToolbarProps {
  editor: Editor | null
  saveStatus?: string | null
}

export default function EditorToolbar({ editor, saveStatus }: EditorToolbarProps) {
  if (!editor) return null

  return (
    <div className="bg-surface/90 border-outline-variant/15 fixed top-0 right-0 left-0 z-30 hidden items-center justify-between border-b px-6 py-2 backdrop-blur-md md:left-64 md:flex xl:right-80">
      <div className="flex items-center gap-0.5">
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleBold().run()}
          active={editor.isActive('bold')}
          label="Bold"
          icon="format_bold"
        />
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleItalic().run()}
          active={editor.isActive('italic')}
          label="Italic"
          icon="format_italic"
        />
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          active={editor.isActive('bulletList')}
          label="Bullet list"
          icon="format_list_bulleted"
        />
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
          active={editor.isActive('heading', { level: 2 })}
          label="Heading 2"
          icon="title"
        />
      </div>

      {saveStatus && (
        <span className="text-on-surface-variant/50 text-[11px] tracking-wide">{saveStatus}</span>
      )}
    </div>
  )
}

function ToolbarButton({
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
      onClick={onClick}
      aria-label={label}
      className={`rounded-lg p-2 transition-colors ${
        active
          ? 'bg-primary-container text-primary'
          : 'text-on-surface-variant/60 hover:bg-surface-container hover:text-on-surface-variant'
      }`}
    >
      <span className="material-symbols-outlined text-[18px]">{icon}</span>
    </button>
  )
}
