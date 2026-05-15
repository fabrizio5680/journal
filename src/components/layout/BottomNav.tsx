import { NavLink, useNavigate, useLocation } from 'react-router-dom'
import clsx from 'clsx'

import { useFocusMode } from '@/context/FocusModeContext'

export default function BottomNav() {
  const { isFocused, toggle } = useFocusMode()
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const isTodayActive = pathname === '/'

  return (
    <nav
      className={clsx(
        'bg-surface/80 border-outline-variant/15 fixed bottom-0 left-0 z-40 flex w-full items-center justify-around border-t px-2 pt-2 pb-4 backdrop-blur-xl transition-all duration-500 md:hidden',
        isFocused && 'pointer-events-none translate-y-full opacity-0',
      )}
    >
      {/* Today */}
      <button
        aria-label="Today"
        onClick={() =>
          navigate('/', { replace: pathname === '/', state: { navigatedAt: Date.now() } })
        }
        className={clsx(
          'flex flex-col items-center gap-1 rounded-xl px-3 py-2 transition-all duration-200',
          isTodayActive
            ? 'text-primary'
            : 'text-on-surface-variant/60 hover:text-on-surface-variant',
        )}
      >
        <span
          className="material-symbols-outlined text-[22px] transition-all duration-200"
          style={isTodayActive ? { fontVariationSettings: "'FILL' 1" } : {}}
        >
          edit_note
        </span>
        <span
          className={clsx('text-[9px] font-medium tracking-wide', isTodayActive && 'font-semibold')}
        >
          Today
        </span>
      </button>

      {/* History */}
      <NavLink
        to="/history"
        aria-label="History"
        className={({ isActive }) =>
          clsx(
            'flex flex-col items-center gap-1 rounded-xl px-3 py-2 transition-all duration-200',
            isActive ? 'text-primary' : 'text-on-surface-variant/60 hover:text-on-surface-variant',
          )
        }
      >
        {({ isActive }) => (
          <>
            <span
              className="material-symbols-outlined text-[22px] transition-all duration-200"
              style={isActive ? { fontVariationSettings: "'FILL' 1" } : {}}
            >
              history
            </span>
            <span
              className={clsx('text-[9px] font-medium tracking-wide', isActive && 'font-semibold')}
            >
              History
            </span>
          </>
        )}
      </NavLink>

      {/* Insights */}
      <NavLink
        to="/insights"
        aria-label="Insights"
        className={({ isActive }) =>
          clsx(
            'flex flex-col items-center gap-1 rounded-xl px-3 py-2 transition-all duration-200',
            isActive ? 'text-primary' : 'text-on-surface-variant/60 hover:text-on-surface-variant',
          )
        }
      >
        {({ isActive }) => (
          <>
            <span
              className="material-symbols-outlined text-[22px] transition-all duration-200"
              style={isActive ? { fontVariationSettings: "'FILL' 1" } : {}}
            >
              insights
            </span>
            <span
              className={clsx('text-[9px] font-medium tracking-wide', isActive && 'font-semibold')}
            >
              Insights
            </span>
          </>
        )}
      </NavLink>

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
