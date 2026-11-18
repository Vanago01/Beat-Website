// Installers of the plug-ins offered on the site live in the private "plugin-files"
// storage bucket, one folder per plug-in:
//
//   dlay/DLAY-1.1.0-Windows.zip
//   dlay/DLAY-1.1.0-macOS.zip
//
// The name says which system a file is for and which version it is. The site offers the
// highest version it finds for each system, so publishing a new version is: upload the two
// new files. (Pure helpers: used on the server and in the browser.)

export const PLUGIN_PLATFORMS = ["windows", "macos"] as const;
export type PluginPlatform = (typeof PLUGIN_PLATFORMS)[number];

export const PLATFORM_LABEL: Record<PluginPlatform, string> = { windows: "Windows", macos: "Mac" };

export function isPluginPlatform(value: unknown): value is PluginPlatform {
  return typeof value === "string" && (PLUGIN_PLATFORMS as readonly string[]).includes(value);
}

export interface PluginFile {
  platform: PluginPlatform;
  version: string;
  /** Object name inside the bucket, e.g. "dlay/DLAY-1.1.0-Windows.zip". */
  path: string;
  /** File name the browser saves it under. */
  name: string;
  size: number;
  updatedAt: string | null;
}

/** What a page may show about a download: no storage paths. */
export type PluginDownloadInfo = Pick<PluginFile, "version" | "size" | "updatedAt">;

// <Name>-<version>-<Windows|macOS>.<zip|exe|pkg|dmg>
const FILE_NAME = /^[a-z0-9]+-(\d{1,4}(?:\.\d{1,4}){0,3})-(windows|macos)\.(?:zip|exe|pkg|dmg)$/i;

export function parsePluginFileName(name: string): { platform: PluginPlatform; version: string } | null {
  const match = FILE_NAME.exec(name);
  if (!match) return null;
  return { version: match[1], platform: match[2].toLowerCase() as PluginPlatform };
}

/** Compares "1.10.0" and "1.9" the way people read them. Negative when a is older than b. */
export function compareVersions(a: string, b: string) {
  const left = a.split(".").map(Number);
  const right = b.split(".").map(Number);
  for (let i = 0; i < Math.max(left.length, right.length); i++) {
    const diff = (left[i] ?? 0) - (right[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

/** The highest version of each system. Of two files with the same version, the newer upload wins. */
export function newestPerPlatform(files: PluginFile[]): Partial<Record<PluginPlatform, PluginFile>> {
  const newest: Partial<Record<PluginPlatform, PluginFile>> = {};
  for (const file of files) {
    const current = newest[file.platform];
    const order = current ? compareVersions(file.version, current.version) : 1;
    if (order > 0 || (order === 0 && (file.updatedAt ?? "") > (current?.updatedAt ?? ""))) newest[file.platform] = file;
  }
  return newest;
}

export function formatFileSize(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) return "";
  const mb = bytes / (1024 * 1024);
  return mb >= 10 ? `${Math.round(mb)} MB` : `${mb.toFixed(1)} MB`;
}
