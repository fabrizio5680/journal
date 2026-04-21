import { NavLink } from 'react-router-dom'
import clsx from 'clsx'

import { useFocusMode } from '@/context/FocusModeContext'
import { useEditorControls } from '@/context/EditorControlsContext'
import type { EditorFontSize } from '@/context/UserPreferencesContext'

const FONT_SIZE_STEPS: EditorFontSize[] = ['small', 'medium', 'large']

export default function BottomNav() {
  const { isFocused, toggle } = useFocusMode()
  const { isEditorActive, dictation, fontSize, onFontSizeChange } = useEditorControls()

  const isListening = dictation?.state === 'listening'
  const currentIndex = FONT_SIZE_STEPS.indexOf(fontSize)
  const nextSize = FONT_SIZE_STEPS[(currentIndex + 1) % FONT_SIZE_STEPS.length]

  function handleFontCycle() {
    onFontSizeChange?.(nextSize)
  }

  return (
    <nav
      className={clsx(
        'bg-surface/80 border-outline-variant/15 fixed bottom-0 left-0 z-40 flex w-full items-center justify-around border-t px-2 pt-2 pb-7 backdrop-blur-xl transition-all duration-500 md:hidden',
        isFocused && 'pointer-events-none translate-y-full opacity-0',
      )}
    >
      {/* Today */}
      <NavLink
        to="/"
        end
        className={({ isActive }) =>
          clsx(
            'flex flex-col items-center gap-1 rounded-xl px-3 py-2 transition-all duration-200',
            isActive ? 'text-primary' : 'text-on-surface-variant/60 hover:text-on-surface-variant',
          )
        }
      >
        {({ isActive }) => (
          <>
            <span
              className="material-symbols-outlined text-[22px] transition-all duration-200"
              style={isActive ? { fontVariationSettings: "'FILL' 1" } : {}}
            >
              edit_note
            </span>
            <span
              className={clsx('text-[9px] font-medium tracking-wide', isActive && 'font-semibold')}
            >
              Today
            </span>
          </>
        )}
      </NavLink>

      {/* Editor controls — only on editing pages */}
      {isEditorActive && (
        <>
          {/* Voice */}
          {dictation?.isSupported && (
            <button
              onClick={isListening ? dictation.onStop : dictation.onStart}
              aria-label={isListening ? 'Stop dictation' : 'Dictate'}
              className={clsx(
                'flex flex-col items-center gap-1 rounded-xl px-3 py-2 transition-all duration-200',
                isListening
                  ? 'text-primary'
                  : 'text-on-surface-variant/60 hover:text-on-surface-variant',
              )}
            >
              <span
                className={clsx(
                  'material-symbols-outlined text-[22px] transition-all duration-200',
                  isListening && 'animate-pulse',
                )}
              >
                {isListening ? 'mic_off' : 'mic'}
              </span>
              <span className="text-[9px] font-medium tracking-wide">Voice</span>
            </button>
          )}

          {/* Font size cycle */}
          {onFontSizeChange && (
            <button
              onClick={handleFontCycle}
              aria-label={`Text size: ${fontSize}. Tap to change`}
              className="text-on-surface-variant/60 hover:text-on-surface-variant flex flex-col items-center gap-1 rounded-xl px-3 py-2 transition-all duration-200"
            >
              <span className="text-[20px] leading-none font-bold">Aa</span>
              <span className="text-[9px] font-medium tracking-wide">Text</span>
            </button>
          )}
        </>
      )}

      {/* Focus toggle */}
      <button
        onClick={toggle}
        aria-label={isFocused ? 'Exit focus mode' : 'Enter focus mode'}
        className={clsx(
          'flex flex-col items-center gap-1 rounded-xl px-3 py-2 transition-all duration-200',
          isFocused ? 'text-primary' : 'text-on-surface-variant/60 hover:text-on-surface-variant',
        )}
      >
        <span className="material-symbols-outlined text-[22px]">
          {isFocused ? 'visibility' : 'visibility_off'}
        </span>
        <span className="text-[9px] font-medium tracking-wide">Focus</span>
      </button>
    </nav>
  )
}
