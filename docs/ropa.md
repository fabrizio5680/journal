# Record of Processing Activities

This RoPA supports Quiet Dwelling's controller accountability under GDPR Art. 30
and Art. 5(2). It should be reviewed whenever product processing, processors,
regions, retention periods, or legal bases change.

## Controller

| Field                      | Record                                                           |
| -------------------------- | ---------------------------------------------------------------- |
| Controller                 | Fabrizio Bottaro, sole trader, Republic of Ireland               |
| Product                    | Quiet Dwelling                                                   |
| Contact                    | `privacy@thequietdwelling.com`                                   |
| Lead supervisory authority | Irish Data Protection Commission                                 |
| Data subjects              | App users aged 16+                                               |
| Representative / DPO       | Not appointed unless future scale or risk assessment requires it |

## Processing Activities

| Activity                        | Purpose                                                            | Data categories                                                                      | Data subjects                            | Lawful basis                                                                                        | Recipients / processors                                                  | Transfers                                                                        | Retention                                                                           | Security measures                                                                          |
| ------------------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------------------------ | ---------------------------------------- | --------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ | -------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| Account sign-in and profile     | Authenticate users and maintain an account                         | Firebase UID, email, display name, photo URL, createdAt                              | Signed-in users                          | Contract, Art. 6(1)(b)                                                                              | Google Firebase Auth / Firestore                                         | Google infrastructure; Firebase terms and transfer safeguards                    | Account lifetime; inactive deletion target after 3 years                            | Firebase Auth, HTTPS, Firestore rules                                                      |
| Local journaling                | Let users create, edit, search, and delete entries on-device       | Entry body, Tiptap JSON, search text, mood, tags, scripture refs, dates, word count  | Signed-in users                          | Contract, Art. 6(1)(b); explicit consent planned/required for Art. 9 data                           | Browser IndexedDB; no third-party processor                              | Device-local                                                                     | Until user deletes entry, clears local data, or account cleanup runs on that device | Local-first design, no server entry storage                                                |
| Google Drive sync               | Sync user-created entries across devices using user's own Drive    | Entry files, metadata manifest, conflict backups, Drive folder/file IDs              | Users who connect Drive                  | Contract, Art. 6(1)(b); explicit consent planned/required for Art. 9 data                           | User's Google Drive account; Google APIs                                 | User's Google account region and Google transfer safeguards                      | Until user deletes Drive files or chooses a future in-app Drive deletion option     | OAuth `drive.file` scope, HTTPS, app-created folder only                                   |
| Google Drive OAuth brokering    | Store refresh token and mint access tokens for optional Drive sync | Refresh token, scope, Drive account email, root folder ID, token timestamps          | Users who connect Drive                  | Contract, Art. 6(1)(b); security obligations Art. 32                                                | Firebase Firestore private subcollection, Cloud Functions                | Functions in `europe-west2`; Google infrastructure safeguards                    | While Drive remains connected; revoked/deleted on disconnect or account deletion    | Client rules deny `users/{uid}/private/**`; server-only access; secrets in Firebase params |
| Daily reminders                 | Send optional journaling reminders                                 | Reminder time, timezone, enabled flag, FCM tokens, lastEntryDate                     | Users who enable reminders               | Consent for notifications, Art. 6(1)(a); legitimate interests for stale-token cleanup, Art. 6(1)(f) | Firebase Cloud Messaging, Cloud Scheduler/Functions                      | Google infrastructure safeguards                                                 | While reminders enabled; stale tokens removed on send failure                       | Browser notification permission, token cleanup, hashed user IDs in logs                    |
| User preferences                | Preserve app settings and scripture translation                    | Font size, spellcheck, scripture translation, provider connection cache              | Signed-in users                          | Contract, Art. 6(1)(b)                                                                              | Firestore, IndexedDB, localStorage                                       | Google infrastructure where Firestore is used; local device otherwise            | Account lifetime or local data clearing                                             | Firestore rules, local storage minimisation                                                |
| Data export and rights requests | Support access, portability, deletion, and privacy requests        | Account metadata, local entries, support correspondence, verification context        | Users and requesters                     | Legal obligation, Art. 6(1)(c); contract where in-app export is used                                | Operator mailbox; browser download                                       | Depends on mailbox provider; choose/record EU-appropriate processor if automated | Only as long as needed for request handling and accountability                      | Identity verification, minimal correspondence records                                      |
| Paid Android entitlement        | Verify paid access for Google Play distribution                    | Product ID, purchase token, entitlement status, timestamps, possible order reference | Android purchasers                       | Contract, Art. 6(1)(b); legal obligation for accounting where applicable                            | Google Play Billing / Google Commerce Limited; Google Play Developer API | Google safeguards; EU merchant-of-record relationship for EU purchases           | Account lifetime plus legal/accounting dispute needs                                | Server-side purchase verification; minimum entitlement metadata                            |
| Service security and logs       | Operate, debug, and secure the app                                 | Cloud Function logs, pseudonymous hashed user ID, error context, deployment metadata | Users whose requests trigger server code | Legitimate interests, Art. 6(1)(f); security Art. 32                                                | Google Cloud Logging                                                     | Google infrastructure safeguards                                                 | Target 30 days                                                                      | Raw UID avoided; log minimisation; IAM controls                                            |

