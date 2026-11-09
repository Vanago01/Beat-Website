import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import Form from "next/form";
import { Plus, Search } from "lucide-react";
import { requireAdmin } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { AdminBeats, type AdminBeat } from "@/components/admin/admin-beats";
import { PageSkeleton } from "@/components/account/page-skeleton";
import { buttonVariants } from "@/components/ui/button";
import { escapeLike } from "@/lib/text";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Manage beats", robots: { index: false } };

const STATUSES = [
  { value: "pending", label: "Awaiting review" },
  { value: "published", label: "Published" },
  { value: "draft", label: "Unpublished" },
  { value: "rejected", label: "Rejected" },
  { value: "archived", label: "Archived" },
  { value: "all", label: "All" },
] as const;

const PAGE = 40;

async function BeatsList({ searchParams }: { searchParams: PageProps<"/admin/beats">["searchParams"] }) {
  await requireAdmin();
  const sp = await searchParams;
  const status = STATUSES.some((s) => s.value === sp.status) ? (sp.status as string) : "pending";
  const q = typeof sp.q === "string" ? sp.q.trim().slice(0, 100) : "";
  const page = Math.max(0, Number(sp.page ?? 0) || 0);
  const supabase = await createSupabaseServerClient();

  let query = supabase
    .from("beats")
    .select(
      "id, slug, title, status, cover_path, preview_path, waveform, duration_seconds, bpm, key_note, key_mode, genre, plays_count, sales_count, favorites_count, is_featured, admin_locked, exclusive_sold_at, rejection_reason, submitted_at, created_at, min_price_eur, min_price_pln, min_price_usd, producer:profiles!beats_producer_id_fkey(id, username, producer_name, display_name)",
      { count: "exact" },
    );
  if (status !== "all") query = query.eq("status", status as AdminBeat["status"]);
  if (q) query = query.ilike("title", `%${escapeLike(q)}%`);
  query = status === "pending" ? query.order("submitted_at", { ascending: true }) : query.order("created_at", { ascending: false });
  const { data, count, error } = await query.range(page * PAGE, page * PAGE + PAGE - 1);
  if (error) return <p className="text-danger">{error.message}</p>;

  const total = count ?? 0;
  const href = (p: Record<string, string | number | undefined>) => {
    const params = new URLSearchParams();
    const merged = { status, q: q || undefined, ...p };
    Object.entries(merged).forEach(([k, v]) => v !== undefined && v !== "" && params.set(k, String(v)));
    return `/admin/beats?${params}`;
  };

  return (
    <>
      <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <nav className="no-scrollbar flex gap-1 overflow-x-auto" aria-label="Status">
          {STATUSES.map((s) => (
            <Link key={s.value} href={href({ status: s.value, page: undefined })} className={cn("whitespace-nowrap rounded-full px-3.5 py-1.5 text-sm transition", status === s.value ? "bg-white text-ink-950" : "text-ink-300 hover:bg-white/[0.06] hover:text-white")}>
              {s.label}
            </Link>
          ))}
        </nav>
        <div className="flex gap-2">
          <Form action="/admin/beats" className="glass flex h-10 items-center gap-2 rounded-full px-4">
            <input type="hidden" name="status" value={status} />
            <Search className="h-4 w-4 text-ink-400" />
            <input name="q" defaultValue={q} placeholder="Search titles…" className="w-48 bg-transparent text-sm outline-none placeholder:text-ink-400" aria-label="Search beats" />
          </Form>
          <Link href="/dashboard/beats/new" className={buttonVariants({ size: "sm", className: "h-10" })}>
            <Plus className="h-4 w-4" /> Upload
          </Link>
        </div>
      </div>
      <p className="mb-4 text-sm text-ink-400">{total} {total === 1 ? "beat" : "beats"}</p>
      <AdminBeats beats={(data ?? []) as unknown as AdminBeat[]} />
      {total > PAGE && (
        <div className="mt-8 flex items-center justify-center gap-3 text-sm">
          {page > 0 && <Link href={href({ page: page - 1 })} className={buttonVariants({ variant: "secondary", size: "sm" })}>← Previous</Link>}
          <span className="text-ink-400">Page {page + 1} of {Math.ceil(total / PAGE)}</span>
          {(page + 1) * PAGE < total && <Link href={href({ page: page + 1 })} className={buttonVariants({ variant: "secondary", size: "sm" })}>Next →</Link>}
        </div>
      )}
    </>
  );
}

export default function AdminBeatsPage({ searchParams }: PageProps<"/admin/beats">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <BeatsList searchParams={searchParams} />
    </Suspense>
  );
}
