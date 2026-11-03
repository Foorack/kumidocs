import { existsSync } from "node:fs";
import path from "node:path";

// The built frontend lives in a public/ directory next to the server bundle.
// When bundled into dist/index.js, import.meta.dir is dist/, so it is just
// public/. In dev, import.meta.dir is src/server/, so it is ../../dist/public.
// KUMIDOCS_PUBLIC_DIR overrides both.
const bundledPublic = path.join(import.meta.dir, "public");
const publicDir =
  // oxlint-disable-next-line unicorn/no-process-env
  process.env.KUMIDOCS_PUBLIC_DIR ??
  // oxlint-disable-next-line node/no-sync
  (existsSync(bundledPublic)
    ? bundledPublic
    : path.join(import.meta.dir, "..", "..", "dist", "public"));

export default publicDir;
