import type { Metadata } from "next";
import Image from "next/image";
import Nav from "@/components/Nav";

export const metadata: Metadata = {
  title: "Privacy Policy — Utsav",
  description:
    "How Utsav collects, uses, discloses and protects your personal information when you use the Utsav app and related services.",
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

function SubHeading({ children }: { children: React.ReactNode }) {
  return <h3 className="pt-1 text-[15px] font-semibold text-ink">{children}</h3>;
}

export default function PrivacyPolicy() {
  return (
    <>
      <Nav />
      <main className="mx-auto w-full max-w-3xl px-5 py-14 sm:px-8 sm:py-20">
        <p className="font-mono text-xs font-medium uppercase tracking-[0.14em] text-accent">
          Legal
        </p>
        <h1 className="mt-2 font-display text-3xl font-bold tracking-tight text-ink sm:text-4xl">
          Privacy Policy
        </h1>
        <p className="mt-3 text-sm text-ink-faint">
          Utsav — Festival and Events Marketplace &nbsp;|&nbsp; Last updated: June 2026 &nbsp;|&nbsp; Effective: June 2026
        </p>

        <div className="mt-10">
          <Section title="1. Introduction">
            <p>
              Welcome to Utsav. Utsav is a festival and events marketplace platform that connects
              customers with service providers across India. This Privacy Policy explains how we
              collect, use, disclose and protect your personal information when you use our mobile
              application and related services.
            </p>
            <p>
              By downloading or using the Utsav app, you agree to the collection and use of
              information in accordance with this policy. If you do not agree, please do not use
              our services.
            </p>
          </Section>

          <Section title="2. Information We Collect">
            <SubHeading>2.1 Information You Provide Directly</SubHeading>
            <ul className="list-disc space-y-1.5 pl-5">
              <li><strong>Account information:</strong> Name, email address, phone number, password and city when you register</li>
              <li><strong>Profile information:</strong> Profile photo, bio and service details (for service providers)</li>
              <li><strong>Booking information:</strong> Event details, dates, venue, guest count and special requirements</li>
              <li><strong>Payment information:</strong> We do not store your card details. Payments are processed securely by Razorpay. We only store transaction IDs and payment status</li>
              <li><strong>Reviews and ratings:</strong> Feedback you submit about service providers</li>
              <li><strong>Messages:</strong> Chat messages between customers and service providers</li>
              <li><strong>Event photos:</strong> Photos you upload to event albums</li>
              <li><strong>Guest list:</strong> Names and phone numbers of guests you add to your events</li>
            </ul>

            <SubHeading>2.2 Information Collected Automatically</SubHeading>
            <ul className="list-disc space-y-1.5 pl-5">
              <li><strong>Device information:</strong> Device type, operating system, app version and unique device identifiers</li>
              <li><strong>Usage data:</strong> Features used, screens visited, time spent and actions taken in the app</li>
              <li><strong>Push notification tokens:</strong> To send you booking updates and notifications</li>
              <li><strong>Location:</strong> City-level location when you select your city. We do not track your precise GPS location</li>
            </ul>

            <SubHeading>2.3 Information from Third Parties</SubHeading>
            <ul className="list-disc space-y-1.5 pl-5">
              <li><strong>Cloudinary:</strong> We use Cloudinary to store photos you upload. Photos are stored securely on their servers</li>
              <li><strong>AWS Rekognition:</strong> We use Amazon Web Services Rekognition to process face recognition for event photo matching</li>
              <li><strong>Razorpay:</strong> Payment processing. We receive transaction confirmation but never your full card or bank details</li>
              <li><strong>Sentry:</strong> We use Sentry to detect and diagnose app crashes and performance issues. When the app crashes or encounters an error, Sentry automatically receives your device model, operating system version, app version, IP address, and a technical error report (stack trace). We do not intentionally send Sentry your name, email or phone number</li>
            </ul>
          </Section>

          <Section title="3. How We Use Your Information">
            <p>We use the information we collect to:</p>
            <ul className="list-disc space-y-1.5 pl-5">
              <li>Create and manage your account</li>
              <li>Connect customers with service providers</li>
              <li>Process bookings and payments</li>
              <li>Send booking confirmations, updates and reminders</li>
              <li>Enable real-time chat between customers and providers</li>
              <li>Match your face with event photos when you scan your selfie for an event you were invited to</li>
              <li>Send push notifications about booking status, messages and platform updates</li>
              <li>Verify service provider credentials and issue verified badges</li>
              <li>Improve and personalise your app experience</li>
              <li>Resolve disputes and provide customer support</li>
              <li>Detect and prevent fraud, abuse and security incidents</li>
              <li>Comply with legal obligations under Indian law</li>
            </ul>
          </Section>

          <Section title="4. How We Share Your Information">
            <p>We do not sell your personal information. We share your information only in the following circumstances:</p>

            <SubHeading>4.1 Between Users</SubHeading>
            <ul className="list-disc space-y-1.5 pl-5">
              <li>When you make a booking, your name and phone number are shared with the relevant service provider</li>
              <li>When a provider accepts your booking, their name, phone number and profile details are shared with you</li>
              <li>Reviews you write are displayed publicly on provider profiles with your first name</li>
            </ul>

            <SubHeading>4.2 Service Providers</SubHeading>
            <div className="overflow-x-auto rounded-xl border border-border">
              <table className="w-full border-collapse text-left text-[13px]">
                <thead>
                  <tr className="bg-bg-subtle">
                    <th className="border-b border-border px-3 py-2.5 font-semibold text-ink">Provider</th>
                    <th className="border-b border-border px-3 py-2.5 font-semibold text-ink">Purpose</th>
                    <th className="border-b border-border px-3 py-2.5 font-semibold text-ink">Data shared</th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    ["Supabase", "Database and authentication", "All user and booking data"],
                    ["Cloudinary", "Photo storage", "Photos you upload"],
                    ["AWS Rekognition", "Face recognition", "Facial image data for event photo matching"],
                    ["Razorpay", "Payment processing", "Name, email, phone for payment"],
                    ["Expo", "Push notifications", "Device push tokens"],
                    ["Sentry", "Crash reporting and performance monitoring", "Device/OS/app version, IP address, error stack traces"],
                  ].map(([provider, purpose, data]) => (
                    <tr key={provider}>
                      <td className="border-b border-border px-3 py-2.5 align-top text-ink-secondary last:border-b-0">{provider}</td>
                      <td className="border-b border-border px-3 py-2.5 align-top text-ink-secondary last:border-b-0">{purpose}</td>
                      <td className="border-b border-border px-3 py-2.5 align-top text-ink-secondary last:border-b-0">{data}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <SubHeading>4.3 Legal Requirements</SubHeading>
            <p>We may disclose your information if required by law, court order, or government authority in India, or to protect the rights, property or safety of Utsav, our users or the public.</p>

            <SubHeading>4.4 Business Transfers</SubHeading>
            <p>If Utsav is acquired, merged or its assets are transferred, your information may be transferred as part of that transaction. We will notify you before your information is transferred.</p>
          </Section>

          <Section title="5. Face Recognition and Biometric Data">
            <div className="rounded-lg border-l-[3px] border-accent bg-accent-soft px-4 py-3">
              <p className="mb-0">We use AWS Rekognition to provide the &ldquo;Find my photos&rdquo; feature. When you scan your selfie:</p>
            </div>
            <ul className="list-disc space-y-1.5 pl-5">
              <li>Your facial data is temporarily processed to find matching photos from your event</li>
              <li>Facial recognition data is stored in AWS Rekognition collections linked to specific events only</li>
              <li>We do not use your facial data for any purpose other than finding your event photos</li>
              <li>You can request deletion of your facial data by contacting us at privacy@utsav.app</li>
              <li>All facial data linked to an event is deleted when the event host deletes the album</li>
              <li>We comply with applicable Indian laws regarding biometric data processing</li>
            </ul>
          </Section>

          <Section title="6. Data Retention">
            <ul className="list-disc space-y-1.5 pl-5">
              <li><strong>Account data:</strong> Retained while your account is active. Deleted within 30 days of account deletion</li>
              <li><strong>Booking data:</strong> Retained for 3 years for legal and tax compliance</li>
              <li><strong>Payment records:</strong> Retained for 7 years as required by Indian tax law</li>
              <li><strong>Chat messages:</strong> Retained for 1 year after the associated booking is completed</li>
              <li><strong>Event photos:</strong> Retained until the event host deletes the album</li>
              <li><strong>Face recognition data:</strong> Deleted when the associated event album is deleted</li>
              <li><strong>Push notification tokens:</strong> Updated with each app session, deleted on account deletion</li>
              <li><strong>Crash and performance data:</strong> Retained by Sentry for a limited period under their own data retention policy, not indefinitely</li>
            </ul>
          </Section>

          <Section title="7. Your Rights">
            <p>Under the Digital Personal Data Protection Act 2023 and our policy, you have the right to:</p>
            <ul className="list-disc space-y-1.5 pl-5">
              <li><strong>Access:</strong> Request a copy of the personal information we hold about you</li>
              <li><strong>Correction:</strong> Request correction of inaccurate or incomplete information</li>
              <li><strong>Deletion:</strong> Request deletion of your personal information, subject to legal retention requirements</li>
              <li><strong>Portability:</strong> Request your data in a machine-readable format</li>
              <li><strong>Withdraw consent:</strong> Withdraw consent for optional data processing at any time</li>
              <li><strong>Opt out of notifications:</strong> Disable push notifications in your device or app settings at any time</li>
            </ul>
            <p>To exercise any of these rights, contact us at <strong>privacy@utsav.app</strong>. We will respond within 30 days.</p>
          </Section>

          <Section title="8. Data Security">
            <p>We implement appropriate technical and organisational measures to protect your information:</p>
            <ul className="list-disc space-y-1.5 pl-5">
              <li>All data transmission is encrypted using TLS/SSL</li>
              <li>Passwords are hashed and never stored in plain text</li>
              <li>Database access is protected by Row Level Security — you can only access your own data</li>
              <li>Payment processing is handled by Razorpay which is PCI-DSS compliant</li>
              <li>We conduct regular security reviews</li>
            </ul>
            <p>However, no method of transmission over the internet is 100% secure. While we strive to protect your information, we cannot guarantee absolute security.</p>
          </Section>

          <Section title="9. Children's Privacy">
            <p>
              Utsav is not intended for use by anyone under the age of 18. We do not knowingly
              collect personal information from children under 18. If you believe a child has
              provided us with personal information, please contact us at privacy@utsav.app and we
              will delete the information promptly.
            </p>
          </Section>

          <Section title="10. Changes to This Policy">
            <p>
              We may update this Privacy Policy from time to time. We will notify you of
              significant changes by sending a push notification, displaying a notice in the app,
              or updating the effective date above. Continued use of Utsav after changes
              constitutes acceptance of the updated policy.
            </p>
          </Section>

          <Section title="11. Governing Law">
            <p>
              This Privacy Policy is governed by the laws of India, including the Information
              Technology Act 2000, the Information Technology (Reasonable Security Practices and
              Procedures and Sensitive Personal Data or Information) Rules 2011, and the Digital
              Personal Data Protection Act 2023.
            </p>
          </Section>

          <Section title="12. Contact Us">
            <div className="rounded-xl bg-bg-subtle p-5">
              <p className="mb-1 font-semibold text-ink">Utsav — Festival and Events Marketplace</p>
              <p className="mb-1">Privacy: <a href="mailto:privacy@utsav.app">privacy@utsav.app</a></p>
              <p className="mb-1">Support: <a href="mailto:support@utsav.app">support@utsav.app</a></p>
              <p className="mb-0">Website: <a href="https://www.theutsavapp.com">www.theutsavapp.com</a></p>
            </div>
          </Section>
        </div>
      </main>

      <footer className="border-t border-border">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-8 sm:px-8">
          <div className="flex items-center gap-2.5">
            <Image
              src="/brand/logo-mark-64.png"
              alt=""
              width={24}
              height={24}
              className="h-6 w-6"
            />
            <span className="font-display text-base font-bold text-ink">Utsav</span>
          </div>
          <p className="text-xs text-ink-faint">© {new Date().getFullYear()} Utsav. All rights reserved.</p>
        </div>
      </footer>
    </>
  );
}
