import { cp, mkdir, readFile } from "node:fs/promises";
import sharp from "sharp";
await mkdir("public", { recursive: true });
await cp(
  "node_modules/@excalidraw/excalidraw/dist/prod/fonts",
  "public/fonts",
  { recursive: true },
);
await cp("third-party/font-licenses", "public/fonts/licenses", {
  recursive: true,
});
const svg = await readFile("public/icon.svg");
for (const size of [192, 512])
  await sharp(svg).resize(size, size).png().toFile(`public/icon-${size}.png`);
