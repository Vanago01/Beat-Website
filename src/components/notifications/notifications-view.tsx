"use client";

import { useEffect, useMemo } from "react";
import Link from "next/link";
import { Bell } from "lucide-react";
import { useAuth } from "@/components/providers/auth-provider";
import { Button, buttonVariants } from "@/components/ui/button";
import { EmptyState, Skeleton } from "@/components/ui/misc";
import { loadNotifications, useNotifications, watchNotifications } from "@/stores/notifications";
import type { NotificationItem } from "@/lib/notifications";
import { NotificationRow } from "./notification-row";

const longDay = new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long" });
const longDayYear = new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" });

/** "Today", "Yesterday", "Monday 3 November". */
function dayHeading(d: Date, now: Date) {
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (d.toDateString() === now.toDateString()) return "Today";
  if (d.toDateString() === yesterday.toDateString()) return "Yesterday";
  return d.getFullYear() === now.getFullYear() ? longDay.format(d) : longDayYear.format(d);
}

/** Every notification, newest first, by day. Opening the page marks them read. */
export function NotificationsView() {
  const { user, loading } = useAuth();
  const items = useNotifications((s) => s.items);
  const fresh = useNotifications((s) => s.fresh);
  const available = useNotifications((s) => s.available);
  const hasMore = useNotifications((s) => s.hasMore);
  const loadingMore = useNotifications((s) => s.loadingMore);
  const error = useNotifications((s) => s.error);
  const signedIn = !!user;

  useEffect(() => (signedIn ? watchNotifications() : undefined), [signedIn]);

  const days = useMemo(() => {
    // Only in the browser, once loaded (the clock isn't read while the page is built).
    if (!items?.length) return [];
    const now = new Date();
    const groups: { heading: string; items: NotificationItem[] }[] = [];
    for (const n of items) {
      const heading = dayHeading(new Date(n.created_at), now);
      const last = groups[groups.length - 1];
      if (last?.heading === heading) last.items.push(n);
      else groups.push({ heading, items: [n] });
    }
    return groups;
  }, [items]);

  if (!loading && !user) {
    return (
      <EmptyState
        icon={<Bell className="h-6 w-6" />}
        title="Sign in to see your notifications"
        description="Likes, sales, downloads, new followers and collaboration invites show up here."
        action={
          <Link href="/login?next=/notifications" className={buttonVariants()}>
            Sign in
          </Link>
        }
      />
    );
  }

  if (available === false) {
    return (
      <EmptyState
        icon={<Bell className="h-6 w-6" />}
        title="Notifications aren't switched on yet"
        description="They need the site's database update 20."
      />
    );
  }

  if (!items) {
    return error ? (
      <EmptyState title="Couldn't load your notifications" description={error} action={<Button onClick={() => void loadNotifications()}>Try again</Button>} />
    ) : (
      <div className="space-y-2" aria-hidden>
        {Array.from({ length: 6 }, (_, i) => (
          <Skeleton key={i} className="h-[72px] rounded-2xl" />
        ))}
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <EmptyState
        icon={<Bell className="h-6 w-6" />}
        title="Nothing here yet"
        description="When someone likes, buys or downloads your beats, follows you, or invites you to co-produce, you'll see it here with the time it happened."
      />
    );
  }

  return (
    <div>
      {days.map((day) => (
        <section key={day.heading} className="mb-6" aria-label={day.heading}>
          <h2 className="mb-2 px-3 text-[11px] font-semibold uppercase tracking-[0.16em] text-ink-400">{day.heading}</h2>
          <ul className="space-y-1">
            {day.items.map((n) => (
              <li key={n.id}>
                <NotificationRow n={n} isNew={!n.read_at || fresh.includes(n.id)} />
              </li>
            ))}
          </ul>
        </section>
      ))}
      {hasMore && (
        <div className="flex justify-center">
          <Button variant="secondary" onClick={() => void loadNotifications(true)} loading={loadingMore}>
            Show older notifications
          </Button>
        </div>
      )}
    </div>
  );
}
