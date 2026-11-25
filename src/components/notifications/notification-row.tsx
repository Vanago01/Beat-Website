"use client";

import Link from "next/link";
import { CheckCircle2, Download, Handshake, Heart, ShoppingBag, UserPlus, XCircle, type LucideIcon } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { BeatCover } from "@/components/beats/cover";
import { formatPrice, timeAgo } from "@/lib/format";
import { notificationHref, notificationTitle, type NotificationItem } from "@/lib/notifications";
import { cn } from "@/lib/utils";

const KIND: Record<string, { icon: LucideIcon; tone: string }> = {
  like: { icon: Heart, tone: "bg-[#ff5c8a] text-white" },
  sale: { icon: ShoppingBag, tone: "bg-success text-white" },
  free_download: { icon: Download, tone: "bg-sky-500 text-white" },
  follow: { icon: UserPlus, tone: "bg-accent text-on-accent" },
  collab_invite: { icon: Handshake, tone: "bg-warning text-ink-950" },
  collab_accepted: { icon: Handshake, tone: "bg-success text-white" },
  collab_declined: { icon: Handshake, tone: "bg-ink-500 text-white" },
  beat_approved: { icon: CheckCircle2, tone: "bg-success text-white" },
  pack_approved: { icon: CheckCircle2, tone: "bg-success text-white" },
  beat_rejected: { icon: XCircle, tone: "bg-danger text-white" },
  pack_rejected: { icon: XCircle, tone: "bg-danger text-white" },
};

const clockFmt = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit" });
const dayFmt = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short" });
const dayYearFmt = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" });

/** "Today, 14:05", "Yesterday, 09:12", "3 Nov, 18:40", "3 Nov 2025, 18:40". */
export function notificationTime(iso: string, now = Date.now()) {
  const d = new Date(iso);
  const today = new Date(now);
  const yesterday = new Date(now);
  yesterday.setDate(today.getDate() - 1);
  const day =
    d.toDateString() === today.toDateString()
      ? "Today"
      : d.toDateString() === yesterday.toDateString()
        ? "Yesterday"
        : d.getFullYear() === today.getFullYear()
          ? dayFmt.format(d)
          : dayYearFmt.format(d);
  return `${day}, ${clockFmt.format(d)}`;
}

/** What happened: "Anna liked your beat “Night Drive”". */
function Sentence({ n }: { n: NotificationItem }) {
  const who = <strong className="font-semibold text-ink-50">{n.actor?.name ?? "Someone"}</strong>;
  const title = notificationTitle(n);
  const what = title ? <strong className="font-semibold text-ink-50">“{title}”</strong> : null;
  switch (n.type) {
    case "like":
      return <>{who} liked your beat {what}</>;
    case "sale":
      return <>{who} bought {what ?? "your beat"}</>;
    case "free_download":
      return <>{who} downloaded {what ?? "your beat"} for free</>;
    case "follow":
      return <>{who} started following you</>;
    case "collab_invite":
      return <>{who} invited you to co-produce {what}</>;
    case "collab_accepted":
      return <>{who} accepted your invite to co-produce {what}</>;
    case "collab_declined":
      return <>{who} declined your invite to co-produce {what}</>;
    case "beat_approved":
      return <>Your beat {what} was approved and is now live</>;
    case "beat_rejected":
      return <>Your beat {what} wasn&apos;t approved</>;
    case "pack_approved":
      return <>Your beat pack {what} was approved and is now live</>;
    case "pack_rejected":
      return <>Your beat pack {what} wasn&apos;t approved</>;
    default:
      return <>Something happened on your account</>;
  }
}

/** The second line: the license and price of a sale, a co-producer's share, why something wasn't approved. */
function detailOf(n: NotificationItem) {
  const d = n.data ?? {};
  switch (n.type) {
    case "sale":
      return [d.license_name, d.price != null && d.currency ? formatPrice(d.price, d.currency) : null].filter(Boolean).join(" · ") || null;
    case "free_download":
      return d.license_name ?? null;
    case "collab_invite":
      return d.share_percent ? `You'd get ${d.share_percent}% of every sale` : null;
    case "collab_accepted":
      return d.share_percent ? `They get ${d.share_percent}% of every sale` : null;
    case "beat_rejected":
    case "pack_rejected":
      return d.reason ? `Reason: ${d.reason}` : null;
    default:
      return null;
  }
}

/** One notification: who did what, on which beat, and when. */
export function NotificationRow({
  n,
  isNew,
  menuItem,
  onOpen,
  now = Date.now(),
}: {
  n: NotificationItem;
  /** Highlighted: it arrived since you last looked. */
  isNew: boolean;
  /** Inside the bell's menu (arrow keys move between rows). */
  menuItem?: boolean;
  onOpen?: () => void;
  now?: number;
}) {
  const href = notificationHref(n);
  const kind = KIND[n.type] ?? { icon: CheckCircle2, tone: "bg-ink-500 text-white" };
  const Icon = kind.icon;
  const detail = detailOf(n);
  const art = n.beat ?? n.pack;
  const body = (
    <>
      <span className="relative mt-0.5 shrink-0">
        {n.actor ? (
          <Avatar path={n.actor.avatar_path} name={n.actor.name} size={42} />
        ) : art ? (
          <BeatCover path={art.cover_path} title={art.title} seed={art.id} className="h-[42px] w-[42px] rounded-full" sizes="42px" showTitle={false} />
        ) : (
          <span className="grid h-[42px] w-[42px] place-items-center rounded-full bg-white/[0.06]" />
        )}
        <span
          className={cn("absolute -bottom-1 -right-1 grid h-5 w-5 place-items-center rounded-full ring-2 ring-[var(--color-ink-900)]", kind.tone)}
          aria-hidden
        >
          <Icon className="h-3 w-3" strokeWidth={2.5} />
        </span>
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[13.5px] leading-snug text-ink-200">
          <Sentence n={n} />
        </span>
        {detail && <span className="mt-0.5 block truncate text-xs text-ink-300">{detail}</span>}
        <time dateTime={n.created_at} className={cn("mt-1 block text-[11.5px]", isNew ? "font-medium text-accent-300" : "text-ink-400")}>
          {timeAgo(n.created_at, now)} · {notificationTime(n.created_at, now)}
        </time>
      </span>
      {n.actor && art && (
        <BeatCover path={art.cover_path} title={art.title} seed={art.id} className="mt-0.5 h-11 w-11 shrink-0 rounded-lg" sizes="44px" showTitle={false} />
      )}
      {isNew && <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-accent" aria-label="New" role="img" />}
    </>
  );
  const className = cn(
    "flex w-full items-start gap-3 rounded-2xl px-3 py-3 text-left transition",
    isNew ? "bg-accent/[0.07]" : "",
    href && "hover:bg-white/[0.05] focus-visible:bg-white/[0.05] focus-visible:outline-none",
  );
  return href ? (
    <Link href={href} onClick={onOpen} className={className} role={menuItem ? "menuitem" : undefined} data-notification={n.type}>
      {body}
    </Link>
  ) : (
    <div className={className} data-notification={n.type}>
      {body}
    </div>
  );
}
