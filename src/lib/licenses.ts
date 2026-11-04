import { formatLimit } from "./format";
import type { LicenseSnapshot } from "./types";
import type { LicenseType } from "./constants";

type Terms = Pick<
  LicenseSnapshot,
  | "includes_mp3"
  | "includes_wav"
  | "includes_stems"
  | "distribution_limit"
  | "streams_limit"
  | "music_videos"
  | "radio_stations"
  | "allow_live_performances"
  | "allow_for_profit"
> & { type?: LicenseType; license_type?: LicenseType };

export function licenseFiles(t: Terms) {
  const type = t.type ?? t.license_type;
  if (type === "free") return ["Tagged MP3"];
  const files: string[] = [];
  if (t.includes_mp3) files.push("MP3");
  if (t.includes_wav) files.push("WAV");
  if (t.includes_stems) files.push("Stems");
  return files;
}

export function licenseHighlights(t: Terms) {
  const isExclusive = (t.type ?? t.license_type) === "exclusive";
  const rows: { label: string; value: string; positive: boolean }[] = [
    {
      label: "Distribution",
      value: t.distribution_limit == null ? "Unlimited copies" : formatLimit(t.distribution_limit, "copies"),
      positive: t.distribution_limit !== 0,
    },
    {
      label: "Audio streams",
      value: t.streams_limit == null ? "Unlimited" : t.streams_limit === 0 ? "Not included" : t.streams_limit.toLocaleString("en"),
      positive: t.streams_limit !== 0,
    },
    {
      label: "Music videos",
      value: t.music_videos == null ? "Unlimited" : t.music_videos === 0 ? "Not included" : String(t.music_videos),
      positive: t.music_videos !== 0,
    },
    {
      label: "Radio broadcasting",
      value: t.radio_stations == null ? "Unlimited stations" : t.radio_stations === 0 ? "Not included" : `${t.radio_stations} station${t.radio_stations === 1 ? "" : "s"}`,
      positive: t.radio_stations !== 0,
    },
    { label: "Live performances", value: t.allow_live_performances ? "Allowed" : "Not allowed", positive: t.allow_live_performances },
    { label: "Commercial use", value: t.allow_for_profit ? "For-profit allowed" : "Non-profit only", positive: t.allow_for_profit },
  ];
  if (isExclusive) rows.push({ label: "Ownership", value: "Exclusive — beat removed from sale", positive: true });
  return rows;
}
