import { newElementWith } from "@excalidraw/excalidraw";
import { Composer, fitScene } from "./composer";
import { assetById } from "./registry";
import { palettes } from "./palettes";
import type {
  CreativeScene,
  InspirationMode,
  Palette,
  TemplateId,
} from "./types";
import { scrapbookTemplates } from "./templateCatalog";
export { scrapbookTemplates, templateThumbnail } from "./templateCatalog";
export function seededRandom(seed: number) {
  let value = seed >>> 0;
  return () => {
    value = (Math.imul(1664525, value) + 1013904223) >>> 0;
    return value / 4294967296;
  };
}
export function buildTemplate(
  id: TemplateId,
  palette?: Palette,
  seed = 42,
  title?: string,
): CreativeScene {
  const definition =
    scrapbookTemplates.find((t) => t.id === id) ?? scrapbookTemplates[0];
  const p = palette ?? palettes.find((p) => p.id === definition.paletteId)!;
  const c = new Composer(p);
  const random = seededRandom(seed);
  const tilt = () => (random() - 0.5) * 0.09;
  function sticker(assetId: string, x: number, y: number, size = 80) {
    const asset = assetById(assetId);
    if (asset?.svg)
      c.svg(
        asset.svg(p),
        x,
        y,
        size,
        size,
        { creativeAssetId: assetId },
        tilt(),
      );
  }
  function paper(
    x: number,
    y: number,
    w: number,
    h: number,
    color: string,
    variant = "torn",
  ) {
    const asset = assetById(`paper-${variant}`);
    if (asset?.svg)
      c.svg(
        asset.svg(p, color),
        x,
        y,
        w,
        h,
        { creativeAssetId: asset.id, creativeColor: color },
        tilt(),
      );
  }
  function tape(x: number, y: number, w = 150, variant = "stripes") {
    const asset = assetById(`tape-${variant}`);
    if (asset?.svg)
      c.svg(asset.svg(p), x, y, w, 32, { creativeAssetId: asset.id }, tilt());
  }
  if (id === "organized-chaos") {
    c.text("COLLECT / CONNECT / CREATE", 62, 48, 13, 6, 510);
    c.text(title ?? "beautifully\nunorganized.", 58, 91, 61, 6, 610);
    sticker("soft-star", 650, 80, 82);
    paper(45, 290, 397, 295, p.paper);
    c.text("01 / THE BIG IDEA", 76, 318, 18, 6, 325);
    c.text(
      "Start with a thought.\nFollow it somewhere new.\n\nDouble-click any text\nto make it your own.",
      80,
      368,
      23,
      5,
      325,
    );
    tape(154, 272, 162);
    c.card(
      475,
      333,
      245,
      222,
      "A small reminder\n\nGood ideas need a little\nroom to wander.",
      p.colors[3],
      "square",
      22,
      tilt(),
    );
    sticker("paper-clip", 620, 302, 65);
    c.frame(
      83,
      647,
      257,
      308,
      "polaroid",
      undefined,
      "a moment / a possibility",
    );
    tape(140, 629, 142, "dots");
    paper(391, 675, 320, 286, p.colors[0], "grid");
    c.text("THINGS TO EXPLORE", 428, 710, 19, 6, 253);
    c.text(
      "a sketch\na question\nan unexpected connection",
      429,
      758,
      24,
      5,
      250,
    );
    c.line(
      380,
      582,
      [
        [0, 0],
        [52, 18],
        [76, 62],
      ],
      p.ink,
      2,
      false,
      true,
    );
    sticker("daisy", 643, 918, 81);
    c.text("a little mess. a lot of magic.", 69, 1047, 16, 5, 500);
  } else if (id === "dreamy-study") {
    c.text("STUDY NOTES / 01", 64, 52, 14, 6, 500);
    c.text(title ?? "things I\nlearned today.", 62, 94, 58, 6, 650);
    sticker("mini-pencil", 650, 70, 78);
    c.add({
      type: "rectangle",
      x: 62,
      y: 268,
      width: 414,
      height: 22,
      backgroundColor: p.accent,
      fillStyle: "solid",
      strokeColor: "transparent",
      opacity: 40,
      angle: -0.01,
      customData: { lotepadCreative: true },
    });
    c.text("ONE CONCEPT AT A TIME", 69, 264, 21, 6, 600);
    c.card(
      63,
      336,
      668,
      188,
      "KEY CONCEPT\n\nGive the idea a name. Explain it in a few simple words.\nWhat makes it useful? Where have you seen it before?",
      p.paper,
      "rounded",
      23,
    );
    c.card(
      68,
      603,
      267,
      156,
      "The question\n\nWhat do I notice?",
      p.colors[0],
      "rounded",
      22,
    );
    c.card(
      458,
      603,
      267,
      156,
      "The connection\n\nHow does it fit?",
      p.colors[1],
      "rounded",
      22,
    );
    c.line(
      346,
      681,
      [
        [0, 0],
        [96, 0],
      ],
      p.ink,
      3,
      false,
      true,
    );
    c.card(
      62,
      829,
      668,
      156,
      "TAKEAWAYS\n\n01. A useful insight\n02. One thing to revisit",
      p.colors[3],
      "square",
      23,
    );
    sticker("lightbulb", 649, 789, 72);
    c.text("Small steps count.", 65, 1051, 18, 5, 500);
  } else if (id === "creative-journal") {
    c.text("A PAGE FROM THE JOURNAL", 64, 48, 13, 6, 620);
    c.text(title ?? "little things\nworth remembering", 60, 91, 51, 5, 650);
    sticker("sage-leaf", 654, 69, 82);
    c.card(
      62,
      265,
      290,
      70,
      "TODAY / A LITTLE CHECK-IN",
      p.accent,
      "rounded",
      17,
    );
    c.text("Mood: __________________", 413, 288, 21, 5, 320);
    c.frame(72, 388, 281, 321, "polaroid", undefined, "the lovely ordinary");
    c.frame(422, 425, 284, 320, "vintage", undefined, "a detail to remember");
    tape(150, 370, 152);
    tape(480, 406, 151, "floral");
    c.text("Today I noticed…", 75, 797, 28, 5, 620);
    c.text(
      "A moment, a feeling, a small discovery.\nLeave a few words for another day.",
      76,
      850,
      23,
      6,
      625,
    );
    c.card(
      112,
      964,
      571,
      91,
      "“There is beauty in the in-between.”",
      p.colors[3],
      "quote",
      25,
    );
    sticker("soft-heart", 646, 769, 60);
  } else {
    c.text("FIELD NOTES / ISSUE 01", 65, 48, 13, 6, 600);
    c.text(title ?? "THE ART\nOF NOTICING", 61, 92, 69, 6, 670);
    c.line(
      65,
      276,
      [
        [0, 0],
        [660, 0],
      ],
      p.ink,
      1,
    );
    c.frame(65, 328, 367, 433, "minimal");
    paper(468, 344, 239, 328, p.colors[0], "vintage");
    c.text("a closer\nlook.", 487, 396, 44, 5, 208);
    c.text(
      "An ordinary detail.\nA different angle.\nSomething new.",
      490,
      534,
      19,
      6,
      202,
    );
    c.text("“Collect moments,\nnot conclusions.”", 80, 817, 36, 5, 610);
    c.text("OBSERVATIONS", 67, 956, 16, 6, 650);
    c.text(
      "A small collection of things that caught your eye.\nAdd a photograph. Write a line. Follow a detail.",
      68,
      1001,
      20,
      6,
      650,
    );
    sticker("sketch-star", 645, 816, 70);
  }
  return c.finish();
}
const inspirationTitles: Record<InspirationMode, string[]> = {
  cozy: ["slow little moments", "a softer kind of day", "a few good things"],
  chaos: [
    "follow the little sparks",
    "notes from everywhere",
    "beautifully unorganized",
  ],
  study: [
    "curiosity in progress",
    "make the connections",
    "things worth learning",
  ],
  editorial: [
    "THE EVERYDAY\nOBSERVED",
    "A NEW\nPERSPECTIVE",
    "SMALL\nDISCOVERIES",
  ],
  doodle: ["start with a scribble", "one small idea", "follow this thought"],
  diary: ["a day to remember", "fragments of today", "dear future me"],
};
export const inspirationModes: {
  id: InspirationMode;
  name: string;
  template: TemplateId;
}[] = [
  { id: "cozy", name: "Cozy Random", template: "creative-journal" },
  { id: "chaos", name: "Organized Chaos", template: "organized-chaos" },
  { id: "study", name: "Cute Study", template: "dreamy-study" },
  { id: "editorial", name: "Editorial", template: "editorial-collage" },
  { id: "doodle", name: "Minimal Doodle", template: "organized-chaos" },
  { id: "diary", name: "Scrapbook Diary", template: "creative-journal" },
];
export function generateInspiration(mode: InspirationMode, seed: number) {
  const random = seededRandom(seed);
  const definition =
    inspirationModes.find((m) => m.id === mode) ?? inspirationModes[0];
  const palette = palettes[Math.floor(random() * palettes.length)];
  const title = inspirationTitles[mode][Math.floor(random() * 3)];
  let scene = buildTemplate(definition.template, palette, seed, title);
  if (mode === "doodle")
    scene = {
      ...scene,
      elements: scene.elements
        .filter(
          (e) =>
            e.type === "text" ||
            e.type === "arrow" ||
            (e.type === "image" &&
              e.customData?.creativeAssetId === "soft-star"),
        )
        .filter((e) => e.type !== "text" || e.text !== "Add a photo")
        .map((e) =>
          e.type === "text"
            ? newElementWith(e, {
                angle: 0,
                containerId: null,
                groupIds: [],
                boundElements: null,
              })
            : newElementWith(e, { angle: 0 }),
        ),
    };
  return { scene, palette, title, seed, mode };
}
export function templateForPaper(
  scene: CreativeScene,
  width: number,
  height: number,
) {
  return fitScene(scene, width, height);
}
