import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { safeNextPath } from "@/lib/utils";

const TYPES: EmailOtpType[] = ["signup", "invite", "magiclink", "recovery", "email_change", "email"];

/**
 * Cross-device email verification (token hash). Point the Supabase email
 * templates at: {{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=<type>&next=/account
 */
export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type") as EmailOtpType | null;
  const fallback = type === "recovery" ? "/reset-password" : "/account";
  const next = safeNextPath(url.searchParams.get("next"), fallback);

  if (tokenHash && type && TYPES.includes(type)) {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    if (!error) return NextResponse.redirect(new URL(next, url.origin));
  }
  return NextResponse.redirect(new URL(`/login?error=${encodeURIComponent("This confirmation link is invalid or has expired.")}`, url.origin));
}
