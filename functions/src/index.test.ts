import { describe, it, expect } from 'vitest'

import { isWithinReminderWindow, buildReminderMessage } from './index'

describe('isWithinReminderWindow', () => {
  it('returns true when current time matches reminder time exactly', () => {
    expect(isWithinReminderWindow('08:00', '08:00')).toBe(true)
  })

  it('returns true at 59 minutes past reminder', () => {
    expect(isWithinReminderWindow('08:59', '08:00')).toBe(true)
  })

  it('returns false at exactly 60 minutes past reminder', () => {
    expect(isWithinReminderWindow('09:00', '08:00')).toBe(false)
  })

  it('returns true when function fires at :05 and reminder is :00 (regression: old >= 5 window would skip this)', () => {
    expect(isWithinReminderWindow('08:05', '08:00')).toBe(true)
  })

  it('returns false when current time is before reminder', () => {
    expect(isWithinReminderWindow('07:59', '08:00')).toBe(false)
  })

  it('returns false for invalid reminder time', () => {
    expect(isWithinReminderWindow('08:00', 'bad')).toBe(false)
  })

  it('returns false for invalid current time', () => {
    expect(isWithinReminderWindow('bad', '08:00')).toBe(false)
  })
})

describe('buildReminderMessage', () => {
  const BASE = 'https://journal-manna.web.app'

  it('sets token on the message', () => {
    const msg = buildReminderMessage('tok-123', BASE)
    expect(msg.token).toBe('tok-123')
  })

  it('has no notification key (data-only prevents double notification on Android Chrome PWA)', () => {
    const msg = buildReminderMessage('tok-123', BASE)
    expect(msg).not.toHaveProperty('notification')
    expect(msg).not.toHaveProperty('webpush')
  })

  it('includes title and body in data payload', () => {
    const msg = buildReminderMessage('tok-123', BASE)
    expect(msg.data.title).toBeTruthy()
    expect(msg.data.body).toBeTruthy()
  })

  it('includes icon and link derived from baseUrl', () => {
    const msg = buildReminderMessage('tok-123', BASE)
    expect(msg.data.icon).toContain(BASE)
    expect(msg.data.link).toContain(BASE)
  })
})
