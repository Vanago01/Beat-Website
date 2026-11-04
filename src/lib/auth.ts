import "server-only";

import { cache } from "react";
import { notFound, redirect } from "next/navigation";
import { createSupabaseServerClient } from "./supabase/server";
import type { Profile } from "./types";

export interface Viewer {
  id: string;
  email: string | null;
  profile: Profile | null;
}

/**
 * Data Access Layer. The session is verified with Supabase Auth (JWT
 * signature / auth server), never trusted from the client. Memoised per request.
 */
export const getViewer = cache(async (): Promise<Viewer | null> => {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (error || !claims?.sub) return null;

  const { data: profile } = await supabase.from("profiles").select("*").eq("id", claims.sub).maybeSingle();
  return { id: claims.sub, email: (claims.email as string | undefined) ?? null, profile: profile ?? null };
});

export async function requireViewer(next = "/account"): Promise<Viewer & { profile: Profile }> {
  const viewer = await getViewer();
  if (!viewer || !viewer.profile) redirect(`/login?next=${encodeURIComponent(next)}`);
  return viewer as Viewer & { profile: Profile };
}

export async function requireSeller(next = "/dashboard") {
  const viewer = await requireViewer(next);
  if (viewer.profile.role !== "seller" && viewer.profile.role !== "admin") redirect("/sell");
  return viewer;
}

/** Admin pages 404 for everyone else — the area is not advertised. */
export async function requireAdmin() {
  const viewer = await getViewer();
  if (!viewer?.profile || viewer.profile.role !== "admin") notFound();
  return viewer as Viewer & { profile: Profile };
}

export const isSellerRole = (role?: string | null) => role === "seller" || role === "admin";
