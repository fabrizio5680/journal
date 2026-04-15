import { useState } from 'react'

import MoodSparkline from '@/components/insights/MoodSparkline'
import TopTags from '@/components/insights/TopTags'
import { useInsights } from '@/hooks/useInsights'
import { useStreak } from '@/hooks/useStreak'

export default function InsightsPage() {
  const { moodByDate, topTags, totalEntries, totalWords } = useInsights()
  const { current, longest } = useStreak()
  const [moodDays, setMoodDays] = useState<30 | 90>(30)

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      {/* Header */}
      <h1 className="text-[3.5rem] font-bold tracking-tight text-on-surface leading-none mb-2">
        Your Journey
      </h1>
      <p className="text-on-surface-variant text-lg leading-relaxed mb-8">
        A reflection on the words, moods, and moments you've captured.
      </p>

      {/* Stats row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <div className="bg-surface-container-lowest rounded-[2rem] p-6">
          <div className="text-2xl font-bold text-on-surface mb-1">🔥 {current}</div>
          <div className="text-on-surface-variant text-sm">day streak</div>
        </div>
        <div className="bg-surface-container-lowest rounded-[2rem] p-6">
          <div className="text-2xl font-bold text-on-surface mb-1">🏆 {longest}</div>
          <div className="text-on-surface-variant text-sm">best streak</div>
        </div>
        <div className="bg-surface-container-lowest rounded-[2rem] p-6">
          <div className="text-2xl font-bold text-on-surface mb-1">📖 {totalEntries}</div>
          <div className="text-on-surface-variant text-sm">entries</div>
        </div>
        <div className="bg-surface-container-lowest rounded-[2rem] p-6">
          <div className="text-2xl font-bold text-on-surface mb-1">
            ✍️ {totalWords.toLocaleString()}
          </div>
          <div className="text-on-surface-variant text-sm">words written</div>
        </div>
      </div>

      {/* Mood Sparkline card */}
      <div className="bg-surface-container-lowest rounded-[2rem] p-6 mb-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-on-surface font-semibold text-base">Mood Over Time</h2>
          <div className="flex gap-1">
            <button
              onClick={() => setMoodDays(30)}
              className={
                moodDays === 30
                  ? 'bg-primary-container text-primary rounded-full px-3 py-1 text-xs font-semibold'
                  : 'text-on-surface-variant text-xs px-3 py-1'
              }
            >
              30d
            </button>
            <button
              onClick={() => setMoodDays(90)}
              className={
                moodDays === 90
                  ? 'bg-primary-container text-primary rounded-full px-3 py-1 text-xs font-semibold'
                  : 'text-on-surface-variant text-xs px-3 py-1'
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
        <h2 className="text-on-surface font-semibold text-base mb-4">Most Used Tags</h2>
        <TopTags data={topTags} />
      </div>
    </div>
  )
}
