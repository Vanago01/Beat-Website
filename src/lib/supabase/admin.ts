import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../database.types";
import { env } from "../env";
import { serverEnv } from "../server-env";

let adminClient: SupabaseClient<Database> | undefined;

/**
 * Service-role client. BYPASSES RLS — only use in trusted server code
 * (webhooks, checkout, signed download URLs) after authorising the caller.
 */
export function createSupabaseAdminClient(): SupabaseClient<Database> {
  if (!serverEnv.supabaseSecretKey) {
    throw new Error("SUPABASE_SECRET_KEY is not configured on the server.");
  }
  if (!adminClient) {
    adminClient = createClient<Database>(env.supabaseUrl, serverEnv.supabaseSecretKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
  }
  return adminClient;
}
