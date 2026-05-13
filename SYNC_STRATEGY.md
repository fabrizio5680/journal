# Sync Strategy — Hardening Plan for Cross-Device Safety

**Status:** Draft RFC
**Owner:** Fabrizio
**Scope:** Google Drive sync layer, cross-tab/cross-device coherence, conflict resolution, auth lifecycle
**Goal:** Eliminate silent data-loss paths in the Drive sync system. Every code path must either succeed atomically, fail loudly, or queue a recovery action the user can see.

---

## 1. Problem Statement

The current sync system is coherent for **single-device, single-tab** use. The exploration surfaced concrete holes when:

- **Two tabs** edit the same entry (last-write-wins, silent mood/tag loss).
- **Two devices** edit offline and reconnect (positional merge produces nonsensical content order).
- **Manifest push fails** silently — next backfill returns stale or empty metadata.
- **Token state diverges** across tabs/Firestore/localStorage during refresh races.
- **Delta poll runs during backfill** — entries can duplicate or be skipped.
- **Mood-conflict state has no timeout** — entries can wedge in `merge-pending-mood` indefinitely.
- **Device identity resets** on localStorage clear → backup attribution is misleading.
- **Empty entries** stay local-only but later metadata-only hydration on Device B produces unloadable rows.

This document specifies six new deep modules and a migration sequence to close these holes.

---

## 2. Architectural Principles

1. **Local cache is the source of truth.** Drive is durable backup + transport between devices. Never trust Drive over local without explicit reconciliation.
2. **Every cross-boundary write is atomic or compensable.** Fire-and-forget is banned for manifest, conflict backups, and entry pushes. Failures must surface as user-visible state.
3. **Every entry write carries a generation.** Generations are persisted in IndexedDB, not just in-memory. Two-tab and two-device writes detect conflict at the storage boundary, not at the UI.
4. **Token state has one owner.** A single in-memory session synchronised via BroadcastChannel. Firestore is for audit/server-side reconnect signalling, not for runtime token decisions.
5. **User must see failure.** Silent retries are bounded; after the bound, surface a recovery card. No "synced" badge unless we have a Drive ack.

---

## 3. Module Plan Overview

```
┌────────────────────────────────────────────────────────────┐
│                       Application Layer                    │
│  (EntryPage, EntryEditor, banners, history, insights)      │
└────────────────────────────────────────────────────────────┘
              │                                  │
              ▼                                  ▼
┌──────────────────────────┐      ┌──────────────────────────┐
│   useEntry / hooks       │      │   ConflictResolver  (3)  │◀── UI banners
└──────────────────────────┘      └──────────────────────────┘
              │                                  ▲
              ▼                                  │
┌──────────────────────────────────────────────────────────────┐
│              WriteCoordinator   (1)                          │
│   (generation-gated save path, single-flight per date)       │
└──────────────────────────────────────────────────────────────┘
              │                                  │
              ▼                                  ▼
┌──────────────────────────┐      ┌──────────────────────────┐
│   EntryHydration  (6)    │      │   SyncSession    (2)     │
│   (read + recovery)      │      │   (push+manifest+poll)   │
└──────────────────────────┘      └──────────────────────────┘
              │                                  │
              ▼                                  ▼
┌──────────────────────────────────────────────────────────────┐
│              DriveTokenSession   (4)                         │
│   (single-flight refresh, cross-tab coordination)            │
└──────────────────────────────────────────────────────────────┘
              │
              ▼
┌──────────────────────────────────────────────────────────────┐
│              DeviceFingerprint   (5)                         │
│   (account+browser stable identity)                          │
└──────────────────────────────────────────────────────────────┘
```

Build order: **5 → 4 → 1 → 2 → 6 → 3** (foundations first, then write/read, then conflict UX).

---

## 4. Module 5 — `DeviceFingerprint`

### Goal

Produce a stable, account-bound device identifier that survives localStorage clear and distinguishes same-machine browsers without misattribution.

### Constraints

- Must not require server round-trip on every call (cached, lazy-rotated).
- Must include account ID so logging out + back in on the same browser stays the same device.
- Must distinguish Chrome vs Safari on same machine.
- Must degrade gracefully when crypto APIs unavailable.

### Interface

