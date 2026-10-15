import { palettes } from "./palettes";
import { svgDataUrl } from "./registry";
import type { Palette, TemplateId } from "./types";
export interface TemplateDefinition {
  id: TemplateId;
  name: string;
  description: string;
  paletteId: string;
  tags: string[];
}
export const scrapbookTemplates: TemplateDefinition[] = [
  {
    id: "organized-chaos",
    name: "Organized Chaos",
    description: "Layered papers, small reminders, room to explore.",
    paletteId: "lavender",
    tags: ["asymmetric", "notes", "collage"],
  },
  {
    id: "dreamy-study",
    name: "Dreamy Study Notes",
    description: "Clear concepts, connected ideas, softer study sessions.",
    paletteId: "cloudy",
    tags: ["study", "diagram", "learning"],
  },
  {
    id: "creative-journal",
    name: "Creative Journal",
    description: "Photos, little moments, and a few words to keep.",
    paletteId: "peach",
    tags: ["journal", "photos", "diary"],
  },
  {
    id: "editorial-collage",
    name: "Editorial Collage",
    description: "Generous type and a carefully imperfect composition.",
    paletteId: "vintage",
    tags: ["editorial", "magazine", "photos"],
  },
];

export function templateThumbnail(id: TemplateId, palette?: Palette) {
  const p =
    palette ??
    palettes.find(
      (p) => p.id === scrapbookTemplates.find((t) => t.id === id)?.paletteId,
    ) ??
    palettes[0];
  const journal = id === "creative-journal",
    study = id === "dreamy-study",
    editorial = id === "editorial-collage";
  const body = study
    ? `<rect x="18" y="70" width="164" height="47" rx="4" fill="${p.colors[0]}"/><rect x="18" y="135" width="66" height="43" rx="4" fill="${p.colors[1]}"/><path d="M90 155h20" stroke="${p.ink}"/><rect x="116" y="135" width="66" height="43" rx="4" fill="${p.colors[3]}"/><rect x="18" y="195" width="164" height="47" fill="${p.colors[0]}"/>`
    : journal
      ? `<g transform="rotate(-5 55 130)"><rect x="20" y="89" width="73" height="103" fill="white"/><rect x="26" y="95" width="61" height="70" fill="${p.colors[0]}"/></g><g transform="rotate(6 145 150)"><rect x="109" y="107" width="73" height="103" fill="white"/><rect x="115" y="113" width="61" height="70" fill="${p.colors[3]}"/></g><path d="M26 227h143m-143 10h101" stroke="${p.ink}" opacity=".3"/>`
      : editorial
        ? `<rect x="18" y="92" width="97" height="124" fill="${p.colors[0]}"/><rect x="127" y="96" width="55" height="94" fill="${p.colors[3]}"/><path d="M20 237h143m-143 10h99" stroke="${p.ink}" opacity=".4"/>`
        : `<g transform="rotate(-4 65 110)"><rect x="18" y="75" width="94" height="77" fill="${p.paper}" stroke="${p.ink}" stroke-opacity=".15"/><path d="M29 96h70m-70 12h57m-57 12h65" stroke="${p.ink}" opacity=".3"/></g><rect x="125" y="87" width="59" height="63" fill="${p.colors[3]}" transform="rotate(4 155 115)"/><rect x="22" y="175" width="73" height="83" fill="white"/><rect x="29" y="182" width="59" height="53" fill="${p.colors[0]}"/><rect x="113" y="184" width="68" height="69" fill="${p.colors[0]}" transform="rotate(-4 146 216)"/>`;
  return svgDataUrl(
    `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="282" viewBox="0 0 200 282"><rect width="200" height="282" rx="4" fill="${p.paper}"/><path d="M19 28h112m-112 14h146m-146 14h99" stroke="${p.ink}" stroke-width="${editorial ? 6 : 4}"/>${body}<path d="m172 20 3 9 9 3-9 4-3 10-4-10-9-4 10-3Z" fill="${p.accent}"/></svg>`,
  );
}
