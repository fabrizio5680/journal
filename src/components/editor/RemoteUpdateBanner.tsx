import { useRemoteUpdateBanner } from '@/hooks/useRemoteUpdateBanner'

interface Props {
  userId: string
  date: string
  onKeepMine: () => void
  onView: () => void
}

export default function RemoteUpdateBanner({ date, onKeepMine, onView }: Props) {
  const banner = useRemoteUpdateBanner(date)

  if (!banner) return null

  const timeLabel = new Date(banner.remoteUpdatedAt).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  })

  return (
    <div className="bg-surface-container-lowest border-outline-variant/20 mb-3 flex items-center gap-3 rounded-2xl border px-4 py-3 shadow-sm">
      <span className="material-symbols-outlined text-primary shrink-0 text-[18px]">
        cloud_sync
      </span>
      <p className="text-on-surface-variant min-w-0 flex-1 text-xs">
        Updated on another device at {timeLabel}
      </p>
      <div className="flex shrink-0 gap-1.5">
        <button
          type="button"
          onClick={onView}
          className="text-primary hover:bg-primary-container/40 rounded-full px-3 py-1 text-xs font-semibold transition-colors"
        >
          View
        </button>
        <button
          type="button"
          onClick={onKeepMine}
          className="text-on-surface-variant/60 hover:text-on-surface-variant rounded-full px-3 py-1 text-xs transition-colors"
        >
          Keep mine
        </button>
      </div>
    </div>
  )
}
