import { useNavigate } from 'react-router-dom'
import { format, parseISO } from 'date-fns'

import Chip from '@/components/ui/Chip'
import { MOODS } from '@/lib/moods'
import type { Entry } from '@/types'

interface EntryListCardProps {
  entry: Entry
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

export default function EntryListCard({ entry }: EntryListCardProps) {
  const navigate = useNavigate()
  const mood = entry.mood !== null ? MOODS.find((m) => m.value === entry.mood) : null
  const title = extractTitle(entry)
  const excerpt = entry.contentText?.slice(0, 120) ?? ''

  const handleClick = () => {
    navigate(`/entry/${entry.date}`)
  }

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={handleClick}
      onKeyDown={(e) => e.key === 'Enter' && handleClick()}
      className="group bg-surface-container-lowest hover:border-outline-variant/10 cursor-pointer rounded-[2rem] border border-transparent p-6 transition-all duration-500 hover:shadow-[0_4px_40px_rgba(48,51,49,0.06)]"
    >
      {/* Date label */}
      <p className="text-on-surface-variant mb-1 text-[10px] font-black tracking-widest uppercase">
        {format(parseISO(entry.date), 'EEEE, MMMM d, yyyy')}
      </p>

      {/* Title row + mood chip */}
      <div className="flex items-start justify-between gap-4">
        <h3 className="text-on-surface flex-1 text-2xl leading-snug font-bold">{title}</h3>
        {mood && (
          <Chip className="mt-1 shrink-0">
            {mood.emoji} {mood.label}
          </Chip>
        )}
      </div>

      {/* Excerpt + arrow */}
      <div className="mt-2 flex items-end justify-between gap-4">
        <p className="text-on-surface-variant line-clamp-2 flex-1 text-sm leading-relaxed">
          {excerpt}
        </p>
        <span className="material-symbols-outlined text-on-surface-variant shrink-0 transition-transform duration-300 group-hover:translate-x-1">
          arrow_forward
        </span>
      </div>
    </div>
  )
}
