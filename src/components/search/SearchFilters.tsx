import { useRefinementList } from 'react-instantsearch'
import clsx from 'clsx'

import { MOODS } from '@/lib/moods'

// --- Tag filter ---
function TagFilter() {
  const { items, refine } = useRefinementList({ attribute: 'tags', limit: 20 })
  if (items.length === 0) return null

  return (
    <>
      {items.map((item) => (
        <button
          key={item.value}
          onClick={() => refine(item.value)}
          className={clsx(
            'rounded-xl px-3 py-1.5 text-xs font-medium transition-colors',
            item.isRefined
              ? 'bg-primary text-on-primary'
              : 'bg-secondary-container text-on-secondary-container hover:opacity-80',
          )}
        >
          #{item.label}
          {item.count > 0 && <span className="ml-1 opacity-60">({item.count})</span>}
        </button>
      ))}
    </>
  )
}

interface MoodFilterProps {
  selectedMoods: number[]
  onToggleMood: (value: number) => void
}

function MoodFilter({ selectedMoods, onToggleMood }: MoodFilterProps) {
  const refinedValues = new Set(selectedMoods)

  return (
    <>
      {MOODS.map((m) => (
        <button
          key={m.value}
          onClick={() => onToggleMood(m.value)}
          aria-label={m.label}
          className={clsx(
            'flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-medium transition-colors',
            refinedValues.has(m.value)
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

// --- Date range filter ---
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
      <span>–</span>
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

// --- Numeric range connector for dateTimestamp ---
// react-instantsearch's useRange hook can be used; we wire it through useNumericMenu
// as a simpler alternative using static items for the date range display.
// We expose the raw date state to the parent and apply the filter via configure.

interface SearchFiltersProps {
  dateFrom: string
  dateTo: string
  onDateChange: (from: string, to: string) => void
  selectedMoods: number[]
  onToggleMood: (value: number) => void
}

export default function SearchFilters({
  dateFrom,
  dateTo,
  onDateChange,
  selectedMoods,
  onToggleMood,
}: SearchFiltersProps) {
  // useNumericMenu is only used to check if the attribute is indexable;
  // actual range is applied via <Configure numericFilters={...} /> in the modal.
  // We render tag + mood refinements + date inputs.
  return (
    <div className="border-outline-variant/10 flex flex-wrap items-center gap-2 border-b px-6 py-3">
      <TagFilter />
      <MoodFilter selectedMoods={selectedMoods} onToggleMood={onToggleMood} />
      <DateRangeFilter from={dateFrom} to={dateTo} onChange={onDateChange} />
    </div>
  )
}
