import { useState } from 'react'
import clsx from 'clsx'

import { useFocusMode } from '@/context/FocusModeContext'
import { useEditorControls } from '@/context/EditorControlsContext'
import type { EditorFontSize } from '@/context/UserPreferencesContext'

const FONT_SIZE_STEPS: EditorFontSize[] = ['small', 'medium', 'large']
const STORAGE_KEY = 'pref_sidebar_expanded'

export default function CollapsibleSideBar() {
  const { isFocused, toggle: toggleFocus } = useFocusMode()
  const { isEditorActive, dictation, fontSize, onFontSizeChange, wordCount } = useEditorControls()

  const [isExpanded, setIsExpanded] = useState<boolean>(() => {
    try {
      return localStorage.getItem(STORAGE_KEY) === 'true'
    } catch {
      return false
    }
  })

  const isListening = dictation?.state === 'listening'

  const currentIndex = FONT_SIZE_STEPS.indexOf(fontSize)
  const nextSize = FONT_SIZE_STEPS[(currentIndex + 1) % FONT_SIZE_STEPS.length]

  // In focus mode, always treat sidebar as collapsed (panel content hidden)
  // The thin strip remains visible so the focus toggle icon is accessible
  const effectivelyExpanded = isExpanded && !isFocused

  function toggleExpanded() {
    setIsExpanded((prev) => {
      const next = !prev
      try {
        localStorage.setItem(STORAGE_KEY, String(next))
      } catch {
        // ignore
      }
      return next
    })
  }

  function handleFontCycle() {
    onFontSizeChange?.(nextSize)
  }

  return (
    // Only visible on MD–XL (hidden on mobile and XL+)
    <div
      className={clsx(
        'fixed top-0 right-0 z-30 hidden h-screen transition-all duration-300 md:flex xl:hidden',
        effectivelyExpanded ? 'w-[200px]' : 'w-5',
      )}
    >
      {/* Thin 20px strip — always visible */}
      <div className="bg-surface border-outline-variant/10 flex w-5 flex-shrink-0 flex-col items-center border-l py-4">
        {/* Chevron expand/collapse toggle */}
        <button
          onClick={toggleExpanded}
          aria-label={effectivelyExpanded ? 'Collapse sidebar' : 'Expand sidebar'}
          className="text-on-surface-variant/60 hover:text-primary mb-3 transition-colors"
        >
          <span className="material-symbols-outlined text-[18px]">
            {effectivelyExpanded ? 'chevron_right' : 'chevron_left'}
          </span>
        </button>

        {/* Mic icon — only in thin (collapsed) mode */}
        {isEditorActive && dictation?.isSupported && !effectivelyExpanded && (
          <button
            onClick={isListening ? dictation.onStop : dictation.onStart}
            aria-label={isListening ? 'Stop dictation' : 'Dictate'}
            className={clsx(
              'mb-2 transition-colors',
              isListening
                ? 'text-primary animate-pulse'
                : 'text-on-surface-variant/60 hover:text-primary',
            )}
          >
            <span className="material-symbols-outlined text-[18px]">
              {isListening ? 'mic_off' : 'mic'}
            </span>
          </button>
        )}

        {/* Font size icon — only in thin (collapsed) mode */}
        {isEditorActive && onFontSizeChange && !effectivelyExpanded && (
          <button
            onClick={handleFontCycle}
            aria-label={`Text size: ${fontSize}. Click to change`}
            className={clsx(
              'mb-2 transition-colors',
              fontSize !== 'medium'
                ? 'text-primary'
                : 'text-on-surface-variant/60 hover:text-primary',
            )}
          >
            <span className="material-symbols-outlined text-[18px]">format_size</span>
          </button>
        )}

        {/* Focus toggle — always visible so user can exit focus mode */}
        <button
          onClick={toggleFocus}
          aria-label={isFocused ? 'Exit focus mode' : 'Enter focus mode'}
          className={clsx(
            'mt-auto transition-colors',
            isFocused ? 'text-primary' : 'text-on-surface-variant/60 hover:text-primary',
          )}
        >
          <span className="material-symbols-outlined text-[18px]">
            {isFocused ? 'visibility' : 'visibility_off'}
          </span>
        </button>
      </div>

      {/* Expanded panel content — hidden in focus mode */}
      {effectivelyExpanded && (
        <div className="bg-surface border-outline-variant/10 flex flex-1 flex-col gap-4 overflow-y-auto border-l px-4 py-4">
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
      )}
    </div>
  )
}
