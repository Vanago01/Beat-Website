import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import { Ban, Download, FileText, Library } from "lucide-react";
import { requireViewer } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { BeatCover } from "@/components/beats/cover";
import { Badge, EmptyState } from "@/components/ui/misc";
import { buttonVariants } from "@/components/ui/button";
import { PageSkeleton } from "@/components/account/page-skeleton";
import { formatDate, keyName } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { LicenseSnapshot } from "@/lib/types";

export const metadata: Metadata = { title: "Purchased beats", robots: { index: false } };

async function LibraryList({ highlight }: { highlight?: string }) {
  await requireViewer("/account/library");
  const supabase = await createSupabaseServerClient();
  const { data: purchases, error } = await supabase
    .from("purchases")
    .select("id, license_number, license_type, includes_mp3, includes_wav, includes_stems, license_snapshot, revoked_at, created_at, beat_id")
    .order("created_at", { ascending: false });

  if (error) return <EmptyState title="Couldn't load your library" description={error.message} />;
  if (!purchases?.length) {
    return (
      <EmptyState
        icon={<Library className="h-6 w-6" />}
        title="No beats yet"
        description="Beats you purchase or download for free appear here, with your files and license agreements."
        action={<Link href="/beats" className={buttonVariants()}>Explore beats</Link>}
      />
    );
  }

  return (
    <ul className="space-y-3">
      {purchases.map((p) => {
        const s = p.license_snapshot as unknown as LicenseSnapshot;
        const revoked = !!p.revoked_at;
        const files: { key: string; label: string }[] =
          p.license_type === "free"
            ? [{ key: "preview", label: "Tagged MP3" }]
            : [
                ...(p.includes_mp3 ? [{ key: "mp3", label: "MP3" }] : []),
                ...(p.includes_wav ? [{ key: "wav", label: "WAV" }] : []),
                ...(p.includes_stems ? [{ key: "stems", label: "Stems" }] : []),
              ];
        return (
          <li
            key={p.id}
            id={p.id}
            className={cn(
              "glass flex flex-col gap-5 rounded-3xl p-4 md:flex-row md:items-center md:p-5",
              highlight === p.id && "border-accent/50 shadow-[0_0_0_4px_color-mix(in_oklab,var(--color-accent)_15%,transparent)]",
              revoked && "opacity-60",
            )}
          >
            <div className="flex min-w-0 flex-1 items-center gap-4">
              <BeatCover path={s.cover_path} title={s.beat_title} seed={p.beat_id} className="h-20 w-20 shrink-0 rounded-2xl" sizes="80px" showTitle={false} />
              <div className="min-w-0">
                <Link href={`/beats/${s.beat_slug}`} className="block truncate font-display text-lg font-bold hover:underline">
                  {s.beat_title}
                </Link>
                <p className="truncate text-sm text-ink-300">prod. {s.producer_name} · {s.bpm} BPM · {keyName(s.key_note, s.key_mode)}</p>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <Badge tone="accent">{s.license_name}</Badge>
                  {s.pack_title && (
                    <Link href={`/packs/${s.pack_slug ?? ""}`} className="text-xs text-ink-300 hover:text-white hover:underline">
                      From the pack “{s.pack_title}”
                    </Link>
                  )}
                  <span className="font-mono text-[11px] text-ink-400">{p.license_number}</span>
                  <span className="text-[11px] text-ink-400">· {formatDate(p.created_at)}</span>
                  {revoked && (
                    <Badge tone="danger">
                      <Ban className="h-3 w-3" /> Refunded
                    </Badge>
                  )}
                </div>
              </div>
            </div>
            {!revoked && (
              <div className="flex flex-wrap gap-2">
                {files.map((f) => (
                  <a key={f.key} href={`/api/download/${p.id}?file=${f.key}`} className={buttonVariants({ variant: "secondary", size: "sm" })}>
                    <Download className="h-3.5 w-3.5" /> {f.label}
                  </a>
                ))}
                <a href={`/api/license/${p.id}`} target="_blank" rel="noopener" className={buttonVariants({ variant: "ghost", size: "sm" })}>
                  <FileText className="h-3.5 w-3.5" /> License PDF
                </a>
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

async function Content({ searchParams }: { searchParams: PageProps<"/account/library">["searchParams"] }) {
  const sp = await searchParams;
  const highlight = typeof sp.highlight === "string" ? sp.highlight : undefined;
  return <LibraryList highlight={highlight} />;
}

export default function LibraryPage({ searchParams }: PageProps<"/account/library">) {
  return (
    <>
      <div className="mb-6">
        <h2 className="font-display text-2xl font-bold">Purchased beats</h2>
        <p className="mt-1 text-sm text-ink-300">Download your files any time. Each license includes a signed PDF agreement.</p>
      </div>
      <Suspense fallback={<PageSkeleton />}>
        <Content searchParams={searchParams} />
      </Suspense>
    </>
  );
}
