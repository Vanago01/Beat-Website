"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

function useMounted() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return mounted;
}

let lockCount = 0;
function useScrollLock(active: boolean) {
  useEffect(() => {
    if (!active) return;
    lockCount++;
    const prev = document.documentElement.style.overflow;
    document.documentElement.style.overflow = "hidden";
    return () => {
      lockCount--;
      if (lockCount === 0) document.documentElement.style.overflow = prev;
    };
  }, [active]);
}

function useOverlayBehaviour(open: boolean, onClose: () => void, panel: React.RefObject<HTMLElement | null>) {
  useScrollLock(open);
  // Read the latest onClose without re-running the effect: callers often pass
  // an inline function, and re-running would yank focus back to the panel on
  // every re-render (e.g. while dragging a slider inside the dialog).
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });
  useEffect(() => {
    if (!open) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onCloseRef.current();
      }
      if (e.key === "Tab" && panel.current) {
        const focusables = panel.current.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        );
        if (focusables.length === 0) return;
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", onKey);
    const t = window.setTimeout(() => {
      const target = panel.current?.querySelector<HTMLElement>("[data-autofocus]") ?? panel.current;
      target?.focus({ preventScroll: true });
    }, 30);
    return () => {
      document.removeEventListener("keydown", onKey);
      window.clearTimeout(t);
      previouslyFocused?.focus?.({ preventScroll: true });
    };
  }, [open, panel]);
}

export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = "md",
  className,
}: {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  size?: "sm" | "md" | "lg" | "xl";
  className?: string;
}) {
  const mounted = useMounted();
  const panel = useRef<HTMLDivElement>(null);
  const titleId = useId();
  useOverlayBehaviour(open, onClose, panel);
  if (!mounted || !open) return null;

  const widths = { sm: "max-w-md", md: "max-w-lg", lg: "max-w-2xl", xl: "max-w-4xl" };

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-end justify-center p-0 sm:items-center sm:p-6">
      <div className="absolute inset-0 animate-fade-in bg-black/70 backdrop-blur-sm" onClick={onClose} aria-hidden />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        tabIndex={-1}
        className={cn(
          "glass-strong relative flex max-h-[92dvh] w-full animate-fade-up flex-col overflow-hidden rounded-t-3xl shadow-2xl outline-none sm:rounded-3xl",
          widths[size],
          className,
        )}
      >
        {(title || description) && (
          <div className="flex items-start justify-between gap-4 border-b border-white/[0.06] px-6 pb-4 pt-5">
            <div>
              {title && (
                <h2 id={titleId} className="font-display text-xl font-bold tracking-tight">
                  {title}
                </h2>
              )}
              {description && <p className="mt-1 text-sm text-ink-300">{description}</p>}
            </div>
            <button
              onClick={onClose}
              className="-mr-2 grid h-9 w-9 shrink-0 place-items-center rounded-full text-ink-300 transition hover:bg-white/10 hover:text-white"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )}
        <div className="flex-1 overflow-y-auto px-6 py-5">{children}</div>
        {footer && <div className="border-t border-white/[0.06] px-6 py-4">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}

export function Sheet({
  open,
  onClose,
  side = "right",
  children,
  className,
  label,
}: {
  open: boolean;
  onClose: () => void;
  side?: "right" | "left" | "bottom";
  children: ReactNode;
  className?: string;
  label: string;
}) {
  const mounted = useMounted();
  const panel = useRef<HTMLDivElement>(null);
  useOverlayBehaviour(open, onClose, panel);
  if (!mounted || !open) return null;

  const position = {
    right: "inset-y-0 right-0 h-full w-[min(26rem,100vw)] border-l animate-[sheet-in-right_0.45s_var(--ease-out-expo)_both]",
    left: "inset-y-0 left-0 h-full w-[min(22rem,100vw)] border-r animate-[sheet-in-left_0.45s_var(--ease-out-expo)_both]",
    bottom: "inset-x-0 bottom-0 max-h-[90dvh] w-full rounded-t-3xl border-t animate-[sheet-in-bottom_0.45s_var(--ease-out-expo)_both]",
  }[side];

  return createPortal(
    <div className="fixed inset-0 z-[100]">
      <style>{`
        @keyframes sheet-in-right { from { transform: translateX(100%) } to { transform: none } }
        @keyframes sheet-in-left { from { transform: translateX(-100%) } to { transform: none } }
        @keyframes sheet-in-bottom { from { transform: translateY(100%) } to { transform: none } }
      `}</style>
      <div className="absolute inset-0 animate-fade-in bg-black/65 backdrop-blur-sm" onClick={onClose} aria-hidden />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        tabIndex={-1}
        className={cn("glass-strong absolute flex flex-col overflow-y-auto border-white/[0.08] outline-none", position, className)}
      >
        {children}
      </div>
    </div>,
    document.body,
  );
}
