"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { CircleCheck, CircleAlert, LoaderCircle, Plus, RotateCcw, Upload, X } from "lucide-react";
import { toast } from "sonner";
import { Chip } from "@/components/ui/controls";
import { MAX_MOODS, MOODS, isValidMood, moodLabel, normalizeMood } from "@/lib/constants";
import { formatBytes } from "@/lib/audio-analysis";
import { cn } from "@/lib/utils";

export interface FileState {
  status: "uploading" | "done" | "error";
  progress: number;
  name: string;
  size: number;
  path: string | null;
  error?: string;
  existing?: boolean;
}

export function FileSlot({
  label,
  hint,
  accept,
  icon,
  state,
  required,
  onSelect,
  onRemove,
  extra,
  preview,
}: {
  label: string;
  hint: string;
  accept: string;
  icon: ReactNode;
  state: FileState | null;
  required?: boolean;
  onSelect: (file: File) => void;
  onRemove: () => void;
  extra?: ReactNode;
  preview?: ReactNode;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [drag, setDrag] = useState(false);

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setDrag(true);
      }}
      onDragLeave={() => setDrag(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDrag(false);
        const f = e.dataTransfer.files?.[0];
        if (f) onSelect(f);
      }}
      className={cn(
        "relative flex flex-col gap-3 rounded-2xl border border-dashed p-4 transition-colors",
        drag ? "border-accent bg-accent/10" : state?.status === "error" ? "border-danger/40 bg-danger/[0.04]" : state ? "border-white/[0.1] bg-white/[0.02]" : "border-white/[0.12] hover:border-white/25",
      )}
    >
      <div className="flex items-start gap-3">
        <div className="grid h-11 w-11 shrink-0 place-items-center overflow-hidden rounded-xl bg-white/[0.05] text-ink-200">{preview ?? icon}</div>
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm font-semibold">
            {label}
            {required && <span className="whitespace-nowrap rounded bg-white/10 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider text-ink-300">Required to publish</span>}
          </p>
          {state ? (
            <p className="mt-0.5 truncate text-xs text-ink-300">
              {state.name} {state.size > 0 && <span className="text-ink-500">· {formatBytes(state.size)}</span>}
            </p>
          ) : (
            <p className="mt-0.5 text-xs leading-relaxed text-ink-400">{hint}</p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {state?.status === "uploading" && <LoaderCircle className="h-4 w-4 animate-spin text-accent-300" />}
          {state?.status === "done" && <CircleCheck className="h-4 w-4 text-success" />}
          {state?.status === "error" && <CircleAlert className="h-4 w-4 text-danger" />}
          <button
            type="button"
            onClick={() => input.current?.click()}
            className="inline-flex h-8 items-center gap-1.5 rounded-full border border-white/10 px-3 text-xs font-medium transition hover:border-white/30"
          >
            {state ? <RotateCcw className="h-3.5 w-3.5" /> : <Upload className="h-3.5 w-3.5" />}
            {state ? "Replace" : "Choose file"}
          </button>
          {state && (
            <button type="button" onClick={onRemove} className="grid h-8 w-8 place-items-center rounded-full text-ink-400 transition hover:bg-danger/10 hover:text-danger" aria-label={`Remove ${label}`}>
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>
      {state?.status === "uploading" && (
        <div className="h-1.5 overflow-hidden rounded-full bg-white/10" role="progressbar" aria-valuenow={Math.round(state.progress * 100)} aria-valuemin={0} aria-valuemax={100}>
          <div className="h-full rounded-full bg-gradient-to-r from-accent-300 to-accent transition-[width] duration-300" style={{ width: `${Math.max(3, state.progress * 100)}%` }} />
        </div>
      )}
      {state?.status === "error" && <p className="text-xs text-danger">{state.error}</p>}
      {extra}
      <input
        ref={input}
        type="file"
        accept={accept}
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onSelect(f);
          e.target.value = "";
        }}
      />
    </div>
  );
}

export function TagInput({ value, onChange, max = 12 }: { value: string[]; onChange: (tags: string[]) => void; max?: number }) {
  const [draft, setDraft] = useState("");
  const add = (raw: string) => {
    const tags = raw
      .split(",")
      .map((t) => t.trim().toLowerCase().replace(/^#/, "").slice(0, 30))
      .filter(Boolean);
    const next = [...value];
    for (const t of tags) if (!next.includes(t) && next.length < max) next.push(t);
    onChange(next);
    setDraft("");
  };
  return (
    <div className="flex min-h-11 flex-wrap items-center gap-1.5 rounded-xl border border-white/[0.08] bg-white/[0.03] px-2 py-1.5 focus-within:border-accent/70 focus-within:ring-4 focus-within:ring-accent/15">
      {value.map((t) => (
        <span key={t} className="inline-flex h-7 items-center gap-1 rounded-full bg-white/[0.08] pl-2.5 pr-1 text-xs">
          #{t}
          <button type="button" onClick={() => onChange(value.filter((x) => x !== t))} className="grid h-5 w-5 place-items-center rounded-full hover:bg-white/15" aria-label={`Remove tag ${t}`}>
            <X className="h-3 w-3" />
          </button>
        </span>
      ))}
      <input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if ((e.key === "Enter" || e.key === ",") && draft.trim()) {
            e.preventDefault();
            add(draft);
          } else if (e.key === "Backspace" && !draft && value.length) {
            onChange(value.slice(0, -1));
          }
        }}
        onBlur={() => draft.trim() && add(draft)}
        placeholder={value.length >= max ? "Tag limit reached" : value.length ? "Add tag…" : "e.g. travis scott type beat, ambient, piano"}
        disabled={value.length >= max}
        className="h-8 min-w-[10rem] flex-1 bg-transparent px-2 text-sm outline-none placeholder:text-ink-400"
        aria-label="Add tag"
      />
    </div>
  );
}

