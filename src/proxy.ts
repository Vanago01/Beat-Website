import type { NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/proxy";

export async function proxy(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: [
    // Everything except static assets, image optimisation and the Stripe webhook (raw body).
    "/((?!_next/static|_next/image|sb/|favicon.ico|icon.svg|api/webhooks|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|txt|xml|mp3|wav)$).*)",
  ],
};
