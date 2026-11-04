import type { SocialKey } from "@/lib/constants";

/** Simple monochrome glyphs for social platforms. */
export function SocialIcon({ name, className = "h-4 w-4" }: { name: SocialKey; className?: string }) {
  const common = { className, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true };
  switch (name) {
    case "instagram":
      return (
        <svg {...common}>
          <rect x="3" y="3" width="18" height="18" rx="5" />
          <circle cx="12" cy="12" r="4" />
          <circle cx="17.5" cy="6.5" r="0.6" fill="currentColor" />
        </svg>
      );
    case "youtube":
      return (
        <svg {...common}>
          <rect x="2.5" y="5.5" width="19" height="13" rx="4" />
          <path d="M10.5 9.5v5l4.5-2.5z" fill="currentColor" stroke="none" />
        </svg>
      );
    case "tiktok":
      return (
        <svg {...common}>
          <path d="M14 3v11.5a3.5 3.5 0 1 1-3.5-3.5" />
          <path d="M14 3c.5 2.8 2.4 4.6 5 5" />
        </svg>
      );
    case "x":
      return (
        <svg {...common}>
          <path d="M4 4l16 16M20 4L4 20" />
        </svg>
      );
    case "soundcloud":
      return (
        <svg {...common}>
          <path d="M9 17V9m3 8V7.5m-6 9.5v-5m-3 5v-3" />
          <path d="M14 17h4.5a3 3 0 0 0 0-6 5 5 0 0 0-4.5-3.5" />
        </svg>
      );
    case "spotify":
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="9.5" />
          <path d="M7.5 9.5c3-1 6.5-.8 9 .7M8 12.6c2.5-.7 5.2-.5 7.3.7M8.6 15.4c2-.5 4-.3 5.6.6" />
        </svg>
      );
    default:
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="9.5" />
          <path d="M2.5 12h19M12 2.5c2.6 2.6 3.9 5.8 3.9 9.5s-1.3 6.9-3.9 9.5c-2.6-2.6-3.9-5.8-3.9-9.5s1.3-6.9 3.9-9.5z" />
        </svg>
      );
  }
}
