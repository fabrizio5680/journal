import { useEffect, useState, type ReactNode } from 'react'
import { Routes, Route, Navigate, useNavigate } from 'react-router-dom'
import { onAuthStateChanged, type User } from 'firebase/auth'

import { auth } from '@/lib/firebase'
import { SaveStatusProvider } from '@/context/SaveStatusContext'
import AppShell from '@/components/layout/AppShell'
import LoginPage from '@/components/auth/LoginPage'
import TodayPage from '@/pages/TodayPage'
import HistoryPage from '@/pages/HistoryPage'
import InsightsPage from '@/pages/InsightsPage'
import SettingsPage from '@/pages/SettingsPage'
import TrashPage from '@/pages/TrashPage'
import EntryPage from '@/pages/EntryPage'

function RequireAuth({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null | undefined>(undefined)
  const navigate = useNavigate()

  useEffect(() => {
    return onAuthStateChanged(auth, (u) => {
      setUser(u)
      if (u === null) navigate('/login')
    })
  }, [navigate])

  if (user === undefined) return null
  return <>{children}</>
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />

      {/* All authenticated routes share the AppShell layout */}
      <Route
        element={
          <RequireAuth>
            <SaveStatusProvider>
              <AppShell />
            </SaveStatusProvider>
          </RequireAuth>
        }
      >
        <Route path="/" element={<TodayPage />} />
        <Route path="/entry/:date" element={<EntryPage />} />
        <Route path="/history" element={<HistoryPage />} />
        <Route path="/insights" element={<InsightsPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="/trash" element={<TrashPage />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
