const speechSupported =
  typeof window !== 'undefined' &&
  ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window)

interface FloatingActionBarProps {
  wordCount: number
  onSave: () => void
  onDictate?: () => void
}

export default function FloatingActionBar({ wordCount, onSave, onDictate }: FloatingActionBarProps) {
  return (
    <div className="fixed bottom-20 left-1/2 z-40 -translate-x-1/2 md:translate-x-0 md:left-auto md:right-12 md:bottom-12">
      <div className="flex items-center gap-3">
        {/* Dictate button — hidden if speech not supported */}
        {speechSupported && (
          <button
            onClick={onDictate}
            aria-label="Dictate"
            className="bg-surface-container-lowest text-primary flex h-16 w-16 items-center justify-center rounded-full shadow-[0_10px_40px_rgba(48,51,49,0.12)]"
          >
            <span className="material-symbols-outlined">mic</span>
          </button>
        )}

        {/* Word count */}
        <span className="text-on-surface-variant min-w-[3rem] text-center text-xs">
          {wordCount} {wordCount === 1 ? 'word' : 'words'}
        </span>

        {/* Save button */}
        <button
          onClick={onSave}
          aria-label="Save Entry"
          className="bg-gradient-to-r from-primary to-primary-dim text-on-primary flex h-16 items-center gap-2 rounded-full px-10 font-bold shadow-[0_10px_40px_rgba(82,100,72,0.2)]"
        >
          <span className="material-symbols-outlined">check_circle</span>
          Save Entry
        </button>
      </div>
    </div>
  )
}
