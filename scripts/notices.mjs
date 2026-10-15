import { readFile, readdir, writeFile } from "node:fs/promises";
const lock = JSON.parse(await readFile("package-lock.json", "utf8"));
const notices = [
  "lotepad — third-party software acknowledgments\n\nThe following open-source packages and their dependencies are distributed with this application. License texts remain the property of their respective authors.\n",
];
for (const file of (await readdir("third-party")).filter((f) =>
  f.endsWith(".txt"),
))
  notices.push(await readFile(`third-party/${file}`, "utf8"));
for (const [path, entry] of Object.entries(lock.packages)) {
  if (!path || entry.dev) continue;
  try {
    const pkg = JSON.parse(await readFile(`${path}/package.json`, "utf8"));
    notices.push(
      `\n${"=".repeat(72)}\n${pkg.name} ${pkg.version} — ${pkg.license ?? "See license below"}\n${pkg.repository?.url ?? ""}\n`,
    );
    const files = await readdir(path);
    const licenseFiles = files.filter((f) =>
      /(?:^|[-_.])(licen[cs]e|copying|notice|copyright)([-_.]|$)/i.test(f),
    );
    for (const file of licenseFiles) {
      try {
        notices.push(await readFile(`${path}/${file}`, "utf8"));
      } catch {
        /* Directory instead of a text license. */
      }
    }
    if (!licenseFiles.length) {
      for (const file of files.filter((f) => /^readme/i.test(f))) {
        const text = await readFile(`${path}/${file}`, "utf8");
        const section = text.match(
          /(?:^|\n)#{1,3} License\s*\n([\s\S]*?)(?=\n#{1,3} |$)/i,
        );
        if (section) notices.push(section[1]);
      }
    }
  } catch {
    /* Optional package unavailable on this platform. */
  }
}
notices.push(
  "\nSelf-hosted Excalidraw font licenses are also distributed under public/fonts/. These include SIL Open Font License fonts. See their individual license files.",
);
await writeFile("public/THIRD_PARTY_NOTICES.txt", notices.join("\n"));
