"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent } from "react";
import { Minus, Plus, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/overlay";

export interface CropPreset {
  title: string;
  /** Width ÷ height of the result. */
  aspect: number;
  outputWidth: number;
  shape: "circle" | "rect";
  /** Optional guide for the part narrow screens show (width ÷ height). */
  phoneAspect?: number;
}

export const AVATAR_CROP: CropPreset = { title: "Adjust profile picture", aspect: 1, outputWidth: 640, shape: "circle" };
// Profile banners are wide on desktop and much narrower on phones.
export const BANNER_CROP: CropPreset = { title: "Adjust banner", aspect: 4, outputWidth: 2000, shape: "rect", phoneAspect: 1.75 };

const MAX_ZOOM = 4;
const clampNum = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

/**
 * Lets people frame an image before it's uploaded: drag to move, zoom with the
 * slider, mouse wheel, pinch or keyboard. Produces a JPEG of the framed area.
 */
export function ImageCropper({
  file,
  preset,
  onCancel,
  onConfirm,
}: {
  file: File | null;
  preset: CropPreset;
  onCancel: () => void;
  onConfirm: (image: Blob) => Promise<void>;
}) {
  const [src, setSrc] = useState<string | null>(null);
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [frame, setFrame] = useState({ w: 0, h: 0 });
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [busy, setBusy] = useState(false);
  const frameRef = useRef<HTMLDivElement | null>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{ distance: number; zoom: number } | null>(null);
  const zoomRef = useRef(1);
  zoomRef.current = zoom;

  // Load the chosen file.
  useEffect(() => {
    if (!file) return;
    const url = URL.createObjectURL(file);
    let cancelled = false;
    setSrc(url);
    setImage(null);
    setZoom(1);
    setOffset({ x: 0, y: 0 });
    const img = new Image();
    img.onload = () => !cancelled && setImage(img);
    img.onerror = () => {
      if (cancelled) return;
      toast.error("This image couldn't be opened. Try a JPG or PNG.");
      onCancel();
    };
    img.src = url;
    return () => {
      cancelled = true;
      URL.revokeObjectURL(url);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [file]);

  // Track the framing area's size (it follows the dialog width).
  const [frameEl, setFrameEl] = useState<HTMLDivElement | null>(null);
  const setFrameNode = useCallback((node: HTMLDivElement | null) => {
    frameRef.current = node;
    setFrameEl(node);
  }, []);
  useLayoutEffect(() => {
    if (!frameEl) return;
    const measure = () => setFrame({ w: frameEl.clientWidth, h: frameEl.clientHeight });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(frameEl);
    return () => ro.disconnect();
  }, [frameEl]);

  const cover = image && frame.w ? Math.max(frame.w / image.naturalWidth, frame.h / image.naturalHeight) : 1;

  /** Keeps the image covering the whole frame. */
  const clampOffset = useCallback(
    (o: { x: number; y: number }, z: number) => {
      if (!image) return o;
      const s = cover * z;
      const maxX = Math.max(0, (image.naturalWidth * s - frame.w) / 2);
      const maxY = Math.max(0, (image.naturalHeight * s - frame.h) / 2);
      return { x: clampNum(o.x, -maxX, maxX), y: clampNum(o.y, -maxY, maxY) };
    },
    [image, cover, frame.w, frame.h],
  );

  const applyZoom = useCallback(
    (next: number) => {
      const z = clampNum(next, 1, MAX_ZOOM);
      const ratio = z / zoomRef.current;
      setZoom(z);
      setOffset((o) => clampOffset({ x: o.x * ratio, y: o.y * ratio }, z));
    },
    [clampOffset],
  );

  // Re-clamp when the frame is resized.
  useEffect(() => {
    setOffset((o) => clampOffset(o, zoomRef.current));
  }, [clampOffset]);

  // Mouse wheel zoom (needs a non-passive listener to stop the page scrolling).
  useEffect(() => {
    if (!frameEl) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      applyZoom(zoomRef.current * (e.deltaY < 0 ? 1.08 : 1 / 1.08));
    };
    frameEl.addEventListener("wheel", onWheel, { passive: false });
    return () => frameEl.removeEventListener("wheel", onWheel);
  }, [frameEl, applyZoom]);

  const distance = () => {
    const [a, b] = [...pointers.current.values()];
    return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0;
  };

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 2) pinch.current = { distance: distance(), zoom: zoomRef.current };
  };
  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const prev = pointers.current.get(e.pointerId);
    if (!prev) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size >= 2 && pinch.current) {
      const d = distance();
      if (d > 0 && pinch.current.distance > 0) applyZoom((pinch.current.zoom * d) / pinch.current.distance);
    } else if (pointers.current.size === 1) {
      const dx = e.clientX - prev.x;
      const dy = e.clientY - prev.y;
      setOffset((o) => clampOffset({ x: o.x + dx, y: o.y + dy }, zoomRef.current));
    }
  };
  const onPointerEnd = (e: React.PointerEvent<HTMLDivElement>) => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinch.current = null;
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const stepPx = e.shiftKey ? 40 : 10;
    // Arrow keys move the image the same way dragging does.
    const moves: Record<string, [number, number]> = { ArrowLeft: [-stepPx, 0], ArrowRight: [stepPx, 0], ArrowUp: [0, -stepPx], ArrowDown: [0, stepPx] };
    if (moves[e.key]) {
      e.preventDefault();
      const [dx, dy] = moves[e.key];
      setOffset((o) => clampOffset({ x: o.x + dx, y: o.y + dy }, zoomRef.current));
    } else if (e.key === "+" || e.key === "=") {
      e.preventDefault();
      applyZoom(zoomRef.current * 1.1);
    } else if (e.key === "-" || e.key === "_") {
      e.preventDefault();
      applyZoom(zoomRef.current / 1.1);
    } else if (e.key === "0") {
      e.preventDefault();
      reset();
    }
  };

  const reset = () => {
    setZoom(1);
    setOffset({ x: 0, y: 0 });
  };

  const save = async () => {
    if (!image || !frame.w) return;
    setBusy(true);
    try {
      const scale = cover * zoom;
      const outW = preset.outputWidth;
      const outH = Math.round(outW / preset.aspect);
      const canvas = document.createElement("canvas");
      canvas.width = outW;
      canvas.height = outH;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Your browser couldn't prepare the image.");
      ctx.fillStyle = "#0d0d11"; // background for transparent images
      ctx.fillRect(0, 0, outW, outH);
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      // Visible area of the image, in the image's own pixels.
      const left = frame.w / 2 + offset.x - (image.naturalWidth * scale) / 2;
      const top = frame.h / 2 + offset.y - (image.naturalHeight * scale) / 2;
      ctx.drawImage(image, -left / scale, -top / scale, frame.w / scale, frame.h / scale, 0, 0, outW, outH);
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.9));
      if (!blob) throw new Error("Your browser couldn't prepare the image.");
      await onConfirm(blob);
    } catch (err) {
      toast.error("Couldn't save the image", { description: err instanceof Error ? err.message : undefined });
    } finally {
      setBusy(false);
    }
  };

  const scale = cover * zoom;
  const imgW = image ? image.naturalWidth * scale : 0;
  const imgH = image ? image.naturalHeight * scale : 0;
  const phoneWidthPct = preset.phoneAspect ? Math.min(100, (preset.phoneAspect / preset.aspect) * 100) : null;

  return (
    <Modal
      open={!!file}
      onClose={() => !busy && onCancel()}
      title={preset.title}
      description="Drag to move it. Zoom with the slider, your mouse wheel or two fingers."
      size={preset.shape === "circle" ? "md" : "xl"}
      footer={
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="ghost" onClick={onCancel} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={save} loading={busy} disabled={!image}>
            Save
          </Button>
        </div>
      }
    >
      <div
        ref={setFrameNode}
        tabIndex={0}
        role="group"
        aria-label="Image framing. Drag or use the arrow keys to move, plus and minus to zoom, 0 to reset."
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerEnd}
        onPointerCancel={onPointerEnd}
        onKeyDown={onKeyDown}
        className="relative mx-auto w-full cursor-grab touch-none select-none overflow-hidden rounded-2xl bg-ink-950 outline-none ring-accent/60 focus-visible:ring-2 active:cursor-grabbing"
        style={{ aspectRatio: String(preset.aspect), maxWidth: preset.shape === "circle" ? 360 : undefined }}
      >
        {src && image && (
          // eslint-disable-next-line @next/next/no-img-element -- local preview of the chosen file
          <img
            src={src}
            alt=""
            draggable={false}
            className="pointer-events-none absolute left-1/2 top-1/2"
            style={{ width: imgW, height: imgH, maxWidth: "none", transform: `translate(calc(-50% + ${offset.x}px), calc(-50% + ${offset.y}px))` }}
          />
        )}
        {preset.shape === "circle" && (
          <div className="pointer-events-none absolute inset-0 rounded-full shadow-[0_0_0_9999px_rgba(5,5,7,0.62)] ring-2 ring-white/80" aria-hidden />
        )}
        {phoneWidthPct !== null && (
          <div
            className="pointer-events-none absolute inset-y-0 left-1/2 -translate-x-1/2 border-x-2 border-dashed border-white/70"
            style={{ width: `${phoneWidthPct}%` }}
            aria-hidden
          />
        )}
        {!image && <div className="absolute inset-0 grid place-items-center text-sm text-ink-400">Loading image…</div>}
      </div>

      <div className="mx-auto mt-5 flex max-w-md items-center gap-3">
        <Button type="button" variant="ghost" size="icon-sm" onClick={() => applyZoom(zoom / 1.2)} aria-label="Zoom out" disabled={!image || zoom <= 1}>
          <Minus className="h-4 w-4" />
        </Button>
        <input
          type="range"
          min={1}
          max={MAX_ZOOM}
          step={0.01}
          value={zoom}
          onChange={(e) => applyZoom(Number(e.target.value))}
          aria-label="Zoom"
          disabled={!image}
          className="h-1.5 flex-1 cursor-pointer accent-[#7c6cff]"
        />
        <Button type="button" variant="ghost" size="icon-sm" onClick={() => applyZoom(zoom * 1.2)} aria-label="Zoom in" disabled={!image || zoom >= MAX_ZOOM}>
          <Plus className="h-4 w-4" />
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={reset} disabled={!image}>
          <RotateCcw className="h-4 w-4" /> Reset
        </Button>
      </div>
      {phoneWidthPct !== null && (
        <p className="mt-3 text-center text-xs text-ink-400">Phones show the part between the dashed lines — keep the important bit inside it.</p>
      )}
    </Modal>
  );
}
