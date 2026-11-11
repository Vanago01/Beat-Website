"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Crown, Eye, EyeOff, Lock, MoreHorizontal, Pencil, Plus, Send, Sparkles, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { BeatCover } from "@/components/beats/cover";
import { Badge, EmptyState } from "@/components/ui/misc";
import { Button, buttonVariants } from "@/components/ui/button";
import { Dropdown, MenuItem, Segmented } from "@/components/ui/controls";
import { Modal } from "@/components/ui/overlay";
import { deleteBeat, setBeatStatus } from "@/actions/beats";
import { BEAT_STATUS_LABEL, type BeatStatus } from "@/lib/constants";
import { formatCompact, formatDate, formatPrice, keyName } from "@/lib/format";

export interface ManagedBeat {
  id: string;
  slug: string;
  title: string;
  status: BeatStatus;
  cover_path: string | null;
  bpm: number;
  key_note: number;
  key_mode: string;
  genre: string;
  plays_count: number;
  favorites_count: number;
  sales_count: number;
  min_price_eur: number | null;
  approved_at: string | null;
  exclusive_sold_at: string | null;
  admin_locked: boolean;
  rejection_reason: string | null;
  is_featured: boolean;
  created_at: string;
}

const TONE: Record<BeatStatus, "success" | "warning" | "danger" | "default" | "outline"> = {
  published: "success",
  pending: "warning",
  rejected: "danger",
  draft: "default",
  archived: "outline",
};

