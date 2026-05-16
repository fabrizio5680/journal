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

export default function TermsPage() {
  usePageTitle('Terms of Service')

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
            Terms of Service
          </p>
          <h1 className="font-display text-on-surface text-4xl leading-tight font-light md:text-5xl">
            Terms for using Quiet Dwelling.
          </h1>
          <p className="text-on-surface-variant max-w-2xl text-sm leading-7">
            Effective May 15, 2026. Version 0.1 for the first Ireland, United States, and United
            Kingdom release posture.
          </p>
        </header>

        <div className="space-y-10">
          <Section title="Acceptance And Age">
            <p>
              By using Quiet Dwelling, you agree to these terms and the Privacy Policy. Quiet
              Dwelling is for people aged 16 or older. Do not use the service if you are under 16.
            </p>
          </Section>

          <Section title="The Service">
            <p>
              Quiet Dwelling is a local-first journaling app for reflection, prayer, and personal
              notes. The web and PWA experience may be free. The Android trusted web activity or
              future premium features may be paid or require Google Play Billing.
            </p>
            <p>
              Quiet Dwelling is not a medical, counselling, therapy, emergency, or crisis service.
              Do not rely on it for urgent help.
            </p>
          </Section>

          <Section title="Your Account">
            <p>
              You sign in with Google. You are responsible for keeping your Google account secure,
              controlling devices where you use the app, and making sure the email address on your
              account can receive important notices.
            </p>
          </Section>

          <Section title="Your Entries">
            <p>
              You own your journal entries. Quiet Dwelling does not claim ownership of them. The
              service has permission only to store, display, sync, and process your content as
              needed to provide features you use.
            </p>
            <p>
              Because entries are local-first and may sync to your own Google Drive, you are
              responsible for the content you write and for managing copies on your devices and
              Google account.
            </p>
          </Section>

          <Section title="Payments And Refunds">
            <p>
              Android purchases are handled through Google Play Billing. Google may act as the
              merchant or seller of record where applicable, and Google Play policies apply to
              payment handling, cancellation, and refunds. Quiet Dwelling may store minimal
              entitlement metadata to confirm access.
            </p>
            <p>
              Future paid features will be presented with notice and opt-in terms before you are
              charged.
            </p>
          </Section>

          <Section title="Acceptable Use">
            <p>
              Do not misuse the service, try to access another person&apos;s account, impersonate
              others, interfere with the app or its infrastructure, use automated scraping or abuse,
              upload unlawful content, or use Quiet Dwelling in a way that harms other people or the
              service.
            </p>
          </Section>

          <Section title="Availability And Changes">
            <p>
              Quiet Dwelling is provided as available. We may change, suspend, or discontinue
              features, and the service may be interrupted by maintenance, provider outages, device
              storage limits, browser changes, or Google account issues.
            </p>
            <p>
              We may update these terms as the product changes and will ask for renewed acceptance
              where required.
            </p>
          </Section>

          <Section title="Suspension And Termination">
            <p>
              We may suspend or terminate access if you break these terms, misuse the service, or
              create legal, security, or operational risk. You may stop using Quiet Dwelling at any
              time and may request account deletion.
            </p>
          </Section>

          <Section title="Liability And Consumer Rights">
            <p>
              To the maximum extent allowed by law, Quiet Dwelling is provided without warranties of
              fitness for a particular purpose. Nothing in these terms limits rights or remedies
              that cannot be excluded under mandatory consumer law in Ireland, the United Kingdom,
              the European Union, the United States, or your local jurisdiction.
            </p>
          </Section>

          <Section title="Law And Contact">
            <p>
              These terms are governed by the laws of the Republic of Ireland, with Irish courts
              having jurisdiction, while preserving mandatory consumer protections that apply where
              you live.
            </p>
            <p>
              Contact{' '}
              <a className="text-primary hover:underline" href={`mailto:${CONTACT_EMAIL}`}>
                {CONTACT_EMAIL}
              </a>{' '}
              for questions about these terms, privacy, or account deletion. See also the{' '}
              <Link className="text-primary hover:underline" to="/privacy">
                Privacy Policy
              </Link>{' '}
              and{' '}
              <Link className="text-primary hover:underline" to="/account-deletion">
                account deletion instructions
              </Link>
              .
            </p>
          </Section>
        </div>
      </div>
    </main>
  )
}
