# GDPR Compliance — Quiet Dwelling

> **⚠️ Legal Advice Disclaimer**: This document is a technical compliance assessment based on the
> GDPR text and established regulatory guidance. It does not constitute legal advice. For matters
> involving significant compliance risk or supervisory authority interaction, consult a qualified
> data protection lawyer or your DPO.

---

## 1. System Overview

| Property                   | Value                                                                                          |
| -------------------------- | ---------------------------------------------------------------------------------------------- |
| App name                   | Quiet Dwelling (formerly "Reflect / The Quiet Sanctuary")                                      |
| Domain                     | `thequietdwelling.com`                                                                         |
| Controller                 | Fabrizio Bottaro (sole trader), Republic of Ireland                                            |
| Privacy contact            | `privacy@thequietdwelling.com`                                                                 |
| Lead supervisory authority | Irish Data Protection Commission (DPC) — `dpc.ie`                                              |
| Geographic scope           | Worldwide (UK/EU users primary; other regions accept ToS that recognises EU GDPR as baseline)  |
| Minimum age (Art. 8)       | 16+ (self-attestation at sign-up)                                                              |
| Role                       | Data Controller (Art. 4(7)) for account + service metadata; user is controller of own entries  |
| Firebase project           | `journal-manna`                                                                                |
| Hosting                    | `journal-manna.web.app` (Firebase Hosting); Android distribution via Google Play TWA           |
| Backend                    | Firebase Auth, Firestore, Cloud Functions (Node 22, `europe-west2`), FCM                       |
| Sync storage               | **User's own Google Drive** (`Quiet Dwelling/` folder) — user-owned, app-scoped folder access  |
| Local storage              | IndexedDB (`quiet-dwelling`) — entries + metadata + syncState + deviceIdentity                 |
| Search index               | **None.** Algolia removed. Search runs client-side over IndexedDB.                             |
| Scripture API              | `scripture.api.bible` — no PII transmitted                                                     |
| Auth                       | Google Sign-In only (OAuth 2.0)                                                                |
| Analytics / telemetry      | **None.** No Firebase Analytics, Performance Monitoring, Crashlytics, GA, or third-party SDKs. |
| Pricing                    | Free on web + desktop PWA; paid Android TWA on Google Play (€/$2.99); future paid features TBD |
| Payment processor          | Google Play Billing (Google Commerce Limited, Ireland — merchant of record in EU)              |
| Backup                     | Firestore daily scheduled backups, 7-day retention                                             |

### 1.1 Architectural shift since last audit (2026-05-06)

The app is now **local-first with user-owned cloud sync**. Material changes:

- **Algolia removed.** No third-party search index. No diary content leaves the user's device or
  their own Google Drive.
- **Journal content is NOT stored in Firestore.** Body text, Tiptap JSON, mood, tags, and
  scripture refs live in IndexedDB on the user's device and in JSON files in the user's own
  Google Drive folder (`Quiet Dwelling/entries/`).
- **Google Drive sync uses the data subject's own Drive account.** OAuth `drive.file` scope —
  the app can only access files it creates inside the `Quiet Dwelling/` folder. It cannot read
  the user's other Drive content.
- **Refresh tokens** held in Firestore at `users/{uid}/private/googleDriveOAuth`, accessible only
  to Cloud Functions (client rules deny access).
- **Drive manifest** (`Quiet Dwelling/metadata.json`) holds compact metadata for fast hydration.
  Lives on user's Drive, not Firebase.
- **Cloud Functions broker OAuth only.** No journal content traverses Quiet Dwelling
  infrastructure for storage.
- **Conflict backups** written fire-and-forget to `Quiet Dwelling/conflicts/` on user's Drive.

Net effect: Quiet Dwelling's processor surface area shrank significantly. Special category data
(scripture, mood) no longer leaves user control. Misleading-claim risk on login page drops
correspondingly (see H1).

---

## 2. Personal Data Inventory

### 2.1 Firestore — `users/{uid}` (public sub-tree, client-readable)

| Field                                             | Source                | Classification                       |
| ------------------------------------------------- | --------------------- | ------------------------------------ |
| `displayName`                                     | Google OAuth          | Direct identifier (Art. 4(1))        |
| `email`                                           | Google OAuth          | Direct identifier (Art. 4(1))        |
| `photoURL`                                        | Google OAuth          | Indirect identifier                  |
| Firebase UID (doc ID)                             | Firebase Auth         | Pseudonymous identifier (Recital 26) |
| `reminderTime` (HH:MM)                            | User input            | Behavioural                          |
| `reminderTimezone` (IANA)                         | Browser-derived       | Inferred location                    |
| `reminderEnabled`                                 | User input            | Preference                           |
| `fcmTokens[]`                                     | FCM                   | Device identifiers (Recital 30)      |
| `activeStorageProvider`                           | App                   | Provider connection state            |
| `storageAccountEmail`                             | Google Drive          | Direct identifier (Drive account)    |
| `storageRootFolderId`                             | Google Drive          | Reference to user's Drive folder     |
| `storageConnectedAt` / `storageTokenStatus`       | App                   | Operational metadata                 |
| `storageTokenRefreshedAt` / `storageTokenErrorAt` | App                   | Operational metadata                 |
| `lastEntryDate`, `lastEntrySavedAt`               | App                   | Behavioural / temporal               |
| `consent*` fields                                 | _not yet implemented_ | (see TASK-3)                         |

