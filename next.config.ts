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

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(self)" },
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
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
