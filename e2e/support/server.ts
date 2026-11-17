/**
 * Starts one production server per e2e instance and waits until each answers.
 * global-setup.ts calls this after a single build, so no two runs race on dist/.
 */
import path from "node:path";
import { instanceList } from "./env";
import type { Instance } from "./env";

const ROOT = path.join(import.meta.dir, "..", "..");
const STARTUP_TIMEOUT_MS = 60_000;

interface RunningServer {
  instance: Instance;
  process: Bun.Subprocess;
}

const startInstance = (instance: Instance): RunningServer => {
  const child = Bun.spawn(["bun", path.join(ROOT, "dist", "index.js"), instance.repoDir], {
    env: { ...Bun.env, ...instance.env },
    stderr: "inherit",
    stdout: "inherit",
  });
  return { instance, process: child };
};

const waitUntilReady = async (server: RunningServer): Promise<void> => {
  const { baseURL, name } = server.instance;
  const deadline = Date.now() + STARTUP_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (server.process.exitCode !== null) {
      throw new Error(
        `${name} exited with code ${String(server.process.exitCode)} before answering on ${baseURL}. ` +
          "Check the server log above; another run may be holding the port.",
      );
    }
    try {
      const res = await fetch(`${baseURL}/favicon.ico`);
      if (res.status === 200) {
        return;
      }
    } catch {
      // Not listening yet.
    }
    await Bun.sleep(100);
  }
  throw new Error(`${name} did not answer on ${baseURL} within ${String(STARTUP_TIMEOUT_MS)}ms.`);
};

/** Start every instance, resolve once they all answer, return a stop function. */
async function startServers(): Promise<() => void> {
  const servers = instanceList.map((instance) => startInstance(instance));
  const stop = (): void => {
    for (const server of servers) {
      server.process.kill();
    }
  };
  try {
    for (const server of servers) {
      await waitUntilReady(server);
    }
  } catch (error: unknown) {
    // Playwright never calls the teardown of a setup that threw.
    stop();
    throw error;
  }
  return stop;
}

export default startServers;