export function BeatsManager({ beats, canSelfPublish, packOnly = {} }: { beats: ManagedBeat[]; canSelfPublish: boolean; packOnly?: Record<string, { title: string; slug: string }> }) {
  const router = useRouter();
  const [filter, setFilter] = useState<"all" | BeatStatus>("all");
  const [confirm, setConfirm] = useState<ManagedBeat | null>(null);
  const [pending, startTransition] = useTransition();

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: beats.length };
    for (const b of beats) c[b.status] = (c[b.status] ?? 0) + 1;
    return c;
  }, [beats]);
  const visible = filter === "all" ? beats : beats.filter((b) => b.status === filter);

  const changeStatus = (b: ManagedBeat, status: "draft" | "pending" | "published") =>
    startTransition(async () => {
      const res = await setBeatStatus(b.id, status);
      if (!res.ok) return void toast.error(res.error);
      toast.success(res.data.status === "published" ? "Beat is live" : res.data.status === "pending" ? "Submitted for review" : "Beat unpublished");
      router.refresh();
    });

  const remove = (b: ManagedBeat) =>
    startTransition(async () => {
      const res = await deleteBeat(b.id);
      setConfirm(null);
      if (!res.ok) return void toast.error(res.error);
      toast.success(res.data.archived ? "Beat archived" : "Beat deleted", {
        description: res.data.archived ? "It has sales, so it was archived to keep buyers' downloads working." : undefined,
      });
      router.refresh();
    });

  if (!beats.length) {
    return (
      <EmptyState
        icon={<Upload className="h-6 w-6" />}
        title="Upload your first beat"
        description="Add your audio, artwork and license prices — it takes a couple of minutes."
        action={<Link href="/dashboard/beats/new" className={buttonVariants()}><Plus className="h-4 w-4" /> Upload beat</Link>}
      />
    );
  }

  const tabs: { value: "all" | BeatStatus; label: string }[] = [
    { value: "all", label: `All ${counts.all}` },
    ...(["published", "pending", "draft", "rejected", "archived"] as BeatStatus[])
      .filter((s) => counts[s])
      .map((s) => ({ value: s, label: `${BEAT_STATUS_LABEL[s]} ${counts[s]}` })),
  ];

  return (
    <>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="no-scrollbar max-w-full overflow-x-auto">
          <Segmented value={filter} onChange={setFilter} options={tabs} />
        </div>
        <Link href="/dashboard/beats/new" className={buttonVariants({ size: "sm" })}>
          <Plus className="h-4 w-4" /> Upload beat
        </Link>
      </div>

      <div className="glass overflow-hidden rounded-3xl">
        <div className="hidden grid-cols-[minmax(0,2.2fr)_7rem_6rem_6rem_6rem_7rem_3rem] gap-4 border-b border-white/[0.06] px-5 py-3 font-mono text-[10px] uppercase tracking-[0.18em] text-ink-400 lg:grid">
          <span>Beat</span>
          <span>Status</span>
          <span className="text-right">Plays</span>
          <span className="text-right">Saves</span>
          <span className="text-right">Sales</span>
          <span className="text-right">From</span>
          <span />
        </div>
        <ul className="divide-y divide-white/[0.05]">
          {visible.map((b) => {
            const sold = !!b.exclusive_sold_at;
            return (
              <li key={b.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4 px-4 py-3.5 lg:grid-cols-[minmax(0,2.2fr)_7rem_6rem_6rem_6rem_7rem_3rem] lg:px-5">
                <div className="flex min-w-0 items-center gap-3.5">
                  <BeatCover path={b.cover_path} title={b.title} seed={b.id} className="h-12 w-12 shrink-0 rounded-xl" sizes="48px" showTitle={false} />
                  <div className="min-w-0">
                    <Link href={`/dashboard/beats/${b.id}/edit`} className="flex items-center gap-2 truncate font-semibold hover:underline">
                      {b.title}
                      {b.is_featured && <Sparkles className="h-3.5 w-3.5 shrink-0 text-accent-300" />}
                      {sold && <Crown className="h-3.5 w-3.5 shrink-0 text-warning" />}
                      {b.admin_locked && <Lock className="h-3.5 w-3.5 shrink-0 text-ink-400" />}
                    </Link>
                    <p className="truncate font-mono text-[11px] tracking-wider text-ink-400">
                      {b.bpm} BPM · {keyName(b.key_note, b.key_mode)} · {formatDate(b.created_at)}
                    </p>
                    <div className="mt-1 lg:hidden">
                      <Badge tone={TONE[b.status]}>{sold ? "Sold exclusively" : BEAT_STATUS_LABEL[b.status]}</Badge>
                    </div>
                    {b.status === "rejected" && b.rejection_reason && <p className="mt-1 text-xs text-danger">Reason: {b.rejection_reason}</p>}
                    {packOnly[b.id] && (
                      <p className="mt-1 truncate text-xs text-ink-300">
                        Only sold in the pack{" "}
                        <Link href={`/packs/${packOnly[b.id].slug}`} className="text-accent-300 hover:underline">
                          “{packOnly[b.id].title}”
                        </Link>
                      </p>
                    )}
                  </div>
                </div>
                <span className="hidden lg:block">
                  <Badge tone={TONE[b.status]}>{sold ? "Sold" : BEAT_STATUS_LABEL[b.status]}</Badge>
                </span>
                <span className="hidden text-right text-sm tabular-nums lg:block">{formatCompact(b.plays_count)}</span>
                <span className="hidden text-right text-sm tabular-nums lg:block">{formatCompact(b.favorites_count)}</span>
                <span className="hidden text-right text-sm tabular-nums lg:block">{formatCompact(b.sales_count)}</span>
                <span className="hidden text-right text-sm tabular-nums lg:block">{b.min_price_eur == null ? "—" : b.min_price_eur === 0 ? "Free" : formatPrice(b.min_price_eur, "eur")}</span>
                <Dropdown
                  trigger={({ toggle }) => (
                    <Button variant="ghost" size="icon-sm" onClick={toggle} aria-label={`Actions for ${b.title}`} disabled={pending}>
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  )}
                >
                  {(close) => (
                    <>
                      <MenuItem onClick={() => { close(); router.push(`/dashboard/beats/${b.id}/edit`); }}>
                        <Pencil className="h-4 w-4 text-ink-300" /> Edit beat
                      </MenuItem>
                      <MenuItem onClick={() => { close(); router.push(packOnly[b.id] ? `/packs/${packOnly[b.id].slug}` : `/beats/${b.slug}`); }}>
                        <Eye className="h-4 w-4 text-ink-300" /> {packOnly[b.id] ? "View its pack" : b.status === "published" ? "View in marketplace" : "Preview page"}
                      </MenuItem>
                      {!sold && !b.admin_locked && b.status === "published" && (
                        <MenuItem onClick={() => { close(); changeStatus(b, "draft"); }}>
                          <EyeOff className="h-4 w-4 text-ink-300" /> Unpublish
                        </MenuItem>
                      )}
                      {!sold && !b.admin_locked && (b.status === "draft" || b.status === "rejected") && (
                        <MenuItem onClick={() => { close(); changeStatus(b, canSelfPublish || b.approved_at ? "published" : "pending"); }}>
                          <Send className="h-4 w-4 text-ink-300" /> {canSelfPublish || b.approved_at ? "Publish" : "Submit for review"}
                        </MenuItem>
                      )}
                      <div className="my-1 h-px bg-white/[0.07]" />
                      <MenuItem danger onClick={() => { close(); setConfirm(b); }}>
                        <Trash2 className="h-4 w-4" /> Delete
                      </MenuItem>
                    </>
                  )}
                </Dropdown>
              </li>
            );
          })}
        </ul>
      </div>

      <Modal
        open={!!confirm}
        onClose={() => setConfirm(null)}
        size="sm"
        title="Delete this beat?"
        description={confirm ? `“${confirm.title}” will be removed from the marketplace.` : undefined}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setConfirm(null)}>
              Cancel
            </Button>
            <Button variant="danger" onClick={() => confirm && remove(confirm)} loading={pending}>
              Delete beat
            </Button>
          </div>
        }
      >
        <p className="text-sm text-ink-300">
          If anyone has purchased this beat it will be archived instead, so their downloads keep working. Otherwise the beat and its files are permanently deleted.
        </p>
      </Modal>
    </>
  );
}