export function TapTempo({ onBpm }: { onBpm: (bpm: number) => void }) {
  const taps = useRef<number[]>([]);
  const [count, setCount] = useState(0);
  const reset = useRef<number | null>(null);
  return (
    <button
      type="button"
      onClick={() => {
        const now = performance.now();
        const list = taps.current.filter((t) => now - t < 2500);
        list.push(now);
        taps.current = list.slice(-8);
        setCount(taps.current.length);
        if (taps.current.length >= 3) {
          const intervals = taps.current.slice(1).map((t, i) => t - taps.current[i]);
          const avg = intervals.reduce((a, b) => a + b, 0) / intervals.length;
          const bpm = Math.round(60000 / avg);
          if (bpm >= 40 && bpm <= 220) onBpm(bpm);
        }
        if (reset.current) window.clearTimeout(reset.current);
        reset.current = window.setTimeout(() => {
          taps.current = [];
          setCount(0);
        }, 2500);
      }}
      className={cn(
        "h-11 shrink-0 rounded-xl border px-4 font-mono text-xs uppercase tracking-wider transition active:scale-95",
        count > 0 ? "border-accent bg-accent/15 text-white" : "border-white/[0.08] text-ink-300 hover:border-white/25 hover:text-white",
      )}
      title="Tap along to the beat to detect its tempo"
    >
      Tap {count > 0 ? `· ${count}` : "tempo"}
    </button>
  );
}

/** Currency input in major units that reports minor units (cents). */
export function MoneyInput({
  value,
  onChange,
  suffix,
  prefix,
  disabled,
  ariaLabel,
}: {
  value: number;
  onChange: (minor: number) => void;
  suffix?: string;
  prefix?: string;
  disabled?: boolean;
  ariaLabel: string;
}) {
  const [text, setText] = useState(() => (value / 100).toFixed(2));
  const focused = useRef(false);
  useEffect(() => {
    if (!focused.current) setText((value / 100).toFixed(2));
  }, [value]);
  return (
    <div className={cn("flex h-10 items-center rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 focus-within:border-accent/70", disabled && "opacity-50")}>
      {prefix && <span className="mr-1 text-sm text-ink-400">{prefix}</span>}
      <input
        inputMode="decimal"
        value={text}
        disabled={disabled}
        aria-label={ariaLabel}
        onFocus={() => (focused.current = true)}
        onBlur={() => {
          focused.current = false;
          setText((value / 100).toFixed(2));
        }}
        onChange={(e) => {
          const t = e.target.value.replace(",", ".");
          if (!/^\d*\.?\d{0,2}$/.test(t)) return;
          setText(t);
          const n = Number(t);
          if (Number.isFinite(n)) onChange(Math.round(n * 100));
        }}
        className="w-full min-w-0 bg-transparent text-sm tabular-nums outline-none"
      />
      {suffix && <span className="ml-1 text-sm text-ink-400">{suffix}</span>}
    </div>
  );
}


/** Preset moods plus the producer's own words. */
export function MoodPicker({ value, onChange }: { value: string[]; onChange: (moods: string[]) => void }) {
  const [draft, setDraft] = useState("");
  const custom = value.filter((m) => !MOODS.some((p) => p.value === m));
  const full = value.length >= MAX_MOODS;

  const togglePreset = (mood: string) => {
    if (value.includes(mood)) return onChange(value.filter((m) => m !== mood));
    if (full) return void toast.error(`Up to ${MAX_MOODS} moods per beat.`);
    onChange([...value, mood]);
  };

  const addCustom = () => {
    const mood = normalizeMood(draft);
    if (!mood) return;
    if (!isValidMood(mood)) return void toast.error("A mood needs 2–24 characters.");
    const preset = MOODS.find((p) => p.value === mood || p.label.toLowerCase() === mood);
    const next = preset ? preset.value : mood;
    setDraft("");
    if (value.includes(next)) return;
    if (full) return void toast.error(`Up to ${MAX_MOODS} moods per beat.`);
    onChange([...value, next]);
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      {MOODS.map((m) => (
        <Chip key={m.value} active={value.includes(m.value)} onClick={() => togglePreset(m.value)}>
          {m.label}
        </Chip>
      ))}
      {custom.map((m) => (
        <span key={m} className="inline-flex h-9 items-center gap-1 rounded-full border border-white bg-white pl-4 pr-1.5 text-[13px] font-medium text-ink-950">
          {moodLabel(m)}
          <button
            type="button"
            onClick={() => onChange(value.filter((x) => x !== m))}
            className="grid h-6 w-6 place-items-center rounded-full transition hover:bg-ink-950/10"
            aria-label={`Remove mood ${moodLabel(m)}`}
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </span>
      ))}
      {!full && (
        <span className="inline-flex h-9 items-center gap-1 rounded-full border border-dashed border-white/20 pl-4 pr-1 transition focus-within:border-accent/70 focus-within:bg-white/[0.03]">
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === ",") {
                e.preventDefault();
                addCustom();
              }
            }}
            maxLength={24}
            placeholder="Your own…"
            aria-label="Describe the mood in your own words"
            className="w-28 bg-transparent text-[13px] text-ink-50 outline-none placeholder:text-ink-400"
          />
          <button
            type="button"
            onClick={addCustom}
            disabled={!draft.trim()}
            className="grid h-7 w-7 place-items-center rounded-full text-ink-200 transition hover:bg-white/10 hover:text-white disabled:opacity-40"
            aria-label="Add mood"
          >
            <Plus className="h-4 w-4" />
          </button>
        </span>
      )}
    </div>
  );
}
