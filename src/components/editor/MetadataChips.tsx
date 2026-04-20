import { useState } from 'react'

import { MOODS } from '@/lib/moods'
import MoodPicker from '@/components/mood/MoodPicker'
import TagInput from '@/components/tags/TagInput'

interface MetadataChipsProps {
  mood: 1 | 2 | 3 | 4 | 5 | null
  moodLabel: string | null
  tags: string[]
  tagVocabulary: string[]
  onMoodClick?: () => void
  onTagClick?: () => void
  onMoodChange: (mood: number | null, label: string | null) => void
  onTagsChange: (tags: string[]) => void
  onNewTag: (tag: string) => void
}

export default function MetadataChips({
  mood,
  moodLabel,
  tags,
  tagVocabulary,
  onMoodClick,
  onTagClick,
  onMoodChange,
  onTagsChange,
  onNewTag,
}: MetadataChipsProps) {
  const [showMoodPicker, setShowMoodPicker] = useState(false)
  const [showTagInput, setShowTagInput] = useState(false)

  const moodEntry = mood !== null ? MOODS.find((m) => m.value === mood) : null

  function handleMoodClick() {
    setShowMoodPicker((prev) => !prev)
    setShowTagInput(false)
    onMoodClick?.()
  }

  function handleTagClick() {
    setShowTagInput((prev) => !prev)
    setShowMoodPicker(false)
    onTagClick?.()
  }

  function handleMoodChange(newMood: number | null, label: string | null) {
    onMoodChange(newMood, label)
    setShowMoodPicker(false)
  }

  return (
    <div>
      {/* Chips row */}
      <div className="no-scrollbar flex items-center gap-2 overflow-x-auto py-2">
        {/* Mood chip */}
        <button
          type="button"
          onClick={handleMoodClick}
          className="bg-secondary-container/70 text-on-secondary-container hover:bg-secondary-container flex-shrink-0 rounded-full px-3 py-1.5 text-xs font-medium transition-colors"
        >
          {moodEntry ? (
            <span className="inline-flex items-center gap-1.5">
              <span aria-hidden="true">{moodEntry.emoji}</span>
              <span>{moodLabel ?? moodEntry.label}</span>
            </span>
          ) : (
            '+ mood'
          )}
        </button>

        {/* Tag chips */}
        {tags.map((tag) => (
          <span
            key={tag}
            className="bg-secondary-container/70 text-on-secondary-container flex-shrink-0 rounded-full px-3 py-1.5 text-xs font-medium"
          >
            {tag}
          </span>
        ))}

        {/* Add tag button */}
        <button
          type="button"
          onClick={handleTagClick}
          aria-label="Add tag"
          className="text-on-surface-variant/40 hover:text-on-surface-variant flex-shrink-0 rounded-full px-3 py-1.5 text-xs font-medium transition-colors"
        >
          + tag
        </button>
      </div>

      {/* Inline MoodPicker */}
      {showMoodPicker && <MoodPicker value={mood} onChange={handleMoodChange} />}

      {/* Inline TagInput */}
      {showTagInput && (
        <TagInput
          tags={tags}
          vocabulary={tagVocabulary}
          onChange={onTagsChange}
          onNewTag={onNewTag}
        />
      )}
    </div>
  )
}
