/**
 * Owns the whole e2e environment: one build, one fixture and one server per
 * instance, then stops them when the run ends.
 *
 * The build lives here rather than in playwright.config.ts because webServer
 * entries start before globalSetup. Four entries would each build and race on
 * dist/; a single owner makes the order explicit.
 */
import path from "node:path";
import { instanceList } from "./env";
import buildFixture from "./fixture";
import startServers from "./server";

const ROOT = path.join(import.meta.dir, "..", "..");

async function buildApp(): Promise<void> {
  const build = Bun.spawn(["bun", "run", "build"], {
    cwd: ROOT,
    stderr: "inherit",
    stdout: "inherit",
  });
  if ((await build.exited) !== 0) {
    throw new Error("bun run build failed. Fix the build before running the e2e suite.");
  }
}

async function globalSetup(): Promise<() => void> {
  await buildApp();
  await Promise.all(instanceList.map(async (instance) => buildFixture(instance)));
  return startServers();
}

export default globalSetup;
