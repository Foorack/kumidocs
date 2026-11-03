import { afterEach, describe, expect, it } from "bun:test";
import ConfigError from "@/server/config-error";
import { loadConfig } from "@/server/config";

const originalArgv = process.argv;

const withArgs = (...args: string[]): ReturnType<typeof loadConfig> => {
  process.argv = ["bun", "index.ts", ...args];
  return loadConfig();
};

afterEach(() => {
  process.argv = originalArgv;
});

describe("command-line arguments", () => {
  it("accepts known flags", () => {
    const config = withArgs("/tmp/repo", "--readonly", "--port", "6001");
    expect(config.repoPath).toBe("/tmp/repo");
    expect(config.readonly).toBe(true);
    expect(config.port).toBe(6001);
  });

  it("rejects an unknown flag instead of ignoring it", () => {
    expect(() => withArgs("--read-only")).toThrow(ConfigError);
    expect(() => withArgs("--read-only")).toThrow("Unknown option: --read-only");
  });

  it("rejects a second repo path", () => {
    expect(() => withArgs("/tmp/a", "/tmp/b")).toThrow("Unexpected argument: /tmp/b");
  });

  it("rejects an invalid value", () => {
    expect(() => withArgs("--port", "abc")).toThrow(ConfigError);
  });
});
