import type { Metadata } from "next";
import { LegalPage } from "@/components/layout/prose";
import { env } from "@/lib/env";

export const metadata: Metadata = { title: "Terms of service" };

// NOTE FOR THE OWNER: generic starting text — have it reviewed by legal counsel for your jurisdiction before launch.
export default function TermsPage() {
  return (
    <LegalPage eyebrow="Legal" title="Terms of service">
      <p>These terms govern your use of {env.siteName} (the “Platform”), a marketplace connecting music producers (“Sellers”) with artists and creators (“Buyers”).</p>
      <h2>1. Accounts</h2>
      <p>You must provide accurate information and keep your credentials secure. You are responsible for activity on your account. We may suspend accounts that violate these terms.</p>
      <h2>2. Buying licenses</h2>
      <p>When you purchase a license you receive the rights described in that license’s agreement, which is generated at checkout and available in your library. Licenses are personal and non-transferable unless the agreement states otherwise.</p>
      <h2>3. Selling on the Platform</h2>
      <ul>
        <li>Sellers must own or control all rights in the beats they upload, including any samples.</li>
        <li>Sellers set their own prices. The Platform retains a service fee from each sale as displayed in the seller studio.</li>
        <li>Payouts are made through Stripe Connect and require completing Stripe’s verification.</li>
        <li>The Platform may review, reject or remove listings at its discretion.</li>
      </ul>
      <h2>4. Payments and refunds</h2>
      <p>Payments are processed securely by Stripe. Because digital files are delivered immediately, purchases are generally non-refundable except where required by law or where a purchased item could not be delivered.</p>
      <h2>5. Prohibited conduct</h2>
      <p>You may not infringe intellectual property, upload malicious files, manipulate plays or sales, or attempt to access data you are not authorised to access.</p>
      <h2>6. Liability</h2>
      <p>The Platform is provided “as is”. To the extent permitted by law, we are not liable for indirect or consequential losses.</p>
      <h2>7. Contact</h2>
      <p>Questions about these terms can be sent to the Platform operator via the contact details published on this site.</p>
    </LegalPage>
  );
}
