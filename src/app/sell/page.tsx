import type { Metadata } from "next";
import { AudioWaveform, BadgeEuro, ChartColumn, CloudUpload, FileText, Lock } from "lucide-react";
import { getPlatformSettings } from "@/lib/data/catalog";
import { BecomeSellerCard } from "@/components/studio/become-seller";

export const metadata: Metadata = {
  title: "Sell your beats",
  description: "Upload WAVs and stems, set your own license prices in EUR, PLN and USD, and get paid through Stripe.",
};

const FEATURES = [
  { icon: CloudUpload, title: "Studio-grade uploads", body: "Resumable uploads for big WAVs and stem packs, with real waveforms generated from your audio." },
  { icon: BadgeEuro, title: "Your prices, three currencies", body: "Set every license tier in EUR, PLN and USD. Card, BLIK and Przelewy24 checkout through Stripe." },
  { icon: Lock, title: "Protected delivery", body: "Full-quality files stay private. Buyers get expiring download links only after they pay." },
  { icon: FileText, title: "Automatic license PDFs", body: "Every sale generates a license agreement with your terms, credit line and usage limits." },
  { icon: ChartColumn, title: "Real analytics", body: "Plays, favorites, sales and earnings per beat — see what's working at a glance." },
  { icon: AudioWaveform, title: "Exclusive-ready", body: "Sell exclusives safely: the beat is pulled from the store the moment exclusive rights are bought." },
];

export default async function SellPage() {
  const settings = await getPlatformSettings();
  const fee = settings ? Number(settings.platform_fee_percent) : 20;
  const keep = 100 - fee;
  return (
    <div className="relative isolate overflow-hidden">
      <div className="absolute inset-x-0 top-0 -z-10 h-[700px] opacity-60 [background:radial-gradient(50%_60%_at_70%_10%,color-mix(in_oklab,var(--color-accent)_35%,transparent),transparent_70%)]" aria-hidden />
      <div className="mx-auto grid max-w-[1400px] gap-14 px-4 pb-10 pt-10 sm:px-6 md:pt-16 lg:grid-cols-[1.2fr_0.8fr] lg:px-8">
        <div>
          <p className="font-mono text-[11px] uppercase tracking-[0.25em] text-accent-300">For producers</p>
          <h1 className="mt-4 font-display text-[clamp(3rem,8vw,6.5rem)] font-extrabold leading-[0.9] tracking-[-0.05em]">
            Sell beats.
            <br />
            <span className="text-accent-gradient">Keep {keep}%.</span>
          </h1>
          <p className="mt-6 max-w-xl text-lg leading-relaxed text-ink-200">
            A premium storefront for your catalogue. Upload once, license in five tiers, and get paid straight to your bank account with Stripe.
          </p>
          <dl className="mt-10 grid max-w-xl grid-cols-3 gap-4">
            {[
              { k: `${keep}%`, v: "of every sale is yours" },
              { k: "3", v: "currencies: EUR, PLN & USD" },
              { k: "0 €", v: "to join, no monthly fee" },
            ].map((s) => (
              <div key={s.v} className="glass rounded-2xl p-4">
                <dt className="text-3xl font-semibold tracking-[-0.03em]">{s.k}</dt>
                <dd className="mt-1 text-xs text-ink-300">{s.v}</dd>
              </div>
            ))}
          </dl>
          <ol className="mt-12 grid gap-5 md:grid-cols-3">
            {[
              ["01", "Activate your profile", "Pick your producer name — your public page goes live instantly."],
              ["02", "Upload & set licenses", settings?.require_beat_approval ? "Add files, BPM, key and prices. Our team reviews each beat before it goes live." : "Add files, BPM, key and prices. Publish whenever you're ready."],
              ["03", "Get paid", "Connect payouts with Stripe. Earnings transfer automatically after each sale."],
            ].map(([n, t, b]) => (
              <li key={n} className="border-t border-white/10 pt-4">
                <p className="font-mono text-xs text-accent-300">{n}</p>
                <p className="mt-2 font-semibold">{t}</p>
                <p className="mt-1 text-sm leading-relaxed text-ink-300">{b}</p>
              </li>
            ))}
          </ol>
        </div>
        <div className="lg:sticky lg:top-28 lg:self-start">
          <BecomeSellerCard signupsOpen={settings?.seller_signups_open ?? true} fee={fee} />
        </div>
      </div>
      <section className="mx-auto mt-16 max-w-[1400px] px-4 sm:px-6 lg:px-8">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f) => (
            <div key={f.title} className="glass rounded-3xl p-6">
              <f.icon className="h-6 w-6 text-accent-300" />
              <p className="mt-4 font-display text-lg font-bold">{f.title}</p>
              <p className="mt-2 text-sm leading-relaxed text-ink-300">{f.body}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
