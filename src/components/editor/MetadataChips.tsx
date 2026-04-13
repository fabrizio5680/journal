import { MOODS } from '@/types'

interface MetadataChipsProps {
  mood: 1 | 2 | 3 | 4 | 5 | null
  moodLabel: string | null
  tags: string[]
  onMoodClick: () => void
  onTagClick: () => void
}

export default function MetadataChips({
  mood,
  moodLabel,
  tags,
  onMoodClick,
  onTagClick,
}: MetadataChipsProps) {
  const moodEntry = mood !== null ? MOODS.find((m) => m.value === mood) : null

  return (
    <div className="flex items-center gap-2 overflow-x-auto py-2 no-scrollbar">
      {/* Mood chip */}
      <button
        onClick={onMoodClick}
        className="bg-secondary-container text-on-secondary-container flex-shrink-0 rounded-xl px-3 py-1.5 text-xs font-medium"
      >
        {moodEntry ? `${moodEntry.emoji} ${moodLabel ?? moodEntry.label}` : 'Add mood'}
      </button>

      {/* Tag chips */}
      {tags.map((tag) => (
        <span
          key={tag}
          className="bg-secondary-container text-on-secondary-container flex-shrink-0 rounded-xl px-3 py-1.5 text-xs font-medium"
        >
          {tag}
        </span>
      ))}

      {/* Add tag button */}
      <button
        onClick={onTagClick}
        aria-label="Add tag"
        className="flex-shrink-0 rounded-xl px-3 py-1.5 text-xs font-medium text-on-surface-variant/40 hover:text-on-surface-variant transition-colors"
      >
        + Add tag
      </button>

      {/* Add circle icon button */}
      <button
        onClick={onTagClick}
        aria-label="Add"
        className="text-on-surface-variant/40 hover:text-on-surface-variant flex-shrink-0 transition-colors"
      >
        <span className="material-symbols-outlined text-[20px]">add_circle</span>
      </button>
    </div>
  )
}