```ts
export interface DeviceFingerprint {
  deviceId: string // stable per (account, browser, install)
  deviceLabel: string // human-readable, e.g. "Fabrizio's MacBook · Chrome"
  generatedAt: number
}

export function getDeviceFingerprint(userId: string): Promise<DeviceFingerprint>
export function refreshDeviceLabel(userId: string, hint?: string): Promise<DeviceFingerprint>
```

### Composition

`deviceId = sha256(userId + browserHash + installSalt)` where:

- `userId` — Firebase UID.
- `browserHash` — `navigator.userAgent` + `navigator.platform` + screen dimensions (low-entropy but stable per browser/install).
- `installSalt` — random 128-bit value persisted in **IndexedDB** (not localStorage) so it survives localStorage clear but resets on full storage wipe.

Persisted record in IndexedDB store `deviceIdentity`: `{ userId, deviceId, label, installedAt }`.

### Replaces

- `deviceIdentity.ts` (kept as a thin shim during migration).
- All `localStorage["device_identity"]` reads.

### Tests

- Same userId + same browser + cleared localStorage → same `deviceId`.
- Same userId + different browser (UA changed) → different `deviceId`.
- Different userId on same browser → different `deviceId`.
- Concurrent first-call from two tabs → same `deviceId` (IndexedDB key uniqueness enforces this).

---

## 5. Module 4 — `DriveTokenSession`

### Goal

One owner of Drive access-token state per (userId, browser). Cross-tab refresh coordination. Authoritative `tokenStatus` derived from local session, not Firestore.

### Constraints

- Refresh must be single-flight across tabs (BroadcastChannel).
- Network call to refresh happens once per expiry window even with N tabs.
- Scope must be re-validated at least once per session boot and after any 403 from Drive.
- A failed refresh must move status to `reconnect` and broadcast to all tabs.
- Must coexist with Cloud Functions broker (refresh-token never lives in browser).

### Interface

```ts
export interface AccessToken {
  token: string
  expiresAt: number // epoch ms
  scopes: string[]
}

export type TokenStatus = 'connected' | 'refreshing' | 'reconnect' | 'disconnected'

export interface DriveTokenSession {
  getToken(): Promise<AccessToken> // throws TokenUnavailable on reconnect
  status(): TokenStatus
  onStatusChange(listener: (s: TokenStatus) => void): () => void
  invalidate(reason: 'expired-401' | 'forbidden-403' | 'manual'): void
  destroy(): void
}

export function openDriveTokenSession(userId: string): DriveTokenSession
```

### Implementation outline

- In-memory cache: `{ token, expiresAt, scopes }`.
- BroadcastChannel `drive-token-<userId>`:
  - `{ type: 'refresh-start' }` — tab announces it will refresh; others wait up to 5s for `refresh-done`.
  - `{ type: 'refresh-done', token, expiresAt, scopes }` — winner broadcasts result.
  - `{ type: 'refresh-fail', reason }` — winner broadcasts failure.
  - `{ type: 'invalidate', reason }` — any tab signals.
- Scope check: on session boot and after any 403, call a lightweight `drive.about.get?fields=user` and assert `200`. On `403`, set status `reconnect` and broadcast.
- Firestore `storageTokenStatus` becomes **derived view**, not authority. Written only by Cloud Function broker on actual refresh-token loss.

### Replaces

- `googleDriveAuth.ts` (gut and rewrite).
- Direct reads of `storageTokenStatus` from Firestore in app code (replace with `session.status()`).

### Tests

- Two tabs hit `getToken()` simultaneously when token expired → one network refresh, both receive new token.
- 401 mid-upload → `invalidate('expired-401')` → next `getToken()` triggers refresh → upload retried once.
- Refresh fails (refresh-token revoked) → status `reconnect` broadcast to all tabs within 100ms.
- Scope revoked between sessions → first Drive call returns 403 → session moves to `reconnect`.

---

## 6. Module 1 — `WriteCoordinator`

### Goal

Single boundary for entry writes. Detects same-entry contention across tabs and devices via persisted generation. Save path returns one of: `committed`, `stale` (newer write exists), or `conflict-detected` (remote diverged).

### Constraints

