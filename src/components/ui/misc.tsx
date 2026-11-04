import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/utils";

export function Badge({
  className,
  tone = "default",
  ...props
}: HTMLAttributes<HTMLSpanElement> & {
  tone?: "default" | "accent" | "success" | "warning" | "danger" | "outline" | "solid";
}) {
  const tones = {
    default: "bg-white/[0.06] text-ink-200 border border-white/[0.06]",
    accent: "bg-accent/15 text-accent-300 border border-accent/25",
    success: "bg-success/10 text-success border border-success/25",
    warning: "bg-warning/10 text-warning border border-warning/25",
    danger: "bg-danger/10 text-danger border border-danger/25",
    outline: "border border-white/15 text-ink-200",
    solid: "bg-white text-ink-950",
  } as const;
  return (
    <span
      className={cn(
        "inline-flex h-6 items-center gap-1 whitespace-nowrap rounded-full px-2.5 text-[11px] font-medium tracking-wide",
        tones[tone],
        className,
      )}
      {...props}
    />
  );
}

export function Skeleton({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("skeleton rounded-xl", className)} aria-hidden {...props} />;
}

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("rounded-3xl border border-white/[0.07] bg-ink-900/70 backdrop-blur-sm", className)}
      {...props}
    />
  );
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon?: ReactNode;
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center rounded-3xl border border-dashed border-white/10 bg-white/[0.015] px-6 py-16 text-center",
        className,
      )}
    >
      {icon && (
        <div className="mb-5 grid h-14 w-14 place-items-center rounded-2xl border border-white/10 bg-white/[0.04] text-ink-200">
          {icon}
        </div>
      )}
      <h3 className="font-display text-xl font-bold tracking-tight">{title}</h3>
      {description && <p className="mt-2 max-w-md text-sm leading-relaxed text-ink-300">{description}</p>}
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}

export function SectionHeading({
  eyebrow,
  title,
  action,
  className,
}: {
  eyebrow?: string;
  title: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("mb-6 flex items-end justify-between gap-4 md:mb-8", className)}>
      <div>
        {eyebrow && (
          <p className="mb-2 font-mono text-[11px] uppercase tracking-[0.28em] text-accent-300">{eyebrow}</p>
        )}
        <h2 className="font-display text-2xl font-bold tracking-[-0.03em] md:text-[2.1rem] md:leading-[1.1]">
          {title}
        </h2>
      </div>
      {action}
    </div>
  );
}

export function Spinner({ className }: { className?: string }) {
  return (
    <span
      className={cn("inline-block h-5 w-5 animate-spin rounded-full border-2 border-white/15 border-t-white", className)}
      aria-label="Loading"
    />
  );
}
