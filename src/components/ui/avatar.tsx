import Image from "next/image";
import { avatarUrl } from "@/lib/storage";
import { cn, hashString } from "@/lib/utils";

const GRADIENTS = [
  ["#7c6cff", "#3d8bff"],
  ["#ff6b9a", "#7c6cff"],
  ["#3ddc97", "#3d8bff"],
  ["#ffc857", "#ff6b6b"],
  ["#9a8cff", "#2b2b38"],
  ["#00d4ff", "#7c6cff"],
];

export function Avatar({
  path,
  name,
  size = 40,
  className,
  ring,
}: {
  path?: string | null;
  name: string;
  size?: number;
  className?: string;
  ring?: boolean;
}) {
  const src = avatarUrl(path);
  const initials = name
    .replace(/[^\p{L}\p{N} ]/gu, "")
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join("") || "?";
  const [a, b] = GRADIENTS[hashString(name) % GRADIENTS.length];

  return (
    <span
      className={cn(
        "relative inline-grid shrink-0 place-items-center overflow-hidden rounded-full bg-ink-700 font-semibold text-white",
        ring && "ring-2 ring-white/10",
        className,
      )}
      style={{
        width: size,
        height: size,
        fontSize: Math.max(10, size * 0.36),
        backgroundImage: src ? undefined : `linear-gradient(135deg, ${a}, ${b})`,
      }}
    >
      {src ? (
        <Image src={src} alt={name} fill sizes={`${size * 2}px`} className="object-cover" />
      ) : (
        <span aria-hidden>{initials}</span>
      )}
    </span>
  );
}