- Generation persisted in IndexedDB as part of the entry row (`localGen: number`).
- Cross-tab notification via BroadcastChannel `entry-writes-<userId>`.
- Save is **always** generation-checked; no path bypasses.
- Must support metadata-only saves (no content) without bumping generation if content unchanged.
- Empty-entry guard moves from `EntryRepository` into here, with a clear `EntryState` discriminator.

### Interface

```ts
export type EntryState =
  | { kind: 'empty' } // no content/mood/tags
  | { kind: 'draft'; entry: Entry } // has content, not yet persisted
  | { kind: 'committed'; entry: Entry; gen: number }

export interface SaveRequest {
  date: string
  baseGen: number // generation caller observed
  changes: Partial<Entry>
  origin: 'user-edit' | 'merge-result' | 'remote-pull'
}

export type SaveResult =
  | { kind: 'committed'; entry: Entry; gen: number }
  | { kind: 'stale'; current: Entry; currentGen: number } // caller must re-read and retry
  | { kind: 'conflict'; local: Entry; remote: Entry; ours: number; theirs: number }

export interface WriteCoordinator {
  read(date: string): Promise<EntryState>
  save(req: SaveRequest): Promise<SaveResult>
  subscribe(date: string, fn: (s: EntryState) => void): () => void
}
```

### Implementation outline

- IndexedDB `entries` store gains `localGen: number` and `remoteRevId: string | null` columns.
- `save()`:
  1. Open IndexedDB transaction (readwrite, `entries` + `metadata`).
  2. Read current row.
  3. If `currentGen !== req.baseGen` → return `{ kind: 'stale', ... }`.
  4. Apply changes, increment `localGen`.
  5. Commit transaction.
  6. Broadcast `{ type: 'entry-changed', date, gen }` to other tabs.
  7. Enqueue push via `SyncSession.enqueue(date)` if non-empty.
- Empty entries return `{ kind: 'empty' }` from `read()` and never reach the push queue.
- `useEntry` becomes a thin React adapter over `subscribe` + `save`.

### Migration notes

- Add `localGen` column to IndexedDB schema (version bump).
- Backfill existing rows with `localGen: 1`.
- During transition, `EntryRepository.saveEntry` becomes a wrapper calling `WriteCoordinator.save` until all callers migrate.

### Tests

- Two tabs save same entry within 50ms → first gets `committed`, second gets `stale` and retries against new gen.
- Save with `origin: 'user-edit'` after remote pull updated entry → `stale` returned, hook re-reads and merges in-memory.
- Empty entry save → no enqueue, no `entry-changed` broadcast.
- BroadcastChannel disabled (Safari private mode) → falls back to `storage` event polling; behaviour identical but with 200ms latency.

---

## 7. Module 2 — `SyncSession`

### Goal

Atomic upload of (entry + manifest update + delta-token advance). Push, manifest, and poll share one session abstraction so ordering and retry are explicit.

### Constraints

- Entry push and manifest update either both succeed or the failure is queued with a visible state.
- Delta poll must not run while a backfill is active for the same user.
- Manifest must not be downgraded by a stale device (timestamp check before overwrite).
- On conflict (HTTP 412 or revision mismatch), the entry is handed to `ConflictResolver`, not silently merged inside the session.

### Interface

```ts
export interface PushOutcome {
  kind: 'pushed' | 'queued' | 'conflict'
  remoteRevId?: string
  conflict?: { local: Entry; remote: Entry }
}

export interface SyncSession {
  enqueue(date: string): void
  flush(): Promise<void> // best-effort, awaitable
  poll(opts?: { force?: boolean }): Promise<{ applied: number; remaining: number }>
  status(): {
    queueDepth: number
    inFlight: string[]
    lastSuccessAt: number | null
    lastFailure: { date: string; reason: string; at: number } | null
  }
  onStatusChange(listener: (s: ReturnType<SyncSession['status']>) => void): () => void
}

export function openSyncSession(deps: {
  userId: string
  token: DriveTokenSession
  cache: LocalEntryCache
  device: DeviceFingerprint
}): SyncSession
```

### Implementation outline

