"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { FileArchive, FileAudio, ImagePlus, Info, Music, Send, Sparkles, Waves } from "lucide-react";
import { toast } from "sonner";
import { FileSlot, MoodPicker, TagInput, TapTempo, type FileState } from "./form-parts";
import { LicenseEditor, suggestUsd } from "./license-editor";
import { Waveform } from "@/components/player/waveform";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Card } from "@/components/ui/misc";
import { Segmented } from "@/components/ui/controls";
import { saveBeat } from "@/actions/beats";
import { analyzeAudio } from "@/lib/audio-analysis";
import { buildPath, uploadResumable, uploadSmall, type Bucket } from "@/lib/upload";
import { coverUrl } from "@/lib/storage";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { formatDuration } from "@/lib/format";
import { BPM_MAX, BPM_MIN, DEFAULT_LICENSES, LICENSE_ORDER, NOTE_NAMES, type LicenseDraft, type PriceRates } from "@/lib/constants";
import type { BeatLicense, BeatRow } from "@/lib/types";
import { isPackCover } from "@/lib/storage";

type Kind = "cover" | "preview" | "mp3" | "wav" | "stems";

const SPEC: Record<Kind, { bucket: Bucket; accept: string; max: number; types: RegExp; label: string }> = {
  cover: { bucket: "covers", accept: "image/png,image/jpeg,image/webp", max: 10 * 1024 ** 2, types: /\.(png|jpe?g|webp)$/i, label: "Cover artwork" },
  preview: { bucket: "previews", accept: "audio/mpeg,audio/wav,audio/x-wav,.mp3,.wav,.m4a,.ogg", max: 50 * 1024 ** 2, types: /\.(mp3|wav|m4a|ogg|aac)$/i, label: "Preview" },
  mp3: { bucket: "beat-files", accept: "audio/mpeg,.mp3", max: 100 * 1024 ** 2, types: /\.mp3$/i, label: "MP3" },
  wav: { bucket: "beat-files", accept: "audio/wav,audio/x-wav,.wav,.aif,.aiff,.flac", max: 500 * 1024 ** 2, types: /\.(wav|aiff?|flac)$/i, label: "WAV" },
  stems: { bucket: "beat-files", accept: ".zip,.rar,.7z,application/zip", max: 500 * 1024 ** 2, types: /\.(zip|rar|7z)$/i, label: "Stems" },
};

export function mergeLicenses(saved: unknown, rates: PriceRates): LicenseDraft[] {
  const list = Array.isArray(saved) ? (saved as Partial<LicenseDraft>[]) : [];
  return LICENSE_ORDER.map((type) => {
    const base = DEFAULT_LICENSES.find((d) => d.type === type)!;
    const s = list.find((l) => l?.type === type);
    if (!s) return { ...base };
    // Defaults saved before USD existed have no dollar price yet: suggest one.
    const price_usd = typeof s.price_usd === "number" ? s.price_usd : suggestUsd(s.price_eur ?? base.price_eur, rates.usd);
    return { ...base, ...s, price_usd, terms: s.terms ?? "" };
  });
}

export interface BeatFormProps {
  producerId: string;
  beat?: BeatRow | null;
  licenses?: BeatLicense[];
  licenseDefaults?: unknown;
  genres: { slug: string; name: string }[];
  rates: PriceRates;
  canSelfPublish: boolean;
  isAdmin?: boolean;
  returnTo: string;
}

