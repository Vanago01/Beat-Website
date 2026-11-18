import { NextResponse, type NextRequest } from "next/server";
import { getViewer } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { isPluginPlatform, newestPerPlatform } from "@/lib/plugin-files";
import { isPluginSlug, listPluginFiles, PLUGIN_BUCKET } from "@/lib/plugins";

/**
 * Members-only download of a plug-in installer: checks the session, then redirects to a
 * 60-second signed link to the newest file for the visitor's system. The bucket itself is
 * private, so this is the only way to the files.
 */
export async function GET(request: NextRequest, ctx: RouteContext<"/api/plugins/[plugin]/download">) {
  const { plugin } = await ctx.params;
  if (!isPluginSlug(plugin)) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const platform = request.nextUrl.searchParams.get("platform");
  if (!isPluginPlatform(platform)) return NextResponse.json({ error: "Unknown system" }, { status: 400 });

  const page = `/plugins/${plugin}`;
  const viewer = await getViewer();
  if (!viewer) {
    // Signed out - or signed in with a password while a two-factor code is still due.
    const supabase = await createSupabaseServerClient();
    const { data } = await supabase.auth.getClaims();
    const target = data?.claims?.sub ? "/two-factor" : "/login";
    return NextResponse.redirect(new URL(`${target}?next=${encodeURIComponent(page)}`, request.url));
  }

  // If the file can't be handed out, the member goes back to the page, which says so.
  const sorry = () => {
    const res = NextResponse.redirect(new URL(`${page}?download=failed`, request.url), 303);
    res.headers.set("Cache-Control", "private, no-store");
    return res;
  };

  try {
    const file = newestPerPlatform(await listPluginFiles(plugin))[platform];
    if (!file) return sorry();

    const { data: signed, error } = await createSupabaseAdminClient()
      .storage.from(PLUGIN_BUCKET)
      .createSignedUrl(file.path, 60, { download: file.name });
    if (error || !signed) throw new Error(error?.message ?? "no signed link");

    const res = NextResponse.redirect(signed.signedUrl, 302);
    res.headers.set("Cache-Control", "private, no-store");
    return res;
  } catch (err) {
    console.error("[plugins] download failed:", err instanceof Error ? err.message : err);
    return sorry();
  }
}
