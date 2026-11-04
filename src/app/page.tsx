import Link from "next/link";
import { ArrowRight, ArrowUpRight, Flame, Sparkles, TrendingUp, Upload } from "lucide-react";
import { getHomeData, getPlatformSettings } from "@/lib/data/catalog";
import { Hero } from "@/components/home/hero";
import { GenreMarquee } from "@/components/home/genre-marquee";
import { Carousel } from "@/components/home/carousel";
import { GenreTiles } from "@/components/home/genre-tiles";
import { ProducerCard } from "@/components/home/producer-card";
import { BeatCard } from "@/components/beats/beat-card";
import { BeatRow } from "@/components/beats/beat-row";
import { SectionHeading } from "@/components/ui/misc";
import { buttonVariants } from "@/components/ui/button";

function ViewAll({ href, label = "View all" }: { href: string; label?: string }) {
  return (
    <Link href={href} className="group inline-flex shrink-0 items-center gap-1.5 text-sm text-ink-300 transition hover:text-white">
      {label}
      <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
    </Link>
  );
}

function Section({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <section className={`mx-auto max-w-[1400px] px-4 sm:px-6 lg:px-8 ${className}`}>{children}</section>;
}

export default async function HomePage() {
  const [data, settings] = await Promise.all([getHomeData(), getPlatformSettings()]);
  const hero = data.featured[0] ?? data.trending[0] ?? data.newReleases[0] ?? null;
  const heroQueue = data.featured.length ? data.featured : data.trending;
  const moreFeatured = data.featured.slice(1);
  const hasBeats = data.stats.beats > 0;
  const fee = settings ? Number(settings.platform_fee_percent) : 20;

  return (
    <>
      <Hero featured={hero} queue={heroQueue} stats={data.stats} />
      <GenreMarquee genres={data.genres.map((g) => ({ slug: g.slug, name: g.name }))} />

      {!hasBeats && (
        <Section className="mt-20">
          <div className="glass relative overflow-hidden rounded-[2rem] p-10 text-center md:p-16">
            <div className="absolute inset-0 -z-10 opacity-50 [background:radial-gradient(circle_at_50%_0%,rgba(124,108,255,0.35),transparent_60%)]" />
            <Upload className="mx-auto h-8 w-8 text-accent-300" />
            <h2 className="mt-5 font-display text-3xl font-bold tracking-tight md:text-5xl">Be the first sound on the platform.</h2>
            <p className="mx-auto mt-4 max-w-lg text-ink-300">
              The catalogue is open for uploads. Producers can publish beats, set licenses and start selling in minutes.
            </p>
            <div className="mt-8 flex justify-center gap-3">
              <Link href="/sell" className={buttonVariants({ size: "lg" })}>
                Start selling
              </Link>
              <Link href="/beats" className={buttonVariants({ variant: "secondary", size: "lg" })}>
                Browse catalogue
              </Link>
            </div>
          </div>
        </Section>
      )}

      {data.trending.length > 0 && (
        <Section className="mt-20 md:mt-28">
          <SectionHeading
            eyebrow="Hot right now"
            title={
              <span className="inline-flex items-center gap-3">
                Trending Beats <Flame className="h-7 w-7 text-accent-300" />
              </span>
            }
            action={<ViewAll href="/beats?sort=trending" />}
          />
          <Carousel>
            {data.trending.map((b, i) => (
              <BeatCard key={b.id} beat={b} queue={data.trending} priority={i < 2} />
            ))}
          </Carousel>
        </Section>
      )}

      {moreFeatured.length > 0 && (
        <Section className="mt-20 md:mt-28">
          <SectionHeading
            eyebrow="Curated"
            title={
              <span className="inline-flex items-center gap-3">
                Staff picks <Sparkles className="h-6 w-6 text-accent-300" />
              </span>
            }
            action={<ViewAll href="/beats?featured=1" />}
          />
          <div className="grid grid-cols-2 gap-x-4 gap-y-8 md:grid-cols-3 md:gap-x-5 lg:grid-cols-5">
            {moreFeatured.map((b) => (
              <BeatCard key={b.id} beat={b} queue={moreFeatured} />
            ))}
          </div>
        </Section>
      )}

      {data.newReleases.length > 0 && (
        <Section className="mt-20 md:mt-28">
          <SectionHeading eyebrow="Fresh drops" title="New Releases" action={<ViewAll href="/beats?sort=newest" />} />
          <div className="grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-3 md:gap-x-5 lg:grid-cols-4">
            {data.newReleases.map((b) => (
              <BeatCard key={b.id} beat={b} queue={data.newReleases} />
            ))}
          </div>
        </Section>
      )}

      {data.bestSelling.length > 0 && (
        <Section className="mt-20 md:mt-28">
          <div className="grid gap-10 lg:grid-cols-[0.8fr_1.2fr] lg:gap-16">
            <div className="lg:sticky lg:top-28 lg:self-start">
              <SectionHeading
                eyebrow="The charts"
                title={
                  <span className="inline-flex items-center gap-3">
                    Best Selling <TrendingUp className="h-7 w-7 text-accent-300" />
                  </span>
                }
                className="mb-4"
              />
              <p className="max-w-sm text-ink-300">
                The beats artists are licensing most right now — ranked by real sales across the marketplace.
              </p>
              <Link href="/beats?sort=best_selling" className={buttonVariants({ variant: "secondary", className: "mt-6" })}>
                Full chart <ArrowUpRight className="h-4 w-4" />
              </Link>
            </div>
            <div className="flex flex-col gap-1">
              {data.bestSelling.map((b, i) => (
                <BeatRow key={b.id} beat={b} index={i} queue={data.bestSelling} />
              ))}
            </div>
          </div>
        </Section>
      )}

      {data.genres.length > 0 && (
        <Section className="mt-20 md:mt-28">
          <SectionHeading eyebrow="Explore by sound" title="Popular Genres" action={<ViewAll href="/beats" label="All genres" />} />
          <GenreTiles genres={[...data.genres].sort((a, b) => b.beats_count - a.beats_count)} />
        </Section>
      )}

      {data.producers.length > 0 && (
        <Section className="mt-20 md:mt-28">
          <SectionHeading eyebrow="The talent" title="Featured Producers" action={<ViewAll href="/producers" />} />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {data.producers.map((p) => (
              <ProducerCard key={p.id} producer={p} />
            ))}
          </div>
        </Section>
      )}

      {data.recentlyUploaded.length > 0 && (
        <Section className="mt-20 md:mt-28">
          <SectionHeading eyebrow="Just landed" title="Recently Uploaded" action={<ViewAll href="/beats?sort=newest" />} />
          <div className="glass flex flex-col gap-1 rounded-3xl p-2 md:p-3">
            {data.recentlyUploaded.map((b) => (
              <BeatRow key={b.id} beat={b} queue={data.recentlyUploaded} />
            ))}
          </div>
        </Section>
      )}

      <Section className="mt-24 md:mt-32">
        <div className="relative overflow-hidden rounded-[2.2rem] border border-white/[0.08] bg-ink-900 p-8 sm:p-12 md:p-16">
          <div className="absolute -right-24 -top-24 h-96 w-96 rounded-full bg-accent/30 blur-[120px]" aria-hidden />
          <div className="absolute -bottom-32 left-1/3 h-80 w-80 rounded-full bg-electric/20 blur-[120px]" aria-hidden />
          <div className="relative grid items-end gap-10 lg:grid-cols-[1.3fr_1fr]">
            <div>
              <p className="font-mono text-[11px] uppercase tracking-[0.25em] text-accent-300">For producers</p>
              <h2 className="mt-4 font-display text-4xl font-extrabold leading-[0.95] tracking-[-0.04em] md:text-6xl">
                Your beats.
                <br />
                Your rules. Your revenue.
              </h2>
              <p className="mt-5 max-w-lg text-ink-300">
                Upload WAVs and stems, set your own license prices in EUR and PLN, and get paid straight to your bank via Stripe.
                Keep {100 - fee}% of every sale.
              </p>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row lg:justify-end">
              <Link href="/sell" className={buttonVariants({ size: "xl" })}>
                Start selling <ArrowRight className="h-4 w-4" />
              </Link>
              <Link href="/producers" className={buttonVariants({ variant: "secondary", size: "xl" })}>
                Meet the producers
              </Link>
            </div>
          </div>
        </div>
      </Section>
    </>
  );
}
