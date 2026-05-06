import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
  type TouchEvent,
  type MouseEvent,
} from 'react'
import ReactDOM from 'react-dom'

import { MOODS } from '@/lib/moods'
import TagInput from '@/components/tags/TagInput'
import ScriptureRefInput from '@/components/scripture/ScriptureRefInput'
import type { ScriptureRef } from '@/types'

interface MetadataSheetProps {
  open: boolean
  onClose: () => void
  initialSection?: 'mood' | 'scripture' | 'tags'
  mood: 1 | 2 | 3 | 4 | 5 | null
  moodLabel: string | null
  tags: string[]
  tagVocabulary: string[]
  onMoodChange: (mood: number | null, label: string | null) => void
  onTagsChange: (tags: string[]) => void
  onNewTag: (tag: string) => void
  scriptureRefs: ScriptureRef[]
  scriptureTranslation: 'NLT' | 'MSG' | 'ESV'
  onScriptureRefsChange: (refs: ScriptureRef[]) => void
}

interface SheetSectionProps {
  label: string
  count?: number
  children: ReactNode
}

function SheetSection({ label, count, children }: SheetSectionProps) {
  return (
    <div className="px-5 py-4">
      <div className="mb-3 flex items-center gap-2">
        <span className="text-on-surface-variant/60 text-[11px] font-semibold tracking-widest uppercase">
          {label}
        </span>
        {count !== undefined && count > 0 && (
          <span className="bg-secondary-container text-on-secondary-container rounded-full px-2 py-0.5 text-[10px] font-semibold">
            {count}
          </span>
        )}
      </div>
      {children}
    </div>
  )
}

