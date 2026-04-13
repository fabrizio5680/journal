import { describe, it, expect } from 'vitest'

describe('test setup', () => {
  it('jest-dom matchers are available', () => {
    const div = document.createElement('div')
    document.body.appendChild(div)
    expect(div).toBeInTheDocument()
    document.body.removeChild(div)
  })
})
