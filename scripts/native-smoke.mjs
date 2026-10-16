import { spawn } from "node:child_process";
import { mkdir, readFile, writeFile, readdir } from "node:fs/promises";
import { resolve, join } from "node:path";
import { once } from "node:events";
import { performance } from "node:perf_hooks";
import { createServer } from "node:net";
import assert from "node:assert/strict";
import { chromium, expect as baseExpect } from "@playwright/test";
import { DatabaseSync } from "node:sqlite";
import { createHash } from "node:crypto";
import JSZip from "jszip";

if (process.platform !== "win32")
  throw new Error("This native smoke test requires Windows and WebView2.");
const expect = baseExpect.configure({ timeout: 20000 });
const root = resolve("artifacts", `native-${Date.now()}`);
await mkdir(root, { recursive: true });
const executable = resolve("src-tauri/target/debug/lotepad.exe");
const server = createServer();
await new Promise((done) => server.listen(0, "127.0.0.1", done));
const port = server.address().port;
await new Promise((done) => server.close(done));
const env = {
  ...process.env,
  LOTEPAD_TEST_DATA_DIR: join(root, "data"),
  WEBVIEW2_USER_DATA_FOLDER: join(root, "webview"),
  WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${port}`,
};
let child, browser, page;
const errors = [],
  consoleErrors = [],
  report = { root, timings: {} };
const invoke = (command, args = {}) =>
  page.evaluate(
    ({ command, args }) => window.__TAURI_INTERNALS__.invoke(command, args),
    { command, args },
  );
const repository = (type, args = {}) =>
  invoke("repository_call", { request: { type, ...args } });
// Excalidraw's restore pass normalizes an absent binding list to an empty list.
const elements = (scene) =>
  scene.elements.map((element) => ({
    ...element,
    boundElements: element.boundElements ?? [],
  }));
async function launch() {
  const start = performance.now();
  child = spawn(executable, [], { env, windowsHide: true, stdio: "pipe" });
  child.stderr.on("data", (chunk) => process.stderr.write(chunk));
  const deadline = Date.now() + 30000;
  while (true) {
    if (child.exitCode !== null)
      throw new Error(`Native app exited: ${child.exitCode}`);
    try {
      await fetch(`http://127.0.0.1:${port}/json/version`);
      break;
    } catch {
      if (Date.now() > deadline) throw new Error("WebView2 CDP did not start.");
      await new Promise((done) => setTimeout(done, 200));
    }
  }
  browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
  const context = browser.contexts()[0];
  page = context.pages()[0] ?? (await context.waitForEvent("page"));
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.setDefaultTimeout(20000);
  await expect(
    page.getByRole("button", { name: "Settings", exact: true }),
  ).toBeVisible();
  report.timings.launchMs ??= performance.now() - start;
  return context;
}
async function dialog(path, cancel = false) {
  const args = [
    "-NoProfile",
    "-ExecutionPolicy",
    "Bypass",
    "-File",
    resolve("scripts/native-file-dialog.ps1"),
    "-AppProcessId",
    String(child.pid),
  ];
  if (cancel) args.push("-Cancel");
  else args.push("-FilePath", path);
  const helper = spawn("powershell.exe", args, {
    windowsHide: true,
    stdio: "pipe",
  });
  let output = "";
  helper.stdout.on("data", (chunk) => {
    output += chunk;
  });
  helper.stderr.on("data", (chunk) => {
    output += chunk;
  });
  const [code] = await once(helper, "exit");
  if (code !== 0) throw new Error(output);
}
async function close() {
  const exited = once(child, "exit");
  // Use the real native close event; the React handler must flush before destroy.
  const helper = spawn(
    "powershell.exe",
    [
      "-NoProfile",
      "-ExecutionPolicy",
      "Bypass",
      "-File",
      resolve("scripts/native-file-dialog.ps1"),
      "-AppProcessId",
      String(child.pid),
      "-CloseApp",
    ],
    { windowsHide: true, stdio: "inherit" },
  );
  const [code] = await once(helper, "exit");
  assert.equal(code, 0);
  await exited;
  await browser.close();
}
try {
  const context = await launch();
  assert.equal((await repository("listNotebooks")).length, 0);
  await page.getByRole("button", { name: "New notebook", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Notebook name" })
    .fill("Native scrapbook");
  await page
    .getByRole("button", { name: "Create notebook", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Open Native scrapbook", exact: true })
    .click();
  await expect(page.locator(".excalidraw canvas").first()).toBeVisible();
  await expect(
    page.getByText("All changes saved", { exact: true }),
  ).toBeVisible();
  const bounds = await page.locator(".excalidraw canvas").first().boundingBox();
  await page.mouse.click(bounds.x + 350, bounds.y + 240);
  await page.keyboard.press("p");
  await page.mouse.move(bounds.x + 350, bounds.y + 240);
  await page.mouse.down();
  await page.mouse.move(bounds.x + 440, bounds.y + 300, { steps: 20 });
  await page.mouse.up();
  await page.keyboard.press("Escape");
  await expect(
    page.getByText("All changes saved", { exact: true }),
  ).toBeVisible();
  const pages = await repository("listPages");
  const active = pages[0].id;
  let first = await repository("loadContent", { id: active });
  assert(first.elements.some((e) => e.type === "freedraw"));
  assert(
    Object.keys(first.files).length > 0,
    "Paper SVG must persist as a BLOB.",
  );
  report.drawingElements = first.elements.length;
  await page.screenshot({ path: join(root, "editor.png") });
  // Editing is offline; packaged fonts, editor and Creative Library must work.
  await context.setOffline(true);
  await page.reload();
  await expect(page.locator(".excalidraw canvas").first()).toBeVisible();
  await page
    .getByRole("button", { name: "Creative Library", exact: true })
    .click();
  await expect(
    page.getByRole("complementary", { name: "Creative Library", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Insert Soft Star", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Close Creative Library", exact: true })
    .click();
  await expect(
    page.getByText("All changes saved", { exact: true }),
  ).toBeVisible();
  first = await repository("loadContent", { id: active });
  await context.setOffline(false);
  const restored = await repository("loadContent", { id: active });
  assert.deepEqual(elements(restored), elements(first));
  await close();
  await launch();
  const reopened = await repository("loadContent", { id: active });
  assert.deepEqual(elements(reopened), elements(first));
  assert.deepEqual(reopened.files, first.files);
  if (
    await page
      .getByRole("button", { name: "Show page sidebar", exact: true })
      .isVisible()
  )
    await page
      .getByRole("button", { name: "Show page sidebar", exact: true })
      .click();
  await page.getByRole("button", { name: "New page", exact: true }).click();
  await page
    .getByRole("button", { name: "Scrapbook layouts", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Choose Organized Chaos", exact: true })
    .click();
  await page.getByRole("button", { name: "Create page", exact: true }).click();
  await expect(
    page.getByRole("textbox", { name: "Page title", exact: true }),
  ).toHaveValue("Organized Chaos");
  await expect(
    page.getByText("All changes saved", { exact: true }),
  ).toBeVisible();
  const templatePage = (await repository("listPages")).find(
    (entry) => entry.title === "Organized Chaos",
  );
  const template = await repository("loadContent", { id: templatePage.id });
  assert(template.elements.length > 12);
  assert(template.elements.some((element) => element.type === "text"));
  assert(template.elements.some((element) => element.containerId));
  report.templateElements = template.elements.length;
  await page
    .getByRole("button", { name: "Back to notebooks", exact: true })
    .click();
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page
    .getByRole("button", { name: "Verify database", exact: true })
    .click();
  await expect(
    page.getByText(
      "Database, scene references, media, and foreign keys verified.",
      { exact: true },
    ),
  ).toBeVisible();
  for (const [kind, label] of [
    ["sql", "Export SQL Backup"],
    ["db", "Export Snapshot"],
    ["zip", "Export Portable Backup"],
  ]) {
    const path = join(root, `backup.${kind}`);
    await page.getByRole("button", { name: label, exact: true }).click();
    await dialog(path);
    await expect(
      page.getByText(`Backup saved to ${path}`, { exact: true }),
    ).toBeVisible();
    report[`${kind}Bytes`] = (await readFile(path)).length;
  }
  await page
    .getByRole("button", { name: "Export SQL Backup", exact: true })
    .click();
  await dialog("", true);
  await expect(
    page.getByRole("button", { name: "Export SQL Backup", exact: true }),
  ).toBeEnabled();
  assert.equal(
    await page.getByText(/Backup saved to/).count(),
    0,
    "Cancelled export must not report success.",
  );
  const sql = await readFile(join(root, "backup.sql"), "utf8");
  const restoredDb = new DatabaseSync(join(root, "restored.db"));
  restoredDb.exec(sql);
  const snapshotDb = new DatabaseSync(join(root, "backup.db"), {
    readOnly: true,
  });
  const tables = snapshotDb
    .prepare(
      "SELECT name FROM sqlite_schema WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
    )
    .all();
  for (const { name } of tables) {
    const query = `SELECT * FROM "${name.replaceAll('"', '""')}" ORDER BY rowid`;
    assert.deepEqual(
      restoredDb.prepare(query).all(),
      snapshotDb.prepare(query).all(),
      `Table ${name} differs`,
    );
  }
  assert.equal(
    restoredDb.prepare("PRAGMA integrity_check").get().integrity_check,
    "ok",
  );
  assert.equal(restoredDb.prepare("PRAGMA foreign_key_check").all().length, 0);
  report.tablesCompared = tables.map((row) => row.name);
  report.assetHashes = restoredDb
    .prepare("SELECT binary_data FROM assets")
    .all()
    .map((row) => createHash("sha256").update(row.binary_data).digest("hex"));
  restoredDb.close();
  snapshotDb.close();
  const zip = await JSZip.loadAsync(await readFile(join(root, "backup.zip")));
  assert(zip.file("manifest.json"));
  assert(zip.file("data.json"));
  report.integrity = await invoke("verify_database");
  // Import the archive actually downloaded by the isolated browser test.
  const fixture = (await readdir("test-results", { recursive: true })).find(
    (name) => name.endsWith("browser-migration.zip"),
  );
  assert(fixture, "Run tests/migration.spec.ts before this native test.");
  const migrationPath = join(root, "browser-migration.zip");
  await writeFile(migrationPath, await readFile(join("test-results", fixture)));
  const sourceZip = await JSZip.loadAsync(await readFile(migrationPath));
  const source = JSON.parse(await sourceZip.file("data.json").async("string"));
  await page
    .getByRole("button", {
      name: "Import notes or restore backup",
      exact: true,
    })
    .click();
  await page
    .getByRole("button", { name: "Select archive", exact: true })
    .click();
  await dialog(migrationPath);
  await expect(
    page.getByRole("button", { name: "Import & verify", exact: true }),
  ).toBeEnabled();
  await page
    .getByRole("button", { name: "Import & verify", exact: true })
    .click();
  await expect(
    page.getByRole("heading", {
      name: "Notes imported and verified",
      exact: true,
    }),
  ).toBeVisible();
  const imported = await repository("loadContent", { id: "migration-page" });
  assert.deepEqual(
    imported.elements,
    source.contents.find((scene) => scene.pageId === "migration-page").elements,
  );
  assert.deepEqual(
    imported.files,
    source.contents.find((scene) => scene.pageId === "migration-page").files,
  );
  assert.equal(
    await repository("getMeta", { key: "future-meta" }),
    "Unicode Ω and 'quotes'\n",
  );
  report.browserMigration = await invoke("verify_database");
  await page.getByRole("button", { name: "Done", exact: true }).click();
  await page
    .getByRole("button", {
      name: "Import notes or restore backup",
      exact: true,
    })
    .click();
  await page
    .getByRole("button", { name: "Select archive", exact: true })
    .click();
  await dialog(migrationPath);
  await expect(
    page.getByText(
      "This exact archive has already been imported. Merge will not add another copy.",
      { exact: true },
    ),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Import & verify", exact: true }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  // Restore the actual native portable backup with a recovery snapshot first.
  await page
    .getByRole("button", {
      name: "Import notes or restore backup",
      exact: true,
    })
    .click();
  await page
    .getByRole("button", { name: "Select archive", exact: true })
    .click();
  await dialog(join(root, "backup.zip"));
  await page
    .getByRole("button", { name: "Replace desktop data…", exact: true })
    .click();
  await page
    .getByRole("button", {
      name: "Create safety backup & replace",
      exact: true,
    })
    .click();
  await expect(
    page.getByRole("heading", {
      name: "Notes imported and verified",
      exact: true,
    }),
  ).toBeVisible();
  assert.equal((await repository("listNotebooks")).length, 1);
  const recovered = await repository("loadContent", { id: active });
  assert.deepEqual(elements(recovered), elements(first));
  assert.deepEqual(recovered.files, first.files);
  const safetyFiles = (await readdir(join(root, "data", "recovery"))).filter(
    (name) => name.endsWith(".db"),
  );
  assert.equal(safetyFiles.length, 1);
  const safety = new DatabaseSync(
    join(root, "data", "recovery", safetyFiles[0]),
    { readOnly: true },
  );
  assert.equal(
    safety.prepare("SELECT count(*) AS count FROM notebooks").get().count,
    source.notebooks.length + 1,
  );
  assert.equal(
    safety.prepare("PRAGMA integrity_check").get().integrity_check,
    "ok",
  );
  safety.close();
  report.portableRestore = await invoke("verify_database");
  await page.getByRole("button", { name: "Done", exact: true }).click();
  await page.screenshot({ path: join(root, "storage.png") });
  report.pageErrors = errors;
  report.consoleErrors = consoleErrors;
  assert.deepEqual(errors, []);
  assert.deepEqual(consoleErrors, []);
  await close();
  await writeFile(join(root, "report.json"), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
} finally {
  if (child && child.exitCode === null) {
    const capture = spawn(
      "powershell.exe",
      [
        "-NoProfile",
        "-ExecutionPolicy",
        "Bypass",
        "-File",
        resolve("scripts/native-file-dialog.ps1"),
        "-AppProcessId",
        String(child.pid),
        "-Capture",
        join(root, "native-window.png"),
      ],
      { windowsHide: true, stdio: "ignore" },
    );
    await once(capture, "exit");
  }
  if (child && child.exitCode === null) child.kill();
  await browser?.close().catch(() => {});
  await writeFile(
    join(root, "diagnostics.json"),
    JSON.stringify({ errors, consoleErrors }, null, 2),
  );
}
