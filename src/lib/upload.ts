"use client";

import * as tus from "tus-js-client";
import { getSupabaseBrowserClient } from "./supabase/client";
import { browserSupabaseUrl, env } from "./env";
import { extensionOf, mimeFor } from "./storage";

export type Bucket = "avatars" | "covers" | "previews" | "beat-files";

export function buildPath(userId: string, scope: string, kind: string, file: File) {
  const ext = extensionOf(file.name) || "bin";
  const stamp = Date.now().toString(36);
  return `${userId}/${scope}${scope ? "/" : ""}${kind}-${stamp}.${ext}`;
}

/** Simple upload for small files (images). */
export async function uploadSmall(bucket: Bucket, path: string, file: File) {
  const { error } = await getSupabaseBrowserClient().storage.from(bucket).upload(path, file, {
    contentType: mimeFor(file),
    cacheControl: "31536000",
    upsert: false,
  });
  if (error) throw new Error(error.message);
  return path;
}

/**
 * Single-request upload with progress (XHR). Used when the browser reaches
 * Supabase through the same-origin preview proxy, where TUS follow-up URLs
 * (absolute, pointing at the Supabase host) would not be reachable.
 */
function uploadViaXhr(bucket: Bucket, path: string, file: File, token: string, onProgress?: (f: number) => void, signal?: AbortSignal) {
  return new Promise<string>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const encoded = path.split("/").map(encodeURIComponent).join("/");
    xhr.open("POST", `${browserSupabaseUrl()}/storage/v1/object/${bucket}/${encoded}`);
    xhr.setRequestHeader("authorization", `Bearer ${token}`);
    xhr.setRequestHeader("apikey", env.supabaseKey);
    xhr.setRequestHeader("x-upsert", "false");
    xhr.setRequestHeader("cache-control", "3600");
    xhr.setRequestHeader("content-type", mimeFor(file));
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress?.(e.loaded / e.total);
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) return resolve(path);
      let message = `Upload failed (${xhr.status})`;
      try {
        message = JSON.parse(xhr.responseText).message ?? message;
      } catch {}
      reject(new Error(/maximum allowed size|too large/i.test(message) ? "This file is larger than your storage upload limit." : message));
    };
    xhr.onerror = () => reject(new Error("Network error during upload"));
    signal?.addEventListener("abort", () => {
      xhr.abort();
      reject(new Error("Upload cancelled"));
    });
    xhr.send(file);
  });
}

/**
 * Resumable (TUS) upload with progress — used for large audio / stems files.
 * Chunks are 6 MB, as required by Supabase Storage.
 */
export async function uploadResumable(
  bucket: Bucket,
  path: string,
  file: File,
  onProgress?: (fraction: number) => void,
  signal?: AbortSignal,
): Promise<string> {
  const supabase = getSupabaseBrowserClient();
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("Your session expired — please sign in again.");
  if (env.supabaseBrowserPath) return uploadViaXhr(bucket, path, file, token, onProgress, signal);

  return new Promise<string>((resolve, reject) => {
    const upload = new tus.Upload(file, {
      endpoint: `${env.supabaseUrl}/storage/v1/upload/resumable`,
      retryDelays: [0, 2000, 5000, 10000, 20000],
      headers: { authorization: `Bearer ${token}`, apikey: env.supabaseKey, "x-upsert": "false" },
      uploadDataDuringCreation: true,
      removeFingerprintOnSuccess: true,
      metadata: {
        bucketName: bucket,
        objectName: path,
        contentType: mimeFor(file),
        cacheControl: "3600",
      },
      chunkSize: 6 * 1024 * 1024,
      onError: (err) => {
        const body = (err as tus.DetailedError).originalResponse?.getBody?.();
        let message = err.message;
        try {
          const parsed = body ? JSON.parse(body) : null;
          if (parsed?.message) message = parsed.message;
        } catch {}
        reject(new Error(/maximum allowed size|Payload too large/i.test(message) ? "This file is larger than your storage upload limit." : message));
      },
      onProgress: (sent, total) => onProgress?.(total ? sent / total : 0),
      onSuccess: () => resolve(path),
    });
    signal?.addEventListener("abort", () => {
      upload.abort(true);
      reject(new Error("Upload cancelled"));
    });
    upload.start();
  });
}
