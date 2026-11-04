import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BadgeCheck, Clock, Crown, Eye, Headphones, Heart, Music2, ShoppingBag } from "lucide-react";
import { getBeatReviews, getPublicBeat, searchBeatsCached } from "@/lib/data/catalog";
import { getBeatForViewer } from "@/lib/data/viewer";
import { BeatCover } from "@/components/beats/cover";
import { BeatCard } from "@/components/beats/beat-card";
import { BeatHeroPlayer, BeatLicenses, ReviewsSection, ShareButtons } from "@/components/beats/beat-detail-client";
import { Avatar } from "@/components/ui/avatar";
import { Badge, SectionHeading, Skeleton } from "@/components/ui/misc";
import { coverUrl } from "@/lib/storage";
import { env } from "@/lib/env";
import { formatCompact, formatDuration, keyName } from "@/lib/format";
import { BEAT_STATUS_LABEL, KEY_GROUPS, MOODS, moodLabel, type BeatStatus } from "@/lib/constants";

export async function generateMetadata({ params }: PageProps<"/beats/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const data = await getPublicBeat(slug);
  if (!data) return { title: "Beat" };
  const { beat } = data;
  const title = `${beat.title} — ${beat.genre_name ?? beat.genre} beat by ${beat.producer_name}`;
  const description = `${beat.bpm} BPM · ${keyName(beat.key_note, beat.key_mode, "long")} · ${beat.genre_name}. Preview and license "${beat.title}" instantly.`;
  const image = coverUrl(beat.cover_path);
  return {
    title,
    description,
    alternates: { canonical: `/beats/${beat.slug}` },
    openGraph: { title, description, type: "music.song", images: image ? [{ url: image, width: 1200, height: 1200 }] : undefined },
    twitter: { card: image ? "summary_large_image" : "summary", title, description, images: image ? [image] : undefined },
  };
}

function DetailSkeleton() {
  return (
    <div className="mx-auto max-w-[1400px] px-4 pt-10 sm:px-6 lg:px-8">
      <div className="grid gap-10 lg:grid-cols-[440px_minmax(0,1fr)]">
        <Skeleton className="aspect-square rounded-[2rem]" />
        <div className="space-y-5">
          <Skeleton className="h-6 w-40" />
          <Skeleton className="h-16 w-3/4" />
          <Skeleton className="h-6 w-56" />
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-64 w-full rounded-3xl" />
        </div>
      </div>
    </div>
  );
}