- **Push pipeline (per entry):**
  1. Read entry + `localGen` from cache.
  2. Call Drive `files.update` (or `files.create`) with `If-Match: remoteRevId` precondition where available.
  3. On 412 / revision mismatch → fetch remote entry, return `{ kind: 'conflict', ... }`, route to `ConflictResolver`.
  4. On success → update local `remoteRevId`, then **synchronously** push manifest delta (single-entry patch, not full rewrite).
  5. Manifest update uses Drive's `files.update` with conditional `If-Match` on manifest's own revision.
  6. If manifest update fails → record `lastFailure`, mark entry `manifest-stale`, retry on next `flush()`.
- **Manifest:**
  - Becomes a CRDT-friendly structure: `{ entries: Record<date, ManifestEntry>, version: number, updatedAt: number, updatedBy: deviceId }`.
  - Patch operations carry `(date, op: 'set'|'delete', value)`. Conflicting patches resolve by `updatedAt` then `deviceId` lexicographic order.
  - Full-rewrite path kept as fallback when patch hits HTTP 412 three times.
- **Backfill ↔ Poll mutex:**
  - Single `Promise<void>` lock per userId. `poll()` awaits backfill before proceeding. Backfill writes through `WriteCoordinator.save` with `origin: 'remote-pull'` so generation tracking is unified.
- **Manifest authority:**
  - On boot, fetch manifest, compute diff against local metadata. Entries present in manifest but missing locally → fetch. Entries local but absent from manifest → confirm with `files.list` before assuming deletion (defends against partial manifests).

### Replaces

- `syncCoordinator.ts` (rewrite).
- `deltaPoll.ts` (becomes `session.poll()` internals).
- `providerConnection.backfillFromManifest` (becomes `session.boot()` internals).

### Tests

- Push succeeds, manifest write fails → entry shows `manifest-stale`; next `flush()` repairs.
- Two devices push different entries concurrently → both manifest patches apply (CRDT merge).
- Backfill in progress, `poll()` invoked → poll awaits backfill; no duplicates in cache.
- 412 on entry push → routed to `ConflictResolver`, no silent merge.
- Manifest fetched on boot is older than local metadata index → local index wins, manifest republished.

---

## 8. Module 6 — `EntryHydration`

### Goal

Single entry-load path that handles "manifest-only" rows, retries Drive fetches with backoff, and surfaces unrecoverable failures as visible user actions.

### Constraints

- A `date` always maps to one of: `present` (full content available), `metadata-only` (known to exist, content pending), `missing` (not on Drive, not local), `failed` (transient failure with retry available).
- Empty entries are pruned from metadata on hydration (closes the "cross-device ghost entry" hole).
- Hydration must be idempotent; calling twice concurrently must coalesce to one Drive fetch.

### Interface

```ts
export type HydrationState =
  | { kind: 'present'; entry: Entry; gen: number }
  | {
      kind: 'metadata-only'
      metadata: EntryMetadata
      reason: 'pending-download' | 'awaiting-network'
    }
  | { kind: 'missing' }
  | { kind: 'failed'; metadata: EntryMetadata; lastError: string; retryable: boolean }

export interface EntryHydration {
  get(date: string): Promise<HydrationState>
  retry(date: string): Promise<HydrationState>
  subscribe(date: string, fn: (s: HydrationState) => void): () => void
}
```

### Implementation outline

- Hydration cache keyed by date with in-flight promise dedup.
- On `metadata-only`, hydration fires Drive fetch through `SyncSession`. On 404 → metadata pruned, status `missing`.
- On transient failure, exponential backoff up to 5 attempts. After that, status `failed` until user invokes `retry`.
- Empty-entry prune happens here: after content fetch, if `wordCount === 0 && tags.length === 0 && !mood && !scriptureRefs.length`, delete metadata row and mark `missing`.

### Replaces

- Ad-hoc null-checks on entry loads in `useEntry`, `EntryPage`, `InsightsPage`, `SearchModal`.

### Tests

- Manifest-only entry → `get()` triggers fetch → returns `present`.
- Drive returns 404 for known manifest entry → status `missing`, metadata pruned.
- Two callers `get(date)` simultaneously → one network call.
- Empty entry on Device A → Device B hydration prunes the orphan metadata row.

---

## 9. Module 3 — `ConflictResolver`

### Goal

State machine that owns conflict lifecycle from detection through user resolution (or timeout). UI banners are subscribers, not state owners. Mood and content are resolved separately so partial automation is possible.

