"use client";

import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { fieldBase } from "./input";

export interface SelectOption {
  value: string;
  label: ReactNode;
  disabled?: boolean;
  /** Plain text used for type-ahead when the label isn't a string. */
  text?: string;
}

const optionText = (o: SelectOption) => (o.text ?? (typeof o.label === "string" ? o.label : String(o.value))).toLowerCase();

/**
 * Styled select (WAI-ARIA "select-only combobox"). Replaces the browser's
 * native dropdown, whose option list can't follow the site's dark theme.
 * Keyboard: arrows, Home/End, Enter/Space, Escape, Tab and type-ahead.
 */
export function Select({
  value,
  onChange,
  options,
  placeholder = "Select…",
  id,
  disabled,
  className,
  "aria-label": ariaLabel,
  "aria-invalid": ariaInvalid,
}: {
  value: string;
  onChange: (value: string) => void;
  options: readonly SelectOption[];
  placeholder?: string;
  id?: string;
  disabled?: boolean;
  className?: string;
  "aria-label"?: string;
  "aria-invalid"?: boolean;
}) {
  const autoId = useId();
  const triggerId = id ?? `select-${autoId}`;
  const listId = `${triggerId}-list`;
  const optionId = (i: number) => `${triggerId}-opt-${i}`;

  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [pos, setPos] = useState<{ top: number; left: number; width: number; maxHeight: number } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const typed = useRef({ text: "", at: 0 });

  const selectedIndex = options.findIndex((o) => o.value === value);
  const selected = selectedIndex >= 0 ? options[selectedIndex] : null;

  const step = useCallback(
    (from: number, dir: 1 | -1) => {
      if (!options.length) return -1;
      let i = from;
      for (let n = 0; n < options.length; n++) {
        i = (i + dir + options.length) % options.length;
        if (!options[i].disabled) return i;
      }
      return from;
    },
    [options],
  );

  const openList = (startAt?: number) => {
    if (disabled) return;
    setActive(startAt ?? (selectedIndex >= 0 && !options[selectedIndex].disabled ? selectedIndex : step(-1, 1)));
    setOpen(true);
  };

  const close = (focusTrigger = false) => {
    setOpen(false);
    if (focusTrigger) triggerRef.current?.focus();
  };

  const commit = (i: number) => {
    const o = options[i];
    if (!o || o.disabled) return;
    if (o.value !== value) onChange(o.value);
    close(true);
  };

  const place = useCallback(() => {
    const r = triggerRef.current?.getBoundingClientRect();
    if (!r) return;
    const gap = 8;
    const margin = 8;
    const height = listRef.current?.scrollHeight ?? 0;
    const spaceBelow = window.innerHeight - r.bottom - gap - margin;
    const spaceAbove = r.top - gap - margin;
    const below = spaceBelow >= Math.min(height, 280) || spaceBelow >= spaceAbove;
    const maxHeight = Math.max(160, Math.min(320, below ? spaceBelow : spaceAbove));
    const shown = Math.min(height, maxHeight);
    const width = Math.max(r.width, 176);
    const left = Math.min(Math.max(margin, r.left), window.innerWidth - width - margin);
    setPos({ top: below ? r.bottom + gap : r.top - gap - shown, left, width, maxHeight });
  }, []);

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
      const t = e.target as Node;
      if (triggerRef.current?.contains(t) || listRef.current?.contains(t)) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  // Keep the highlighted option visible while moving with the keyboard.
  useEffect(() => {
    if (open && pos && active >= 0) document.getElementById(optionId(active))?.scrollIntoView({ block: "nearest" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, pos !== null, active]);

  const typeAhead = (key: string) => {
    const now = Date.now();
    typed.current = { text: (now - typed.current.at > 600 ? "" : typed.current.text) + key.toLowerCase(), at: now };
    const query = typed.current.text;
    const start = open ? active : selectedIndex;
    for (let n = 1; n <= options.length; n++) {
      const i = (Math.max(start, 0) + (query.length > 1 ? n - 1 : n)) % options.length;
      if (!options[i].disabled && optionText(options[i]).startsWith(query)) {
        if (open) setActive(i);
        else if (options[i].value !== value) onChange(options[i].value);
        return;
      }
    }
  };

  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (disabled) return;
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        if (open) setActive((i) => step(i, 1));
        else openList();
        break;
      case "ArrowUp":
        e.preventDefault();
        if (open) setActive((i) => step(i, -1));
        else openList();
        break;
      case "Home":
        if (open) {
          e.preventDefault();
          setActive(step(-1, 1));
        }
        break;
      case "End":
        if (open) {
          e.preventDefault();
          setActive(step(options.length, -1));
        }
        break;
      case "Enter":
      case " ":
        e.preventDefault();
        if (open) commit(active);
        else openList();
        break;
      case "Escape":
        if (open) {
          e.preventDefault();
          close();
        }
        break;
      case "Tab":
        if (open) close();
        break;
      default:
        if (e.key.length === 1 && !e.metaKey && !e.ctrlKey && !e.altKey) typeAhead(e.key);
    }
  };

  return (
    <>
      <button
        ref={triggerRef}
        id={triggerId}
        type="button"
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-activedescendant={open && active >= 0 ? optionId(active) : undefined}
        aria-label={ariaLabel}
        aria-invalid={ariaInvalid || undefined}
        disabled={disabled}
        onClick={() => (open ? close() : openList())}
        onKeyDown={onKeyDown}
        className={cn(fieldBase, "flex h-11 cursor-pointer items-center justify-between gap-2 pl-4 pr-3 text-left", open && "border-accent/70 bg-white/[0.05]", className)}
      >
        <span className={cn("truncate", !selected && "text-ink-400")}>{selected ? selected.label : placeholder}</span>
        <ChevronDown className={cn("h-4 w-4 shrink-0 text-ink-300 transition-transform duration-200", open && "rotate-180")} aria-hidden />
      </button>
      {open &&
        createPortal(
          <div
            ref={listRef}
            id={listId}
            role="listbox"
            aria-labelledby={ariaLabel ? undefined : triggerId}
            aria-label={ariaLabel}
            style={
              pos
                ? { position: "fixed", top: pos.top, left: pos.left, width: pos.width, maxHeight: pos.maxHeight }
                : { position: "fixed", top: 0, left: 0, visibility: "hidden" }
            }
            className="glass-strong z-[110] animate-fade-in overflow-y-auto overscroll-contain rounded-2xl p-1.5 shadow-2xl"
          >
            {options.map((o, i) => {
              const isSelected = o.value === value;
              return (
                <div
                  key={o.value}
                  id={optionId(i)}
                  role="option"
                  aria-selected={isSelected}
                  aria-disabled={o.disabled || undefined}
                  onMouseEnter={() => !o.disabled && setActive(i)}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => commit(i)}
                  className={cn(
                    "flex cursor-pointer items-center justify-between gap-3 rounded-xl px-3 py-2.5 text-sm transition-colors",
                    i === active ? "bg-white/[0.08] text-white" : "text-ink-200",
                    isSelected && "font-medium text-white",
                    o.disabled && "cursor-not-allowed opacity-40",
                  )}
                >
                  <span className="truncate">{o.label}</span>
                  {isSelected && <Check className="h-4 w-4 shrink-0 text-accent-300" aria-hidden />}
                </div>
              );
            })}
          </div>,
          document.body,
        )}
    </>
  );
}
