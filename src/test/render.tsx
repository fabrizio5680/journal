import type { ReactElement, ReactNode } from 'react'
import { render, type RenderOptions } from '@testing-library/react'
import { BrowserRouter } from 'react-router-dom'

import { FocusModeProvider } from '@/context/FocusModeContext'

// eslint-disable-next-line react-refresh/only-export-components
function AllProviders({ children }: { children: ReactNode }) {
  return (
    <BrowserRouter>
      <FocusModeProvider>{children}</FocusModeProvider>
    </BrowserRouter>
  )
}

export function renderWithProviders(ui: ReactElement, options?: Omit<RenderOptions, 'wrapper'>) {
  return render(ui, { wrapper: AllProviders, ...options })
}

// eslint-disable-next-line react-refresh/only-export-components
export * from '@testing-library/react'
