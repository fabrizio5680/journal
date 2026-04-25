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

export function EntryListCardSkeleton() {
  return (
    <div className="bg-surface-container-lowest animate-pulse rounded-[2rem] p-6">
      <div className="bg-surface-container mb-3 h-3 w-24 rounded-lg" />
      <div className="bg-surface-container mb-2 h-7 w-3/4 rounded-lg" />
      <div className="bg-surface-container mb-1.5 h-4 w-full rounded-lg" />
      <div className="bg-surface-container h-4 w-2/3 rounded-lg" />
    </div>
  )
}

export default function EntryListCard({ entry }: EntryListCardProps) {
  const navigate = useNavigate()
  const mood = entry.mood !== null ? MOODS.find((m) => m.value === entry.mood) : null
  const title = extractTitle(entry)
  const excerpt = entry.contentText?.slice(0, 130) ?? ''

  const handleClick = () => {
    navigate(`/entry/${entry.date}`)
  }

  const parsedDate = parseISO(entry.date)

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={handleClick}
      onKeyDown={(e) => e.key === 'Enter' && handleClick()}
      className="group bg-surface-container-lowest hover:border-outline-variant/15 cursor-pointer rounded-[2rem] border border-transparent p-6 transition-all duration-500 hover:shadow-[0_8px_48px_rgba(27,30,24,0.07)]"
    >
      {/* Date + mood row */}
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-on-surface-variant/60 text-[10px] font-medium tracking-[0.18em] uppercase">
            {format(parsedDate, 'EEEE')}
          </span>
          <span className="text-outline-variant/60">·</span>
          <span className="text-on-surface-variant/60 text-[10px] font-medium tracking-[0.12em] uppercase">
            {format(parsedDate, 'MMM d, yyyy')}
          </span>
        </div>
        {mood && (
          <Chip className="shrink-0">
            {mood.emoji} {mood.label}
          </Chip>
        )}
      </div>

      {/* Title */}
      <h3 className="font-display text-on-surface mb-2 text-[1.6rem] leading-tight font-semibold tracking-tight">
        {title}
      </h3>

      {/* Excerpt + arrow */}
      <div className="flex items-end justify-between gap-4">
        <p className="text-on-surface-variant/70 line-clamp-2 flex-1 text-sm leading-relaxed">
          {excerpt}
        </p>
        <span className="material-symbols-outlined text-outline-variant/60 group-hover:text-primary shrink-0 text-[18px] transition-all duration-300 group-hover:translate-x-1">
          arrow_forward
        </span>
      </div>

      {/* Tags + scripture refs */}
      {((entry.tags && entry.tags.length > 0) ||
        (entry.scriptureRefs && entry.scriptureRefs.length > 0)) && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {entry.tags?.map((tag) => (
            <Chip key={tag}>{tag}</Chip>
          ))}
          {entry.scriptureRefs?.map((ref) => (
            <Chip key={ref.passageId} icon="menu_book">
              {ref.reference}
            </Chip>
          ))}
        </div>
      )}

      {/* Word count */}
      {entry.wordCount > 0 && (
        <p className="text-outline-variant/60 mt-3 text-[10px] tracking-wide">
          {entry.wordCount} words
        </p>
      )}
    </div>
  )
}
