import Image from "next/image";
import Link from "next/link";
import { Price } from "@/components/beats/price";
import { pluginHref, type PluginListItem } from "@/lib/plugin-catalog";

/** A plug-in in the /plugins list: its picture, then its name and price, then what it is. */
export function PluginCard({ plugin, eager }: { plugin: PluginListItem; eager?: boolean }) {
  return (
    <Link href={pluginHref(plugin.slug)} className="group block rounded-2xl focus-visible:outline-offset-4">
      <div className="relative aspect-video overflow-hidden rounded-2xl border border-white/[0.08] bg-ink-900 shadow-[0_30px_90px_-50px_color-mix(in_oklab,var(--color-accent)_60%,transparent)] transition duration-500 group-hover:-translate-y-0.5 group-hover:border-white/[0.16]">
        <Image
          src={plugin.image}
          alt=""
          fill
          sizes="(min-width: 1400px) 440px, (min-width: 1024px) 31vw, (min-width: 640px) 47vw, 100vw"
          loading={eager ? "eager" : "lazy"}
          className="object-cover transition duration-700 group-hover:scale-[1.03]"
        />
      </div>
      <div className="mt-4 flex items-baseline justify-between gap-3 px-0.5">
        <h2 className="truncate font-display text-xl font-bold tracking-[-0.02em] text-ink-50 group-hover:text-white">{plugin.name}</h2>
        {plugin.price ? (
          <Price eur={plugin.price.eur} pln={plugin.price.pln} usd={plugin.price.usd} className="shrink-0 text-[15px] font-semibold text-ink-50" />
        ) : (
          <span className="shrink-0 text-[15px] font-semibold text-ink-50">Free</span>
        )}
      </div>
      <p className="mt-1 truncate px-0.5 text-[13px] text-ink-400">
        {plugin.category} · {plugin.formats}
      </p>
    </Link>
  );
}
