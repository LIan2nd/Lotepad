import {
  convertToExcalidrawElements,
  newElementWith,
} from "@excalidraw/excalidraw";
import type { ExcalidrawElementSkeleton } from "@excalidraw/excalidraw/data/transform";
import type { BinaryFileData, BinaryFiles } from "@excalidraw/excalidraw/types";
import type {
  ExcalidrawElement,
  FontFamilyValues,
} from "@excalidraw/excalidraw/element/types";
import type { CreativeAsset, CreativeScene, Palette } from "./types";
import { svgDataUrl } from "./registry";
import { readableInk } from "./palettes";
export class Composer {
  skeletons: ExcalidrawElementSkeleton[] = [];
  files: BinaryFiles = {};
  constructor(public palette: Palette) {}
  add(element: ExcalidrawElementSkeleton) {
    this.skeletons.push(element);
    return element.id;
  }
  text(
    text: string,
    x: number,
    y: number,
    size = 22,
    font: FontFamilyValues = 6,
    width = 500,
    groupIds: string[] = [],
  ) {
    const maxCharacters = Math.max(7, Math.floor(width / (size * 0.56)));
    const wrapped = text
      .split("\n")
      .map((paragraph) => {
        const lines: string[] = [];
        let line = "";
        for (const word of paragraph.split(" ")) {
          if (line && `${line} ${word}`.length > maxCharacters) {
            lines.push(line);
            line = word;
          } else line = line ? `${line} ${word}` : word;
        }
        lines.push(line);
        return lines.join("\n");
      })
      .join("\n");
    return this.add({
      id: crypto.randomUUID(),
      type: "text",
      text: wrapped,
      x,
      y,
      fontSize: size,
      fontFamily: font,
      width,
      autoResize: false,
      strokeColor: this.palette.ink,
      groupIds,
      customData: { lotepadCreative: true },
    });
  }
  line(
    x: number,
    y: number,
    points: [number, number][],
    color = this.palette.accent,
    width = 3,
    dashed = false,
    arrow = false,
  ) {
    const xs = points.map((p) => p[0]),
      ys = points.map((p) => p[1]);
    this.add({
      id: crypto.randomUUID(),
      type: arrow ? "arrow" : "line",
      x,
      y,
      points,
      width: Math.max(...xs) - Math.min(...xs),
      height: Math.max(...ys) - Math.min(...ys),
      strokeColor: color,
      strokeWidth: width,
      strokeStyle: dashed ? "dashed" : "solid",
      roughness: 1,
      endArrowhead: arrow ? "arrow" : null,
      customData: { lotepadCreative: true },
    });
  }
  card(
    x: number,
    y: number,
    w: number,
    h: number,
    text: string,
    color = this.palette.accent,
    variant = "square",
    fontSize = 22,
    angle = 0,
  ) {
    const groupId = crypto.randomUUID();
    const isLabel = h < 100;
    this.add({
      id: crypto.randomUUID(),
      type: variant === "thought-bubble" ? "ellipse" : "rectangle",
      x,
      y,
      width: w,
      height: h,
      backgroundColor: color,
      fillStyle: "solid",
      strokeColor: variant === "translucent" ? "transparent" : this.palette.ink,
      strokeWidth: 0.6,
      roughness: variant === "torn-memo" ? 1 : 0,
      opacity: variant === "translucent" ? 65 : 100,
      roundness: ["rounded", "callout"].includes(variant) ? { type: 3 } : null,
      angle,
      groupIds: [groupId],
      label: {
        text,
        fontSize,
        fontFamily: variant === "quote" ? 5 : 6,
        textAlign: isLabel ? "center" : "left",
        verticalAlign: isLabel ? "middle" : "top",
        strokeColor: readableInk(color, this.palette.ink),
      },
      customData: { lotepadCreative: true, creativeKind: "card", variant },
    });
    if (variant === "lined-memo" || variant === "index-card")
      for (let offset = 72; offset < h - 20; offset += 26)
        this.add({
          type: "line",
          x: x + 15,
          y: y + offset,
          width: w - 30,
          height: 0,
          points: [
            [0, 0],
            [w - 30, 0],
          ],
          strokeColor: readableInk(color, this.palette.ink),
          opacity: 14,
          strokeWidth: 1,
          roughness: 0,
          groupIds: [groupId],
          customData: { lotepadCreative: true },
        });
    return groupId;
  }
  svg(
    svg: string,
    x: number,
    y: number,
    w: number,
    h: number,
    metadata: Record<string, unknown> = {},
    angle = 0,
  ) {
    const id = crypto.randomUUID() as BinaryFileData["id"];
    this.files[id] = {
      id,
      dataURL: svgDataUrl(svg) as BinaryFileData["dataURL"],
      mimeType: "image/svg+xml",
      created: Date.now(),
    };
    this.add({
      id: crypto.randomUUID(),
      type: "image",
      x,
      y,
      width: w,
      height: h,
      fileId: id,
      status: "saved",
      angle,
      customData: { lotepadCreative: true, ...metadata },
    });
  }
  image(
    file: BinaryFileData,
    x: number,
    y: number,
    w: number,
    h: number,
    groupIds: string[] = [],
  ) {
    this.files[file.id] = file;
    this.add({
      id: crypto.randomUUID(),
      type: "image",
      x,
      y,
      width: w,
      height: h,
      fileId: file.id,
      status: "saved",
      groupIds,
      customData: { lotepadCreative: true, creativeKind: "photo" },
    });
  }
  frame(
    x: number,
    y: number,
    w: number,
    h: number,
    variant = "polaroid",
    photo?: { file: BinaryFileData; width: number; height: number },
    caption = "a moment worth keeping",
  ) {
    const groupId = crypto.randomUUID();
    const border = variant === "minimal" ? 10 : 18;
    const footer = variant === "minimal" ? 18 : 64;
    this.add({
      id: crypto.randomUUID(),
      type: "rectangle",
      x: x + 4,
      y: y + 6,
      width: w,
      height: h,
      backgroundColor: this.palette.ink,
      strokeColor: "transparent",
      fillStyle: "solid",
      opacity: 8,
      roughness: 0,
      groupIds: [groupId],
      customData: { lotepadCreative: true },
    });
    this.add({
      id: crypto.randomUUID(),
      type: "rectangle",
      x,
      y,
      width: w,
      height: h,
      backgroundColor: variant === "vintage" ? "#eee0c5" : this.palette.paper,
      strokeColor: "#c6bfb5",
      strokeWidth: 0.7,
      fillStyle: "solid",
      roughness: variant === "scrapbook" ? 1 : 0,
      roundness: variant === "rounded" ? { type: 3 } : null,
      groupIds: [groupId],
      customData: { lotepadCreative: true, creativeKind: "frame", variant },
    });
    const inner = {
      x: x + border,
      y: y + border,
      w: w - border * 2,
      h: h - border - footer,
    };
    if (photo) {
      const scale = Math.min(inner.w / photo.width, inner.h / photo.height);
      this.image(
        photo.file,
        inner.x + (inner.w - photo.width * scale) / 2,
        inner.y + (inner.h - photo.height * scale) / 2,
        photo.width * scale,
        photo.height * scale,
        [groupId],
      );
    } else
      this.add({
        id: crypto.randomUUID(),
        type: "rectangle",
        x: inner.x,
        y: inner.y,
        width: inner.w,
        height: inner.h,
        backgroundColor: this.palette.colors[0],
        strokeColor: "transparent",
        fillStyle: "solid",
        roughness: 0,
        groupIds: [groupId],
        label: {
          text: "Add a photo",
          strokeColor: this.palette.ink,
          fontSize: 17,
          fontFamily: 6,
          textAlign: "center",
        },
        customData: {
          lotepadCreative: true,
          photoSlot: true,
          frameGroup: groupId,
        },
      });
    if (variant !== "minimal")
      this.text(caption, x + border, y + h - 45, 17, 5, w - border * 2, [
        groupId,
      ]);
  }
  finish(): CreativeScene {
    const elements = convertToExcalidrawElements(this.skeletons, {
      regenerateIds: false,
    });
    const containers = new Map(elements.map((e) => [e.id, e]));
    return {
      elements: elements.map((e) => {
        if (e.type === "text" && e.containerId) {
          const parent = containers.get(e.containerId);
          if (parent)
            return newElementWith(e, {
              groupIds: parent.groupIds,
              angle: parent.angle,
              customData: { lotepadCreative: true },
            });
        }
        return e;
      }),
      files: this.files,
    };
  }
}
export function buildAsset(
  asset: CreativeAsset,
  palette: Palette,
  color?: string,
  photo?: { file: BinaryFileData; width: number; height: number },
): CreativeScene {
  const c = new Composer(palette);
  const ink = color ?? palette.accent;
  if (asset.kind === "svg" && asset.svg)
    c.svg(asset.svg(palette, color), 0, 0, asset.width, asset.height, {
      creativeAssetId: asset.id,
      creativeColor: color ?? null,
    });
  else if (asset.kind === "card")
    c.card(
      0,
      0,
      asset.width,
      asset.height,
      asset.category === "labels"
        ? asset.variant === "date"
          ? "16 OCTOBER"
          : asset.variant === "number"
            ? "01 / NOTES"
            : "little things"
        : asset.variant === "quote"
          ? "“Make room for a little wonder.”"
          : "Note to self\n\nA little thought to keep.",
      ink,
      asset.variant,
      asset.category === "labels" ? 22 : 20,
    );
  else if (asset.kind === "frame")
    c.frame(
      0,
      0,
      asset.variant === "landscape" ? 350 : 260,
      asset.variant === "landscape" ? 250 : 310,
      asset.variant,
      photo,
    );
  else if (asset.kind === "text") {
    const presets: Record<string, [string, number, FontFamilyValues]> = {
      editorial: ["THE BIG\nIDEA", 64, 6],
      "serif-title": ["little things worth\nremembering", 38, 5],
      handwritten: ["today’s thoughts", 40, 5],
      subtitle: ["THINGS I LEARNED", 20, 6],
      annotation: ["a tiny reminder", 17, 5],
      highlighted: ["note to self", 25, 6],
      quote: ["“A little mess.\nA lot of magic.”", 32, 5],
      date: ["FRIDAY / OCTOBER 16", 18, 6],
      section: ["01  /  A NEW CHAPTER", 24, 6],
    };
    const [text, size, font] = presets[asset.variant] ?? presets.editorial;
    if (asset.variant === "highlighted")
      c.card(0, 0, 290, 70, text, ink, "rounded", size);
    else c.text(text, 0, 0, size, font, 420);
  } else buildGeometry(c, asset.variant, ink);
  return c.finish();
}
function buildGeometry(c: Composer, variant: string, color: string) {
  if (
    ["idea-explanation", "problem-solution", "three-step", "mind-map"].includes(
      variant,
    )
  ) {
    const words =
      variant === "problem-solution"
        ? ["Problem", "Solution"]
        : variant === "three-step"
          ? ["Discover", "Explore", "Create"]
          : variant === "mind-map"
            ? ["The idea", "Possibility", "Next step"]
            : ["The idea", "A little explanation"];
    words.forEach((word, i) => {
      const x = variant === "mind-map" && i > 0 ? (i - 1) * 250 : i * 250;
      const y = variant === "mind-map" && i > 0 ? 210 : 0;
      c.card(
        x,
        y,
        200,
        130,
        `${word}\n\nDouble-click to edit`,
        i === 0 ? color : c.palette.paper,
        "rounded",
        19,
      );
      if (i > 0)
        c.line(
          variant === "mind-map" ? 100 : (i - 1) * 250 + 205,
          variant === "mind-map" ? 140 : 65,
          [
            [0, 0],
            [
              variant === "mind-map" ? (i - 1) * 250 : 40,
              variant === "mind-map" ? 65 : 0,
            ],
          ],
          c.palette.ink,
          2,
          false,
          true,
        );
    });
    return;
  }
  if (variant === "callout" || variant === "thought-bubble") {
    c.card(0, 0, 260, 150, "A thought worth keeping", color, variant, 21);
    return;
  }
  if (variant === "highlight") {
    c.add({
      type: "rectangle",
      x: 0,
      y: 0,
      width: 280,
      height: 30,
      angle: -0.025,
      backgroundColor: color,
      strokeColor: "transparent",
      fillStyle: "solid",
      opacity: 35,
      roughness: 1,
      customData: { lotepadCreative: true },
    });
    return;
  }
  if (variant === "circle") {
    c.add({
      type: "ellipse",
      x: 0,
      y: 0,
      width: 260,
      height: 90,
      strokeColor: color,
      strokeWidth: 3,
      roughness: 2,
      backgroundColor: "transparent",
      customData: { lotepadCreative: true },
    });
    return;
  }
  if (variant === "brackets") {
    c.line(
      0,
      0,
      [
        [30, 0],
        [0, 0],
        [0, 130],
        [30, 130],
      ],
      color,
    );
    c.line(
      240,
      0,
      [
        [0, 0],
        [30, 0],
        [30, 130],
        [0, 130],
      ],
      color,
    );
    return;
  }
  const points: [number, number][] =
    variant === "wavy-underline"
      ? Array.from(
          { length: 17 },
          (_, i) =>
            [i * 17, Math.sin((i * Math.PI) / 2) * 9] as [number, number],
        )
      : variant === "curved-arrow"
        ? [
            [0, 70],
            [50, 15],
            [130, 0],
            [220, 35],
            [260, 75],
          ]
        : variant === "scribble"
          ? [
              [0, 45],
              [60, 0],
              [25, 70],
              [135, 10],
              [90, 80],
              [230, 30],
            ]
          : [
              [0, 0],
              [280, 0],
            ];
  c.line(
    0,
    0,
    points,
    color,
    variant === "underline" ? 5 : 3,
    variant === "dotted-connector",
    variant === "curved-arrow",
  );
}
export function moveScene(
  scene: CreativeScene,
  x: number,
  y: number,
): CreativeScene {
  return {
    ...scene,
    elements: scene.elements.map((e) =>
      newElementWith(e, { x: e.x + x, y: e.y + y }),
    ),
  };
}
export function fitScene(
  scene: CreativeScene,
  width: number,
  height: number,
  sourceWidth = 794,
  sourceHeight = 1123,
): CreativeScene {
  const ratio = Math.min(width / sourceWidth, height / sourceHeight);
  const dx = (width - sourceWidth * ratio) / 2,
    dy = (height - sourceHeight * ratio) / 2;
  return {
    ...scene,
    elements: scene.elements.map((e) => {
      const updates = {
        x: e.x * ratio + dx,
        y: e.y * ratio + dy,
        width: e.width * ratio,
        height: e.height * ratio,
      };
      if (e.type === "text")
        return newElementWith(e, { ...updates, fontSize: e.fontSize * ratio });
      if (e.type === "line" || e.type === "arrow")
        return newElementWith(e, {
          ...updates,
          points: e.points.map(
            ([x, y]) => [x * ratio, y * ratio] as (typeof e.points)[number],
          ),
        });
      return newElementWith(e, updates);
    }),
  };
}
export function isPaper(element: ExcalidrawElement) {
  return !!(
    element.customData?.lotepadPaper || element.customData?.inknestPaper
  );
}
