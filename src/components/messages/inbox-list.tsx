"use client";

import { useEffect } from "react";
import Link from "next/link";
import { BadgeCheck, MessageCircle, Pin, PinOff } from "lucide-react";
import { toast } from "sonner";
import { Avatar } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/misc";
import { buttonVariants } from "@/components/ui/button";
import { conversationName, formatInboxTime, inboxPreview, timeOf } from "@/lib/messages";
import { cn, errorMessage } from "@/lib/utils";
import { pinConversation, useMessages, watchInbox } from "@/stores/messages";
import { useChatUpdate20 } from "@/stores/chat-features";
import { GroupAvatar } from "./group-avatar";
import { NewGroupButton } from "./new-group";

function InboxSkeleton() {
  return (
    <div className="space-y-1 px-2" aria-hidden>
      {Array.from({ length: 6 }, (_, i) => (
        <div key={i} className="flex items-center gap-3 rounded-2xl px-3 py-3">
          <Skeleton className="h-11 w-11 shrink-0 rounded-full" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-3.5 w-2/5 rounded-md" />
            <Skeleton className="h-3 w-4/5 rounded-md" />
          </div>
        </div>
      ))}
    </div>
  );
}

/** The list of conversations (left column on large screens, the whole page on phones). */
export function InboxList() {
  const userId = useMessages((s) => s.userId);
  const inbox = useMessages((s) => s.inbox);
  const error = useMessages((s) => s.inboxError);
  const active = useMessages((s) => s.activeConversationId);
  const groups = useChatUpdate20(userId);

  // Refetch when the signed-in user is known (or changes).
  useEffect(() => watchInbox(), [userId]);

  // Only read the clock once conversations are shown (never while the page is prerendered).
  const now = inbox && inbox.length > 0 ? Date.now() : 0;

  return (
    <>
      <div className="flex items-center justify-between gap-3 px-5 pb-3 pt-5">
        <h1 className="font-display text-2xl font-extrabold tracking-[-0.03em]">Messages</h1>
        {userId && groups && <NewGroupButton me={userId} />}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto pb-3">
        {inbox === null ? (
          <InboxSkeleton />
        ) : error && inbox.length === 0 ? (
          <p className="px-5 py-8 text-sm text-ink-300">Couldn&apos;t load your messages. Check your connection and try again.</p>
        ) : inbox.length === 0 ? (
          <div className="flex flex-col items-center px-6 py-14 text-center">
            <div className="mb-4 grid h-14 w-14 place-items-center rounded-2xl border border-white/10 bg-white/[0.04] text-ink-200">
              <MessageCircle className="h-6 w-6" />
            </div>
            <p className="font-display text-lg font-bold">No messages yet</p>
            <p className="mt-1.5 max-w-xs text-sm leading-relaxed text-ink-300">
              Open a producer&apos;s profile and press <span className="font-medium text-ink-100">Message</span> to start a conversation.
            </p>
            <Link href="/producers" className={buttonVariants({ variant: "secondary", size: "sm", className: "mt-5" })}>
              Find producers
            </Link>
          </div>
        ) : (
          <ul className="space-y-0.5 px-2" aria-label="Conversations">
            {inbox.map((c) => {
              const name = conversationName(c);
              const unread = c.unread_count > 0 && c.id !== active;
              const preview = inboxPreview(c, userId);
              const time = timeOf(c.last_message.created_at);
              const pinnable = c.pinned !== undefined;
              const togglePin = async () => {
                try {
                  await pinConversation(c.id, !c.pinned);
                } catch (err) {
                  toast.error(c.pinned ? "Couldn't unpin" : "Couldn't pin", { description: errorMessage(err) });
                }
              };
              return (
                <li key={c.id} className="group/row relative">
                  <Link
                    href={`/messages/${c.id}`}
                    aria-current={c.id === active ? "page" : undefined}
                    className={cn(
                      "flex items-center gap-3 rounded-2xl px-3 py-3 transition",
                      c.id === active ? "bg-white/[0.07]" : "hover:bg-white/[0.04]",
                    )}
                  >
                    {c.is_group ? (
                      <GroupAvatar photoPath={c.photo_path} title={name} members={c.members} size={44} />
                    ) : (
                      <Avatar path={c.other?.avatar_path} name={name} size={44} />
                    )}
                    <span className="min-w-0 flex-1">
                      <span className="flex items-baseline gap-2">
                        <span className={cn("flex min-w-0 items-center gap-1 truncate text-sm", unread ? "font-bold text-white" : "font-semibold text-ink-50")}>
                          <span className="truncate">{name}</span>
                          {c.other?.is_verified && <BadgeCheck className="h-3.5 w-3.5 shrink-0 text-accent-400" aria-label="Verified" />}
                        </span>
                        <span
                          className={cn(
                            "ml-auto flex shrink-0 items-center gap-1 text-[11px]",
                            unread ? "font-semibold text-accent-300" : "text-ink-400",
                            pinnable && "[@media(hover:hover)]:group-hover/row:invisible [@media(hover:hover)]:group-focus-within/row:invisible",
                          )}
                        >
                          {c.pinned && <Pin className="h-3 w-3 rotate-45 text-ink-400" aria-label="Pinned" />}
                          {Number.isFinite(time) ? formatInboxTime(time, now) : ""}
                        </span>
                      </span>
                      <span className="mt-0.5 flex items-center gap-2">
                        <span className={cn("min-w-0 flex-1 truncate text-[13px]", unread ? "font-medium text-ink-100" : "text-ink-400")}>
                          {preview.prefix && <span className="text-ink-400">{preview.prefix}</span>}
                          {preview.text}
                        </span>
                        {unread && (
                          <span className="grid h-5 min-w-5 shrink-0 place-items-center rounded-full bg-accent px-1.5 text-[11px] font-bold text-on-accent">
                            <span className="sr-only">Unread messages: </span>
                            {c.unread_count > 99 ? "99+" : c.unread_count}
                          </span>
                        )}
                      </span>
                    </span>
                  </Link>
                  {pinnable && (
                    <button
                      type="button"
                      onClick={() => void togglePin()}
                      aria-label={c.pinned ? `Unpin the conversation with ${name}` : `Pin the conversation with ${name}`}
                      title={c.pinned ? "Unpin" : "Pin to the top"}
                      className="absolute right-2.5 top-2 hidden h-7 w-7 place-items-center rounded-full text-ink-300 transition hover:bg-white/[0.1] hover:text-white focus-visible:grid group-hover/row:grid group-focus-within/row:grid [@media(hover:none)]:!hidden"
                    >
                      {c.pinned ? <PinOff className="h-3.5 w-3.5" /> : <Pin className="h-3.5 w-3.5" />}
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </>
  );
}