### 2.2 Firestore — `users/{uid}/private/googleDriveOAuth` (locked, server-only)

| Field          | Classification                                                        |
| -------------- | --------------------------------------------------------------------- |
| `refreshToken` | **Authentication credential — Art. 32 sensitive.** Long-lived secret. |
| `scope`        | Operational                                                           |
| `accountEmail` | Direct identifier                                                     |
| `rootFolderId` | Reference                                                             |
| `updatedAt`    | Operational                                                           |

Firestore rule denies all client access to `users/{uid}/private/**`. Only Cloud Functions
(admin SDK) can read these tokens.

### 2.3 Journal content — User's Google Drive (`Quiet Dwelling/entries/{yyyy}/{yyyy-MM-dd}.json`)

| Field                            | Type                         | Classification                                                |
| -------------------------------- | ---------------------------- | ------------------------------------------------------------- |
| `content`                        | Tiptap JSON                  | Sensitive personal data — diary body                          |
| `searchText`                     | String                       | Sensitive personal data — derived body text + mood/tag tokens |
| `mood` / `moodLabel`             | 1–5 / String                 | **Potentially health data (Art. 9(1))** — emotional state     |
| `tags[]`                         | String[]                     | Personal data — user-defined categories                       |
| `scriptureRefs[]`                | `{ reference, passageId }[]` | **Special category — religious beliefs (Art. 9(1))**          |
| `wordCount`                      | Number                       | Derived personal data                                         |
| `date`, `createdAt`, `updatedAt` | Timestamps                   | Behavioural / temporal                                        |

**Custody**: Files live in the user's own Drive under app-scoped `drive.file` permission. The
controller (Quiet Dwelling) never receives this content on its servers. The user's Drive is
their own controller relationship with Google for the storage substrate, mediated by the app.

### 2.4 Drive manifest — `Quiet Dwelling/metadata.json` (user's Drive)

Compact `ManifestEntry[]`: `{ date, mood, moodLabel, tags, wordCount, providerFileId }`.

- Same controllership status as entries (user-owned Drive).
- Mirrors local metadata index for fast first-paint after a fresh device hydrates.

### 2.5 Drive conflict backups — `Quiet Dwelling/conflicts/{date}-{rev}.json` (user's Drive)

Full `EntryFile` snapshots of the **remote** side at the moment of a merge conflict. Written
fire-and-forget before a merge re-push. Same content sensitivity as entries.

### 2.6 IndexedDB (`quiet-dwelling`) — device-local

| Object store     | Contents                                                                       |
| ---------------- | ------------------------------------------------------------------------------ |
| `entries`        | Full `EntryFile` rows (incl. body, mood, scripture, tags)                      |
| `metadata`       | `EntryMetadata` rows (no body) — keyed by `{userId, date}`                     |
| `syncState`      | Per-user Drive Changes API state: `driveStartPageToken`, folder IDs, last poll |
| `deviceIdentity` | `{ userId, browserHash, installSalt, deviceId, deviceLabel, generatedAt }`     |

