// Public (browser-safe) configuration. NEXT_PUBLIC_* values are inlined at build time.
export const env = {
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
  supabaseKey:
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
  siteUrl: (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(/\/$/, ""),
  siteName: process.env.NEXT_PUBLIC_SITE_NAME ?? "NOIRWAVE",
  /**
   * Preview/tunnel setups only (leave empty in production): a same-origin path,
   * e.g. "/sb", that the Next.js server proxies to Supabase (see SUPABASE_PROXY_TARGET).
   * Lets a browser that can't reach the Supabase host talk to it through the site itself.
   */
  supabaseBrowserPath: (process.env.NEXT_PUBLIC_SUPABASE_BROWSER_PATH ?? "").replace(/\/$/, ""),
};

export const isSupabaseConfigured = Boolean(env.supabaseUrl && env.supabaseKey);

/**
 * Auth cookie name derived from the canonical Supabase URL (identical to the
 * library default), so browser and server agree even when the browser talks
 * to Supabase through the same-origin proxy.
 */
export const authCookieName = (() => {
  try {
    return `sb-${new URL(env.supabaseUrl).hostname.split(".")[0]}-auth-token`;
  } catch {
    return "sb-auth-token";
  }
})();

/** Base URL the *browser* should use for Supabase API calls. */
export function browserSupabaseUrl() {
  if (env.supabaseBrowserPath && typeof window !== "undefined") return `${window.location.origin}${env.supabaseBrowserPath}`;
  return env.supabaseUrl;
}
