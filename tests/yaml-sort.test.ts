import { dump } from "js-yaml";
import { describe, expect, it } from "bun:test";

// oxlint-disable sort-keys -- Tests intentionally use unsorted keys to verify sortKeys:true behavior

/**
 * Verify that js-yaml's `sortKeys: true` produces alphabetically sorted keys
 * at every nesting level, without needing the now-removed `sortedObject` Proxy.
 *
 * The Proxy was wrapping objects to force alphabetical key ordering via
 * `ownKeys` interception, but js-yaml already does this internally when
 * `sortKeys: true` is passed to `dump()`.
 */

describe("YAML key sorting", () => {
  it("sorts top-level keys alphabetically", () => {
    const obj = { z: 1, a: 2, m: 3, b: 4 };
    const yaml = dump(obj, { sortKeys: true });
    expect(yaml).toBe("a: 2\nb: 4\nm: 3\nz: 1\n");
  });

  it("sorts nested keys alphabetically", () => {
    const obj = {
      outer: {
        zebra: "stripes",
        alpha: "first",
        moon: "crater",
      },
    };
    const yaml = dump(obj, { sortKeys: true, lineWidth: -1, noRefs: true });
    // outer's children should be sorted: alpha, moon, zebra
    expect(yaml).toBe("outer:\n  alpha: first\n  moon: crater\n  zebra: stripes\n");
  });

  it("sorts deeply nested keys at every level", () => {
    const obj = {
      config: {
        approvals: [
          {
            user: "alice",
            timestamp: "2024-01-01",
            hash: "abc123",
            status: "approved",
          },
        ],
        column: "in-review",
        title: "my ticket",
      },
    };
    const yaml = dump(obj, { sortKeys: true, lineWidth: -1, noRefs: true });
    // Top level: config
    // config children: approvals, column, title
    // approval object children: hash, status, timestamp, user
    const lines = yaml.split("\n").filter((l) => l !== "");
    expect(lines[0]).toBe("config:");
    expect(lines[1]).toBe("  approvals:");
    expect(lines[2]).toBe("    - hash: abc123");
    expect(lines[3]).toBe("      status: approved");
    expect(lines[4]).toBe("      timestamp: '2024-01-01'");
    expect(lines[5]).toBe("      user: alice");
    expect(lines[6]).toBe("  column: in-review");
    expect(lines[7]).toBe("  title: my ticket");
  });

  it("produces deterministic output regardless of input key order", () => {
    const unsorted = { c: 1, a: 2, b: 3 };
    const sorted = { a: 2, b: 3, c: 1 };
    const yaml1 = dump(unsorted, { sortKeys: true });
    const yaml2 = dump(sorted, { sortKeys: true });
    expect(yaml1).toBe(yaml2);
    expect(yaml1).toBe("a: 2\nb: 3\nc: 1\n");
  });
});
