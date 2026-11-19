import { describe, expect, it } from "bun:test";
import RateLimiter from "@/server/rate-limit";

describe("RateLimiter", () => {
  it("keeps the bucket map bounded when callers invent identities", () => {
    // The key is the user id from a header, so the map must not grow with it.
    const limiter = new RateLimiter(1, 60_000, 2);

    expect(limiter.check("a")).toBe(true);
    expect(limiter.check("b")).toBe(true);
    // At the cap: adding "c" evicts "a", so "a" starts over instead of the
    // map holding a third bucket.
    expect(limiter.check("c")).toBe(true);
    expect(limiter.check("a")).toBe(true);
  });

  it("still denies a caller that keeps the same identity", () => {
    const limiter = new RateLimiter(1, 60_000, 2);

    expect(limiter.check("a")).toBe(true);
    expect(limiter.check("a")).toBe(false);
  });
});
