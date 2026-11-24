import Link from "next/link";
import { Download } from "lucide-react";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { EmptyState } from "@/components/ui/misc";
import { buttonVariants } from "@/components/ui/button";
import { formatDateTime } from "@/lib/format";
import { PLATFORM_LABEL, isPluginPlatform } from "@/lib/plugin-files";
import { PLUGIN_CATALOG, type PluginSlug } from "@/lib/plugin-catalog";

const PAGE = 50;

const pluginName = (slug: string) => (slug in PLUGIN_CATALOG ? PLUGIN_CATALOG[slug as PluginSlug].name : slug.toUpperCase());
const systemName = (platform: string) => (isPluginPlatform(platform) ? PLATFORM_LABEL[platform] : platform);
const plural = (n: number, one: string, many: string) => `${n.toLocaleString("en")} ${n === 1 ? one : many}`;

/** Admin → Orders → Plug-in downloads: every download of a plug-in, newest first, like an order. */
export async function PluginDownloadList({ page }: { page: number }) {
  const supabase = await createSupabaseServerClient();
  const [{ data, count, error }, { data: stats }] = await Promise.all([
    supabase
      .from("plugin_downloads")
      .select("id, download_number, plugin, platform, version, email, created_at, member:profiles!plugin_downloads_user_id_fkey(username, display_name, producer_name)", {
        count: "exact",
      })
      .order("created_at", { ascending: false })
      .range(page * PAGE, page * PAGE + PAGE - 1),
    supabase.rpc("plugin_download_stats"),
  ]);

  if (error) {
    // A database without update 19 has no such table yet.
    const missing = /plugin_downloads|schema cache|does not exist/i.test(error.message);
    return (
      <EmptyState
        icon={<Download className="h-6 w-6" />}
        title={missing ? "Not set up yet" : "Couldn't load the downloads"}
        description={missing ? "Recording plug-in downloads needs the site's database update 19." : error.message}
      />
    );
  }

  const total = count ?? 0;
  return (
    <>
      {!!stats?.length && (
        <div className="mb-5 flex flex-wrap gap-3">
          {stats.map((s) => (
            <div key={s.plugin} className="glass rounded-2xl px-4 py-3 text-sm">
              <span className="font-semibold">{pluginName(s.plugin)}</span>
              <span className="text-ink-300">
                {" "}
                · {plural(Number(s.downloads), "download", "downloads")} by {plural(Number(s.people), "person", "people")}
              </span>
            </div>
          ))}
        </div>
      )}
      {!data?.length ? (
        <EmptyState
          icon={<Download className="h-6 w-6" />}
          title="No plug-in downloads yet"
          description="When a member downloads a plug-in, it shows up here with who it was and when."
        />
      ) : (
        <div className="glass overflow-x-auto rounded-3xl">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b border-white/[0.06] text-left font-mono text-[10px] uppercase tracking-[0.18em] text-ink-400">
                <th className="px-5 py-3 font-medium">Download</th>
                <th className="px-3 py-3 font-medium">Member</th>
                <th className="px-3 py-3 font-medium">Plug-in</th>
                <th className="px-5 py-3 text-right font-medium">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.05]">
              {data.map((d) => {
                const member = d.member as unknown as { username: string; display_name: string | null; producer_name: string | null } | null;
                const name = member ? member.producer_name || member.display_name || member.username : null;
                return (
                  <tr key={d.id} className="align-top">
                    <td className="px-5 py-3">
                      <p className="font-mono text-xs">#P{d.download_number}</p>
                      <p className="text-xs text-ink-400">{formatDateTime(d.created_at)}</p>
                    </td>
                    <td className="px-3 py-3">
                      {member ? (
                        <Link href={`/producers/${member.username}`} className="font-medium hover:underline">
                          {name} <span className="font-normal text-ink-400">@{member.username}</span>
                        </Link>
                      ) : (
                        <p className="font-medium">—</p>
                      )}
                      <p className="text-xs text-ink-400">{d.email ?? ""}</p>
                    </td>
                    <td className="px-3 py-3">
                      <p className="text-xs">
                        <span className="text-ink-100">{pluginName(d.plugin)}</span>{" "}
                        <span className="text-ink-400">
                          · {systemName(d.platform)}
                          {d.version ? ` · version ${d.version}` : ""}
                        </span>
                      </p>
                    </td>
                    <td className="px-5 py-3 text-right font-semibold">Free</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {total > PAGE && (
        <div className="mt-8 flex items-center justify-center gap-3 text-sm">
          {page > 0 && (
            <Link href={`/admin/orders?status=plugins&page=${page - 1}`} className={buttonVariants({ variant: "secondary", size: "sm" })}>
              ← Previous
            </Link>
          )}
          <span className="text-ink-400">
            Page {page + 1} of {Math.ceil(total / PAGE)}
          </span>
          {(page + 1) * PAGE < total && (
            <Link href={`/admin/orders?status=plugins&page=${page + 1}`} className={buttonVariants({ variant: "secondary", size: "sm" })}>
              Next →
            </Link>
          )}
        </div>
      )}
    </>
  );
}
