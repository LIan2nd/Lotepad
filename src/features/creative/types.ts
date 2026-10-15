import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import type { BinaryFiles } from "@excalidraw/excalidraw/types";
export type CreativeCategory =
  | "stickers"
  | "tapes"
  | "papers"
  | "notes"
  | "frames"
  | "doodles"
  | "labels"
  | "decorations"
  | "text"
  | "palettes"
  | "templates";
export interface Palette {
  id: string;
  name: string;
  colors: string[];
  ink: string;
  paper: string;
  accent: string;
}
export interface CreativePreferences {
  version: 1;
  favorites: string[];
  recent: string[];
  paletteId: string;
  customPalettes: Palette[];
}
export interface CreativeAsset {
  id: string;
  name: string;
  category: CreativeCategory;
  tags: string[];
  width: number;
  height: number;
  kind: "svg" | "card" | "frame" | "geometry" | "text";
  variant: string;
  svg?: (palette: Palette, color?: string) => string;
}
export interface CreativeScene {
  elements: readonly ExcalidrawElement[];
  files: BinaryFiles;
}
export type TemplateId =
  "organized-chaos" | "dreamy-study" | "creative-journal" | "editorial-collage";
export type CreativeMode = "write" | "create" | "focus";
export type InspirationMode =
  "cozy" | "chaos" | "study" | "editorial" | "doodle" | "diary";
export const defaultCreativePreferences: CreativePreferences = {
  version: 1,
  favorites: [],
  recent: [],
  paletteId: "lavender",
  customPalettes: [],
};
