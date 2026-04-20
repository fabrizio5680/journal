import { NavLink } from 'react-router-dom'
import clsx from 'clsx'

import { useFocusMode } from '@/context/FocusModeContext'

const NAV_ITEMS = [
  { label: 'Entry', icon: 'edit_note', to: '/' },
  { label: 'History', icon: 'calendar_month', to: '/history' },
  { label: 'Insights', icon: 'bar_chart', to: '/insights' },
  { label: 'Settings', icon: 'settings', to: '/settings' },
]

export default function BottomNav() {
  const { isFocused, toggle } = useFocusMode()

  return (
    <nav
      className={clsx(
        'bg-surface/80 border-outline-variant/15 fixed bottom-0 left-0 z-40 flex w-full items-center justify-around border-t px-2 pt-2 pb-7 backdrop-blur-xl transition-all duration-500 md:hidden',
        isFocused && 'pointer-events-none translate-y-full opacity-0',
      )}
    >
      {NAV_ITEMS.map(({ label, icon, to }) => (
        <NavLink
          key={to}
          to={to}
          end={to === '/'}
          className={({ isActive }) =>
            clsx(
              'flex flex-col items-center gap-1 rounded-xl px-3 py-2 transition-all duration-200',
              isActive
                ? 'text-primary'
                : 'text-on-surface-variant/60 hover:text-on-surface-variant',
            )
          }
        >
          {({ isActive }) => (
            <>
              <span
                className={clsx(
                  'material-symbols-outlined transition-all duration-200',
                  isActive ? 'text-[22px]' : 'text-[22px]',
                )}
                style={isActive ? { fontVariationSettings: "'FILL' 1" } : {}}
              >
                {icon}
              </span>
              <span
                className={clsx(
                  'text-[9px] font-medium tracking-wide',
                  isActive && 'font-semibold',
                )}
              >
                {label}
              </span>
            </>
          )}
        </NavLink>
      ))}

      {/* Focus toggle */}
      <button
        onClick={toggle}
        aria-label={isFocused ? 'Exit focus mode' : 'Enter focus mode'}
        className={clsx(
          'flex flex-col items-center gap-1 rounded-xl px-3 py-2 transition-all duration-200',
          isFocused ? 'text-primary' : 'text-on-surface-variant/60 hover:text-on-surface-variant',
        )}
      >
        <span className="material-symbols-outlined text-[22px]">
          {isFocused ? 'visibility' : 'visibility_off'}
        </span>
        <span className="text-[9px] font-medium tracking-wide">Focus</span>
      </button>
    </nav>
  )
}
