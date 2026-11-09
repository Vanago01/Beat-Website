"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
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
          ? "border-white bg-white text-ink-950 shadow-[0_6px_24px_-8px_color-mix(in_oklab,var(--color-white)_50%,transparent)]"
          : "border-white/[0.09] bg-white/[0.02] text-ink-200 hover:border-white/25 hover:text-ink-50",
        className,
      )}
    >
      {children}
    </button>
  );
}

/**
 * Minimal accessible dropdown menu. The menu is rendered in a portal with fixed
 * positioning, so containers with `overflow: hidden` (lists, cards, scroll
 * areas) never clip it, and it opens upwards when there is no room below.
 */
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
  const [pos, setPos] = useState<{ top: number; left?: number; right?: number } | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const triggerButton = () => ref.current?.querySelector<HTMLElement>("button, [href], [tabindex]") ?? null;
  const menuItems = () => Array.from(menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]:not(:disabled)') ?? []);

  const close = useCallback((returnFocus = false) => {
    setOpen(false);
    if (returnFocus) triggerButton()?.focus();
  }, []);

  const place = useCallback(() => {
    const anchor = ref.current?.getBoundingClientRect();
    if (!anchor) return;
    const gap = 10;
    const margin = 8;
    const height = menuRef.current?.offsetHeight ?? 0;
    const below = anchor.bottom + gap;
    const above = anchor.top - gap - height;
    const top = below + height <= window.innerHeight - margin || above < margin ? below : above;
    setPos(
      align === "end"
        ? { top, right: Math.max(margin, window.innerWidth - anchor.right) }
        : { top, left: Math.max(margin, anchor.left) },
    );
  }, [align]);

  useLayoutEffect(() => {
    if (!open) {
      setPos(null);
      return;
    }
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open, place]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (ref.current?.contains(target) || menuRef.current?.contains(target)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close(true);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, close]);

  // Keyboard users land on the first item, like a native menu.
  useEffect(() => {
    if (open && pos) menuItems()[0]?.focus({ preventScroll: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, pos !== null]);

  const onMenuKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    const items = menuItems();
    const index = items.indexOf(document.activeElement as HTMLElement);
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const step = e.key === "ArrowDown" ? 1 : -1;
      items[(index + step + items.length) % items.length]?.focus();
    } else if (e.key === "Tab") {
      // Leave the menu and continue from the trigger in normal page order.
      close(true);
    }
  };

  return (
    <div ref={ref} className="relative">
      {trigger({ open, toggle: () => setOpen((o) => !o) })}
      {open &&
        createPortal(
          <div
            ref={menuRef}
            role="menu"
            onKeyDown={onMenuKeyDown}
            style={pos ? { position: "fixed", top: pos.top, left: pos.left, right: pos.right } : { position: "fixed", top: 0, left: 0, visibility: "hidden" }}
            className={cn("glass-strong z-[70] min-w-56 animate-fade-up overflow-hidden rounded-2xl p-1.5 shadow-2xl", className)}
          >
            {children(() => close())}
          </div>,
          document.body,
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
