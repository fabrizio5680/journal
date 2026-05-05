import { useEffect, useState } from 'react'
import clsx from 'clsx'

import DailyScripture from '@/components/ui/DailyScripture'
import MoodPicker from '@/components/mood/MoodPicker'
import ScriptureChip from '@/components/scripture/ScriptureChip'
import ScriptureRefInput from '@/components/scripture/ScriptureRefInput'
import TagInput from '@/components/tags/TagInput'
import { useFocusMode } from '@/context/FocusModeContext'
import { useUserPreferences } from '@/context/UserPreferencesContext'
import { useEditorControls } from '@/context/EditorControlsContext'
import type { EditorFontSize } from '@/context/UserPreferencesContext'
import type { ScriptureRef } from '@/types'
import { MOODS } from '@/lib/moods'

const FONT_SIZE_STEPS: EditorFontSize[] = ['small', 'medium', 'large']

type ActivePicker = 'mood' | 'scripture' | 'tag' | null

export default function RightPanel() {
  const [isOnline, setIsOnline] = useState(navigator.onLine)
  const [activePicker, setActivePicker] = useState<ActivePicker>(null)
  const { isFocused } = useFocusMode()
  const { scriptureTranslation } = useUserPreferences()
  const { isEditorActive, dictation, fontSize, onFontSizeChange, wordCount, metadata } =
    useEditorControls()

  const currentIndex = FONT_SIZE_STEPS.indexOf(fontSize)
  const nextSize = FONT_SIZE_STEPS[(currentIndex + 1) % FONT_SIZE_STEPS.length]

  const isListening = dictation?.state === 'listening'
  const hasError = dictation?.state === 'error'

  // Derive effective picker — reset to null when no editor is active
  const effectivePicker: ActivePicker = isEditorActive ? activePicker : null

  // Watch online/offline status
  useEffect(() => {
    const onOnline = () => setIsOnline(true)
    const onOffline = () => setIsOnline(false)
    window.addEventListener('online', onOnline)
    window.addEventListener('offline', onOffline)
    return () => {
      window.removeEventListener('online', onOnline)
      window.removeEventListener('offline', onOffline)
    }
  }, [])

  function togglePicker(picker: ActivePicker) {
    setActivePicker((prev) => (prev === picker ? null : picker))
  }

  function handleMoodChange(newMood: number | null, label: string | null) {
    metadata?.onMoodChange(newMood, label)
    setActivePicker(null)
  }

  function handleAddScriptureRef(ref: ScriptureRef) {
    if (!metadata) return
    metadata.onScriptureRefsChange([...metadata.scriptureRefs, ref])
    setActivePicker(null)
  }

  function handleRemoveScriptureRef(passageId: string) {
    if (!metadata) return
    metadata.onScriptureRefsChange(metadata.scriptureRefs.filter((r) => r.passageId !== passageId))
  }

  const moodEntry =
    metadata?.mood !== null && metadata?.mood !== undefined
      ? (MOODS.find((m) => m.label === metadata.moodLabel) ??
        MOODS.find((m) => m.value === metadata.mood))
      : null

  return (
    <aside
      className={clsx(
        'bg-surface border-outline-variant/10 fixed top-0 right-0 z-30 hidden h-screen w-80 flex-col gap-6 border-l px-6 py-8 transition-all duration-500 xl:flex',
        isFocused && 'xl:pointer-events-none xl:translate-x-full xl:opacity-0',
      )}
    >
      {/* Daily scripture */}
      <DailyScripture translation={scriptureTranslation} />

      {/* Metadata section — visible when an editor page is active */}
      {isEditorActive && metadata && (
        <div className="border-outline-variant/20 flex flex-col gap-3 border-t pt-4">
          {/* Mood chip */}
          <div>
            <button
              type="button"
              onClick={() => togglePicker('mood')}
              className={clsx(
                'rounded-full px-3 py-1.5 text-xs font-medium transition-colors',
                effectivePicker === 'mood'
                  ? 'bg-secondary-container text-on-secondary-container'
                  : 'bg-secondary-container/70 text-on-secondary-container hover:bg-secondary-container',
              )}
            >
              {moodEntry ? (
                <span className="inline-flex items-center gap-1.5">
                  <span aria-hidden="true">{moodEntry.emoji}</span>
                  <span>{metadata.moodLabel ?? moodEntry.label}</span>
                </span>
              ) : (
                '+ mood'
              )}
            </button>
            {effectivePicker === 'mood' && (
              <div className="mt-2">
                <MoodPicker
                  value={metadata.mood}
                  label={metadata.moodLabel}
                  onChange={handleMoodChange}
                />
              </div>
            )}
          </div>

          {/* Scripture refs + add */}
          <div>
            <div className="flex flex-wrap items-center gap-2">
              {metadata.scriptureRefs.map((ref) => (
                <ScriptureChip
                  key={ref.passageId}
                  ref_={ref}
                  translation={metadata.scriptureTranslation}
                  onRemove={() => handleRemoveScriptureRef(ref.passageId)}
                />
              ))}
              <button
                type="button"
                onClick={() => togglePicker('scripture')}
                aria-label="Add scripture reference"
                className="text-on-surface-variant/40 hover:text-on-surface-variant rounded-full px-3 py-1.5 text-xs font-medium transition-colors"
              >
                + scripture
              </button>
            </div>
            {effectivePicker === 'scripture' && (
              <div className="mt-2">
                <ScriptureRefInput
                  translation={metadata.scriptureTranslation}
                  onAdd={handleAddScriptureRef}
                />
              </div>
            )}
          </div>

          {/* Tags + add */}
          <div>
            <div className="flex flex-wrap items-center gap-2">
              {metadata.tags.map((tag) => (
                <span
                  key={tag}
                  className="bg-secondary-container/70 text-on-secondary-container rounded-full px-3 py-1.5 text-xs font-medium"
                >
                  {tag}
                </span>
              ))}
              <button
                type="button"
                onClick={() => togglePicker('tag')}
                aria-label="Add tag"
                className="text-on-surface-variant/40 hover:text-on-surface-variant rounded-full px-3 py-1.5 text-xs font-medium transition-colors"
              >
                + tag
              </button>
            </div>
            {effectivePicker === 'tag' && (
              <div className="mt-2">
                <TagInput
                  tags={metadata.tags}
                  vocabulary={metadata.tagVocabulary}
                  onChange={metadata.onTagsChange}
                  onNewTag={metadata.onNewTag}
                />
              </div>
            )}
          </div>
        </div>
      )}

      {/* Editor controls — visible when an editor page is active */}
      {isEditorActive && (
        <div className="border-outline-variant/20 border-t pt-4">
          {/* Dictation error */}
          {hasError && dictation?.errorMessage && (
            <p className="text-error mb-2 text-xs">{dictation.errorMessage}</p>
          )}
          <div className="flex items-center gap-3">
            {/* Dictate button */}
            {dictation?.isSupported && (
              <button
                onClick={isListening ? dictation.onStop : dictation.onStart}
                aria-label={isListening ? 'Stop dictation' : 'Dictate'}
                className={`bg-surface-container-lowest text-on-surface-variant border-outline-variant/20 flex h-12 w-12 items-center justify-center rounded-full border shadow-md transition-all ${
                  isListening
                    ? 'ring-primary/50 text-primary animate-pulse ring-2 ring-offset-2'
                    : 'hover:text-primary hover:border-primary/20'
                }`}
              >
                <span className="material-symbols-outlined text-[20px]">
                  {isListening ? 'mic_off' : 'mic'}
                </span>
              </button>
            )}

            {/* Font size cycle */}
            {onFontSizeChange && (
              <button
                onClick={() => onFontSizeChange(nextSize)}
                aria-label={`Text size: ${fontSize}. Click to change`}
                className={clsx(
                  'bg-surface-container-lowest border-outline-variant/20 flex h-10 items-center gap-1.5 rounded-full border px-4 shadow-md transition-all',
                  fontSize !== 'medium'
                    ? 'text-primary'
                    : 'text-on-surface-variant/60 hover:text-primary hover:border-primary/20',
                )}
              >
                <span className="material-symbols-outlined text-[18px]">format_size</span>
              </button>
            )}

            {/* Word count */}
            <span className="text-on-surface-variant/50 min-w-[4rem] text-center text-[11px] tracking-wide">
              {wordCount} {wordCount === 1 ? 'word' : 'words'}
            </span>
          </div>
          {isListening && dictation?.interimTranscript && (
            <p className="text-on-surface-variant/50 mt-2 text-xs leading-snug italic">
              {dictation.interimTranscript}
            </p>
          )}
        </div>
      )}

      {/* Sync status */}
      <div className="text-on-surface-variant mt-auto flex items-center gap-2 text-xs">
        {isOnline ? (
          <>
            <span className="material-symbols-outlined text-primary text-base">cloud_done</span>
            <span>Synced to Cloud</span>
          </>
        ) : (
          <>
            <span className="material-symbols-outlined text-on-surface-variant text-base">
              cloud_off
            </span>
            <span>Offline — changes will sync</span>
          </>
        )}
      </div>
    </aside>
  )
}
