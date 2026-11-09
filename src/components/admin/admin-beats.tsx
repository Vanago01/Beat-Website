"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, Crown, Eye, EyeOff, Lock, LockOpen, MoreHorizontal, Pencil, Play, Sparkles, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { BeatCover } from "@/components/beats/cover";
import { Badge, EmptyState } from "@/components/ui/misc";
import { Button } from "@/components/ui/button";
import { Dropdown, MenuItem } from "@/components/ui/controls";
import { Modal } from "@/components/ui/overlay";
import { Textarea } from "@/components/ui/input";
import { moderateBeat, toggleBeatFlag } from "@/actions/admin";
import { deleteBeat } from "@/actions/beats";
import { usePlayer } from "@/stores/player";
import { BEAT_STATUS_LABEL, type BeatStatus } from "@/lib/constants";
import { formatCompact, formatDateTime, keyName } from "@/lib/format";

export interface AdminBeat {
  id: string;
  slug: string;
  title: string;
  status: BeatStatus;
  cover_path: string | null;
  preview_path: string | null;
  waveform: number[] | null;
  duration_seconds: number | null;
  bpm: number;
  key_note: number;
  key_mode: "major" | "minor";
  genre: string;
  plays_count: number;
  sales_count: number;
  favorites_count: number;
  is_featured: boolean;
  admin_locked: boolean;
  exclusive_sold_at: string | null;
  rejection_reason: string | null;
  submitted_at: string | null;
  created_at: string;
  min_price_eur: number | null;
  min_price_pln: number | null;
  min_price_usd: number | null;
  producer: { id: string; username: string; producer_name: string | null; display_name: string | null } | null;
}

const TONE: Record<BeatStatus, "success" | "warning" | "danger" | "default" | "outline"> = {
  published: "success",
  pending: "warning",
  rejected: "danger",
  draft: "default",
  archived: "outline",
};

