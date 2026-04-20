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

const DAY_LABELS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']

export function MiniCalendarSkeleton() {
  return (
    <div className="bg-surface-container-lowest animate-pulse rounded-[2rem] p-7">
      <div className="mb-5 flex items-center justify-between">
        <div className="bg-surface-container h-8 w-8 rounded-full" />
        <div className="bg-surface-container h-4 w-28 rounded-lg" />
        <div className="bg-surface-container h-8 w-8 rounded-full" />
      </div>
      <div className="mb-2 grid grid-cols-7 gap-1">
        {DAY_LABELS.map((d) => (
          <div key={d} className="bg-surface-container mx-auto h-2.5 w-5 rounded" />
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {Array.from({ length: 35 }).map((_, i) => (
          <div key={i} className="bg-surface-container mx-auto h-9 w-9 rounded-full" />
        ))}
      </div>
    </div>
  )
}

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
    <div className="bg-surface-container-lowest rounded-[2rem] p-7">
      {/* Month / year header */}
      <div className="mb-5 flex items-center justify-between">
        <button
          onClick={navigatePrev}
          aria-label="Previous month"
          className="hover:bg-surface-container text-on-surface-variant flex h-8 w-8 items-center justify-center rounded-full transition-colors"
        >
          <span className="material-symbols-outlined text-[20px]">chevron_left</span>
        </button>

        <div className="text-center">
          <span className="font-display text-on-surface text-xl font-semibold">
            {format(currentDate, 'MMMM')}
          </span>
          <span className="text-on-surface-variant/60 ml-2 text-sm">
            {format(currentDate, 'yyyy')}
          </span>
        </div>

        <button
          onClick={navigateNext}
          aria-label="Next month"
          className="hover:bg-surface-container text-on-surface-variant flex h-8 w-8 items-center justify-center rounded-full transition-colors"
        >
          <span className="material-symbols-outlined text-[20px]">chevron_right</span>
        </button>
      </div>

      {/* Day labels */}
      <div className="mb-1 grid grid-cols-7 gap-1">
        {DAY_LABELS.map((day) => (
          <div
            key={day}
            className="text-on-surface-variant/40 flex items-center justify-center py-1 text-[10px] font-semibold tracking-widest uppercase"
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
                'relative mx-auto flex h-9 w-9 flex-col items-center justify-center rounded-full text-sm transition-all duration-200',
                !inMonth && 'cursor-default opacity-20',
                inMonth &&
                  !today &&
                  !isSelected &&
                  'hover:bg-primary-container/30 text-on-surface cursor-pointer',
                today && !isSelected && 'bg-primary-container/50 text-primary font-semibold',
                isSelected && 'bg-primary text-on-primary font-semibold shadow-sm',
              )}
            >
              <span className="leading-none">{format(day, 'd')}</span>
              {hasEntry && inMonth && (
                <span
                  className={clsx(
                    'absolute bottom-1 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full',
                    isSelected ? 'bg-on-primary/60' : 'bg-primary/50',
                  )}
                />
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
