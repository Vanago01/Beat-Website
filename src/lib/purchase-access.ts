import "server-only";

import { createSupabaseServerClient } from "./supabase/server";

/** Loads a purchase only if it belongs to the signed-in visitor (RLS + explicit check). */
export async function getOwnedPurchase(purchaseId: string) {
  if (!/^[0-9a-f-]{36}$/i.test(purchaseId)) return { status: 404 as const };
  const supabase = await createSupabaseServerClient();
  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims?.sub;
  if (!userId) return { status: 401 as const };

  const { data: purchase } = await supabase
    .from("purchases")
    .select("id, buyer_id, beat_id, order_id, license_number, license_type, includes_mp3, includes_wav, includes_stems, license_snapshot, revoked_at, created_at")
    .eq("id", purchaseId)
    .maybeSingle();
  if (!purchase || purchase.buyer_id !== userId) return { status: 404 as const };
  if (purchase.revoked_at) return { status: 403 as const };

  const { data: profile } = await supabase.from("profiles").select("username, display_name").eq("id", userId).maybeSingle();
  return {
    status: 200 as const,
    purchase,
    buyer: { id: userId, email: (claims?.claims?.email as string | undefined) ?? "", name: profile?.display_name || profile?.username || "Licensee" },
  };
}
