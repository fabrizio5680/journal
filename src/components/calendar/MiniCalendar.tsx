import { useState } from 'react'
import {
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  isSameMonth,
  isToday,
  format,
  addMonths,
  subMonths,
} from 'date-fns'
import clsx from 'clsx'

import MoodSummaryBar from '@/components/history/MoodSummaryBar'
import type { Entry } from '@/types'

interface MiniCalendarProps {
  selectedDate?: string
  onDateSelect: (date: string) => void
  onMonthChange?: (year: number, month: number) => void
  entryDates?: Set<string>
  entries?: Entry[]
}

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

export default function MiniCalendar({
  selectedDate,
  onDateSelect,
  onMonthChange,
  entryDates = new Set(),
  entries = [],
}: MiniCalendarProps) {
  const [currentDate, setCurrentDate] = useState(() => new Date())

  const monthStart = startOfMonth(currentDate)
  const monthEnd = endOfMonth(currentDate)
  const gridStart = startOfWeek(monthStart)
  const gridEnd = endOfWeek(monthEnd)
  const days = eachDayOfInterval({ start: gridStart, end: gridEnd })

  const navigatePrev = () => {
    const prev = subMonths(currentDate, 1)
    setCurrentDate(prev)
    onMonthChange?.(prev.getFullYear(), prev.getMonth() + 1)
  }

  const navigateNext = () => {
    const next = addMonths(currentDate, 1)
    setCurrentDate(next)
    onMonthChange?.(next.getFullYear(), next.getMonth() + 1)
  }

  return (
    <div className="bg-surface-container-low rounded-[2rem] p-8">
      {/* Header row */}
      <div className="mb-4 flex items-center justify-between">
        <button
          onClick={navigatePrev}
          aria-label="Previous month"
          className="hover:bg-surface-container flex h-8 w-8 items-center justify-center rounded-full transition-colors"
        >
          <span className="material-symbols-outlined text-on-surface-variant text-[20px]">
            chevron_left
          </span>
        </button>

        <span className="text-on-surface text-base font-bold">
          {format(currentDate, 'MMMM yyyy')}
        </span>

        <button
          onClick={navigateNext}
          aria-label="Next month"
          className="hover:bg-surface-container flex h-8 w-8 items-center justify-center rounded-full transition-colors"
        >
          <span className="material-symbols-outlined text-on-surface-variant text-[20px]">
            chevron_right
          </span>
        </button>
      </div>

      {/* Day labels row */}
      <div className="mb-1 grid grid-cols-7 gap-1">
        {DAY_LABELS.map((day) => (
          <div
            key={day}
            className="text-on-surface-variant flex items-center justify-center text-[10px] uppercase tracking-widest"
          >
            {day}
          </div>
        ))}
      </div>

      {/* Date grid */}
      <div className="grid grid-cols-7 gap-1">
        {days.map((day) => {
          const dateStr = format(day, 'yyyy-MM-dd')
          const inMonth = isSameMonth(day, currentDate)
          const today = isToday(day)
          const hasEntry = entryDates.has(dateStr)
          const isSelected = selectedDate === dateStr

          return (
            <button
              key={dateStr}
              onClick={() => inMonth && onDateSelect(dateStr)}
              disabled={!inMonth}
              aria-label={format(day, 'MMMM d, yyyy')}
              aria-pressed={isSelected}
              className={clsx(
                'flex h-9 w-9 flex-col items-center justify-center rounded-full text-sm transition-colors',
                !inMonth && 'text-on-surface-variant cursor-default opacity-30',
                inMonth && !today && !isSelected && 'hover:bg-primary-container/20 cursor-pointer',
                today && !isSelected && 'bg-primary-container text-primary font-bold',
                isSelected && 'bg-primary text-on-primary font-bold',
                hasEntry && !today && !isSelected && 'text-on-surface font-medium',
              )}
            >
              <span>{format(day, 'd')}</span>
              {hasEntry && inMonth && (
                <span className="bg-primary mx-auto mt-0.5 h-1 w-1 rounded-full" />
              )}
            </button>
          )
        })}
      </div>

      {/* Footer: mood summary */}
      <MoodSummaryBar entries={entries} />
    </div>
  )
}
