import clsx from 'clsx'

import { useFocusMode } from '@/context/FocusModeContext'
import { useEditorControls } from '@/context/EditorControlsContext'
import type { EditorFontSize } from '@/context/UserPreferencesContext'

const FONT_SIZE_STEPS: EditorFontSize[] = ['small', 'medium', 'large']

export default function TabletSideBar() {
  const { isFocused, toggle: toggleFocus } = useFocusMode()
  const { isEditorActive, dictation, fontSize, onFontSizeChange, wordCount } = useEditorControls()

  const isListening = dictation?.state === 'listening'

  const currentIndex = FONT_SIZE_STEPS.indexOf(fontSize)
  const nextSize = FONT_SIZE_STEPS[(currentIndex + 1) % FONT_SIZE_STEPS.length]

  function handleFontCycle() {
    onFontSizeChange?.(nextSize)
  }

  return (
    // Only visible on MD–XL (hidden on mobile and XL+)
    <div
      className={clsx(
        'fixed top-0 right-0 z-30 hidden h-screen w-[200px] md:flex xl:hidden',
        'bg-surface border-outline-variant/10 flex-col gap-4 overflow-y-auto border-l px-4 py-4',
        'transition-transform duration-300',
        isFocused ? 'translate-x-full' : 'translate-x-0',
      )}
    >
      {/* Mic button */}
      {isEditorActive && dictation?.isSupported && (
        <button
          onClick={isListening ? dictation.onStop : dictation.onStart}
          aria-label={isListening ? 'Stop dictation' : 'Dictate'}
          className={`bg-surface-container-lowest text-on-surface-variant border-outline-variant/20 flex h-10 w-10 items-center justify-center rounded-full border shadow-sm transition-all ${
            isListening
              ? 'ring-primary/50 text-primary animate-pulse ring-2 ring-offset-1'
              : 'hover:text-primary hover:border-primary/20'
          }`}
        >
          <span className="material-symbols-outlined text-[18px]">
            {isListening ? 'mic_off' : 'mic'}
          </span>
        </button>
      )}

      {/* Font size cycle button */}
      {isEditorActive && onFontSizeChange && (
        <button
          onClick={handleFontCycle}
          aria-label={`Text size: ${fontSize}. Click to change`}
          className={clsx(
            'transition-colors',
            fontSize !== 'medium'
              ? 'text-primary'
              : 'text-on-surface-variant/60 hover:text-primary',
          )}
        >
          <span className="material-symbols-outlined text-[18px]">format_size</span>
        </button>
      )}

      {/* Word count */}
      {isEditorActive && (
        <span className="text-on-surface-variant/50 text-[11px] tracking-wide">
          {wordCount} {wordCount === 1 ? 'word' : 'words'}
        </span>
      )}

      {/* Interim transcript */}
      {isListening && dictation?.interimTranscript && (
        <p className="text-on-surface-variant/50 text-xs leading-snug italic">
          {dictation.interimTranscript}
        </p>
      )}

      {/* Focus toggle */}
      <button
        onClick={toggleFocus}
        aria-label={isFocused ? 'Exit focus mode' : 'Enter focus mode'}
        className={clsx(
          'mt-auto flex items-center gap-2 text-xs transition-colors',
          isFocused ? 'text-primary' : 'text-on-surface-variant/60 hover:text-primary',
        )}
      >
        <span className="material-symbols-outlined text-[18px]">
          {isFocused ? 'visibility' : 'visibility_off'}
        </span>
        <span>Focus</span>
      </button>
    </div>
  )
}
