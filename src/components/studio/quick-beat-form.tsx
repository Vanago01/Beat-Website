"use client";

import { useEffect, useRef, useState } from "react";
import { FileArchive, FileAudio, Info, Music, Waves } from "lucide-react";
import { toast } from "sonner";
import { FileSlot, TapTempo, type FileState } from "./form-parts";
import { mergeLicenses } from "./beat-form";
import { LicenseEditor, beatLicenseProblems } from "./license-editor";
import { toBeatPrices } from "./beat-prices";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Segmented } from "@/components/ui/controls";
import { saveBeat } from "@/actions/beats";
import { analyzeAudio } from "@/lib/audio-analysis";
import { buildPath, uploadResumable, type Bucket } from "@/lib/upload";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { BPM_MAX, BPM_MIN, NOTE_NAMES, type LicenseDraft, type PriceRates } from "@/lib/constants";
import type { PackBeat } from "./pack-form";

type Kind = "preview" | "mp3" | "wav" | "stems";

const SPEC: Record<Kind, { bucket: Bucket; accept: string; max: number; types: RegExp; label: string }> = {
  preview: { bucket: "previews", accept: "audio/mpeg,audio/wav,audio/x-wav,.mp3,.wav,.m4a,.ogg", max: 50 * 1024 ** 2, types: /\.(mp3|wav|m4a|ogg|aac)$/i, label: "Preview" },
  mp3: { bucket: "beat-files", accept: "audio/mpeg,.mp3", max: 100 * 1024 ** 2, types: /\.mp3$/i, label: "MP3" },
  wav: { bucket: "beat-files", accept: "audio/wav,audio/x-wav,.wav,.aif,.aiff,.flac", max: 500 * 1024 ** 2, types: /\.(wav|aiff?|flac)$/i, label: "WAV" },
  stems: { bucket: "beat-files", accept: ".zip,.rar,.7z,application/zip", max: 500 * 1024 ** 2, types: /\.(zip|rar|7z)$/i, label: "Stems" },
};

/**
 * Uploads one new beat for a pack: title, genre, tempo, key, files and its
 * own prices and free download (prefilled with the producer's usual
 * licenses). It gets the pack's cover and is saved as a draft that goes live
 * with the pack. Everything else can be edited later like any beat.
 */
