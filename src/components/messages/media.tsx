"use client";

/* eslint-disable @next/next/no-img-element -- photos in messages come from short-lived private links, which the image optimiser can't fetch */

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AlertCircle, ExternalLink, ImageOff, LoaderCircle, Play, X } from "lucide-react";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import type { ChatAttachment } from "@/lib/messages";
import { cn } from "@/lib/utils";

// --------------------------------------------------------- private links ---
// Photos and videos are private: the browser gets links that work for two hours.
const LINK_SECONDS = 2 * 60 * 60;
const signed = new Map<string, { url: string; expires: number }>();
const inflight = new Map<string, Promise<void>>();

function fresh(path: string) {
  const s = signed.get(path);
  return s && s.expires - Date.now() > 10 * 60_000 ? s.url : null;
}

async function sign(paths: string[]) {
  const missing = [...new Set(paths)].filter((p) => !fresh(p) && !inflight.has(p));
  for (let i = 0; i < missing.length; i += 100) {
    const batch = missing.slice(i, i + 100);
    const job = getSupabaseBrowserClient()
      .storage.from("message-media")
      .createSignedUrls(batch, LINK_SECONDS)
      .then(({ data }) => {
        for (const row of data ?? []) {
          if (row.path && row.signedUrl && !row.error) signed.set(row.path, { url: row.signedUrl, expires: Date.now() + LINK_SECONDS * 1000 });
        }
      })
      .catch(() => {})
      .finally(() => batch.forEach((p) => inflight.delete(p)));
    batch.forEach((p) => inflight.set(p, job));
  }
  await Promise.all(paths.map((p) => inflight.get(p)).filter(Boolean));
}

/** Links for the photos and videos on screen (path → URL); paths without a link yet are missing. */
export function useMediaLinks(paths: string[]) {
  const key = [...new Set(paths)].sort().join("|");
  const [links, setLinks] = useState<Record<string, string>>({});
  useEffect(() => {
    if (!key) return;
    const list = key.split("|");
    let cancelled = false;
    void sign(list).then(() => {
      if (cancelled) return;
      setLinks((prev) => {
        const next = { ...prev };
        let changed = false;
        for (const p of list) {
          const url = fresh(p);
          if (url && next[p] !== url) {
            next[p] = url;
            changed = true;
          }
        }
        return changed ? next : prev;
      });
    });
    return () => {
      cancelled = true;
    };
  }, [key]);
  return links;
}

// ------------------------------------------------------------- in a message ---
function Tile({
  file,
  url,
  single,
  wide,
  onOpen,
}: {
  file: ChatAttachment;
  url: string | null;
  single: boolean;
  /** In a grid: takes the whole width (an odd photo out). */
  wide?: boolean;
  onOpen: () => void;
}) {
  const [broken, setBroken] = useState(false);
  const ratio = file.width && file.height ? Math.min(Math.max(file.width / file.height, 0.5), 2.2) : 1;
  const label = file.kind === "video" ? "Video" : "Photo";

  if (file.kind === "video") {
    return (
      <div className={cn("relative overflow-hidden rounded-2xl bg-black", single ? "w-[min(18rem,62vw)]" : "col-span-2")} style={{ aspectRatio: ratio }}>
        {url && !broken ? (
          <video
            src={url}
            controls
            playsInline
            preload="metadata"
            className="h-full w-full object-contain"
            onError={() => setBroken(true)}
            aria-label={file.name ? `Video: ${file.name}` : "Video"}
          />
        ) : (
          <div className="grid h-full w-full place-items-center text-ink-400">
            {broken ? <ImageOff className="h-6 w-6" /> : <Play className="h-7 w-7" />}
          </div>
        )}
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={onOpen}
      disabled={!url || broken}
      aria-label={`Open ${label.toLowerCase()}${file.name ? `: ${file.name}` : ""}`}
      className={cn(
        "relative block overflow-hidden rounded-2xl bg-white/[0.06] transition hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40",
        single ? "w-[min(17rem,60vw)]" : wide ? "col-span-2 aspect-[16/10] w-full" : "aspect-square w-full",
      )}
      style={single ? { aspectRatio: ratio } : undefined}
    >
      {url && !broken ? (
        <img src={url} alt={file.name ?? label} loading="lazy" decoding="async" onError={() => setBroken(true)} className="h-full w-full object-cover" />
      ) : (
        <span className="grid h-full w-full place-items-center text-ink-400">{broken ? <ImageOff className="h-6 w-6" /> : <span className="skeleton h-full w-full" />}</span>
      )}
    </button>
  );
}

/** The photos and videos of one message: one big, or a grid of two columns. */
export function MessageMedia({
  files,
  links,
  onOpen,
}: {
  files: ChatAttachment[];
  links: Record<string, string>;
  onOpen: (file: ChatAttachment, url: string) => void;
}) {
  const single = files.length === 1;
  // Photos pair up two by two; with an odd number, the first one is shown wide.
  const photos = files.filter((f) => f.kind === "image");
  const wide = !single && photos.length % 2 === 1 ? photos[0].path : null;
  return (
    <div className={cn(single ? "" : "grid w-[min(18rem,64vw)] grid-cols-2 gap-1")}>
      {files.map((f) => {
        const url = f.localUrl ?? links[f.path] ?? null;
        return <Tile key={f.path} file={f} url={url} single={single} wide={f.path === wide} onOpen={() => url && onOpen(f, url)} />;
      })}
    </div>
  );
}

/** A photo on its own over the page. */
export function MediaLightbox({ file, url, onClose }: { file: ChatAttachment; url: string; onClose: () => void }) {
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onCloseRef.current();
    document.addEventListener("keydown", onKey);
    const prev = document.documentElement.style.overflow;
    document.documentElement.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.documentElement.style.overflow = prev;
    };
  }, []);

  return createPortal(
    <div role="dialog" aria-modal="true" aria-label={file.name ?? "Photo"} className="fixed inset-0 z-[110] flex animate-fade-in flex-col bg-black/90 backdrop-blur-sm">
      <div className="flex items-center justify-end gap-1 p-3">
        {!file.localUrl && (
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="grid h-10 w-10 place-items-center rounded-full text-white/80 transition hover:bg-white/10 hover:text-white"
            aria-label="Open full size in a new tab"
            title="Open full size"
          >
            <ExternalLink className="h-5 w-5" />
          </a>
        )}
        <button
          type="button"
          onClick={onClose}
          autoFocus
          className="grid h-10 w-10 place-items-center rounded-full text-white/80 transition hover:bg-white/10 hover:text-white"
          aria-label="Close"
        >
          <X className="h-5 w-5" />
        </button>
      </div>
      <div className="flex min-h-0 flex-1 items-center justify-center px-3 pb-6" onClick={onClose}>
        <img src={url} alt={file.name ?? "Photo"} className="max-h-full max-w-full rounded-lg object-contain" onClick={(e) => e.stopPropagation()} />
      </div>
    </div>,
    document.body,
  );
}

