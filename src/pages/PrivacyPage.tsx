import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'

import { usePageTitle } from '@/hooks/usePageTitle'

const CONTACT_EMAIL = 'privacy@thequietdwelling.com'

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="font-display text-on-surface text-2xl font-light">{title}</h2>
      <div className="text-on-surface-variant space-y-3 text-sm leading-7">{children}</div>
    </section>
  )
}

export default function PrivacyPage() {
  usePageTitle('Privacy Policy')

  return (
    <main className="bg-background min-h-screen">
      <div className="mx-auto max-w-3xl px-5 py-10 md:py-16">
        <Link
          to="/login"
          className="text-on-surface-variant/60 hover:text-primary inline-flex items-center gap-2 text-xs font-semibold tracking-[0.18em] uppercase"
        >
          <span className="material-symbols-outlined text-[18px]">arrow_back</span>
          Quiet Dwelling
        </Link>

        <header className="mt-10 mb-12 space-y-4">
          <p className="text-primary text-xs font-semibold tracking-[0.2em] uppercase">
            Privacy Policy
          </p>
          <h1 className="font-display text-on-surface text-4xl leading-tight font-light md:text-5xl">
            Your journal is local-first, and this policy says what that means.
          </h1>
          <p className="text-on-surface-variant max-w-2xl text-sm leading-7">
            Effective May 15, 2026. Version 0.1 for the first Ireland, United States, and United
            Kingdom release posture.
          </p>
        </header>

        <div className="space-y-10">
          <Section title="Who We Are">
            <p>
              Quiet Dwelling is operated by Fabrizio Bottaro as a sole trader in the Republic of
              Ireland. For privacy questions, rights requests, or deletion requests, contact{' '}
              <a className="text-primary hover:underline" href={`mailto:${CONTACT_EMAIL}`}>
                {CONTACT_EMAIL}
              </a>
              .
            </p>
          </Section>

          <Section title="Plain English Summary">
            <p>
              Quiet Dwelling is a local-first journal. Your entry bodies are stored on your device
              in IndexedDB. If you choose Google Drive sync, the app writes your entries and sync
              files into your own Google Drive, under a Quiet Dwelling folder. We do not run
              analytics, targeted advertising, ads, or a third-party search index.
            </p>
            <p>
              We use Firebase for sign-in, account metadata, reminders, and the server functions
              needed to connect Google Drive. Journal entry bodies should not be stored in
              Firestore.
            </p>
          </Section>

          <Section title="Data We Process">
            <p>
              We process your Google sign-in profile, such as user ID, email, display name, and
              photo URL, so you can sign in. We store app metadata such as reminder settings,
              storage-provider status, Google Drive folder IDs, sync timestamps, and device push
              tokens if you enable reminders.
            </p>
            <p>
              Your journal entries, mood labels, and scripture references are sensitive personal
              content. They stay on your device unless you enable Google Drive sync. A separate
              consent flow for sensitive journal data is planned before launch.
            </p>
            <p>
              If the Android app uses Google Play Billing, Google handles purchases and refunds.
              Quiet Dwelling may store only the minimum entitlement metadata needed to confirm paid
              access, such as product ID, purchase token, status, and timestamps.
            </p>
          </Section>

          <Section title="Google Drive Sync">
            <p>
              Google Drive sync is optional. When connected, Quiet Dwelling requests limited Drive
              access for app-created files. It creates a Quiet Dwelling folder in your Drive and may
              write entry files, metadata.json, and conflict backup files under conflicts/.
            </p>
            <p>
              A Google OAuth refresh token may be stored server-side in a restricted Firebase path
              and used only by Cloud Functions that exchange or refresh Google Drive access tokens.
              You can revoke Quiet Dwelling&apos;s Google access at{' '}
              <a
                className="text-primary hover:underline"
                href="https://myaccount.google.com/permissions"
                target="_blank"
                rel="noopener noreferrer"
              >
                myaccount.google.com/permissions
              </a>
              .
            </p>
          </Section>

          <Section title="Why We Use Data">
            <p>
              We use account and app metadata to provide the service, keep your account signed in,
              sync entries when you ask us to, send reminders if enabled, support paid access where
              applicable, answer support or deletion requests, and keep the service secure.
            </p>
            <p>
              For GDPR and UK GDPR purposes, the main lawful bases are contract necessity,
              legitimate interests in operating and securing the service, legal obligations for
              records we must keep, and consent where the app asks for optional or sensitive-data
              processing.
            </p>
          </Section>

          <Section title="Recipients And Transfers">
            <p>
              We use Google Firebase services for authentication, Firestore metadata, Cloud
              Functions, Hosting, and Firebase Cloud Messaging. Optional Google Drive sync stores
              files in your own Google account. Android purchases and refunds are handled by Google
              Play Billing.
            </p>
            <p>
              These providers may process data outside Ireland, the UK, or the EEA. We rely on
              Google&apos;s published data-processing and transfer safeguards where applicable.
            </p>
          </Section>

          <Section title="Storage And Retention">
            <p>
              Entry bodies remain in your browser storage until you delete them, clear browser data,
              or delete the local app data. Google Drive files remain in your Drive until you delete
              them or choose an in-app deletion option when available.
            </p>
            <p>
              Account metadata, OAuth tokens, reminder tokens, entitlement metadata, support emails,
              and deletion request records are kept only as long as needed for the service, legal
              obligations, security, or accountability.
            </p>
            <p>
              Quiet Dwelling uses browser storage that is necessary for the app to work, including
              IndexedDB entry storage and localStorage keys for device preferences, provider state,
              scripture cache, and reminder tokens. We do not use non-essential cookie banners,
              analytics cookies, or ad tracking.
            </p>
          </Section>

          <Section title="Your Rights">
            <p>
              You can ask to access, correct, export, delete, restrict, or object to processing of
              your personal data. You can also withdraw consent where processing is based on
              consent. Contact{' '}
              <a className="text-primary hover:underline" href={`mailto:${CONTACT_EMAIL}`}>
                {CONTACT_EMAIL}
              </a>
              . We may need to verify your identity before acting on a request.
            </p>
            <p>
              EU users may complain to the Irish Data Protection Commission. UK users may complain
              to the Information Commissioner&apos;s Office. California residents can use the same
              contact path for access, deletion, correction, and portability requests. We do not
              sell or share personal information, use targeted advertising, or run analytics.
            </p>
          </Section>

          <Section title="Children, Security, And Changes">
            <p>
              Quiet Dwelling is for people aged 16 or older. We use access controls, Firebase
              security rules, HTTPS, restricted token paths, and local-first design to reduce how
              much journal content reaches our systems. No system can be guaranteed perfectly
              secure, especially when content is stored on your own device or Google account.
            </p>
            <p>
              If a breach creates a notification obligation, we will assess and notify under GDPR
              and UK GDPR requirements. We may update this policy as the product changes and will
              ask for renewed acceptance where required.
            </p>
          </Section>

          <Section title="Data Deletion">
            <p>
              Public deletion instructions are available at{' '}
              <Link className="text-primary hover:underline" to="/account-deletion">
                /account-deletion
              </Link>
              . The in-app deletion flow is planned for a later phase. Until then, contact{' '}
              <a className="text-primary hover:underline" href={`mailto:${CONTACT_EMAIL}`}>
                {CONTACT_EMAIL}
              </a>{' '}
              to request deletion.
            </p>
          </Section>
        </div>
      </div>
    </main>
  )
}
