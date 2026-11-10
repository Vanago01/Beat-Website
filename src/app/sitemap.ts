import type { MetadataRoute } from "next";
import { cacheLife, cacheTag } from "next/cache";
import { createSupabasePublicClient } from "@/lib/supabase/public";
import { env } from "@/lib/env";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  "use cache";
  cacheLife("hours");
  cacheTag("beats", "producers", "packs");

  const supabase = createSupabasePublicClient();
  const [{ data: beats }, { data: producers }, { data: packs }] = await Promise.all([
    supabase.from("beats").select("slug, updated_at, producer_id").eq("status", "published").order("published_at", { ascending: false }).limit(10000),
    supabase.from("profiles").select("id, username, updated_at").in("role", ["seller", "admin"]).limit(5000),
    supabase.from("pack_cards").select("slug, published_at").eq("status", "published").eq("available", true).limit(5000),
  ]);
  const activeProducers = new Set((beats ?? []).map((b) => b.producer_id));

  const pages: MetadataRoute.Sitemap = ["", "/beats", "/packs", "/producers", "/sell", "/legal/licensing"].map((p) => ({
    url: `${env.siteUrl}${p}`,
    changeFrequency: "daily",
    priority: p === "" ? 1 : 0.7,
  }));

  return [
    ...pages,
    ...(beats ?? []).map((b) => ({ url: `${env.siteUrl}/beats/${b.slug}`, lastModified: b.updated_at, changeFrequency: "weekly" as const, priority: 0.8 })),
    ...(packs ?? []).map((p) => ({ url: `${env.siteUrl}/packs/${p.slug}`, lastModified: p.published_at ?? undefined, changeFrequency: "weekly" as const, priority: 0.8 })),
    ...(producers ?? [])
      .filter((p) => activeProducers.has(p.id))
      .map((p) => ({ url: `${env.siteUrl}/producers/${p.username}`, lastModified: p.updated_at, changeFrequency: "weekly" as const, priority: 0.6 })),
  ];
}
