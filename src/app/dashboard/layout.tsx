import { Suspense } from "react";
import { Tabs } from "@/components/account/account-tabs";
import { CollabInvites } from "@/components/studio/collaborations";
import { getViewer } from "@/lib/auth";
import { getMyCollaborations } from "@/lib/data/collaborations";

const TABS = [
  { href: "/dashboard", label: "Overview" },
  // Beats and beat packs live together: "My beats" lists both, "Upload" creates either.
  { href: "/dashboard/beats", label: "My beats", match: ["/dashboard/packs"] },
  { href: "/dashboard/beats/new", label: "Upload", match: ["/dashboard/packs/new"] },
  { href: "/dashboard/sales", label: "Sales" },
  { href: "/dashboard/payouts", label: "Payouts" },
];

/** Collaboration invites waiting for an answer: shown on every studio page. */
async function StudioInvites() {
  const viewer = await getViewer();
  const role = viewer?.profile?.role;
  if (role !== "seller" && role !== "admin") return null;
  const invites = (await getMyCollaborations()).filter((c) => c.role === "collaborator" && c.status === "pending");
  return <CollabInvites invites={invites} />;
}

export default function StudioLayout({ children }: LayoutProps<"/dashboard">) {
  return (
    <div className="mx-auto max-w-[1400px] px-4 pb-10 pt-8 sm:px-6 md:pt-12 lg:px-8">
      <p className="font-mono text-[11px] uppercase tracking-[0.25em] text-accent-300">Producer studio</p>
      <h1 className="mt-3 font-display text-4xl font-extrabold tracking-[-0.04em] md:text-6xl">Studio</h1>
      <div className="mt-8 border-b border-white/[0.07] pb-4">
        <Tabs items={TABS} />
      </div>
      <div className="mt-8">
        <Suspense fallback={null}>
          <StudioInvites />
        </Suspense>
        {children}
      </div>
    </div>
  );
}
