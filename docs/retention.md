# Data Retention Policy

Quiet Dwelling is local-first. Journal entry bodies are retained primarily on the
user's device and, when enabled, in the user's own Google Drive. Firestore stores
account and service metadata only.

## Retention Schedule

| Data category                                | Location                                                            | Retention period                                                                                                              | Deletion path                                                                                    |
| -------------------------------------------- | ------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Journal entries                              | IndexedDB on the user's device                                      | Until the user deletes the entry, clears browser/app data, or deletes the account locally                                     | In-app entry delete, browser/app data removal, or account deletion cleanup                       |
| Synced journal files                         | User's Google Drive `Quiet Dwelling/entries/`                       | Until the user deletes them from Drive or chooses a future in-app Drive deletion option                                       | User-managed Google Drive deletion; future account deletion flow may offer Drive folder deletion |
| Deleted entry tombstones                     | Local storage and Drive metadata where applicable                   | 30 days from `deletedAt`                                                                                                      | Soft-delete cleanup process                                                                      |
| Drive manifest                               | User's Google Drive `Quiet Dwelling/metadata.json`                  | Until Drive sync is disabled and the user deletes the app folder, or account deletion removes it if selected                  | User-managed Drive deletion or future in-app Drive folder deletion                               |
| Drive conflict backups                       | User's Google Drive `Quiet Dwelling/conflicts/`                     | Retained until manually deleted; target improvement is a cap of the last 10 backups per entry date or a Settings clear action | User-managed Drive deletion today; TASK-16 will add in-app visibility or clearing                |
| Firebase user profile and preferences        | Firestore `users/{uid}`                                             | Active account lifetime; inactive-account deletion target is 3 years with warning at 2 years 10 months                        | Account deletion flow or planned inactive-account cleanup                                        |
| Google Drive OAuth refresh token             | Firestore `users/{uid}/private/googleDriveOAuth`                    | While Drive sync remains connected                                                                                            | Revoked on Drive disconnect where possible; deleted on account deletion                          |
| FCM reminder tokens                          | Firestore `users/{uid}.fcmTokens[]` and localStorage                | While reminders are enabled on a device                                                                                       | Removed when reminders are disabled, when send failure proves stale, or on account deletion      |
| Cloud Function logs                          | Google Cloud Logging                                                | Target retention: 30 days                                                                                                     | Configure log bucket retention in Google Cloud                                                   |
| Support, deletion, and rights-request emails | Operator mailbox and records                                        | Only as long as needed to answer the request, meet legal obligations, and keep accountability evidence                        | Manual review and deletion under the rights-request process                                      |
| Purchase entitlement metadata                | Firestore `users/{uid}.premiumEntitlement` when paid features exist | Account lifetime plus any legally required accounting or dispute period                                                       | Account deletion, subject to legal record requirements                                           |

## Inactive Accounts

The product decision in `GDPR.md` is to treat an account as inactive after 3
years with no sign-in or journal save activity. The planned operational flow is:

1. Send a warning email at 2 years and 10 months of inactivity.
2. Delete Firebase Auth and Firestore account metadata at 3 years.
3. Leave the user's Google Drive `Quiet Dwelling/` folder in place unless the
   user explicitly requests or selects Drive deletion.

This requires a transactional email provider before automation can be shipped.

## User-Controlled Storage

Users can delete local browser/app data at any time. Users who connected Google
Drive can also delete `Quiet Dwelling/` files directly in Drive. Revoking Google
permissions at `https://myaccount.google.com/permissions` stops future app
access but does not delete already-created Drive files.

## Operational Notes

- Firestore must not store journal entry bodies, Tiptap JSON, search text,
  scripture refs, tags, or mood history.
- Cloud Function logs should avoid raw Firebase UIDs and should use a 30-day log
  bucket retention setting.
- Conflict backups contain full entry snapshots and should be treated with the
  same sensitivity as journal entries.
