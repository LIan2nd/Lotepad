import type { Palette, CreativePreferences } from "./types";
export const palettes: Palette[] = [
  {
    id: "lavender",
    name: "Lavender Dream",
    colors: ["#c9b5e4", "#9783b5", "#fff9ef", "#e7c4d5", "#4f3b62"],
    ink: "#4f3b62",
    paper: "#fff9ef",
    accent: "#c9b5e4",
  },
  {
    id: "peach",
    name: "Peach Diary",
    colors: ["#edc3aa", "#bd8069", "#f5e2a3", "#fffaf1", "#654b41"],
    ink: "#654b41",
    paper: "#fffaf1",
    accent: "#edc3aa",
  },
  {
    id: "matcha",
    name: "Matcha Notes",
    colors: ["#b7c9ad", "#d8e9d5", "#889767", "#f0e7d7", "#344f42"],
    ink: "#344f42",
    paper: "#f0e7d7",
    accent: "#b7c9ad",
  },
  {
    id: "cloudy",
    name: "Cloudy Blue",
    colors: ["#bed6e7", "#b8bce0", "#e3e6eb", "#fbfcff", "#384f6d"],
    ink: "#384f6d",
    paper: "#fbfcff",
    accent: "#bed6e7",
  },
  {
    id: "vintage",
    name: "Vintage Journal",
    colors: ["#e4d4b1", "#c5a19a", "#a58970", "#a7ac8b", "#564536"],
    ink: "#564536",
    paper: "#f5ecd9",
    accent: "#c5a19a",
  },
  {
    id: "midnight",
    name: "Midnight Scrapbook",
    colors: ["#b6a1ce", "#b3c3a6", "#fff4df", "#d8b0c2", "#35323d"],
    ink: "#42374f",
    paper: "#fff4df",
    accent: "#b6a1ce",
  },
];
/** Keep editable labels legible when a card's fill changes. */
export function readableInk(background: string, preferred: string) {
  const luminance = (hex: string) => {
    const channels = [1, 3, 5].map((offset) => {
      const channel = parseInt(hex.slice(offset, offset + 2), 16) / 255;
      return channel <= 0.04045
        ? channel / 12.92
        : ((channel + 0.055) / 1.055) ** 2.4;
    });
    return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
  };
  const fill = luminance(background);
  const contrast = (ink: string) => {
    const foreground = luminance(ink);
    return (
      (Math.max(fill, foreground) + 0.05) / (Math.min(fill, foreground) + 0.05)
    );
  };
  if (contrast(preferred) >= 4.5) return preferred;
  return contrast("#292532") > contrast("#fffaf1") ? "#292532" : "#fffaf1";
}
export function getPalette(preferences: CreativePreferences): Palette {
  return (
    [...palettes, ...preferences.customPalettes].find(
      (p) => p.id === preferences.paletteId,
    ) ?? palettes[0]
  );
}
export function isPalette(value: unknown): value is Palette {
  if (!value || typeof value !== "object") return false;
  const p = value as Record<string, unknown>;
  return (
    typeof p.id === "string" &&
    typeof p.name === "string" &&
    p.name.length <= 80 &&
    Array.isArray(p.colors) &&
    p.colors.length >= 5 &&
    p.colors.length <= 8 &&
    p.colors.every(isColor) &&
    isColor(p.ink) &&
    isColor(p.paper) &&
    isColor(p.accent)
  );
}
export function isColor(value: unknown): value is string {
  return typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value);
}
export function validateCreativePreferences(
  value: unknown,
): CreativePreferences {
  if (!value || typeof value !== "object")
    throw new Error("Invalid creative library preferences.");
  const p = value as Record<string, unknown>;
  if (
    p.version !== 1 ||
    !Array.isArray(p.favorites) ||
    !p.favorites.every((v) => typeof v === "string") ||
    !Array.isArray(p.recent) ||
    !p.recent.every((v) => typeof v === "string") ||
    typeof p.paletteId !== "string" ||
    !Array.isArray(p.customPalettes) ||
    !p.customPalettes.every(isPalette) ||
    new Set(p.customPalettes.map((v) => v.id)).size !== p.customPalettes.length
  )
    throw new Error("Invalid creative library preferences.");
  return p as unknown as CreativePreferences;
}