### Constraints

- Body merge must produce a structure callers can render with explicit "remote vs local" markers, not just `<hr>` separators.
- Mood conflict requires explicit user choice; **silent adoption is banned** even when local mood is null (current behaviour at [mergeEngine.ts:76-80](src/lib/storage/mergeEngine.ts#L76-L80)).
- Conflict backups must be **awaited and verified** before merge is accepted.
- Pending resolutions persist across reloads. A device that crashes mid-resolution finds the prompt waiting on next boot.

### Interface

```ts
export type ConflictKind = 'content' | 'mood' | 'tags' | 'scripture'

export interface ConflictRecord {
  date: string
  detectedAt: number
  remoteDevice: string
  kinds: ConflictKind[]
  proposed: Entry // pre-merged best-guess
  local: Entry
  remote: Entry
  backupRef: string | null // Drive file ID of remote backup, must be non-null before resolve
}

export type Resolution =
  | { kind: 'accept-proposed' }
  | { kind: 'keep-local' }
  | { kind: 'keep-remote' }
  | { kind: 'custom'; entry: Entry }

export interface ConflictResolver {
  pending(): Promise<ConflictRecord[]>
  record(date: string, local: Entry, remote: Entry): Promise<ConflictRecord>
  resolve(date: string, resolution: Resolution): Promise<void>
  subscribe(fn: (records: ConflictRecord[]) => void): () => void
}
```

### Implementation outline

- Persisted in IndexedDB store `conflicts` keyed by `date`.
- On `record()`:
  1. Compute kinds (content diff, mood diff, tags symmetric diff, scripture diff).
  2. Upload remote backup via `SyncSession`; wait for confirmation. If backup fails, record stays in `detected` state and surfaces as a blocking banner.
  3. Build `proposed` entry with deterministic merge:
     - Content → ordered diff with anchors (paragraph IDs), not naive concat. See Appendix A.
     - Tags → union.
     - Scripture refs → union (existing behaviour preserved).
     - Mood → **null** in `proposed` when conflict, forcing user choice.
- `resolve()` writes through `WriteCoordinator.save({ origin: 'merge-result' })`. Mood conflicts that have not been explicitly chosen are rejected.
- No timeout-auto-resolve in v1; instead a persistent banner. Auto-resolution can be added later behind a preference.

### Replaces

- `mergeEngine.ts` (becomes internal helper).
- Mood-conflict UI state currently in `EntryPage` and banner components.

### Tests

- Conflict detected → backup upload fails → record stays in `detected`; user sees blocking banner; no merge accepted.
- Mood conflict with local=null, remote=3 → `proposed.mood === null`; resolve cannot complete with `accept-proposed` until user explicitly chooses.
- Reload mid-resolution → conflict still pending on boot.
- Two conflicts on same date queued → second supersedes first only after first resolved (FIFO).

---

## 10. Cross-Module Concerns

### 10.1 Schema migration

Bump IndexedDB schema to v2. Migration script:

1. Add `localGen INTEGER DEFAULT 1` to `entries`.
2. Add `remoteRevId TEXT` to `entries`.
3. Create `conflicts` store.
4. Create `deviceIdentity` store.
5. Backfill `localGen=1` for all existing rows.

Manifest schema v2 in Drive:

- New shape: `{ schemaVersion: 2, version: number, updatedAt: number, updatedBy: deviceId, entries: { [date]: ManifestEntry } }`.
- v1 manifests auto-upgraded on first read; old clients reading v2 fall back to full backfill since unknown fields cause the version guard at [entryRepository.ts:62-69](src/lib/storage/entryRepository.ts#L62-L69) to reject.
- Document old-client behaviour explicitly: a v1 client coexisting with a v2 client will not corrupt data but will not see new entries until upgraded.

### 10.2 Test scaffolding

- New harness `tests/harness/fakeBrowserEnv.ts` providing per-test BroadcastChannel mock, IndexedDB reset, fake `navigator.onLine`.
- Multi-tab tests use two `WriteCoordinator` instances against shared IndexedDB.
- Multi-device tests use two full module stacks against `fakeGoogleDriveBackend`.
- Chaos tests inject failures at: token refresh, entry push, manifest push, conflict backup, delta poll.

### 10.3 Observability

Add a minimal sync-log structure to IndexedDB (`syncLog` store, ring buffer ~500 events):

```ts
{ at, kind: 'push'|'pull'|'conflict'|'token'|'manifest', date?, outcome, durationMs, error? }
```

Surface in Settings → Diagnostics so support requests are reproducible. Never log entry content.

### 10.4 Security review checkpoints

Before merging each module:

- **DriveTokenSession:** verify no refresh-token leaks to browser; Firestore rules still deny `users/{uid}/private/**`.
- **WriteCoordinator / SyncSession:** verify entry content never written to Firestore (audit `setDoc` callsites).
- **ConflictResolver:** backup file ACLs match owning user; backup paths do not leak between users.
- **EntryHydration:** failed-state error strings do not echo back content snippets.

---

## 11. Migration Sequence

Order chosen so each step lands behind tests with the previous foundation in place.

| Step | Module                      | Risk   | Rollback                                              |
| ---- | --------------------------- | ------ | ----------------------------------------------------- |
| 1    | `DeviceFingerprint`         | Low    | Revert; existing `deviceIdentity` still works         |
| 2    | `DriveTokenSession`         | Medium | Feature flag `VITE_NEW_TOKEN_SESSION` defaults off    |
| 3    | IndexedDB v2 migration      | Medium | Migration is additive; v1 read paths still work       |
| 4    | `WriteCoordinator`          | High   | Feature flag; `useEntry` keeps old path until cutover |
| 5    | `SyncSession` push path     | High   | Flag-gated; old `syncCoordinator` retained 1 release  |
| 6    | `SyncSession` poll/manifest | High   | Same flag                                             |
| 7    | `EntryHydration`            | Medium | Wraps existing reads; can no-op the new behaviour     |
| 8    | `ConflictResolver`          | Medium | Replaces `mergeEngine`; old engine kept as fallback   |
| 9    | Remove old modules          | Low    | After 2 releases without flag-off usage               |

Each step lands as a separate PR with: tests, feature flag, migration notes, rollback recipe.

---

## 12. Appendix A — Content Merge Strategy

Replace naive `[...local.content, hr, ...remote.content]` with an anchored merge:

1. **Anchor IDs:** Every Tiptap paragraph/heading gets a stable `id` attribute (random UUID) assigned on creation. Stored in Tiptap JSON.
2. **Diff:** Compare local vs remote at anchor level.
   - Same anchor, same content → keep.
   - Same anchor, different content → keep both, mark as `<edit-conflict>` block.
   - Local-only anchor → keep at original position.
   - Remote-only anchor → insert at original position (relative to surrounding anchors).
3. **Rendering:** New Tiptap node `EditConflictMark` renders both versions side-by-side with "Keep local / Keep remote / Keep both" controls. Resolution writes back through `WriteCoordinator`.

This requires a Tiptap schema migration: anchor IDs backfilled lazily on first edit after upgrade. Old entries without anchors fall back to current concat behaviour with an explicit "merged" banner.

---

## 13. Open Questions

1. **Drive Changes API quota** under aggressive multi-device polling — model expected RPS, add server-driven backoff hints if needed.
2. **Manifest size ceiling** — at ~10K entries, manifest is ~2 MB; need pagination or sharding plan before that point.
3. **Anchor ID migration cost** — every existing entry rewrites on first edit. Acceptable? Or backfill on idle?
4. **Mood conflict UX** — modal vs persistent banner vs inline. Needs design review.
5. **Should `keep-local` resolution still write a conflict backup of the remote?** Default yes; confirm with user.

---

## 14. Acceptance Criteria

The plan is "done" when:

- Two tabs editing the same entry never silently overwrite each other's mood/tags.
- Two devices editing offline produce either a merged entry with explicit conflict markers or a queued conflict the user must resolve.
- Manifest push failure produces a user-visible `manifest-stale` state, never silent data divergence.
- Token refresh races across tabs result in one network call.
- Scope revocation surfaces within one Drive operation, not after multiple silent failures.
- Empty entries created on Device A do not appear as broken/unloadable on Device B.
- All new modules have boundary tests covering the failure modes enumerated above.

---

_End of strategy document._
