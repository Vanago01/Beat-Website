import type { Metadata } from "next";
import { Suspense } from "react";
import { requireAdmin } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isEmailConfigured, isStripeConfigured, serverEnv } from "@/lib/server-env";
import { GenresManager, PlatformSettingsForm } from "@/components/admin/settings-forms";
import { PageSkeleton } from "@/components/account/page-skeleton";
import { Badge, Card } from "@/components/ui/misc";

export const metadata: Metadata = { title: "Platform settings", robots: { index: false } };

async function Settings() {
  await requireAdmin();
  const supabase = await createSupabaseServerClient();
  const [{ data: settings }, { data: genres }] = await Promise.all([
    supabase.from("platform_settings").select("*").single(),
    supabase.from("genres").select("slug, name, sort_order").order("sort_order"),
  ]);
  const integrations = [
    { name: "Stripe payments", ok: isStripeConfigured(), hint: "STRIPE_SECRET_KEY" },
    { name: "Stripe webhooks", ok: Boolean(serverEnv.stripeWebhookSecret), hint: "STRIPE_WEBHOOK_SECRET" },
    { name: "Order emails (Resend)", ok: isEmailConfigured(), hint: "RESEND_API_KEY + EMAIL_FROM" },
    { name: "Supabase service role", ok: Boolean(serverEnv.supabaseSecretKey), hint: "SUPABASE_SECRET_KEY" },
  ];
  return (
    <div className="grid gap-6">
      {settings && <PlatformSettingsForm settings={settings} />}
      <GenresManager genres={genres ?? []} />
      <Card className="p-6">
        <h2 className="font-display text-lg font-bold">Integrations</h2>
        <ul className="mt-4 divide-y divide-white/[0.05]">
          {integrations.map((i) => (
            <li key={i.name} className="flex items-center justify-between py-3 text-sm">
              <span>
                {i.name} <span className="ml-2 font-mono text-xs text-ink-500">{i.hint}</span>
              </span>
              <Badge tone={i.ok ? "success" : "warning"}>{i.ok ? "Configured" : "Not configured"}</Badge>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}

export default function AdminSettingsPage() {
  return (
    <Suspense fallback={<PageSkeleton rows={3} />}>
      <Settings />
    </Suspense>
  );
}
