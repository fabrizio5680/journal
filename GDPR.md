# GDPR Compliance — The Quiet Sanctuary (Reflect)

> **⚠️ Legal Advice Disclaimer**: This document is a technical compliance assessment based on the
> GDPR text and established regulatory guidance. It does not constitute legal advice. For matters
> involving significant compliance risk or supervisory authority interaction, consult a qualified
> data protection lawyer or your DPO.

---

## 1. System Overview

| Property         | Value                                                                    |
| ---------------- | ------------------------------------------------------------------------ |
| App name         | The Quiet Sanctuary ("Reflect")                                          |
| Role             | Data Controller (Art. 4(7))                                              |
| Firebase project | `journal-manna`                                                          |
| Hosting          | `journal-manna.web.app`                                                  |
| Backend          | Firebase (Auth, Firestore, Cloud Functions, FCM) — Google infrastructure |
| Search           | Algolia (US-based processor) — full journal content synced               |
| Scripture API    | scripture.api.bible — no PII sent                                        |
| Auth             | Google Sign-In only (OAuth 2.0)                                          |

---

## 2. Personal Data Inventory

### 2.1 User Identity (from Google OAuth)

| Field         | Type         | Classification                       |
| ------------- | ------------ | ------------------------------------ |
| `displayName` | String       | Direct identifier (Art. 4(1))        |
| `email`       | String       | Direct identifier (Art. 4(1))        |
| `photoURL`    | String (URL) | Indirect identifier                  |
| Firebase UID  | String       | Pseudonymous identifier (Recital 26) |

### 2.2 Journal Content (highly sensitive)

| Field                            | Type                         | Classification                                        |
| -------------------------------- | ---------------------------- | ----------------------------------------------------- |
| `content`                        | Tiptap JSON                  | Sensitive personal data — diary entries               |
| `contentText`                    | String                       | Sensitive personal data — plain text diary entries    |
| `tags`                           | String[]                     | Personal data — user-defined categories               |
| `mood` / `moodLabel`             | Number / String              | Potentially health data (Art. 9(1)) — emotional state |
| `scriptureRefs`                  | `{ reference, passageId }[]` | **Special category — religious beliefs (Art. 9(1))**  |
| `wordCount`                      | Number                       | Derived personal data                                 |
| `date`, `createdAt`, `updatedAt` | Timestamps                   | Behavioural / temporal data                           |

### 2.3 Device and Notification Data

| Field              | Type             | Classification                  |
| ------------------ | ---------------- | ------------------------------- |
| `fcmTokens[]`      | String[]         | Device identifiers (Recital 30) |
| `reminderTime`     | String ("HH:MM") | Behavioural data                |
| `reminderTimezone` | IANA string      | Inferred location data          |

### 2.4 Local Storage (device-only)

| Key                      | Contents                             |
| ------------------------ | ------------------------------------ |
| `pref_editor_font_size`  | UI preference                        |
| `pref_spellcheck`        | UI preference                        |
| `fcm_device_token_{uid}` | FCM device token — device identifier |
| `scripture_{T}_{date}`   | Cached Bible verse text (no PII)     |

### 2.5 Algolia Search Index

Journal entry fields synced to Algolia via Firebase Extension:

- `contentText`, `tags`, `mood`, `moodLabel`, `date`, `userId`, `deleted`

**This means full diary content leaves Firebase infrastructure and is held by a US third party.**

---

## 3. Lawful Basis Assessment (Art. 6)

