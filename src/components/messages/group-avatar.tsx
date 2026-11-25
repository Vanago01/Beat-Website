import { Users } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { chatName, type ChatProfile } from "@/lib/messages";
import { cn } from "@/lib/utils";

/**
 * A group's picture, or (without one) two of the people in it overlapping,
 * like Messenger.
 */
export function GroupAvatar({
  photoPath,
  title,
  members,
  size = 44,
  className,
}: {
  photoPath?: string | null;
  title: string;
  members?: Pick<ChatProfile, "avatar_path" | "username" | "display_name" | "producer_name">[] | null;
  size?: number;
  className?: string;
}) {
  if (photoPath) return <Avatar path={photoPath} name={title} size={size} className={className} />;
  const [a, b] = members ?? [];
  if (!a || !b) {
    return (
      <span
        className={cn("inline-grid shrink-0 place-items-center rounded-full bg-white/[0.08] text-ink-200", className)}
        style={{ width: size, height: size }}
        aria-hidden
      >
        <Users style={{ width: size * 0.45, height: size * 0.45 }} />
      </span>
    );
  }
  const small = Math.round(size * 0.68);
  return (
    <span className={cn("relative inline-block shrink-0", className)} style={{ width: size, height: size }} aria-hidden>
      <Avatar path={a.avatar_path} name={chatName(a)} size={small} className="absolute left-0 top-0" />
      <Avatar path={b.avatar_path} name={chatName(b)} size={small} className="absolute bottom-0 right-0 ring-2 ring-ink-900" />
    </span>
  );
}
