# Data Protection Impact Assessment

This DPIA records the current privacy risk assessment for Quiet Dwelling. It is
required or strongly prudent because the app processes journal content that may
include special category data, including religious references and emotional-state
signals (GDPR Art. 9), and because users may use the app for intimate reflection.
Review before launch and after any major processing change.

## Screening

| Question                                              | Assessment                                                                                                              |
| ----------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Does processing likely involve special category data? | Yes. Scripture references may reveal religious beliefs; mood labels may reveal health or mental-state data (Art. 9(1)). |
| Is processing systematic or repeated?                 | Yes. Users may create daily entries, reminders, metadata, and sync records.                                             |
| Is there large-scale processing?                      | Potentially, depending on launch adoption. Treat as high-risk until scale is known.                                     |
| Are children involved?                                | The product decision is 16+ with self-attestation. Age gate implementation is still pending.                            |
| Is monitoring/profiling performed?                    | No analytics or advertising. App-derived mood and search metadata still structure sensitive self-expression.            |
| Is a DPIA needed?                                     | Yes as a conservative Art. 35 measure.                                                                                  |

## Processing Description

Quiet Dwelling is a local-first journaling app. Entry bodies are stored in
browser IndexedDB and, when the user enables sync, in app-created files inside
the user's own Google Drive `Quiet Dwelling/` folder. Firestore stores account
metadata, reminder preferences, FCM tokens, Drive connection metadata, and
server-only OAuth refresh-token records. Cloud Functions broker Google Drive
OAuth and send scheduled reminders.

The app does not run analytics, ad tracking, Crashlytics, Performance
Monitoring, or a third-party search index. Search runs locally over IndexedDB.

## Necessity And Proportionality

| Measure                   | Assessment                                                                                                              |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Local-first storage       | Proportionate: keeps journal content off Quiet Dwelling servers by default.                                             |
| Google Drive sync         | Optional and user-controlled. `drive.file` scope is proportionate because it limits access to app-created files.        |
| Firestore metadata        | Necessary for sign-in, preferences, reminders, provider status, and future entitlements. Must not include entry bodies. |
| OAuth refresh token       | Necessary for user-selected Drive sync. Requires strict server-only access and revocation on disconnect/deletion.       |
| Mood and scripture fields | Useful for product purpose but high-sensitivity. Requires explicit consent and withdrawal controls before launch.       |
| Reminders                 | Optional. Requires browser permission and transparent disclosure of FCM token storage.                                  |
| Device identity           | Local-only conflict attribution. Proportionate if disclosed and not transmitted as a standalone identifier.             |

## Risk Register

| Risk                                                           | Impact                 | Likelihood                    | Existing controls                                                       | Further action                                                                  | Residual risk               |
| -------------------------------------------------------------- | ---------------------- | ----------------------------- | ----------------------------------------------------------------------- | ------------------------------------------------------------------------------- | --------------------------- |
| Firestore accidentally stores journal content                  | High                   | Medium                        | `EntryRepository` architecture; docs instruct content out of Firestore  | Keep repository tests and rules checks; review new entry features for data path | Low/Medium                  |
| Special category data processed without valid Art. 9 condition | High                   | High until consent flow ships | GDPR plan documents explicit consent requirement                        | Implement TASK-3 consent modal and Settings withdrawal                          | Medium after implementation |
| OAuth refresh token exposure                                   | High                   | Low/Medium                    | Private Firestore subcollection denied to clients; Cloud Functions only | Add account deletion/revocation flow; monitor private rules tests               | Low/Medium                  |
| User misunderstands Drive sync storage                         | Medium/High            | Medium                        | Privacy page and Settings copy started                                  | Keep Drive scope, manifest, conflicts, and revocation disclosures visible       | Low/Medium                  |
| Conflict backups expose old sensitive entries in Drive         | Medium/High            | Medium                        | Stored in user's own Drive                                              | Add TASK-16 clear/view conflict backups or cap backups                          | Medium                      |
| Raw identifiers in operational logs                            | Medium                 | Low                           | Phase 3 hashes reminder log user IDs                                    | Confirm Cloud Logging retention is 30 days                                      | Low                         |
| Shared-device local IndexedDB exposure                         | High for affected user | Medium                        | Browser storage only; no server replication by default                  | Disclose plainly; consider local lock/export/delete UX                          | Medium                      |
| Missing account deletion automation                            | High                   | Medium                        | Public deletion instructions and manual contact path                    | Implement TASK-4 and TASK-21                                                    | Medium                      |
| Age self-attestation missing                                   | Medium/High            | Medium                        | Policy decision set to 16+                                              | Implement TASK-19 before launch                                                 | Medium                      |
| Breach response ad hoc                                         | High                   | Medium                        | `docs/breach-response.md` runbook added                                 | Rehearse incident handling and keep contacts current                            | Low/Medium                  |

## Data Subject Rights

Users can edit entries directly, export local data from Settings, delete entries,
delete local browser data, and delete Drive files from their own Google Drive.
The account deletion function and in-app deletion flow remain planned. Rights
requests are handled through `privacy@thequietdwelling.com` under GDPR
Art. 15-22.

## Security Measures

- HTTPS for web and API traffic.
- Firebase Auth for account access.
- Firestore rules denying client access to `users/{uid}/private/**`.
- Cloud Functions in `europe-west2` for Drive token exchange and reminders.
- OAuth `drive.file` scope only.
- No analytics, ad SDK, third-party search index, or crash SDK.
- Reminder logs use short SHA-256 hashes instead of raw Firebase UIDs.
- Target Cloud Logging retention: 30 days.

## Consultation And Prior Consultation

No prior consultation with the Irish DPC has been made. If residual high risk
remains after TASK-3 consent, TASK-4 deletion, TASK-19 age gate, and TASK-16
conflict-backup controls, seek legal/DPO review and consider whether prior
consultation is required under GDPR Art. 36.

## Decision

Processing may proceed toward launch only if these gates are satisfied:

1. Explicit consent for scripture and mood processing is implemented and logged
   (Art. 9(2)(a), Art. 7).
2. Privacy policy and Settings disclosures accurately explain local storage,
   Drive sync, OAuth tokens, FCM tokens, conflict backups, and rights.
3. Account deletion and multi-device cleanup have a tested path.
4. Cloud Logging retention is configured to 30 days.
5. Age self-attestation for 16+ users is implemented.

## Review Cadence

Review this DPIA:

- Before public launch.
- After adding paid entitlements, transactional email, embedded images,
  analytics, AI features, or any new third-party processor.
- After any personal data breach or near miss.
- At least annually while the service is live.

## External References

- GDPR Art. 35 and Art. 36: DPIA and prior consultation requirements.
- Irish DPC DPIA list:
  `https://www.edpb.europa.eu/sites/default/files/decisions/ie_dpc_data-protection-impact-assessment.pdf`.