| Processing Activity                       | Basis Claimed                   | Assessment                                                                                        |
| ----------------------------------------- | ------------------------------- | ------------------------------------------------------------------------------------------------- |
| Core journaling (storing entries)         | Contract — Art. 6(1)(b)         | ✅ Appropriate — user signed up to journal                                                        |
| User profile (name, email, photo)         | Contract — Art. 6(1)(b)         | ✅ Necessary for account                                                                          |
| Daily reminder notifications              | Consent — Art. 6(1)(a)          | ✅ Browser permission granted, but GDPR consent (with withdrawal mechanism) not formally captured |
| Algolia search indexing                   | Contract — Art. 6(1)(b)         | ⚠️ Arguable but weak — user did not explicitly agree to third-party content indexing              |
| **Scripture references (religious data)** | **No basis identified**         | 🔴 Special category requires explicit consent (Art. 9(2)(a)) or another Art. 9(2) exemption       |
| **Mood data**                             | **Potentially health data**     | 🔴 If treated as health data under Art. 9 — no lawful basis in place                              |
| FCM token storage                         | Legitimate interests / Contract | ⚠️ Reasonable but undisclosed                                                                     |
| Cloud Function execution logs (user IDs)  | Legitimate interests            | ⚠️ Logs contain user IDs — no retention policy, no disclosure                                     |

---

## 4. GDPR Audit Findings

### 4.1 High Severity 🔴

| #   | Article      | Issue                                                       | Detail                                                                                                                                                                                                       |
| --- | ------------ | ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| H1  | Art. 13      | **No privacy notice**                                       | No privacy policy exists. Login page has no link. Users are not informed of: purposes, lawful basis, data recipients, retention periods, or rights.                                                          |
| H2  | Art. 9(1)    | **Religious data processed without explicit consent**       | `scriptureRefs` stores Bible verse references — direct indicator of religious beliefs. Special category requires explicit consent (Art. 9(2)(a)) or journal-app-specific exemption, neither of which exists. |
| H3  | Art. 9(1)    | **Mood data may constitute health data**                    | Mood journaling (Sorrowful, Anxious, Weary, etc.) could be classified as health/mental-state data under Art. 9. No explicit consent or Art. 9(2) exemption in place.                                         |
| H4  | Art. 17      | **No account deletion mechanism**                           | Users have no way to delete their account or request erasure of all personal data. Entries have 30-day soft delete but no full account deletion exists anywhere in the UI or via Cloud Function.             |
| H5  | Art. 28      | **Algolia — no confirmed DPA + cross-border transfer risk** | Entire diary content is synced to Algolia (US company) via Firebase Extension. No Data Processing Agreement confirmed, no transfer mechanism documented (SCCs/DPF).                                          |
| H6  | Art. 5(1)(a) | **Misleading transparency claim**                           | Login page states "Private & encrypted — only you can read your entries." This is false — Algolia holds full `contentText` in plaintext. This is an active misrepresentation to data subjects.               |

### 4.2 Medium Severity 🟡

| #   | Article       | Issue                                         | Detail                                                                                                                                                                             |
| --- | ------------- | --------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| M1  | Art. 15–22    | **No data subject rights mechanism**          | No UI or process for: access (Art. 15), portability (Art. 20), rectification (Art. 16), objection (Art. 21).                                                                       |
| M2  | Art. 5(1)(e)  | **No data retention policy**                  | No stated maximum retention period for user accounts or entries. Soft delete is 30 days via Firestore TTL (undisclosed). No policy on how long accounts are kept after inactivity. |
| M3  | Art. 33–34    | **No breach notification procedure**          | No documented process for detecting, containing, or notifying a data breach within 72 hours.                                                                                       |
| M4  | Art. 30       | **No Record of Processing Activities (RoPA)** | No RoPA document maintained. Required for controllers.                                                                                                                             |
| M5  | Art. 13(2)(e) | **FCM token collection not disclosed**        | Device registration tokens collected and stored in Firestore without prior disclosure in any notice.                                                                               |
| M6  | Art. 32       | **Cloud Function logs contain user IDs**      | `sendDailyReminders` logs `userDoc.id` (Firebase UID) in `console.warn`. Cloud logs = personal data with no defined retention or access control policy.                            |
| M7  | Art. 35       | **No DPIA conducted**                         | Diary content (likely health/religious data, large-scale emotional state tracking) likely meets the threshold for a Data Protection Impact Assessment.                             |

