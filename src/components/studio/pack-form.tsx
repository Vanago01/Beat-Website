"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, Check, ImagePlus, Info, Library, Plus, Send, Sparkles, Tag, Upload, X } from "lucide-react";
import { toast } from "sonner";
import { FileSlot, type FileState } from "./form-parts";
import { LicenseEditor, charmPln, suggestUsd } from "./license-editor";
import { QuickBeatForm } from "./quick-beat-form";
import { BeatPricesModal, priceSummary, type BeatPrice } from "./beat-prices";
import { BeatCover } from "@/components/beats/cover";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/input";
import { Badge, Card } from "@/components/ui/misc";
import { Modal } from "@/components/ui/overlay";
import { savePack } from "@/actions/packs";
import { buildPath, uploadSmall } from "@/lib/upload";
import { coverUrl } from "@/lib/storage";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { formatPrice, keyName } from "@/lib/format";
import { BEAT_STATUS_LABEL, type BeatStatus, type LicenseDraft, type PriceRates } from "@/lib/constants";
import { DEFAULT_PACK_LICENSES, PACK_LICENSE_TYPES, PACK_MAX_BEATS, PACK_MIN_BEATS, beatsLabel, type PackLicense } from "@/lib/packs";
import { cn } from "@/lib/utils";

/** A beat as the pack editor needs it. */
export interface PackBeat {
  id: string;
  title: string;
  status: BeatStatus;
  cover_path: string | null;
  bpm: number;
  key_note: number;
  key_mode: string;
  genre: string;
  has_preview: boolean;
  has_mp3: boolean;
  has_wav: boolean;
  has_stems: boolean;
  exclusive_sold_at: string | null;
  /** The beat's own licenses (what it costs on its own, free download). */
  prices: BeatPrice[];
}

export interface EditablePack {
  id: string;
  title: string;
  description: string | null;
  cover_path: string | null;
  status: BeatStatus;
  approved_at: string | null;
  rejection_reason: string | null;
}

const COVER = { accept: "image/png,image/jpeg,image/webp", max: 10 * 1024 ** 2, types: /\.(png|jpe?g|webp)$/i };

const STATUS_TONE: Record<BeatStatus, "success" | "warning" | "danger" | "default" | "outline"> = {
  published: "success",
  pending: "warning",
  rejected: "danger",
  draft: "default",
  archived: "outline",
};

function initialLicenses(existing: PackLicense[] | undefined, rates: PriceRates): LicenseDraft[] {
  return PACK_LICENSE_TYPES.map((type) => {
    const base = DEFAULT_PACK_LICENSES.find((d) => d.type === type)!;
    const saved = existing?.find((l) => l.type === type);
    if (saved) return { ...base, ...saved, terms: saved.terms ?? "" };
    // New pack, or a tier never saved: suggest złoty and dollar prices from the euro price.
    return {
      ...base,
      enabled: existing?.length ? false : base.enabled,
      price_pln: charmPln(base.price_eur, rates.pln),
      price_usd: suggestUsd(base.price_eur, rates.usd),
    };
  });
}

