import clsx from 'clsx'

import { MOODS } from '@/lib/moods'

interface MoodFilterProps {
  selectedMoods: string[]
  onToggleMood: (label: string) => void
}

function MoodFilter({ selectedMoods, onToggleMood }: MoodFilterProps) {
  const refinedLabels = new Set(selectedMoods)

  return (
    <>
      {MOODS.map((m) => (
        <button
          key={m.label}
          onClick={() => onToggleMood(m.label)}
          aria-label={m.label}
          className={clsx(
            'flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-medium transition-colors',
            refinedLabels.has(m.label)
              ? 'bg-primary text-on-primary'
              : 'bg-secondary-container text-on-secondary-container hover:opacity-80',
          )}
        >
          <span>{m.emoji}</span>
          <span>{m.label}</span>
        </button>
      ))}
    </>
  )
}

interface DateRangeFilterProps {
  from: string
  to: string
  onChange: (from: string, to: string) => void
}

function DateRangeFilter({ from, to, onChange }: DateRangeFilterProps) {
  return (
    <div className="text-on-surface-variant flex items-center gap-2 text-xs">
      <span className="material-symbols-outlined text-sm">date_range</span>
      <input
        type="date"
        value={from}
        max={to || undefined}
        onChange={(e) => onChange(e.target.value, to)}
        className="bg-secondary-container text-on-secondary-container rounded-xl px-2 py-1.5 text-xs outline-none"
        aria-label="From date"
      />
      <span>-</span>
      <input
        type="date"
        value={to}
        min={from || undefined}
        onChange={(e) => onChange(from, e.target.value)}
        className="bg-secondary-container text-on-secondary-container rounded-xl px-2 py-1.5 text-xs outline-none"
        aria-label="To date"
      />
    </div>
  )
}

interface TagFilterProps {
  availableTags: string[]
  selectedTags: string[]
  onToggleTag: (tag: string) => void
}

function TagFilter({ availableTags, selectedTags, onToggleTag }: TagFilterProps) {
  if (availableTags.length === 0) return null
  const selected = new Set(selectedTags)

  return (
    <div className="flex flex-nowrap gap-1.5 overflow-x-auto">
      {availableTags.map((tag) => (
        <button
          key={tag}
          onClick={() => onToggleTag(tag)}
          aria-label={`Filter by #${tag}`}
          className={clsx(
            'flex-shrink-0 rounded-xl px-3 py-1.5 text-xs font-medium transition-colors',
            selected.has(tag)
              ? 'bg-primary text-on-primary'
              : 'bg-secondary-container text-on-secondary-container hover:opacity-80',
          )}
        >
          #{tag}
        </button>
      ))}
    </div>
  )
}

interface SearchFiltersProps {
  dateFrom: string
  dateTo: string
  onDateChange: (from: string, to: string) => void
  selectedMoods: string[]
  onToggleMood: (label: string) => void
  availableTags: string[]
  selectedTags: string[]
  onToggleTag: (tag: string) => void
}

export default function SearchFilters({
  dateFrom,
  dateTo,
  onDateChange,
  selectedMoods,
  onToggleMood,
  availableTags,
  selectedTags,
  onToggleTag,
}: SearchFiltersProps) {
  return (
    <div className="border-outline-variant/10 flex flex-col gap-2 border-b px-6 py-3">
      <div className="flex flex-wrap items-center gap-2">
        <MoodFilter selectedMoods={selectedMoods} onToggleMood={onToggleMood} />
        <DateRangeFilter from={dateFrom} to={dateTo} onChange={onDateChange} />
      </div>
      <TagFilter
        availableTags={availableTags}
        selectedTags={selectedTags}
        onToggleTag={onToggleTag}
      />
    </div>
  )
}
