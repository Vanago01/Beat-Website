import type { Metadata } from "next";
import { Suspense } from "react";
import { requireViewer } from "@/lib/auth";
import { InboxList } from "@/components/messages/inbox-list";
import { MessagesFrame, MessagesFrameSkeleton } from "@/components/messages/messages-frame";

export const metadata: Metadata = { title: "Messages", robots: { index: false } };

/** Sends visitors who aren't fully signed in (or still need their two-factor code) to sign in. */
async function ViewerGate() {
  await requireViewer("/messages");
  return null;
}

export default function MessagesLayout({ children }: LayoutProps<"/messages">) {
  return (
    <div className="mx-auto max-w-[1200px] sm:px-6 sm:pt-6 lg:px-8">
      <Suspense fallback={null}>
        <ViewerGate />
      </Suspense>
      {/* The frame reads the open conversation from the address, which isn't known until the request. */}
      <Suspense fallback={<MessagesFrameSkeleton />}>
        <MessagesFrame list={<InboxList />}>{children}</MessagesFrame>
      </Suspense>
    </div>
  );
}
