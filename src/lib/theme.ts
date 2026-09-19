/** Bank + platform visual language. Named schemes plus an optional hex override. */

export type ColorSchemeId =
  | "slate"
  | "ocean"
  | "forest"
  | "copper"
  | "rose"
  | "ink"
  | "indigo"
  | "emerald"
  | "amber"
  | "zinc";

export type ColorScheme = {
  id: ColorSchemeId;
  label: string;
  hex: string;
  swatch: string;
  description: string;
};

export const COLOR_SCHEMES: ColorScheme[] = [
  { id: "slate", label: "Slate", hex: "#8b95a5", swatch: "#8b95a5", description: "Cool institutional gray" },
  { id: "ocean", label: "Ocean", hex: "#4a7ea6", swatch: "#4a7ea6", description: "Deep water blue" },
  { id: "forest", label: "Forest", hex: "#3f8b6e", swatch: "#3f8b6e", description: "Muted banking green" },
  { id: "copper", label: "Copper", hex: "#c4845a", swatch: "#c4845a", description: "Warm metal" },
  { id: "rose", label: "Rose", hex: "#c45c6a", swatch: "#c45c6a", description: "Quiet crimson" },
  { id: "ink", label: "Ink", hex: "#d4d4d8", swatch: "#d4d4d8", description: "Near-white on dark" },
  { id: "indigo", label: "Indigo", hex: "#5b6abf", swatch: "#5b6abf", description: "Classic (legacy)" },
  { id: "emerald", label: "Emerald", hex: "#3f8b6e", swatch: "#3f8b6e", description: "Alias of Forest" },
  { id: "amber", label: "Amber", hex: "#c4923a", swatch: "#c4923a", description: "Muted gold" },
  { id: "zinc", label: "Monochrome", hex: "#a1a1aa", swatch: "#a1a1aa", description: "Neutral steel" },
];

export const SCHEME_HEX: Record<string, string> = Object.fromEntries(
  COLOR_SCHEMES.map((s) => [s.id, s.hex])
);

export const PRIMARY_SCHEMES = COLOR_SCHEMES.filter((s) =>
  ["slate", "ocean", "forest", "copper", "rose", "ink"].includes(s.id)
);

export function hexOr(raw: any, fallback = "#8b95a5"): string {
  const h = String(raw || "").trim();
  return /^#[0-9a-fA-F]{6}$/.test(h) ? h : fallback;
}

export function withAlpha(hex: string, a: number): string {
  const n = parseInt(hex.slice(1), 16);
  if (!Number.isFinite(n)) return `rgba(139,149,165,${a})`;
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  return `rgba(${r},${g},${b},${a})`;
}

export function accentFor(opts: { brandingColor?: string | null; colorScheme?: string | null } | null | undefined): string {
  if (!opts) return SCHEME_HEX.slate;
  const branded = hexOr(opts.brandingColor, "");
  if (branded) return branded;
  return SCHEME_HEX[opts.colorScheme || ""] || SCHEME_HEX.slate;
}

export function schemeMeta(id?: string | null): ColorScheme {
  return COLOR_SCHEMES.find((s) => s.id === id) || COLOR_SCHEMES[0];
}

/** Dark-on-accent vs light-on-accent for readable labels on the brand fill. */
export function accentForeground(hex: string): string {
  const n = parseInt(hex.slice(1), 16);
  if (!Number.isFinite(n)) return "#0a0a0b";
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  const lum = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  return lum > 0.62 ? "#0a0a0b" : "#f4f4f5";
}

export const motionEase = [0.22, 1, 0.36, 1] as const;

export const fadeUp = {
  hidden: { opacity: 0, y: 10, filter: "blur(4px)" },
  visible: { opacity: 1, y: 0, filter: "blur(0px)", transition: { duration: 0.4, ease: motionEase } },
};

export const stagger = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.06, delayChildren: 0.04 } },
};
