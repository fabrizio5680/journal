import { differenceInDays } from 'date-fns'
import type { Timestamp } from 'firebase/firestore'

import { MOODS } from '@/lib/moods'
import Chip from '@/components/ui/Chip'
import type { Entry } from '@/types'

interface TrashEntryCardProps {
  entry: Entry
  onRestore: (date: string) => void
  onDeleteForever: (date: string) => void
}

function extractTitle(entry: Entry): string {
  try {
    const doc = entry.content as {
      content?: Array<{ type: string; content?: Array<{ text?: string }> }>
    }
    if (doc?.content) {
      for (const node of doc.content) {
        if (node.type === 'heading' && node.content?.[0]?.text) {
          return node.content[0].text
        }
      }
    }
  } catch {
    // fall through
  }
  return entry.contentText?.slice(0, 60) || 'Untitled'
}

function daysRemaining(deletedAt: Timestamp | null): number {
  if (!deletedAt) return 30
  const deletedDate = deletedAt.toDate()
  const daysSince = differenceInDays(new Date(), deletedDate)
  return Math.max(0, 30 - daysSince)
}

export default function TrashEntryCard({ entry, onRestore, onDeleteForever }: TrashEntryCardProps) {
  const mood = entry.mood !== null ? MOODS.find((m) => m.value === entry.mood) : null
  const title = extractTitle(entry)
  const excerpt = entry.contentText?.slice(0, 120) ?? ''
  const days = daysRemaining(entry.deletedAt)

  return (
    <div className="bg-surface-container-lowest rounded-[2rem] border border-transparent p-6 transition-all duration-500">
      {/* Date label + days remaining badge */}
      <div className="mb-1 flex items-center justify-between gap-2">
        <p className="text-on-surface-variant text-[10px] font-black tracking-widest uppercase">
          {entry.date}
        </p>
        <span className="bg-error-container text-on-error-container rounded-full px-3 py-0.5 text-[10px] font-semibold">
          {days}d left
        </span>
      </div>

      {/* Title row + mood chip */}
      <div className="flex items-start justify-between gap-4">
        <h3 className="text-on-surface flex-1 text-xl leading-snug font-bold">{title}</h3>
        {mood && (
          <Chip className="mt-1 shrink-0">
            {mood.emoji} {mood.label}
          </Chip>
        )}
      </div>

      {/* Excerpt */}
      <p className="text-on-surface-variant mt-2 line-clamp-2 text-sm leading-relaxed">{excerpt}</p>

      {/* Action buttons */}
      <div className="mt-4 flex items-center gap-2">
        <button
          onClick={() => onRestore(entry.date)}
          className="bg-primary-container text-primary rounded-full px-4 py-1.5 text-xs font-semibold transition-colors hover:brightness-95"
        >
          Restore
        </button>
        <button
          onClick={() => onDeleteForever(entry.date)}
          className="bg-error-container text-on-error-container rounded-full px-4 py-1.5 text-xs font-semibold transition-colors hover:brightness-95"
        >
          Delete forever
        </button>
      </div>
    </div>
  )
}
