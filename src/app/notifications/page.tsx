import type { Metadata } from "next";
import { NotificationsView } from "@/components/notifications/notifications-view";

export const metadata: Metadata = { title: "Notifications", robots: { index: false } };

export default function NotificationsPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 pb-16 pt-8 sm:px-6 md:pt-12">
      <p className="font-mono text-[11px] uppercase tracking-[0.25em] text-accent-300">Your activity</p>
      <h1 className="mb-8 mt-3 font-display text-5xl font-extrabold tracking-[-0.045em] md:text-6xl">Notifications</h1>
      <NotificationsView />
    </div>
  );
}
