import { createEntryFile, toEntry } from './entryFormat'
import { localEntryCache } from './localEntryCache'
import { syncCoordinator } from './syncCoordinator'
import type { EntryState, WriteSaveRequest, WriteSaveResult } from './types'

type EntryListener = (state: EntryState) => void
type Message = { type: 'entry-changed'; userId: string; date: string; gen: number }

function isEmptyEntry(input: {
  wordCount: number
  tags: string[]
  mood: unknown
  scriptureRefs?: unknown[]
}) {
  return (
    input.wordCount === 0 &&
    input.tags.length === 0 &&
    input.mood == null &&
    (input.scriptureRefs?.length ?? 0) === 0
  )
}

function channelName(userId: string) {
  return `entry-writes-${userId}`
}

export function openWriteCoordinator(userId: string) {
  const listeners = new Map<string, Set<EntryListener>>()
  const storageKey = channelName(userId)
  const channel =
    typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel(channelName(userId)) : null

  async function emit(date: string) {
    const subscribers = listeners.get(date)
    if (!subscribers?.size) return
    const state = await read(date)
    subscribers.forEach((listener) => listener(state))
  }

  channel?.addEventListener('message', (event: MessageEvent<Message>) => {
    if (event.data?.type === 'entry-changed' && event.data.userId === userId) {
      void emit(event.data.date)
    }
  })

  const onStorage = (event: StorageEvent) => {
    if (event.key !== storageKey || !event.newValue) return
    try {
      const message = JSON.parse(event.newValue) as Message
      if (message.type === 'entry-changed' && message.userId === userId) {
        void emit(message.date)
      }
    } catch {
      // Ignore malformed notifications from older tabs.
    }
  }

  if (!channel && typeof window !== 'undefined') {
    window.addEventListener('storage', onStorage)
  }

  function publish(date: string, gen: number) {
    const message: Message = { type: 'entry-changed', userId, date, gen }
    if (channel) {
      channel.postMessage(message)
      return
    }
    try {
      localStorage.setItem(storageKey, JSON.stringify({ ...message, at: Date.now() }))
    } catch {
      // Storage may be unavailable in private browsing; local emit still runs.
    }
  }

  async function read(date: string): Promise<EntryState> {
    const snapshot = await localEntryCache.getEntrySnapshot(userId, date)
    if (!snapshot.entry || isEmptyEntry(snapshot.entry)) return { kind: 'empty' }
    return { kind: 'committed', entry: toEntry(snapshot.entry), gen: snapshot.localGen }
  }

  async function save(req: WriteSaveRequest): Promise<WriteSaveResult> {
    const snapshot = await localEntryCache.getEntrySnapshot(userId, req.date)
    const entry = createEntryFile(req.date, req.changes, snapshot.entry ?? undefined)
    const shouldSync = syncCoordinator.isConnectedOnDevice(userId) && !isEmptyEntry(entry)
    const result = await localEntryCache.commitEntry(
      userId,
      entry,
      shouldSync ? 'sync-pending' : 'saved-local',
      {
        baseGen: req.baseGen,
        bumpGeneration: 'content' in req.changes || 'contentText' in req.changes,
      },
    )

    if (result.kind === 'stale') {
      return {
        kind: 'stale',
        current: toEntry(result.current),
        metadata: result.metadata,
        currentGen: result.currentGen,
      }
    }

    if (!isEmptyEntry(entry)) {
      publish(req.date, result.localGen)
      void emit(req.date)
    }

    if (shouldSync) void syncCoordinator.enqueue(userId, req.date)
    return {
      kind: 'committed',
      entry: toEntry(entry),
      metadata: result.metadata,
      gen: result.localGen,
    }
  }

  function subscribe(date: string, fn: EntryListener): () => void {
    const set = listeners.get(date) ?? new Set<EntryListener>()
    set.add(fn)
    listeners.set(date, set)
    void read(date).then(fn)
    return () => {
      set.delete(fn)
      if (set.size === 0) listeners.delete(date)
    }
  }

  return {
    read,
    save,
    subscribe,
    destroy: () => {
      channel?.close()
      if (!channel && typeof window !== 'undefined') {
        window.removeEventListener('storage', onStorage)
      }
    },
  }
}
