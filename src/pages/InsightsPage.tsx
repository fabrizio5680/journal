import { useState } from 'react'

import MoodSparkline from '@/components/insights/MoodSparkline'
import TopTags from '@/components/insights/TopTags'
import { useInsights } from '@/hooks/useInsights'
import { useStreak } from '@/hooks/useStreak'
import { usePageTitle } from '@/hooks/usePageTitle'

function StatCard({ value, label }: { value: string; label: string }) {
  return (
    <div className="bg-surface-container-lowest rounded-[1.75rem] p-6 flex flex-col gap-1">
      <div className="font-display text-on-surface text-3xl font-light leading-none">{value}</div>
      <div className="text-on-surface-variant/60 text-xs tracking-wide">{label}</div>
    </div>
  )
}

function InsightsPageSkeleton() {
  return (
    <div className="mx-auto max-w-2xl animate-pulse px-4 py-8 md:pt-16">
      <div className="bg-surface-container mb-1 h-3 w-20 rounded-lg" />
      <div className="bg-surface-container mb-10 h-12 w-56 rounded-xl" />
      <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="bg-surface-container-lowest rounded-[1.75rem] p-6">
            <div className="bg-surface-container mb-2 h-8 w-16 rounded-lg" />
            <div className="bg-surface-container h-3 w-20 rounded-lg" />
          </div>
        ))}
      </div>
      <div className="bg-surface-container-lowest mb-5 rounded-[2rem] p-6">
        <div className="bg-surface-container mb-4 h-4 w-32 rounded-lg" />
        <div className="bg-surface-container h-32 w-full rounded-xl" />
      </div>
      <div className="bg-surface-container-lowest rounded-[2rem] p-6">
        <div className="bg-surface-container mb-4 h-4 w-28 rounded-lg" />
        <div className="flex flex-col gap-2">
          {[0, 1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="bg-surface-container h-6 rounded-lg"
              style={{ width: `${90 - i * 12}%` }}
            />
          ))}
        </div>
      </div>
    </div>
  )
}

const MIN_ENTRIES_FOR_INSIGHTS = 3

export default function InsightsPage() {
  usePageTitle('Your Journey')
  const { moodByDate, topTags, totalEntries, totalWords, isLoading } = useInsights()
  const { current, longest } = useStreak()
  const [moodDays, setMoodDays] = useState<30 | 90>(30)

  if (isLoading) return <InsightsPageSkeleton />

  return (
    <div className="mx-auto max-w-2xl px-4 py-8 md:pt-16">
      {/* Header */}
      <p className="text-on-surface-variant/50 text-[10px] tracking-[0.25em] uppercase mb-2">
        Reflections
      </p>
      <h1 className="font-display text-on-surface mb-10 text-[3.5rem] font-light leading-none tracking-tight">
        Your Journey
      </h1>

      {/* Stats row */}
      <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatCard value={`🔥 ${current}`} label="day streak" />
        <StatCard value={`🏆 ${longest}`} label="best streak" />
        <StatCard value={`${totalEntries}`} label="entries written" />
        <StatCard value={totalWords.toLocaleString()} label="words captured" />
      </div>

      {totalEntries < MIN_ENTRIES_FOR_INSIGHTS ? (
        <div className="flex flex-col items-center gap-4 py-24 text-center">
          <span className="material-symbols-outlined text-on-surface-variant/20 text-[56px]">
            bar_chart
          </span>
          <p className="font-display text-on-surface-variant text-2xl font-light italic">
            Write a few more to see patterns.
          </p>
          <p className="text-on-surface-variant/60 max-w-xs text-sm leading-relaxed">
            Your mood trends and tag insights appear once you have at least{' '}
            {MIN_ENTRIES_FOR_INSIGHTS} entries.
          </p>
        </div>
      ) : (
        <>
          {/* Mood Sparkline card */}
          <div className="bg-surface-container-lowest mb-5 rounded-[2rem] p-6">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-display text-on-surface text-xl font-semibold">Mood Over Time</h2>
              <div className="flex gap-1">
                <button
                  onClick={() => setMoodDays(30)}
                  className={
                    moodDays === 30
                      ? 'bg-primary-container text-primary rounded-full px-3 py-1 text-xs font-semibold'
                      : 'text-on-surface-variant/60 px-3 py-1 text-xs hover:text-on-surface-variant'
                  }
                >
                  30d
                </button>
                <button
                  onClick={() => setMoodDays(90)}
                  className={
                    moodDays === 90
                      ? 'bg-primary-container text-primary rounded-full px-3 py-1 text-xs font-semibold'
                      : 'text-on-surface-variant/60 px-3 py-1 text-xs hover:text-on-surface-variant'
                  }
                >
                  90d
                </button>
              </div>
            </div>
            <MoodSparkline data={moodByDate} days={moodDays} />
          </div>

          {/* Top Tags card */}
          <div className="bg-surface-container-lowest rounded-[2rem] p-6">
            <h2 className="font-display text-on-surface mb-4 text-xl font-semibold">
              Most Used Tags
            </h2>
            <TopTags data={topTags} />
          </div>
        </>
      )}
    </div>
  )
}