export default function MetadataSheet({
  open,
  onClose,
  initialSection,
  mood,
  moodLabel,
  tags,
  tagVocabulary,
  onMoodChange,
  onTagsChange,
  onNewTag,
  scriptureRefs,
  scriptureTranslation,
  onScriptureRefsChange,
}: MetadataSheetProps) {
  const [showScriptureInput, setShowScriptureInput] = useState(false)
  const [dragY, setDragY] = useState(0)
  const [isDragging, setIsDragging] = useState(false)
  const dragStartY = useRef(0)
  const sheetRef = useRef<HTMLDivElement>(null)
  const moodSectionRef = useRef<HTMLDivElement>(null)
  const scriptureSectionRef = useRef<HTMLDivElement>(null)
  const tagsSectionRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) {
      const timer = setTimeout(() => {
        setShowScriptureInput(false)
      }, 300)
      return () => clearTimeout(timer)
    }
    return undefined
  }, [open])

  useEffect(() => {
    if (open && initialSection) {
      const timer = setTimeout(() => {
        const refMap = {
          mood: moodSectionRef,
          scripture: scriptureSectionRef,
          tags: tagsSectionRef,
        }
        refMap[initialSection].current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }, 350)
      return () => clearTimeout(timer)
    }
    return undefined
  }, [open, initialSection])

  function handleTouchStart(e: TouchEvent) {
    dragStartY.current = e.touches[0].clientY
    setIsDragging(true)
  }

  function handleTouchMove(e: TouchEvent) {
    if (!isDragging) return
    const delta = e.touches[0].clientY - dragStartY.current
    if (delta > 0) setDragY(delta)
  }

  function handleTouchEnd() {
    setIsDragging(false)
    if (dragY > 80) {
      setDragY(0)
      onClose()
    } else {
      setDragY(0)
    }
  }

  function handleMouseDown(e: MouseEvent) {
    dragStartY.current = e.clientY
    setIsDragging(true)
  }

  function handleMouseMove(e: MouseEvent) {
    if (!isDragging) return
    const delta = e.clientY - dragStartY.current
    if (delta > 0) setDragY(delta)
  }

  function handleMouseUp() {
    setIsDragging(false)
    if (dragY > 80) {
      setDragY(0)
      onClose()
    } else {
      setDragY(0)
    }
  }

  function handleAddScripture(ref: ScriptureRef) {
    onScriptureRefsChange([...scriptureRefs, ref])
    setShowScriptureInput(false)
  }

  function handleRemoveScripture(passageId: string) {
    onScriptureRefsChange(scriptureRefs.filter((r) => r.passageId !== passageId))
  }

  function handleMoodClick(moodValue: number, label: string) {
    const isSelected = moodLabel !== null ? moodLabel === label : mood === moodValue
    onMoodChange(isSelected ? null : moodValue, isSelected ? null : label)
  }

  const sheetStyle: CSSProperties = {
    transform: open ? `translateY(${dragY}px)` : 'translateY(100%)',
    transition: isDragging ? 'none' : 'transform 300ms cubic-bezier(0.32,0.72,0,1)',
  }

  return ReactDOM.createPortal(
    <>
      <div
        className="fixed inset-0 z-40 bg-black/30"
        style={{
          opacity: open ? 1 : 0,
          transition: 'opacity 300ms ease',
          pointerEvents: open ? 'auto' : 'none',
        }}
        onClick={onClose}
      />
      <div
        ref={sheetRef}
        className="bg-surface fixed right-0 bottom-0 left-0 z-50 max-h-[85vh] rounded-t-3xl"
        style={sheetStyle}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      >
        <div
          className="cursor-grab px-5 pt-3 pb-1 active:cursor-grabbing"
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          onMouseDown={handleMouseDown}
        >
          <div className="bg-outline-variant mx-auto h-1 w-9 rounded-full" />
        </div>

        <div className="flex items-center justify-between px-5 py-3">
          <span className="font-display text-primary text-xl font-semibold">Entry details</span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="text-on-surface-variant hover:text-on-surface transition-colors"
          >
            <span className="material-symbols-outlined text-[20px]">close</span>
          </button>
        </div>

        <div className="overflow-y-auto" style={{ maxHeight: 'calc(85vh - 80px)' }}>
          <div ref={moodSectionRef}>
            <SheetSection label="Mood">
              <div className="grid grid-cols-4 gap-2">
                {MOODS.map((m) => {
                  const isSelected = moodLabel !== null ? m.label === moodLabel : mood === m.value
                  return (
                    <button
                      key={m.label}
                      type="button"
                      onClick={() => handleMoodClick(m.value, m.label)}
                      className={
                        isSelected
                          ? 'border-primary/50 bg-surface flex flex-col items-center gap-1 rounded-xl border px-2 py-3'
                          : 'bg-surface-container flex flex-col items-center gap-1 rounded-xl px-2 py-3'
                      }
                    >
                      <span className="text-2xl">{m.emoji}</span>
                      <span className="text-on-surface-variant text-[10.5px] leading-tight font-medium">
                        {m.label}
                      </span>
                    </button>
                  )
                })}
              </div>
            </SheetSection>
          </div>

          <div className="bg-outline-variant/10 mx-5 h-px" />

          <div ref={scriptureSectionRef}>
            <SheetSection label="Scripture" count={scriptureRefs.length}>
              <div className="flex flex-col gap-2">
                {scriptureRefs.map((ref) => (
                  <div
                    key={ref.passageId}
                    className="bg-surface-container flex items-center gap-3 rounded-xl p-3"
                  >
                    <span className="material-symbols-outlined text-on-surface-variant text-[18px]">
                      menu_book
                    </span>
                    <span className="text-on-surface flex-1 text-sm font-semibold">
                      {ref.reference}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleRemoveScripture(ref.passageId)}
                      aria-label={`Remove ${ref.reference}`}
                      className="text-on-surface-variant hover:text-on-surface transition-colors"
                    >
                      <span className="material-symbols-outlined text-[16px]">close</span>
                    </button>
                  </div>
                ))}

                {showScriptureInput ? (
                  <div className="bg-surface-container rounded-xl px-3">
                    <ScriptureRefInput
                      translation={scriptureTranslation}
                      onAdd={handleAddScripture}
                    />
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setShowScriptureInput(true)}
                    className="border-outline-variant/40 text-on-surface-variant hover:bg-surface-container flex w-full items-center justify-center gap-2 rounded-xl border border-dashed px-3 py-3 text-xs font-medium transition-colors"
                  >
                    <span className="material-symbols-outlined text-[16px]">add</span>
                    Add scripture
                  </button>
                )}
              </div>
            </SheetSection>
          </div>

          <div className="bg-outline-variant/10 mx-5 h-px" />

          <div ref={tagsSectionRef}>
            <SheetSection label="Tags" count={tags.length}>
              <TagInput
                tags={tags}
                vocabulary={tagVocabulary}
                onChange={onTagsChange}
                onNewTag={onNewTag}
              />
            </SheetSection>
          </div>
        </div>
      </div>
    </>,
    document.body,
  )
}
