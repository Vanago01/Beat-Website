import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage } from "@/components/layout/prose";
import { env } from "@/lib/env";

export const metadata: Metadata = { title: "Privacy policy" };

// NOTE FOR THE OWNER: generic starting text — adapt it (GDPR controller details, retention, etc.) before launch.
export default function PrivacyPage() {
  return (
    <LegalPage eyebrow="Legal" title="Privacy policy">
      <p>This policy explains how {env.siteName} processes personal data when you use the Platform.</p>
      <h2>Data we collect</h2>
      <ul>
        <li>Account data: email address, username, profile information you choose to publish.</li>
        <li>Transaction data: orders, licenses and payout records. Card details are handled by Stripe and never stored by us.</li>
        <li>Usage data: plays and favorites, used to power charts and recommendations.</li>
        <li>
          Messages: the text of direct messages you send and receive, when they were sent and read, and the people you block.
          Only you and the person you&apos;re talking to can read a conversation. If you delete a conversation it disappears
          from your account; the other person keeps their copy.
        </li>
      </ul>
      <h2>How we use it</h2>
      <p>To provide the marketplace, deliver purchased files and messages, issue license agreements, pay sellers, prevent fraud and abuse, and send transactional emails such as order confirmations.</p>
      <h2>Processors</h2>
      <p>We use Supabase (database, authentication and file storage), Stripe (payments and payouts) and an email delivery provider. They process data on our behalf under data-processing agreements.</p>
      <h2>Your rights</h2>
      <p>Under the GDPR you may request access to, correction or deletion of your personal data, and object to certain processing. Profile data can be edited at any time from your account.</p>
      <h2>Cookies</h2>
      <p>
        We use necessary cookies and local storage to keep you signed in, protect your account, remember your cart and the currency or look you
        pick. Preferences such as the player volume are only stored with your consent. We don&apos;t use advertising or tracking cookies. See the <Link href="/legal/cookies">cookie policy</Link> for the full list
        and to change your choice.
      </p>
    </LegalPage>
  );
}
