import { MOODS } from '@/lib/moods'
import type { EntryMetadata } from '@/lib/storage/types'
import { syncCoordinator } from '@/lib/storage/syncCoordinator'

interface Props {
  userId: string
  date: string
  localMood: 1 | 2 | 3 | 4 | 5 | null
  localMoodLabel: string | null
  conflict: NonNullable<EntryMetadata['moodConflict']>
}

function moodEmoji(label: string | null): string {
  if (!label) return '—'
  return MOODS.find((m) => m.label === label)?.emoji ?? '—'
}

export default function MoodConflictBanner({
  userId,
  date,
  localMood,
  localMoodLabel,
  conflict,
}: Props) {
  async function handleKeepMine() {
    await syncCoordinator.resolveMoodConflict(userId, date, localMood, localMoodLabel)
  }

  async function handleKeepTheirs() {
    await syncCoordinator.resolveMoodConflict(
      userId,
      date,
      conflict.remoteMood,
      conflict.remoteMoodLabel,
    )
  }

  const localEmoji = moodEmoji(localMoodLabel)
  const remoteEmoji = moodEmoji(conflict.remoteMoodLabel)

  return (
    <div className="bg-tertiary-container/30 border-tertiary/20 mb-3 flex flex-wrap items-center gap-3 rounded-2xl border px-4 py-3">
      <span className="material-symbols-outlined text-tertiary shrink-0 text-[18px]">
        compare_arrows
      </span>
      <p className="text-on-surface min-w-0 flex-1 text-xs">
        Mood differs across devices: <span className="font-semibold">{localEmoji}</span> here vs{' '}
        <span className="font-semibold">{remoteEmoji}</span> on{' '}
        <span className="font-semibold">{conflict.remoteDeviceLabel}</span>
      </p>
      <div className="flex shrink-0 gap-1.5">
        <button
          type="button"
          onClick={() => void handleKeepMine()}
          className="text-on-surface-variant/70 hover:text-on-surface-variant rounded-full px-3 py-1 text-xs transition-colors"
        >
          Keep mine
        </button>
        <button
          type="button"
          onClick={() => void handleKeepTheirs()}
          className="bg-primary text-on-primary rounded-full px-3 py-1 text-xs font-semibold transition-opacity hover:opacity-90"
        >
          Keep theirs
        </button>
      </div>
    </div>
  )
}
