import type { EntryDraft, EntryFile, EntryMetadata, SyncStatus } from './types'

import type { Entry } from '@/types'

const EMPTY_DOC = { type: 'doc', content: [] }
const BODY_TOKEN_PREFIXES = ['#mood:', '#tags:', '#scripture:']

export function bodyTextFromSearchText(searchText: string): string {
  return searchText
    .split('\n')
    .filter((line) => !BODY_TOKEN_PREFIXES.some((prefix) => line.startsWith(prefix)))
    .join('\n')
    .trim()
}

export function buildSearchText(input: {
  bodyText: string
  moodLabel: string | null
  tags: string[]
  scriptureRefs: Array<{ reference: string }>
}): string {
  const scriptureText = input.scriptureRefs.map((ref) => ref.reference).filter(Boolean)

  return [
    input.bodyText,
    input.moodLabel ? `#mood: ${input.moodLabel}` : '',
    input.tags.length > 0 ? `#tags: ${input.tags.join(' ')}` : '',
    scriptureText.length > 0 ? `#scripture: ${scriptureText.join(' ')}` : '',
  ]
    .filter(Boolean)
    .join('\n')
}

export function createEntryFile(date: string, draft: EntryDraft, existing?: EntryFile): EntryFile {
  const now = new Date().toISOString()
  const bodyText =
    draft.contentText ??
    (existing ? bodyTextFromSearchText(existing.searchText) : bodyTextFromSearchText(''))
  const mood = draft.mood ?? existing?.mood ?? null
  const moodLabel = draft.moodLabel ?? existing?.moodLabel ?? null
  const tags = draft.tags ?? existing?.tags ?? []
  const scriptureRefs = draft.scriptureRefs ?? existing?.scriptureRefs ?? []

  return {
    schemaVersion: 1,
    app: 'quiet-dwelling',
    date,
    content: draft.content ?? existing?.content ?? EMPTY_DOC,
    searchText: buildSearchText({ bodyText, moodLabel, tags, scriptureRefs }),
    mood,
    moodLabel,
    tags,
    scriptureRefs,
    wordCount: draft.wordCount ?? existing?.wordCount ?? countWords(bodyText),
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  }
}

export function toMetadata(
  entry: EntryFile,
  syncStatus: SyncStatus,
  previous?: EntryMetadata | null,
): EntryMetadata {
  const bodyText = bodyTextFromSearchText(entry.searchText)

  return {
    date: entry.date,
    mood: entry.mood,
    moodLabel: entry.moodLabel,
    tags: entry.tags,
    wordCount: entry.wordCount,
    hasContent: entry.wordCount > 0 || bodyText.length > 0,
    updatedAt: entry.updatedAt,
    provider: previous?.provider,
    providerFileId: previous?.providerFileId,
    lastSeenRevisionId: previous?.lastSeenRevisionId ?? null,
    lastSyncedAt: previous?.lastSyncedAt,
    syncStatus,
    syncError: syncStatus === 'sync-pending' ? undefined : previous?.syncError,
    deletedAt: null,
  }
}

export function toEntry(entry: EntryFile, deleted = false): Entry {
  const bodyText = bodyTextFromSearchText(entry.searchText)

  return {
    date: entry.date,
    content: entry.content,
    contentText: bodyText,
    searchText: entry.searchText,
    mood: entry.mood,
    moodLabel: entry.moodLabel,
    tags: entry.tags,
    scriptureRefs: entry.scriptureRefs,
    wordCount: entry.wordCount,
    deleted,
    deletedAt: null,
    createdAt: entry.createdAt,
    updatedAt: entry.updatedAt,
  }
}

export function entryMatchesRange(date: string, range?: { from?: string; to?: string }) {
  if (range?.from && date < range.from) return false
  if (range?.to && date > range.to) return false
  return true
}

function countWords(text: string): number {
  const trimmed = text.trim()
  return trimmed ? trimmed.split(/\s+/).length : 0
}
