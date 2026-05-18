# Global Market Matrix

Launch status and privacy/consumer-law notes for Quiet Dwelling. GDPR remains
the baseline, but this matrix prevents accidental "worldwide" launch claims
before local requirements are checked.

This is a technical planning record, not legal advice. Markets with paid
distribution, special-category data, minors, or cross-border transfer questions
should be reviewed by qualified counsel before expansion.

## Release Posture

| Market / region               | Launch status   | Key requirements before enabling paid Android distribution                                                                     | Notes                                                                                      |
| ----------------------------- | --------------- | ------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------ |
| Ireland                       | First release   | GDPR Art. 13 privacy notice, Art. 30 RoPA, Art. 35 DPIA, breach procedure, DSR process, Play Data safety, account deletion URL | Controller home jurisdiction; Irish DPC is lead supervisory authority                      |
| United States                 | First release   | Short US/California privacy notice, no sale/share statement, no targeted ads, COPPA 16+ posture, payment/refund clarity        | Avoid medical/therapy claims; monitor CCPA/CPRA thresholds and state privacy-law expansion |
| United Kingdom                | Second step     | UK GDPR/ICO complaint language, ICO fee assessment, Article 27 UK representative assessment, mandatory consumer rights wording | Do not enable until fee/representative questions are recorded                              |
| European Union beyond Ireland | Later expansion | Member-state consumer terms review, language/localisation decision, Art. 27 not needed for EU because controller is in Ireland | GDPR baseline applies; consider local consumer and ePrivacy differences                    |
| Canada                        | Later expansion | PIPEDA/provincial privacy review, consumer terms review, transfer notice                                                       | English market candidate after first release                                               |
| Australia                     | Later expansion | Australian Privacy Act review, consumer guarantees wording                                                                     | English market candidate after first release                                               |
| New Zealand                   | Later expansion | Privacy Act 2020 review, transfer/storage notice                                                                               | English market candidate after first release                                               |
| Brazil                        | Hold            | LGPD lawful-basis and data-subject-rights mapping in Portuguese, DPO/contact assessment                                        | Do not claim coverage until local notice is drafted                                        |
| Japan                         | Hold            | APPI transfer and sensitive information review, localisation                                                                   | Religious/mood data needs careful local treatment                                          |
| South Korea                   | Hold            | PIPA consent, transfer, and localisation review                                                                                | Strict consent/transfer regime                                                             |
| India                         | Hold            | DPDP Act implementation status, consent/notice review, grievance/contact requirements                                          | Track rules and app-store/payment requirements                                             |
| Rest of world                 | Hold            | Market-by-market legal review                                                                                                  | Use "available in selected countries"; do not state worldwide availability                 |

## First-Release Requirements

Complete before Ireland/US launch:

- Public `/privacy`, `/terms`, and `/account-deletion` routes are live and
  non-login-gated.
- Google Play Data safety answers are drafted from
  `docs/google-play-data-safety.md`.
- Target audience is 16+ only and app assets are not child-directed.
- No ads, analytics, third-party search index, Crashlytics, or Performance
  Monitoring are enabled.
- Sensitive-data consent for mood and scripture is explicit, granular, and
  recorded.
- Settings includes export, consent withdrawal, and account deletion.
- RoPA, DPIA, retention, breach response, DSR procedure, and Play submission
  inventory are current.

Complete before UK launch:

- Record whether ICO data protection fee registration is required.
- Record whether an Article 27 UK representative is required for an
  Ireland-based controller offering a paid service to UK users and processing
  potentially special-category data.
- Add UK representative details to `/privacy` and `docs/ropa.md` if required.

## Marketing And Listing Guardrails

- Use "available in selected countries" until this matrix is reviewed for each
  additional market.
- Do not make global compliance claims.
- Do not describe the app as therapy, counselling, clinical mental-health
  tracking, or crisis support.
- Do not claim end-to-end encryption or "only you can read your entries" while
  synced Google Drive files remain readable by Google under the user's Google
  account relationship.
- Keep store screenshots and copy mature, reflective, and not child-directed.

## Open Legal Checks

| Item                                     | Owner | Status |
| ---------------------------------------- | ----- | ------ |
| Exact Play Console developer name        | TBD   | Open   |
| Sole-trader service address for policies | TBD   | Open   |
| Separate support email decision          | TBD   | Open   |
| Transactional email provider and DPA     | TBD   | Open   |
| Google/Firebase DPA acceptance record    | TBD   | Open   |
| Firestore/Cloud Logging region evidence  | TBD   | Open   |
| ICO fee assessment                       | TBD   | Open   |
| UK Article 27 representative assessment  | TBD   | Open   |
