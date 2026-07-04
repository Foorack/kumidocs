// oxlint-disable unicorn/no-process-exit
/**
 * Production build script.
 *
 * Bundles src/index.ts (and the frontend it imports via src/index.html) into
 * dist/ using Bun's native bundler with the bun-plugin-tailwind Tailwind CSS
 * plugin so that @apply / @theme / etc. are processed correctly.
 *
 * Outputs:
 *   dist/index.js: server entrypoint (the npm bin), with shebang added
 *   dist/public/index.html: HTML shell
 *   dist/public/chunk-[h].js: bundled React app
 *   dist/public/chunk-[h].css: processed Tailwind CSS
 *   dist/public/logo-[h].png: favicon
 *
 * Usage:  bun scripts/build.ts
 */

import tailwindPlugin from "bun-plugin-tailwind";
import { chmod, mkdir, rm } from "node:fs/promises";

const join = (...segments: string[]): string => segments.join("/");

const root = join(import.meta.dir, "..");
const distDir = join(root, "dist");
const publicDir = join(distDir, "public");

// oxlint-disable-next-line typescript/no-unsafe-assignment
const pkg: { version: string } = JSON.parse(await Bun.file(join(root, "package.json")).text());
const appVersion = pkg.version;

const t0 = performance.now();
console.log(`Building KumiDocs v${appVersion}...`);

// Always start from a clean slate so stale hashed files don't accumulate.
await rm(distDir, { force: true, recursive: true });

// Step 1: Frontend (browser)
// Build the React app from index.html into dist/public/.  The server bundle
// then serves these files from disk via import.meta.dir, which is CWD-independent.
console.log("  [1/2] Frontend...");
const frontendResult = await Bun.build({
  define: { __VERSION__: JSON.stringify(appVersion) },
  entrypoints: [join(root, "src/index.html")],
  minify: true,
  outdir: publicDir,
  plugins: [tailwindPlugin],
});

for (const log of frontendResult.logs) {
  if (log.level === "error") {
    console.error(log.message);
  } else if (log.level === "warning") {
    console.warn(log.message);
  }
}
if (!frontendResult.success) {
  process.exit(1);
}

// Step 2: Icon packs (combined into a single text file for /api/icons endpoint)
console.log("  [2/3] Icon packs…");
const iconPacks = ["devicon", "flag", "fluent-color", "glyphs-poly", "logos"];
const iconLines: string[] = [];
for (const name of iconPacks) {
  const src = join(root, "node_modules", "@iconify-json", name, "icons.json");
  // oxlint-disable-next-line typescript/no-unsafe-assignment
  const data: unknown = JSON.parse(await Bun.file(src).text());
  iconLines.push(`${name};${JSON.stringify(data)}`);
}
await Bun.write(join(publicDir, "icons.txt"), iconLines.join("\n"));

// Emoji data (text file, served gzipped via /api/emojis endpoint)
await Bun.write(
  join(publicDir, "emojis.txt"),
  Bun.file(join(root, "src/components/ui/emoji/emojis.txt")),
);

// Step 3: Server (bun target)
// __BUNDLED__ is injected so the server switches from Bun's HTML-import HMR
// route (dev) to the static file handler that reads from import.meta.dir/public/.
console.log("  [3/3] Server…");
const result = await Bun.build({
  define: {
    __BUNDLED__: JSON.stringify("true"),
    __VERSION__: JSON.stringify(appVersion),
  },
  entrypoints: [join(root, "src/index.ts")],
  minify: true,
  outdir: distDir,
  plugins: [tailwindPlugin],
  target: "bun",
});

for (const log of result.logs) {
  if (log.level === "error") {
    console.error(log.message);
  } else if (log.level === "warning") {
    console.warn(log.message);
  }
}

if (!result.success) {
  process.exit(1);
}

// Bun doesn't add a shebang to bundled output.  Add one so the bin can be
// executed directly (e.g. after npm/bunx installs it outside node_modules).
const binPath = join(distDir, "index.js");
const source = await Bun.file(binPath).text();
await Bun.write(binPath, `#!/usr/bin/env bun\n${source}`);
await chmod(binPath, 0o755);

const elapsed = ((performance.now() - t0) / 1000).toFixed(1);
console.log(`Done in ${elapsed}s`);
