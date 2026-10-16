import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";
import { readFile } from "node:fs/promises";

function desktopFontSources(code: string) {
  if (!code.includes("ASSETS_FALLBACK_URL")) return;
  // Excalidraw 0.18.1 adds a CDN source even with ASSET_PATH configured.
  // Keep its local sources and font APIs, removing only that fallback.
  const expression =
    /\b\w+\.push\(new URL\(\w+,\s*\w+\.ASSETS_FALLBACK_URL\)\)/g;
  if (!expression.test(code))
    throw new Error(
      "Excalidraw font source changed; review the desktop font adapter before upgrading.",
    );
  return code.replace(expression, "void 0");
}

export default defineConfig(({ mode }) => ({
  plugins: [
    {
      name: "lotepad-desktop-fonts",
      enforce: "pre",
      transform(code, id) {
        if (
          mode !== "desktop" ||
          !id.replaceAll("\\", "/").includes("/@excalidraw/excalidraw/")
        )
          return;
        const transformed = desktopFontSources(code);
        if (transformed !== undefined) return { code: transformed, map: null };
      },
    },
    react(),
    tailwindcss(),
    VitePWA({
      disable: mode === "desktop",
      registerType: "prompt",
      includeAssets: ["icon.svg", "icon-192.png", "icon-512.png"],
      manifest: {
        name: "Lotepad",
        short_name: "Lotepad",
        description: "Your Creative Little Universe",
        theme_color: "#f6f5f1",
        background_color: "#f6f5f1",
        display: "standalone",
        start_url: "/",
        icons: [
          { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
          {
            src: "/icon-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "any maskable",
          },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,png,svg,woff2,txt}"],
        maximumFileSizeToCacheInBytes: 9000000,
        navigateFallback: "/index.html",
        cleanupOutdatedCaches: true,
      },
    }),
  ],
  build: {
    target: "es2022",
    outDir: mode === "desktop" ? "dist-desktop" : "dist",
  },
  server: { watch: { ignored: ["**/src-tauri/**"] } },
  optimizeDeps: {
    // Keep CommonJS transitive dependencies in Vite's optimizer. Excluding the
    // SDK leaves dependencies such as es6-promise-pool unusable in dev browsers.
    include: mode === "desktop" ? ["@excalidraw/excalidraw"] : [],
    esbuildOptions: {
      plugins:
        mode === "desktop"
          ? [
              {
                name: "lotepad-desktop-fonts",
                setup(build) {
                  build.onLoad(
                    {
                      filter:
                        /[\\/]@excalidraw[\\/]excalidraw[\\/]dist[\\/].*\.js$/,
                    },
                    async ({ path }) => {
                      const transformed = desktopFontSources(
                        await readFile(path, "utf8"),
                      );
                      if (transformed !== undefined)
                        return { contents: transformed, loader: "js" };
                    },
                  );
                },
              },
            ]
          : [],
    },
  },
  test: { include: ["src/**/*.test.ts"], environment: "node" },
}));
