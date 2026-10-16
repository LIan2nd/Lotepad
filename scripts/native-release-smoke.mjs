import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdir, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { resolve, join } from "node:path";
import { performance } from "node:perf_hooks";
import assert from "node:assert/strict";
import { chromium, expect } from "@playwright/test";

// A read-only UI/runtime check of the real release and its real data location.
// It creates the ordinary empty database on first launch; it creates no notes,
// imports no archives, and never resets or removes an existing database.
if (process.platform !== "win32") throw new Error("Windows is required.");
const root = resolve("artifacts", `release-${Date.now()}`);
const profile = process.env.LOTEPAD_RELEASE_TEST_PROFILE ?? join(root, "webview");
await mkdir(root, { recursive: true });
const server = createServer();
await new Promise((done) => server.listen(0, "127.0.0.1", done));
const port = server.address().port;
await new Promise((done) => server.close(done));
const start = performance.now();
const child = spawn(resolve("src-tauri/target/release/lotepad.exe"), [], {
  windowsHide: true,
  stdio: "ignore",
  env: {
    ...process.env,
    LOTEPAD_TEST_DATA_DIR: join(root, "must-be-ignored"),
    WEBVIEW2_USER_DATA_FOLDER: profile,
    WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${port}`,
  },
});
let browser;
try {
  const deadline = Date.now() + 30000;
  while (true) {
    assert.equal(child.exitCode, null, "Release exited unexpectedly.");
    try {
      await fetch(`http://127.0.0.1:${port}/json/version`);
      break;
    } catch {
      if (Date.now() > deadline)
        throw new Error("Release WebView2 did not start.");
      await new Promise((done) => setTimeout(done, 200));
    }
  }
  browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
  const context = browser.contexts()[0],
    page = context.pages()[0];
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  await expect(
    page.getByRole("button", { name: "Settings", exact: true }),
  ).toBeVisible({ timeout: 20000 });
  const launchMs = performance.now() - start;
  const invoke = (command) =>
    page.evaluate(
      (command) => window.__TAURI_INTERNALS__.invoke(command),
      command,
    );
  const info = await invoke("storage_info");
  assert(
    !info.databasePath.includes("must-be-ignored"),
    "Release must ignore the debug-only test data override.",
  );
  assert(info.databasePath.endsWith("com.lotepad.desktop\\lotepad.db"));
  const integrity = await invoke("verify_database");
  const browserStores = await page.evaluate(async () => ({
    indexedDB: await indexedDB.databases(),
    serviceWorkers: (await navigator.serviceWorker.getRegistrations()).length,
  }));
  assert.deepEqual(browserStores.indexedDB, []);
  assert.equal(browserStores.serviceWorkers, 0);
  await context.setOffline(true);
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Settings", exact: true }),
  ).toBeVisible();
  await page.screenshot({ path: join(root, "release.png") });
  assert.deepEqual(errors, []);
  const report = {
    freshWebViewProfile: !process.env.LOTEPAD_RELEASE_TEST_PROFILE,
    launchMs,
    url: page.url(),
    storage: info,
    integrity,
    browserStores,
    errors,
  };
  await writeFile(join(root, "report.json"), JSON.stringify(report, null, 2));
  const exited = once(child, "exit");
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
  assert.equal((await once(helper, "exit"))[0], 0);
  await exited;
  console.log(JSON.stringify({ root, ...report }, null, 2));
} finally {
  if (child.exitCode === null) child.kill();
  await browser?.close().catch(() => {});
}
