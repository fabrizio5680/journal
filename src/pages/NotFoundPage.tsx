import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { usePageTitle } from '@/hooks/usePageTitle'

export default function NotFoundPage() {
  usePageTitle('Page Not Found')
  const navigate = useNavigate()
  const [seconds, setSeconds] = useState(3)

  useEffect(() => {
    const interval = setInterval(() => {
      setSeconds((s) => {
        if (s <= 1) {
          clearInterval(interval)
          navigate('/', { replace: true })
          return 0
        }
        return s - 1
      })
    }, 1000)
    return () => clearInterval(interval)
  }, [navigate])

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 text-center px-6">
      <span className="material-symbols-outlined text-on-surface-variant text-[72px] opacity-30">
        search_off
      </span>
      <h1 className="text-on-surface text-3xl font-bold">Page not found</h1>
      <p className="text-on-surface-variant max-w-xs text-sm leading-relaxed">
        Redirecting you to your sanctuary in {seconds}…
      </p>
    </div>
  )
}
