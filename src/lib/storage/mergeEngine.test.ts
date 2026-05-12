import { beforeEach, describe, expect, it, vi } from 'vitest'

import { mergeEntries } from './mergeEngine'
import type { EntryFile } from './types'

function makeEntry(overrides: Partial<EntryFile> = {}): EntryFile {
  return {
    schemaVersion: 1,
    app: 'quiet-dwelling',
    date: '2026-05-01',
    content: {
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Local text' }] }],
    },
    searchText: 'Local text',
    mood: null,
    moodLabel: null,
    tags: [],
    scriptureRefs: [],
    wordCount: 2,
    createdAt: '2026-05-01T08:00:00.000Z',
    updatedAt: '2026-05-01T09:00:00.000Z',
    ...overrides,
  }
}

function makeRemoteEntry(overrides: Partial<EntryFile> = {}): EntryFile {
  return {
    schemaVersion: 1,
    app: 'quiet-dwelling',
    date: '2026-05-01',
    content: {
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Remote text' }] }],
    },
    searchText: 'Remote text',
    mood: null,
    moodLabel: null,
    tags: [],
    scriptureRefs: [],
    wordCount: 2,
    createdAt: '2026-05-01T10:00:00.000Z',
    updatedAt: '2026-05-01T11:00:00.000Z',
    ...overrides,
  }
}

