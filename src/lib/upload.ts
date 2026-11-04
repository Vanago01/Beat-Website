"use client";

import * as tus from "tus-js-client";
import { getSupabaseBrowserClient } from "./supabase/client";
import { browserSupabaseUrl, env } from "./env";
import { extensionOf, mimeFor } from "./storage";

const megabytes = (bytes: number) => `${(bytes / (1024 * 1024)).toFixed(1)} MB`;

/**
 * Turns storage errors into something a producer can act on. Supabase answers
 * an oversized upload with HTTP 413 ("Maximum size exceeded" for the project
 * limit, "...maximum allowed size" for a bucket limit).
 */
function friendlyUploadError(message: string, status: number | undefined, file: File) {
  if (status === 413 || /maximum (allowed )?size|size exceeded|payload too large|entity too large/i.test(message)) {
    return `This file (${megabytes(file.size)}) is bigger than the upload limit. Export a smaller file — for example a 16-bit WAV — or ask the site owner to raise the limit.`;
  }
  return message;
}

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
      reject(new Error(friendlyUploadError(message, xhr.status, file)));
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
        const response = (err as tus.DetailedError).originalResponse;
        const body = response?.getBody?.();
        // tus wraps the server's answer in a long technical sentence — keep just the answer.
        let message = /response text: (.*?)(?:, request id|\)$|$)/.exec(err.message)?.[1]?.trim() || err.message;
        try {
          const parsed = body ? JSON.parse(body) : null;
          if (parsed?.message) message = parsed.message;
        } catch {}
        reject(new Error(friendlyUploadError(message, response?.getStatus?.(), file)));
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
