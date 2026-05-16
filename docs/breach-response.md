# Personal Data Breach Response Procedure

This procedure supports GDPR and UK GDPR breach handling for Quiet Dwelling. It
is an operational runbook, not legal advice. For high-risk incidents or
regulator contact, involve qualified data protection counsel.

## Scope

A personal data breach is a breach of security leading to accidental or unlawful
destruction, loss, alteration, unauthorised disclosure of, or access to personal
data (GDPR Art. 4(12)). This procedure covers data processed by Quiet Dwelling:

- Firebase Auth profile data, Firestore account metadata, reminder tokens, Drive
  OAuth token records, and Cloud Function logs.
- Journal content only where Quiet Dwelling code or access credentials expose or
  alter the user's IndexedDB or app-created Google Drive files.
- Support, deletion, and rights-request correspondence handled by the operator.

## Detection Sources

Monitor these channels for possible incidents:

- Firebase and Google Cloud IAM/security alerts.
- Firestore Security Rules denials or unexpected allow patterns.
- Cloud Functions error spikes, unusual OAuth token-refresh errors, or abnormal
  reminder-send behaviour.
- Firebase Auth account compromise reports.
- Google Cloud/Firebase service incident reports.
- User reports to `privacy@thequietdwelling.com`.
- Operator mailbox compromise or misdirected rights-request correspondence.

## Severity Triage

Record every suspected incident in a local incident log with time discovered,
reporter, affected systems, preliminary facts, and next action.

| Severity | Examples                                                                                                             | Initial response                                                                 |
| -------- | -------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| Critical | OAuth refresh tokens exposed, Firestore rules allow cross-user reads, journal files accessed through app credentials | Contain immediately, preserve evidence, begin Art. 33 risk assessment            |
| High     | Account metadata or FCM tokens exposed, authenticated endpoint allows another user's provider metadata               | Contain immediately, verify scope, assess notification duty                      |
| Medium   | Raw UID log exposure, support email sent to wrong person, stale token not deleted                                    | Contain and document, assess whether risk to individuals exists                  |
| Low      | Non-personal outage, failed login noise, anonymous telemetry-free build issue                                        | Document if relevant; no GDPR breach record needed unless personal data involved |

## First 24 Hours

1. Confirm whether personal data is involved (Art. 4(1), Art. 4(12)).
2. Contain the issue: disable affected Function, patch rules, rotate secrets,
   revoke OAuth credentials, or pause deployment as needed.
3. Preserve evidence: relevant deploy SHA, Cloud Logging extracts, Firebase rule
   version, support emails, screenshots, and timestamps.
4. Identify affected data categories, users, systems, recipients, and likely
   consequences.
5. Start the 72-hour clock once Quiet Dwelling is aware of a personal data
   breach with enough certainty to conclude that personal data was compromised.
6. Decide whether notification to the Irish DPC is required.

Under GDPR Art. 33, notify the supervisory authority without undue delay and,
where feasible, within 72 hours after becoming aware of a personal data breach,
unless the breach is unlikely to result in a risk to individuals. If notification
is late, include reasons for the delay.

## Supervisory Authority Notification

Quiet Dwelling's lead supervisory authority is the Irish Data Protection
Commission. A notification should include, as required by GDPR Art. 33(3):

- Nature of the breach, including categories and approximate number of data
  subjects and records affected.
- Contact point: `privacy@thequietdwelling.com`.
- Likely consequences.
- Measures taken or proposed to address the breach and mitigate adverse effects.

If all facts are not available within 72 hours, submit an initial notification
and provide additional information in phases (Art. 33(4)).

## User Notification

If the breach is likely to result in a high risk to users' rights and freedoms,
notify affected users without undue delay (Art. 34). The notice should use plain
language and include:

- What happened.
- What data was involved.
- What Quiet Dwelling has done.
- What the user can do, such as revoking Google Drive permissions at
  `https://myaccount.google.com/permissions`, changing Google account security
  settings, deleting affected Drive files, or contacting support.
- Contact path for questions and rights requests.

User notification may not be required where an Art. 34 exception applies, such as
effective protection rendering data unintelligible, subsequent measures removing
the high risk, or disproportionate effort requiring public communication instead.
Document the reasoning.

## Containment Playbooks

### Firestore Rule Exposure

- Roll back or patch `firestore.rules`.
- Deploy rules only after emulator/rules tests pass.
- Query access logs where available to identify affected paths.
- Assess whether exposed fields include identifiers, reminder tokens, provider
  metadata, or private OAuth paths.

### OAuth Refresh Token Exposure

- Revoke affected Google tokens via Google's revocation endpoint.
- Delete `users/{uid}/private/googleDriveOAuth` for affected users.
- Mark `storageTokenStatus: "reconnect"` on affected user docs.
- Notify users to re-connect Drive after containment.

### Cloud Function or Secret Exposure

- Disable the affected Function or pause triggers.
- Rotate affected secrets in Firebase/Google Cloud.
- Review deployment history and IAM access.
- Redeploy from a clean commit.

### User Drive File Exposure

- Determine whether exposure came from Quiet Dwelling credentials/code or the
  user's own Google account configuration.
- If Quiet Dwelling caused it, treat entry files, metadata, and conflict backups
  as sensitive journal content.
- Give user-specific remediation steps for Drive permissions and affected files.

## Post-Incident Review

Within 10 business days:

- Document root cause, affected data, notification decisions, containment, and
  remediation.
- Update `docs/ropa.md`, `docs/dpia.md`, `docs/retention.md`, and the privacy
  notice if the processing or risk profile changed.
- Add tests or monitoring that would have caught the issue earlier.
- Record whether any processor notification or contractual follow-up is needed
  under Art. 28.

## External References

- GDPR Art. 33 and Art. 34: breach notification and communication duties.
- EDPB SME guide on data breaches:
  `https://www.edpb.europa.eu/sme-data-protection-guide/data-breaches_en`.
