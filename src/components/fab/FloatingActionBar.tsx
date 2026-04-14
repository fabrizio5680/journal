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
    <div className="fixed bottom-20 left-1/2 z-40 -translate-x-1/2 md:right-12 md:bottom-12 md:left-auto md:translate-x-0">
      <div className="flex items-center gap-3">
        {/* Dictate button — hidden if speech not supported */}
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
              className={`bg-surface-container-lowest text-primary flex h-16 w-16 items-center justify-center rounded-full shadow-[0_10px_40px_rgba(48,51,49,0.12)] transition-all ${
                isListening ? 'ring-primary animate-pulse ring-2 ring-offset-2' : ''
              }`}
            >
              <span className="material-symbols-outlined">{isListening ? 'mic_off' : 'mic'}</span>
            </button>
          </div>
        )}

        {/* Word count */}
        <span className="text-on-surface-variant min-w-[3rem] text-center text-xs">
          {wordCount} {wordCount === 1 ? 'word' : 'words'}
        </span>

        {/* Save button */}
        <button
          onClick={onSave}
          aria-label="Save Entry"
          className="from-primary to-primary-dim text-on-primary flex h-16 items-center gap-2 rounded-full bg-gradient-to-r px-10 font-bold shadow-[0_10px_40px_rgba(82,100,72,0.2)]"
        >
          <span className="material-symbols-outlined">check_circle</span>
          Save Entry
        </button>
      </div>
    </div>
  )
}
