/** Shared constants for the e2e servers, fixture repos and specs. */
import os from "node:os";
import path from "node:path";

// oxlint-disable-next-line unicorn/no-process-env
const PORT = Number(process.env.KUMIDOCS_E2E_PORT ?? "5870");
const BASE_URL = `http://localhost:${String(PORT)}`;

/** Rebuilt from scratch on every run, kept afterwards for debugging. */
const FIXTURE_DIR = path.join(os.tmpdir(), `kumidocs-e2e-${String(PORT)}`);
const REPO_DIR = path.join(FIXTURE_DIR, "repo");
const REMOTE_DIR = path.join(FIXTURE_DIR, "remote.git");

const AUTH_HEADER = "X-Auth-Request-User";
const EDITOR = "editor@example.com";
const SECOND_EDITOR = "second-editor@example.com";
const VIEWER = "viewer@example.com";

const asUser = (email: string): Record<string, string> => ({ [AUTH_HEADER]: email });

/** Writes one user may make on the rate-limited instance before it answers 429. */
const RATE_LIMIT_COUNT = 3;

interface Instance {
  /** Stable label used in logs and to pick fixture extras. */
  name: string;
  port: number;
  baseURL: string;
  fixtureDir: string;
  repoDir: string;
  remoteDir: string;
  /** Environment for the server process, already merged with the shared defaults. */
  env: Record<string, string>;
}

const SHARED_ENV = {
  // Server commits need a committer identity even on machines without git config.
  GIT_COMMITTER_EMAIL: "kumidocs@localhost",
  GIT_COMMITTER_NAME: "KumiDocs",
  KUMIDOCS_AUTO_SAVE_DELAY: "500",
  // No outbound calls: tests must not depend on Gravatar being reachable.
  KUMIDOCS_DISABLE_GRAVATAR: "true",
  // Background pulls would make timing nondeterministic; the remote never changes anyway.
  KUMIDOCS_PULL_INTERVAL: "3600000",
  // Parallel workers share one server, so the default limit is far too low.
  KUMIDOCS_RATE_LIMIT: "10000/10000",
};

const makeInstance = (name: string, offset: number, env: Record<string, string> = {}): Instance => {
  // The main instance keeps KUMIDOCS_E2E_PORT. The variants sit ten ports
  // apart, so a second checkout started one or two ports higher never shares
  // a server or a fixture dir with this one.
  const port = PORT + offset;
  const fixtureDir = path.join(os.tmpdir(), `kumidocs-e2e-${String(port)}`);
  return {
    baseURL: `http://localhost:${String(port)}`,
    env: { ...SHARED_ENV, ...env, KUMIDOCS_PORT: String(port) },
    fixtureDir,
    name,
    port,
    remoteDir: path.join(fixtureDir, "remote.git"),
    repoDir: path.join(fixtureDir, "repo"),
  };
};

const instances = {
  hiddenFiles: makeInstance("hiddenFiles", 30),
  main: makeInstance("main", 0),
  rateLimited: makeInstance("rateLimited", 20, {
    KUMIDOCS_RATE_LIMIT: `${String(RATE_LIMIT_COUNT)}/10000`,
  }),
  readonly: makeInstance("readonly", 10, { KUMIDOCS_READONLY: "true" }),
};

const instanceList: Instance[] = Object.values(instances);

export {
  BASE_URL,
  EDITOR,
  FIXTURE_DIR,
  type Instance,
  instanceList,
  instances,
  PORT,
  RATE_LIMIT_COUNT,
  REMOTE_DIR,
  REPO_DIR,
  SECOND_EDITOR,
  VIEWER,
  asUser,
};
