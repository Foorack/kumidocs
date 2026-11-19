import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { isSafePath } from "@/server/api-utils";

// Every write route runs isSafePath before touching the disk, so these tests
// build a real tree: symlinks only misbehave on a real filesystem.
let root: string;
let repo: string;

beforeAll(() => {
  root = mkdtempSync(path.join(os.tmpdir(), "kumidocs-safe-path-"));
  repo = path.join(root, "repo");
  mkdirSync(path.join(repo, "guide"), { recursive: true });
  writeFileSync(path.join(repo, "notes.md"), "# Notes\n");
  writeFileSync(path.join(repo, "guide", "setup.md"), "# Setup\n");

  // Same prefix as the repo, so a plain startsWith() on the path would let it through.
  mkdirSync(path.join(root, "repo-evil"), { recursive: true });
  writeFileSync(path.join(root, "repo-evil", "evil.md"), "# Evil\n");

  mkdirSync(path.join(root, "outside"), { recursive: true });
  writeFileSync(path.join(root, "outside", "secret.md"), "# Secret\n");
  writeFileSync(path.join(root, "outside.md"), "# Outside\n");

  // Symlinks are committed to git like any other entry, so a checkout can
  // bring one into the repo. They must not become a way out of it.
  symlinkSync(path.join(root, "outside"), path.join(repo, "escape"));
  symlinkSync(path.join(root, "outside.md"), path.join(repo, "escape-file.md"));
  symlinkSync(path.join(repo, "guide"), path.join(repo, "inside-link"));

  // git and the runtime execute what lives here, so these are never content.
  mkdirSync(path.join(repo, ".git", "hooks"), { recursive: true });
  writeFileSync(path.join(repo, ".git", "config"), "");
  mkdirSync(path.join(repo, "node_modules", "pkg"), { recursive: true });
  writeFileSync(path.join(repo, "node_modules", "pkg", "index.js"), "");
  symlinkSync(path.join(repo, ".git"), path.join(repo, "gitlink"));
  writeFileSync(path.join(repo, ".gitignore"), "dist\n");
});

afterAll(() => {
  rmSync(root, { force: true, recursive: true });
});

describe("isSafePath traversal guard", () => {
  it("rejects a single parent hop", () => {
    expect(isSafePath(repo, "../outside.md")).toBe(false);
  });

  it("rejects a climb out through system directories", () => {
    expect(isSafePath(repo, "../../etc/passwd")).toBe(false);
  });

  it("rejects a climb out that starts with a real subdirectory", () => {
    expect(isSafePath(repo, "guide/../../outside.md")).toBe(false);
  });

  it("rejects an absolute path", () => {
    expect(isSafePath(repo, "/etc/passwd")).toBe(false);
  });

  it("rejects a sibling directory that shares the repo prefix", () => {
    expect(isSafePath(repo, "../repo-evil/evil.md")).toBe(false);
  });

  it("rejects a symlink inside the repo that points outside", () => {
    expect(isSafePath(repo, "escape/secret.md")).toBe(false);
    expect(isSafePath(repo, "escape")).toBe(false);
    expect(isSafePath(repo, "escape-file.md")).toBe(false);
  });

  it("rejects a file that does not exist yet under a symlink that points outside", () => {
    expect(isSafePath(repo, "escape/new-page.md")).toBe(false);
  });

  it("accepts a symlink inside the repo that points inside", () => {
    expect(isSafePath(repo, "inside-link/setup.md")).toBe(true);
    expect(isSafePath(repo, "inside-link/new-page.md")).toBe(true);
  });

  it("accepts a nested path that does not exist yet", () => {
    expect(isSafePath(repo, "drafts/2026/new-page.md")).toBe(true);
  });

  it("normalises dot segments that stay inside", () => {
    expect(isSafePath(repo, "guide/../notes.md")).toBe(true);
  });

  it("accepts the repo root itself", () => {
    expect(isSafePath(repo, ".")).toBe(true);
    expect(isSafePath(repo, "")).toBe(true);
    expect(isSafePath(repo, repo)).toBe(true);
  });

  it("rejects writes inside .git", () => {
    expect(isSafePath(repo, ".git/config")).toBe(false);
    expect(isSafePath(repo, ".git/hooks/post-checkout")).toBe(false);
    expect(isSafePath(repo, "guide/../.git/config")).toBe(false);
  });

  it("rejects writes inside node_modules", () => {
    expect(isSafePath(repo, "node_modules/pkg/index.js")).toBe(false);
  });

  it("rejects a symlink that resolves into .git", () => {
    expect(isSafePath(repo, "gitlink/config")).toBe(false);
    expect(isSafePath(repo, "gitlink/new-file")).toBe(false);
  });

  it("accepts a dotfile whose name only starts with .git", () => {
    expect(isSafePath(repo, ".gitignore")).toBe(true);
    expect(isSafePath(repo, "guide/.gitattributes")).toBe(true);
  });
});
