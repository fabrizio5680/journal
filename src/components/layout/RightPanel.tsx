import { useEffect, useState, type ReactNode } from 'react'
import clsx from 'clsx'

import DailyScripture from '@/components/ui/DailyScripture'
import MoodPicker from '@/components/mood/MoodPicker'
import ScriptureRefInput from '@/components/scripture/ScriptureRefInput'
import TagInput from '@/components/tags/TagInput'
import { useUserPreferences } from '@/context/UserPreferencesContext'
import { useEditorControls } from '@/context/EditorControlsContext'
import { useSaveStatus } from '@/context/SaveStatusContext'
import { useScriptureRef } from '@/hooks/useScriptureRef'
import { syncStatusIcon, syncStatusLabel } from '@/lib/storage/syncStatusLabel'
import type { EditorFontSize } from '@/context/UserPreferencesContext'
import type { ScriptureRef } from '@/types'

const FONT_SIZE_STEPS: EditorFontSize[] = ['small', 'medium', 'large']

function Section({
  label,
  count,
  collapsible,
  expanded,
  onToggle,
  children,
}: {
  label: string
  count?: number
  collapsible?: boolean
  expanded?: boolean
  onToggle?: () => void
  children: ReactNode
}) {
  return (
    <section className="border-outline-variant/15 border-t px-5 py-3">
      <header className="mb-3 flex items-center justify-between">
        <span className="text-on-surface-variant/50 text-[10.5px] font-semibold tracking-[0.14em] uppercase">
          {label}
        </span>
        <div className="flex items-center gap-2">
          {count !== undefined && (
            <span className="text-on-surface-variant/30 text-[10.5px] font-medium">{count}</span>
          )}
          {collapsible && onToggle && (
            <button
              type="button"
              onClick={onToggle}
              aria-label={expanded ? 'Collapse section' : 'Expand section'}
              className="text-on-surface-variant/40 hover:text-on-surface-variant flex p-0.5 transition-colors"
            >
              <span
                className={clsx(
                  'material-symbols-outlined text-[16px] transition-transform duration-200',
                  expanded && 'rotate-180',
                )}
              >
                expand_more
              </span>
            </button>
          )}
        </div>
      </header>
      {children}
    </section>
  )
}

function ScriptureExpandableCard({
  ref_,
  translation,
  onRemove,
}: {
  ref_: ScriptureRef
  translation: 'NLT' | 'MSG' | 'ESV'
  onRemove: () => void
}) {
  const [expanded, setExpanded] = useState(false)
  const { text, isLoading } = useScriptureRef(expanded ? ref_.passageId : null, translation)

  return (
    <div className="bg-surface-container-lowest border-outline-variant/15 overflow-hidden rounded-xl border">
      <div className="flex items-center gap-2 px-3 py-2">
        <span className="material-symbols-outlined text-primary text-[14px]">menu_book</span>
        <span className="text-on-surface flex-1 text-xs font-semibold">{ref_.reference}</span>
        <button
          type="button"
          onClick={() => setExpanded((e) => !e)}
          aria-label={expanded ? 'Hide verse' : 'Show verse'}
          className="text-on-surface-variant/40 hover:text-on-surface-variant flex p-1 transition-colors"
        >
          <span
            className={clsx(
              'material-symbols-outlined text-[14px] transition-transform duration-200',
              expanded && 'rotate-180',
            )}
          >
            expand_more
          </span>
        </button>
        <button
          type="button"
          onClick={onRemove}
          aria-label={`Remove ${ref_.reference}`}
          className="text-on-surface-variant/30 hover:text-on-surface-variant flex p-1 transition-colors"
        >
          <span className="material-symbols-outlined text-[12px]">close</span>
        </button>
      </div>
      {expanded && (
        <div className="border-outline-variant/10 border-t px-3 pt-2 pb-3">
          {isLoading ? (
            <p className="text-on-surface-variant/40 text-xs">Loading…</p>
          ) : (
            <p className="font-display text-on-surface-variant text-sm leading-relaxed italic">
              {text}
            </p>
          )}
        </div>
      )}
    </div>
  )
}

