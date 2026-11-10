import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage } from "@/components/layout/prose";
import { CookieSettingsButton } from "@/components/legal/cookie-consent";
import { authCookieName, env } from "@/lib/env";
import { CONSENT_COOKIE, CURRENCY_KEY, PREFERENCE_KEYS } from "@/lib/consent";
import { ACCENT_KEY, THEME_KEY } from "@/lib/appearance";

export const metadata: Metadata = { title: "Cookie policy" };

const ROWS: { name: string; kind: string; purpose: string; category: string; duration: string }[] = [
  { name: authCookieName, kind: "Cookie", purpose: "Keeps you signed in and protects your session (may be split into numbered parts).", category: "Necessary", duration: "400 days, or until you sign out" },
  { name: `${authCookieName}-code-verifier`, kind: "Cookie", purpose: "Secures email confirmation and password-reset links.", category: "Necessary", duration: "Until the link is used" },
  { name: CONSENT_COOKIE, kind: "Cookie", purpose: "Remembers your cookie choice.", category: "Necessary", duration: "12 months" },
  { name: "nw-cart", kind: "Local storage", purpose: "Keeps the beats in your cart.", category: "Necessary", duration: "Until you empty the cart or clear site data" },
  { name: THEME_KEY, kind: "Local storage", purpose: "Remembers the theme (dark or light) you picked in Settings. Only stored when you choose one.", category: "Necessary", duration: "Until you change it or clear site data" },
  { name: ACCENT_KEY, kind: "Local storage", purpose: "Remembers the colour you picked in Settings. Only stored when you choose one.", category: "Necessary", duration: "Until you change it or clear site data" },
  { name: CURRENCY_KEY, kind: "Local storage", purpose: "Remembers the display currency you picked (EUR, PLN or USD). Only stored when you choose one.", category: "Necessary", duration: "Until you change it or clear site data" },
  { name: PREFERENCE_KEYS.volume, kind: "Local storage", purpose: "Remembers the player volume.", category: "Preferences", duration: "Until you withdraw consent or clear site data" },
  { name: PREFERENCE_KEYS.exploreView, kind: "Local storage", purpose: "Remembers grid or list view on Explore.", category: "Preferences", duration: "Until you withdraw consent or clear site data" },
];

// NOTE FOR THE OWNER: generic starting text — have it reviewed for your jurisdiction before launch.
export default function CookiesPage() {
  return (
    <LegalPage eyebrow="Legal" title="Cookie policy">
      <p>
        Cookies and local storage are small pieces of data a website keeps on your device. {env.siteName} uses only what is
        needed to run the marketplace and, if you allow it, to remember your preferences. We don&apos;t use advertising,
        analytics or tracking cookies, and we don&apos;t share cookie data with advertisers.
      </p>

      <h2>Your choice</h2>
      <p>
        Necessary cookies are always on, because sign-in, security and the cart can&apos;t work without them. Preference
        storage is only used after you allow it in the cookie banner. You can change or withdraw your choice at any time.
        Withdrawing deletes the stored preferences from this device.
      </p>
      <p>
        <CookieSettingsButton className="inline-flex h-10 items-center rounded-full border border-white/15 px-5 text-sm font-medium text-white transition hover:border-white/30 hover:bg-white/[0.04]">
          Open cookie settings
        </CookieSettingsButton>
      </p>

      <h2>What we store</h2>
      <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        <table className="w-full min-w-[40rem] border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-white/10 text-ink-400">
              <th scope="col" className="py-3 pr-4 font-medium">Name</th>
              <th scope="col" className="py-3 pr-4 font-medium">Type</th>
              <th scope="col" className="py-3 pr-4 font-medium">Purpose</th>
              <th scope="col" className="py-3 pr-4 font-medium">Category</th>
              <th scope="col" className="py-3 font-medium">Kept for</th>
            </tr>
          </thead>
          <tbody>
            {ROWS.map((r) => (
              <tr key={r.name} className="border-b border-white/[0.06] align-top">
                <td className="py-3 pr-4 font-mono text-xs text-white">{r.name}</td>
                <td className="py-3 pr-4 text-ink-300">{r.kind}</td>
                <td className="py-3 pr-4">{r.purpose}</td>
                <td className="py-3 pr-4">{r.category}</td>
                <td className="py-3 text-ink-300">{r.duration}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2>Third parties</h2>
      <p>
        Payments are handled on Stripe&apos;s checkout page (checkout.stripe.com). Stripe sets its own cookies there to process
        the payment and prevent fraud, under{" "}
        <a href="https://stripe.com/cookie-settings" rel="noopener noreferrer" target="_blank">
          Stripe&apos;s cookie policy
        </a>
        . Audio previews and images are served from our storage provider (Supabase), which does not set cookies.
      </p>

      <h2>Managing cookies in your browser</h2>
      <p>
        You can also delete or block cookies in your browser settings. If you block necessary cookies you won&apos;t be able to
        sign in or check out. More about how we handle personal data is in the <Link href="/legal/privacy">privacy policy</Link>.
      </p>
    </LegalPage>
  );
}
