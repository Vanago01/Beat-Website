import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { safeNextPath } from "@/lib/utils";

/** OAuth / PKCE email link landing: exchanges ?code= for a session cookie. */
export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const next = safeNextPath(url.searchParams.get("next"), "/account");
  const errorDescription = url.searchParams.get("error_description");

  if (code) {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(new URL(next, url.origin));
    return NextResponse.redirect(new URL(`/login?error=${encodeURIComponent("That link is invalid or has expired. Please sign in or request a new link.")}`, url.origin));
  }

  return NextResponse.redirect(
    new URL(`/login?error=${encodeURIComponent(errorDescription ?? "Missing authentication code.")}`, url.origin),
  );
}
