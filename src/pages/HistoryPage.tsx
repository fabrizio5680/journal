import { useState, useEffect } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { onAuthStateChanged } from 'firebase/auth'
import { collection, query, where, onSnapshot } from 'firebase/firestore'

import { auth, db } from '@/lib/firebase'
import { useEntryDates } from '@/hooks/useEntryDates'
import MiniCalendar from '@/components/calendar/MiniCalendar'
import EntryListCard from '@/components/history/EntryListCard'
import type { Entry } from '@/types'

export default function HistoryPage() {
  const navigate = useNavigate()
  const now = new Date()

  const [uid, setUid] = useState<string | null>(null)
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

  // Query full entries for the selected month
  useEffect(() => {
    if (!uid) return

    const monthStr = String(selectedMonth.month).padStart(2, '0')
    const startDate = `${selectedMonth.year}-${monthStr}-01`
    const endDate = `${selectedMonth.year}-${monthStr}-31`

    const q = query(
      collection(db, 'users', uid, 'entries'),
      where('deleted', '==', false),
      where('date', '>=', startDate),
      where('date', '<=', endDate),
    )

    return onSnapshot(q, (snap) => {
      const list: Entry[] = []
      snap.forEach((doc) => list.push(doc.data() as Entry))
      list.sort((a, b) => b.date.localeCompare(a.date))
      setEntries(list)
    })
  }, [uid, selectedMonth.year, selectedMonth.month])

  const handleDateSelect = (date: string) => {
    setSelectedDate(date)
    navigate(`/entry/${date}`)
  }

  const handleMonthChange = (year: number, month: number) => {
    setSelectedMonth({ year, month })
    setSelectedDate(undefined)
  }

  return (
    <div className="mx-auto max-w-6xl px-6 pt-8 md:pt-16">
      {/* Header */}
      <div className="mb-16 flex items-start justify-between">
        <div>
          <h1 className="text-on-surface text-[3.5rem] leading-tight font-bold tracking-tight">
            Past Chapters
          </h1>
          <p className="text-on-surface-variant mt-3 max-w-xl text-lg leading-relaxed">
            A quiet walk through what you've written — your story, month by month.
          </p>
        </div>
        <Link
          to="/insights"
          className="text-primary mt-4 flex items-center gap-1 text-sm font-medium hover:underline"
        >
          Insights
          <span className="material-symbols-outlined text-[16px]">arrow_forward</span>
        </Link>
      </div>

      {/* Bento grid */}
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-12">
        {/* Left: calendar */}
        <div className="lg:col-span-5">
          <MiniCalendar
            selectedDate={selectedDate}
            onDateSelect={handleDateSelect}
            onMonthChange={handleMonthChange}
            entryDates={entryDates}
            entries={entries}
          />
        </div>

        {/* Right: entry cards */}
        <div className="lg:col-span-7">
          <p className="text-on-surface-variant mb-4 text-[10px] font-bold tracking-widest uppercase">
            {entries.length} {entries.length === 1 ? 'entry' : 'entries'}
          </p>
          <div className="flex flex-col gap-4">
            {entries.map((entry) => (
              <EntryListCard key={entry.date} entry={entry} />
            ))}
            {entries.length === 0 && (
              <p className="text-on-surface-variant text-sm italic">No entries for this month.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
