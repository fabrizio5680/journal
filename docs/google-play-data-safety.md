# Google Play Data Safety

Source of truth for the Google Play Console Data safety form for Quiet
Dwelling. Keep this document aligned with `/privacy`, `/account-deletion`,
`docs/ropa.md`, and any Android/TWA wrapper changes before each Play release.

Policy sources reviewed:

- Google Play Data safety form guidance:
  `https://support.google.com/googleplay/android-developer/answer/10787469`
- Google Play account deletion requirements:
  `https://support.google.com/googleplay/android-developer/answer/13327111`

Google's form treats data as collected when it is transmitted off the user's
device. Pure on-device processing does not need to be declared as collected, but
Quiet Dwelling still discloses local journal storage in the Privacy Policy for
GDPR transparency under Art. 12-14.

## App-Level Answers

| Question area                | Answer for first release                                                                 |
| ---------------------------- | ---------------------------------------------------------------------------------------- |
| App collects user data       | Yes                                                                                      |
| App shares user data         | No, except user-initiated/provider flows and service-provider processing described below |
| Data encrypted in transit    | Yes, HTTPS/TLS for Firebase, Google Drive, Google Play, and scripture API requests       |
| Users can request deletion   | Yes, in Settings and at `https://thequietdwelling.com/account-deletion`                  |
| Independent security review  | No                                                                                       |
| Committed to Families policy | No, app is not child-directed                                                            |
| Ads or ad ID                 | No ads, no advertising ID use                                                            |
| Analytics                    | No analytics SDKs or analytics purposes                                                  |

## Data Type Mapping

| Play data type                             | Collected?           | Shared? | Required or optional                                                | Purpose(s)                                                                  | Retained?            | Quiet Dwelling data covered                                                                                                                           |
| ------------------------------------------ | -------------------- | ------- | ------------------------------------------------------------------- | --------------------------------------------------------------------------- | -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Personal info: Name                        | Yes                  | No      | Required for account                                                | Account management, app functionality                                       | Yes                  | Google display name from Google Sign-In, if provided                                                                                                  |
| Personal info: Email address               | Yes                  | No      | Required for account                                                | Account management, developer communications                                | Yes                  | Google account email; Drive account email if Drive sync connected                                                                                     |
| Personal info: User IDs                    | Yes                  | No      | Required for account                                                | Account management, security and compliance                                 | Yes                  | Firebase UID, Google provider ID, optional Drive folder/file IDs where linked to user account                                                         |
| Personal info: Photo                       | Yes                  | No      | Optional profile data                                               | Account management, app functionality                                       | Yes                  | Google profile photo URL displayed in the app                                                                                                         |
| Personal info: Religious beliefs           | Yes                  | No      | Optional                                                            | App functionality                                                           | Yes                  | Scripture references when the user consents and syncs to Google Drive; local-only scripture refs are disclosed in policy but not collected for Play   |
| Health and fitness: Health info            | Yes                  | No      | Optional                                                            | App functionality                                                           | Yes                  | Mood/emotional-state labels when the user consents and syncs to Google Drive; treat conservatively as sensitive/health-related                        |
| App activity: Other user-generated content | Yes                  | No      | Required for journaling if Drive sync is used; local-only otherwise | App functionality                                                           | Yes                  | Journal entry files, tags, word counts, Drive manifest, and conflict backups when synced to user's Google Drive                                       |
| App activity: In-app search history        | No                   | No      | Not applicable                                                      | Not applicable                                                              | No                   | Search runs locally over IndexedDB and is not transmitted                                                                                             |
| App activity: App interactions             | Yes                  | No      | Required for account/service metadata                               | App functionality, security and compliance                                  | Yes                  | Policy acceptance, age attestation, storage connection status, reminder settings, last entry date/saved timestamps                                    |
| Device or other IDs                        | Yes                  | No      | Optional for reminders; required for local conflict labels          | App functionality, developer communications                                 | Yes                  | FCM device tokens for reminders; local device identity stays on device unless included in user-owned Drive conflict metadata                          |
| Financial info: Purchase history           | Yes                  | No      | Required for paid Android access                                    | App functionality, account management, fraud prevention/security/compliance | Yes                  | Product ID, purchase token, entitlement status, relevant order/reference, and timestamps                                                              |
| App info and performance: Diagnostics      | Yes                  | No      | Required for service operations                                     | Security and compliance                                                     | Yes                  | Cloud Function operational logs with minimized identifiers                                                                                            |
| Audio: Voice or sound recordings           | No by Quiet Dwelling | No      | Optional dictation feature                                          | App functionality                                                           | No by Quiet Dwelling | Browser speech recognition may be processed by the browser provider. Do not add native Android microphone/audio collection without updating this form |

## Service Providers And Sharing Position

Google Play distinguishes collection from sharing. For first release, treat the
following as service-provider or user-initiated flows rather than selling or
third-party sharing:

- Google Firebase / Google Cloud: service provider for Auth, Firestore,
  Functions, Hosting, FCM, and Cloud Logging.
- User's Google Drive: user-initiated sync into the user's own Google account
  using `drive.file` scope.
- Google Play Billing / Google Commerce Limited: payment and merchant-of-record
  flow for Android purchases.
- scripture.api.bible: no personal data intentionally sent; API key only.

If a new SDK, analytics tool, crash reporter, support widget, ad network, or
email automation provider is added, update this document before uploading a new
AAB or changing the Data safety form.

## Deletion Mapping

| Data category                   | Deletion mechanism                                                                                                                  |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| Firebase Auth user              | Settings account deletion or verified email request                                                                                 |
| Firestore account metadata      | Settings account deletion or verified email request                                                                                 |
| FCM tokens                      | Reminder disable, stale-token cleanup, account deletion                                                                             |
| Google Drive OAuth token        | Drive disconnect, account deletion, or Google permission revocation                                                                 |
| Synced Drive entries            | Optional in-app Drive folder deletion during account deletion, or user deletes `Quiet Dwelling/` in Drive                           |
| Local IndexedDB/localStorage    | In-app cleanup on active devices; other devices clear on next auth/deletion enforcement check; user can also clear browser/app data |
| Purchase entitlement metadata   | Account deletion, subject to legal/accounting/security retention needs                                                              |
| Rights/deletion request records | Retained only as needed for accountability and legal obligations                                                                    |

## Console Review Checklist

- Privacy policy URL: `https://thequietdwelling.com/privacy`
- Account deletion URL: `https://thequietdwelling.com/account-deletion`
- Data safety answers match this document and the live Privacy Policy.
- No analytics, ads, Crashlytics, Performance Monitoring, or advertising ID are
  present in the web app or TWA wrapper.
- Android permissions and SDK inventory in `docs/play-store-submission.md` has
  been reviewed for the exact AAB being submitted.
