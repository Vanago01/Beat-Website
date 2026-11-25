"use client";

import { useEffect } from "react";
import Link from "next/link";
import { Bell } from "lucide-react";
import { useAuth } from "@/components/providers/auth-provider";
import { Dropdown } from "@/components/ui/controls";
import { Skeleton } from "@/components/ui/misc";
import { cn } from "@/lib/utils";
import { useNotifications, watchNotifications } from "@/stores/notifications";
import { NotificationRow } from "./notification-row";

const badgeText = (n: number) => (n > 9 ? "9+" : String(n));

/** The newest notifications, in the bell's panel. */
function NotificationsPanel({ close }: { close: () => void }) {
  const items = useNotifications((s) => s.items);
  const fresh = useNotifications((s) => s.fresh);
  const error = useNotifications((s) => s.error);
  useEffect(() => watchNotifications(), []);
  const shown = items?.slice(0, 8);
  return (
    <div className="flex max-h-[min(36rem,calc(100dvh-6rem))] flex-col">
      <div className="flex items-center justify-between px-4 pb-2 pt-3">
        <p className="font-display text-base font-bold tracking-tight">Notifications</p>
        <Link href="/notifications" onClick={close} role="menuitem" className="rounded-full px-2.5 py-1 text-xs font-medium text-ink-300 transition hover:bg-white/[0.07] hover:text-white">
          See all
        </Link>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-1.5 pb-1.5">
        {!shown ? (
          error ? (
            <p className="px-3 py-8 text-center text-sm text-ink-400">Couldn&apos;t load notifications.</p>
          ) : (
            <div className="space-y-2 p-2" aria-hidden>
              {Array.from({ length: 3 }, (_, i) => (
                <Skeleton key={i} className="h-14 rounded-2xl" />
              ))}
            </div>
          )
        ) : shown.length === 0 ? (
          <div className="px-6 py-10 text-center">
            <Bell className="mx-auto h-6 w-6 text-ink-400" aria-hidden />
            <p className="mt-3 text-sm font-medium">Nothing here yet</p>
            <p className="mt-1 text-xs leading-relaxed text-ink-400">When someone likes, buys or downloads your beats, or follows you, you&apos;ll see it here.</p>
          </div>
        ) : (
          <ul aria-label="Latest notifications">
            {shown.map((n) => (
              <li key={n.id}>
                <NotificationRow n={n} isNew={!n.read_at || fresh.includes(n.id)} menuItem onOpen={close} />
              </li>
            ))}
          </ul>
        )}
      </div>
      {!!items && items.length > 8 && (
        <Link
          href="/notifications"
          onClick={close}
          role="menuitem"
          className="border-t border-white/[0.07] px-4 py-3 text-center text-sm font-medium text-ink-200 transition hover:bg-white/[0.05] hover:text-white"
        >
          See all notifications
        </Link>
      )}
    </div>
  );
}

/**
 * The bell in the top bar, with the number of unread notifications: a panel
 * on computers, the notifications page on phones and tablets.
 */
export function NotificationsButton({ pathname }: { pathname: string | null }) {
  const { user } = useAuth();
  const available = useNotifications((s) => s.available);
  const unread = useNotifications((s) => s.unread);
  // Nothing to show before the site's database has notifications (update 20).
  if (!user || available !== true) return null;
  const label = unread > 0 ? `Notifications, ${unread} unread` : "Notifications";
  const active = pathname === "/notifications";
  const badge = unread > 0 && (
    <span className="absolute right-0.5 top-0.5 grid h-[18px] min-w-[18px] place-items-center rounded-full bg-accent px-1 text-[10px] font-bold text-on-accent ring-2 ring-ink-950">
      {badgeText(unread)}
    </span>
  );
  const look = (on: boolean) =>
    cn(
      "relative grid h-10 w-10 place-items-center rounded-full transition hover:bg-white/[0.08] max-[379px]:w-9",
      on ? "bg-white/[0.06] text-white" : "text-ink-100 hover:text-white",
    );
  return (
    <>
      <Link href="/notifications" className={cn(look(active), "lg:hidden")} aria-label={label} data-testid="notifications-link">
        <Bell className="h-[19px] w-[19px]" />
        {badge}
      </Link>
      <div className="hidden lg:block">
        <Dropdown
          className="w-[min(26rem,calc(100vw-1rem))] p-0"
          trigger={({ open, toggle }) => (
            <button type="button" onClick={toggle} aria-expanded={open} aria-haspopup="menu" aria-label={label} className={look(open || active)}>
              <Bell className="h-[19px] w-[19px]" />
              {badge}
            </button>
          )}
        >
          {(close) => <NotificationsPanel close={close} />}
        </Dropdown>
      </div>
    </>
  );
}
