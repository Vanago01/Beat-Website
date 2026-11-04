import type { ReactNode } from "react";

export function LegalPage({ eyebrow, title, updated, children }: { eyebrow: string; title: string; updated?: string; children: ReactNode }) {
  return (
    <div className="mx-auto max-w-3xl px-4 pb-10 pt-10 sm:px-6 md:pt-16">
      <p className="font-mono text-[11px] uppercase tracking-[0.25em] text-accent-300">{eyebrow}</p>
      <h1 className="mt-3 font-display text-4xl font-extrabold tracking-[-0.04em] md:text-6xl">{title}</h1>
      {updated && <p className="mt-3 text-sm text-ink-400">Last updated {updated}</p>}
      <div className="mt-10 space-y-5 text-[15px] leading-relaxed text-ink-200 [&_h2]:mt-10 [&_h2]:font-display [&_h2]:text-xl [&_h2]:font-bold [&_h2]:text-white [&_li]:ml-5 [&_li]:list-disc [&_strong]:text-white [&_p_a]:text-white [&_p_a]:underline [&_p_a]:underline-offset-4 [&_p_a:hover]:text-accent-200">
        {children}
      </div>
    </div>
  );
}
