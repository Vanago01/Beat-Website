import type { Metadata } from "next";
import { CircleCheck, Lock } from "lucide-react";
import { LegalPage } from "@/components/layout/prose";
import { DEFAULT_LICENSES, LICENSE_META } from "@/lib/constants";
import { licenseFiles, licenseHighlights } from "@/lib/licenses";

export const metadata: Metadata = { title: "Licensing guide", description: "How beat licenses work: MP3, WAV, trackout, unlimited and exclusive rights explained." };

export default function LicensingPage() {
  return (
    <LegalPage eyebrow="Licensing" title="How beat licenses work">
      <p>
        Every beat on the marketplace can be licensed in several tiers. A license gives you permission to record a song over the instrumental and release it within the limits of that tier.
        Producers set their own prices and may adjust the default limits below — the exact terms are always shown before you pay and included in your PDF agreement.
      </p>
      <div className="not-prose mt-8 grid gap-4">
        {DEFAULT_LICENSES.map((l) => (
          <div key={l.type} className="glass rounded-3xl p-6">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="!mt-0 font-display text-xl font-bold text-white">{LICENSE_META[l.type].label}</h2>
              <span className="font-mono text-xs uppercase tracking-wider text-accent-300">{licenseFiles(l).join(" · ")}</span>
            </div>
            <p className="mt-1 text-sm text-ink-300">{LICENSE_META[l.type].tagline}</p>
            <ul className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
              {licenseHighlights(l).map((h) => (
                <li key={h.label} className="!ml-0 flex !list-none items-center gap-2">
                  {h.positive ? <CircleCheck className="h-4 w-4 text-success" /> : <Lock className="h-4 w-4 text-ink-500" />}
                  <span className="text-ink-300">{h.label}:</span> <span className="text-white">{h.value}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <h2>Credit</h2>
      <p>All licenses require crediting the producer, e.g. “Produced by [producer name]”, in your release metadata and descriptions.</p>
      <h2>Exclusive rights</h2>
      <p>
        When an exclusive license is purchased the beat is removed from sale immediately. Non-exclusive licenses that were sold before remain valid for their owners.
      </p>
    </LegalPage>
  );
}
