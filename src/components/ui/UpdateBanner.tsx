import { usePWAUpdate } from '@/hooks/usePWAUpdate'

export default function UpdateBanner() {
  const { needRefresh, updateServiceWorker } = usePWAUpdate()

  if (!needRefresh) return null

  return (
    <div className="fixed bottom-28 left-1/2 z-50 w-[calc(100%-2rem)] max-w-sm -translate-x-1/2">
      <div className="bg-primary text-on-primary flex items-center gap-4 rounded-2xl px-5 py-4 shadow-[0_10px_40px_rgba(82,100,72,0.3)]">
        <span className="material-symbols-outlined shrink-0 text-xl">system_update</span>
        <div className="min-w-0 flex-1">
          <p className="text-sm leading-tight font-semibold">Update available</p>
          <p className="mt-0.5 text-xs opacity-75">Reload to get the latest version.</p>
        </div>
        <button
          onClick={() => updateServiceWorker(true)}
          className="bg-on-primary/20 hover:bg-on-primary/30 text-on-primary shrink-0 rounded-xl px-4 py-2 text-sm font-bold transition-colors"
        >
          Reload
        </button>
      </div>
    </div>
  )
}
