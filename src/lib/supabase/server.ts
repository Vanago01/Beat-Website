import "server-only";

import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import type { Database } from "../database.types";
import { authCookieName, env } from "../env";

/**
 * Per-request client bound to the visitor's session cookies (RLS applies).
 * Must be created inside a request scope (behind <Suspense> with Cache Components).
 */
export async function createSupabaseServerClient() {
  const cookieStore = await cookies();
  return createServerClient<Database>(env.supabaseUrl, env.supabaseKey, {
    cookieOptions: { name: authCookieName },
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Called from a Server Component: the proxy keeps sessions fresh instead.
        }
      },
    },
  });
}
