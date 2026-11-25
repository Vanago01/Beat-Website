/** Notifications (database update 20): likes, sales, follows, collaborations and reviews of your beats. */

import type { Currency } from "@/lib/constants";

export type NotificationType =
  | "like"
  | "sale"
  | "free_download"
  | "follow"
  | "collab_invite"
  | "collab_accepted"
  | "collab_declined"
  | "beat_approved"
  | "beat_rejected"
  | "pack_approved"
  | "pack_rejected";

export interface NotificationItem {
  id: string;
  type: NotificationType | (string & {});
  created_at: string;
  read_at: string | null;
  /** What it was about, as it was then: the license and price of a sale, a co-producer's share, why a beat wasn't approved. */
  data: {
    license_name?: string;
    title?: string;
    price?: number;
    currency?: Currency;
    share_percent?: number;
    reason?: string;
  } | null;
  /** Who did it (a deleted account shows as "Someone"). */
  actor: { id: string; username: string; name: string; avatar_path: string | null; is_verified: boolean } | null;
  beat: { id: string; title: string; slug: string; cover_path: string | null; status: string } | null;
  pack: { id: string; title: string; slug: string; cover_path: string | null; status: string } | null;
}

/** Notifications loaded per page. */
export const NOTIFICATION_PAGE_SIZE = 30;

/** Where a notification leads: the beat, your sales, their profile, or the studio. */
export function notificationHref(n: NotificationItem): string | null {
  switch (n.type) {
    case "like":
    case "beat_approved":
      return n.beat ? `/beats/${n.beat.slug}` : null;
    case "sale":
    case "free_download":
      return "/dashboard/sales";
    case "follow":
      return n.actor ? `/producers/${n.actor.username}` : null;
    case "collab_invite":
      // Invites waiting for an answer are at the top of every studio page.
      return "/dashboard";
    case "collab_accepted":
    case "collab_declined":
      return n.beat ? `/dashboard/beats/${n.beat.id}/edit#collaboration` : "/dashboard/beats";
    case "beat_rejected":
      return n.beat ? `/dashboard/beats/${n.beat.id}/edit` : "/dashboard/beats";
    case "pack_approved":
      return n.pack ? `/packs/${n.pack.slug}` : null;
    case "pack_rejected":
      return n.pack ? `/dashboard/packs/${n.pack.id}/edit` : "/dashboard/packs";
    default:
      return null;
  }
}

/** The beat or pack's title (from when it happened, if it has since been deleted). */
export const notificationTitle = (n: NotificationItem) => n.beat?.title ?? n.pack?.title ?? n.data?.title ?? null;
