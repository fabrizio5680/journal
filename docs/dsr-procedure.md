# Data Subject Rights Procedure

Internal procedure for handling GDPR, UK GDPR, and similar privacy-rights
requests for Quiet Dwelling. This supports GDPR Art. 12 and Art. 15-22, with
accountability records under Art. 5(2).

## Scope

Requests may include:

- Access to personal data.
- Correction/rectification.
- Export/portability.
- Account or data deletion.
- Restriction of processing.
- Objection to processing.
- Withdrawal of consent for mood or scripture processing.
- Complaint or escalation to a supervisory authority.

California residents can use the same intake path for access, deletion,
correction, and portability requests. This procedure is operational guidance,
not legal advice.

## Intake Channels

| Channel                        | Use                                                                                   |
| ------------------------------ | ------------------------------------------------------------------------------------- |
| In-app Settings export         | Immediate self-service access and portability for profile metadata plus local entries |
| In-app Settings deletion       | Self-service account deletion and optional Drive folder deletion                      |
| `privacy@thequietdwelling.com` | Fallback rights, deletion, correction, and objection requests                         |
| `/account-deletion`            | Public instructions required for users who cannot access the app                      |

If a separate `support@thequietdwelling.com` address is added later, route
privacy-rights requests to the privacy mailbox or tag them clearly.

## Response Clocks

| Rule                            | Target                                                                                  |
| ------------------------------- | --------------------------------------------------------------------------------------- |
| Acknowledge request             | Within 7 calendar days where practical                                                  |
| Complete standard GDPR response | Within 1 month of receipt                                                               |
| Extension                       | Up to 2 further months for complex or numerous requests; explain within the first month |
| Urgent deletion/security case   | Prioritise immediately if token, account compromise, or safety risk is alleged          |

## Identity Verification

1. Prefer requests sent from the Google account email associated with the Quiet
   Dwelling account.
2. If the request arrives from another address, ask the requester to sign in and
   use the in-app flow or send confirmation from the account email.
3. Do not request excessive identity documents for ordinary account requests.
4. For account deletion, verify the target email/account before deleting.
5. For third-party or representative requests, require clear authorisation before
   disclosing or changing account data.

## Request Handling Steps

1. Log the request in the DSR register.
2. Classify the request type and applicable law/jurisdiction.
3. Verify identity using the minimum information needed.
4. Locate data:
   - Firebase Auth user.
   - Firestore `users/{uid}` metadata.
   - Firestore private Google Drive OAuth token record, if present.
   - FCM tokens and reminder settings.
   - Purchase entitlement metadata, if present.
   - Support/deletion correspondence.
   - Cloud Function logs if relevant and still within retention.
   - Explain that local device data and user-owned Google Drive files may need
     user action unless the in-app Drive deletion flow is available and selected.
5. Fulfil the request or document a lawful refusal/limitation.
6. Send the response in plain language.
7. Update the DSR register with outcome, date, and any retained accountability
   record.

## Request-Specific Playbooks

| Request type       | Procedure                                                                                                                                                                  |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Access             | Export Firestore profile/service metadata and describe local/Drive data locations. For entry content, direct signed-in users to Settings export and Drive files.           |
| Portability        | Use Settings JSON export where possible. For email requests, provide machine-readable account metadata and explain Drive JSON location.                                    |
| Rectification      | Correct account metadata that Quiet Dwelling controls. Ask users to edit their own journal entries or Drive files directly where applicable.                               |
| Deletion           | Use the same deletion path as Settings where possible: revoke/delete OAuth token, delete Firestore metadata, delete Firebase Auth user, and explain local/Drive leftovers. |
| Restriction        | Where feasible, disable optional processing such as reminders or Drive sync. If not technically possible, explain limits and offer deletion.                               |
| Objection          | Assess processing based on legitimate interests, such as logs or stale-token cleanup. Stop processing where the objection overrides the interest.                          |
| Consent withdrawal | Record withdrawal for mood and/or scripture processing. New writes are blocked; existing entry data remains unless the user edits or deletes it.                           |

## DSR Register

Keep a minimal private register. Do not store journal content in the register.

| Field               | Purpose                                                  |
| ------------------- | -------------------------------------------------------- |
| Request ID          | Internal reference                                       |
| Received at         | Response clock                                           |
| Requester email     | Contact and verification                                 |
| Account UID/email   | Target account                                           |
| Request type        | Access, deletion, correction, etc.                       |
| Verification status | Pending, verified, refused                               |
| Actions taken       | Short operational summary                                |
| Response sent at    | Completion evidence                                      |
| Retained records    | Any lawful/accountability record kept and retention note |

Retention: keep DSR register entries only as long as needed to prove handling,
resolve disputes, or meet legal obligations. Review at least annually.

## Response Templates

### Acknowledgement

```text
Thanks for contacting Quiet Dwelling. We received your privacy request on
[DATE]. We may need to verify that you control the Google account connected to
the Quiet Dwelling account before we act on it. We normally respond within one
month.
```

### Deletion Complete

```text
Your Quiet Dwelling account deletion request was completed on [DATE].

We deleted the Firebase Authentication account and Quiet Dwelling account
metadata we control. If you used Google Drive sync, files in your own Google
Drive may remain unless you deleted the Quiet Dwelling folder yourself or used
the in-app option to delete it before access was revoked. You may also need to
clear browser/app data on devices that no longer sign in.
```

### Limitation Or Refusal

```text
We cannot complete [REQUEST] in the way requested because [REASON]. We have
completed the parts we can: [ACTIONS]. You may contact the Irish Data
Protection Commission or your local supervisory authority if you disagree with
this response.
```
