import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

describe('firestore.rules storage provider privacy', () => {
  const rules = readFileSync(resolve(process.cwd(), 'firestore.rules'), 'utf8')

  it('keeps user docs readable/writable by their owner', () => {
    expect(rules).toMatch(/match \/users\/\{userId\}/)
    expect(rules).toMatch(/allow read, write: if request\.auth\.uid == userId/)
  })

  it('denies all client access to private provider token documents', () => {
    expect(rules).toMatch(/match \/private\/\{document=\*\*\}/)
    expect(rules).toMatch(/allow read, write: if false/)
  })
})
