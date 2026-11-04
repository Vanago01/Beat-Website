"use client";

/**
 * Decodes an audio file in the browser and extracts normalised peak data for
 * waveform rendering, plus the exact duration. Runs once at upload time so
 * listeners never have to download audio just to draw a waveform.
 */
export async function analyzeAudio(file: File, bars = 180): Promise<{ peaks: number[]; duration: number }> {
  const buffer = await file.arrayBuffer();
  const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const ctx = new Ctx();
  try {
    const audio = await ctx.decodeAudioData(buffer);
    const channels = Array.from({ length: audio.numberOfChannels }, (_, c) => audio.getChannelData(c));
    const block = Math.max(1, Math.floor(audio.length / bars));
    const stride = Math.max(1, Math.floor(block / 256));
    const peaks: number[] = [];
    for (let i = 0; i < bars; i++) {
      let max = 0;
      const start = i * block;
      const end = Math.min(audio.length, start + block);
      for (const data of channels) {
        for (let j = start; j < end; j += stride) {
          const v = Math.abs(data[j]);
          if (v > max) max = v;
        }
      }
      peaks.push(max);
    }
    const top = Math.max(...peaks, 0.0001);
    return {
      peaks: peaks.map((p) => Math.round((p / top) * 1000) / 1000),
      duration: Math.round(audio.duration),
    };
  } finally {
    ctx.close().catch(() => undefined);
  }
}

export function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(0)} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
}