### 4.3 Low Severity 🟢

| #   | Article | Issue                                 | Detail                                                                                                                                                                      |
| --- | ------- | ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| L1  | Art. 13 | **No cookie/localStorage disclosure** | localStorage used for preferences, FCM token, scripture cache. Not disclosed to users.                                                                                      |
| L2  | Art. 13 | **Timezone silently refreshed**       | `reminderTimezone` updated on every load when reminders enabled — inferred location data collected without disclosure.                                                      |
| L3  | Art. 13 | **Web Speech API**                    | On supported browsers (non-iOS), dictation uses the browser's Web Speech API. Chrome routes audio to Google's servers. Not in app's direct control but should be disclosed. |
| L4  | Art. 32 | **Firestore IndexedDB offline cache** | Personal data including diary content is persisted to browser IndexedDB. No disclosure to users.                                                                            |
| L5  | Art. 13 | **Google profile photo**              | `photoURL` (Google-hosted CDN URL) stored in Firestore. Accessing it makes requests to Google infrastructure.                                                               |

---

## 5. Third-Party Processors

| Processor               | Data Shared                                                  | Transfer Mechanism                                | DPA Required                         | Status                                                                |
| ----------------------- | ------------------------------------------------------------ | ------------------------------------------------- | ------------------------------------ | --------------------------------------------------------------------- |
| **Google Firebase**     | All data (Auth, Firestore, FCM, Cloud Functions)             | Google Cloud EU regions (europe-west2 configured) | Yes — Google's Data Processing Terms | Covered by Google's standard DPA — verify it covers all services used |
| **Algolia**             | `contentText`, `tags`, `mood`, `moodLabel`, `date`, `userId` | US — requires SCCs or DPF adequacy                | **Yes — missing**                    | 🔴 No confirmation                                                    |
| **scripture.api.bible** | Only `VITE_BIBLE_API_KEY` in headers; no PII                 | N/A — no personal data sent                       | Not required                         | ✅                                                                    |

---

## 6. Implementation Plan

Priority ordering: H-items first, then M-items, then L-items.

---

### Phase 1 — Critical Legal Fixes (H1–H6)

#### TASK-1: Write and publish Privacy Policy

- **What**: Create a privacy policy page covering all Art. 13 mandatory disclosures.
- **Content must include**: identity of controller, purposes + lawful basis per activity, data recipients (Google Firebase, Algolia), retention periods, all Art. 15–22 rights, right to withdraw consent, right to lodge complaint with supervisory authority (ICO for UK users).
- **Where**: Route `/privacy` in the app; link in login page footer + settings page.
- **Files to create/edit**: `src/pages/PrivacyPage.tsx`, `src/components/auth/LoginPage.tsx` (add link), `src/App.tsx` (add route).

#### TASK-2: Fix misleading login claim

- **What**: Remove or rewrite the "Private & encrypted — only you can read your entries" text.
- **Replace with**: Something accurate, e.g. "Your entries are stored securely. Search is powered by Algolia." or simply remove the claim entirely.
- **File**: `src/components/auth/LoginPage.tsx` line 142.

#### TASK-3: Obtain explicit consent for special category data (religious + mood)

- **What**: Before a user first adds a scripture reference OR records a mood, display a one-time consent modal explaining that this is sensitive data and how it is used.
- **Alternatively**: Via a consent screen at first sign-in (preferred — covers both in one flow).
- **Consent must**: name the specific data types, name Algolia as recipient, be freely given, specific, informed, and withdrawable (Art. 7, Art. 9(2)(a)).
- **Store consent**: `consentGiven: true`, `consentTimestamp: Timestamp`, `consentVersion: string` on user doc in Firestore.
- **Files**: New `src/components/auth/ConsentModal.tsx`, `src/hooks/useConsent.ts`, update `src/App.tsx` (gate routes behind consent check).

