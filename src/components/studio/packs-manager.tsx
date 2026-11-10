"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, Eye, EyeOff, MoreHorizontal, Package, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { BeatCover } from "@/components/beats/cover";
import { Badge, EmptyState } from "@/components/ui/misc";
import { Button, buttonVariants } from "@/components/ui/button";
import { Dropdown, MenuItem } from "@/components/ui/controls";
import { Modal } from "@/components/ui/overlay";
import { deletePack, setPackStatus } from "@/actions/packs";
import { BEAT_STATUS_LABEL, type BeatStatus } from "@/lib/constants";
import { formatCompact, formatPrice } from "@/lib/format";
import { beatsLabel, packHref, type PackCardRow } from "@/lib/packs";

const TONE: Record<BeatStatus, "success" | "warning" | "danger" | "default" | "outline"> = {
  published: "success",
  pending: "warning",
  rejected: "danger",
  draft: "default",
  archived: "outline",
};

export function PacksManager({ packs }: { packs: PackCardRow[] }) {
  const router = useRouter();
  const [confirm, setConfirm] = useState<PackCardRow | null>(null);
  const [pending, startTransition] = useTransition();

  const changeStatus = (p: PackCardRow, status: "draft" | "published") =>
    startTransition(async () => {
      const res = await setPackStatus(p.id!, status);
      if (!res.ok) return void toast.error("Couldn't update the pack", { description: res.error });
      toast.success(res.data.status === "published" ? "Pack published" : res.data.status === "pending" ? "Pack submitted for review" : "Pack unpublished");
      router.refresh();
    });

  const remove = () => {
    if (!confirm) return;
    startTransition(async () => {
      const res = await deletePack(confirm.id!);
      setConfirm(null);
      if (!res.ok) return void toast.error("Couldn't delete the pack", { description: res.error });
      toast.success("Pack deleted", { description: "Its beats are still in My beats." });
      router.refresh();
    });
  };

  if (!packs.length) {
    return (
      <EmptyState
        icon={<Package className="h-6 w-6" />}
        title="No beat packs yet"
        description="Bundle several beats with one cover and one price per license. Buyers get every beat in the pack."
        action={
          <Link href="/dashboard/packs/new" className={buttonVariants()}>
            <Plus className="h-4 w-4" /> Create a beat pack
          </Link>
        }
      />
    );
  }

  return (
    <>
      <div className="mb-5 flex justify-end">
        <Link href="/dashboard/packs/new" className={buttonVariants({ size: "sm" })}>
          <Plus className="h-4 w-4" /> New beat pack
        </Link>
      </div>
      <ul className="space-y-3">
        {packs.map((p) => {
          const status = (p.status ?? "draft") as BeatStatus;
          return (
            <li key={p.id} className="glass flex items-center gap-4 rounded-3xl p-3 pr-4">
              <BeatCover path={p.cover_path} title={p.title ?? ""} seed={p.id ?? ""} className="h-16 w-16 shrink-0 rounded-2xl" sizes="64px" showTitle={false} />
              <div className="min-w-0 flex-1">
                <Link href={`/dashboard/packs/${p.id}/edit`} className="block truncate font-semibold hover:underline">
                  {p.title}
                </Link>
                <p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-ink-400">
                  <Badge tone={TONE[status]}>{BEAT_STATUS_LABEL[status]}</Badge>
                  <span>{beatsLabel(p.beats_count ?? 0)}</span>
                  {p.min_price_eur != null && <span>from {formatPrice(p.min_price_eur, "eur")}</span>}
                  <span>{formatCompact(p.sales_count ?? 0)} sold</span>
                  {status === "published" && !p.available && (
                    <span className="flex items-center gap-1 text-warning">
                      <AlertTriangle className="h-3.5 w-3.5" /> Not on sale: a beat in it is offline
                    </span>
                  )}
                </p>
                {status === "rejected" && p.rejection_reason && <p className="mt-1 text-xs text-danger">Rejected: {p.rejection_reason}</p>}
              </div>
              <Dropdown
                trigger={({ toggle, open }) => (
                  <button type="button" onClick={toggle} aria-expanded={open} aria-haspopup="menu" aria-label={`Options for ${p.title}`} className="grid h-9 w-9 place-items-center rounded-full text-ink-300 hover:bg-white/[0.08] hover:text-white">
                    <MoreHorizontal className="h-5 w-5" />
                  </button>
                )}
              >
                {(close) => (
                  <>
                    <MenuItem onClick={() => { close(); router.push(`/dashboard/packs/${p.id}/edit`); }}>
                      <Pencil className="h-4 w-4 text-ink-300" /> Edit
                    </MenuItem>
                    {status === "published" && (
                      <MenuItem onClick={() => { close(); router.push(packHref(p.slug ?? "")); }}>
                        <Eye className="h-4 w-4 text-ink-300" /> View in marketplace
                      </MenuItem>
                    )}
                    {status === "published" ? (
                      <MenuItem onClick={() => { close(); changeStatus(p, "draft"); }}>
                        <EyeOff className="h-4 w-4 text-ink-300" /> Unpublish
                      </MenuItem>
                    ) : status === "draft" ? (
                      <MenuItem onClick={() => { close(); router.push(`/dashboard/packs/${p.id}/edit`); }}>
                        <Eye className="h-4 w-4 text-ink-300" /> Publish…
                      </MenuItem>
                    ) : null}
                    <div className="my-1 h-px bg-white/[0.07]" />
                    <MenuItem danger onClick={() => { close(); setConfirm(p); }}>
                      <Trash2 className="h-4 w-4" /> Delete pack
                    </MenuItem>
                  </>
                )}
              </Dropdown>
            </li>
          );
        })}
      </ul>

      <Modal
        open={!!confirm}
        onClose={() => setConfirm(null)}
        title="Delete this pack?"
        size="sm"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setConfirm(null)}>
              Cancel
            </Button>
            <Button variant="danger" onClick={remove} loading={pending}>
              Delete
            </Button>
          </div>
        }
      >
        <p className="text-sm leading-relaxed text-ink-200">
          “{confirm?.title}” will be removed from the marketplace. Its beats stay in My beats, and anyone who bought the pack keeps their licenses.
        </p>
      </Modal>
    </>
  );
}