// ---------------------------------------------------------- in the composer ---
export interface DraftFile {
  id: string;
  file: File;
  kind: "image" | "video";
  path: string;
  localUrl: string;
  progress: number;
  status: "uploading" | "done" | "failed";
  error?: string;
  width?: number;
  height?: number;
}

/** Picked photos and videos above the message box, with upload progress. */
export function DraftFiles({ files, onRemove }: { files: DraftFile[]; onRemove: (file: DraftFile) => void }) {
  if (!files.length) return null;
  return (
    <ul className="no-scrollbar flex gap-2 overflow-x-auto px-1 pb-2 pt-1" aria-label="Photos and videos to send">
      {files.map((f) => (
        <li key={f.id} className="relative h-16 w-16 shrink-0">
          <div className={cn("h-full w-full overflow-hidden rounded-xl bg-white/[0.06]", f.status === "failed" && "ring-2 ring-danger/70")}>
            {f.kind === "image" ? (
              <img src={f.localUrl} alt={f.file.name} className="h-full w-full object-cover" />
            ) : (
              <video src={f.localUrl} muted playsInline preload="metadata" className="h-full w-full object-cover" aria-label={f.file.name} />
            )}
          </div>
          {f.kind === "video" && f.status !== "uploading" && (
            <span className="pointer-events-none absolute bottom-1 left-1 grid h-5 w-5 place-items-center rounded-full bg-black/60 text-white">
              <Play className="h-3 w-3" />
            </span>
          )}
          {f.status === "uploading" && (
            <span className="absolute inset-0 grid place-items-center rounded-xl bg-black/45 text-[11px] font-semibold text-white" aria-label={`Uploading ${f.file.name}`}>
              {f.progress > 0.02 ? `${Math.round(f.progress * 100)}%` : <LoaderCircle className="h-4 w-4 animate-spin" />}
            </span>
          )}
          {f.status === "failed" && (
            <span className="absolute inset-0 grid place-items-center rounded-xl bg-black/55 text-danger" title={f.error}>
              <AlertCircle className="h-5 w-5" />
            </span>
          )}
          <button
            type="button"
            onClick={() => onRemove(f)}
            aria-label={`Remove ${f.file.name}`}
            className="absolute -right-1.5 -top-1.5 grid h-6 w-6 place-items-center rounded-full border-2 border-[var(--color-ink-900)] bg-ink-700 text-white shadow transition hover:bg-ink-600"
          >
            <X className="h-3 w-3" />
          </button>
        </li>
      ))}
    </ul>
  );
}
