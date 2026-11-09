"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { MessageCircle } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/components/providers/auth-provider";
import { Button, buttonVariants, type ButtonSize, type ButtonVariant } from "@/components/ui/button";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { errorMessage } from "@/lib/utils";

/** Opens (or starts) a conversation with this person. Hidden on your own profile. */
export function MessageButton({
  profileId,
  returnTo,
  variant = "secondary",
  size = "sm",
  className,
  label = "Message",
}: {
  profileId: string;
  /** Where to come back to after signing in. */
  returnTo: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
  label?: string;
}) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  if (loading || user?.id === profileId) return null;

  if (!user) {
    return (
      <Link href={`/login?next=${encodeURIComponent(returnTo)}`} className={buttonVariants({ variant, size, className })}>
        <MessageCircle className="h-3.5 w-3.5" /> {label}
      </Link>
    );
  }

  const open = async () => {
    setBusy(true);
    const { data, error } = await getSupabaseBrowserClient().rpc("start_conversation", { p_user: profileId });
    if (error || !data) {
      setBusy(false);
      toast.error("Couldn't open the conversation", { description: errorMessage(error) });
      return;
    }
    router.push(`/messages/${data}`);
  };

  return (
    <Button variant={variant} size={size} className={className} loading={busy} onClick={open}>
      {!busy && <MessageCircle className="h-3.5 w-3.5" />} {label}
    </Button>
  );
}
