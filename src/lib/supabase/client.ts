"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../database.types";
import { authCookieName, browserSupabaseUrl, env } from "../env";

let browserClient: SupabaseClient<Database> | undefined;

/** Browser client: carries the signed-in user's session; every query is subject to RLS. */
export function getSupabaseBrowserClient(): SupabaseClient<Database> {
  if (!browserClient) {
    browserClient = createBrowserClient<Database>(browserSupabaseUrl(), env.supabaseKey, {
      cookieOptions: { name: authCookieName },
    });
  }
  return browserClient;
}
