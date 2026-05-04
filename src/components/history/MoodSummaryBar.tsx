import type { Entry } from '@/types'

interface MoodSummaryBarProps {
  entries: Entry[]
}

export default function MoodSummaryBar({ entries }: MoodSummaryBarProps) {
  const moodEntries = entries.filter((e) => e.mood !== null && e.mood !== undefined)

  if (moodEntries.length === 0) {
    return <p className="text-on-surface-variant mt-4 text-xs italic">No entries yet this month.</p>
  }

  const total = moodEntries.length
  const avg = moodEntries.reduce((sum, e) => sum + (e.mood ?? 0), 0) / total

  const bars = [
    {
      count: moodEntries.filter((e) => e.mood !== null && e.mood <= 2).length,
      className: 'bg-secondary-dim',
    },
    {
      count: moodEntries.filter((e) => e.mood === 3).length,
      className: 'bg-tertiary',
    },
    {
      count: moodEntries.filter((e) => e.mood === 4).length,
      className: 'bg-primary-fixed-dim',
    },
    {
      count: moodEntries.filter((e) => e.mood === 5).length,
      className: 'bg-primary',
    },
  ]

  const caption =
    avg < 2
      ? 'A sorrowful season — He is close to the brokenhearted.'
      : avg < 3
        ? 'A restless season — cast your anxieties on Him.'
        : avg < 4
          ? 'A hopeful season — steadfast in trust.'
          : avg < 4.5
            ? 'A peaceful season — the peace that surpasses understanding.'
            : 'A joyful season — overflowing with gratitude.'

  return (
    <div className="mt-4">
      <div className="flex gap-1">
        {bars.map((bar, i) =>
          bar.count > 0 ? (
            <div
              key={i}
              className={`h-1 rounded-full transition-all duration-500 ${bar.className}`}
              style={{ flex: bar.count }}
            />
          ) : null,
        )}
      </div>
      <p className="text-on-surface-variant mt-2 text-xs italic">{caption}</p>
    </div>
  )
}