export default function RightPanel() {
  const [isOnline, setIsOnline] = useState(navigator.onLine)
  const [showScriptureInput, setShowScriptureInput] = useState(false)
  const { scriptureTranslation } = useUserPreferences()
  const {
    syncStatus: currentSyncStatus,
    storageProvider,
    storageAccountEmail,
    appAccountEmail,
    driveLoadProgress,
  } = useSaveStatus()
  const { isEditorActive, dictation, fontSize, onFontSizeChange, wordCount, metadata } =
    useEditorControls()

  const currentIndex = FONT_SIZE_STEPS.indexOf(fontSize)
  const nextSize = FONT_SIZE_STEPS[(currentIndex + 1) % FONT_SIZE_STEPS.length]

  const isListening = dictation?.state === 'listening'
  const hasError = dictation?.state === 'error'

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

  function handleMoodChange(newMood: number | null, label: string | null) {
    metadata?.onMoodChange(newMood, label)
  }

  function handleAddScriptureRef(ref: ScriptureRef) {
    if (!metadata) return
    metadata.onScriptureRefsChange([...metadata.scriptureRefs, ref])
    setShowScriptureInput(false)
  }

  function handleRemoveScriptureRef(passageId: string) {
    if (!metadata) return
    metadata.onScriptureRefsChange(metadata.scriptureRefs.filter((r) => r.passageId !== passageId))
  }

  const syncStatus = driveLoadProgress ? (
    driveLoadProgress.total === 0 ? (
      <div className="text-on-surface-variant/40 flex items-center gap-1.5 text-[10px]">
        <span className="material-symbols-outlined animate-spin text-[13px]">sync</span>
        <span>Listing entries…</span>
      </div>
    ) : (
      <div className="flex flex-col gap-1">
        <div className="text-on-surface-variant/40 flex items-center justify-between text-[10px]">
          <span>Indexing entries…</span>
          <span className="tabular-nums">
            {driveLoadProgress.loaded} / {driveLoadProgress.total}
          </span>
        </div>
        <div className="bg-outline-variant/20 h-0.5 w-full overflow-hidden rounded-full">
          <div
            className="bg-primary h-full rounded-full transition-all duration-300"
            style={{
              width: `${Math.round((driveLoadProgress.loaded / driveLoadProgress.total) * 100)}%`,
            }}
          />
        </div>
      </div>
    )
  ) : (
    <div className="text-on-surface-variant/40 flex items-center gap-1.5 text-[10px]">
      <span
        className={clsx(
          'material-symbols-outlined text-[13px]',
          isOnline && currentSyncStatus === 'synced' && 'text-primary',
        )}
      >
        {syncStatusIcon(currentSyncStatus, isOnline)}
      </span>
      <span>
        {isOnline
          ? syncStatusLabel({
              syncStatus: currentSyncStatus,
              storageProvider,
              storageAccountEmail,
              appAccountEmail,
            })
          : 'Offline — changes will sync'}
      </span>
    </div>
  )

  return (
    <aside className="bg-surface-container-low border-outline-variant/10 fixed top-0 right-0 z-30 hidden h-screen w-80 flex-col border-l md:flex">
      <div className="flex-1 overflow-y-auto">
        {/* Today's Word */}
        <div className="px-5 py-2">
          <DailyScripture translation={scriptureTranslation} />
        </div>

        {/* Metadata — visible when editor active */}
        {isEditorActive && metadata && (
          <>
            <Section label="Mood">
              <MoodPicker
                value={metadata.mood}
                label={metadata.moodLabel}
                onChange={handleMoodChange}
              />
            </Section>

            <Section
              label={metadata.scriptureRefs.length === 1 ? 'Scripture' : 'Scriptures'}
              count={metadata.scriptureRefs.length}
            >
              <div className="flex flex-col gap-2">
                {metadata.scriptureRefs.map((ref) => (
                  <ScriptureExpandableCard
                    key={ref.passageId}
                    ref_={ref}
                    translation={metadata.scriptureTranslation}
                    onRemove={() => handleRemoveScriptureRef(ref.passageId)}
                  />
                ))}
                {showScriptureInput ? (
                  <div className="bg-surface-container-lowest border-outline-variant/15 rounded-xl border px-3 py-2">
                    <ScriptureRefInput
                      translation={metadata.scriptureTranslation}
                      onAdd={handleAddScriptureRef}
                    />
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setShowScriptureInput(true)}
                    aria-label="Add scripture reference"
                    className="border-outline-variant/30 text-on-surface-variant/40 hover:border-primary/40 hover:text-primary flex w-full items-center gap-2 rounded-xl border border-dashed px-3 py-2.5 text-xs font-medium transition-colors"
                  >
                    <span className="material-symbols-outlined text-[13px]">add</span>
                    Add scripture
                  </button>
                )}
              </div>
            </Section>

            <Section label="Tags" count={metadata.tags.length}>
              <TagInput
                tags={metadata.tags}
                vocabulary={metadata.tagVocabulary}
                onChange={metadata.onTagsChange}
                onNewTag={metadata.onNewTag}
              />
            </Section>
          </>
        )}
      </div>

      {/* Footer */}
      <div className="border-outline-variant/15 bg-surface-container border-t px-5 py-3">
        {isEditorActive && (
          <>
            {hasError && dictation?.errorMessage && (
              <p className="text-error mb-2 text-xs">{dictation.errorMessage}</p>
            )}
            <div className="flex items-center gap-3">
              {dictation?.isSupported && (
                <button
                  onClick={isListening ? dictation.onStop : dictation.onStart}
                  aria-label={isListening ? 'Stop dictation' : 'Dictate'}
                  className={`bg-surface-container-lowest text-on-surface-variant border-outline-variant/20 flex h-10 w-10 items-center justify-center rounded-full border shadow-sm transition-all ${
                    isListening
                      ? 'ring-primary/50 text-primary animate-pulse ring-2 ring-offset-2'
                      : 'hover:text-primary hover:border-primary/20'
                  }`}
                >
                  <span className="material-symbols-outlined text-[18px]">
                    {isListening ? 'mic_off' : 'mic'}
                  </span>
                </button>
              )}

              {onFontSizeChange && (
                <button
                  onClick={() => onFontSizeChange(nextSize)}
                  aria-label={`Text size: ${fontSize}. Click to change`}
                  className={clsx(
                    'bg-surface-container-lowest border-outline-variant/20 flex h-10 items-center gap-1.5 rounded-full border px-4 shadow-sm transition-all',
                    fontSize !== 'medium'
                      ? 'text-primary'
                      : 'text-on-surface-variant/60 hover:text-primary hover:border-primary/20',
                  )}
                >
                  <span className="material-symbols-outlined text-[18px]">format_size</span>
                </button>
              )}

              <div className="flex flex-1 flex-col items-end gap-0.5">
                <span className="text-on-surface-variant/40 text-[11px] tabular-nums">
                  {wordCount} {wordCount === 1 ? 'word' : 'words'}
                </span>
                {syncStatus}
              </div>
            </div>
            {isListening && dictation?.interimTranscript && (
              <p className="text-on-surface-variant/50 mt-2 text-xs leading-snug italic">
                {dictation.interimTranscript}
              </p>
            )}
          </>
        )}
        {!isEditorActive && syncStatus}
      </div>
    </aside>
  )
}
