import { useEffect, useRef, useState } from 'react'
import clsx from 'clsx'

import { MOODS } from '@/lib/moods'

interface MoodPickerProps {
  value: number | null
  label: string | null
  onChange: (mood: number | null, label: string | null) => void
  variant?: 'pills' | 'dropdown'
  disabled?: boolean
}

// Group moods into pairs by numeric value: [[val1a, val1b], [val2a, val2b], ...]
const MOOD_PAIRS = MOODS.reduce<(typeof MOODS)[number][][]>((acc, mood) => {
  const existing = acc.find((pair) => pair[0].value === mood.value)
  if (existing) {
    existing.push(mood)
  } else {
    acc.push([mood])
  }
  return acc
}, [])

function isMoodSelected(
  mood: (typeof MOODS)[number],
  value: number | null,
  label: string | null,
): boolean {
  return label !== null ? mood.label === label : value === mood.value
}

function PillsMoodPicker({
  value,
  label,
  onChange,
  disabled = false,
}: {
  value: number | null
  label: string | null
  onChange: (mood: number | null, label: string | null) => void
  disabled?: boolean
}) {
  return (
    <div className="flex flex-nowrap gap-2 overflow-x-auto py-2 pb-1">
      {MOOD_PAIRS.map((pair) =>
        pair.map((mood) => {
          const isSelected = isMoodSelected(mood, value, label)
          return (
            <button
              key={mood.label}
              type="button"
              onClick={() =>
                onChange(isSelected ? null : mood.value, isSelected ? null : mood.label)
              }
              disabled={disabled}
              className={
                isSelected
                  ? 'border-primary/20 bg-primary-container text-on-primary-container shrink-0 rounded-xl border px-4 py-2 text-sm font-semibold disabled:opacity-45'
                  : 'bg-secondary-container text-on-secondary-container hover:bg-secondary-fixed shrink-0 rounded-xl px-4 py-2 text-sm transition-colors disabled:opacity-45'
              }
            >
              {mood.emoji} {mood.label}
            </button>
          )
        }),
      )}
    </div>
  )
}

function DropdownMoodPicker({
  value,
  label,
  onChange,
  disabled = false,
}: {
  value: number | null
  label: string | null
  onChange: (mood: number | null, label: string | null) => void
  disabled?: boolean
}) {
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  const selectedMood = MOODS.find((mood) => isMoodSelected(mood, value, label)) ?? null

  // Close on outside click
  useEffect(() => {
    if (!open) return
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [open])

  // Close on Escape
  useEffect(() => {
    if (!open) return
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setOpen(false)
      }
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [open])

  function handleSelect(mood: (typeof MOODS)[number] | null) {
    if (mood === null) {
      onChange(null, null)
    } else {
      const isSelected = isMoodSelected(mood, value, label)
      onChange(isSelected ? null : mood.value, isSelected ? null : mood.label)
    }
    setOpen(false)
  }

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        disabled={disabled}
        className="border-outline-variant/15 bg-surface-container-lowest flex w-full items-center justify-between rounded-xl border px-3 py-2 text-sm transition-colors disabled:opacity-45"
      >
        {selectedMood ? (
          <span className="text-on-surface font-medium">
            {selectedMood.emoji} {selectedMood.label}
          </span>
        ) : (
          <span className="text-on-surface-variant/40">How are you feeling?</span>
        )}
        <span
          className={clsx(
            'material-symbols-outlined text-on-surface-variant/40 text-[18px] transition-transform duration-200',
            open && 'rotate-180',
          )}
        >
          expand_more
        </span>
      </button>

      {open && (
        <ul
          role="listbox"
          className="bg-surface-container-low border-outline-variant/15 absolute top-full left-0 z-50 mt-1 w-full overflow-y-auto rounded-xl border shadow-lg"
          style={{ maxHeight: '260px' }}
        >
          {/* None option */}
          <li
            role="option"
            aria-selected={value === null && label === null}
            onClick={() => handleSelect(null)}
            className={clsx(
              'cursor-pointer px-3 py-2 text-sm transition-colors',
              value === null && label === null
                ? 'bg-primary-container text-on-primary-container font-semibold'
                : 'text-on-surface-variant/40 hover:bg-surface-container',
            )}
          >
            — No mood
          </li>

          {MOODS.map((mood) => {
            const isSelected = isMoodSelected(mood, value, label)
            return (
              <li
                key={mood.label}
                role="option"
                aria-selected={isSelected}
                onClick={() => handleSelect(mood)}
                className={clsx(
                  'cursor-pointer px-3 py-2 text-sm transition-colors',
                  isSelected
                    ? 'bg-primary-container text-on-primary-container font-semibold'
                    : 'text-on-surface hover:bg-surface-container',
                )}
              >
                {mood.emoji} {mood.label}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

export default function MoodPicker({
  value,
  label,
  onChange,
  variant = 'pills',
  disabled = false,
}: MoodPickerProps) {
  if (variant === 'dropdown') {
    return (
      <DropdownMoodPicker value={value} label={label} onChange={onChange} disabled={disabled} />
    )
  }
  return <PillsMoodPicker value={value} label={label} onChange={onChange} disabled={disabled} />
}
