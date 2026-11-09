/**
 * Theme (dark / light) and accent colour. Chosen in Account → Settings and
 * stored on this device; applied to <html data-theme data-accent> before the
 * first paint by APPEARANCE_SCRIPT (see app/layout.tsx), so cached pages stay
 * static and nothing flashes. Colours live in app/globals.css.
 */
export const THEMES = [
  { value: "dark", label: "Dark" },
  { value: "light", label: "Light" },
] as const;

export const ACCENTS = [
  { value: "purple", label: "Purple", swatch: "#7c6cff" },
  { value: "pink", label: "Pink", swatch: "#ff5ca8" },
  { value: "blue", label: "Blue", swatch: "#3d8bff" },
  { value: "green", label: "Green", swatch: "#2fce72" },
  { value: "yellow", label: "Yellow", swatch: "#facc15" },
  { value: "red", label: "Red", swatch: "#f04848" },
  { value: "mono", label: "Black & white", swatch: "linear-gradient(135deg, #f5f5f7 0 50%, #18181b 50% 100%)" },
] as const;

export type Theme = (typeof THEMES)[number]["value"];
export type Accent = (typeof ACCENTS)[number]["value"];
export interface Appearance {
  theme: Theme;
  accent: Accent;
}

export const DEFAULT_APPEARANCE: Appearance = { theme: "dark", accent: "purple" };
export const THEME_KEY = "vb-theme";
export const ACCENT_KEY = "vb-accent";
export const APPEARANCE_EVENT = "vb-appearance-change";

const isTheme = (v: unknown): v is Theme => THEMES.some((t) => t.value === v);
const isAccent = (v: unknown): v is Accent => ACCENTS.some((a) => a.value === v);

/** Runs in <head> before the page paints. Must stay tiny and dependency-free. */
export const APPEARANCE_SCRIPT = `(function(){try{var d=document.documentElement,t=localStorage.getItem("${THEME_KEY}"),a=localStorage.getItem("${ACCENT_KEY}");if(t==="light"||t==="dark")d.setAttribute("data-theme",t);if(a&&/^(${ACCENTS.map((a) => a.value).join("|")})$/.test(a))d.setAttribute("data-accent",a)}catch(e){}})()`;

export function readAppearance(): Appearance {
  try {
    const theme = window.localStorage.getItem(THEME_KEY);
    const accent = window.localStorage.getItem(ACCENT_KEY);
    return { theme: isTheme(theme) ? theme : DEFAULT_APPEARANCE.theme, accent: isAccent(accent) ? accent : DEFAULT_APPEARANCE.accent };
  } catch {
    return DEFAULT_APPEARANCE;
  }
}

/** What the page currently shows (set by the inline script or the last change). */
export function currentAppearance(): Appearance {
  const d = document.documentElement;
  const theme = d.getAttribute("data-theme");
  const accent = d.getAttribute("data-accent");
  return { theme: isTheme(theme) ? theme : DEFAULT_APPEARANCE.theme, accent: isAccent(accent) ? accent : DEFAULT_APPEARANCE.accent };
}

export function applyAppearance({ theme, accent }: Appearance) {
  const d = document.documentElement;
  d.setAttribute("data-theme", theme);
  d.setAttribute("data-accent", accent);
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", theme === "light" ? "#f7f7fa" : "#050507");
}

export function saveAppearance(next: Appearance) {
  try {
    window.localStorage.setItem(THEME_KEY, next.theme);
    window.localStorage.setItem(ACCENT_KEY, next.accent);
  } catch {}
  applyAppearance(next);
  window.dispatchEvent(new CustomEvent<Appearance>(APPEARANCE_EVENT, { detail: next }));
}

/** For useSyncExternalStore: notifies on changes from Settings or other tabs. */
export function subscribeAppearance(onChange: () => void) {
  window.addEventListener(APPEARANCE_EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(APPEARANCE_EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}
