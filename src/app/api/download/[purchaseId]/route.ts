import { NextResponse, type NextRequest } from "next/server";
import { getOwnedPurchase } from "@/lib/purchase-access";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { extensionOf } from "@/lib/storage";
import { keyName } from "@/lib/format";

const FILES = {
  preview: { label: "Tagged", bucket: "previews", column: "preview_path" },
  mp3: { label: "MP3", bucket: "beat-files", column: "mp3_path" },
  wav: { label: "WAV", bucket: "beat-files", column: "wav_path" },
  stems: { label: "Stems", bucket: "beat-files", column: "stems_path" },
} as const;

type FileKind = keyof typeof FILES;

function sanitize(name: string) {
  return name.replace(/[\\/:*?"<>|]+/g, "").replace(/\s+/g, " ").trim().slice(0, 150);
}

/** Issues a 60-second signed URL for a purchased file after verifying ownership. */
export async function GET(request: NextRequest, ctx: RouteContext<"/api/download/[purchaseId]">) {
  const { purchaseId } = await ctx.params;
  const kind = request.nextUrl.searchParams.get("file") as FileKind | null;
  if (!kind || !(kind in FILES)) return NextResponse.json({ error: "Unknown file type" }, { status: 400 });

  const access = await getOwnedPurchase(purchaseId);
  if (access.status === 401) {
    return NextResponse.redirect(new URL(`/login?next=${encodeURIComponent("/account/library")}`, request.url));
  }
  if (access.status !== 200) {
    return NextResponse.json({ error: access.status === 403 ? "This license was refunded." : "Not found" }, { status: access.status });
  }
  const { purchase } = access;

  const allowed =
    kind === "preview"
      ? purchase.license_type === "free"
      : kind === "mp3"
        ? purchase.includes_mp3
        : kind === "wav"
          ? purchase.includes_wav
          : purchase.includes_stems;
  if (!allowed) return NextResponse.json({ error: "Your license does not include this file." }, { status: 403 });

  const admin = createSupabaseAdminClient();
  const spec = FILES[kind];
  const { data: beat } = await admin
    .from("beats")
    .select("title, bpm, key_note, key_mode, preview_path, mp3_path, wav_path, stems_path, producer:profiles!beats_producer_id_fkey(username, producer_name, display_name)")
    .eq("id", purchase.beat_id)
    .single();
  const path = beat?.[spec.column];
  if (!beat || !path) {
    return NextResponse.json({ error: "This file is not available yet. Please contact the producer." }, { status: 404 });
  }

  const producer = beat.producer as unknown as { username: string; producer_name: string | null; display_name: string | null } | null;
  const producerName = producer?.producer_name || producer?.display_name || producer?.username || "Producer";
  const filename = sanitize(
    `${beat.title} (prod. ${producerName}) [${beat.bpm} BPM ${keyName(beat.key_note, beat.key_mode)}] - ${spec.label}.${extensionOf(path) || "bin"}`,
  );

  const { data: signed, error } = await admin.storage.from(spec.bucket).createSignedUrl(path, 60, { download: filename });
  if (error || !signed) return NextResponse.json({ error: "Could not prepare the download." }, { status: 500 });

  const res = NextResponse.redirect(signed.signedUrl, 302);
  res.headers.set("Cache-Control", "private, no-store");
  return res;
}
