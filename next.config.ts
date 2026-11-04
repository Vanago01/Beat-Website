import type { NextConfig } from "next";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL)
  : null;

// Image optimisation refuses private IPs by default; allow it only when the
// Supabase project itself is local (development).
const isLocalSupabase =
  !!supabaseUrl && ["localhost", "127.0.0.1", "0.0.0.0"].includes(supabaseUrl.hostname);

// Preview/tunnel setups only: proxy /sb/* to Supabase so browsers that cannot
// reach the Supabase host directly can still use the app (see NEXT_PUBLIC_SUPABASE_BROWSER_PATH).
const supabaseProxyTarget = process.env.SUPABASE_PROXY_TARGET?.replace(/\/$/, "");

const isDev = process.env.NODE_ENV === "development";
const isHttpsSite = (process.env.NEXT_PUBLIC_SITE_URL ?? "").startsWith("https://") || process.env.VERCEL === "1";

// Origins the browser talks to directly: the Supabase project (API, auth,
// storage, audio previews, cover art) and its direct storage host used for
// large uploads.
const supabaseOrigins = supabaseUrl
  ? [
      supabaseUrl.origin,
      ...(supabaseUrl.hostname.endsWith(".supabase.co")
        ? [`${supabaseUrl.protocol}//${supabaseUrl.hostname.replace(/\.supabase\.co$/, ".storage.supabase.co")}`]
        : []),
    ]
  : [];
const supabaseSources = supabaseOrigins.join(" ");

// Content-Security-Policy without nonces (keeps static pages cacheable — see
// node_modules/next/dist/docs/01-app/02-guides/content-security-policy.md).
// Scripts may only come from this site; no plugins, no framing, no foreign
// form targets, and network/media access only to this site and Supabase.
const contentSecurityPolicy = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  `img-src 'self' data: blob: ${supabaseSources}`,
  `media-src 'self' blob: ${supabaseSources}`,
  "font-src 'self' data:",
  `connect-src 'self' ${supabaseSources}${isDev ? " ws: wss:" : ""}`,
  "worker-src 'self' blob:",
  "frame-src 'none'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "manifest-src 'self'",
  ...(isHttpsSite && !isDev ? ["upgrade-insecure-requests"] : []),
]
  .map((d) => d.trim())
  .join("; ");

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  { key: "X-Permitted-Cross-Domain-Policies", value: "none" },
  {
    key: "Permissions-Policy",
    value:
      "camera=(), microphone=(), geolocation=(), payment=(self), usb=(), serial=(), hid=(), midi=(), magnetometer=(), gyroscope=(), accelerometer=(), display-capture=(), browsing-topics=()",
  },
  ...(isHttpsSite ? [{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" }] : []),
];

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  poweredByHeader: false,
  // The license PDF route reads bundled fonts from disk.
  outputFileTracingIncludes: {
    "/api/license/[purchaseId]": ["./src/assets/fonts/**"],
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  images: {
    remotePatterns: supabaseUrl
      ? [
          {
            protocol: supabaseUrl.protocol.replace(":", "") as "http" | "https",
            hostname: supabaseUrl.hostname,
            port: supabaseUrl.port,
            pathname: "/storage/v1/object/public/**",
          },
        ]
      : [],
    dangerouslyAllowLocalIP: isLocalSupabase,
    // Proxied media is same-origin; skip the optimiser in that mode.
    unoptimized: Boolean(supabaseProxyTarget),
    qualities: [75, 90],
  },
  // Preview proxy only: let large WAV/stems uploads pass through without truncation.
  ...(supabaseProxyTarget ? { experimental: { proxyClientMaxBodySize: "600mb" } } : {}),
  async rewrites() {
    return supabaseProxyTarget ? { beforeFiles: [{ source: "/sb/:path*", destination: `${supabaseProxyTarget}/:path*` }], afterFiles: [], fallback: [] } : [];
  },
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      // Pages get the CSP; API routes (JSON, PDF, redirects) don't need it.
      { source: "/((?!api/).*)", headers: [{ key: "Content-Security-Policy", value: contentSecurityPolicy }] },
    ];
  },
};

export default nextConfig;
