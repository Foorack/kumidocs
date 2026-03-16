/**
 * Production build script.
 *
 * Bundles src/index.ts (and the frontend it imports via src/index.html) into
 * dist/ using Bun's native bundler with the bun-plugin-tailwind Tailwind CSS
 * plugin so that @apply / @theme / etc. are processed correctly.
 *
 * Outputs:
 *   dist/index.js              — server entrypoint (the npm bin), with shebang added
 *   dist/public/index.html     — HTML shell
 *   dist/public/chunk-[h].js  — bundled React app
 *   dist/public/chunk-[h].css — processed Tailwind CSS
 *   dist/public/logo-[h].png  — favicon
 *
 * Usage:  bun scripts/build.ts
 */

import tailwindPlugin from 'bun-plugin-tailwind';
import { rmSync, chmodSync } from 'fs';
import { join } from 'path';

const root = join(import.meta.dir, '..');
const distDir = join(root, 'dist');
const publicDir = join(distDir, 'public');

const t0 = performance.now();
console.log('Building KumiDocs…');

// Always start from a clean slate so stale hashed files don't accumulate.
rmSync(distDir, { recursive: true, force: true });

// ── Step 1: Frontend (browser) ────────────────────────────────────────────────
// Build the React app from index.html into dist/public/.  The server bundle
// then serves these files from disk via import.meta.dir, which is CWD-independent.
console.log('  [1/2] Frontend…');
const frontendResult = await Bun.build({
	entrypoints: [join(root, 'src/index.html')],
	outdir: publicDir,
	plugins: [tailwindPlugin],
	minify: true,
});

for (const log of frontendResult.logs) {
	if (log.level === 'error') console.error(log.message);
	else if (log.level === 'warning') console.warn(log.message);
}
if (!frontendResult.success) process.exit(1);

// ── Step 2: Server (bun target) ───────────────────────────────────────────────
// __BUNDLED__ is injected so the server switches from Bun's HTML-import HMR
// route (dev) to the static file handler that reads from import.meta.dir/public/.
console.log('  [2/2] Server…');
const result = await Bun.build({
	entrypoints: [join(root, 'src/index.ts')],
	outdir: distDir,
	target: 'bun',
	plugins: [tailwindPlugin],
	define: { __BUNDLED__: JSON.stringify('true') },
	minify: true,
});

for (const log of result.logs) {
	if (log.level === 'error') console.error(log.message);
	else if (log.level === 'warning') console.warn(log.message);
}

if (!result.success) process.exit(1);

// Bun doesn't add a shebang to bundled output.  Add one so the bin can be
// executed directly (e.g. after npm/bunx installs it outside node_modules).
const binPath = join(distDir, 'index.js');
const source = await Bun.file(binPath).text();
await Bun.write(binPath, '#!/usr/bin/env bun\n' + source);
chmodSync(binPath, 0o755);

const elapsed = ((performance.now() - t0) / 1000).toFixed(1);
console.log(`Done in ${elapsed}s`);
