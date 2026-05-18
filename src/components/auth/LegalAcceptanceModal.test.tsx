import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockAcceptLegalTerms = vi.fn()
const mockDeclineForAge = vi.fn()
let requiresLegalAcceptance = true

vi.mock('@/hooks/useLegalAcceptance', () => ({
  POLICY_VERSION: '1.0',
  TOS_VERSION: '1.0',
  useLegalAcceptance: () => ({
    requiresLegalAcceptance,
    acceptLegalTerms: mockAcceptLegalTerms,
    declineForAge: mockDeclineForAge,
  }),
}))

import LegalAcceptanceModal from './LegalAcceptanceModal'

function renderModal() {
  return render(
    <MemoryRouter>
      <LegalAcceptanceModal />
    </MemoryRouter>,
  )
}

describe('LegalAcceptanceModal', () => {
  beforeEach(() => {
    requiresLegalAcceptance = true
    mockAcceptLegalTerms.mockReset()
    mockDeclineForAge.mockReset()
  })

  it('does not render when legal acceptance is current', () => {
    requiresLegalAcceptance = false

    renderModal()

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('requires age, privacy, and terms checkboxes before continuing', async () => {
    const user = userEvent.setup()

    renderModal()

    const continueButton = screen.getByRole('button', { name: /continue/i })
    expect(continueButton).toBeDisabled()

    await user.click(screen.getByLabelText(/16 years old or older/i))
    await user.click(screen.getByLabelText(/privacy policy/i))
    await user.click(screen.getByLabelText(/terms of service/i))
    await user.click(continueButton)

    expect(mockAcceptLegalTerms).toHaveBeenCalledTimes(1)
  })

  it('declines the account when the user is under 16', async () => {
    const user = userEvent.setup()

    renderModal()

    await user.click(screen.getByRole('button', { name: /under 16/i }))

    expect(mockDeclineForAge).toHaveBeenCalledTimes(1)
  })
})
