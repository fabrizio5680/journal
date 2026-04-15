import type { DictationState } from '@/hooks/useDictation'

interface DictationProps {
  isSupported: boolean
  state: DictationState
  errorMessage: string | null
  onStart: () => void
  onStop: () => void
}

interface FloatingActionBarProps {
  wordCount: number
  onSave: () => void
  dictation?: DictationProps
}

export default function FloatingActionBar({
  wordCount,
  onSave,
  dictation,
}: FloatingActionBarProps) {
  const isListening = dictation?.state === 'listening'
  const hasError = dictation?.state === 'error'

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
              className={`bg-surface-container-lowest text-on-surface-variant flex h-12 w-12 items-center justify-center rounded-full shadow-md border border-outline-variant/20 transition-all ${
                isListening ? 'ring-primary/50 animate-pulse ring-2 ring-offset-2 text-primary' : 'hover:text-primary hover:border-primary/20'
              }`}
            >
              <span className="material-symbols-outlined text-[20px]">
                {isListening ? 'mic_off' : 'mic'}
              </span>
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
          aria-label="Save Entry"
          className="bg-primary hover:bg-primary-dim text-on-primary flex h-12 items-center gap-2 rounded-full px-7 text-sm font-semibold shadow-[0_8px_32px_rgba(61,84,49,0.25)] transition-all hover:shadow-[0_12px_40px_rgba(61,84,49,0.3)] hover:-translate-y-0.5"
        >
          <span className="material-symbols-outlined text-[18px]">check</span>
          Save Entry
        </button>
      </div>
    </div>
  )
}
