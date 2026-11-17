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
import { EDITOR, instances, SECOND_EDITOR } from "./env";
import type { Instance } from "./env";
import PIXEL_PNG from "./images";

const PERMISSIONS = {
  editors: [EDITOR, SECOND_EDITOR],
  instanceName: "E2E Docs",
  sidebarDefaultDepth: 1,
};

const FILES: Record<string, string | Buffer> = {
  "README.md": `---
emoji: 🏠
---

# Welcome to E2E Docs

This is the home page of the fixture repo.

See the [[guide]] for setup steps, or the [[notes]] page.
`,
  "architecture.mermaid": "architecture-beta\n  service web(devicon:nginx)[Web Server]\n",
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
box (360, 40) (200, 80) #2ecc71 :nginx "Server"
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

Edit the config file and set the \`cache_dir\` option.
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

interface FixtureExtras {
  /** Extra files written only into this instance's repo. */
  files?: Record<string, string>;
  /** Merged over the base .kumidocs.json contents. */
  permissions?: Record<string, unknown>;
}

const EXTRAS: Partial<Record<string, FixtureExtras>> = {
  hiddenFiles: {
    files: {
      "hidden-page.md": "# Hidden Page\n\nThe word sasquatch appears only on this page.\n",
    },
    // Keep the file out of the tree and the search index, but still on disk.
    permissions: { hideFiles: ["hidden-page.md"] },
  },
  rateLimited: {
    // The burst test uses a fresh user per attempt so a retry starts with an
    // empty bucket. An empty editors list makes any of those users an editor.
    permissions: { editors: [] },
  },
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

/** Wipe and recreate one instance's fixture: a bare remote plus a clone with all files committed. */
async function buildFixture(target: Instance = instances.main): Promise<void> {
  const extras = EXTRAS[target.name] ?? {};
  const files: Record<string, string | Buffer> = {
    ...FILES,
    ...extras.files,
    ".kumidocs.json": `${JSON.stringify(
      { ...PERMISSIONS, ...extras.permissions },
      undefined,
      2,
    )}\n`,
  };

  await rm(target.fixtureDir, { force: true, recursive: true });
  await mkdir(target.repoDir, { recursive: true });

  await git(
    target.fixtureDir,
    "init",
    "--quiet",
    "--bare",
    "--initial-branch=main",
    target.remoteDir,
  );
  await git(target.repoDir, "init", "--quiet", "--initial-branch=main");

  await Promise.all(
    Object.entries(files).map(async ([rel, content]) => {
      const abs = path.join(target.repoDir, rel);
      await mkdir(path.dirname(abs), { recursive: true });
      await writeFile(abs, content);
    }),
  );

  await git(target.repoDir, "add", "--all");
  await git(target.repoDir, "commit", "--quiet", "--message", "Initial fixture content");
  await git(target.repoDir, "remote", "add", "origin", target.remoteDir);
  await git(target.repoDir, "push", "--quiet", "--set-upstream", "origin", "main");
}

export default buildFixture;
