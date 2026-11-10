import { env } from "./env";

export type PublicBucket = "avatars" | "covers" | "previews";

export function publicUrl(bucket: PublicBucket, path: string | null | undefined) {
  if (!path) return null;
  const encoded = path.split("/").map(encodeURIComponent).join("/");
  // In preview/tunnel mode media is served through the site's own origin.
  const base = env.supabaseBrowserPath || env.supabaseUrl;
  return `${base}/storage/v1/object/public/${bucket}/${encoded}`;
}

export const coverUrl = (path?: string | null) => publicUrl("covers", path);

/** Pack covers live in <producer>/packs/<pack>/ and can be shared by several beats. */
export const isPackCover = (path?: string | null) => !!path && path.split("/")[1] === "packs";
export const avatarUrl = (path?: string | null) => publicUrl("avatars", path);
export const previewUrl = (path?: string | null) => publicUrl("previews", path);

const MIME_BY_EXT: Record<string, string> = {
  mp3: "audio/mpeg",
  wav: "audio/wav",
  wave: "audio/wav",
  flac: "audio/flac",
  aif: "audio/aiff",
  aiff: "audio/aiff",
  ogg: "audio/ogg",
  m4a: "audio/mp4",
  aac: "audio/aac",
  zip: "application/zip",
  rar: "application/vnd.rar",
  "7z": "application/x-7z-compressed",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
};

export function extensionOf(name: string) {
  const m = /\.([a-z0-9]+)$/i.exec(name);
  return m ? m[1].toLowerCase() : "";
}

export function mimeFor(file: File) {
  return MIME_BY_EXT[extensionOf(file.name)] ?? (file.type || "application/octet-stream");
}
