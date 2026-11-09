import type { Metadata } from "next";
import { Suspense } from "react";
import { ConversationView } from "@/components/messages/conversation-view";
import { ThreadSkeleton } from "@/components/messages/thread-skeleton";

export const metadata: Metadata = { title: "Messages", robots: { index: false } };

export default function ConversationPage({ params }: PageProps<"/messages/[id]">) {
  return (
    <Suspense fallback={<ThreadSkeleton />}>
      {params.then(({ id }) => (
        <ConversationView key={id} conversationId={id} />
      ))}
    </Suspense>
  );
}
