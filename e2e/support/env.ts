/** Shared constants for the e2e server, fixture repo and specs. */
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

export { BASE_URL, EDITOR, FIXTURE_DIR, PORT, REMOTE_DIR, REPO_DIR, SECOND_EDITOR, VIEWER, asUser };
