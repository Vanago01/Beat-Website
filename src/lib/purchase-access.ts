import "server-only";

import { createSupabaseServerClient } from "./supabase/server";
import { createSupabaseAdminClient } from "./supabase/admin";

const COLUMNS =
  "id, buyer_id, beat_id, order_id, license_number, license_type, includes_mp3, includes_wav, includes_stems, license_snapshot, revoked_at, created_at";

const isUuid = (value: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);

/** Loads a purchase only if it belongs to the signed-in visitor (RLS + explicit check). */
export async function getOwnedPurchase(purchaseId: string) {
  if (!isUuid(purchaseId)) return { status: 404 as const };
  const supabase = await createSupabaseServerClient();
  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims?.sub;
  if (!userId) return { status: 401 as const };

  const { data: purchase } = await supabase.from("purchases").select(COLUMNS).eq("id", purchaseId).maybeSingle();
  if (!purchase || purchase.buyer_id !== userId) return { status: 404 as const };
  if (purchase.revoked_at) return { status: 403 as const };

  const { data: profile } = await supabase.from("profiles").select("username, display_name").eq("id", userId).maybeSingle();
  return {
    status: 200 as const,
    purchase,
    buyer: { id: userId, email: (claims?.claims?.email as string | undefined) ?? "", name: profile?.display_name || profile?.username || "Licensee" },
  };
}

/**
 * Loads a purchase for a license link with a valid pass (see license-links.ts):
 * the pass already proves the link came from the buyer's own library.
 */
export async function getPurchaseForPass(purchaseId: string) {
  if (!isUuid(purchaseId)) return { status: 404 as const };
  const admin = createSupabaseAdminClient();
  const { data: purchase } = await admin.from("purchases").select(COLUMNS).eq("id", purchaseId).maybeSingle();
  if (!purchase) return { status: 404 as const };
  if (purchase.revoked_at) return { status: 403 as const };

  const [{ data: profile }, { data: user }] = await Promise.all([
    admin.from("profiles").select("username, display_name").eq("id", purchase.buyer_id).maybeSingle(),
    admin.auth.admin.getUserById(purchase.buyer_id),
  ]);
  return {
    status: 200 as const,
    purchase,
    buyer: { id: purchase.buyer_id, email: user?.user?.email ?? "", name: profile?.display_name || profile?.username || "Licensee" },
  };
}