export function PackForm({
  producerId,
  pack,
  packBeatIds = [],
  packLicenses,
  library: initialLibrary,
  genres,
  rates,
  licenseDefaults,
  canSelfPublish,
}: {
  producerId: string;
  pack?: EditablePack | null;
  packBeatIds?: string[];
  packLicenses?: PackLicense[];
  library: PackBeat[];
  genres: { slug: string; name: string }[];
  rates: PriceRates;
  licenseDefaults: unknown;
  canSelfPublish: boolean;
}) {
  const router = useRouter();
  const [packId] = useState(() => pack?.id ?? crypto.randomUUID());
  const [title, setTitle] = useState(pack?.title ?? "");
  const [description, setDescription] = useState(pack?.description ?? "");
  const [cover, setCover] = useState<FileState | null>(
    pack?.cover_path ? { status: "done", progress: 1, name: "Current cover", size: 0, path: pack.cover_path, existing: true } : null,
  );
  const [localCover, setLocalCover] = useState<string | null>(null);
  const [applyCover, setApplyCover] = useState(true);
  const [library, setLibrary] = useState<PackBeat[]>(initialLibrary);
  const [beatIds, setBeatIds] = useState<string[]>(packBeatIds.filter((id) => initialLibrary.some((b) => b.id === id)));
  const [licenses, setLicenses] = useState<LicenseDraft[]>(() => initialLicenses(packLicenses, rates));
  const [picker, setPicker] = useState<Set<string> | null>(null);
  const [uploadingBeat, setUploadingBeat] = useState(false);
  const [pricing, setPricing] = useState<PackBeat | null>(null);
  const [pending, startTransition] = useTransition();
  const coverAbort = useRef<AbortController | null>(null);

  useEffect(() => () => coverAbort.current?.abort(), []);

  const byId = useMemo(() => new Map(library.map((b) => [b.id, b])), [library]);
  const beats = beatIds.map((id) => byId.get(id)).filter((b): b is PackBeat => !!b);
  const coverPath = cover?.status === "done" ? cover.path : null;
  const isPublished = pack?.status === "published";
  const approved = !!pack?.approved_at;
  const selfPublish = canSelfPublish || approved;

  // A license can only be offered if every beat has the files it delivers.
  const available = {
    mp3: beats.length === 0 || beats.every((b) => b.has_mp3),
    wav: beats.length === 0 || beats.every((b) => b.has_wav),
    stems: beats.length === 0 || beats.every((b) => b.has_stems),
  };

  const problems = useMemo(() => {
    const p: string[] = [];
    if (!title.trim()) p.push("Give your pack a title.");
    if (beats.length < PACK_MIN_BEATS) p.push(`Add at least ${PACK_MIN_BEATS} beats.`);
    const sold = beats.find((b) => b.exclusive_sold_at);
    if (sold) p.push(`“${sold.title}” was sold exclusively. Remove it from the pack.`);
    const enabled = licenses.filter((l) => l.enabled);
    if (!enabled.length) p.push("Turn on at least one license.");
    for (const l of enabled) {
      if (l.price_eur < 50 || l.price_pln < 200 || l.price_usd < 50) p.push(`Set a price for ${l.name} (min €0.50 / 2 zł / $0.50).`);
      const lacking = beats.find((b) => (l.includes_mp3 && !b.has_mp3) || (l.includes_wav && !b.has_wav) || (l.includes_stems && !b.has_stems));
      if (lacking) p.push(`${l.name} delivers files that “${lacking.title}” doesn't have. Upload them to the beat or turn the license off.`);
    }
    return [...new Set(p)];
  }, [title, beats, licenses]);

  const uploadCover = async (file: File) => {
    if (!COVER.types.test(file.name)) return void toast.error("Use a JPG, PNG or WEBP image.");
    if (file.size > COVER.max) return void toast.error("The cover must be under 10 MB.");
    coverAbort.current?.abort();
    const controller = new AbortController();
    coverAbort.current = controller;
    // Replacing a cover that was only uploaded in this session: tidy it up.
    if (cover?.path && !cover.existing) void getSupabaseBrowserClient().storage.from("covers").remove([cover.path]);
    setLocalCover(URL.createObjectURL(file));
    setCover({ status: "uploading", progress: 0, name: file.name, size: file.size, path: null });
    const path = buildPath(producerId, `packs/${packId}`, "cover", file);
    try {
      await uploadSmall("covers", path, file);
      if (controller.signal.aborted) return;
      setCover({ status: "done", progress: 1, name: file.name, size: file.size, path });
    } catch (err) {
      if (controller.signal.aborted) return;
      setCover({ status: "error", progress: 0, name: file.name, size: file.size, path: null, error: err instanceof Error ? err.message : "Upload failed" });
    }
  };

  const removeCover = () => {
    coverAbort.current?.abort();
    if (cover?.path && !cover.existing) void getSupabaseBrowserClient().storage.from("covers").remove([cover.path]);
    setLocalCover(null);
    setCover(null);
  };

  const move = (index: number, step: -1 | 1) =>
    setBeatIds((ids) => {
      const next = [...ids];
      const target = index + step;
      if (target < 0 || target >= next.length) return ids;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });

  const removeBeat = (id: string) => setBeatIds((ids) => ids.filter((x) => x !== id));

  const addPicked = () => {
    if (!picker) return;
    const room = PACK_MAX_BEATS - beatIds.length;
    const picked = library.filter((b) => picker.has(b.id) && !beatIds.includes(b.id)).map((b) => b.id);
    if (picked.length > room) toast.warning(`A pack can have up to ${PACK_MAX_BEATS} beats.`);
    setBeatIds((ids) => [...ids, ...picked.slice(0, room)]);
    setPicker(null);
  };

  const submit = (status: "draft" | "published") => {
    if (cover?.status === "uploading") return void toast.error("Wait for the cover to finish uploading.");
    if (status === "draft" && !title.trim()) return void toast.error("Give your pack a title.");
    if (status !== "draft" && problems.length) return void toast.error("Almost there", { description: problems[0] });
    startTransition(async () => {
      const res = await savePack({
        pack: { id: packId, title: title.trim(), description, cover_path: coverPath },
        beatIds,
        licenses: licenses.map((l) => ({ ...l, terms: l.terms ?? "" })),
        status,
        applyCover: applyCover && !!coverPath,
      });
      if (!res.ok) return void toast.error("Couldn't save the pack", { description: res.error });
      const s = res.data.status;
      toast.success(s === "published" ? "Pack published — it's live in the marketplace" : s === "pending" ? "Pack submitted for review" : "Pack saved as a draft", {
        description: s === "pending" ? "It goes live with its beats once an admin approves it." : undefined,
      });
      router.push("/dashboard/packs");
      router.refresh();
    });
  };

  const coverSrc = localCover ?? coverUrl(coverPath);
  const candidates = library.filter((b) => !beatIds.includes(b.id));

  return (
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
      <div className="space-y-6">
        <Card className="p-5 md:p-6">
          <h2 className="mb-5 font-display text-lg font-bold">Pack details</h2>
          <div className="grid grid-cols-1 gap-5">
            <Field label="Pack title" htmlFor="pack-title">
              <Input id="pack-title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={100} placeholder="e.g. Midnight Trap Pack Vol. 1" />
            </Field>
            <Field label="Description" htmlFor="pack-description" optional>
              <Textarea id="pack-description" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={5000} rows={4} placeholder="What's in the pack and who it's for…" />
            </Field>
            <div className="grid grid-cols-1 gap-3">
              <FileSlot
                label="Pack cover"
                hint="Square JPG/PNG/WEBP, at least 1000×1000 px, max 10 MB."
                accept={COVER.accept}
                icon={<ImagePlus className="h-5 w-5" />}
                preview={coverSrc ? <Image src={coverSrc} alt="" width={44} height={44} className="h-full w-full object-cover" unoptimized={!!localCover} /> : undefined}
                state={cover}
                onSelect={uploadCover}
                onRemove={removeCover}
              />
              <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-white/[0.07] bg-white/[0.02] p-4 text-sm">
                <input type="checkbox" checked={applyCover} onChange={(e) => setApplyCover(e.target.checked)} className="mt-0.5 h-4 w-4 accent-[var(--color-accent)]" />
                <span>
                  <span className="block font-medium">Use this cover for every beat in the pack</span>
                  <span className="block text-xs text-ink-400">Beats you add or upload here show the pack cover, also on their own pages.</span>
                </span>
              </label>
            </div>
          </div>
        </Card>

        <Card className="p-5 md:p-6">
          <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="font-display text-lg font-bold">
                Beats in this pack <span className="text-ink-400">· {beats.length}</span>
              </h2>
              <p className="mt-1 text-sm text-ink-400">At least {PACK_MIN_BEATS}. Every beat stays for sale on its own too.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" size="sm" onClick={() => setPicker(new Set())} disabled={beats.length >= PACK_MAX_BEATS}>
                <Library className="h-4 w-4" /> Add your beats
              </Button>
              <Button variant="secondary" size="sm" onClick={() => setUploadingBeat(true)} disabled={beats.length >= PACK_MAX_BEATS}>
                <Upload className="h-4 w-4" /> Upload a new beat
              </Button>
            </div>
          </div>
          {beats.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-white/10 px-6 py-10 text-center">
              <p className="font-medium">No beats yet</p>
              <p className="mt-1 text-sm text-ink-400">Add beats you&apos;ve already uploaded, or upload new ones right here.</p>
            </div>
          ) : (
            <ol className="space-y-2">
              {beats.map((b, i) => (
                <li key={b.id} className="flex items-center gap-3 rounded-2xl border border-white/[0.07] bg-white/[0.02] p-2.5 pr-3">
                  <span className="w-5 shrink-0 text-center font-mono text-xs text-ink-400">{i + 1}</span>
                  <BeatCover
                    path={applyCover && coverPath ? coverPath : b.cover_path}
                    title={b.title}
                    seed={b.id}
                    className="h-11 w-11 shrink-0 rounded-xl"
                    sizes="44px"
                    showTitle={false}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">{b.title}</p>
                    <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-ink-400">
                      <span>
                        {b.bpm} BPM · {keyName(b.key_note, b.key_mode)}
                      </span>
                      <Badge tone={STATUS_TONE[b.status]} className="h-5 px-2 text-[10px]">
                        {b.exclusive_sold_at ? "Sold exclusively" : b.status === "draft" ? "Goes live with the pack" : BEAT_STATUS_LABEL[b.status]}
                      </Badge>
                      {(["mp3", "wav", "stems"] as const).map((f) => (
                        <span
                          key={f}
                          className={cn(
                            "rounded px-1.5 font-mono text-[10px] uppercase",
                            b[`has_${f}`] ? "bg-white/[0.06] text-ink-200" : "text-ink-500 line-through",
                          )}
                        >
                          {f}
                        </span>
                      ))}
                    </p>
                    <BeatPriceLine beat={b} onEdit={() => setPricing(b)} />
                  </div>
                  <div className="flex shrink-0 items-center">
                    <button type="button" onClick={() => move(i, -1)} disabled={i === 0} className="grid h-8 w-8 place-items-center rounded-full text-ink-300 hover:bg-white/[0.08] disabled:opacity-30" aria-label={`Move ${b.title} up`}>
                      <ArrowUp className="h-4 w-4" />
                    </button>
                    <button type="button" onClick={() => move(i, 1)} disabled={i === beats.length - 1} className="grid h-8 w-8 place-items-center rounded-full text-ink-300 hover:bg-white/[0.08] disabled:opacity-30" aria-label={`Move ${b.title} down`}>
                      <ArrowDown className="h-4 w-4" />
                    </button>
                    <button type="button" onClick={() => removeBeat(b.id)} className="grid h-8 w-8 place-items-center rounded-full text-ink-300 hover:bg-danger/10 hover:text-danger" aria-label={`Remove ${b.title} from the pack`}>
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </Card>

        <Card className="p-5 md:p-6">
          <h2 className="font-display text-lg font-bold">Pack pricing</h2>
          <p className="mb-5 mt-1 text-sm text-ink-400">
            One price per license for the whole pack: buyers get that license for every beat in it. PLN and USD are suggested from EUR — override any of them.
          </p>
          <LicenseEditor licenses={licenses} onChange={setLicenses} rates={rates} available={available} />
          <PackVsSingles beats={beats} licenses={licenses} />
        </Card>
      </div>

      <aside className="space-y-4 xl:sticky xl:top-24 xl:self-start">
        <Card className="p-5">
          <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-ink-400">Publishing</p>
          {pack && (
            <p className="mt-3 flex items-center gap-2 text-sm">
              Status: <Badge tone={STATUS_TONE[pack.status]}>{BEAT_STATUS_LABEL[pack.status]}</Badge>
            </p>
          )}
          <p className="mt-3 text-sm leading-relaxed text-ink-300">
            {selfPublish
              ? "Publishing makes the pack and its unpublished beats visible in the marketplace."
              : "New packs are reviewed by our team before they go live, together with any new beats in them."}
          </p>
          {problems.length > 0 && (
            <ul className="mt-4 space-y-1.5 rounded-xl border border-white/[0.07] bg-white/[0.02] p-3 text-xs text-ink-300">
              {problems.map((p) => (
                <li key={p} className="flex gap-2">
                  <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning" /> {p}
                </li>
              ))}
            </ul>
          )}
          <div className="mt-5 grid gap-2">
            <Button onClick={() => submit("published")} loading={pending} disabled={pending || cover?.status === "uploading"}>
              {selfPublish ? (
                <>
                  <Sparkles className="h-4 w-4" /> {isPublished ? "Save changes" : "Publish pack"}
                </>
              ) : (
                <>
                  <Send className="h-4 w-4" /> {pack?.status === "pending" ? "Update submission" : "Submit for review"}
                </>
              )}
            </Button>
            <Button variant="secondary" onClick={() => submit("draft")} disabled={pending || cover?.status === "uploading"}>
              {isPublished ? "Unpublish & save as draft" : "Save draft"}
            </Button>
          </div>
          {pack?.status === "rejected" && pack.rejection_reason && (
            <div className="mt-4 rounded-xl border border-danger/30 bg-danger/10 p-3 text-xs text-danger">
              <strong className="block">Rejected by an admin:</strong> {pack.rejection_reason}
            </div>
          )}
        </Card>
        <Card className="p-5 text-sm leading-relaxed text-ink-300">
          <p className="mb-2 font-medium text-ink-100">How packs work</p>
          <ul className="list-disc space-y-1 pl-4 text-xs">
            <li>Buyers pay once and get the chosen license for every beat, each with its own downloads and license agreement.</li>
            <li>Each beat keeps its own page and prices.</li>
            <li>The pack is only on sale while all of its beats are.</li>
          </ul>
        </Card>
      </aside>

      <Modal
        open={picker !== null}
        onClose={() => setPicker(null)}
        title="Add your beats"
        description={candidates.length ? "Pick the beats to put in this pack." : undefined}
        size="lg"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setPicker(null)}>
              Cancel
            </Button>
            <Button onClick={addPicked} disabled={!picker?.size}>
              <Plus className="h-4 w-4" /> Add {picker?.size ? beatsLabel(picker.size) : "beats"}
            </Button>
          </div>
        }
      >
        {candidates.length === 0 ? (
          <p className="py-6 text-center text-sm text-ink-300">All your beats are already in this pack. Upload a new one instead.</p>
        ) : (
          <ul className="space-y-1.5">
            {candidates.map((b) => {
              const checked = !!picker?.has(b.id);
              const blocked = !!b.exclusive_sold_at;
              return (
                <li key={b.id}>
                  <label className={cn("flex cursor-pointer items-center gap-3 rounded-2xl border p-2.5 transition", checked ? "border-accent/60 bg-accent/[0.08]" : "border-white/[0.07] hover:bg-white/[0.03]", blocked && "cursor-not-allowed opacity-50")}>
                    <input
                      type="checkbox"
                      className="h-4 w-4 accent-[var(--color-accent)]"
                      checked={checked}
                      disabled={blocked}
                      onChange={(e) =>
                        setPicker((s) => {
                          const next = new Set(s ?? []);
                          if (e.target.checked) next.add(b.id);
                          else next.delete(b.id);
                          return next;
                        })
                      }
                    />
                    <BeatCover path={b.cover_path} title={b.title} seed={b.id} className="h-10 w-10 shrink-0 rounded-lg" sizes="40px" showTitle={false} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{b.title}</span>
                      <span className="block text-xs text-ink-400">
                        {b.bpm} BPM · {keyName(b.key_note, b.key_mode)} · {blocked ? "Sold exclusively" : BEAT_STATUS_LABEL[b.status]}
                      </span>
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
        )}
      </Modal>

      <BeatPricesModal
        beat={pricing}
        rates={rates}
        onClose={() => setPricing(null)}
        onSaved={(id, prices) => setLibrary((list) => list.map((x) => (x.id === id ? { ...x, prices } : x)))}
      />

      <Modal open={uploadingBeat} onClose={() => setUploadingBeat(false)} title="Upload a new beat" description="It's added to this pack and saved under My beats." size="xl">
        {uploadingBeat && (
          <QuickBeatForm
            producerId={producerId}
            genres={genres}
            coverPath={applyCover ? coverPath : null}
            licenseDefaults={licenseDefaults}
            rates={rates}
            onCancel={() => setUploadingBeat(false)}
            onCreated={(beat) => {
              setLibrary((list) => [beat, ...list]);
              setBeatIds((ids) => [...ids, beat.id]);
              setUploadingBeat(false);
              toast.success(`“${beat.title}” added to the pack`);
            }}
          />
        )}
      </Modal>
    </div>
  );
}

/** A beat's own prices in the pack editor, with the button to change them. */
function BeatPriceLine({ beat, onEdit }: { beat: PackBeat; onEdit: () => void }) {
  const { free, from } = priceSummary(beat.prices);
  return (
    <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
      {free && <Badge tone="success" className="h-5 px-2 text-[10px]">Free download</Badge>}
      <span className="text-ink-300">{from ? `On its own from ${from}` : free ? "No paid licenses" : "No licenses on"}</span>
      {beat.exclusive_sold_at ? null : (
        <button type="button" onClick={onEdit} className="inline-flex items-center gap-1 font-medium text-accent-300 underline-offset-4 hover:underline" aria-label={`Prices and free download for ${beat.title}`}>
          <Tag className="h-3 w-3" /> Prices &amp; free download
        </button>
      )}
    </p>
  );
}

/** Each pack price next to what the same license costs for the beats one by one. */
function PackVsSingles({ beats, licenses }: { beats: PackBeat[]; licenses: LicenseDraft[] }) {
  if (beats.length < PACK_MIN_BEATS) return null;
  const lines = licenses
    .filter((l) => l.enabled && l.price_eur > 0)
    .flatMap((l) => {
      const singles = beats.map((b) => b.prices.find((p) => p.type === l.type && p.enabled)?.price_eur);
      // Only comparable when every beat offers this license on its own.
      if (singles.some((p) => p == null)) return [];
      return [{ name: l.name, pack: l.price_eur, sum: singles.reduce<number>((a, p) => a + (p ?? 0), 0) }];
    });
  if (!lines.length) return null;
  return (
    <ul className="mt-4 space-y-1.5 text-xs">
      {lines.map((x) =>
        x.pack < x.sum ? (
          <li key={x.name} className="flex gap-2 text-success">
            <Check className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {x.name}: buyers save {Math.round((1 - x.pack / x.sum) * 100)}% compared with {formatPrice(x.sum, "eur")} for the beats one by one.
          </li>
        ) : (
          <li key={x.name} className="flex gap-2 text-warning">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {x.name}: the pack costs more than buying these beats one by one ({formatPrice(x.sum, "eur")}).
          </li>
        ),
      )}
    </ul>
  );
}
