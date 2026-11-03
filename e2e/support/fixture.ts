/**
 * Builds the content repo the e2e server runs against. Every run starts
 * from the same files and the same commit, so specs can rely on exact
 * titles, paths and history.
 *
 * Specs must not modify these files. Tests that create, edit or delete
 * pages work on their own uniquely named pages.
 */
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { EDITOR, FIXTURE_DIR, REMOTE_DIR, REPO_DIR } from "./env";

// 1x1 transparent PNG
const PIXEL_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
  "base64",
);

const FILES: Record<string, string | Buffer> = {
  ".kumidocs.json": `${JSON.stringify(
    { editors: [EDITOR], instanceName: "E2E Docs", sidebarDefaultDepth: 1 },
    undefined,
    2,
  )}\n`,
  "README.md": `---
emoji: 🏠
---

# Welcome to E2E Docs

This is the home page of the fixture repo.

See the [[guide]] for setup steps, or the [[notes]] page.
`,
  "data.csv": "name,count\napples,3\npears,5\n",
  "deck.md": `---
slides: true
paginate: true
---

# First Slide

Opening words.

---

# Second Slide

Middle part.

---

# Third Slide

The end.
`,
  "diagram.kumidraw": `# kumidraw v:1 grid:10

box (40, 40) (200, 80) #3498db "Client"
box (360, 40) (200, 80) #2ecc71 "Server"
`,
  "flow.mermaid": "graph LR\n  A[Start] --> B[Finish]\n",
  "guide.md": `---
emoji: 📘
---

# Guide

The guide section has child pages.
`,
  "guide/advanced.md": `# Advanced Topics

Only for experienced users. Back to the [[guide]].
`,
  "guide/setup.md": `# Setup

## Install

Run the installer.

## Configure

Edit the config file.
`,
  "images/logo.png": PIXEL_PNG,
  "notes.md": `# Notes

A page with rich content.

| Name  | Role   |
| ----- | ------ |
| Alice | Admin  |
| Bob   | Viewer |

\`\`\`ts
const answer: number = 42;
\`\`\`

- [x] Done item
- [ ] Open item

The word pineapple only appears on this page.

![Logo](images/logo.png)
`,
  "script.ts": 'export const greeting = "hello from script";\n',
};

const GIT_ENV = {
  GIT_AUTHOR_DATE: "2026-01-01T12:00:00Z",
  GIT_AUTHOR_EMAIL: "fixture@example.com",
  GIT_AUTHOR_NAME: "Fixture",
  GIT_COMMITTER_DATE: "2026-01-01T12:00:00Z",
  GIT_COMMITTER_EMAIL: "fixture@example.com",
  GIT_COMMITTER_NAME: "Fixture",
};

async function git(cwd: string, ...args: string[]): Promise<void> {
  const proc = Bun.spawn(["git", ...args], {
    cwd,
    env: { ...Bun.env, ...GIT_ENV },
    stderr: "pipe",
    stdout: "pipe",
  });
  if ((await proc.exited) !== 0) {
    const stderr = await new Response(proc.stderr).text();
    throw new Error(`git ${args.join(" ")} failed: ${stderr}`);
  }
}

/** Wipe and recreate the fixture: a bare remote plus a clone with all files committed. */
async function buildFixture(): Promise<void> {
  await rm(FIXTURE_DIR, { force: true, recursive: true });
  await mkdir(REPO_DIR, { recursive: true });

  await git(FIXTURE_DIR, "init", "--quiet", "--bare", "--initial-branch=main", REMOTE_DIR);
  await git(REPO_DIR, "init", "--quiet", "--initial-branch=main");

  await Promise.all(
    Object.entries(FILES).map(async ([rel, content]) => {
      const abs = path.join(REPO_DIR, rel);
      await mkdir(path.dirname(abs), { recursive: true });
      await writeFile(abs, content);
    }),
  );

  await git(REPO_DIR, "add", "--all");
  await git(REPO_DIR, "commit", "--quiet", "--message", "Initial fixture content");
  await git(REPO_DIR, "remote", "add", "origin", REMOTE_DIR);
  await git(REPO_DIR, "push", "--quiet", "--set-upstream", "origin", "main");
}

export default buildFixture;
