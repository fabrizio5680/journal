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
