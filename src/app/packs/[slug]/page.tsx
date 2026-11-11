import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AlertTriangle, BadgeCheck, Layers, ShoppingBag } from "lucide-react";
import { getPublicPack } from "@/lib/data/catalog";
import { BeatCover } from "@/components/beats/cover";
import { BeatRow } from "@/components/beats/beat-row";
import { Avatar } from "@/components/ui/avatar";
import { Badge, Skeleton } from "@/components/ui/misc";
import { MessageButton } from "@/components/messages/message-button";
import { CurrencySwitch } from "@/components/layout/currency-switch";
import { PackLicenses, PackSavings, PlayPackButton } from "@/components/packs/pack-detail-client";
import { coverUrl } from "@/lib/storage";
import { env } from "@/lib/env";
import { formatCompact } from "@/lib/format";
import { beatsLabel } from "@/lib/packs";

export async function generateMetadata({ params }: PageProps<"/packs/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const data = await getPublicPack(slug);
  if (!data) return { title: "Beat pack" };
  const { pack } = data;
  const title = `${pack.title} — beat pack by ${pack.producer_name}`;
  const description = `${beatsLabel(pack.beats_count ?? 0)}${pack.genres?.length ? ` · ${pack.genres.join(", ")}` : ""}. License every beat in "${pack.title}" with one purchase.`;
  const image = coverUrl(pack.cover_path);
  return {
    title,
    description,
    alternates: { canonical: `/packs/${pack.slug}` },
    openGraph: { title, description, images: image ? [{ url: image, width: 1200, height: 1200 }] : undefined },
    twitter: { card: image ? "summary_large_image" : "summary", title, description, images: image ? [image] : undefined },
  };
}

function PackSkeleton() {
  return (
    <div className="mx-auto max-w-[1400px] px-4 pt-10 sm:px-6 lg:px-8">
      <div className="grid gap-10 lg:grid-cols-[440px_minmax(0,1fr)]">
        <Skeleton className="aspect-square rounded-[2rem]" />
        <div className="space-y-5">
          <Skeleton className="h-6 w-40" />
          <Skeleton className="h-16 w-3/4" />
          <Skeleton className="h-64 w-full rounded-3xl" />
        </div>
      </div>
    </div>
  );
}

