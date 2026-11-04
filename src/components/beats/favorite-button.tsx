"use client";

import { Heart } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { toast } from "sonner";
import { useFavorites } from "@/stores/favorites";
import { useAuth } from "@/components/providers/auth-provider";
import { cn } from "@/lib/utils";

export function FavoriteButton({
  beatId,
  className,
  size = "md",
  variant = "glass",
}: {
  beatId: string;
  className?: string;
  size?: "sm" | "md";
  variant?: "glass" | "plain";
}) {
  const { user } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const active = useFavorites((s) => s.ids.has(beatId));
  const toggle = useFavorites((s) => s.toggle);

  return (
    <button
      type="button"
      aria-pressed={active}
      aria-label={active ? "Remove from favorites" : "Add to favorites"}
      onClick={async (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (!user) {
          toast("Sign in to save favorites", {
            action: { label: "Sign in", onClick: () => router.push(`/login?next=${encodeURIComponent(pathname)}`) },
          });
          return;
        }
        const result = await toggle(beatId);
        if (result === true) toast.success("Saved to favorites");
      }}
      className={cn(
        "grid shrink-0 place-items-center rounded-full transition-all duration-200 active:scale-90",
        size === "md" ? "h-9 w-9" : "h-8 w-8",
        variant === "glass" ? "glass hover:bg-white/15" : "hover:bg-white/[0.07]",
        active ? "text-[#ff5c8a]" : "text-ink-100 hover:text-white",
        className,
      )}
    >
      <Heart className={cn(size === "md" ? "h-4 w-4" : "h-[15px] w-[15px]", active && "fill-current")} />
    </button>
  );
}
