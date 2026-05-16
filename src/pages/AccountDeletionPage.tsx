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

export default function AccountDeletionPage() {
  usePageTitle('Account Deletion')

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
            Account Deletion
          </p>
          <h1 className="font-display text-on-surface text-4xl leading-tight font-light md:text-5xl">
            How to request deletion of your Quiet Dwelling account.
          </h1>
          <p className="text-on-surface-variant max-w-2xl text-sm leading-7">
            This public page supports Google Play and privacy-rights requests while the in-app
            deletion flow is being implemented.
          </p>
        </header>

        <div className="space-y-10">
          <Section title="In-App Deletion">
            <p>
              An in-app deletion path is planned for Settings. When available, it will let you
              delete your Quiet Dwelling account and choose whether the app should also try to
              delete the Quiet Dwelling folder from your Google Drive while it still has access.
            </p>
            <p>Until that flow is live, use the public request path below.</p>
          </Section>

          <Section title="Request Deletion By Email">
            <p>
              Email{' '}
              <a className="text-primary hover:underline" href={`mailto:${CONTACT_EMAIL}`}>
                {CONTACT_EMAIL}
              </a>{' '}
              from the Google account you use with Quiet Dwelling. Use the subject &quot;Delete my
              Quiet Dwelling account&quot; and include the email address connected to your account.
            </p>
            <p>
              We may ask for additional verification before deleting data. GDPR and UK GDPR requests
              are normally answered within one month, unless a lawful extension applies. California
              residents can use the same request path.
            </p>
          </Section>

          <Section title="What We Delete">
            <p>
              Account deletion is intended to remove your Firebase Authentication user, Firestore
              account metadata, reminder tokens, Google Drive OAuth token held by Quiet Dwelling,
              and any legacy server-side entry records if present.
            </p>
            <p>
              Local browser data on your devices is cleared by the in-app flow when it is available.
              For an email-only deletion request, you may also need to clear site data from each
              browser or uninstall the app to remove local IndexedDB and localStorage copies from
              devices we cannot reach.
            </p>
          </Section>

          <Section title="Google Drive Files">
            <p>
              If you enabled Google Drive sync, your journal files are stored in your own Google
              Drive. Those files remain in your Drive unless you delete them yourself or use an
              in-app deletion option that asks Quiet Dwelling to delete the folder before access is
              revoked.
            </p>
            <p>
              You can manually delete the Quiet Dwelling folder in Google Drive. You can also revoke
              the app&apos;s Google access at{' '}
              <a
                className="text-primary hover:underline"
                href="https://myaccount.google.com/permissions"
                target="_blank"
                rel="noopener noreferrer"
              >
                myaccount.google.com/permissions
              </a>
              . If access is revoked before Drive deletion, Quiet Dwelling may no longer be able to
              remove files from your Drive for you.
            </p>
          </Section>

          <Section title="What May Remain">
            <p>
              We may retain limited records where required for legal obligations, fraud prevention,
              security, accounting, Google Play payment records, or proof that a deletion request
              was handled. We keep these records only as long as necessary for those purposes.
            </p>
            <p>
              Google may retain data under its own policies for Google accounts, Google Drive, and
              Google Play Billing.
            </p>
          </Section>

          <Section title="Related Policies">
            <p>
              Read the{' '}
              <Link className="text-primary hover:underline" to="/privacy">
                Privacy Policy
              </Link>{' '}
              for more detail about data handling, rights, storage, and contacts. The{' '}
              <Link className="text-primary hover:underline" to="/terms">
                Terms of Service
              </Link>{' '}
              explain account responsibilities and payment handling.
            </p>
          </Section>
        </div>
      </div>
    </main>
  )
}
