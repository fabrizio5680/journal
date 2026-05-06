import { useState } from 'react'
import clsx from 'clsx'

import { MOODS } from '@/lib/moods'
import MoodPicker from '@/components/mood/MoodPicker'
import TagInput from '@/components/tags/TagInput'
import ScriptureChip from '@/components/scripture/ScriptureChip'
import ScriptureRefInput from '@/components/scripture/ScriptureRefInput'
import type { ScriptureRef } from '@/types'

type ActivePicker = 'mood' | 'scripture' | 'tag' | null

interface MetadataBarProps {
  mood: 1 | 2 | 3 | 4 | 5 | null
  moodLabel: string | null
  tags: string[]
  tagVocabulary: string[]
  onMoodChange: (mood: number | null, label: string | null) => void
  onTagsChange: (tags: string[]) => void
  onNewTag: (tag: string) => void
  scriptureRefs: ScriptureRef[]
  scriptureTranslation: 'NLT' | 'MSG' | 'ESV'
  onScriptureRefsChange: (refs: ScriptureRef[]) => void
}

export default function MetadataBar({
  mood,
  moodLabel,
  tags,
  tagVocabulary,
  onMoodChange,
  onTagsChange,
  onNewTag,
  scriptureRefs,
  scriptureTranslation,
  onScriptureRefsChange,
}: MetadataBarProps) {
  const [activePicker, setActivePicker] = useState<ActivePicker>(null)

  const moodEntry =
    mood !== null
      ? (MOODS.find((m) => m.label === moodLabel) ?? MOODS.find((m) => m.value === mood))
      : null

  function togglePicker(picker: ActivePicker) {
    setActivePicker((prev) => (prev === picker ? null : picker))
  }

  function handleMoodClick() {
    togglePicker('mood')
  }

  function handleScriptureClick() {
    togglePicker('scripture')
  }

  function handleTagClick() {
    togglePicker('tag')
  }

  function handleMoodChange(newMood: number | null, label: string | null) {
    onMoodChange(newMood, label)
    setActivePicker(null)
  }

  function handleAddScriptureRef(ref: ScriptureRef) {
    onScriptureRefsChange([...scriptureRefs, ref])
    setActivePicker(null)
  }

  function handleRemoveScriptureRef(passageId: string) {
    onScriptureRefsChange(scriptureRefs.filter((r) => r.passageId !== passageId))
  }

  return (
    <div
      data-testid="metadata-bar"
      className={clsx(
        'bg-surface/90 border-outline-variant/10 z-20 border-b py-2 backdrop-blur-sm',
        // Mobile: sticky within content flow
        'sticky top-16 -mx-6 px-6',
        // Hidden on md+ (RightPanel handles metadata)
        'md:hidden',
      )}
    >
      <div>
        {/* Chips row */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Mood chip */}
          <button
            type="button"
            onClick={handleMoodClick}
            className={clsx(
              'flex-shrink-0 rounded-full px-3 py-1.5 text-xs font-medium transition-colors',
              activePicker === 'mood'
                ? 'bg-secondary-container text-on-secondary-container'
                : 'bg-secondary-container/70 text-on-secondary-container hover:bg-secondary-container',
            )}
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

          {/* Scripture chips */}
          {scriptureRefs.map((ref) => (
            <ScriptureChip
              key={ref.passageId}
              ref_={ref}
              translation={scriptureTranslation}
              onRemove={() => handleRemoveScriptureRef(ref.passageId)}
            />
          ))}

          {/* Add scripture button */}
          <button
            type="button"
            onClick={handleScriptureClick}
            aria-label="Add scripture reference"
            className="text-on-surface-variant/40 hover:text-on-surface-variant flex-shrink-0 rounded-full px-3 py-1.5 text-xs font-medium transition-colors"
          >
            + scripture
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
        {activePicker === 'mood' && (
          <div data-testid="mood-picker-inline">
            <MoodPicker value={mood} label={moodLabel} onChange={handleMoodChange} />
          </div>
        )}

        {/* Inline ScriptureRefInput */}
        {activePicker === 'scripture' && (
          <div data-testid="scripture-input-inline">
            <ScriptureRefInput translation={scriptureTranslation} onAdd={handleAddScriptureRef} />
          </div>
        )}

        {/* Inline TagInput */}
        {activePicker === 'tag' && (
          <div data-testid="tag-input-inline">
            <TagInput
              tags={tags}
              vocabulary={tagVocabulary}
              onChange={onTagsChange}
              onNewTag={onNewTag}
            />
          </div>
        )}
      </div>
    </div>
  )
}
