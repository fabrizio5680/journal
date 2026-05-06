import { useState } from 'react'

import { MOODS } from '@/lib/moods'
import MetadataSheet from '@/components/editor/MetadataSheet'
import type { ScriptureRef } from '@/types'

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
  const [sheetOpen, setSheetOpen] = useState(false)
  const [sheetSection, setSheetSection] = useState<'mood' | 'scripture' | 'tags' | undefined>()

  const moodEntry =
    mood !== null
      ? (MOODS.find((m) => m.label === moodLabel) ?? MOODS.find((m) => m.value === mood))
      : null

  function openSheet(section: 'mood' | 'scripture' | 'tags' | 'all') {
    setSheetSection(section === 'all' ? undefined : section)
    setSheetOpen(true)
  }

  return (
    <div
      data-testid="metadata-bar"
      className="bg-surface/90 border-outline-variant/10 sticky top-16 z-20 -mx-6 border-b px-6 py-2 backdrop-blur-sm md:hidden"
    >
      <button
        type="button"
        onClick={() => openSheet('all')}
        className="border-outline-variant/20 bg-surface flex w-full items-center gap-2.5 rounded-2xl border px-3 py-2.5 text-left shadow-sm"
      >
        <div
          role="presentation"
          onClick={(e) => {
            e.stopPropagation()
            openSheet('mood')
          }}
          className="bg-secondary-container text-on-secondary-container flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium"
        >
          {moodEntry ? (
            <>
              <span>{moodEntry.emoji}</span>
              <span>{moodLabel ?? moodEntry.label}</span>
            </>
          ) : (
            <span>+ Mood</span>
          )}
        </div>

        <div
          role="presentation"
          onClick={(e) => {
            e.stopPropagation()
            openSheet('scripture')
          }}
          className="text-on-surface-variant flex items-center gap-1 text-xs"
        >
          <span className="material-symbols-outlined text-sm">menu_book</span>
          <span className="font-medium">{scriptureRefs.length}</span>
        </div>

        <div
          role="presentation"
          onClick={(e) => {
            e.stopPropagation()
            openSheet('tags')
          }}
          className="text-on-surface-variant flex items-center gap-1 text-xs"
        >
          <span className="material-symbols-outlined text-sm">label</span>
          <span className="font-medium">{tags.length}</span>
        </div>

        <div className="flex-1" />

        <span className="text-on-surface-variant/60 flex items-center gap-1 text-xs font-medium">
          Edit
          <span className="material-symbols-outlined text-sm">expand_less</span>
        </span>
      </button>

      <MetadataSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        initialSection={sheetSection}
        mood={mood}
        moodLabel={moodLabel}
        tags={tags}
        tagVocabulary={tagVocabulary}
        onMoodChange={onMoodChange}
        onTagsChange={onTagsChange}
        onNewTag={onNewTag}
        scriptureRefs={scriptureRefs}
        scriptureTranslation={scriptureTranslation}
        onScriptureRefsChange={onScriptureRefsChange}
      />
    </div>
  )
}
