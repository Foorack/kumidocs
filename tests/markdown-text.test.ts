import { describe, expect, it } from "bun:test";
import markdownToPlainText from "@/lib/markdown-text";

describe("markdownToPlainText", () => {
  it("drops heading, quote, list and task markers", () => {
    expect(markdownToPlainText("# Title\n\n> quoted\n\n- one\n1. two\n- [x] done\n- [ ] open")).toBe(
      "Title quoted one two done open",
    );
  });

  it("keeps the code inside fences and inline code", () => {
    expect(markdownToPlainText("Run `npm test`:\n\n```ts\nconst answer = 42;\n```")).toBe(
      "Run npm test : const answer = 42;",
    );
  });

  it("keeps link text, image alt text and wiki link labels", () => {
    expect(
      markdownToPlainText("See [the docs](https://x.y), ![Logo](logo.png), [[guide]] and [[notes|my notes]]."),
    ).toBe("See the docs, Logo, guide and my notes.");
  });

  it("turns tables into their cell text", () => {
    expect(markdownToPlainText("| Name | Role |\n| ---- | :--: |\n| Alice | Admin |")).toBe(
      "Name Role Alice Admin",
    );
  });

  it("strips emphasis but keeps underscores inside identifiers", () => {
    expect(markdownToPlainText("**bold** _italic_ ~~gone~~ file_path __init__")).toBe(
      "bold italic gone file_path init",
    );
  });

  it("drops HTML tags and comments", () => {
    expect(markdownToPlainText("a <!-- hidden --> <b>b</b> c")).toBe("a b c");
  });
});
