import { lazy, Suspense, useEffect, useState, type ReactNode } from 'react'
import { Routes, Route, useNavigate } from 'react-router-dom'
import { onAuthStateChanged, type User } from 'firebase/auth'

import { auth } from '@/lib/firebase'
import { SaveStatusProvider } from '@/context/SaveStatusContext'
import { FocusModeProvider } from '@/context/FocusModeContext'
import { SearchProvider } from '@/context/SearchContext'
import { UserPreferencesProvider } from '@/context/UserPreferencesContext'
import { EditorControlsProvider } from '@/context/EditorControlsContext'
import AppShell from '@/components/layout/AppShell'
import UpdateBanner from '@/components/ui/UpdateBanner'

const LoginPage = lazy(() => import('@/components/auth/LoginPage'))
const TodayPage = lazy(() => import('@/pages/TodayPage'))
const EntryPage = lazy(() => import('@/pages/EntryPage'))
const HistoryPage = lazy(() => import('@/pages/HistoryPage'))
const InsightsPage = lazy(() => import('@/pages/InsightsPage'))
const SettingsPage = lazy(() => import('@/pages/SettingsPage'))
const NotFoundPage = lazy(() => import('@/pages/NotFoundPage'))

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
      <Suspense fallback={null}>
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
      </Suspense>
      <UpdateBanner />
    </>
  )
}
