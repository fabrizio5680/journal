import { Outlet } from 'react-router-dom'

import SideNav from './SideNav'
import TopBar from './TopBar'
import BottomNav from './BottomNav'
import RightPanel from './RightPanel'

export default function AppShell() {
  return (
    <div className="bg-background min-h-screen">
      {/* Mobile: fixed top bar */}
      <TopBar />

      {/* Desktop: fixed left sidebar */}
      <SideNav />

      {/* Desktop: fixed right panel (xl only) */}
      <RightPanel />

      {/* Main content area */}
      <main className="min-h-screen md:ml-64 xl:mr-80">
        {/* pt-16 offsets fixed TopBar on mobile; pb-24 leaves room for BottomNav */}
        <div className="pt-16 pb-24 md:pt-0 md:pb-0">
          <Outlet />
        </div>
      </main>

      {/* Mobile: fixed bottom nav */}
      <BottomNav />
    </div>
  )
}
