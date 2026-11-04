import type { Metadata } from "next";
import { Suspense } from "react";
import { requireViewer } from "@/lib/auth";
import { ProfileForm } from "@/components/account/profile-form";
import { PageSkeleton } from "@/components/account/page-skeleton";

export const metadata: Metadata = { title: "My profile", robots: { index: false } };

async function Profile() {
  const viewer = await requireViewer("/account");
  return <ProfileForm profile={viewer.profile} />;
}

export default function AccountPage() {
  return (
    <Suspense fallback={<PageSkeleton rows={3} />}>
      <Profile />
    </Suspense>
  );
}