async function BeatDetail({ params }: { params: PageProps<"/beats/[slug]">["params"] }) {
  const { slug } = await params;
  let data = await getPublicBeat(slug);
  let previewStatus: BeatStatus | null = null;
  if (!data) {
    const viewerData = await getBeatForViewer(slug);
    if (!viewerData) notFound();
    data = viewerData;
    previewStatus = viewerData.status as BeatStatus;
  }

  const { beat, licenses, producer } = data;
  const [reviews, more, similar] = await Promise.all([
    getBeatReviews(beat.id),
    searchBeatsCached({ p_producer_id: beat.producer_id, p_exclude_id: beat.id, p_sort: "popular", p_limit: 5 }),
    searchBeatsCached({ p_genres: [beat.genre], p_exclude_id: beat.id, p_sort: "trending", p_limit: 10 }),
  ]);
  const similarItems = similar.items.filter((b) => b.producer_id !== beat.producer_id).slice(0, 5);
  const art = coverUrl(beat.cover_path);
  const keyGroup = KEY_GROUPS[beat.key_group];
  const sold = !!beat.exclusive_sold_at;

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: beat.title,
    description: beat.description ?? `${beat.genre_name} beat, ${beat.bpm} BPM, ${keyName(beat.key_note, beat.key_mode, "long")}`,
    image: art ?? undefined,
    brand: { "@type": "Brand", name: beat.producer_name },
    url: `${env.siteUrl}/beats/${beat.slug}`,
    ...(beat.rating_count > 0 && {
      aggregateRating: { "@type": "AggregateRating", ratingValue: beat.rating_avg, reviewCount: beat.rating_count },
    }),
    offers: licenses
      .filter((l) => l.type !== "free")
      .map((l) => ({ "@type": "Offer", name: l.name, price: (l.price_eur / 100).toFixed(2), priceCurrency: "EUR", availability: sold ? "https://schema.org/SoldOut" : "https://schema.org/InStock" })),
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />

      <div className="relative isolate overflow-hidden">
        {art && (
          <div className="absolute inset-x-0 top-0 -z-10 h-[620px] opacity-40" aria-hidden>
            <div className="absolute inset-0 scale-125 blur-[110px] saturate-150" style={{ background: `url(${art}) center/cover` }} />
            <div className="absolute inset-0 bg-gradient-to-b from-transparent via-ink-950/40 to-ink-950" />
          </div>
        )}

        <div className="mx-auto max-w-[1400px] px-4 pt-8 sm:px-6 md:pt-12 lg:px-8">
          {previewStatus && previewStatus !== "published" && (
            <div className="mb-6 flex items-center gap-3 rounded-2xl border border-warning/30 bg-warning/10 px-4 py-3 text-sm text-warning">
              <Eye className="h-4 w-4 shrink-0" />
              Private preview — this beat is <strong>{BEAT_STATUS_LABEL[previewStatus]}</strong> and not visible in the marketplace.
            </div>
          )}

          <nav className="mb-8 flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.2em] text-ink-400" aria-label="Breadcrumb">
            <Link href="/beats" className="hover:text-white">Beats</Link>
            <span>/</span>
            <Link href={`/beats?genre=${beat.genre}`} className="hover:text-white">{beat.genre_name ?? beat.genre}</Link>
            <span>/</span>
            <span className="truncate text-ink-200">{beat.title}</span>
          </nav>

          <div className="grid gap-10 lg:grid-cols-[minmax(0,440px)_minmax(0,1fr)] lg:gap-14">
            <div className="lg:sticky lg:top-24 lg:self-start">
              <div className="relative">
                <BeatCover path={beat.cover_path} title={beat.title} seed={beat.id} priority sizes="(max-width: 1024px) 92vw, 440px" className="aspect-square w-full rounded-[2rem] border border-white/[0.08] shadow-[0_50px_120px_-40px_rgba(0,0,0,0.95)]" />
                {sold && (
                  <span className="glass absolute left-5 top-5 inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold uppercase tracking-wider text-warning">
                    <Crown className="h-3.5 w-3.5" /> Sold exclusively
                  </span>
                )}
              </div>
              <dl className="mt-5 grid grid-cols-3 gap-3">
                {[
                  { icon: Headphones, label: "Plays", value: formatCompact(beat.plays_count) },
                  { icon: Heart, label: "Favorites", value: formatCompact(beat.favorites_count) },
                  { icon: ShoppingBag, label: "Sales", value: formatCompact(beat.sales_count) },
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
                <Badge tone="accent">{beat.genre_name ?? beat.genre}</Badge>
                {beat.moods.map((m) => (
                  <Link
                    key={m}
                    href={MOODS.some((x) => x.value === m) ? `/beats?mood=${m}` : `/beats?q=${encodeURIComponent(m)}`}
                    className="transition hover:opacity-80"
                  >
                    <Badge>{moodLabel(m)}</Badge>
                  </Link>
                ))}
                {beat.is_featured && <Badge tone="solid">Staff pick</Badge>}
              </div>

              <div className="mt-5 flex items-start justify-between gap-4">
                <h1 className="font-display text-[clamp(2.4rem,6vw,4.6rem)] font-extrabold leading-[0.95] tracking-[-0.045em]">{beat.title}</h1>
                <div className="pt-2">
                  <ShareButtons beatId={beat.id} title={beat.title} />
                </div>
              </div>

              <Link href={`/producers/${producer.username}`} className="group mt-5 inline-flex items-center gap-3">
                <Avatar path={producer.avatar_path} name={beat.producer_name} size={40} />
                <span>
                  <span className="flex items-center gap-1.5 font-semibold group-hover:underline">
                    {beat.producer_name}
                    {producer.is_verified && <BadgeCheck className="h-4 w-4 text-accent-400" />}
                  </span>
                  <span className="block text-xs text-ink-400">@{producer.username}</span>
                </span>
              </Link>

              <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
                {[
                  { label: "Tempo", value: `${beat.bpm} BPM` },
                  { label: "Key", value: keyName(beat.key_note, beat.key_mode, "long"), sub: keyGroup ? keyGroup.label : undefined },
                  { label: "Length", value: formatDuration(beat.duration_seconds), icon: Clock },
                  { label: "Genre", value: beat.genre_name ?? beat.genre, icon: Music2 },
                ].map((s) => (
                  <div key={s.label} className="rounded-2xl border border-white/[0.07] bg-white/[0.02] px-4 py-3.5">
                    <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-ink-400">{s.label}</p>
                    <p className="mt-1 text-lg font-semibold tracking-tight">{s.value}</p>
                    {s.sub && <p className="text-[11px] text-ink-400">{s.sub}</p>}
                  </div>
                ))}
              </div>

              <div className="glass mt-6 rounded-3xl p-5 md:p-6">
                <BeatHeroPlayer beat={beat} queue={[beat, ...more.items, ...similarItems]} />
              </div>

              <section className="mt-10" id="licenses">
                <h2 className="mb-5 font-display text-2xl font-bold tracking-tight">Licensing</h2>
                <BeatLicenses beat={beat} licenses={licenses} />
              </section>

              {(beat.description || beat.tags.length > 0) && (
                <section className="mt-12">
                  <h2 className="mb-4 font-display text-2xl font-bold tracking-tight">About this beat</h2>
                  {beat.description && <p className="whitespace-pre-line leading-relaxed text-ink-200">{beat.description}</p>}
                  {beat.tags.length > 0 && (
                    <div className="mt-5 flex flex-wrap gap-2">
                      {beat.tags.map((t) => (
                        <Link key={t} href={`/beats?q=${encodeURIComponent(t)}`} className="rounded-full border border-white/10 px-3 py-1 text-[13px] text-ink-300 transition hover:border-white/30 hover:text-white">
                          #{t}
                        </Link>
                      ))}
                    </div>
                  )}
                </section>
              )}

              <div className="mt-12">
                <ReviewsSection beatId={beat.id} initial={reviews} ratingAvg={beat.rating_avg} ratingCount={beat.rating_count} />
              </div>
            </div>
          </div>
        </div>
      </div>

      {more.items.length > 0 && (
        <section className="mx-auto mt-24 max-w-[1400px] px-4 sm:px-6 lg:px-8">
          <SectionHeading eyebrow={`More from ${beat.producer_name}`} title="From the same producer" action={<Link href={`/producers/${producer.username}`} className="text-sm text-ink-300 hover:text-white">View profile →</Link>} />
          <div className="grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-3 lg:grid-cols-5">
            {more.items.map((b) => (
              <BeatCard key={b.id} beat={b} queue={more.items} />
            ))}
          </div>
        </section>
      )}

      {similarItems.length > 0 && (
        <section className="mx-auto mt-20 max-w-[1400px] px-4 sm:px-6 lg:px-8">
          <SectionHeading eyebrow="You might also like" title={`Similar ${beat.genre_name ?? ""} beats`} action={<Link href={`/beats?genre=${beat.genre}`} className="text-sm text-ink-300 hover:text-white">Explore genre →</Link>} />
          <div className="grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-3 lg:grid-cols-5">
            {similarItems.map((b) => (
              <BeatCard key={b.id} beat={b} queue={similarItems} />
            ))}
          </div>
        </section>
      )}
    </>
  );
}

export default function BeatPage({ params }: PageProps<"/beats/[slug]">) {
  return (
    <Suspense fallback={<DetailSkeleton />}>
      <BeatDetail params={params} />
    </Suspense>
  );
}
