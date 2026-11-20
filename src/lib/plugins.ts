import "server-only";

import { cacheLife, cacheTag } from "next/cache";
import { createSupabaseAdminClient } from "./supabase/admin";
import { newestPerPlatform, parsePluginFileName, type PluginDownloadInfo, type PluginFile, type PluginPlatform } from "./plugin-files";
import { PLUGIN_CATALOG, type PluginSlug } from "./plugin-catalog";

/** Private bucket: nobody reads it directly. Members get short-lived signed links from the server. */
export const PLUGIN_BUCKET = "plugin-files";

/**
 * The plug-ins the site hands out (the catalog in plugin-catalog.ts). The key is
 * the page under /plugins and the folder in the bucket.
 */
export const PLUGINS = PLUGIN_CATALOG;

export type { PluginSlug };

export function isPluginSlug(value: string): value is PluginSlug {
  return Object.hasOwn(PLUGINS, value);
}

/** Every installer in the plug-in's folder (service role: the bucket has no public access). */
export async function listPluginFiles(plugin: PluginSlug): Promise<PluginFile[]> {
  const { data, error } = await createSupabaseAdminClient()
    .storage.from(PLUGIN_BUCKET)
    .list(plugin, { limit: 200, sortBy: { column: "name", order: "asc" } });
  if (error) throw new Error(error.message);

  return (data ?? []).flatMap((object) => {
    const parsed = parsePluginFileName(object.name);
    if (!parsed) return [];
    const size = Number((object.metadata as { size?: number } | null)?.size ?? 0);
    const { platform, version, downloadName } = parsed;
    return [{ platform, version, path: `${plugin}/${object.name}`, name: downloadName, size, updatedAt: object.updated_at ?? object.created_at ?? null }];
  });
}

/**
 * What the plug-in's page shows: the newest version of each system, without storage paths.
 * Cached for a few minutes, so a file uploaded in the Supabase dashboard appears on its own.
 */
export async function getPluginDownloads(plugin: PluginSlug): Promise<Partial<Record<PluginPlatform, PluginDownloadInfo>>> {
  "use cache";
  cacheLife("minutes");
  cacheTag("plugins");

  try {
    const newest = newestPerPlatform(await listPluginFiles(plugin));
    return Object.fromEntries(
      Object.entries(newest).map(([platform, file]) => [platform, { version: file.version, size: file.size, updatedAt: file.updatedAt }]),
    );
  } catch (err) {
    // Not set up yet (no bucket, no service key): the page says the download is on its way.
    console.error("[plugins] could not list the installers:", err instanceof Error ? err.message : err);
    return {};
  }
}