export function AdminBeats({ beats }: { beats: AdminBeat[] }) {
  const router = useRouter();
  const play = usePlayer((s) => s.play);
  const [pending, startTransition] = useTransition();
  const [rejecting, setRejecting] = useState<AdminBeat | null>(null);
  const [reason, setReason] = useState("");
  const [deleting, setDeleting] = useState<AdminBeat | null>(null);

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, success: string) =>
    startTransition(async () => {
      const res = await fn();
      if (!res.ok) return void toast.error(res.error ?? "Action failed");
      toast.success(success);
      router.refresh();
    });

  if (!beats.length) return <EmptyState title="Nothing here" description="No beats match this view." />;

  return (
    <>
      <ul className="space-y-2.5">
        {beats.map((b) => {
          const producerName = b.producer?.producer_name || b.producer?.display_name || b.producer?.username || "Unknown";
          return (
            <li key={b.id} className="glass flex flex-col gap-4 rounded-3xl p-4 lg:flex-row lg:items-center">
              <div className="flex min-w-0 flex-1 items-center gap-4">
                <button
                  type="button"
                  onClick={() =>
                    b.preview_path &&
                    play({
                      id: b.id, slug: b.slug, title: b.title, producer_name: producerName, producer_username: b.producer?.username ?? "",
                      cover_path: b.cover_path, preview_path: b.preview_path, duration_seconds: b.duration_seconds, waveform: b.waveform,
                      bpm: b.bpm, key_note: b.key_note, key_mode: b.key_mode, genre_name: b.genre, min_price_eur: b.min_price_eur,
                      min_price_pln: b.min_price_pln, min_price_usd: b.min_price_usd, has_free: false, exclusive_sold_at: b.exclusive_sold_at,
                    })
                  }
                  className="group relative h-16 w-16 shrink-0 overflow-hidden rounded-2xl"
                  aria-label={`Preview ${b.title}`}
                  disabled={!b.preview_path}
                >
                  <BeatCover path={b.cover_path} title={b.title} seed={b.id} className="h-full w-full" sizes="64px" showTitle={false} />
                  {b.preview_path && (
                    <span className="absolute inset-0 grid place-items-center bg-black/45 opacity-0 transition group-hover:opacity-100">
                      <Play className="h-5 w-5 fill-white" />
                    </span>
                  )}
                </button>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link href={`/beats/${b.slug}`} className="truncate font-semibold hover:underline">{b.title}</Link>
                    <Badge tone={TONE[b.status]}>{BEAT_STATUS_LABEL[b.status]}</Badge>
                    {b.is_featured && <Badge tone="accent"><Sparkles className="h-3 w-3" /> Featured</Badge>}
                    {b.admin_locked && <Badge><Lock className="h-3 w-3" /> Locked</Badge>}
                    {b.exclusive_sold_at && <Badge tone="warning"><Crown className="h-3 w-3" /> Sold</Badge>}
                  </div>
                  <p className="mt-0.5 truncate text-sm text-ink-300">
                    by{" "}
                    {b.producer ? (
                      <Link href={`/producers/${b.producer.username}`} className="text-ink-100 hover:underline">{producerName}</Link>
                    ) : (
                      producerName
                    )}{" "}
                    · {b.genre} · {b.bpm} BPM · {keyName(b.key_note, b.key_mode)}
                  </p>
                  <p className="mt-0.5 font-mono text-[11px] text-ink-500">
                    {b.status === "pending" && b.submitted_at ? `Submitted ${formatDateTime(b.submitted_at)}` : `Created ${formatDateTime(b.created_at)}`} · {formatCompact(b.plays_count)} plays · {formatCompact(b.sales_count)} sales
                  </p>
                  {b.rejection_reason && b.status === "rejected" && <p className="mt-1 text-xs text-danger">Rejected: {b.rejection_reason}</p>}
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {(b.status === "pending" || b.status === "rejected" || b.status === "draft") && !b.exclusive_sold_at && (
                  <Button size="sm" onClick={() => run(() => moderateBeat(b.id, "approve"), "Beat approved and published")} disabled={pending}>
                    <Check className="h-4 w-4" /> {b.status === "pending" ? "Approve" : "Publish"}
                  </Button>
                )}
                {b.status === "pending" && (
                  <Button size="sm" variant="danger" onClick={() => { setReason(""); setRejecting(b); }} disabled={pending}>
                    <X className="h-4 w-4" /> Reject
                  </Button>
                )}
                {b.status === "published" && (
                  <Button size="sm" variant={b.is_featured ? "secondary" : "outline"} onClick={() => run(() => toggleBeatFlag(b.id, "is_featured", !b.is_featured), b.is_featured ? "Removed from homepage" : "Featured on homepage")} disabled={pending}>
                    <Sparkles className="h-4 w-4" /> {b.is_featured ? "Unfeature" : "Feature"}
                  </Button>
                )}
                <Dropdown
                  trigger={({ toggle }) => (
                    <Button variant="ghost" size="icon-sm" onClick={toggle} aria-label={`More actions for ${b.title}`}>
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  )}
                >
                  {(close) => (
                    <>
                      <MenuItem onClick={() => { close(); router.push(`/dashboard/beats/${b.id}/edit`); }}>
                        <Pencil className="h-4 w-4 text-ink-300" /> Edit beat
                      </MenuItem>
                      <MenuItem onClick={() => { close(); router.push(`/beats/${b.slug}`); }}>
                        <Eye className="h-4 w-4 text-ink-300" /> View page
                      </MenuItem>
                      {b.status === "published" && (
                        <MenuItem onClick={() => { close(); run(() => moderateBeat(b.id, "unpublish"), "Beat unpublished"); }}>
                          <EyeOff className="h-4 w-4 text-ink-300" /> Unpublish
                        </MenuItem>
                      )}
                      {b.status === "published" && (
                        <MenuItem onClick={() => { close(); setReason(""); setRejecting(b); }}>
                          <X className="h-4 w-4 text-ink-300" /> Reject / take down
                        </MenuItem>
                      )}
                      <MenuItem onClick={() => { close(); run(() => toggleBeatFlag(b.id, "admin_locked", !b.admin_locked), b.admin_locked ? "Beat unlocked" : "Beat locked — the producer can no longer change its status"); }}>
                        {b.admin_locked ? <LockOpen className="h-4 w-4 text-ink-300" /> : <Lock className="h-4 w-4 text-ink-300" />} {b.admin_locked ? "Unlock" : "Lock status"}
                      </MenuItem>
                      <div className="my-1 h-px bg-white/[0.07]" />
                      <MenuItem danger onClick={() => { close(); setDeleting(b); }}>
                        <Trash2 className="h-4 w-4" /> Remove beat
                      </MenuItem>
                    </>
                  )}
                </Dropdown>
              </div>
            </li>
          );
        })}
      </ul>

      <Modal
        open={!!rejecting}
        onClose={() => setRejecting(null)}
        size="sm"
        title="Reject beat"
        description={rejecting ? `The producer will see this reason and can resubmit “${rejecting.title}”.` : undefined}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setRejecting(null)}>Cancel</Button>
            <Button
              variant="danger"
              loading={pending}
              onClick={() => {
                const b = rejecting!;
                setRejecting(null);
                run(() => moderateBeat(b.id, "reject", reason), "Beat rejected");
              }}
            >
              Reject beat
            </Button>
          </div>
        }
      >
        <Textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. The preview contains an uncleared sample. Please replace it and resubmit." maxLength={1000} data-autofocus />
      </Modal>

      <Modal
        open={!!deleting}
        onClose={() => setDeleting(null)}
        size="sm"
        title="Remove this beat?"
        description={deleting ? `“${deleting.title}” will be removed from the marketplace.` : undefined}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setDeleting(null)}>Cancel</Button>
            <Button
              variant="danger"
              loading={pending}
              onClick={() => {
                const b = deleting!;
                setDeleting(null);
                startTransition(async () => {
                  const res = await deleteBeat(b.id);
                  if (!res.ok) return void toast.error(res.error);
                  toast.success(res.data.archived ? "Beat archived (it has buyers)" : "Beat deleted");
                  router.refresh();
                });
              }}
            >
              Remove
            </Button>
          </div>
        }
      >
        <p className="text-sm text-ink-300">Beats with purchases are archived so buyers keep their downloads; others are permanently deleted with their files.</p>
      </Modal>
    </>
  );
}