## Special Category Data

Journal scripture references may reveal religious beliefs and mood labels may
reveal mental or emotional state. These are treated as special category or
high-sensitivity data for design purposes (Art. 9(1)). The app must record
explicit consent before processing these fields beyond core entry text, or
another Art. 9(2) condition must be documented. Existing implementation plans
select explicit consent under Art. 9(2)(a), with withdrawal blocking new
scripture/mood writes.

## Processor And Recipient Notes

| Party                                         | Relationship                                                                             | Current record                                                                                                                                                                                                                                                                                                                                                                   |
| --------------------------------------------- | ---------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Google Firebase / Google Cloud                | Processor for Auth, Firestore, Cloud Functions, Hosting, FCM, and Cloud Logging          | Firebase Data Processing and Security Terms are published at `https://firebase.google.com/terms/data-processing-terms/`. Google Cloud privacy compliance records note the Cloud Data Processing Addendum and SCC posture at `https://support.google.com/cloud/answer/6329727`. Confirm acceptance and service coverage in the Google Cloud/Firebase console for `journal-manna`. |
| User's Google Drive                           | User-owned storage account accessed by Quiet Dwelling on the user's behalf               | Treat transparently in privacy notices rather than only as an Art. 28 processor relationship. Scope is `drive.file`; app can access files it creates.                                                                                                                                                                                                                            |
| scripture.api.bible                           | Read-only scripture API                                                                  | No PII intentionally sent. API key is sent in request headers.                                                                                                                                                                                                                                                                                                                   |
| Google Play Billing / Google Commerce Limited | Merchant of record for Android TWA purchases; API recipient for entitlement verification | Add details when paid entitlement functions ship.                                                                                                                                                                                                                                                                                                                                |
| Transactional email provider                  | Processor for inactive-account, breach, and rights-request emails                        | Not selected. Do not automate TASK-18 emails until selected and recorded.                                                                                                                                                                                                                                                                                                        |

## International Transfers

Google services may process data outside Ireland, the UK, or the EEA. The
project record relies on Google's published data-processing terms, transfer
safeguards, and SCC posture where applicable. User-owned Drive storage follows
the user's own Google account relationship and settings.

## Retention Cross-Reference

Detailed retention periods live in `docs/retention.md`. Any update to retention
automation must update both files and the public privacy notice.

## Open Operational Checks

- Confirm Firestore database location for `journal-manna` in the Firebase
  console and record it here.
- Confirm Cloud Logging bucket retention is set to 30 days.
- Confirm Firebase Data Processing and Security Terms / Google Cloud CDPA are
  accepted for the Firebase/Google Cloud billing account or project.
- Select and document a transactional email provider before inactive-account or
  breach-email automation ships.