export function BeatForm({ producerId, beat, licenses: existingLicenses, licenseDefaults, genres, rates, canSelfPublish, isAdmin, returnTo }: BeatFormProps) {
  const router = useRouter();
  const [beatId] = useState(() => beat?.id ?? crypto.randomUUID());
  const [title, setTitle] = useState(beat?.title ?? "");
  const [genre, setGenre] = useState(beat?.genre ?? "");
  const [bpm, setBpm] = useState<number | "">(beat?.bpm ?? "");
  const [keyNote, setKeyNote] = useState<number>(beat?.key_note ?? 9);
  const [keyMode, setKeyMode] = useState<"major" | "minor">((beat?.key_mode as "major" | "minor") ?? "minor");
  const [moods, setMoods] = useState<string[]>(beat?.moods ?? []);
  const [tags, setTags] = useState<string[]>(beat?.tags ?? []);
  const [description, setDescription] = useState(beat?.description ?? "");
  const [waveform, setWaveform] = useState<number[] | null>(Array.isArray(beat?.waveform) ? (beat!.waveform as number[]) : null);
  const [duration, setDuration] = useState<number | null>(beat?.duration_seconds ?? null);
  const [analyzing, setAnalyzing] = useState(false);
  const [licenses, setLicenses] = useState<LicenseDraft[]>(() =>
    existingLicenses?.length
      ? mergeLicenses(
          LICENSE_ORDER.map((type) => {
            const l = existingLicenses.find((x) => x.type === type);
            return l ? { ...l, terms: l.terms ?? "" } : { ...DEFAULT_LICENSES.find((d) => d.type === type)!, enabled: false };
          }),
          rates,
        )
      : mergeLicenses(licenseDefaults, rates),
  );
  // Pre-checked only for a producer's first upload; afterwards saving defaults is opt-in.
  const [saveDefaults, setSaveDefaults] = useState(!beat && !Array.isArray(licenseDefaults));
  const [pending, startTransition] = useTransition();
  const [localCover, setLocalCover] = useState<string | null>(null);

  const initialFile = (kind: Kind, path: string | null | undefined): FileState | null =>
    path ? { status: "done", progress: 1, name: `Current ${SPEC[kind].label.toLowerCase()} file`, size: 0, path, existing: true } : null;

  const [files, setFiles] = useState<Record<Kind, FileState | null>>({
    cover: initialFile("cover", beat?.cover_path),
    preview: initialFile("preview", beat?.preview_path),
    mp3: initialFile("mp3", beat?.mp3_path),
    wav: initialFile("wav", beat?.wav_path),
    stems: initialFile("stems", beat?.stems_path),
  });
  const rawFiles = useRef<Partial<Record<Kind, File>>>({});
  const aborters = useRef<Partial<Record<Kind, AbortController>>>({});
  const replaced = useRef<{ bucket: Bucket; path: string }[]>([]);
  const dirty = useRef(false);

  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (dirty.current) e.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, []);

  const setFile = (kind: Kind, state: FileState | null) => setFiles((prev) => ({ ...prev, [kind]: state }));

  const discard = (kind: Kind) => {
    aborters.current[kind]?.abort();
    const current = files[kind];
    // A beat pack's cover is shared by the pack and its beats: never delete it from here.
    if (current?.path && !isPackCover(current.path)) {
      if (current.existing) replaced.current.push({ bucket: SPEC[kind].bucket, path: current.path });
      else getSupabaseBrowserClient().storage.from(SPEC[kind].bucket).remove([current.path]).then(() => undefined);
    }
  };

  const upload = async (kind: Kind, file: File) => {
    const spec = SPEC[kind];
    if (!spec.types.test(file.name)) return void toast.error(`Unsupported file type for ${spec.label}.`);
    if (file.size > spec.max) return void toast.error(`${spec.label} must be under ${Math.round(spec.max / 1024 ** 2)} MB.`);
    dirty.current = true;
    discard(kind);
    rawFiles.current[kind] = file;
    const controller = new AbortController();
    aborters.current[kind] = controller;
    setFile(kind, { status: "uploading", progress: 0, name: file.name, size: file.size, path: null });

    if (kind === "cover") setLocalCover(URL.createObjectURL(file));
    if (kind === "preview") {
      setAnalyzing(true);
      analyzeAudio(file)
        .then(({ peaks, duration: d }) => {
          setWaveform(peaks);
          setDuration(d);
        })
        .catch(() => toast.warning("Couldn't analyse this audio file", { description: "The beat will use a generic waveform." }))
        .finally(() => setAnalyzing(false));
    }

    const path = buildPath(producerId, beatId, kind, file);
    try {
      if (kind === "cover") await uploadSmall(spec.bucket, path, file);
      else await uploadResumable(spec.bucket, path, file, (p) => setFiles((prev) => (prev[kind] ? { ...prev, [kind]: { ...prev[kind]!, progress: p } } : prev)), controller.signal);
      if (controller.signal.aborted) return;
      setFile(kind, { status: "done", progress: 1, name: file.name, size: file.size, path });
    } catch (err) {
      if (controller.signal.aborted) return;
      setFile(kind, { status: "error", progress: 0, name: file.name, size: file.size, path: null, error: err instanceof Error ? err.message : "Upload failed" });
    }
  };

  const remove = (kind: Kind) => {
    dirty.current = true;
    discard(kind);
    delete rawFiles.current[kind];
    if (kind === "cover") setLocalCover(null);
    setFile(kind, null);
  };

  const available = { mp3: files.mp3?.status === "done", wav: files.wav?.status === "done", stems: files.stems?.status === "done" };
  const uploading = Object.values(files).some((f) => f?.status === "uploading");
  const isPublished = beat?.status === "published";

  const problems = useMemo(() => {
    const p: string[] = [];
    if (files.preview?.status !== "done") p.push("Upload a preview audio file.");
    const enabled = licenses.filter((l) => l.enabled);
    if (!enabled.length) p.push("Enable at least one license.");
    for (const l of enabled) {
      if (l.type !== "free" && (l.price_eur < 50 || l.price_pln < 200 || l.price_usd < 50)) p.push(`Set a price for ${l.name} (min €0.50 / 2 zł / $0.50).`);
      if (l.type === "free") continue;
      if (l.includes_mp3 && !available.mp3) p.push(`${l.name} needs the MP3 file.`);
      if (l.includes_wav && !available.wav) p.push(`${l.name} needs the WAV file.`);
      if (l.includes_stems && !available.stems) p.push(`${l.name} needs the stems file.`);
    }
    return [...new Set(p)];
  }, [files.preview, licenses, available.mp3, available.wav, available.stems]);

  const submit = (status: "draft" | "pending" | "published") => {
    if (!title.trim()) return void toast.error("Give your beat a title.");
    if (!genre) return void toast.error("Choose a genre.");
    if (bpm === "" || bpm < BPM_MIN || bpm > BPM_MAX) return void toast.error(`BPM must be between ${BPM_MIN} and ${BPM_MAX}.`);
    if (uploading) return void toast.error("Please wait for uploads to finish.");
    if (status !== "draft" && problems.length) return void toast.error("Almost there", { description: problems[0] });

    startTransition(async () => {
      const res = await saveBeat({
        beat: {
          id: beatId,
          title: title.trim(),
          description,
          genre,
          moods,
          tags,
          bpm: Number(bpm),
          key_note: keyNote,
          key_mode: keyMode,
          cover_path: files.cover?.path ?? null,
          preview_path: files.preview?.path ?? null,
          mp3_path: files.mp3?.path ?? null,
          wav_path: files.wav?.path ?? null,
          stems_path: files.stems?.path ?? null,
          duration_seconds: duration,
          waveform,
        },
        licenses: licenses.map((l) => ({ ...l, terms: l.terms ?? "" })),
        status,
        saveDefaults,
      });
      if (!res.ok) return void toast.error("Couldn't save the beat", { description: res.error });

      // Clean up files that were replaced in this edit.
      const byBucket = new Map<Bucket, string[]>();
      for (const r of replaced.current) byBucket.set(r.bucket, [...(byBucket.get(r.bucket) ?? []), r.path]);
      await Promise.all([...byBucket].map(([b, paths]) => getSupabaseBrowserClient().storage.from(b).remove(paths)));
      replaced.current = [];
      dirty.current = false;

      const s = res.data.status;
      toast.success(
        s === "published" ? "Beat published — it's live in the marketplace" : s === "pending" ? "Submitted for review" : "Draft saved",
        { description: s === "pending" ? "You'll see it go live once an admin approves it." : undefined },
      );
      router.push(returnTo);
      router.refresh();
    });
  };

  const coverSrc = localCover ?? coverUrl(files.cover?.path);

  return (
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
      <div className="space-y-6">
        <Card className="p-5 md:p-6">
          <h2 className="mb-1 font-display text-lg font-bold">Audio & artwork</h2>
          <p className="mb-5 text-sm text-ink-400">Large files upload in resumable chunks — you can keep filling in details while they upload.</p>
          <div className="grid grid-cols-1 gap-3">
            <FileSlot
              label="Cover artwork"
              hint="Square JPG/PNG/WEBP, at least 1000×1000 px, max 10 MB."
              accept={SPEC.cover.accept}
              icon={<ImagePlus className="h-5 w-5" />}
              preview={coverSrc ? <Image src={coverSrc} alt="" width={44} height={44} className="h-full w-full object-cover" unoptimized={!!localCover} /> : undefined}
              state={files.cover}
              onSelect={(f) => upload("cover", f)}
              onRemove={() => remove("cover")}
            />
            <FileSlot
              label="Preview (tagged)"
              hint="Streamed publicly on the marketplace. Use a tagged MP3 so it can't be ripped. Max 50 MB."
              accept={SPEC.preview.accept}
              icon={<Waves className="h-5 w-5" />}
              state={files.preview}
              required
              onSelect={(f) => upload("preview", f)}
              onRemove={() => remove("preview")}
              extra={
                !files.preview && rawFiles.current.mp3 ? (
                  <button type="button" onClick={() => upload("preview", rawFiles.current.mp3!)} className="self-start text-xs text-accent-300 underline-offset-4 hover:underline">
                    Use my untagged MP3 as the public preview
                  </button>
                ) : null
              }
            />
            <div className="grid grid-cols-1 gap-3">
              <FileSlot label="MP3 (untagged)" hint="Delivered with Basic and higher." accept={SPEC.mp3.accept} icon={<FileAudio className="h-5 w-5" />} state={files.mp3} onSelect={(f) => upload("mp3", f)} onRemove={() => remove("mp3")} />
              <FileSlot label="WAV" hint="Delivered with Premium and higher." accept={SPEC.wav.accept} icon={<Music className="h-5 w-5" />} state={files.wav} onSelect={(f) => upload("wav", f)} onRemove={() => remove("wav")} />
              <FileSlot label="Stems (ZIP)" hint="Track-outs for Trackout+." accept={SPEC.stems.accept} icon={<FileArchive className="h-5 w-5" />} state={files.stems} onSelect={(f) => upload("stems", f)} onRemove={() => remove("stems")} />
            </div>
          </div>
          {(waveform || analyzing) && (
            <div className="mt-5 rounded-2xl border border-white/[0.06] bg-white/[0.02] p-4">
              <div className="mb-2 flex items-center justify-between font-mono text-[11px] uppercase tracking-wider text-ink-400">
                <span>{analyzing ? "Analysing audio…" : "Waveform"}</span>
                {duration != null && <span>{formatDuration(duration)}</span>}
              </div>
              {waveform && <Waveform beatId={`draft-${beatId}`} peaks={waveform} duration={duration} interactive={false} height={48} bars={120} />}
            </div>
          )}
        </Card>

        <Card className="p-5 md:p-6">
          <h2 className="mb-5 font-display text-lg font-bold">Details</h2>
          <div className="grid gap-5 md:grid-cols-2">
            <Field label="Beat title" htmlFor="title" className="md:col-span-2">
              <Input id="title" value={title} onChange={(e) => { dirty.current = true; setTitle(e.target.value); }} maxLength={100} placeholder="e.g. Midnight Run" />
            </Field>
            <Field label="Genre" htmlFor="genre">
              <Select
                id="genre"
                value={genre}
                onChange={setGenre}
                placeholder="Select a genre"
                options={genres.map((g) => ({ value: g.slug, label: g.name }))}
              />
            </Field>
            <Field label="Tempo (BPM)" htmlFor="bpm" hint={`${BPM_MIN}–${BPM_MAX}. Not sure? Tap along.`}>
              <div className="flex gap-2">
                <Input id="bpm" type="number" inputMode="numeric" min={BPM_MIN} max={BPM_MAX} value={bpm} onChange={(e) => setBpm(e.target.value === "" ? "" : Math.round(Number(e.target.value)))} placeholder="140" />
                <TapTempo onBpm={(b) => setBpm(b)} />
              </div>
            </Field>
            <Field label="Key" htmlFor="key" className="md:col-span-2" hint="Buyers filter by relative major/minor pairs, e.g. A Minor matches C Major / A Minor.">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <div className="flex flex-wrap gap-1.5">
                  {NOTE_NAMES.map((n, i) => (
                    <button
                      key={n}
                      type="button"
                      onClick={() => setKeyNote(i)}
                      className={`h-10 w-11 rounded-xl border font-mono text-sm transition ${keyNote === i ? "border-white bg-white text-ink-950" : "border-white/[0.08] text-ink-200 hover:border-white/25"}`}
                      aria-pressed={keyNote === i}
                    >
                      {n}
                    </button>
                  ))}
                </div>
                <Segmented<"major" | "minor"> value={keyMode} onChange={setKeyMode} options={[{ value: "minor", label: "Minor" }, { value: "major", label: "Major" }]} />
              </div>
            </Field>
            <Field label="Mood" className="md:col-span-2" hint="Pick what fits, or type your own words (e.g. dreamy, late night) and press Enter. Up to 8.">
              <MoodPicker value={moods} onChange={setMoods} />
            </Field>
            <Field label="Tags" className="md:col-span-2" hint="Up to 12. Press Enter or comma to add. Tags power search.">
              <TagInput value={tags} onChange={setTags} />
            </Field>
            <Field label="Description" htmlFor="description" className="md:col-span-2" optional hint={`${description.length}/5000`}>
              <Textarea id="description" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={5000} rows={5} placeholder="Inspiration, instruments, what artists it suits…" />
            </Field>
          </div>
        </Card>

        <Card className="p-5 md:p-6">
          <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="font-display text-lg font-bold">Licenses & pricing</h2>
              <p className="mt-1 text-sm text-ink-400">
                PLN and USD prices are suggested from EUR (€1 ≈ {rates.pln.toFixed(2)} zł ≈ ${rates.usd.toFixed(2)}) — override any of them.
              </p>
            </div>
            <label className="flex cursor-pointer items-center gap-2 text-sm text-ink-300">
              <input type="checkbox" checked={saveDefaults} onChange={(e) => setSaveDefaults(e.target.checked)} className="h-4 w-4 accent-[var(--color-accent)]" />
              Save as my default licenses
            </label>
          </div>
          <LicenseEditor licenses={licenses} onChange={setLicenses} rates={rates} available={available} />
        </Card>
      </div>

      <aside className="space-y-4 xl:sticky xl:top-24 xl:self-start">
        <Card className="p-5">
          <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-ink-400">Publishing</p>
          <p className="mt-2 text-sm text-ink-200">
            {canSelfPublish
              ? isPublished
                ? "This beat is live. Changes are visible immediately after saving."
                : "Publishing makes this beat instantly visible in the marketplace."
              : "New beats are reviewed by the team before they appear in the marketplace."}
          </p>
          {problems.length > 0 && (
            <ul className="mt-4 space-y-1.5 rounded-xl border border-white/[0.06] bg-white/[0.02] p-3 text-xs text-ink-300">
              {problems.map((p) => (
                <li key={p} className="flex gap-2">
                  <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning" /> {p}
                </li>
              ))}
            </ul>
          )}
          <div className="mt-5 grid gap-2">
            {canSelfPublish ? (
              <Button size="lg" onClick={() => submit("published")} loading={pending} disabled={uploading}>
                <Sparkles className="h-4 w-4" /> {isPublished ? "Save changes" : "Publish beat"}
              </Button>
            ) : (
              <Button size="lg" onClick={() => submit("pending")} loading={pending} disabled={uploading}>
                <Send className="h-4 w-4" /> {beat?.status === "pending" ? "Update submission" : "Submit for review"}
              </Button>
            )}
            <Button variant="secondary" onClick={() => submit("draft")} disabled={pending || uploading}>
              {isPublished ? "Unpublish & save as draft" : "Save draft"}
            </Button>
          </div>
          {uploading && <p className="mt-3 text-center text-xs text-ink-400">Waiting for uploads to finish…</p>}
          {beat?.status === "rejected" && beat.rejection_reason && (
            <div className="mt-4 rounded-xl border border-danger/30 bg-danger/10 p-3 text-xs text-danger">
              <strong className="block">Rejected by an admin:</strong> {beat.rejection_reason}
            </div>
          )}
        </Card>
      </aside>
    </div>
  );
}
