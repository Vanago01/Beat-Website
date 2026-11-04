"use client";

import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { registerAudioElement, usePlayer } from "@/stores/player";
import { coverUrl, previewUrl } from "@/lib/storage";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { env } from "@/lib/env";

const COUNTED_KEY = "nw-played";

function alreadyCounted(id: string) {
  try {
    const raw = sessionStorage.getItem(COUNTED_KEY);
    const set = new Set<string>(raw ? JSON.parse(raw) : []);
    if (set.has(id)) return true;
    set.add(id);
    sessionStorage.setItem(COUNTED_KEY, JSON.stringify([...set].slice(-300)));
    return false;
  } catch {
    return false;
  }
}

/** Owns the single <audio> element and keeps it in sync with the player store. */
export function AudioEngine() {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const playTimer = useRef<number | null>(null);

  const current = usePlayer((s) => s.current);
  const isPlaying = usePlayer((s) => s.isPlaying);
  const volume = usePlayer((s) => s.volume);
  const muted = usePlayer((s) => s.muted);
  const seekTo = usePlayer((s) => s.seekTo);

  // Create the element once.
  useEffect(() => {
    const audio = new Audio();
    audio.preload = "metadata";
    audioRef.current = audio;
    registerAudioElement(audio);
    const { _sync, next } = usePlayer.getState();

    let lastTick = 0;
    const onTime = () => {
      const now = performance.now();
      if (now - lastTick > 240) {
        lastTick = now;
        _sync({ currentTime: audio.currentTime });
      }
    };
    const onMeta = () => Number.isFinite(audio.duration) && _sync({ duration: audio.duration });
    const onPlaying = () => _sync({ buffering: false, isPlaying: true, error: null });
    const onWaiting = () => _sync({ buffering: true });
    const onPause = () => {
      // Keep the store honest when the OS / headphones pause playback.
      if (!audio.ended && usePlayer.getState().isPlaying && audio.paused) _sync({ isPlaying: false });
    };
    const onEnded = () => {
      _sync({ isPlaying: false, currentTime: 0 });
      next();
    };
    const onError = () => {
      if (!audio.src) return;
      _sync({ isPlaying: false, buffering: false, error: "Preview unavailable" });
      toast.error("This preview couldn't be loaded", { description: "Please try again in a moment." });
    };

    audio.addEventListener("timeupdate", onTime);
    audio.addEventListener("loadedmetadata", onMeta);
    audio.addEventListener("durationchange", onMeta);
    audio.addEventListener("playing", onPlaying);
    audio.addEventListener("waiting", onWaiting);
    audio.addEventListener("pause", onPause);
    audio.addEventListener("ended", onEnded);
    audio.addEventListener("error", onError);

    return () => {
      audio.pause();
      audio.removeAttribute("src");
      audio.load();
      audio.removeEventListener("timeupdate", onTime);
      audio.removeEventListener("loadedmetadata", onMeta);
      audio.removeEventListener("durationchange", onMeta);
      audio.removeEventListener("playing", onPlaying);
      audio.removeEventListener("waiting", onWaiting);
      audio.removeEventListener("pause", onPause);
      audio.removeEventListener("ended", onEnded);
      audio.removeEventListener("error", onError);
      registerAudioElement(null);
    };
  }, []);

  // Track changes.
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (!current) {
      audio.pause();
      audio.removeAttribute("src");
      audio.load();
      return;
    }
    const src = previewUrl(current.preview_path);
    if (!src) {
      toast.error("No preview available for this beat yet.");
      usePlayer.getState()._sync({ isPlaying: false });
      return;
    }
    if (audio.src !== src) {
      audio.src = src;
      audio.currentTime = 0;
    }

    // Count a play once the listener stays for 5 seconds (once per session).
    if (playTimer.current) window.clearTimeout(playTimer.current);
    const id = current.id;
    playTimer.current = window.setTimeout(() => {
      if (usePlayer.getState().current?.id !== id || !usePlayer.getState().isPlaying) return;
      if (alreadyCounted(id)) return;
      getSupabaseBrowserClient().rpc("record_play", { p_beat_id: id }).then(() => undefined);
    }, 5000);

    if ("mediaSession" in navigator) {
      const art = coverUrl(current.cover_path);
      navigator.mediaSession.metadata = new MediaMetadata({
        title: current.title,
        artist: current.producer_name,
        album: env.siteName,
        artwork: art ? [{ src: art, sizes: "512x512" }] : [],
      });
    }
  }, [current]);

  // Play / pause.
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !current) return;
    if (isPlaying) {
      const p = audio.play();
      p?.catch((err: DOMException) => {
        if (err.name === "AbortError") return;
        usePlayer.getState()._sync({ isPlaying: false, buffering: false });
        if (err.name === "NotAllowedError") toast("Tap play to start the preview");
      });
    } else {
      audio.pause();
    }
    if ("mediaSession" in navigator) navigator.mediaSession.playbackState = isPlaying ? "playing" : "paused";
  }, [isPlaying, current]);

  useEffect(() => {
    if (audioRef.current) audioRef.current.volume = volume;
  }, [volume]);

  useEffect(() => {
    if (audioRef.current) audioRef.current.muted = muted;
  }, [muted]);

  useEffect(() => {
    const audio = audioRef.current;
    if (seekTo == null || !audio) return;
    try {
      audio.currentTime = seekTo;
    } catch {}
    usePlayer.getState()._consumeSeek();
  }, [seekTo]);

  // Media session actions + keyboard shortcuts.
  useEffect(() => {
    const s = usePlayer.getState;
    if ("mediaSession" in navigator) {
      const ms = navigator.mediaSession;
      ms.setActionHandler("play", () => s().resume());
      ms.setActionHandler("pause", () => s().pause());
      ms.setActionHandler("previoustrack", () => s().prev());
      ms.setActionHandler("nexttrack", () => s().next());
      try {
        ms.setActionHandler("seekto", (d) => d.seekTime != null && s().seek(d.seekTime));
      } catch {}
    }
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.isContentEditable || ["INPUT", "TEXTAREA", "SELECT", "BUTTON"].includes(t.tagName))) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (!s().current) return;
      if (e.code === "Space") {
        e.preventDefault();
        s().toggle();
      } else if (e.key === "ArrowRight" && e.shiftKey) {
        s().next();
      } else if (e.key === "ArrowLeft" && e.shiftKey) {
        s().prev();
      } else if (e.key.toLowerCase() === "m") {
        s().toggleMute();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return null;
}
