import { describe, expect, it } from "bun:test";
import { Glob } from "bun";
import path from "node:path";

/**
 * AGENTS.md: never use font-medium or font-semibold. Text is either normal
 * weight or font-bold, which keeps the visual hierarchy consistent.
 */

const srcDir = path.join(import.meta.dir, "..", "src");
const BANNED = /\bfont-(?:medium|semibold)\b/u;

describe("font weight classes", () => {
  it("never uses font-medium or font-semibold", async () => {
    const offenders: string[] = [];
    for await (const rel of new Glob("**/*.{ts,tsx,css}").scan(srcDir)) {
      const lines = (await Bun.file(path.join(srcDir, rel)).text()).split("\n");
      for (const [index, line] of lines.entries()) {
        if (BANNED.test(line)) {
          offenders.push(`src/${rel}:${String(index + 1)}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});
