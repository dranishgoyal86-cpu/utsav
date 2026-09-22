import type { Metadata } from "next";
import Image from "next/image";
import Nav from "@/components/Nav";

export const metadata: Metadata = {
  title: "Delete Your Account — Utsav",
  description:
    "How to permanently delete your Utsav account and associated personal data, whether or not you currently have the app installed.",
};

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-9 border-t border-border pt-9 first:mt-0 first:border-t-0 first:pt-0">
      <h2 className="font-display text-lg font-bold text-ink">{title}</h2>
      <div className="mt-3 space-y-3 text-[15px] leading-7 text-ink-secondary [&_strong]:font-semibold [&_strong]:text-ink [&_a]:text-accent [&_a]:underline [&_a]:underline-offset-2">
        {children}
      </div>
    </section>
  );
}

function OptionBox({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl bg-bg-subtle p-5">
      <h3 className="text-[15px] font-semibold text-ink">{title}</h3>
      <div className="mt-1.5 space-y-3 text-[15px] leading-7 text-ink-secondary [&_strong]:font-semibold [&_strong]:text-ink [&_a]:text-accent [&_a]:underline [&_a]:underline-offset-2">
        {children}
      </div>
    </div>
  );
}

export default function DeleteAccount() {
  return (
    <>
      <Nav />
      <main className="mx-auto w-full max-w-3xl px-5 py-14 sm:px-8 sm:py-20">
        <p className="font-mono text-xs font-medium uppercase tracking-[0.14em] text-accent">
          Legal
        </p>
        <h1 className="mt-2 font-display text-3xl font-bold tracking-tight text-ink sm:text-4xl">
          Delete Your Account
        </h1>
        <p className="mt-3 text-sm text-ink-faint">Utsav — Festival and Events Marketplace</p>

        <div className="mt-10">
          <p className="text-[15px] leading-7 text-ink-secondary">
            This page is for anyone who wants to permanently delete their Utsav account and
            associated personal data — whether or not you currently have the app installed.
          </p>

          <Section title="How to request deletion">
            <div className="space-y-3">
              <OptionBox title="📱 If you have the app">
                <p>
                  Open Utsav → <strong>Profile</strong> → <strong>Delete my account</strong>, at the
                  bottom of the Account section. This is instant and doesn&apos;t require contacting
                  anyone.
                </p>
              </OptionBox>
              <OptionBox title="✉️ If you don't have the app, or can't sign in">
                <p>
                  Email <strong>privacy@utsav.app</strong> from the address associated with your
                  account (or include your registered phone number), with the subject line &ldquo;Delete
                  my account&rdquo;. We&apos;ll verify your identity and process the request.
                </p>
                <a
                  href="mailto:privacy@utsav.app?subject=Delete%20my%20account"
                  className="mt-1 inline-block rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-ink no-underline"
                >
                  Email privacy@utsav.app
                </a>
              </OptionBox>
            </div>
          </Section>

          <Section title="What happens after you request deletion">
            <ul className="list-disc space-y-1.5 pl-5">
              <li>You&apos;re immediately signed out and your login is blocked — a request can&apos;t be reversed by simply logging back in.</li>
              <li>There&apos;s a <strong>14-day grace period</strong> before anything is permanently removed, in case the request was made in error.</li>
              <li>After 14 days, your account and profile data are permanently deleted.</li>
            </ul>
          </Section>

          <Section title="What's deleted vs. what's retained">
            <div className="rounded-lg border-l-[3px] border-accent bg-accent-soft px-4 py-3">
              <p className="mb-0">
                Some records are <strong>anonymized</strong> rather than deleted outright, where
                we&apos;re legally required to keep them — your name and identifying details are
                removed, but the record itself (e.g. that a transaction happened) is kept for
                compliance.
              </p>
            </div>
            <div className="overflow-x-auto rounded-xl border border-border">
              <table className="w-full border-collapse text-left text-[13px]">
                <thead>
                  <tr className="bg-bg-subtle">
                    <th className="border-b border-border px-3 py-2.5 font-semibold text-ink">Data</th>
                    <th className="border-b border-border px-3 py-2.5 font-semibold text-ink">What happens</th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    ["Profile, guest lists, chat messages, event photos, reviews you wrote", "Permanently deleted"],
                    ["Booking records", "Anonymized and retained for 3 years (accounting/dispute purposes)"],
                    ["Payment transaction records", "Anonymized and retained for 7 years (required by Indian tax law)"],
                  ].map(([data, outcome]) => (
                    <tr key={data}>
                      <td className="border-b border-border px-3 py-2.5 align-top text-ink-secondary last:border-b-0">{data}</td>
                      <td className="border-b border-border px-3 py-2.5 align-top text-ink-secondary last:border-b-0">{outcome}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Section>

          <Section title="Provider (vendor) accounts">
            <p>
              Self-service deletion currently covers customer accounts. If you&apos;re a service
              provider and want your listing and account removed, email{" "}
              <strong>privacy@utsav.app</strong> — a provider&apos;s account is tied to a public
              listing that other customers&apos; bookings and reviews reference, so this needs a
              manual review rather than an instant delete.
            </p>
          </Section>

          <Section title="Contact">
            <div className="rounded-xl bg-bg-subtle p-5">
              <p className="mb-1 font-semibold text-ink">Utsav — Festival and Events Marketplace</p>
              <p className="mb-1">Privacy: <a href="mailto:privacy@utsav.app">privacy@utsav.app</a></p>
              <p className="mb-0">Full privacy policy: <a href="/privacy-policy">theutsavapp.com/privacy-policy</a></p>
            </div>
          </Section>
        </div>
      </main>

      <footer className="border-t border-border">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-8 sm:px-8">
          <div className="flex items-center gap-2.5">
            <Image src="/brand/logo-mark-64.png" alt="" width={24} height={24} className="h-6 w-6" />
            <span className="font-display text-base font-bold text-ink">Utsav</span>
          </div>
          <p className="text-xs text-ink-faint">© {new Date().getFullYear()} Utsav. All rights reserved.</p>
        </div>
      </footer>
    </>
  );
}
