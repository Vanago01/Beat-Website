import Image from "next/image";
import { coverUrl } from "@/lib/storage";
import { cn, hashString } from "@/lib/utils";

/** Beat artwork with a generative fallback for beats without a cover. */
export function BeatCover({
  path,
  title,
  seed,
  sizes = "(max-width: 768px) 50vw, 280px",
  priority,
  className,
  showTitle = true,
}: {
  path?: string | null;
  title: string;
  seed?: string;
  sizes?: string;
  priority?: boolean;
  className?: string;
  showTitle?: boolean;
}) {
  const src = coverUrl(path);
  if (src) {
    return (
      <div className={cn("force-dark relative overflow-hidden bg-ink-800", className)}>
        <Image
          src={src}
          alt={`${title} — cover art`}
          fill
          sizes={sizes}
          priority={priority}
          className="object-cover transition-transform duration-700 ease-out group-hover:scale-[1.045]"
        />
      </div>
    );
  }

  const h = hashString(seed ?? title);
  const hue = h % 360;
  const hue2 = (hue + 50 + ((h >> 9) % 90)) % 360;
  const x = 18 + (h % 55);
  const y = 12 + ((h >> 5) % 45);

  return (
    <div
      className={cn("relative overflow-hidden", className)}
      style={{
        background: `radial-gradient(110% 85% at ${x}% ${y}%, hsl(${hue} 72% 58% / 0.85), transparent 58%),
          radial-gradient(90% 80% at ${100 - x}% 100%, hsl(${hue2} 80% 52% / 0.75), transparent 60%),
          linear-gradient(160deg, #15151c, #07070a)`,
      }}
      role="img"
      aria-label={`${title} — cover art`}
    >
      <svg viewBox="0 0 100 100" className="absolute inset-0 h-full w-full opacity-[0.22] mix-blend-overlay" aria-hidden>
        {Array.from({ length: 7 }, (_, i) => (
          <circle key={i} cx="50" cy="50" r={8 + i * 7} fill="none" stroke="white" strokeWidth="0.35" />
        ))}
      </svg>
      {showTitle && (
        <span className="absolute bottom-[9%] left-[9%] right-[9%] line-clamp-2 font-display text-[clamp(0.7rem,4.5cqw,1.35rem)] font-bold uppercase leading-[1.05] tracking-tight text-white/90 [container-type:inline-size]">
          {title}
        </span>
      )}
    </div>
  );
}