export function QuickBeatForm({
  producerId,
  genres,
  coverPath,
  licenseDefaults,
  rates,
  onCreated,
  onCancel,
}: {
  producerId: string;
  genres: { slug: string; name: string }[];
  coverPath: string | null;
  licenseDefaults: unknown;
  rates: PriceRates;
  onCreated: (beat: PackBeat) => void;
  onCancel: () => void;
}) {
  const [beatId] = useState(() => crypto.randomUUID());
  const [title, setTitle] = useState("");
  const [genre, setGenre] = useState("");
  const [bpm, setBpm] = useState<number | "">("");
  const [keyNote, setKeyNote] = useState(9);
  const [keyMode, setKeyMode] = useState<"major" | "minor">("minor");
  const [files, setFiles] = useState<Partial<Record<Kind, FileState | null>>>({});
  const [waveform, setWaveform] = useState<number[] | null>(null);
  const [duration, setDuration] = useState<number | null>(null);
  const [licenses, setLicenses] = useState<LicenseDraft[]>(() => mergeLicenses(licenseDefaults, rates));
  // License switches the producer flipped themselves. The others follow the
  // files: a license that needs a WAV or stems stays off until they're uploaded.
  const [flipped, setFlipped] = useState<ReadonlySet<string>>(() => new Set());
  const [saving, setSaving] = useState(false);
  const aborters = useRef<Partial<Record<Kind, AbortController>>>({});
  const raw = useRef<Partial<Record<Kind, File>>>({});
  const saved = useRef(false);

  // Closing without saving removes what was uploaded for this beat.
  const filesRef = useRef(files);
  useEffect(() => {
    filesRef.current = files;
  }, [files]);
  useEffect(
    () => () => {
      if (saved.current) return;
      for (const [kind, f] of Object.entries(filesRef.current)) {
        aborters.current[kind as Kind]?.abort();
        if (f?.path) void getSupabaseBrowserClient().storage.from(SPEC[kind as Kind].bucket).remove([f.path]);
      }
    },
    [],
  );

  const setFile = (kind: Kind, state: FileState | null) => setFiles((prev) => ({ ...prev, [kind]: state }));

  const discard = (kind: Kind) => {
    aborters.current[kind]?.abort();
    const current = files[kind];
    if (current?.path) void getSupabaseBrowserClient().storage.from(SPEC[kind].bucket).remove([current.path]);
  };

  const upload = async (kind: Kind, file: File) => {
    const spec = SPEC[kind];
    if (!spec.types.test(file.name)) return void toast.error(`Unsupported file type for ${spec.label}.`);
    if (file.size > spec.max) return void toast.error(`${spec.label} must be under ${Math.round(spec.max / 1024 ** 2)} MB.`);
    discard(kind);
    raw.current[kind] = file;
    if (!title.trim() && kind !== "stems") setTitle(file.name.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").trim().slice(0, 100));
    const controller = new AbortController();
    aborters.current[kind] = controller;
    setFile(kind, { status: "uploading", progress: 0, name: file.name, size: file.size, path: null });
    if (kind === "preview") {
      analyzeAudio(file)
        .then(({ peaks, duration: d }) => {
          setWaveform(peaks);
          setDuration(d);
        })
        .catch(() => undefined);
    }
    const path = buildPath(producerId, beatId, kind, file);
    try {
      await uploadResumable(spec.bucket, path, file, (p) => setFiles((prev) => (prev[kind] ? { ...prev, [kind]: { ...prev[kind]!, progress: p } } : prev)), controller.signal);
      if (controller.signal.aborted) return;
      setFile(kind, { status: "done", progress: 1, name: file.name, size: file.size, path });
    } catch (err) {
      if (controller.signal.aborted) return;
      setFile(kind, { status: "error", progress: 0, name: file.name, size: file.size, path: null, error: err instanceof Error ? err.message : "Upload failed" });
    }
  };

  const remove = (kind: Kind) => {
    discard(kind);
    delete raw.current[kind];
    setFile(kind, null);
  };

  const done = (kind: Kind) => files[kind]?.status === "done" && !!files[kind]?.path;
  const uploading = Object.values(files).some((f) => f?.status === "uploading");
  const has = { mp3: done("mp3"), wav: done("wav"), stems: done("stems") };
  const fits = (l: LicenseDraft) => (!l.includes_mp3 || has.mp3) && (!l.includes_wav || has.wav) && (!l.includes_stems || has.stems);
  const shown = licenses.map((l) => (l.type === "free" || flipped.has(l.type) ? l : { ...l, enabled: l.enabled && fits(l) }));
  const changeLicenses = (next: LicenseDraft[]) => {
    const now = next.filter((l, i) => l.enabled !== shown[i]?.enabled).map((l) => l.type);
    const all = now.length ? new Set([...flipped, ...now]) : flipped;
    if (now.length) setFlipped(all);
    // Untouched switches keep the producer's usual setting, so they come on once the files are in.
    setLicenses(next.map((l, i) => (all.has(l.type) ? l : { ...l, enabled: licenses[i].enabled })));
  };
  const licenseProblems = beatLicenseProblems(shown, has);

  const save = async () => {
    const problem =
      !title.trim()
        ? "Give the beat a title."
        : !genre
          ? "Choose a genre."
          : bpm === "" || bpm < BPM_MIN || bpm > BPM_MAX
            ? `Set the tempo (${BPM_MIN}–${BPM_MAX} BPM).`
            : !done("preview")
              ? "Upload the public preview."
              : !done("mp3")
                ? "Upload the untagged MP3 (every pack license includes it)."
                : uploading
                  ? "Wait for the uploads to finish."
                  : (licenseProblems[0] ?? null);
    if (problem) return void toast.error(problem);

    setSaving(true);
    const res = await saveBeat({
      beat: {
        id: beatId,
        title: title.trim(),
        description: "",
        genre,
        moods: [],
        tags: [],
        bpm: Number(bpm),
        key_note: keyNote,
        key_mode: keyMode,
        cover_path: coverPath,
        preview_path: files.preview?.path ?? null,
        mp3_path: files.mp3?.path ?? null,
        wav_path: files.wav?.path ?? null,
        stems_path: files.stems?.path ?? null,
        duration_seconds: duration,
        waveform,
      },
      licenses: shown.map((l) => ({ ...l, terms: l.terms ?? "" })),
      status: "draft",
      saveDefaults: false,
    });
    setSaving(false);
    if (!res.ok) return void toast.error("Couldn't save the beat", { description: res.error });
    saved.current = true;
    onCreated({
      id: res.data.id,
      title: title.trim(),
      status: "draft",
      cover_path: coverPath,
      bpm: Number(bpm),
      key_note: keyNote,
      key_mode: keyMode,
      genre,
      has_preview: true,
      has_mp3: has.mp3,
      has_wav: has.wav,
      has_stems: has.stems,
      exclusive_sold_at: null,
      prices: toBeatPrices(shown),
    });
  };

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 gap-3">
        <FileSlot
          label="Preview (tagged)"
          hint="Streamed publicly. Use a tagged MP3 so it can't be ripped."
          accept={SPEC.preview.accept}
          icon={<Waves className="h-5 w-5" />}
          state={files.preview ?? null}
          required
          onSelect={(f) => upload("preview", f)}
          onRemove={() => remove("preview")}
          extra={
            !files.preview && raw.current.mp3 ? (
              <button type="button" onClick={() => upload("preview", raw.current.mp3!)} className="self-start text-xs text-accent-300 underline-offset-4 hover:underline">
                Use my untagged MP3 as the public preview
              </button>
            ) : null
          }
        />
        <FileSlot label="MP3 (untagged)" hint="Required: every pack license delivers it." accept={SPEC.mp3.accept} icon={<FileAudio className="h-5 w-5" />} state={files.mp3 ?? null} required onSelect={(f) => upload("mp3", f)} onRemove={() => remove("mp3")} />
        <FileSlot label="WAV" hint="For Premium and higher." accept={SPEC.wav.accept} icon={<Music className="h-5 w-5" />} state={files.wav ?? null} onSelect={(f) => upload("wav", f)} onRemove={() => remove("wav")} />
        <FileSlot label="Stems (ZIP)" hint="For Trackout and higher." accept={SPEC.stems.accept} icon={<FileArchive className="h-5 w-5" />} state={files.stems ?? null} onSelect={(f) => upload("stems", f)} onRemove={() => remove("stems")} />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Beat title" htmlFor="qb-title" className="sm:col-span-2">
          <Input id="qb-title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={100} placeholder="e.g. Midnight Run" />
        </Field>
        <Field label="Genre" htmlFor="qb-genre">
          <Select id="qb-genre" value={genre} onChange={setGenre} placeholder="Select a genre" options={genres.map((g) => ({ value: g.slug, label: g.name }))} />
        </Field>
        <Field label="Tempo (BPM)" htmlFor="qb-bpm">
          <div className="flex gap-2">
            <Input id="qb-bpm" type="number" inputMode="numeric" min={BPM_MIN} max={BPM_MAX} value={bpm} onChange={(e) => setBpm(e.target.value === "" ? "" : Math.round(Number(e.target.value)))} placeholder="140" />
            <TapTempo onBpm={(b) => setBpm(b)} />
          </div>
        </Field>
        <Field label="Key" htmlFor="qb-key" className="sm:col-span-2">
          <div className="flex flex-wrap items-center gap-2">
            <Select id="qb-key" value={String(keyNote)} onChange={(v) => setKeyNote(Number(v))} options={NOTE_NAMES.map((n, i) => ({ value: String(i), label: n }))} className="w-28" />
            <Segmented<"major" | "minor"> value={keyMode} onChange={setKeyMode} options={[{ value: "minor", label: "Minor" }, { value: "major", label: "Major" }]} />
          </div>
        </Field>
      </div>

      <div>
        <h3 className="font-display text-base font-bold">Prices &amp; free download</h3>
        <p className="mb-3 mt-1 text-xs leading-relaxed text-ink-400">
          What this beat costs on its own, filled in with your usual prices. Licenses switch on as you upload the files they deliver.
          Turn on Free Download to let people download the tagged preview for free.
        </p>
        <LicenseEditor licenses={shown} onChange={changeLicenses} rates={rates} available={has} />
        {/* Shown once the required files are in, so it doesn't nag while uploading. */}
        {licenseProblems.length > 0 && done("preview") && done("mp3") && (
          <ul className="mt-3 space-y-1.5 rounded-xl border border-white/[0.07] bg-white/[0.02] p-3 text-xs text-ink-300">
            {licenseProblems.map((p) => (
              <li key={p} className="flex gap-2">
                <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning" /> {p}
              </li>
            ))}
          </ul>
        )}
      </div>

      <p className="text-xs leading-relaxed text-ink-400">
        The beat gets the pack&apos;s cover and goes live together with the pack. You can add moods, tags and a description later under My beats.
      </p>

      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onCancel} disabled={saving}>
          Cancel
        </Button>
        <Button onClick={save} loading={saving} disabled={uploading}>
          {uploading ? "Uploading…" : "Add beat to pack"}
        </Button>
      </div>
    </div>
  );
}
