import { useEffect, useState, type ReactNode } from 'react'
import { Routes, Route, useNavigate } from 'react-router-dom'
import { onAuthStateChanged, type User } from 'firebase/auth'

import { auth } from '@/lib/firebase'
import { SaveStatusProvider } from '@/context/SaveStatusContext'
import { FocusModeProvider } from '@/context/FocusModeContext'
import { SearchProvider } from '@/context/SearchContext'
import { UserPreferencesProvider } from '@/context/UserPreferencesContext'
import { EditorControlsProvider } from '@/context/EditorControlsContext'
import AppShell from '@/components/layout/AppShell'
import LoginPage from '@/components/auth/LoginPage'
import TodayPage from '@/pages/TodayPage'
import HistoryPage from '@/pages/HistoryPage'
import InsightsPage from '@/pages/InsightsPage'
import SettingsPage from '@/pages/SettingsPage'
import EntryPage from '@/pages/EntryPage'
import NotFoundPage from '@/pages/NotFoundPage'
import UpdateBanner from '@/components/ui/UpdateBanner'

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
    <>
      <Routes>
        <Route path="/login" element={<LoginPage />} />

        {/* All authenticated routes share the AppShell layout */}
        <Route
          element={
            <RequireAuth>
              <UserPreferencesProvider>
                <SearchProvider>
                  <FocusModeProvider>
                    <SaveStatusProvider>
                      <EditorControlsProvider>
                        <AppShell />
                      </EditorControlsProvider>
                    </SaveStatusProvider>
                  </FocusModeProvider>
                </SearchProvider>
              </UserPreferencesProvider>
            </RequireAuth>
          }
        >
          <Route path="/" element={<TodayPage />} />
          <Route path="/entry/:date" element={<EntryPage />} />
          <Route path="/history" element={<HistoryPage />} />
          <Route path="/insights" element={<InsightsPage />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Route>

        <Route path="*" element={<NotFoundPage />} />
      </Routes>
      <UpdateBanner />
    </>
  )
}
