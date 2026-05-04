import { useEffect, useState } from 'react'
import { format } from 'date-fns'

/**
 * Returns today's date string in 'yyyy-MM-dd' format, updated reactively
 * whenever the user returns to the tab/PWA after the date has changed.
 * Uses visibilitychange rather than a midnight timer — sufficient for the
 * "left open overnight" case.
 */
export function useToday(): string {
  const [today, setToday] = useState(() => format(new Date(), 'yyyy-MM-dd'))

  useEffect(() => {
    function handleVisibilityChange() {
      if (document.visibilityState === 'visible') {
        const current = format(new Date(), 'yyyy-MM-dd')
        setToday((prev) => (prev !== current ? current : prev))
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [])

  return today
}