async function PackDetail({ params }: { params: PageProps<"/packs/[slug]">["params"] }) {
  const { slug } = await params;
  const data = await getPublicPack(slug);
  if (!data) notFound();
  const { pack, licenses, beats, beatsOnlyHere, beatLicenses, producer } = data;
  const art = coverUrl(pack.cover_path);
  const name = pack.producer_name ?? producer.username;

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: pack.title,
    description: pack.description ?? `${beatsLabel(pack.beats_count ?? 0)} by ${name}`,
    image: art ?? undefined,
    brand: { "@type": "Brand", name },
    url: `${env.siteUrl}/packs/${pack.slug}`,
    offers: licenses.map((l) => ({
      "@type": "Offer",
      name: l.name,
      price: (l.price_eur / 100).toFixed(2),
      priceCurrency: "EUR",
      availability: pack.available ? "https://schema.org/InStock" : "https://schema.org/OutOfStock",
    })),
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />
      <div className="relative isolate overflow-hidden">
        {art && (
          <div className="absolute inset-x-0 top-0 -z-10 h-[620px] overflow-hidden opacity-40 [mask-image:linear-gradient(to_bottom,black_35%,transparent)] light:opacity-30" aria-hidden>
            <div className="absolute inset-0 scale-125 blur-[110px] saturate-150" style={{ background: `url(${art}) center/cover` }} />
          </div>
        )}

        <div className="mx-auto max-w-[1400px] px-4 pt-8 sm:px-6 md:pt-12 lg:px-8">
          <nav className="mb-8 flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.2em] text-ink-400" aria-label="Breadcrumb">
            <Link href="/packs" className="hover:text-white">Beat packs</Link>
            <span>/</span>
            <span className="truncate text-ink-200">{pack.title}</span>
          </nav>

          <div className="grid gap-10 lg:grid-cols-[minmax(0,440px)_minmax(0,1fr)] lg:gap-14">
            <div className="lg:sticky lg:top-24 lg:self-start">
              <div className="relative pt-3">
                <span aria-hidden className="absolute inset-x-8 top-0 h-10 rounded-[2rem] border border-white/[0.06] bg-white/[0.04]" />
                <span aria-hidden className="absolute inset-x-4 top-1.5 h-10 rounded-[2rem] border border-white/[0.08] bg-white/[0.06]" />
                <BeatCover
                  path={pack.cover_path}
                  title={pack.title ?? ""}
                  seed={pack.id ?? ""}
                  priority
                  sizes="(max-width: 1024px) 92vw, 440px"
                  className="relative aspect-square w-full rounded-[2rem] border border-white/[0.08] shadow-[0_50px_120px_-40px_color-mix(in_oklab,var(--color-shadow)_95%,transparent)]"
                />
              </div>
              <dl className="mt-5 grid grid-cols-2 gap-3">
                {[
                  { icon: Layers, label: "Beats", value: String(pack.beats_count ?? 0) },
                  { icon: ShoppingBag, label: "Sales", value: formatCompact(pack.sales_count ?? 0) },
                ].map((s) => (
                  <div key={s.label} className="glass rounded-2xl px-4 py-3">
                    <dt className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.18em] text-ink-400">
                      <s.icon className="h-3 w-3" /> {s.label}
                    </dt>
                    <dd className="mt-1 text-xl font-semibold tracking-tight">{s.value}</dd>
                  </div>
                ))}
              </dl>
            </div>

            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone="accent">
                  <Layers className="h-3 w-3" /> Beat pack
                </Badge>
                {pack.genres?.map((g) => <Badge key={g}>{g}</Badge>)}
              </div>
              <h1 className="mt-5 font-display text-[clamp(2.4rem,6vw,4.6rem)] font-extrabold leading-[0.95] tracking-[-0.045em]">{pack.title}</h1>
              <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-3">
                <Link href={`/producers/${producer.username}`} className="group inline-flex items-center gap-3">
                  <Avatar path={producer.avatar_path} name={name} size={40} />
                  <span>
                    <span className="flex items-center gap-1.5 font-semibold group-hover:underline">
                      {name}
                      {producer.is_verified && <BadgeCheck className="h-4 w-4 text-accent-400" />}
                    </span>
                    <span className="block text-xs text-ink-400">@{producer.username}</span>
                  </span>
                </Link>
                <MessageButton profileId={producer.id} returnTo={`/packs/${pack.slug}`} variant="outline" size="xs" label="Message producer" />
              </div>
              {pack.description && <p className="mt-6 max-w-2xl whitespace-pre-line leading-relaxed text-ink-200">{pack.description}</p>}

              <section className="mt-10" id="licenses">
                <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
                  <h2 className="font-display text-2xl font-bold tracking-tight">Licensing</h2>
                  <CurrencySwitch />
                </div>
                {pack.available ? (
                  <div className="space-y-4">
                    <p className="text-sm text-ink-300">One license covers all {beatsLabel(pack.beats_count ?? 0)}: you get the files and a license agreement for each one.</p>
                    <PackLicenses pack={pack} licenses={licenses} />
                    <PackSavings beats={beats} licenses={licenses} beatLicenses={beatLicenses} />
                  </div>
                ) : (
                  <div className="flex items-start gap-3 rounded-2xl border border-warning/30 bg-warning/10 p-4 text-sm text-warning">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                    This pack isn&apos;t on sale right now because one of its beats is unavailable. You can still license the beats one by one.
                  </div>
                )}
              </section>

              <section className="mt-12">
                <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                  <h2 className="font-display text-2xl font-bold tracking-tight">
                    In this pack <span className="text-ink-400">· {beatsLabel(beats.length)}</span>
                  </h2>
                  <PlayPackButton beats={beats} />
                </div>
                {beatsOnlyHere && (
                  <p className="-mt-1 mb-4 text-sm text-ink-400">These beats are only sold here: get the whole pack, or tap a price to license a single beat.</p>
                )}
                <div className="space-y-1">
                  {beats.map((b, i) => (
                    <BeatRow key={b.id} beat={b} index={i} queue={beats} linkTitle={!beatsOnlyHere} />
                  ))}
                </div>
              </section>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

export default function PackPage({ params }: PageProps<"/packs/[slug]">) {
  return (
    <Suspense fallback={<PackSkeleton />}>
      <PackDetail params={params} />
    </Suspense>
  );
}
