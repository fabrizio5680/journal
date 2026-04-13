import { vi } from 'vitest'
import type { User } from 'firebase/auth'

export function createMockUser(overrides: Partial<User> = {}): User {
  return {
    uid: 'test-uid',
    email: 'test@example.com',
    displayName: 'Test User',
    photoURL: null,
    emailVerified: true,
    isAnonymous: false,
    providerData: [],
    refreshToken: '',
    tenantId: null,
    phoneNumber: null,
    metadata: { creationTime: undefined, lastSignInTime: undefined },
    providerId: 'google.com',
    delete: vi.fn(),
    getIdToken: vi.fn(),
    getIdTokenResult: vi.fn(),
    reload: vi.fn(),
    toJSON: vi.fn(),
    ...overrides,
  } as unknown as User
}

export function createMockFirestoreDoc(data: Record<string, unknown> = {}) {
  return {
    id: 'mock-doc-id',
    exists: () => true,
    data: () => data,
    ref: { id: 'mock-doc-id', path: 'users/test-uid/entries/mock-doc-id' },
  }
}
