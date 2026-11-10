"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, EyeOff, ExternalLink, X } from "lucide-react";
import { toast } from "sonner";
import { moderatePack } from "@/actions/admin";
import { BeatCover } from "@/components/beats/cover";
import { Badge, EmptyState } from "@/components/ui/misc";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import { Modal } from "@/components/ui/overlay";
import { BEAT_STATUS_LABEL, type BeatStatus } from "@/lib/constants";
import { formatDate, formatPrice } from "@/lib/format";
import { beatsLabel, packHref, type PackCardRow } from "@/lib/packs";

export interface AdminPack extends PackCardRow {
  beats: { id: string; title: string; slug: string; status: BeatStatus }[];
}

export function AdminPacks({ packs }: { packs: AdminPack[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [rejecting, setRejecting] = useState<AdminPack | null>(null);
  const [reason, setReason] = useState("");

  const run = (pack: AdminPack, action: "approve" | "reject" | "unpublish", why?: string) =>
    startTransition(async () => {
      const res = await moderatePack(pack.id!, action, why);
      if (!res.ok) return void toast.error("Couldn't update the pack", { description: res.error });
      toast.success(action === "approve" ? "Pack approved — it's live" : action === "reject" ? "Pack rejected" : "Pack unpublished");
      setRejecting(null);
      setReason("");
      router.refresh();
    });

  if (!packs.length) return <EmptyState title="Nothing here" description="No beat packs with this status." />;

  return (
    <>
      <ul className="space-y-3">
        {packs.map((p) => {
          const status = (p.status ?? "draft") as BeatStatus;
          return (
            <li key={p.id} className="glass rounded-3xl p-4">
              <div className="flex flex-col gap-4 md:flex-row md:items-start">
                <BeatCover path={p.cover_path} title={p.title ?? ""} seed={p.id ?? ""} className="h-20 w-20 shrink-0 rounded-2xl" sizes="80px" showTitle={false} />
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2">
                    <span className="truncate font-display text-lg font-bold">{p.title}</span>
                    <Badge tone={status === "published" ? "success" : status === "pending" ? "warning" : status === "rejected" ? "danger" : "default"}>{BEAT_STATUS_LABEL[status]}</Badge>
                  </p>
                  <p className="mt-0.5 text-sm text-ink-300">
                    by @{p.producer_username} · {beatsLabel(p.beats_count ?? 0)}
                    {p.min_price_eur != null && <> · from {formatPrice(p.min_price_eur, "eur")}</>} · created {formatDate(p.created_at)}
                  </p>
                  {p.description && <p className="mt-2 line-clamp-3 text-sm text-ink-200">{p.description}</p>}
                  <ul className="mt-3 flex flex-wrap gap-1.5">
                    {p.beats.map((b) => (
                      <li key={b.id}>
                        <Link href={`/beats/${b.slug}`} target="_blank" className="inline-flex items-center gap-1.5 rounded-full border border-white/10 px-2.5 py-1 text-xs text-ink-200 hover:border-white/25">
                          {b.title}
                          <span className={b.status === "published" ? "text-success" : b.status === "pending" ? "text-warning" : "text-ink-400"}>· {BEAT_STATUS_LABEL[b.status]}</span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="flex shrink-0 flex-wrap gap-2 md:flex-col">
                  {status === "pending" || status === "rejected" || status === "draft" ? (
                    <Button size="sm" onClick={() => run(p, "approve")} loading={pending}>
                      <Check className="h-4 w-4" /> Approve
                    </Button>
                  ) : null}
                  {status === "pending" && (
                    <Button size="sm" variant="danger" onClick={() => setRejecting(p)} disabled={pending}>
                      <X className="h-4 w-4" /> Reject
                    </Button>
                  )}
                  {status === "published" && (
                    <>
                      <Link href={packHref(p.slug ?? "")} target="_blank" className="inline-flex h-9 items-center gap-2 rounded-full border border-white/15 px-4 text-[13px]">
                        <ExternalLink className="h-4 w-4" /> View
                      </Link>
                      <Button size="sm" variant="secondary" onClick={() => run(p, "unpublish")} loading={pending}>
                        <EyeOff className="h-4 w-4" /> Unpublish
                      </Button>
                    </>
                  )}
                </div>
              </div>
            </li>
          );
        })}
      </ul>
      <Modal
        open={!!rejecting}
        onClose={() => setRejecting(null)}
        title={`Reject “${rejecting?.title ?? ""}”?`}
        description="The producer gets this reason by email and in their studio."
        size="sm"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setRejecting(null)}>
              Cancel
            </Button>
            <Button variant="danger" onClick={() => rejecting && run(rejecting, "reject", reason)} loading={pending}>
              Reject pack
            </Button>
          </div>
        }
      >
        <Textarea value={reason} onChange={(e) => setReason(e.target.value)} maxLength={1000} rows={4} placeholder="e.g. The cover uses artwork you don't own." aria-label="Reason" />
      </Modal>
    </>
  );
}
