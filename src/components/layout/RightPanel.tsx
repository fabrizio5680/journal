import { useEffect, useState } from 'react'
import clsx from 'clsx'

import DailyScripture from '@/components/ui/DailyScripture'
import { useFocusMode } from '@/context/FocusModeContext'
import { useUserPreferences } from '@/context/UserPreferencesContext'
import { useEditorControls } from '@/context/EditorControlsContext'
import type { EditorFontSize } from '@/context/UserPreferencesContext'

const FONT_SIZE_STEPS: EditorFontSize[] = ['small', 'medium', 'large']

export default function RightPanel() {
  const [isOnline, setIsOnline] = useState(navigator.onLine)
  const { isFocused } = useFocusMode()
  const { scriptureTranslation } = useUserPreferences()
  const { isEditorActive, dictation, fontSize, onFontSizeChange, wordCount } = useEditorControls()

  const currentIndex = FONT_SIZE_STEPS.indexOf(fontSize)
  const nextSize = FONT_SIZE_STEPS[(currentIndex + 1) % FONT_SIZE_STEPS.length]

  const isListening = dictation?.state === 'listening'
  const hasError = dictation?.state === 'error'

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

  return (
    <aside
      className={clsx(
        'bg-surface border-outline-variant/10 fixed top-0 right-0 z-30 hidden h-screen w-80 flex-col gap-6 border-l px-6 py-8 transition-all duration-500 xl:flex',
        isFocused && 'xl:pointer-events-none xl:translate-x-full xl:opacity-0',
      )}
    >
      <DailyScripture translation={scriptureTranslation} />

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
                className="bg-surface-container-lowest text-on-surface-variant border-outline-variant/20 hover:text-primary hover:border-primary/20 flex h-10 items-center gap-1.5 rounded-full border px-4 shadow-md transition-all"
              >
                <span className="text-[13px] leading-none font-bold">Aa</span>
                <span className="text-[10px] capitalize">{fontSize}</span>
              </button>
            )}

            {/* Word count */}
            <span className="text-on-surface-variant/50 min-w-[4rem] text-center text-[11px] tracking-wide">
              {wordCount} {wordCount === 1 ? 'word' : 'words'}
            </span>
          </div>
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
