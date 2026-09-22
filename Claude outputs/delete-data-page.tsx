import type { Metadata } from "next";
import Image from "next/image";
import Nav from "@/components/Nav";

export const metadata: Metadata = {
  title: "Request Data Deletion — Utsav",
  description:
    "How to delete specific data from Utsav — guest list entries, event photos, checklist items and more — without deleting your whole account.",
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
      <div className="mt-1.5 space-y-3 text-[15px] leading-7 text-ink-secondary">{children}</div>
    </div>
  );
}

export default function DeleteData() {
  return (
    <>
      <Nav />
      <main className="mx-auto w-full max-w-3xl px-5 py-14 sm:px-8 sm:py-20">
        <p className="font-mono text-xs font-medium uppercase tracking-[0.14em] text-accent">
          Legal
        </p>
        <h1 className="mt-2 font-display text-3xl font-bold tracking-tight text-ink sm:text-4xl">
          Request Data Deletion
        </h1>
        <p className="mt-3 text-sm text-ink-faint">Utsav — Festival and Events Marketplace</p>

        <div className="mt-10">
          <p className="text-[15px] leading-7 text-ink-secondary">
            You don&apos;t need to delete your whole Utsav account to remove specific data. Most of
            what you&apos;ve added to Utsav can be deleted individually, right in the app, while the
            rest of your account stays exactly as it is.
          </p>

          <div className="mt-4 rounded-lg border-l-[3px] border-accent bg-accent-soft px-4 py-3">
            <p className="mb-0 text-[15px] leading-7 text-ink-secondary">
              Looking to delete your entire account instead? See{" "}
              <a href="/delete-account" className="text-accent underline underline-offset-2">
                Delete Your Account
              </a>
              .
            </p>
          </div>

          <Section title="What you can delete yourself, in the app">
            <div className="space-y-3">
              <OptionBox title="👥 Guest list entries">
                <p>Open a guest list, swipe left on any guest to remove them, or delete the whole list from the plan it&apos;s attached to.</p>
              </OptionBox>
              <OptionBox title="📸 Event photos">
                <p>Open an event&apos;s album and delete any photo — yours, or (as the host) any guest-uploaded one you&apos;d rather remove.</p>
              </OptionBox>
              <OptionBox title="✅ Checklist items">
                <p>Swipe to delete any to-do item from an event&apos;s checklist.</p>
              </OptionBox>
              <OptionBox title="🎉 A whole event plan">
                <p>Deleting a saved plan also removes its guest list, invites, and checklist. Your photo album for that event is kept by default — you&apos;ll be asked separately if you want that removed too.</p>
              </OptionBox>
              <OptionBox title="🔔 Notifications, saved & blocked providers">
                <p>Each has its own delete/remove action in Profile and Discover — individually or all at once.</p>
              </OptionBox>
            </div>
          </Section>

          <Section title="If you're a guest, not an account holder">
            <p>
              If someone invited you to their event and you&apos;d like your name, phone number, or
              other details removed from their guest list, you don&apos;t need an Utsav account to
              request that:
            </p>
            <ul className="list-disc space-y-1.5 pl-5">
              <li>Open the RSVP link or gate pass you were sent, and look for &ldquo;Delete my data&rdquo;, or</li>
              <li>Email <strong>privacy@utsav.app</strong> with the event invite link or your phone number, and we&apos;ll remove your details from that guest list.</li>
            </ul>
          </Section>

          <Section title="Anything else">
            <p>
              If there&apos;s a specific category of data you&apos;d like deleted that isn&apos;t
              covered above, email <strong>privacy@utsav.app</strong> describing what you&apos;d
              like removed. We&apos;ll respond within 30 days.
            </p>
            <a
              href="mailto:privacy@utsav.app?subject=Data%20deletion%20request"
              className="inline-block rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-ink no-underline"
            >
              Email privacy@utsav.app
            </a>
          </Section>

          <Section title="Contact">
            <div className="rounded-xl bg-bg-subtle p-5">
              <p className="mb-1 font-semibold text-ink">Utsav — Festival and Events Marketplace</p>
              <p className="mb-1">Privacy: <a href="mailto:privacy@utsav.app">privacy@utsav.app</a></p>
              <p className="mb-1">Full privacy policy: <a href="/privacy-policy">theutsavapp.com/privacy-policy</a></p>
              <p className="mb-0">Delete your whole account: <a href="/delete-account">theutsavapp.com/delete-account</a></p>
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
