/**
 * The plug-ins on the site, in the order /plugins lists them. To add one: an
 * entry here, its page at /plugins/<slug>, and its installers in the plug-in
 * bucket under <slug>/ (see README, "Plug-in downloads").
 */
export interface PluginListing {
  name: string;
  /** What kind of plug-in it is, e.g. "Delay" or "Reverb". */
  category: string;
  /** Formats and systems, e.g. "VST3 · AU · Windows & Mac". */
  formats: string;
  /** Price in cents / grosze in each currency; null for a free plug-in. */
  price: { eur: number; pln: number; usd: number } | null;
  /** The picture on its card, shown 16:9 (a screenshot works well). */
  image: string;
  /** Where its source code is, for open-source plug-ins. */
  sourceUrl?: string;
}

export const PLUGIN_CATALOG = {
  dlay: {
    name: "DLAY",
    category: "Delay",
    formats: "VST3 · AU · Windows & Mac",
    price: null,
    image: "/plugins/dlay/time.webp",
    sourceUrl: "https://github.com/Vanago01/DLAY-VST",
  },
} as const satisfies Record<string, PluginListing>;

export type PluginSlug = keyof typeof PLUGIN_CATALOG;

export type PluginListItem = PluginListing & { slug: PluginSlug };

export const PLUGIN_LIST: PluginListItem[] = (Object.keys(PLUGIN_CATALOG) as PluginSlug[]).map((slug) => ({ slug, ...PLUGIN_CATALOG[slug] }));

export const pluginHref = (slug: PluginSlug) => `/plugins/${slug}`;
