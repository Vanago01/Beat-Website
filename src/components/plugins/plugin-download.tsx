"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Check, CircleAlert, Download, LockKeyhole } from "lucide-react";
import { useAuth } from "@/components/providers/auth-provider";
import { buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/misc";
import { formatFileSize, PLATFORM_LABEL, PLUGIN_PLATFORMS, type PluginDownloadInfo, type PluginPlatform } from "@/lib/plugin-files";

type Files = Partial<Record<PluginPlatform, PluginDownloadInfo>>;

/** The system the visitor is on, to put its button first. Phones and tablets: none. */
function ownPlatform(): PluginPlatform | null {
  const agent = navigator.userAgent;
  if (/iPhone|iPad|Android/i.test(agent)) return null;
  if (/Windows/i.test(agent)) return "windows";
  if (/Macintosh|Mac OS X/i.test(agent)) return "macos";
  return null;
}

function fileLine(file: PluginDownloadInfo | undefined) {
  if (!file) return "Coming soon";
  return [`Version ${file.version}`, formatFileSize(file.size)].filter(Boolean).join(" · ");
}

/**
 * Download buttons of a plug-in. Members get the files; visitors are asked to sign in
 * first and come straight back here. The check itself is made on the server
 * (/api/plugins/<plugin>/download) - this only decides what to show.
 */
export function PluginDownload({ plugin, files }: { plugin: string; files: Files }) {
  const { user, loading } = useAuth();
  // set by the download address when it could not hand out the file
  const failed = useSearchParams().get("download") === "failed";
  const [own, setOwn] = useState<PluginPlatform | null>(null);
  const [started, setStarted] = useState<PluginPlatform | null>(null);

  useEffect(() => {
    setOwn(ownPlatform());
  }, []);

  const page = `/plugins/${plugin}`;
  const next = encodeURIComponent(page);
  // the visitor's own system first
  const platforms = [...PLUGIN_PLATFORMS].sort((a, b) => Number(b === own) - Number(a === own));
  const available = PLUGIN_PLATFORMS.some((platform) => files[platform]);

  if (loading) {
    return (
      <div className="grid gap-3" aria-busy>
        <Skeleton className="h-14 rounded-full" />
        <Skeleton className="h-14 rounded-full" />
      </div>
    );
  }

  if (!user) {
    return (
      <div>
        <Link href={`/login?next=${next}`} className={buttonVariants({ variant: "accent", size: "xl", className: "w-full" })}>
          <LockKeyhole className="h-[18px] w-[18px]" aria-hidden />
          Sign in to download
        </Link>
        <p className="mt-4 text-center text-sm text-ink-300">
          No account yet?{" "}
          <Link href={`/register?next=${next}`} className="text-white underline-offset-4 hover:underline">
            Create one - it&apos;s free
          </Link>
        </p>
        <dl className="mt-6 grid gap-2 border-t border-white/[0.07] pt-5 text-sm">
          {PLUGIN_PLATFORMS.map((platform) => (
            <div key={platform} className="flex items-baseline justify-between gap-4">
              <dt className="text-ink-200">{PLATFORM_LABEL[platform]}</dt>
              <dd className="font-mono text-xs text-ink-400">{fileLine(files[platform])}</dd>
            </div>
          ))}
        </dl>
      </div>
    );
  }

  return (
    <div>
      <div className="grid gap-3">
        {platforms.map((platform, index) => {
          const file = files[platform];
          const label = `Download for ${PLATFORM_LABEL[platform]}`;
          const body = (
            <>
              <Download className="h-[18px] w-[18px] shrink-0" aria-hidden />
              <span className="flex flex-col items-start leading-tight">
                <span>{label}</span>
                <span className="font-mono text-[11px] font-normal opacity-70">{fileLine(file)}</span>
              </span>
            </>
          );
          const className = buttonVariants({
            variant: index === 0 && available ? "accent" : "secondary",
            size: "xl",
            className: "h-16 w-full justify-start px-7",
          });

          return file ? (
            // A plain link, not a client-side navigation: the server answers with the file.
            <a key={platform} href={`/api/plugins/${plugin}/download?platform=${platform}`} rel="nofollow" className={className} onClick={() => setStarted(platform)}>
              {body}
            </a>
          ) : (
            <span key={platform} aria-disabled className={`${className} pointer-events-none opacity-45`}>
              {body}
            </span>
          );
        })}
      </div>
      <p className="mt-4 flex min-h-5 items-center justify-center gap-2 text-center text-sm text-ink-300" aria-live="polite">
        {started ? (
          <>
            <Check className="h-4 w-4 text-success" aria-hidden />
            Your {PLATFORM_LABEL[started]} download is starting. The steps to install it are below.
          </>
        ) : failed ? (
          <>
            <CircleAlert className="h-4 w-4 shrink-0 text-warning" aria-hidden />
            That download could not be prepared. Please try again in a minute.
          </>
        ) : available ? (
          "Free for members. Use it in any music, commercial or not."
        ) : (
          "The installers are on their way. Check back soon."
        )}
      </p>
    </div>
  );
}
