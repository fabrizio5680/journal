interface ChipProps {
  children: React.ReactNode
  icon?: string
  onRemove?: () => void
  className?: string
}

export default function Chip({ children, icon, onRemove, className }: ChipProps) {
  return (
    <span
      className={`bg-secondary-container text-on-secondary-container inline-flex items-center gap-1 rounded-xl px-3 py-1.5 text-xs font-medium ${className ?? ''}`}
    >
      {icon && <span className="material-symbols-outlined text-[14px]">{icon}</span>}
      {children}
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          aria-label={`Remove ${children}`}
          className="hover:text-on-surface ml-0.5 leading-none transition-colors"
        >
          ×
        </button>
      )}
    </span>
  )
}
