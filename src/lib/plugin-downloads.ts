import "server-only";

import { createSupabaseAdminClient } from "./supabase/admin";
import type { PluginPlatform } from "./plugin-files";
import type { PluginSlug } from "./plugin-catalog";

/** Clicking again (or the browser retrying) within this time counts as the same download. */
const SAME_DOWNLOAD_MS = 2 * 60 * 1000;

/**
 * Records that a member downloaded a plug-in, for Admin → Orders → Plug-in
 * downloads (database update 19). Never throws: the download itself matters more.
 */
export async function recordPluginDownload(download: {
  userId: string;
  email: string | null;
  plugin: PluginSlug;
  platform: PluginPlatform;
  version: string | null;
}) {
  try {
    const admin = createSupabaseAdminClient();
    const since = new Date(Date.now() - SAME_DOWNLOAD_MS).toISOString();
    const { data: recent, error } = await admin
      .from("plugin_downloads")
      .select("id")
      .eq("user_id", download.userId)
      .eq("plugin", download.plugin)
      .eq("platform", download.platform)
      .gte("created_at", since)
      .limit(1);
    if (error) throw new Error(error.message);
    if (recent?.length) return;

    const { error: insertError } = await admin.from("plugin_downloads").insert({
      user_id: download.userId,
      email: download.email,
      plugin: download.plugin,
      platform: download.platform,
      version: download.version,
    });
    if (insertError) throw new Error(insertError.message);
  } catch (err) {
    // E.g. a database without update 19: the download still works, it just isn't listed.
    console.error("[plugins] couldn't record the download:", err instanceof Error ? err.message : err);
  }
}
