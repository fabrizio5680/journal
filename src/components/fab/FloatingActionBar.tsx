import type { DictationState } from '@/hooks/useDictation'
import type { EditorFontSize } from '@/context/UserPreferencesContext'

interface DictationProps {
  isSupported: boolean
  state: DictationState
  errorMessage: string | null
  onStart: () => void
  onStop: () => void
}

interface FloatingActionBarProps {
  wordCount: number
  isDirty: boolean
  onSave: () => void
  dictation?: DictationProps
  fontSize?: EditorFontSize
  onFontSizeChange?: (size: EditorFontSize) => void
}

const FONT_SIZE_STEPS: EditorFontSize[] = ['small', 'medium', 'large']

export default function FloatingActionBar({
  wordCount,
  isDirty,
  onSave,
  dictation,
  fontSize = 'medium',
  onFontSizeChange,
}: FloatingActionBarProps) {
  const isListening = dictation?.state === 'listening'
  const hasError = dictation?.state === 'error'

  const currentIndex = FONT_SIZE_STEPS.indexOf(fontSize)
  const canDecrease = currentIndex > 0
  const canIncrease = currentIndex < FONT_SIZE_STEPS.length - 1

  function handleDecrease() {
    if (canDecrease) onFontSizeChange?.(FONT_SIZE_STEPS[currentIndex - 1])
  }

  function handleIncrease() {
    if (canIncrease) onFontSizeChange?.(FONT_SIZE_STEPS[currentIndex + 1])
  }

  return (
    <div className="fixed bottom-24 left-1/2 z-40 -translate-x-1/2 md:right-10 md:bottom-10 md:left-auto md:translate-x-0">
      <div className="flex items-center gap-3">
        {/* Dictate button */}
        {dictation?.isSupported && (
          <div className="relative">
            {hasError && (
              <p className="text-error absolute -top-8 left-1/2 -translate-x-1/2 text-xs whitespace-nowrap">
                {dictation.errorMessage}
              </p>
            )}
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
          </div>
        )}

        {/* Font size controls */}
        {onFontSizeChange && (
          <div className="flex items-center gap-1">
            <button
              onClick={handleDecrease}
              disabled={!canDecrease}
              aria-label="Decrease text size"
              className={`bg-surface-container-lowest border-outline-variant/20 flex h-8 w-8 items-center justify-center rounded-full border shadow-md transition-all ${
                canDecrease
                  ? 'text-on-surface-variant hover:text-primary hover:border-primary/20'
                  : 'text-on-surface-variant/30 cursor-not-allowed'
              }`}
            >
              <span className="text-[11px] leading-none font-semibold">A−</span>
            </button>
            <button
              onClick={handleIncrease}
              disabled={!canIncrease}
              aria-label="Increase text size"
              className={`bg-surface-container-lowest border-outline-variant/20 flex h-8 w-8 items-center justify-center rounded-full border shadow-md transition-all ${
                canIncrease
                  ? 'text-on-surface-variant hover:text-primary hover:border-primary/20'
                  : 'text-on-surface-variant/30 cursor-not-allowed'
              }`}
            >
              <span className="text-[13px] leading-none font-semibold">A+</span>
            </button>
          </div>
        )}

        {/* Word count */}
        <span className="text-on-surface-variant/50 min-w-[4rem] text-center text-[11px] tracking-wide">
          {wordCount} {wordCount === 1 ? 'word' : 'words'}
        </span>

        {/* Save button */}
        <button
          onClick={onSave}
          aria-label="Save changes"
          disabled={!isDirty}
          className={`text-on-primary flex h-12 w-12 items-center justify-center rounded-full text-sm font-semibold transition-all ${
            isDirty
              ? 'bg-primary hover:bg-primary-dim shadow-[0_8px_32px_rgba(61,84,49,0.25)] hover:-translate-y-0.5 hover:shadow-[0_12px_40px_rgba(61,84,49,0.3)]'
              : 'bg-outline-variant/40 cursor-not-allowed shadow-none'
          } md:h-12 md:w-auto md:gap-2 md:px-7`}
        >
          <span className="material-symbols-outlined text-[18px]">check</span>
          <span className="hidden md:inline">Save</span>
        </button>
      </div>
    </div>
  )
}
