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
  dictation?: DictationProps
  fontSize?: EditorFontSize
  onFontSizeChange?: (size: EditorFontSize) => void
}

const FONT_SIZE_STEPS: EditorFontSize[] = ['small', 'medium', 'large']

export default function FloatingActionBar({
  wordCount,
  dictation,
  fontSize = 'medium',
  onFontSizeChange,
}: FloatingActionBarProps) {
  const isListening = dictation?.state === 'listening'
  const hasError = dictation?.state === 'error'

  const currentIndex = FONT_SIZE_STEPS.indexOf(fontSize)
  const nextSize = FONT_SIZE_STEPS[(currentIndex + 1) % FONT_SIZE_STEPS.length]

  return (
    <div className="fixed bottom-10 left-64 z-40 hidden md:flex xl:hidden">
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

        {/* Font size cycle */}
        {onFontSizeChange && (
          <button
            onClick={() => onFontSizeChange(nextSize)}
            aria-label={`Text size: ${fontSize}. Click to change`}
            className="bg-surface-container-lowest text-on-surface-variant border-outline-variant/20 hover:text-primary hover:border-primary/20 flex h-10 items-center gap-1.5 rounded-full border px-4 shadow-md transition-all"
          >
            <span className="text-[13px] leading-none font-bold">Aa</span>
            <span className="text-[10px] capitalize">{fontSize}</span>
          </button>
        )}

        {/* Word count */}
        <span
          data-testid="word-count"
          className="text-on-surface-variant/50 min-w-[4rem] text-center text-[11px] tracking-wide"
        >
          {wordCount} {wordCount === 1 ? 'word' : 'words'}
        </span>
      </div>
    </div>
  )
}
