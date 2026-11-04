import type { InputHTMLAttributes, ReactNode, TextareaHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export const fieldBase =
  "w-full rounded-xl border border-white/[0.08] bg-white/[0.03] text-sm text-ink-50 placeholder:text-ink-400 outline-none transition duration-200 hover:border-white/[0.14] focus:border-accent/70 focus:bg-white/[0.05] focus:ring-4 focus:ring-accent/15 disabled:cursor-not-allowed disabled:opacity-50 aria-[invalid=true]:border-danger/60";

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(fieldBase, "h-11 px-4", className)} {...props} />;
}

export function Textarea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cn(fieldBase, "min-h-28 resize-y px-4 py-3 leading-relaxed", className)} {...props} />;
}

export function Label({ className, ...props }: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return <label className={cn("text-[13px] font-medium text-ink-100", className)} {...props} />;
}

export function Field({
  label,
  htmlFor,
  hint,
  error,
  children,
  className,
  optional,
}: {
  label?: ReactNode;
  htmlFor?: string;
  hint?: ReactNode;
  error?: string | null;
  children: ReactNode;
  className?: string;
  optional?: boolean;
}) {
  return (
    <div className={cn("flex flex-col gap-2", className)}>
      {label && (
        <Label htmlFor={htmlFor} className="flex items-center gap-2">
          {label}
          {optional && <span className="text-xs font-normal text-ink-400">Optional</span>}
        </Label>
      )}
      {children}
      {error ? (
        <p className="text-xs text-danger" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p className="text-xs leading-relaxed text-ink-400">{hint}</p>
      ) : null}
    </div>
  );
}
