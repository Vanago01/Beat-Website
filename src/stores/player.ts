"use client";

import { create } from "zustand";
import type { BeatCard } from "@/lib/types";
import { PREFERENCE_KEYS, loadPreference, savePreference } from "@/lib/consent";

export type PlayerBeat = Pick<
  BeatCard,
  | "id"
  | "slug"
  | "title"
  | "producer_name"
  | "producer_username"
  | "cover_path"
  | "preview_path"
  | "duration_seconds"
  | "waveform"
  | "bpm"
  | "key_note"
  | "key_mode"
  | "genre_name"
  | "min_price_eur"
  | "min_price_pln"
  | "min_price_usd"
  | "has_free"
  | "exclusive_sold_at"
>;

interface PlayerState {
  current: PlayerBeat | null;
  queue: PlayerBeat[];
  isPlaying: boolean;
  buffering: boolean;
  currentTime: number;
  duration: number;
  volume: number;
  muted: boolean;
  /** Pending seek (seconds) the audio engine applies. */
  seekTo: number | null;
  error: string | null;

  play: (beat: PlayerBeat, queue?: PlayerBeat[]) => void;
  toggle: (beat?: PlayerBeat, queue?: PlayerBeat[]) => void;
  pause: () => void;
  resume: () => void;
  next: () => void;
  prev: () => void;
  seek: (seconds: number) => void;
  seekFraction: (fraction: number) => void;
  setVolume: (volume: number) => void;
  toggleMute: () => void;
  close: () => void;

  _sync: (patch: Partial<Pick<PlayerState, "isPlaying" | "buffering" | "currentTime" | "duration" | "error">>) => void;
  _consumeSeek: () => void;
}

const VOLUME_KEY = PREFERENCE_KEYS.volume;

function initialVolume() {
  if (typeof window === "undefined") return 0.85;
  const v = Number(loadPreference(VOLUME_KEY));
  return Number.isFinite(v) && v > 0 && v <= 1 ? v : 0.85;
}

export const usePlayer = create<PlayerState>((set, get) => ({
  current: null,
  queue: [],
  isPlaying: false,
  buffering: false,
  currentTime: 0,
  duration: 0,
  volume: initialVolume(),
  muted: false,
  seekTo: null,
  error: null,

  play: (beat, queue) => {
    const { current } = get();
    const nextQueue = queue && queue.length ? queue : get().queue.some((b) => b.id === beat.id) ? get().queue : [beat];
    if (current?.id === beat.id) {
      set({ isPlaying: true, queue: nextQueue });
      return;
    }
    set({
      current: beat,
      queue: nextQueue,
      isPlaying: true,
      currentTime: 0,
      duration: beat.duration_seconds ?? 0,
      buffering: true,
      error: null,
    });
  },
  toggle: (beat, queue) => {
    const { current, isPlaying } = get();
    if (beat && current?.id !== beat.id) return get().play(beat, queue);
    if (!current) return;
    set({ isPlaying: !isPlaying });
  },
  pause: () => set({ isPlaying: false }),
  resume: () => get().current && set({ isPlaying: true }),
  next: () => {
    const { queue, current } = get();
    if (!current) return;
    const i = queue.findIndex((b) => b.id === current.id);
    const nextBeat = queue[i + 1];
    if (nextBeat) get().play(nextBeat);
    else set({ isPlaying: false, seekTo: 0, currentTime: 0 });
  },
  prev: () => {
    const { queue, current, currentTime } = get();
    if (!current) return;
    if (currentTime > 3) return set({ seekTo: 0 });
    const i = queue.findIndex((b) => b.id === current.id);
    const prevBeat = queue[i - 1];
    if (prevBeat) get().play(prevBeat);
    else set({ seekTo: 0 });
  },
  seek: (seconds) => set({ seekTo: Math.max(0, seconds), currentTime: Math.max(0, seconds) }),
  seekFraction: (fraction) => {
    const d = get().duration || get().current?.duration_seconds || 0;
    if (!d) return;
    const t = Math.min(Math.max(fraction, 0), 0.999) * d;
    set({ seekTo: t, currentTime: t });
  },
  setVolume: (volume) => {
    const v = Math.min(Math.max(volume, 0), 1);
    savePreference(VOLUME_KEY, String(v));
    set({ volume: v, muted: v === 0 });
  },
  toggleMute: () => set((s) => ({ muted: !s.muted })),
  close: () => set({ current: null, isPlaying: false, currentTime: 0, duration: 0, queue: [] }),

  _sync: (patch) => set(patch),
  _consumeSeek: () => set({ seekTo: null }),
}));

/** The single <audio> element, registered by <AudioEngine/>. */
let audioEl: HTMLAudioElement | null = null;
export const registerAudioElement = (el: HTMLAudioElement | null) => {
  audioEl = el;
};
export const getAudioElement = () => audioEl;

export function toPlayerBeat(b: PlayerBeat): PlayerBeat {
  return {
    id: b.id,
    slug: b.slug,
    title: b.title,
    producer_name: b.producer_name,
    producer_username: b.producer_username,
    cover_path: b.cover_path,
    preview_path: b.preview_path,
    duration_seconds: b.duration_seconds,
    waveform: b.waveform,
    bpm: b.bpm,
    key_note: b.key_note,
    key_mode: b.key_mode,
    genre_name: b.genre_name,
    min_price_eur: b.min_price_eur,
    min_price_pln: b.min_price_pln,
    min_price_usd: b.min_price_usd,
    has_free: b.has_free,
    exclusive_sold_at: b.exclusive_sold_at,
  };
}
