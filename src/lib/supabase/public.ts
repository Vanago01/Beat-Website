import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../database.types";
import { env } from "../env";

let publicClient: SupabaseClient<Database> | undefined;

/**
 * Anonymous, cookie-less client for public catalogue reads. Safe to use inside
 * `"use cache"` scopes because it never touches request data. RLS limits it to
 * published content.
 */
export function createSupabasePublicClient(): SupabaseClient<Database> {
  if (!publicClient) {
    publicClient = createClient<Database>(env.supabaseUrl, env.supabaseKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
  }
  return publicClient;
}
