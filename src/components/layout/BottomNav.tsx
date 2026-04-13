import { NavLink } from 'react-router-dom'
import clsx from 'clsx'

const NAV_ITEMS = [
  { label: 'Entry', icon: 'edit_note', to: '/' },
  { label: 'History', icon: 'calendar_month', to: '/history' },
  { label: 'Focus', icon: 'visibility_off', to: '/focus' },
  { label: 'Settings', icon: 'settings', to: '/settings' },
]

export default function BottomNav() {
  return (
    <nav className="bg-surface/70 fixed bottom-0 left-0 z-40 flex w-full items-center justify-around rounded-t-3xl px-6 pt-4 pb-8 shadow-[0_-4px_40px_rgba(48,51,49,0.06)] backdrop-blur-xl md:hidden">
      {NAV_ITEMS.map(({ label, icon, to }) => (
        <NavLink
          key={to}
          to={to}
          end={to === '/'}
          className={({ isActive }) =>
            clsx(
              'flex flex-col items-center',
              isActive
                ? 'bg-primary-container text-primary scale-95 rounded-full p-3'
                : 'text-on-surface-variant hover:text-primary p-3',
            )
          }
        >
          <span className="material-symbols-outlined">{icon}</span>
          <span className="mt-1 text-[10px]">{label}</span>
        </NavLink>
      ))}
    </nav>
  )
}
