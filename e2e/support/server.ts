/**
 * Entry point for Playwright's webServer: build a fresh fixture repo, then
 * run the production bundle (dist/index.js) against it.
 */
import path from "node:path";
import buildFixture from "./fixture";
import { PORT, REPO_DIR } from "./env";

await buildFixture();

const root = path.join(import.meta.dir, "..", "..");
const server = Bun.spawn(["bun", path.join(root, "dist", "index.js"), REPO_DIR], {
  env: {
    ...Bun.env,
    // Server commits need a committer identity even on machines without git config.
    GIT_COMMITTER_EMAIL: "kumidocs@localhost",
    GIT_COMMITTER_NAME: "KumiDocs",
    KUMIDOCS_AUTO_SAVE_DELAY: "500",
    KUMIDOCS_PORT: String(PORT),
    // Background pulls would make timing nondeterministic; the remote never changes anyway.
    KUMIDOCS_PULL_INTERVAL: "3600000",
    // Parallel workers share one server, so the default limit is far too low.
    KUMIDOCS_RATE_LIMIT: "10000/10000",
  },
  stderr: "inherit",
  stdout: "inherit",
});

const stop = (): void => {
  server.kill();
};
process.on("SIGINT", stop);
process.on("SIGTERM", stop);

process.exitCode = await server.exited;
