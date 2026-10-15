import type { CreativeAsset, Palette } from "./types";
const wrap = (body: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="140" height="140" viewBox="0 0 140 140">${body}</svg>`;
const star = "M70 15 83 52 123 69 83 83 69 124 54 85 16 70 53 54Z";
const heart =
  "M70 114C16 82 16 44 38 32q19-11 32 10 15-23 35-9c25 17 10 54-35 81Z";
type Artwork = (c: string, p: Palette) => string;
const stickerArt: Record<string, Artwork> = {
  "soft-star": (c) =>
    `<path d="${star}" fill="${c}" stroke="#fffaf0" stroke-width="5" stroke-linejoin="round"/>`,
  "tiny-sparkles": (c) =>
    `<path d="M49 16 57 46 82 53 58 65 48 94 39 65 14 55 39 46ZM106 78 112 94 127 101 112 107 106 124 101 108 84 102 101 95Z" fill="${c}"/>`,
  twinkle: (c) =>
    `<path d="M70 12Q73 64 125 70 74 75 70 128 64 76 14 70 64 63 70 12Z" fill="${c}"/><circle cx="111" cy="30" r="5" fill="${c}"/>`,
  "star-cluster": (c) =>
    `<path d="M40 21 48 44 72 52 48 61 40 86 32 61 8 52 32 44ZM97 55 106 78 132 86 107 96 97 122 88 98 65 87 89 78Z" fill="${c}"/><path d="m96 19 2 11 10 3-10 4-2 12-4-12-10-4 11-3Z" fill="${c}"/>`,
  "shooting-star": (c) =>
    `<path d="M90 18 99 42 124 49 104 65 104 90 84 74 60 83 66 59 52 39 78 40Z" fill="${c}"/><path d="M62 76Q42 103 16 111M75 87Q60 110 37 124M48 69Q31 86 15 89" fill="none" stroke="${c}" stroke-width="7" stroke-linecap="round"/>`,
  "sketch-star": (c) =>
    `<path d="m70 17 17 39 37 4-29 27 7 37-32-19-35 14 9-37-28-28 39-2Z" fill="none" stroke="${c}" stroke-width="5" stroke-linejoin="round"/><path d="m20 16 5 8m94 94 7 5" stroke="${c}" stroke-width="4"/>`,
  "sage-leaf": (c, p) =>
    `<path d="M106 19Q120 103 33 118 17 44 106 19Z" fill="${c}"/><path d="M36 115 94 40M58 87 44 63m28 8 23-8" fill="none" stroke="${p.ink}" stroke-width="3" stroke-linecap="round" opacity=".6"/>`,
  daisy: (c, p) =>
    `<g fill="${c}">${[0, 60, 120, 180, 240, 300].map((a) => `<ellipse cx="70" cy="41" rx="16" ry="29" transform="rotate(${a} 70 70)"/>`).join("")}</g><circle cx="70" cy="70" r="20" fill="${p.paper}"/><circle cx="70" cy="70" r="10" fill="${p.colors[3]}"/>`,
  "little-branch": (c) =>
    `<path d="M30 123Q64 75 101 20" fill="none" stroke="${c}" stroke-width="5"/><g fill="${c}"><path d="M53 91Q12 93 25 61 55 61 53 91ZM69 69Q29 61 47 37 75 42 69 69ZM71 70Q106 81 116 48 88 41 71 70ZM88 42Q110 49 122 20 100 10 88 42Z"/></g>`,
  "fluffy-cloud": (c, p) =>
    `<path d="M30 105C0 98 6 64 30 64 22 31 62 13 80 42 110 18 134 54 118 73 143 93 115 110 98 106Z" fill="${c}" stroke="${p.paper}" stroke-width="5"/><path d="m45 82 6 0m29 0 6 0" stroke="${p.ink}" stroke-width="4" stroke-linecap="round"/>`,
  "warm-sun": (c) =>
    `<g fill="none" stroke="${c}" stroke-width="6" stroke-linecap="round"><circle cx="70" cy="70" r="30" fill="${c}"/>${[0, 45, 90, 135, 180, 225, 270, 315].map((a) => `<path d="M70 12v12" transform="rotate(${a} 70 70)"/>`).join("")}</g><path d="M58 74q12 12 24 0" fill="none" stroke="#fffaf0" stroke-width="3"/>`,
  "crescent-moon": (c) =>
    `<path d="M99 17C26 4 1 105 70 123q36 7 55-26C58 114 44 45 99 17Z" fill="${c}"/><path d="m112 31 4 12 12 4-12 4-4 12-4-12-12-4 12-4Z" fill="${c}"/>`,
  "tiny-mushroom": (c, p) =>
    `<path d="m58 66-9 53q19 13 42-1L81 66Z" fill="${p.paper}" stroke="${p.ink}" stroke-width="2"/><path d="M15 76C12 2 122 1 126 76q-55 17-111 0Z" fill="${c}"/><g fill="${p.paper}"><circle cx="43" cy="51" r="9"/><circle cx="79" cy="32" r="8"/><circle cx="101" cy="58" r="7"/></g>`,
  "paper-clip": (c) =>
    `<path d="m52 104 44-51c22-27-7-49-28-26l-45 52c-27 34 15 65 39 37l49-56M44 93l42-49c8-9 18-1 11 7l-42 49" stroke="${c}" fill="none" stroke-width="7" stroke-linecap="round"/>`,
  "push-pin": (c, p) =>
    `<path d="m68 86-19 42" stroke="${p.ink}" stroke-width="5"/><path d="m53 29 48 18-13 10-3 29 13 16-69-26 20-3 14-24Z" fill="${c}" stroke="${p.paper}" stroke-width="4"/>`,
  "binder-clip": (c, p) =>
    `<path d="M35 56h70l14 55H21Z" fill="${c}"/><path d="M50 64V30q20-22 40 0v34M58 57V32q12-10 24 0v25" fill="none" stroke="${p.ink}" stroke-width="4"/><path d="M31 108h78" stroke="${p.paper}" stroke-width="4"/>`,
  "mini-pencil": (c, p) =>
    `<g transform="rotate(32 70 70)"><path d="M56 26h28v76l-14 24-14-24Z" fill="${c}" stroke="${p.ink}" stroke-width="2"/><path d="M56 26V15q14-10 28 0v11" fill="${p.colors[3]}"/><path d="m56 102 14 24 14-24" fill="${p.paper}"/><path d="m64 117 6 9 6-9" fill="${p.ink}"/></g>`,
  "mini-notebook": (c, p) =>
    `<rect x="31" y="15" width="81" height="111" rx="9" fill="${c}"/><path d="M44 17v106" stroke="${p.ink}" stroke-width="2" opacity=".3"/><path d="M99 16v109" stroke="${p.ink}" stroke-width="4" opacity=".3"/><rect x="56" y="42" width="33" height="25" rx="2" fill="${p.paper}"/><path d="M62 51h21m-21 7h15" stroke="${p.ink}" stroke-width="2"/>`,
  bookmark: (c, p) =>
    `<path d="M42 16h57v111l-29-23-28 23Z" fill="${c}"/><path d="m71 39 5 15 16 5-16 6-5 16-5-16-15-6 15-5Z" fill="${p.paper}"/>`,
  "soft-heart": (c) =>
    `<path d="${heart}" fill="${c}" stroke="#fffaf0" stroke-width="5"/>`,
  smiley: (c, p) =>
    `<circle cx="70" cy="70" r="51" fill="${c}" stroke="${p.paper}" stroke-width="5"/><g stroke="${p.ink}" stroke-width="5" stroke-linecap="round" fill="none"><path d="M51 54v8m36-8v8M47 83q23 28 47-1"/></g>`,
  "speech-bubble": (c, p) =>
    `<path d="M24 27q90-25 98 31 8 39-47 39l-25 23 3-26Q8 91 15 56Z" fill="${c}" stroke="${p.paper}" stroke-width="4"/><g fill="${p.ink}"><circle cx="44" cy="62" r="4"/><circle cx="70" cy="62" r="4"/><circle cx="96" cy="62" r="4"/></g>`,
  "little-swirl": (c) =>
    `<path d="M22 106C145 133 137 6 57 22-5 35 26 105 77 86c35-14-4-58-22-30" fill="none" stroke="${c}" stroke-width="7" stroke-linecap="round"/>`,
  "wavy-line": (c) =>
    `<path d="M11 64q15-35 30 0t30 0 30 0 29 0M12 92q15-29 30 0t30 0 30 0 27 0" fill="none" stroke="${c}" stroke-width="6" stroke-linecap="round"/>`,
  "happy-scribble": (c) =>
    `<path d="m24 81 51-55-34 74 57-66-22 69 43-43M25 110l92 4" fill="none" stroke="${c}" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/>`,
  checkmark: (c, p) =>
    `<path d="M23 70 55 101 119 30" stroke="${p.paper}" stroke-width="21" stroke-linecap="round" stroke-linejoin="round" fill="none"/><path d="M23 70 55 101 119 30" stroke="${c}" stroke-width="12" stroke-linecap="round" stroke-linejoin="round" fill="none"/>`,
  important: (c, p) =>
    `<path d="M70 14 126 119H14Z" fill="${c}" stroke="${p.paper}" stroke-width="4" stroke-linejoin="round"/><path d="M70 48v34m0 17v2" stroke="${p.ink}" stroke-width="8" stroke-linecap="round"/>`,
  question: (c, p) =>
    `<circle cx="70" cy="70" r="52" fill="${c}"/><path d="M49 49c2-26 51-24 45 2-3 12-24 11-24 31m0 18v1" fill="none" stroke="${p.paper}" stroke-width="8" stroke-linecap="round"/>`,
  lightbulb: (c, p) =>
    `<path d="M49 89C1 35 60-6 94 23c34 26 6 52-4 66Z" fill="${c}"/><path d="M50 92h40m-39 12h38m-29 13h20M70 90V60m-13-8 13 10 14-10" fill="none" stroke="${p.ink}" stroke-width="4" stroke-linecap="round"/>`,
  "tiny-flag": (c, p) =>
    `<path d="M37 21v106" stroke="${p.ink}" stroke-width="5" stroke-linecap="round"/><path d="M40 23q30-18 67 5L91 50l19 23q-39-22-70-3Z" fill="${c}"/>`,
  "reminder-bell": (c, p) =>
    `<path d="M29 98q17-15 13-42-1-38 29-38 32 0 29 38-3 27 13 42Z" fill="${c}" stroke="${p.paper}" stroke-width="4"/><path d="M59 112q12 14 25-1" fill="none" stroke="${p.ink}" stroke-width="5" stroke-linecap="round"/>`,
  terminal: (c, p) =>
    `<rect x="12" y="24" width="116" height="91" rx="12" fill="${c}" stroke="${p.paper}" stroke-width="4"/><path d="M15 45h110" stroke="${p.paper}" stroke-width="3"/><path d="m34 63 13 13-13 13m28 1h25" fill="none" stroke="${p.ink}" stroke-width="5" stroke-linecap="round"/><circle cx="26" cy="35" r="3" fill="${p.paper}"/>`,
  database: (c, p) =>
    `<path d="M31 33v73c0 26 80 26 80 0V33" fill="${c}" stroke="${p.paper}" stroke-width="4"/><ellipse cx="71" cy="33" rx="40" ry="16" fill="${c}" stroke="${p.paper}" stroke-width="4"/><path d="M32 65q39 29 79 0m-79 25q39 29 79 0" fill="none" stroke="${p.paper}" stroke-width="3"/>`,
  server: (c, p) =>
    `<g fill="${c}" stroke="${p.paper}" stroke-width="3"><rect x="25" y="19" width="90" height="29" rx="7"/><rect x="25" y="55" width="90" height="29" rx="7"/><rect x="25" y="91" width="90" height="29" rx="7"/></g><g fill="${p.ink}"><circle cx="40" cy="34" r="3"/><circle cx="40" cy="70" r="3"/><circle cx="40" cy="106" r="3"/></g>`,
  "code-brackets": (c) =>
    `<path d="M47 30 14 69l33 40m47-79 32 39-32 40M82 23 61 119" fill="none" stroke="${c}" stroke-width="9" stroke-linecap="round" stroke-linejoin="round"/>`,
  "network-nodes": (c, p) =>
    `<path d="m34 36 73 8-34 69ZM34 36l39 77" fill="none" stroke="${p.ink}" stroke-width="3"/><g fill="${c}" stroke="${p.paper}" stroke-width="4"><circle cx="34" cy="36" r="18"/><circle cx="107" cy="44" r="18"/><circle cx="73" cy="113" r="18"/></g>`,
  "mini-gear": (c, p) =>
    `<path d="m55 17 28 0 4 17 15 9 17-5 14 24-13 12-1 17 12 12-16 23-17-5-16 8-4 16H50l-4-16-15-9-17 4L0 100l13-12V71L1 59l15-23 17 5 16-8Z" transform="translate(5 -8) scale(.95)" fill="${c}"/><circle cx="70" cy="70" r="22" fill="${p.paper}"/>`,
  folder: (c, p) =>
    `<path d="M14 41V27q0-8 10-8h33l15 15h42q12 0 12 12v68H14Z" fill="${c}"/><path d="M14 53h112l-11 63H23Z" fill="${p.paper}" opacity=".45"/><path d="m55 70 5 13 15 5-14 5-5 14-4-15-14-5 14-4Z" fill="${c}"/>`,
};
const categories = [
  "Stars",
  "Stars",
  "Stars",
  "Stars",
  "Stars",
  "Stars",
  ...Array<string>(7).fill("Nature"),
  ...Array<string>(6).fill("Stationery"),
  ...Array<string>(6).fill("Doodles"),
  ...Array<string>(6).fill("Productivity"),
  ...Array<string>(7).fill("Tech"),
];
const stickers: CreativeAsset[] = Object.entries(stickerArt).map(
  ([id, art], i) => ({
    id,
    name: id
      .split("-")
      .map((w) => w[0].toUpperCase() + w.slice(1))
      .join(" "),
    category: "stickers",
    tags: [categories[i], id],
    width: 116,
    height: 116,
    kind: "svg",
    variant: id,
    svg: (p, c) => wrap(art(c ?? p.accent, p)),
  }),
);
function tapeSvg(style: string, p: Palette, color?: string) {
  const c = color ?? p.accent;
  let body = `<path d="M8 8 18 13 26 6 36 12 48 7H269l-5 9 10 8-9 10 8 9-10 8H10l5-10L5 32l10-9Z" fill="${c}" opacity="${style === "transparent" ? ".35" : ".8"}"/>`;
  if (style === "stripes")
    body += `<defs><pattern id="p" width="22" height="22" patternUnits="userSpaceOnUse" patternTransform="rotate(40)"><path d="M4 0v22" stroke="${p.paper}" stroke-width="7" opacity=".5"/></pattern></defs><path d="M18 12h244v34H18Z" fill="url(#p)"/>`;
  if (style === "dots" || style === "floral")
    for (let x = 29; x < 260; x += 28)
      body +=
        style === "dots"
          ? `<circle cx="${x}" cy="30" r="4" fill="${p.paper}" opacity=".7"/>`
          : `<g fill="${p.paper}" transform="translate(${x} 29)"><ellipse cy="-4" rx="3" ry="5"/><ellipse cy="4" rx="3" ry="5"/><ellipse cx="4" rx="5" ry="3"/><ellipse cx="-4" rx="5" ry="3"/></g>`;
  if (style === "grid")
    body += `<defs><pattern id="g" width="14" height="14" patternUnits="userSpaceOnUse"><path d="M14 0H0V14" fill="none" stroke="${p.ink}" opacity=".22"/></pattern></defs><path d="M18 12h244v34H18Z" fill="url(#g)"/>`;
  if (style === "textured")
    body += `<path d="M24 19h216M32 29h222M19 39h227" stroke="${p.paper}" opacity=".25"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="280" height="60" viewBox="0 0 280 60">${body}</svg>`;
}
function paperSvg(style: string, p: Palette, color?: string) {
  const c = color ?? p.paper;
  const torn =
    "M12 7 30 12 46 6 64 12 81 8 101 12 120 5 140 11 161 7 183 12 201 6 220 12 236 8 231 29 237 47 231 66 238 86 232 104 237 124 231 146 237 165 230 183 236 204 218 200 200 207 180 202 160 208 142 201 122 207 102 201 82 207 63 201 43 207 25 201 9 207 13 188 7 166 13 146 7 125 12 104 7 85 13 65 7 46 13 26Z";
  const outline =
    style === "torn" || style === "scrap"
      ? torn
      : style === "rounded"
        ? "M26 8H219Q233 8 233 22V192Q233 206 219 206H26Q12 206 12 192V22Q12 8 26 8Z"
        : "M12 8H233V206H12Z";
  let body = `<path d="${outline}" transform="translate(3 4)" fill="${p.ink}" opacity=".07"/><path d="${outline}" fill="${c}" stroke="${p.ink}" stroke-opacity=".12"/>`;
  if (["lined", "grid", "dotted"].includes(style))
    for (let y = 39; y < 197; y += 19) {
      if (style === "dotted") {
        for (let x = 31; x < 225; x += 19)
          body += `<circle cx="${x}" cy="${y}" r="1" fill="${p.ink}" opacity=".25"/>`;
      } else
        body += `<path d="M25 ${y}H220" stroke="${p.ink}" stroke-opacity=".18"/>`;
    }
  if (style === "grid")
    for (let x = 31; x < 225; x += 19)
      body += `<path d="M${x} 27V196" stroke="${p.ink}" stroke-opacity=".15"/>`;
  if (style === "vintage")
    body += `<path d="M22 17h202v180H22Z" fill="none" stroke="${p.ink}" stroke-opacity=".15"/><path d="M29 24h188v167H29Z" fill="none" stroke="${p.ink}" stroke-opacity=".08"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="248" height="220" viewBox="0 0 248 220">${body}</svg>`;
}
function decorationSvg(variant: string, p: Palette, color?: string) {
  const c = color ?? p.accent;
  if (variant === "ribbon")
    return wrap(
      `<path d="M67 66Q0 10 19 73q18 19 48-7ZM73 66q67-56 48 7-18 19-48-7Z" fill="${c}" stroke="${p.paper}" stroke-width="3"/><path d="m62 70-20 57 25-13 9 13 9-53m-7 0 30 48-2-29 17 2-44-30Z" fill="${c}"/><ellipse cx="70" cy="67" rx="11" ry="15" fill="${p.colors[3]}"/>`,
    );
  if (variant === "sunburst") return wrap(stickerArt["warm-sun"](c, p));
  if (variant === "confetti")
    return wrap(
      `<g fill="${c}"><path d="m18 23 10 5-5 10-10-5m77 43 12-5 5 12-12 5m-62 23 8-9 9 8-8 9"/><circle cx="94" cy="24" r="5"/><circle cx="24" cy="79" r="4"/></g><g stroke="${p.colors[3]}" stroke-width="5" stroke-linecap="round"><path d="m61 21 4 14m47 71-10 8M55 71l9-6"/></g>`,
    );
  if (variant === "heart-chain")
    return wrap(
      `<path d="M8 72Q70 100 132 60" fill="none" stroke="${p.ink}" stroke-width="2" opacity=".35"/>${[0, 1, 2].map((i) => `<g transform="translate(${4 + i * 43} ${30 + (i % 2) * 13}) scale(.34)">${stickerArt["soft-heart"](c, p)}</g>`).join("")}`,
    );
  return wrap(
    [0, 1, 2, 3, 4]
      .map(
        (j) =>
          `<g transform="translate(${5 + (j % 3) * 43} ${18 + Math.floor(j / 3) * 65}) rotate(${j * 8 - 12}) scale(.28)">${stickerArt[variant === "flower-border" ? "daisy" : "soft-star"](c, p)}</g>`,
      )
      .join(""),
  );
}
export const assets: CreativeAsset[] = [
  ...stickers,
  ...[
    "solid",
    "stripes",
    "dots",
    "grid",
    "floral",
    "transparent",
    "torn",
    "textured",
  ].map((variant) => ({
    id: `tape-${variant}`,
    name: `${variant[0].toUpperCase() + variant.slice(1)} tape`,
    category: "tapes" as const,
    tags: ["washi", "tape", variant],
    width: 280,
    height: 60,
    kind: "svg" as const,
    variant,
    svg: (p: Palette, c?: string) => tapeSvg(variant, p, c),
  })),
  ...[
    "square",
    "rectangle",
    "rounded",
    "torn",
    "lined",
    "grid",
    "dotted",
    "vintage",
    "pastel",
    "scrap",
  ].map((variant) => ({
    id: `paper-${variant}`,
    name: `${variant[0].toUpperCase() + variant.slice(1)} paper`,
    category: "papers" as const,
    tags: ["paper", variant],
    width: 248,
    height: variant === "rectangle" ? 180 : 220,
    kind: "svg" as const,
    variant,
    svg: (p: Palette, c?: string) => paperSvg(variant, p, c),
  })),
  ...[
    "square",
    "translucent",
    "torn-memo",
    "lined-memo",
    "index-card",
    "reminder",
    "quote",
    "rounded",
  ].map((variant) => ({
    id: `note-${variant}`,
    name: variant
      .split("-")
      .map((w) => w[0].toUpperCase() + w.slice(1))
      .join(" "),
    category: "notes" as const,
    tags: ["sticky", "note", "editable"],
    width: 240,
    height: 210,
    kind: "card" as const,
    variant,
  })),
  ...[
    "polaroid",
    "minimal",
    "scrapbook",
    "rounded",
    "vintage",
    "landscape",
  ].map((variant) => ({
    id: `frame-${variant}`,
    name:
      variant === "polaroid"
        ? "Classic Polaroid"
        : `${variant[0].toUpperCase() + variant.slice(1)} frame`,
    category: "frames" as const,
    tags: ["photo", "frame", variant],
    width: 260,
    height: 300,
    kind: "frame" as const,
    variant,
  })),
  ...[
    "curved-arrow",
    "underline",
    "wavy-underline",
    "highlight",
    "brackets",
    "callout",
    "circle",
    "thought-bubble",
    "scribble",
    "dotted-connector",
    "separator",
    "idea-explanation",
    "problem-solution",
    "three-step",
    "mind-map",
  ].map((variant) => ({
    id: `doodle-${variant}`,
    name: variant
      .split("-")
      .map((w) => w[0].toUpperCase() + w.slice(1))
      .join(" "),
    category: "doodles" as const,
    tags: ["native", "editable", "diagram", variant],
    width: 280,
    height: 180,
    kind: "geometry" as const,
    variant,
  })),
  ...["label", "tag", "ticket", "date", "number"].map((variant) => ({
    id: `label-${variant}`,
    name: `${variant[0].toUpperCase() + variant.slice(1)} label`,
    category: "labels" as const,
    tags: ["editable", variant],
    width: 210,
    height: 72,
    kind: "card" as const,
    variant,
  })),
  ...[
    "confetti",
    "corner-sparkles",
    "flower-border",
    "ribbon",
    "sunburst",
    "heart-chain",
  ].map((variant) => ({
    id: `decoration-${variant}`,
    name: variant
      .split("-")
      .map((w) => w[0].toUpperCase() + w.slice(1))
      .join(" "),
    category: "decorations" as const,
    tags: ["decoration", variant],
    width: 200,
    height: 140,
    kind: "svg" as const,
    variant,
    svg: (p: Palette, c?: string) => decorationSvg(variant, p, c),
  })),
  ...[
    "editorial",
    "serif-title",
    "handwritten",
    "subtitle",
    "annotation",
    "highlighted",
    "quote",
    "date",
    "section",
  ].map((variant) => ({
    id: `text-${variant}`,
    name:
      variant === "serif-title"
        ? "Soft Title"
        : variant
            .split("-")
            .map((w) => w[0].toUpperCase() + w.slice(1))
            .join(" "),
    category: "text" as const,
    tags: ["text", "editable", variant],
    width: 350,
    height: 100,
    kind: "text" as const,
    variant,
  })),
];
export function assetById(id: string) {
  return assets.find((a) => a.id === id);
}
export function svgDataUrl(svg: string) {
  return `data:image/svg+xml;base64,${btoa(Array.from(new TextEncoder().encode(svg), (byte) => String.fromCharCode(byte)).join(""))}`;
}
export function assetPreview(
  asset: CreativeAsset,
  p: Palette,
  color?: string,
): string {
  if (asset.svg) return svgDataUrl(asset.svg(p, color));
  const fill = color ?? p.accent;
  if (asset.kind === "frame")
    return svgDataUrl(
      `<svg xmlns="http://www.w3.org/2000/svg" width="160" height="160"><rect x="31" y="16" width="100" height="132" rx="2" fill="${p.paper}" stroke="${p.ink}" stroke-opacity=".15" transform="rotate(-5 80 80)"/><rect x="40" y="25" width="81" height="87" rx="2" fill="${p.colors[0]}"/><path d="m45 106 25-31 18 16 13-20 17 35" fill="${p.ink}" opacity=".15"/><circle cx="100" cy="45" r="10" fill="${p.paper}"/><path d="M56 129h48" stroke="${p.ink}" opacity=".3"/></svg>`,
    );
  if (asset.kind === "text")
    return svgDataUrl(
      `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="140"><text x="16" y="72" font-family="${["handwritten", "serif-title", "quote"].includes(asset.variant) ? "cursive" : "sans-serif"}" font-size="${asset.variant === "annotation" ? 20 : 31}" fill="${p.ink}">${asset.variant === "quote" ? "“little things”" : asset.variant === "date" ? "OCT. 16" : asset.variant === "section" ? "01 / NOTES" : asset.variant === "editorial" ? "THE BIG IDEA" : "a little idea"}</text><path d="M17 96h92" stroke="${fill}" stroke-width="5"/></svg>`,
    );
  if (asset.kind === "geometry") {
    const drawings: Record<string, string> = {
      underline: `<path d="M17 75q81-6 166 0" fill="none" stroke="${fill}" stroke-width="7" stroke-linecap="round"/>`,
      "wavy-underline": `<path d="M16 70q14-18 28 0t28 0 28 0 28 0 28 0 28 0" fill="none" stroke="${fill}" stroke-width="4"/>`,
      highlight: `<path d="m17 64 164-5-3 24-159 2Z" fill="${fill}" opacity=".5"/>`,
      brackets: `<path d="M45 29H25v83h20m110-83h20v83h-20" fill="none" stroke="${fill}" stroke-width="4"/>`,
      circle: `<ellipse cx="100" cy="70" rx="80" ry="34" fill="none" stroke="${fill}" stroke-width="4"/>`,
      separator: `<path d="M19 70h162" stroke="${fill}" stroke-width="2"/>`,
      "dotted-connector": `<path d="M19 70h162" stroke="${fill}" stroke-width="3" stroke-dasharray="5 7"/>`,
      scribble: `<path d="m23 90 45-55-23 70 60-63-26 61 86-52" fill="none" stroke="${fill}" stroke-width="5" stroke-linecap="round"/>`,
    };
    let drawing = drawings[asset.variant];
    if (asset.variant === "callout" || asset.variant === "thought-bubble")
      drawing = `<ellipse cx="99" cy="61" rx="75" ry="39" fill="${fill}" opacity=".65"/><circle cx="40" cy="112" r="8" fill="${fill}"/><path d="M60 56h80m-70 13h60" stroke="${p.ink}" opacity=".35"/>`;
    if (
      [
        "idea-explanation",
        "problem-solution",
        "three-step",
        "mind-map",
      ].includes(asset.variant)
    )
      drawing = `<g fill="${fill}" opacity=".65"><rect x="10" y="43" width="65" height="53" rx="6"/><rect x="125" y="43" width="65" height="53" rx="6"/></g><path d="M80 70h38m-8-8 8 8-8 8" stroke="${p.ink}" fill="none" stroke-width="2"/>`;
    return svgDataUrl(
      `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="140">${drawing ?? `<path d="M20 95Q85 12 168 65m-18-20 20 20-23 12" fill="none" stroke="${fill}" stroke-width="4" stroke-linecap="round"/>`}</svg>`,
    );
  }
  return svgDataUrl(
    `<svg xmlns="http://www.w3.org/2000/svg" width="180" height="150"><rect x="22" y="16" width="137" height="121" rx="${asset.variant === "rounded" ? 15 : 3}" fill="${fill}" opacity=".85"/><path d="M44 51h86m-86 20h74m-74 20h79" stroke="${p.ink}" stroke-width="2" opacity=".35"/></svg>`,
  );
}