#### TASK-4: Implement account deletion (Right to Erasure — Art. 17)

- **What**: "Delete my account" button in SettingsPage. Should:
  1. Delete all entries in `users/{uid}/entries/` subcollection.
  2. Delete the `users/{uid}` document.
  3. Delete the Firebase Auth user (`deleteUser(user)`).
  4. Trigger Algolia index cleanup (delete all records where `userId == uid`) — via a new Cloud Function `deleteAccount`.
  5. Clear all localStorage keys for that UID.
  6. Sign out and redirect to login.
- **Files**: Add `deleteAccount` Cloud Function in `functions/src/index.ts`; add "Delete Account" button + confirmation dialog in `src/pages/SettingsPage.tsx`.

#### TASK-5: Confirm/obtain Algolia DPA

- **What**: Log into Algolia console and sign/enable their Data Processing Agreement.
- **Also**: Document the Algolia–US transfer mechanism (Algolia participates in EU–US DPF; verify current status and document in RoPA).
- **Note**: Until DPA is confirmed and transfer mechanism documented, this is an active Art. 28 violation.

---

### Phase 2 — Data Subject Rights + Retention (M1, M2)

#### TASK-6: Data export / portability (Art. 20)

- **What**: "Export my data" button in SettingsPage.
- **Exports**: JSON file containing user profile + all entries (dates, content, mood, tags, scripture refs).
- **Implementation**: Client-side — query all entries via Firestore, build JSON blob, trigger browser download.
- **Files**: Add export function to `src/pages/SettingsPage.tsx`.

#### TASK-7: Data retention policy

- **Document** (in Privacy Policy and GDPR.md):
  - Entries: 30-day soft delete, then permanent deletion via Firestore TTL.
  - Accounts: Deleted on user request. Consider automatic deletion after N years of inactivity (recommend 3 years).
  - Algolia: Records deleted when account is deleted (via TASK-4 Cloud Function).
  - Cloud Function logs: Google Cloud Logging retention — set to 30 days in GCP console.
  - localStorage: Cleared on sign-out / account deletion.

---

### Phase 3 — Security and Operational (M3, M4, M5, M6, M7)

#### TASK-8: Document breach notification procedure

- **Create** `docs/breach-response.md` — internal doc covering:
  - How to detect a breach (Firebase Security Rules audit alerts, abnormal Algolia query patterns).
  - 72-hour ICO notification requirement (Art. 33).
  - User notification threshold (Art. 34 — "likely high risk").
  - Contact: ICO report at ico.org.uk/make-a-complaint.

#### TASK-9: Create RoPA (Record of Processing Activities — Art. 30)

- **Create** `docs/ropa.md` — table covering each processing activity with: purpose, lawful basis, data categories, recipients, retention period, safeguards.

#### TASK-10: Sanitize Cloud Function logs

- **What**: Replace `userDoc.id` in log statements with a truncated/hashed identifier.
- **File**: `functions/src/index.ts` — replace `userDoc.id` in `console.warn` calls with e.g. `userDoc.id.slice(0, 8) + '...'`.

#### TASK-11: Conduct DPIA (Art. 35)

- **Why triggered**: Large-scale processing of diary content; health/emotional state data (mood); religious data (scripture refs); profiling via search (Algolia).
- **Output**: `docs/dpia.md` documenting: processing description, necessity assessment, risk identification, risk mitigation measures.

---

### Phase 4 — Transparency Improvements (L1–L5)

#### TASK-12: LocalStorage disclosure

- **What**: Add a "Storage & Cookies" section to Privacy Policy listing all localStorage keys, their purpose, and duration.

#### TASK-13: Dictation disclosure

- **What**: Add a note in the Privacy Policy and near the dictation button (tooltip or settings note): "Voice dictation uses your browser's built-in speech recognition. On Chrome, audio is processed by Google's servers."

