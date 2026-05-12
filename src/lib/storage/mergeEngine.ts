import { buildSearchText } from './entryFormat'
import type { EntryFile, EntryMetadata } from './types'

import type { ScriptureRef } from '@/types'

export interface MergeResult {
  merged: EntryFile
  moodConflict: EntryMetadata['moodConflict']
}

function countWords(text: string): number {
  const trimmed = text.trim()
  return trimmed ? trimmed.split(/\s+/).length : 0
}

function tiptapText(content: object): string {
  // Recursively extract text nodes from Tiptap JSON
  const node = content as {
    type?: string
    text?: string
    content?: unknown[]
  }
  if (node.text) return node.text
  if (!node.content) return ''
  return (node.content as object[]).map((child) => tiptapText(child)).join(' ')
}

function dedupeScriptureRefs(local: ScriptureRef[], remote: ScriptureRef[]): ScriptureRef[] {
  const seen = new Set(local.map((r) => r.passageId))
  const additions = remote.filter((r) => !seen.has(r.passageId))
  return [...local, ...additions]
}

export function mergeEntries(
  local: EntryFile,
  remote: EntryFile,
  remoteDeviceLabel: string,
): MergeResult {
  // Build separator paragraph
  const ts = remote.updatedAt
  const separatorParagraph = {
    type: 'paragraph',
    content: [
      {
        type: 'text',
        text: `↑ This device  •  ↓ Synced from ${remoteDeviceLabel} at ${ts}`,
      },
    ],
  }
  const horizontalRuleNode = { type: 'horizontalRule' }

  const localDoc = local.content as { type: string; content?: unknown[] }
  const remoteDoc = remote.content as { type: string; content?: unknown[] }

  const mergedContent = {
    type: 'doc',
    content: [
      ...(localDoc.content ?? []),
      horizontalRuleNode,
      separatorParagraph,
      ...(remoteDoc.content ?? []),
    ],
  }

  // Merge tags (local order first, dedup)
  const mergedTags = Array.from(new Set([...local.tags, ...remote.tags]))

  // Merge scriptureRefs (local order first, dedup by passageId)
  const mergedScriptureRefs = dedupeScriptureRefs(local.scriptureRefs, remote.scriptureRefs)

  // Determine mood conflict
  let moodConflict: EntryMetadata['moodConflict'] = null
  let mergedMood = local.mood
  let mergedMoodLabel = local.moodLabel

  if (local.mood === null && remote.mood !== null) {
    mergedMood = remote.mood
    mergedMoodLabel = remote.moodLabel
  } else if (local.mood !== null && remote.mood === null) {
    // keep local, no conflict
  } else if (local.mood !== null && remote.mood !== null && local.mood !== remote.mood) {
    // Both set, differ — keep local, record conflict
    moodConflict = {
      remoteMood: remote.mood,
      remoteMoodLabel: remote.moodLabel,
      remoteDeviceLabel,
    }
  } else if (local.mood === null && remote.mood === null) {
    // both null — no conflict
  }
  // If both same — keep local, no conflict (already set)

  // Recompute wordCount from merged body text
  const mergedBodyText = tiptapText(mergedContent)
  const wordCount = countWords(mergedBodyText)

  // Rebuild searchText
  const searchText = buildSearchText({
    bodyText: mergedBodyText,
    moodLabel: mergedMoodLabel,
    tags: mergedTags,
    scriptureRefs: mergedScriptureRefs,
  })

  // createdAt = min of both
  const createdAt = local.createdAt <= remote.createdAt ? local.createdAt : remote.createdAt

  const merged: EntryFile = {
    schemaVersion: 1,
    app: 'quiet-dwelling',
    date: local.date,
    content: mergedContent,
    searchText,
    mood: mergedMood,
    moodLabel: mergedMoodLabel,
    tags: mergedTags,
    scriptureRefs: mergedScriptureRefs,
    wordCount,
    createdAt,
    updatedAt: new Date().toISOString(),
  }

  return { merged, moodConflict }
}
