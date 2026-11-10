import type { Metadata } from "next";
import { Suspense } from "react";
import Image from "next/image";
import { notFound } from "next/navigation";
import { BadgeCheck, CalendarDays, MapPin } from "lucide-react";
import { getPublicProducer, getPublishedPacks, searchBeatsCached } from "@/lib/data/catalog";
import { PackCard } from "@/components/packs/pack-card";
import { Avatar } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/misc";
import { SocialIcon } from "@/components/layout/social-icon";
import { ProducerBeats } from "@/components/home/producer-beats";
import { OwnProfileLink } from "@/components/home/own-profile-link";
import { MessageButton } from "@/components/messages/message-button";
import { avatarUrl } from "@/lib/storage";
import { formatCompact, formatDate } from "@/lib/format";
import { SOCIAL_FIELDS, type SocialKey } from "@/lib/constants";
import { hashString } from "@/lib/utils";

export async function generateMetadata({ params }: PageProps<"/producers/[username]">): Promise<Metadata> {
  const { username } = await params;
  const data = await getPublicProducer(username);
  if (!data) return { title: "Producer" };
  const p = data.profile;
  const name = p.producer_name || p.display_name || p.username;
  const image = avatarUrl(p.avatar_path);
  return {
    title: `${name} — Beats & Instrumentals`,
    description: p.bio?.slice(0, 160) ?? `License beats by ${name}.`,
    openGraph: { images: image ? [image] : undefined },
  };
}

function safeUrl(value: unknown) {
  if (typeof value !== "string") return null;
  try {
    const u = new URL(value);
    return u.protocol === "https:" || u.protocol === "http:" ? u.toString() : null;
  } catch {
    return null;
  }
}

async function Producer({ params }: { params: PageProps<"/producers/[username]">["params"] }) {
  const { username } = await params;
  const data = await getPublicProducer(username);
  if (!data) notFound();
  const { profile: p, stats } = data;
  const name = p.producer_name || p.display_name || p.username;
  const [beats, packs] = await Promise.all([searchBeatsCached({ p_producer_id: p.id, p_sort: "newest", p_limit: 24 }), getPublishedPacks(12, p.id)]);
  const socials = (p.social_links ?? {}) as Record<string, unknown>;
  const links = SOCIAL_FIELDS.map((f) => ({ ...f, url: safeUrl(socials[f.key]) })).filter((l) => l.url);
  const banner = p.banner_path ? avatarUrl(p.banner_path) : null;
  const hue = hashString(p.username) % 360;

  return (
    <>
      <div className="relative h-56 overflow-hidden md:h-72">
        {banner ? (
          <Image src={banner} alt="" fill priority sizes="100vw" className="object-cover" />
        ) : (
          <div
            className="absolute inset-0"
            style={{ background: `radial-gradient(80% 120% at 20% 0%, hsl(${hue} 70% 50% / 0.55), transparent 60%), radial-gradient(70% 100% at 90% 100%, hsl(${(hue + 70) % 360} 70% 45% / 0.45), transparent 60%), var(--color-ink-900)` }}
          />
        )}
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-ink-950/30 to-ink-950" />
      </div>
      <div className="mx-auto max-w-[1400px] px-4 sm:px-6 lg:px-8">
        <div className="relative -mt-20 flex flex-col gap-6 md:-mt-24 md:flex-row md:items-end md:justify-between">
          <div className="flex flex-col gap-5 md:flex-row md:items-end">
            <Avatar path={p.avatar_path} name={name} size={144} className="ring-[6px] ring-ink-950" />
            <div className="pb-1">
              <h1 className="flex items-center gap-2.5 font-display text-4xl font-extrabold tracking-[-0.04em] md:text-6xl">
                {name}
                {p.is_verified && <BadgeCheck className="h-7 w-7 text-accent-400 md:h-9 md:w-9" />}
              </h1>
              <p className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-ink-300">
                <span>@{p.username}</span>
                {p.location && (
                  <span className="flex items-center gap-1">
                    <MapPin className="h-3.5 w-3.5" /> {p.location}
                  </span>
                )}
                <span className="flex items-center gap-1">
                  <CalendarDays className="h-3.5 w-3.5" /> Joined {formatDate(p.created_at)}
                </span>
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 pb-1">
            {links.map((l) => (
              <a key={l.key} href={l.url!} target="_blank" rel="noopener noreferrer nofollow" className="glass grid h-10 w-10 place-items-center rounded-full text-ink-100 transition hover:bg-white/15 hover:text-white" aria-label={l.label}>
                <SocialIcon name={l.key as SocialKey} />
              </a>
            ))}
            <OwnProfileLink profileId={p.id} />
            <MessageButton profileId={p.id} returnTo={`/producers/${p.username}`} variant="primary" />
          </div>
        </div>

        <div className="mt-10 grid gap-10 lg:grid-cols-[320px_minmax(0,1fr)]">
          <aside className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              {[
                { label: "Beats", value: stats.beats },
                { label: "Plays", value: stats.plays },
                { label: "Sales", value: stats.sales },
                { label: "Favorites", value: stats.favorites },
              ].map((s) => (
                <div key={s.label} className="glass rounded-2xl px-4 py-3.5">
                  <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-ink-400">{s.label}</p>
                  <p className="mt-1 text-2xl font-semibold tracking-tight">{formatCompact(s.value)}</p>
                </div>
              ))}
            </div>
            {p.bio && (
              <div className="glass rounded-3xl p-5">
                <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.2em] text-ink-400">About</p>
                <p className="whitespace-pre-line text-sm leading-relaxed text-ink-200">{p.bio}</p>
              </div>
            )}
          </aside>
          <div className="min-w-0 space-y-12">
            {packs.length > 0 && (
              <section>
                <h2 className="mb-5 font-display text-2xl font-bold tracking-tight">Beat packs</h2>
                <div className="grid grid-cols-2 gap-x-4 gap-y-10 sm:grid-cols-3 xl:grid-cols-4">
                  {packs.map((pk) => (
                    <PackCard key={pk.id} pack={pk} />
                  ))}
                </div>
              </section>
            )}
            <ProducerBeats producerId={p.id} initial={beats} />
          </div>
        </div>
      </div>
    </>
  );
}

export default function ProducerPage({ params }: PageProps<"/producers/[username]">) {
  return (
    <Suspense
      fallback={
        <div>
          <Skeleton className="h-56 rounded-none md:h-72" />
          <div className="mx-auto max-w-[1400px] px-4 sm:px-6 lg:px-8">
            <Skeleton className="-mt-20 h-36 w-36 rounded-full" />
            <Skeleton className="mt-6 h-12 w-80" />
          </div>
        </div>
      }
    >
      <Producer params={params} />
    </Suspense>
  );
}