describe('mergeEntries', () => {
  beforeEach(() => {
    vi.useRealTimers()
  })

  it('body concat: merged content = [...local, hrNode, separatorParagraph, ...remote]', () => {
    const local = makeEntry()
    const remote = makeRemoteEntry()
    const { merged } = mergeEntries(local, remote, 'Remote Device')

    const doc = merged.content as { type: string; content: unknown[] }
    expect(doc.type).toBe('doc')

    const localNodes = (local.content as { type: string; content: unknown[] }).content
    const remoteNodes = (remote.content as { type: string; content: unknown[] }).content

    // Structure: [...localNodes, hrNode, separatorParagraph, ...remoteNodes]
    expect(doc.content.length).toBe(localNodes.length + 1 + 1 + remoteNodes.length)
    expect((doc.content[doc.content.length - 1] as { type: string }).type).toBe('paragraph')
  })

  it('separator paragraph text contains remote device label', () => {
    const local = makeEntry()
    const remote = makeRemoteEntry()
    const { merged } = mergeEntries(local, remote, 'Remote MacBook')

    const doc = merged.content as { type: string; content: unknown[] }
    // The separator paragraph is after localNodes and the hr node
    const localNodeCount = (local.content as { type: string; content: unknown[] }).content.length
    const separatorParagraph = doc.content[localNodeCount + 1] as {
      type: string
      content: Array<{ type: string; text?: string }>
    }
    expect(separatorParagraph.type).toBe('paragraph')
    const text = separatorParagraph.content?.[0]?.text ?? ''
    expect(text).toContain('Remote MacBook')
  })

  it('local on top: first node of merged content matches first local node', () => {
    const localNode = { type: 'paragraph', content: [{ type: 'text', text: 'First local line' }] }
    const local = makeEntry({
      content: { type: 'doc', content: [localNode] },
    })
    const remote = makeRemoteEntry()
    const { merged } = mergeEntries(local, remote, 'Remote Device')

    const doc = merged.content as { type: string; content: unknown[] }
    expect(doc.content[0]).toEqual(localNode)
  })

  it('hr node placed after local content and before separator', () => {
    const local = makeEntry()
    const remote = makeRemoteEntry()
    const { merged } = mergeEntries(local, remote, 'Remote Device')

    const doc = merged.content as { type: string; content: unknown[] }
    const localNodeCount = (local.content as { type: string; content: unknown[] }).content.length
    const hrNode = doc.content[localNodeCount] as { type: string }
    expect(hrNode.type).toBe('horizontalRule')
  })

  it('tags dedup: union preserving local order, no duplicates', () => {
    const local = makeEntry({ tags: ['faith', 'work', 'morning'] })
    const remote = makeRemoteEntry({ tags: ['work', 'evening', 'faith'] })
    const { merged } = mergeEntries(local, remote, 'Remote Device')

    expect(merged.tags).toEqual(['faith', 'work', 'morning', 'evening'])
  })

  it('tags dedup: empty arrays on both sides yields empty result', () => {
    const local = makeEntry({ tags: [] })
    const remote = makeRemoteEntry({ tags: [] })
    const { merged } = mergeEntries(local, remote, 'Remote Device')
    expect(merged.tags).toEqual([])
  })

  it('scriptureRefs dedup by passageId: local refs first, remote-only appended, shared passageId not duplicated', () => {
    const sharedRef = { reference: 'John 3:16', passageId: 'JHN.3.16' }
    const localOnlyRef = { reference: 'Psalm 23:1', passageId: 'PSA.23.1' }
    const remoteOnlyRef = { reference: 'Romans 8:28', passageId: 'ROM.8.28' }

    const local = makeEntry({ scriptureRefs: [sharedRef, localOnlyRef] })
    const remote = makeRemoteEntry({ scriptureRefs: [sharedRef, remoteOnlyRef] })
    const { merged } = mergeEntries(local, remote, 'Remote Device')

    expect(merged.scriptureRefs).toHaveLength(3)
    expect(merged.scriptureRefs[0]).toEqual(sharedRef)
    expect(merged.scriptureRefs[1]).toEqual(localOnlyRef)
    expect(merged.scriptureRefs[2]).toEqual(remoteOnlyRef)
    // sharedRef should not be duplicated
    const ids = merged.scriptureRefs.map((r) => r.passageId)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('mood: one null → take non-null, no conflict', () => {
    const local = makeEntry({ mood: null, moodLabel: null })
    const remote = makeRemoteEntry({ mood: 3, moodLabel: 'peaceful' })
    const { merged, moodConflict } = mergeEntries(local, remote, 'Remote Device')

    expect(merged.mood).toBe(3)
    expect(merged.moodLabel).toBe('peaceful')
    expect(moodConflict).toBeNull()
  })

  it('mood: local set, remote null → keep local, no conflict', () => {
    const local = makeEntry({ mood: 4, moodLabel: 'grateful' })
    const remote = makeRemoteEntry({ mood: null, moodLabel: null })
    const { merged, moodConflict } = mergeEntries(local, remote, 'Remote Device')

    expect(merged.mood).toBe(4)
    expect(merged.moodLabel).toBe('grateful')
    expect(moodConflict).toBeNull()
  })

  it('mood: both null → null, no conflict', () => {
    const local = makeEntry({ mood: null, moodLabel: null })
    const remote = makeRemoteEntry({ mood: null, moodLabel: null })
    const { merged, moodConflict } = mergeEntries(local, remote, 'Remote Device')

    expect(merged.mood).toBeNull()
    expect(merged.moodLabel).toBeNull()
    expect(moodConflict).toBeNull()
  })

  it('mood: both same → keep, no conflict', () => {
    const local = makeEntry({ mood: 2, moodLabel: 'weary' })
    const remote = makeRemoteEntry({ mood: 2, moodLabel: 'weary' })
    const { merged, moodConflict } = mergeEntries(local, remote, 'Remote Device')

    expect(merged.mood).toBe(2)
    expect(merged.moodLabel).toBe('weary')
    expect(moodConflict).toBeNull()
  })

  it('mood: both differ → keep local in merged, moodConflict non-null with remote values and device label', () => {
    const local = makeEntry({ mood: 5, moodLabel: 'joyful' })
    const remote = makeRemoteEntry({ mood: 3, moodLabel: 'peaceful' })
    const { merged, moodConflict } = mergeEntries(local, remote, 'Remote MacBook')

    // Keep local mood
    expect(merged.mood).toBe(5)
    expect(merged.moodLabel).toBe('joyful')

    // Conflict should record remote values and device label
    expect(moodConflict).not.toBeNull()
    expect(moodConflict?.remoteMood).toBe(3)
    expect(moodConflict?.remoteMoodLabel).toBe('peaceful')
    expect(moodConflict?.remoteDeviceLabel).toBe('Remote MacBook')
  })

  it('createdAt = min of local/remote', () => {
    const local = makeEntry({ createdAt: '2026-05-01T10:00:00.000Z' })
    const remote = makeRemoteEntry({ createdAt: '2026-05-01T08:00:00.000Z' })
    const { merged } = mergeEntries(local, remote, 'Remote Device')

    // remote createdAt is earlier
    expect(merged.createdAt).toBe('2026-05-01T08:00:00.000Z')
  })

  it('createdAt = local when local is earlier', () => {
    const local = makeEntry({ createdAt: '2026-05-01T07:00:00.000Z' })
    const remote = makeRemoteEntry({ createdAt: '2026-05-01T10:00:00.000Z' })
    const { merged } = mergeEntries(local, remote, 'Remote Device')

    expect(merged.createdAt).toBe('2026-05-01T07:00:00.000Z')
  })

  it('updatedAt = after merge time (close to Date.now)', () => {
    const before = new Date().toISOString()
    const local = makeEntry()
    const remote = makeRemoteEntry()
    const { merged } = mergeEntries(local, remote, 'Remote Device')
    const after = new Date().toISOString()

    expect(merged.updatedAt >= before).toBe(true)
    expect(merged.updatedAt <= after).toBe(true)
  })

  it('updatedAt = mocked Date.now when using fake timers', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-05-12T12:00:00.000Z'))

    const local = makeEntry()
    const remote = makeRemoteEntry()
    const { merged } = mergeEntries(local, remote, 'Remote Device')

    expect(merged.updatedAt).toBe('2026-05-12T12:00:00.000Z')
    vi.useRealTimers()
  })

  it('wordCount recomputed from merged body text (not sum of local+remote)', () => {
    const local = makeEntry({
      content: {
        type: 'doc',
        content: [{ type: 'paragraph', content: [{ type: 'text', text: 'one two' }] }],
      },
      wordCount: 2,
    })
    const remote = makeRemoteEntry({
      content: {
        type: 'doc',
        content: [{ type: 'paragraph', content: [{ type: 'text', text: 'three four five' }] }],
      },
      wordCount: 3,
    })
    const { merged } = mergeEntries(local, remote, 'Remote Device')

    // Should not be 2 + 3 = 5; the separator text adds tokens too
    // The merged doc has "one two", the separator text, and "three four five"
    // Just verify it's a computed positive value, not 5 (sum)
    expect(merged.wordCount).toBeGreaterThan(0)
    expect(merged.wordCount).not.toBe(2 + 3)
  })

  it('searchText rebuilt and contains merged body text tokens', () => {
    const local = makeEntry({
      content: {
        type: 'doc',
        content: [{ type: 'paragraph', content: [{ type: 'text', text: 'gratitude today' }] }],
      },
      tags: ['faith'],
    })
    const remote = makeRemoteEntry({
      content: {
        type: 'doc',
        content: [{ type: 'paragraph', content: [{ type: 'text', text: 'peace and joy' }] }],
      },
      tags: ['hope'],
    })
    const { merged } = mergeEntries(local, remote, 'Remote Device')

    expect(merged.searchText).toContain('gratitude')
    expect(merged.searchText).toContain('peace')
    // tags are included in searchText
    expect(merged.searchText).toContain('faith')
    expect(merged.searchText).toContain('hope')
  })

  it('schemaVersion, app, date come from local', () => {
    const local = makeEntry({
      schemaVersion: 1,
      app: 'quiet-dwelling',
      date: '2026-05-01',
    })
    const remote = makeRemoteEntry({
      date: '2026-05-01',
    })
    const { merged } = mergeEntries(local, remote, 'Remote Device')

    expect(merged.schemaVersion).toBe(1)
    expect(merged.app).toBe('quiet-dwelling')
    expect(merged.date).toBe('2026-05-01')
  })
})
