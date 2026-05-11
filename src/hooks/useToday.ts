import { useEffect, useState } from 'react'
import { format } from 'date-fns'

function msUntilMidnight(): number {
  const now = new Date()
  const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1)
  return midnight.getTime() - now.getTime()
}

/**
 * Returns today's date string in 'yyyy-MM-dd' format, updated reactively
 * on visibilitychange and at the exact moment midnight occurs.
 */
export function useToday(): string {
  const [today, setToday] = useState(() => format(new Date(), 'yyyy-MM-dd'))

  useEffect(() => {
    let timerId: ReturnType<typeof setTimeout>

    function tick() {
      const current = format(new Date(), 'yyyy-MM-dd')
      setToday((prev) => (prev !== current ? current : prev))
    }

    function scheduleMidnight() {
      timerId = setTimeout(() => {
        tick()
        scheduleMidnight()
      }, msUntilMidnight())
    }

    function handleVisibilityChange() {
      if (document.visibilityState === 'visible') tick()
    }

    scheduleMidnight()
    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => {
      clearTimeout(timerId)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [])

  return today
}