`deviceIdentity.deviceId` is `sha256(userId : browserHash : installSalt)`. Browser hash derives
from UA + platform + screen dims. Used for conflict attribution. Stays on device — never
transmitted as a standalone identifier (only embedded in conflict-merge labels written to the
user's own Drive).

### 2.7 localStorage — device-local

| Key                               | Contents                                |
| --------------------------------- | --------------------------------------- |
| `pref_editor_font_size`           | UI preference                           |
| `pref_spellcheck`                 | UI preference                           |
| `fcm_device_token_{uid}`          | FCM device token                        |
| `scripture_{T}_{date}`            | Cached daily verse (no PII)             |
| `google_drive_connection_{uid}`   | Cached provider metadata (no tokens)    |
| `google_drive_disconnected_{uid}` | Device opt-out flag for Drive hydration |

### 2.8 Cloud Functions logs

`sendDailyReminders` writes `userDoc.id` (Firebase UID) to `console.warn`. Logs go to Google
Cloud Logging. UID = pseudonymous identifier under Recital 26.

---

## 3. Lawful Basis Assessment (Art. 6)

| Processing activity                                  | Basis claimed                       | Assessment                                                                            |
| ---------------------------------------------------- | ----------------------------------- | ------------------------------------------------------------------------------------- |
| Core journaling (local IndexedDB storage)            | Contract — Art. 6(1)(b)             | ✅ Necessary for service                                                              |
| User profile (name, email, photo)                    | Contract — Art. 6(1)(b)             | ✅ Necessary for account                                                              |
| Daily reminder notifications                         | Consent — Art. 6(1)(a)              | ⚠️ Browser permission only; no GDPR-grade consent record with withdrawal logged       |
| FCM token storage                                    | Legitimate interests — Art. 6(1)(f) | ⚠️ Reasonable, but undisclosed (no LIA, no privacy notice)                            |
| Google Drive OAuth brokering (Cloud Functions)       | Contract — Art. 6(1)(b)             | ✅ Necessary to operate user-selected sync                                            |
| Refresh-token storage in `users/{uid}/private/`      | Contract — Art. 6(1)(b) + Art. 32   | ✅ Necessary; locked to server access only                                            |
| Drive manifest + conflict backups (user's own Drive) | Contract — Art. 6(1)(b)             | ✅ Stored on user's own storage; user retains control                                 |
| **Scripture refs (religious data) — client-side**    | **No explicit consent recorded**    | 🔴 Special category requires Art. 9(2)(a) explicit consent or another Art. 9(2) basis |
| **Mood data — client-side processing**               | **No explicit consent recorded**    | 🔴 If treated as health/mental-state data under Art. 9, same gap as scripture         |
| Cloud Function logs containing UIDs                  | Legitimate interests — Art. 6(1)(f) | ⚠️ Reasonable; no defined retention                                                   |
| Device fingerprinting (local only)                   | Legitimate interests — Art. 6(1)(f) | ✅ Stays on device; supports conflict attribution; minimal scope                      |

Key shift vs. previous audit: Algolia row gone. Algolia-related Art. 28/44 transfer risk
eliminated. Scripture/mood processing still triggers Art. 9 even though storage is user-owned,
because the controller's client code processes and structures the data.

---

## 4. GDPR Audit Findings

### 4.1 High Severity 🔴

| #   | Article      | Issue                                                 | Detail                                                                                                                                                                                                                                                                                                                                                                                              |
| --- | ------------ | ----------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| H1  | Art. 13      | **No privacy notice**                                 | No privacy policy exists. Login page has no link. Users not informed of: identity of controller, purposes, lawful basis, recipients (Google Firebase, user's own Google Drive), retention, rights, withdrawal of consent, right to lodge complaint with ICO.                                                                                                                                        |
| H2  | Art. 9(1)    | **Religious data processed without explicit consent** | `scriptureRefs` (Bible references) indicates religious beliefs. Even though stored on user's own Drive, the controller's app code structures and processes this special-category data and writes it to a user-account Drive folder it controls via OAuth scope. Requires Art. 9(2)(a) explicit consent.                                                                                             |
| H3  | Art. 9(1)    | **Mood data may constitute health data**              | Mood scale (Sorrowful, Anxious, Weary, …) plausibly classed as mental-state/health data. Same lack of Art. 9(2) basis as H2. Mood also written to the Drive manifest (a separate file) — broader exposure than entry bodies in conflict-backup scenarios.                                                                                                                                           |
| H4  | Art. 17      | **No account deletion mechanism**                     | No UI button, no Cloud Function, no documented procedure. Soft delete is 30-day TTL on per-entry `deletedAt`, but full-account erasure (Firebase Auth user, Firestore docs, private OAuth token, Drive content on user's Drive, IndexedDB) is missing. Note the Drive content is the user's; the spec should clarify whether the app deletes the `Quiet Dwelling/` folder or leaves it to the user. |
| H5  | Art. 5(1)(a) | **Login page claim still misleading**                 | `LoginPage.tsx:144` reads "Private & encrypted — only you can read your entries." Now mostly accurate (no third-party search index, no journal content on Quiet Dwelling servers), but Google can read content on the user's Drive — it is not end-to-end encrypted. Either reword to be precise or remove.                                                                                         |

**Resolved since previous audit**: previous H5 (Algolia DPA missing) and previous H6
(misleading claim about Algolia) are obsolete because Algolia has been removed entirely from
the data path. H5 above retains the misleading-claim concern at a lower factual scope.

### 4.2 Medium Severity 🟡

| #   | Article       | Issue                                                        | Detail                                                                                                                                                                                                                                                                                          |
| --- | ------------- | ------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| M1  | Art. 15–22    | **No data subject rights mechanism**                         | No UI for access (Art. 15), portability (Art. 20), rectification (Art. 16), objection (Art. 21). Portability is partially natural since user already has Drive JSON files, but should be made explicit.                                                                                         |
| M2  | Art. 5(1)(e)  | **No documented retention policy**                           | 30-day soft-delete TTL undisclosed. No documented retention for inactive accounts, Cloud Function logs, Firestore preference docs, FCM tokens after long inactivity, or conflict backups on user's Drive.                                                                                       |
| M3  | Art. 33–34    | **No breach response procedure**                             | No documented detection, containment, 72-hour ICO notification flow.                                                                                                                                                                                                                            |
| M4  | Art. 30       | **No Record of Processing Activities (RoPA)**                | Required for controllers; not maintained.                                                                                                                                                                                                                                                       |
| M5  | Art. 13(2)(e) | **FCM token + Drive-account email collection not disclosed** | `fcmTokens[]`, `storageAccountEmail`, `storageRootFolderId`, `storageConnectedAt` written to Firestore without any disclosure.                                                                                                                                                                  |
| M6  | Art. 32       | **Cloud Function logs contain raw UIDs**                     | `sendDailyReminders` (`functions/src/index.ts:395-402`) logs `userDoc.id`. No retention policy on Cloud Logging.                                                                                                                                                                                |
| M7  | Art. 35       | **No DPIA conducted**                                        | Large-scale processing of likely special category data (religion + mood). DPIA threshold likely met; no formal assessment.                                                                                                                                                                      |
| M8  | Art. 28       | **No Google DPA verification record**                        | Google's standard Data Processing Terms cover Firebase services, but no recorded confirmation in project docs that the current Firebase services in use (Auth, Firestore, FCM, Functions, Hosting) are covered for `journal-manna`. Drive-as-user-storage is a different relationship — see §5. |
| M9  | Art. 13       | **No disclosure that Drive sync uses user's own Drive**      | Users must be told what Quiet Dwelling reads/writes on their Drive (`drive.file` scope is limited but should still be transparent), what goes into `Quiet Dwelling/conflicts/`, and that disconnecting locally does not delete Drive content.                                                   |

### 4.3 Low Severity 🟢

| #   | Article | Issue                                         | Detail                                                                                                                                 |
| --- | ------- | --------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| L1  | Art. 13 | **localStorage + IndexedDB disclosure**       | Cookies/storage section missing. Should list each key/store and purpose. IndexedDB contains diary content — material to data subjects. |
| L2  | Art. 13 | **Timezone silently refreshed**               | `reminderTimezone` overwritten on load when reminders enabled — inferred location data, undisclosed.                                   |
| L3  | Art. 13 | **Web Speech API (dictation)**                | Chrome routes audio to Google for speech recognition. Not in app's direct control. Disclose in policy + near dictation control.        |
| L4  | Art. 32 | **IndexedDB cache holds plaintext entries**   | Personal data persists in browser storage. Disclose. Consider documenting risk on shared devices.                                      |
| L5  | Art. 13 | **Google profile photo fetched from Google**  | `photoURL` is a Google CDN URL — accessing it makes requests to Google. Worth a line in the policy.                                    |
| L6  | Art. 13 | **Device fingerprint generation undisclosed** | `deviceIdentity` store generates a per-user/per-browser hash with random salt. Local only, but disclose its existence and purpose.     |
| L7  | Art. 13 | **Conflict backups written to user's Drive**  | `Quiet Dwelling/conflicts/` accumulates entries silently. Disclose; ideally provide a Settings option to view/clear them.              |

---

## 5. Third-Party Processors and Storage Relationships

| Party                   | Relationship                                                                              | Data Shared                                                                                                  | Transfer Mechanism                   | Status                                                                                         |
| ----------------------- | ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ | ------------------------------------ | ---------------------------------------------------------------------------------------------- |
| **Google Firebase**     | Processor (Art. 28) to Quiet Dwelling                                                     | Auth profile, FCM tokens, reminder prefs, Drive provider metadata, OAuth refresh tokens, Cloud Function logs | Google Cloud `europe-west2` (London) | Covered by Google's standard DPA — confirm + record in RoPA                                    |
| **User's Google Drive** | **User-owned storage**; Quiet Dwelling acts on user's behalf via OAuth `drive.file` scope | All journal entries, manifest, conflict backups                                                              | User's own Drive account region      | Not a controller-to-processor relationship for entry storage. Disclose plainly.                |
| **scripture.api.bible** | Read-only third-party API                                                                 | Only `VITE_BIBLE_API_KEY` in headers; no PII                                                                 | N/A                                  | ✅                                                                                             |
| **Algolia**             | _Removed_                                                                                 | _N/A_                                                                                                        | _N/A_                                | ✅ No longer in data path. Remove residual `vendor-algolia` chunk from `vite.config.ts:88-91`. |

Legal nuance for Drive: because the user authenticates their own Google account and grants
`drive.file` scope, the storage of entry files in their own Drive is more accurately described
as the user using a tool the controller provides to write to their own Google account. The
controller's processing of that data is the read/write operations performed in client code on
behalf of the user. Disclose this relationship in the privacy notice rather than treating
Drive as a processor in the Art. 28 sense.

---

## 6. Implementation Plan

Priority order: H → M → L.

### Phase 1 — Critical (H1–H5)

#### TASK-1: Privacy notice and policy page

- Route `/privacy` in `src/App.tsx`; add page `src/pages/PrivacyPage.tsx`.
- Link from `LoginPage.tsx` footer and from `SettingsPage.tsx`.
- Must cover all Art. 13 fields plus:
  - **Local-first architecture**: IndexedDB stores entries on-device.
  - **Drive sync**: explain `drive.file` scope, the `Quiet Dwelling/` folder, what files are
    created (entries, `metadata.json`, `conflicts/`), and how to revoke at
    `myaccount.google.com/permissions`.
  - **OAuth refresh token**: stored server-side under restricted Firestore path; used only by
    `getGoogleDriveAccessToken` / `exchangeGoogleDriveCode` Cloud Functions.
  - **No third-party search index** (replaces previous Algolia disclosure).

#### TASK-2: Fix or remove login-page claim

- `src/components/auth/LoginPage.tsx:144` — replace
  "Private & encrypted — only you can read your entries" with one of:
  - "Your entries stay on your device and your own Google Drive."
  - "We never store your entries on our servers."
- Avoid the word "encrypted" unless documenting E2E (which is not the case — Google can read
  Drive contents).

#### TASK-3: Explicit consent for special category data (religion + mood)

- One-time consent modal at first sign-in covering both scripture refs and mood (Art. 9(2)(a),
  Art. 7).
- Store on `users/{uid}`:
  ```ts
  consentGiven: boolean
  consentTimestamp: Timestamp
  consentVersion: string // e.g. "1.0"
  consentSpecialCategories: {
    religion: boolean
    mood: boolean
  }
  ```
- Provide withdrawal in Settings ("Withdraw consent for sensitive data processing"). Withdrawal
  must block further writes of scripture/mood and offer to clear existing ones.
- New files: `src/components/auth/ConsentModal.tsx`, `src/hooks/useConsent.ts`. Gate routes in
  `src/App.tsx`.

#### TASK-4: Account deletion (Art. 17)

New `deleteAccount` Cloud Function in `functions/src/index.ts` (region `europe-west2`):

1. Delete `users/{uid}/private/googleDriveOAuth` (revokes refresh token via Google's revoke endpoint first).
2. Delete `users/{uid}/entries/**` (legacy; should be empty after migration but defensive).
3. Delete `users/{uid}` document.
4. Delete the Firebase Auth user (`getAuth().deleteUser(uid)`).
5. **Drive folder**: prompt user during deletion flow — "Also delete `Quiet Dwelling/` from your
   Google Drive?" If yes and a valid access token can still be obtained, recursively delete the
   root folder; otherwise instruct user how to delete manually post-revocation.
6. Client-side after success: clear all `quiet-dwelling` IndexedDB stores for the UID and all
   `*_{uid}` localStorage keys; sign out; redirect to login.

UI: "Delete account" button in `src/pages/SettingsPage.tsx` with two-step confirmation.

#### TASK-5: Disclose Drive scope, manifest, conflict backups (covers H1 + M9)

Folded into Privacy Policy (TASK-1) plus an inline note near the "Connect Google Drive" button
in Settings: list what gets written and how to revoke.

### Phase 2 — Rights and retention (M1, M2)

#### TASK-6: Data export (Art. 20)

- "Export my data" in Settings.
- Build JSON bundle client-side: user profile fields from Firestore + all entries from
  IndexedDB. Trigger browser download.
- Drive already gives users their entry files; the in-app export should also include profile +
  preferences for completeness.

#### TASK-7: Retention policy

Document in Privacy Policy and a new `docs/retention.md`:

- Entries (local + Drive): retained until user deletes; soft-delete 30-day TTL on per-entry
  `deletedAt`.
- Inactive accounts: define threshold (recommend 3 years) → email warning → automatic deletion
  via scheduled Cloud Function.
- Cloud Function logs: set Cloud Logging retention to 30 days in GCP console.
- Conflict backups on user's Drive: cap quantity per date (e.g. last 10) or expose a "clear
  conflict backups" Settings action.
- FCM tokens: removed on send failure (already implemented); also clear on account deletion.
- OAuth refresh token: revoked on disconnect; deleted on account deletion.

### Phase 3 — Security and operational (M3, M4, M6, M7, M8)

#### TASK-8: Breach response procedure (`docs/breach-response.md`)

Detection sources (Firebase Security Rules logs, abnormal Cloud Functions error rates, Google
Account compromise reports). 72-hour ICO timer. User notification threshold per Art. 34.

#### TASK-9: RoPA (`docs/ropa.md`)

One row per processing activity from §3, with Art. 30(1) fields.

#### TASK-10: Sanitize Cloud Function logs

`functions/src/index.ts` — replace `${userDoc.id}` in `console.warn` (lines 396, 401) with
e.g. `userDoc.id.slice(0, 8) + '…'` or hashed value. Set Cloud Logging retention to 30 days.

#### TASK-11: DPIA (`docs/dpia.md`)

Triggered by: large-scale processing of likely special category data (religion + mood);
emotional-state profiling; minors' use possible (login currently does not gate by age — confirm
whether a minimum age applies per Art. 8 Member State rule).

#### TASK-12: Confirm Google DPA in project docs

Record in `docs/ropa.md` the Firebase services in use and that they are covered under Google
Cloud's Data Processing Addendum for `journal-manna`. Verify `europe-west2` for Firestore and
Cloud Functions; FCM, Auth, and Hosting region/transfer specifics need explicit note.

### Phase 4 — Transparency improvements (L1–L7)

#### TASK-13: Storage & cookies section

In Privacy Policy: list every IndexedDB store, every localStorage key, purpose, persistence.

#### TASK-14: Dictation disclosure

Privacy Policy paragraph + tooltip near the dictation button: "Voice dictation uses your
browser's built-in speech recognition. On Chrome, audio is processed by Google's servers."

#### TASK-15: Device fingerprint disclosure

Mention the per-user/per-browser ID in the policy: local-only, used to label devices in
conflict-merge prompts, not transmitted as a standalone identifier.

#### TASK-16: Conflict backup visibility

Settings → Storage: "View Drive conflict backups" or at minimum a "Clear conflict backups"
button. Calls Drive API to list and remove items under `Quiet Dwelling/conflicts/`.

---

## 7. Consent Data Model (TASK-3)

Add to `users/{uid}` (Firestore):

```ts
{
  consentGiven: boolean
  consentTimestamp: Timestamp
  consentVersion: string // e.g. "1.0" — bump on material change
  consentSpecialCategories: {
    religion: boolean // scripture refs processing
    mood: boolean // mood/emotional-state processing
  }
}
```

Gate scripture and mood inputs on the relevant flag. Withdrawal flips the flag and offers
optional purge of existing data of that category.

---

## 8. Account Deletion Cloud Function (TASK-4 spec)

```ts
export const deleteAccount = onCall(
  { region: FUNCTIONS_REGION, secrets: [GOOGLE_CLIENT_SECRET] },
  async (request) => {
    const uid = requireAuth(request)
    const db = getFirestore()
    const auth = getAuth()

    // 1. Revoke and delete Drive refresh token (best-effort)
    const oauthSnap = await googleDriveOAuthRef(uid).get()
    const refreshToken = oauthSnap.get('refreshToken') as string | undefined
    if (refreshToken) {
      try {
        await fetch(`https://oauth2.googleapis.com/revoke?token=${refreshToken}`, {
          method: 'POST',
        })
      } catch {
        // best-effort revocation; proceed with deletion
      }
      await googleDriveOAuthRef(uid).delete()
    }

    // 2. Delete any legacy entries subcollection
    const entries = await db.collection('users').doc(uid).collection('entries').get()
    await Promise.all(entries.docs.map((d) => d.ref.delete()))

    // 3. Delete user doc
    await db.collection('users').doc(uid).delete()

    // 4. Delete Firebase Auth user
    await auth.deleteUser(uid)

    return { success: true }
  },
)
```

Drive folder deletion is handled client-side **before** calling `deleteAccount`, while a valid
access token is still cached. Spec the flow:

1. User clicks "Delete account" → confirm dialog with checkbox: "Also delete
   `Quiet Dwelling/` from my Google Drive."
2. If checked, client recursively deletes the root Drive folder.
3. Client calls `deleteAccount` Cloud Function.
4. On success, clear IndexedDB + localStorage for that UID; sign out.

---

## 9. Priority Summary

| Priority | Task                                             | Article      | Rough effort |
| -------- | ------------------------------------------------ | ------------ | ------------ |
| 🔴 1     | TASK-2: Login claim fix                          | Art. 5(1)(a) | 15 min       |
| 🔴 2     | TASK-1: Privacy policy                           | Art. 13      | 3–4 hours    |
| 🔴 3     | TASK-4: Account deletion (Cloud Fn + UI + Drive) | Art. 17      | 6–8 hours    |
| 🔴 4     | TASK-3: Consent modal (religion + mood)          | Art. 9       | 4–6 hours    |
| 🟡 5     | TASK-6: Data export                              | Art. 20      | 2–3 hours    |
| 🟡 6     | TASK-7: Retention policy                         | Art. 5(1)(e) | 1–2 hours    |
| 🟡 7     | TASK-9: RoPA                                     | Art. 30      | 2 hours      |
| 🟡 8     | TASK-10: Sanitize CF logs                        | Art. 32      | 30 min       |
| 🟡 9     | TASK-8: Breach response procedure                | Art. 33      | 1 hour       |
| 🟡 10    | TASK-11: DPIA                                    | Art. 35      | 3–4 hours    |
| 🟡 11    | TASK-12: Confirm Google DPA in docs              | Art. 28      | 1 hour       |
| 🟢 12    | TASK-13–16: Transparency notices                 | Art. 13      | 2 hours      |

---

## 10. What Is Already Good (since previous audit)

- **Algolia removed** — no third-party search index; no diary content leaves user-controlled storage.
- **Journal content never in Firestore** — body, mood, tags, scripture refs are in IndexedDB and
  on the user's own Drive only. Firestore holds only account/profile/preference metadata.
- **OAuth refresh tokens locked server-side** — `users/{uid}/private/**` denied to clients
  (`firestore.rules`); only Cloud Functions can read.
- **Cloud Functions in `europe-west2`** — keeps Firebase processing in UK/EU.
- **Drive scope is minimal** — `drive.file` only grants access to files the app itself creates.
  Cannot read other user content.
- **Soft-delete TTL** — 30-day TTL on `deletedAt` for entries.
- **FCM token cleanup** — stale tokens removed on send failure.
- **Notification permission flow** — browser-level consent precedes FCM token registration.
- **No third-party analytics** — no Google Analytics, Mixpanel, Hotjar, or tracking pixels.
- **No advertising** — no ad-related processing.
- **Disconnect Drive is device-local** — disconnecting on one device does not delete shared
  provider metadata or break other devices.

---

## 11. Implementation Decisions (locked in 2026-05-15)

These answers gate Phase 1–4 work. Quote them in the Privacy Policy + ToS drafts.

| Topic                              | Decision                                                                                                                                                     |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Controller legal entity            | Fabrizio Bottaro, sole trader, Republic of Ireland                                                                                                           |
| Privacy contact                    | `privacy@thequietdwelling.com` (alias forwarding to operator inbox)                                                                                          |
| Lead supervisory authority         | Irish DPC (`dpc.ie`). Non-IE users keep right to lodge complaint with their local DPA                                                                        |
| Age gate (Art. 8)                  | 16+ with self-attestation checkbox at sign-up                                                                                                                |
| Inactive-account auto-delete       | 3 years of no sign-in. Warning email at 2y 10mo. Scheduled Cloud Function performs delete                                                                    |
| Geographic scope                   | Worldwide. Privacy Policy includes short-form California (CCPA/CPRA) notice for US residents                                                                 |
| ToS governing law + courts         | Republic of Ireland; courts of Ireland (mandatory consumer protections preserved)                                                                            |
| Pricing                            | Free on web + desktop PWA. Android TWA paid (€/$2.99) one-off via Google Play. Future paid tiers                                                             |
| Premium entitlement storage        | Firestore on user doc: `premiumEntitlement: { active, source, purchaseToken, expiresAt }`. Verified server-side by Cloud Function against Play Developer API |
| Refund / status sync               | Real-time Developer Notifications (Pub/Sub → Cloud Function) downgrade entitlement immediately                                                               |
| Consent withdrawal (religion/mood) | Block new writes only. Existing scripture refs + moods preserved. User may edit manually                                                                     |
| Drive disconnect lifecycle         | Leave `Quiet Dwelling/` folder on user's Drive. Settings discloses + links to Google Drive UI                                                                |
| Multi-device account deletion      | Other devices auto-sign-out + clear IndexedDB/localStorage for that uid on next auth check                                                                   |
| Embedded images in entries         | Disallowed. Tiptap StarterKit has no Image extension. Text + headings + lists only                                                                           |
| Policy/ToS versioning              | Semver `MAJOR.MINOR`. Major bump forces re-acceptance modal. Minor shows in-app banner                                                                       |
| Cookie / storage banner            | None required. All storage strictly necessary under ePrivacy / SI 336/2011 (IE). Record reasoning in RoPA                                                    |
| Analytics                          | None enabled; commitment in policy: "We do not run analytics."                                                                                               |

### 11.1 New tasks added for paid-tier compliance

#### TASK-17: Google Play purchase + entitlement Cloud Functions

- `verifyPlayPurchase` (`onCall`, region `europe-west2`, secret `PLAY_SERVICE_ACCOUNT_JSON`):
  Android client posts `purchaseToken` + `productId`. Function calls Google Play Developer API
  `purchases.products.get` (one-off) / `purchases.subscriptionsv2.get` (subs). Writes
  `premiumEntitlement` on `users/{uid}`.
- `playRtdnHandler` (`onMessagePublished`, Pub/Sub topic configured in Google Play Console):
  receives RTDN payloads (`oneTimeProductNotification`, `subscriptionNotification`,
  `voidedPurchaseNotification`). Reverifies via Play Developer API. Updates entitlement.
  Handles refund, revocation, expiry.
- Privacy disclosure: name Google Play Billing as recipient of purchase data; name Google
  Commerce Limited (Ireland) as merchant of record in EU.

#### TASK-18: Inactive-account scheduled delete

- `cleanupInactiveAccounts` (`onSchedule`, weekly, `europe-west2`).
- Query users where `lastEntrySavedAt` or last Firebase Auth sign-in older than 3 years.
- Send warning email at 2y 10mo via transactional email channel (see below). At 3y trigger
  same path as TASK-4 deletion (minus Drive folder — leave on user's Drive; explain in
  warning email).
- Today the app sends only FCM push. For warning emails, add transactional email (e.g.
  Firebase Trigger Email extension or direct SMTP/Postmark EU). Disclose this processor in
  the Privacy Policy.

#### TASK-19: Age gate at sign-up

- One-time modal on first sign-in: "Are you 16 or older?" with checkbox.
- Store on `users/{uid}`: `ageAttested: true`, `ageAttestedAt: Timestamp`.
- Refuse account creation if unchecked; sign out and delete the just-created Firebase Auth
  user.

#### TASK-20: Re-acceptance flow for policy/ToS major bumps

- App constants `POLICY_VERSION = '1.0'`, `TOS_VERSION = '1.0'`.
- Store on `users/{uid}`: `acceptedPolicyVersion`, `acceptedTosVersion`,
  `policyAcceptedAt`, `tosAcceptedAt`.
- App-level guard: if stored version's major < constant's major → blocking modal until
  re-acceptance.

#### TASK-21: Multi-device deletion enforcement

- After `deleteAccount` succeeds, every other signed-in device detects the deleted Firebase
  Auth user on next request (token refresh fails / Firestore read returns missing doc) →
  triggers sign-out + IndexedDB/localStorage wipe for that uid.
- Implement in the root auth listener (e.g. `src/lib/firebase.ts` onAuthStateChanged or a
  dedicated hook). On `user-not-found` / `user-disabled`: call `signOut()` then clear stores
  for that uid.

### 11.2 Updated processor inventory (additions)

| Party                            | Relationship                                | Data shared                                                | Transfer mechanism                                                  |
| -------------------------------- | ------------------------------------------- | ---------------------------------------------------------- | ------------------------------------------------------------------- |
| **Google Commerce Limited (IE)** | Merchant of record (paid Android TWA, EU)   | Purchase data, payment data — handled entirely by Google   | Intra-EU                                                            |
| **Google Play Developer API**    | Processor (Art. 28) to Quiet Dwelling       | `purchaseToken`, `productId`, `orderId`, entitlement state | Google Cloud DPA                                                    |
| **Email transactional provider** | Processor (TBD) — for warning/breach emails | Email address, account-state notifications                 | Select an EU-region provider (Postmark EU, SendGrid EU, AWS SES EU) |

### 11.3 Privacy Policy outline (drafting checklist)

Minimum sections, in this order:

1. Who we are (sole trader, IE) + contact (`privacy@thequietdwelling.com`)
2. Summary in plain English (local-first, your Drive, no analytics, no third-party search)
3. Personal data we collect (mirror §2 of this doc, condensed)
4. Why + lawful basis per activity (Art. 13(1)(c))
5. Recipients (Google services, Bible API, payment processor for paid tier, transactional email provider)
6. International transfers (EU primary; Google's adequacy / SCC posture)
7. How long we keep data (retention table)
8. Your rights (Art. 15–22) + how to exercise them
9. Cookies and storage (functional only; list every key/store)
10. Children (16+ self-attestation)
11. Security (Art. 32 measures)
12. Breach notification commitment (Art. 33–34)
13. Changes to this policy (semver + re-acceptance)
14. Lead authority (Irish DPC) + right to complain to local DPA
15. California short-form notice (CCPA/CPRA "do not sell or share — not applicable")
16. Effective date + version

### 11.4 Terms of Service outline (drafting checklist)

1. Acceptance + age (16+)
2. Service description (web/PWA free; Android TWA paid; future paid features)
3. Account responsibilities (Google Sign-In, security of Google account)
4. Acceptable use (no automated scraping, no abuse, no impersonation)
5. User content ownership (user owns entries; service has no licence to read them)
6. Payment terms — Google Play Billing as seller of record in EU; refunds per Google Play policy
7. Future paid features clause (notice + opt-in)
8. Service availability disclaimer ("as is", no warranties of fitness)
9. Liability cap (statutory minimum where mandatory consumer law applies)
10. Suspension / termination grounds
11. Changes to terms (semver + re-acceptance)
12. Governing law: Republic of Ireland; courts of Ireland
13. Contact (`privacy@thequietdwelling.com`)
14. Effective date + version

### 11.5 Open items before drafting can finish

- Choose transactional email provider (TASK-18 dependency) — affects policy processor list.
- Confirm exact registered address for sole-trader operation (or use a service address) —
  required field in Privacy Policy + ToS.
- Decide whether to bundle a feedback/support inbox separately from `privacy@` (e.g.
  `support@thequietdwelling.com`).

---

_Last reviewed: 2026-05-15_
_Reviewer: Claude (technical audit) — legal review pending_
