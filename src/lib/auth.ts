import "server-only";

import { cache } from "react";
import { notFound, redirect } from "next/navigation";
import { createSupabaseServerClient } from "./supabase/server";
import type { Profile } from "./types";

export interface Viewer {
  id: string;
  email: string | null;
  profile: Profile | null;
  /** Session assurance level: "aal2" after a two-factor sign-in. */
  aal: "aal1" | "aal2";
}

type SessionState =
  | { status: "signed-out" }
  /** Signed in with a password, but two-factor is set up and the code wasn't entered yet. */
  | { status: "needs-code" }
  | { status: "signed-in"; viewer: Viewer };

/**
 * Data Access Layer. The session is verified with Supabase Auth (JWT
 * signature / auth server), never trusted from the client. Memoised per request.
 */
const getSessionState = cache(async (): Promise<SessionState> => {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (error || !claims?.sub) return { status: "signed-out" };

  const aal = claims.aal === "aal2" ? "aal2" : "aal1";
  const { data: profile } = await supabase.from("profiles").select("*").eq("id", claims.sub).maybeSingle();
  // The database hides everything from password-only sessions of users with
  // two-factor set up — the only case where a signed-in user has no profile row.
  if (!profile && aal === "aal1") {
    const { data: satisfied } = await supabase.rpc("mfa_satisfied");
    if (satisfied === false) return { status: "needs-code" };
  }
  return {
    status: "signed-in",
    viewer: { id: claims.sub, email: (claims.email as string | undefined) ?? null, profile: profile ?? null, aal },
  };
});

/** The fully signed-in user, or null (signed out, or still has to enter the two-factor code). */
export const getViewer = cache(async (): Promise<Viewer | null> => {
  const state = await getSessionState();
  return state.status === "signed-in" ? state.viewer : null;
});

const twoFactorUrl = (next: string) => `/two-factor?next=${encodeURIComponent(next)}`;

export async function requireViewer(next = "/account"): Promise<Viewer & { profile: Profile }> {
  const state = await getSessionState();
  if (state.status === "needs-code") redirect(twoFactorUrl(next));
  if (state.status !== "signed-in" || !state.viewer.profile) redirect(`/login?next=${encodeURIComponent(next)}`);
  return state.viewer as Viewer & { profile: Profile };
}

export async function requireSeller(next = "/dashboard") {
  const viewer = await requireViewer(next);
  if (viewer.profile.role !== "seller" && viewer.profile.role !== "admin") redirect("/sell");
  return viewer;
}

/**
 * Admin pages 404 for everyone else — the area is not advertised. Admins must
 * have signed in with two-factor authentication (also enforced by the database).
 */
export async function requireAdmin(next = "/admin") {
  const state = await getSessionState();
  if (state.status === "needs-code") redirect(twoFactorUrl(next));
  if (state.status !== "signed-in" || state.viewer.profile?.role !== "admin") notFound();
  if (state.viewer.aal !== "aal2") redirect("/account/security?require=2fa");
  return state.viewer as Viewer & { profile: Profile };
}

export const isSellerRole = (role?: string | null) => role === "seller" || role === "admin";