#### TASK-14: Offline cache disclosure

- **What**: Add a note in Privacy Policy: "The app caches your data locally using browser storage (IndexedDB) to enable offline use. This data is stored on your device only."

---

## 7. Consent Data Model Addition

When TASK-3 is implemented, add to `users/{userId}`:

```ts
{
  // existing fields...
  consentGiven: boolean // true once user has accepted consent modal
  consentTimestamp: Timestamp // when consent was given
  consentVersion: string // e.g. "1.0" — bump when material changes made to consent
}
```

---

## 8. Account Deletion Cloud Function (TASK-4 spec)

```ts
// functions/src/index.ts — new export
export const deleteAccount = onCall({ region: FUNCTIONS_REGION }, async (request) => {
  const uid = request.auth?.uid
  if (!uid) throw new HttpsError('unauthenticated', 'Login required')

  const db = getFirestore()
  const auth = getAuth() // firebase-admin auth

  // 1. Delete all entries
  const entriesRef = db.collection('users').doc(uid).collection('entries')
  const entries = await entriesRef.get()
  await Promise.all(entries.docs.map((d) => d.ref.delete()))

  // 2. Delete user document
  await db.collection('users').doc(uid).delete()

  // 3. Delete Algolia records (requires Admin API key — add as secret)
  // algoliaAdminClient.deleteObjects(SEARCH_INDEX_NAME, { filters: `userId:"${uid}"` })

  // 4. Delete Firebase Auth user
  await auth.deleteUser(uid)

  return { success: true }
})
```

---

## 9. Priority Summary

| Priority | Task                                       | Article      | Effort         |
| -------- | ------------------------------------------ | ------------ | -------------- |
| 🔴 1     | TASK-2: Fix misleading login claim         | Art. 5(1)(a) | 15 min         |
| 🔴 2     | TASK-5: Confirm Algolia DPA                | Art. 28      | 1 hour (admin) |
| 🔴 3     | TASK-1: Privacy Policy                     | Art. 13      | 3–4 hours      |
| 🔴 4     | TASK-4: Account deletion                   | Art. 17      | 4–6 hours      |
| 🔴 5     | TASK-3: Consent modal (special categories) | Art. 9       | 4–6 hours      |
| 🟡 6     | TASK-6: Data export                        | Art. 20      | 2–3 hours      |
| 🟡 7     | TASK-7: Retention policy documentation     | Art. 5(1)(e) | 1 hour         |
| 🟡 8     | TASK-9: RoPA                               | Art. 30      | 2 hours        |
| 🟡 9     | TASK-10: Sanitize CF logs                  | Art. 32      | 30 min         |
| 🟡 10    | TASK-8: Breach response procedure          | Art. 33      | 1 hour         |
| 🟡 11    | TASK-11: DPIA                              | Art. 35      | 3–4 hours      |
| 🟢 12    | TASK-12–14: Transparency notices           | Art. 13      | 1 hour         |

---

## 10. What Is Already Good

- **Firestore security rules**: User data scoped to `userId == auth.uid` — correct access control (Art. 25, Art. 32).
- **Algolia secured key**: Scoped per user via `userId` filter — users cannot access each other's search results.
- **Soft delete**: 30-day TTL on `deletedAt` — data is not kept indefinitely without a mechanism.
- **FCM token rotation**: Stale tokens removed automatically — good data minimisation.
- **Notification permission**: Browser `Notification.requestPermission()` called before FCM token registration — consent for push exists at browser level.
- **Cloud Functions region**: `europe-west2` (London) — keeps Firebase processing in UK/EU (helps with UK GDPR compliance).
- **No third-party analytics**: No Google Analytics, Mixpanel, Hotjar, or equivalent. No tracking pixels.
- **No ads**: No advertising-related processing.

---

_Last reviewed: 2026-05-06_
_Reviewer: Claude (technical audit) — legal review pending_
