import type { MetadataRoute } from "next";
import { env } from "@/lib/env";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: ["/admin", "/dashboard", "/account", "/checkout", "/cart", "/api", "/auth"] }],
    sitemap: `${env.siteUrl}/sitemap.xml`,
  };
}
