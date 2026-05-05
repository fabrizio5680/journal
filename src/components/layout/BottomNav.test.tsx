import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { BrowserRouter } from 'react-router-dom'
import React from 'react'

import BottomNav from './BottomNav'

import { FocusModeProvider } from '@/context/FocusModeContext'
import { EditorControlsProvider } from '@/context/EditorControlsContext'

function Wrapper({ children }: { children: React.ReactNode }) {
  return (
    <BrowserRouter>
      <FocusModeProvider>
        <EditorControlsProvider>{children}</EditorControlsProvider>
      </FocusModeProvider>
    </BrowserRouter>
  )
}

describe('BottomNav', () => {
  it('renders Today link and Focus button', () => {
    render(
      <Wrapper>
        <BottomNav />
      </Wrapper>,
    )
    expect(screen.getByRole('link', { name: /today/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /enter focus mode/i })).toBeInTheDocument()
  })

  it('renders History and Insights nav links', () => {
    render(
      <Wrapper>
        <BottomNav />
      </Wrapper>,
    )
    expect(screen.getByRole('link', { name: /history/i })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /insights/i })).toBeInTheDocument()
  })

  it('does not render voice or font-size controls', () => {
    render(
      <Wrapper>
        <BottomNav />
      </Wrapper>,
    )
    expect(screen.queryByRole('button', { name: /dictate/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /text size/i })).not.toBeInTheDocument()
  })

  it('focus button label changes when focus mode is active', async () => {
    render(
      <Wrapper>
        <BottomNav />
      </Wrapper>,
    )

    const focusBtn = screen.getByRole('button', { name: /enter focus mode/i })
    await userEvent.click(focusBtn)
    expect(screen.getByRole('button', { name: /exit focus mode/i })).toBeInTheDocument()
  })

  it('nav hides when focus mode is active', async () => {
    render(
      <Wrapper>
        <BottomNav />
      </Wrapper>,
    )

    const nav = screen.getByRole('navigation')
    expect(nav).not.toHaveClass('translate-y-full')

    await userEvent.click(screen.getByRole('button', { name: /enter focus mode/i }))
    expect(nav).toHaveClass('translate-y-full')
  })
})
