import { readFile, readdir, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

// Run after the Windows Cargo dependencies have been fetched. The generated
// notice is checked in so a frontend-only build needs no Rust installation.
const lock = await readFile("src-tauri/Cargo.lock", "utf8");
const packages = new Set(
  [
    ...lock.matchAll(
      /\[\[package\]\]\s+name = "([^"]+)"\s+version = "([^"]+)"/g,
    ),
  ].map((entry) => `${entry[1]}-${entry[2]}`),
);
const root = join(
  process.env.CARGO_HOME ?? join(homedir(), ".cargo"),
  "registry",
  "src",
);
const notices = [
  "Lotepad Desktop — Rust dependency acknowledgments\n\nWindows build dependencies and their license texts. Generated from Cargo.lock and the local Cargo registry. Packages for other platforms are not distributed by the Windows build.\n",
];
let count = 0;
for (const registry of await readdir(root)) {
  for (const name of (await readdir(join(root, registry))).sort()) {
    if (!packages.has(name)) continue;
    const directory = join(root, registry, name);
    const manifest = await readFile(join(directory, "Cargo.toml"), "utf8");
    const license =
      manifest.match(/^license\s*=\s*"([^"]+)"/m)?.[1] ?? "See license below";
    notices.push(`\n${"=".repeat(72)}\n${name} — ${license}\n`);
    let found = false;
    for (const file of await readdir(directory, { withFileTypes: true })) {
      if (
        !/(?:^|[-_.])(licen[cs]e|copying|notice|copyright)([-_.]|$)/i.test(
          file.name,
        )
      )
        continue;
      if (file.isFile()) {
        notices.push(await readFile(join(directory, file.name), "utf8"));
        found = true;
      } else if (file.isDirectory()) {
        for (const child of await readdir(join(directory, file.name), {
          withFileTypes: true,
        })) {
          if (child.isFile()) {
            notices.push(
              await readFile(join(directory, file.name, child.name), "utf8"),
            );
            found = true;
          }
        }
      }
    }
    if (!found) {
      for (const file of (await readdir(directory)).filter((name) =>
        /^readme/i.test(name),
      )) {
        const text = await readFile(join(directory, file), "utf8");
        const section = text.match(
          /(?:^|\n)#{1,3} Licen[cs]e\s*\n([\s\S]*?)(?=\n#{1,3} |$)/i,
        );
        if (section) notices.push(section[1]);
      }
    }
    count++;
  }
}
await writeFile(
  "public/RUST_THIRD_PARTY_NOTICES.txt",
  notices.join("\n").replace(/\r\n/g, "\n").replace(/[ \t]+$/gm, ""),
);
console.log(`Generated Rust acknowledgments for ${count} fetched packages.`);
