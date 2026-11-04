"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

export function Switch({
  checked,
  onChange,
  disabled,
  label,
  id,
  size = "md",
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
  label?: string;
  id?: string;
  size?: "sm" | "md";
}) {
  return (
    <button
      id={id}
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative inline-flex shrink-0 cursor-pointer items-center rounded-full border transition-colors duration-200 disabled:cursor-not-allowed disabled:opacity-50",
        size === "md" ? "h-6 w-11" : "h-5 w-9",
        checked ? "border-accent/60 bg-accent" : "border-white/10 bg-white/[0.08]",
      )}
    >
      <span
        className={cn(
          "inline-block rounded-full bg-white shadow transition-transform duration-200",
          size === "md" ? "h-[18px] w-[18px]" : "h-[14px] w-[14px]",
          checked ? (size === "md" ? "translate-x-[22px]" : "translate-x-[18px]") : "translate-x-[3px]",
        )}
      />
    </button>
  );
}

export function Segmented<T extends string>({
  value,
  onChange,
  options,
  className,
  size = "md",
}: {
  value: T;
  onChange: (value: T) => void;
  options: { value: T; label: ReactNode; title?: string }[];
  className?: string;
  size?: "sm" | "md";
}) {
  return (
    <div
      role="radiogroup"
      className={cn("inline-flex items-center gap-0.5 rounded-full border border-white/[0.08] bg-white/[0.03] p-1", className)}
    >
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          title={o.title}
          onClick={() => onChange(o.value)}
          className={cn(
            "inline-flex items-center justify-center gap-1.5 rounded-full font-medium transition-all",
            size === "md" ? "h-8 px-3.5 text-[13px]" : "h-7 px-2.5 text-xs",
            value === o.value ? "bg-white text-ink-950 shadow" : "text-ink-300 hover:text-ink-50",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Chip({
  active,
  onClick,
  children,
  className,
}: {
  active?: boolean;
  onClick?: () => void;
  children: ReactNode;
  className?: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "inline-flex h-9 items-center gap-1.5 rounded-full border px-4 text-[13px] font-medium transition-all duration-200",
        active
          ? "border-white bg-white text-ink-950 shadow-[0_6px_24px_-8px_rgba(255,255,255,0.5)]"
          : "border-white/[0.09] bg-white/[0.02] text-ink-200 hover:border-white/25 hover:text-ink-50",
        className,
      )}
    >
      {children}
    </button>
  );
}

/** Minimal accessible dropdown menu. */
export function Dropdown({
  trigger,
  children,
  align = "end",
  className,
}: {
  trigger: (props: { open: boolean; toggle: () => void }) => ReactNode;
  children: (close: () => void) => ReactNode;
  align?: "start" | "end";
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      {trigger({ open, toggle: () => setOpen((o) => !o) })}
      {open && (
        <div
          role="menu"
          className={cn(
            "glass-strong absolute top-[calc(100%+10px)] z-50 min-w-56 animate-fade-up overflow-hidden rounded-2xl p-1.5 shadow-2xl",
            align === "end" ? "right-0" : "left-0",
            className,
          )}
        >
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  );
}

export function MenuItem({
  children,
  onClick,
  className,
  danger,
}: {
  children: ReactNode;
  onClick?: () => void;
  className?: string;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm transition-colors",
        danger ? "text-danger hover:bg-danger/10" : "text-ink-100 hover:bg-white/[0.07]",
        className,
      )}
    >
      {children}
    </button>
  );
}
