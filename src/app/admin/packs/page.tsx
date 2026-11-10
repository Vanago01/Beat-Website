import type { Metadata } from "next";
import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { AdminPacks, type AdminPack } from "@/components/admin/admin-packs";
import type { BeatStatus } from "@/lib/constants";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Beat packs · Admin", robots: { index: false } };

const STATUSES: { value: BeatStatus | "all"; label: string }[] = [
  { value: "pending", label: "Waiting for review" },
  { value: "published", label: "Published" },
  { value: "rejected", label: "Rejected" },
  { value: "draft", label: "Drafts" },
  { value: "all", label: "All" },
];

export default async function AdminPacksPage({ searchParams }: PageProps<"/admin/packs">) {
  await requireAdmin();
  const sp = await searchParams;
  const status = STATUSES.some((s) => s.value === sp.status) ? (sp.status as BeatStatus | "all") : "pending";
  const supabase = await createSupabaseServerClient();
  let query = supabase.from("pack_cards").select("*").order("created_at", { ascending: false }).limit(100);
  if (status !== "all") query = query.eq("status", status);
  const { data: packs, error } = await query;
  if (error) return <p className="text-danger">{error.message}</p>;

  const ids = (packs ?? []).map((p) => p.id!).filter(Boolean);
  const { data: items } = ids.length
    ? await supabase.from("beat_pack_items").select("pack_id, position, beat:beats(id, title, slug, status)").in("pack_id", ids).order("position")
    : { data: [] };
  const withBeats: AdminPack[] = (packs ?? []).map((p) => ({
    ...p,
    beats: (items ?? [])
      .filter((i) => i.pack_id === p.id && i.beat)
      .map((i) => i.beat as unknown as AdminPack["beats"][number]),
  }));

  return (
    <>
      <nav className="no-scrollbar mb-5 flex gap-1 overflow-x-auto" aria-label="Status">
        {STATUSES.map((s) => (
          <Link
            key={s.value}
            href={`/admin/packs?status=${s.value}`}
            className={cn("whitespace-nowrap rounded-full px-3.5 py-1.5 text-sm transition", status === s.value ? "bg-white text-ink-950" : "text-ink-300 hover:bg-white/[0.06] hover:text-white")}
          >
            {s.label}
          </Link>
        ))}
      </nav>
      <AdminPacks packs={withBeats} />
    </>
  );
}
