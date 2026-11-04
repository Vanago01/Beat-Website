import type { Metadata } from "next";
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
      </ul>
      <h2>How we use it</h2>
      <p>To provide the marketplace, deliver purchased files, issue license agreements, pay sellers, prevent fraud and send transactional emails such as order confirmations.</p>
      <h2>Processors</h2>
      <p>We use Supabase (database, authentication and file storage), Stripe (payments and payouts) and an email delivery provider. They process data on our behalf under data-processing agreements.</p>
      <h2>Your rights</h2>
      <p>Under the GDPR you may request access to, correction or deletion of your personal data, and object to certain processing. Profile data can be edited at any time from your account.</p>
      <h2>Cookies</h2>
      <p>We use strictly necessary cookies to keep you signed in, and local storage for preferences such as your cart and display currency.</p>
    </LegalPage>
  );
}
