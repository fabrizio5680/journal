import '@testing-library/jest-dom'
import { vi } from 'vitest'

// Mock Firebase globally
vi.mock('@/lib/firebase', () => ({
  auth: {
    currentUser: null,
    onAuthStateChanged: vi.fn(),
  },
  db: {},
  default: {},
}))

// jsdom does not implement window.matchMedia — provide a minimal stub
if (typeof window !== 'undefined' && !window.matchMedia) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    configurable: true,
    value: vi.fn().mockReturnValue({ matches: false }),
  })
}
