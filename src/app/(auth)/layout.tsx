import { LogoMark } from "@/components/layout/logo";

export default function AuthLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="mx-auto grid min-h-[calc(100dvh-68px)] max-w-[1400px] items-stretch gap-8 px-4 py-8 sm:px-6 lg:grid-cols-2 lg:px-8">
      <div className="relative hidden overflow-hidden rounded-[2rem] border border-white/[0.07] bg-ink-900 lg:block">
        <div className="absolute inset-0 animate-glow [background:radial-gradient(60%_50%_at_30%_25%,color-mix(in_oklab,var(--color-accent)_45%,transparent),transparent_70%),radial-gradient(50%_45%_at_80%_85%,color-mix(in_oklab,var(--color-electric)_30%,transparent),transparent_70%)]" />
        <svg viewBox="0 0 400 400" className="absolute inset-0 h-full w-full opacity-[0.18]" aria-hidden>
          {Array.from({ length: 14 }, (_, i) => (
            <circle key={i} cx="200" cy="200" r={20 + i * 16} fill="none" stroke="white" strokeWidth="0.6" />
          ))}
        </svg>
        <div className="relative flex h-full flex-col justify-between p-12">
          <LogoMark className="h-11 w-11" />
          <div>
            <p className="font-display text-6xl font-extrabold leading-[0.9] tracking-[-0.05em]">
              Find
              <br />
              Your Sound.
            </p>
            <p className="mt-5 max-w-sm text-ink-200">Premium beats from independent producers. Preview instantly, license in seconds, download forever.</p>
          </div>
        </div>
      </div>
      <div className="flex items-center justify-center py-6">
        <div className="w-full max-w-md">{children}</div>
      </div>
    </div>
  );
}
