/**
 * Production build script.
 *
 * Bundles src/index.ts (and the frontend it imports via src/index.html) into
 * dist/ using Bun's native bundler with the bun-plugin-tailwind Tailwind CSS
 * plugin so that @apply / @theme / etc. are processed correctly.
 *
 * Outputs:
 *   dist/index.js          — server entrypoint (the npm bin), with shebang added
 *   dist/chunk-[hash].js   — bundled frontend
 *   dist/index.html        — HTML shell referencing the hashed assets
 *   dist/chunk-[hash].css  — processed Tailwind CSS
 *   dist/logo-[hash].png   — favicon
 *
 * Usage:  bun scripts/build.ts
 */

import tailwindPlugin from 'bun-plugin-tailwind';
import { rmSync, chmodSync } from 'fs';
import { join } from 'path';

const root = join(import.meta.dir, '..');
const distDir = join(root, 'dist');

const t0 = performance.now();
console.log('Building KumiDocs…');

// Always start from a clean slate so stale hashed files don't accumulate.
rmSync(distDir, { recursive: true, force: true });

const result = await Bun.build({
	entrypoints: [join(root, 'src/index.ts')],
	outdir: distDir,
	target: 'bun',
	plugins: [tailwindPlugin],
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
