import { LoaderCircle } from "lucide-react";
import type { ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

const base =
  "relative inline-flex select-none items-center justify-center gap-2 whitespace-nowrap rounded-full font-medium tracking-[-0.01em] transition-all duration-200 ease-out active:scale-[0.97] disabled:pointer-events-none disabled:opacity-45";

const variants = {
  primary:
    "bg-white text-ink-950 hover:bg-ink-100 shadow-[0_0_0_1px_color-mix(in_oklab,var(--color-white)_12%,transparent),0_10px_32px_-12px_color-mix(in_oklab,var(--color-white)_45%,transparent)]",
  accent:
    "bg-accent-gradient text-on-accent hover:brightness-110 shadow-[0_12px_40px_-12px_color-mix(in_oklab,var(--color-accent)_80%,transparent)]",
  secondary: "glass text-ink-50 hover:bg-white/[0.08] hover:border-white/15",
  outline: "border border-white/15 text-ink-50 hover:border-white/30 hover:bg-white/[0.04]",
  ghost: "text-ink-200 hover:bg-white/[0.06] hover:text-ink-50",
  danger: "border border-danger/30 bg-danger/10 text-danger hover:bg-danger/20",
} as const;

const sizes = {
  xs: "h-7 px-3 text-xs",
  sm: "h-9 px-4 text-[13px]",
  md: "h-11 px-5 text-sm",
  lg: "h-12 px-7 text-[15px]",
  xl: "h-14 px-9 text-base",
  icon: "h-11 w-11",
  "icon-sm": "h-9 w-9",
  "icon-xs": "h-7 w-7",
} as const;

export type ButtonVariant = keyof typeof variants;
export type ButtonSize = keyof typeof sizes;

export function buttonVariants({
  variant = "primary",
  size = "md",
  className,
}: { variant?: ButtonVariant; size?: ButtonSize; className?: string } = {}) {
  return cn(base, variants[variant], sizes[size], className);
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
}

export function Button({ variant, size, loading, className, children, disabled, type = "button", ...props }: ButtonProps) {
  return (
    <button
      type={type}
      className={buttonVariants({ variant, size, className })}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading && <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden />}
      {children}
    </button>
  );
}
