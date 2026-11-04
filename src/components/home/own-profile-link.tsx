"use client";

import Link from "next/link";
import { Pencil } from "lucide-react";
import { useAuth } from "@/components/providers/auth-provider";
import { buttonVariants } from "@/components/ui/button";

export function OwnProfileLink({ profileId }: { profileId: string }) {
  const { user } = useAuth();
  if (user?.id !== profileId) return null;
  return (
    <Link href="/account" className={buttonVariants({ variant: "secondary", size: "sm" })}>
      <Pencil className="h-3.5 w-3.5" /> Edit profile
    </Link>
  );
}
