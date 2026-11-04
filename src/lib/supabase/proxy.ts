import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import type { Database } from "../database.types";
import { authCookieName, env } from "../env";
import { safeNextPath } from "../utils";

const PROTECTED_PREFIXES = ["/account", "/dashboard", "/admin", "/checkout"];
const AUTH_PAGES = ["/login", "/register"];

function matches(path: string, prefixes: string[]) {
  return prefixes.some((p) => path === p || path.startsWith(`${p}/`));
}

/** Refreshes the Supabase session on every request and guards private areas. */
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  if (!env.supabaseUrl || !env.supabaseKey) return response;

  const supabase = createServerClient<Database>(env.supabaseUrl, env.supabaseKey, {
    cookieOptions: { name: authCookieName },
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        Object.entries(headers ?? {}).forEach(([key, value]) => response.headers.set(key, value));
      },
    },
  });

  // IMPORTANT: no code between client creation and getClaims().
  const { data } = await supabase.auth.getClaims();
  const signedIn = Boolean(data?.claims?.sub);
  const path = request.nextUrl.pathname;

  const redirectTo = (pathname: string, params?: Record<string, string>) => {
    const url = request.nextUrl.clone();
    url.pathname = pathname;
    url.search = "";
    Object.entries(params ?? {}).forEach(([k, v]) => url.searchParams.set(k, v));
    const redirect = NextResponse.redirect(url);
    response.cookies.getAll().forEach((cookie) => redirect.cookies.set(cookie));
    return redirect;
  };

  if (!signedIn && matches(path, PROTECTED_PREFIXES)) {
    return redirectTo("/login", { next: path + request.nextUrl.search });
  }

  if (signedIn && matches(path, AUTH_PAGES)) {
    const next = safeNextPath(request.nextUrl.searchParams.get("next"), "/account");
    const [pathname, query] = next.split("?");
    return redirectTo(pathname, Object.fromEntries(new URLSearchParams(query ?? "")));
  }

  return response;
}
