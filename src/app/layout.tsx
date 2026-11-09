import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, Schibsted_Grotesk } from "next/font/google";
import "./globals.css";
import { AppProviders } from "@/components/providers/app-providers";
import { Navbar } from "@/components/layout/navbar";
import { Footer } from "@/components/layout/footer";
import { CartDrawer } from "@/components/layout/cart-drawer";
import { PlayerBar } from "@/components/player/player-bar";
import { AudioEngine } from "@/components/player/audio-engine";
import { LicenseModalHost } from "@/components/beats/license-modal";
import { env } from "@/lib/env";
import { APPEARANCE_SCRIPT } from "@/lib/appearance";

const geist = Geist({ variable: "--font-geist", subsets: ["latin", "latin-ext"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });
// Headline font: a heavy, tightly spaced grotesk (variable weight 400–900).
const display = Schibsted_Grotesk({ variable: "--font-display-face", subsets: ["latin", "latin-ext"] });

export const metadata: Metadata = {
  metadataBase: new URL(env.siteUrl),
  title: { default: `${env.siteName} — Find Your Sound`, template: `%s · ${env.siteName}` },
  description: "Discover premium beats. Create without limits. License trap, drill, R&B, afrobeat and more from independent producers.",
  applicationName: env.siteName,
  openGraph: {
    type: "website",
    siteName: env.siteName,
    title: `${env.siteName} — Find Your Sound`,
    description: "Discover premium beats. Create without limits.",
  },
  twitter: { card: "summary_large_image" },
};

export const viewport: Viewport = {
  themeColor: "#050507",
  colorScheme: "dark",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geist.variable} ${geistMono.variable} ${display.variable}`}
      data-theme="dark"
      data-accent="purple"
      data-scroll-behavior="smooth"
      suppressHydrationWarning
    >
      <head>
        {/* Applies the saved theme and colour before the first paint (no flash, pages stay static). */}
        <script dangerouslySetInnerHTML={{ __html: APPEARANCE_SCRIPT }} />
      </head>
      <body className="grain min-h-dvh bg-ink-950 text-ink-50 antialiased">
        <div className="ambient" aria-hidden />
        <AppProviders>
          <Navbar />
          <main className="relative z-10 min-h-[70vh]">{children}</main>
          <Footer />
          <PlayerBar />
          <AudioEngine />
          <LicenseModalHost />
          <CartDrawer />
        </AppProviders>
      </body>
    </html>
  );
}
