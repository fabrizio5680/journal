import { useState, useEffect } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { onAuthStateChanged } from 'firebase/auth'
import { endOfMonth, format, parseISO } from 'date-fns'

import { auth } from '@/lib/firebase'
import { EntryRepository } from '@/lib/storage/entryRepository'
import { usePageTitle } from '@/hooks/usePageTitle'
import { useEntryDates } from '@/hooks/useEntryDates'
import { useToday } from '@/hooks/useToday'
import MiniCalendar, { MiniCalendarSkeleton } from '@/components/calendar/MiniCalendar'
import EntryListCard, { EntryListCardSkeleton } from '@/components/history/EntryListCard'
import type { Entry } from '@/types'

export default function HistoryPage() {
  usePageTitle('Past Chapters')
  const navigate = useNavigate()
  const today = useToday()
  const now = parseISO(today)

  const [uid, setUid] = useState<string | null>(null)
  const [entriesLoading, setEntriesLoading] = useState(true)
  const [selectedMonth, setSelectedMonth] = useState({
    year: now.getFullYear(),
    month: now.getMonth() + 1,
  })
  const [selectedDate, setSelectedDate] = useState<string | undefined>()
  const [entries, setEntries] = useState<Entry[]>([])

  useEffect(() => {
    return onAuthStateChanged(auth, (user) => {
      setUid(user?.uid ?? null)
    })
  }, [])

  const entryDates = useEntryDates(uid ?? '', selectedMonth.year, selectedMonth.month)

  useEffect(() => {
    if (!uid) return

    const activeUid = uid
    let cancelled = false
    const monthStr = String(selectedMonth.month).padStart(2, '0')
    const startDate = `${selectedMonth.year}-${monthStr}-01`
    const endDate = format(
      endOfMonth(new Date(selectedMonth.year, selectedMonth.month - 1)),
      'yyyy-MM-dd',
    )

    async function loadEntries() {
      try {
        const list = await EntryRepository.listEntries(activeUid, { from: startDate, to: endDate })
        if (cancelled) return
        setEntries(list)
        setEntriesLoading(false)
      } catch {
        if (cancelled) return
        setEntries([])
        setEntriesLoading(false)
      }
    }

    void loadEntries()
    const unsubscribe = EntryRepository.subscribe(activeUid, () => void loadEntries())

    return () => {
      cancelled = true
      unsubscribe()
    }
  }, [uid, selectedMonth.year, selectedMonth.month])

  const handleDateSelect = (date: string) => {
    setSelectedDate(date)
    navigate(`/entry/${date}`)
  }

  const handleMonthChange = (year: number, month: number) => {
    setSelectedMonth({ year, month })
    setSelectedDate(undefined)
    setEntriesLoading(true)
  }

  return (
    <div className="mx-auto max-w-6xl px-6 pt-8 md:pt-16">
      {/* Header */}
      <div className="mb-12 flex items-end justify-between">
        <div>
          <p className="text-on-surface-variant/50 mb-2 text-[10px] tracking-[0.25em] uppercase">
            {format(now, 'yyyy')}
          </p>
          <h1 className="font-display text-on-surface text-[3.5rem] leading-none font-light tracking-tight">
            Past Chapters
          </h1>
        </div>
        <Link
          to="/insights"
          className="text-on-surface-variant/60 hover:text-primary mb-2 flex items-center gap-1 text-xs font-medium tracking-wide transition-colors"
        >
          Insights
          <span className="material-symbols-outlined text-[14px]">arrow_forward</span>
        </Link>
      </div>

      {/* Bento grid */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Left: calendar */}
        <div className="lg:col-span-5">
          {entriesLoading && !entryDates.size ? (
            <MiniCalendarSkeleton />
          ) : (
            <MiniCalendar
              currentYear={selectedMonth.year}
              currentMonth={selectedMonth.month}
              selectedDate={selectedDate}
              onDateSelect={handleDateSelect}
              onMonthChange={handleMonthChange}
              entryDates={entryDates}
              entries={entries}
            />
          )}
        </div>

        {/* Right: entry cards */}
        <div className="lg:col-span-7">
          {entriesLoading ? (
            <div className="flex flex-col gap-4">
              {[0, 1, 2].map((i) => (
                <EntryListCardSkeleton key={i} />
              ))}
            </div>
          ) : entries.length === 0 ? (
            <div className="flex flex-col items-center gap-4 py-24 text-center">
              <span className="material-symbols-outlined text-on-surface-variant/20 text-[56px]">
                auto_stories
              </span>
              <p className="font-display text-on-surface-variant text-2xl font-light italic">
                Your story begins here.
              </p>
              <p className="text-on-surface-variant/60 max-w-xs text-sm leading-relaxed">
                No entries for this month. Start writing to fill this space.
              </p>
            </div>
          ) : (
            <>
              <p className="text-on-surface-variant/50 mb-4 text-[10px] font-semibold tracking-[0.2em] uppercase">
                {entries.length} {entries.length === 1 ? 'entry' : 'entries'}
              </p>
              <div className="flex flex-col gap-4">
                {entries.map((entry) => (
                  <EntryListCard key={entry.date} entry={entry} />
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
