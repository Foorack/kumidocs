import { describe, expect, it } from "bun:test";
import { emojiKey, emojiSvgUrl } from "@/lib/emoji-key";

describe("emojiKey", () => {
  it("encodes a single code point", () => {
    expect(emojiKey("🏠")).toBe("1f3e0");
  });

  it("keeps every code point of a sequence, including modifiers and selectors", () => {
    expect(emojiKey("👍🏽")).toBe("1f44d-1f3fd");
    expect(emojiKey("❤️")).toBe("2764-fe0f");
    expect(emojiKey("👩‍💻")).toBe("1f469-200d-1f4bb");
  });

  it("builds the static SVG URL", () => {
    expect(emojiSvgUrl("📘")).toBe("/api/emoji/1f4d8.svg");
  });
});
