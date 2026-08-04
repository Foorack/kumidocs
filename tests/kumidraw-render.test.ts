import { describe, expect, it } from "bun:test";
import { parseKumidraw } from "@/lib/kumidraw/parser";
import { kumidrawDimensions } from "@/lib/kumidraw/render";
import rehypeKumidraw from "@/components/editor/plugins/kumidraw-code-block";
import type { Element, Root } from "hast";

// oxlint-disable eslint/require-unicode-regexp -- patterns are plain ASCII

function parse(src: string) {
  return parseKumidraw(src);
}

function rootWith(codeSource: string): Root {
  return {
    type: "root",
    children: [
      {
        type: "element",
        tagName: "pre",
        properties: {},
        children: [
          {
            type: "element",
            tagName: "code",
            properties: { className: ["language-kumidraw"] },
            children: [{ type: "text", value: codeSource }],
          },
        ],
      },
    ],
  };
}

describe("kumidrawDimensions", () => {
  it("sizes an empty diagram to just the padding around the origin", () => {
    const doc = parse("# kumidraw v:1 grid:10");
    // No elements: the view is the PAD margin only (20 each axis).
    expect(kumidrawDimensions(doc)).toEqual({ width: 20, height: 20 });
  });

  it("sizes to the bounding box of the elements plus padding", () => {
    const doc = parse(`${"# kumidraw v:1 grid:10"}\nbox (100, 200) (300, 150)`);
    // box extends x: 100..400, y: 200..350. Padding 20 each side.
    const dims = kumidrawDimensions(doc);
    expect(dims.width).toBe(420);
    expect(dims.height).toBe(370);
  });

  it("includes line points in the extent", () => {
    const doc = parse(`${"# kumidraw v:1 grid:10"}\nline (10, 10) (500, 400)`);
    const dims = kumidrawDimensions(doc);
    expect(dims.width).toBe(520);
    expect(dims.height).toBe(420);
  });

  it("does not grow negative when elements start at the origin", () => {
    const doc = parse(`${"# kumidraw v:1 grid:10"}\nbox (0, 0) (50, 60)`);
    const dims = kumidrawDimensions(doc);
    expect(dims.width).toBe(70);
    expect(dims.height).toBe(80);
  });
});

describe("rehypeKumidraw plugin", () => {
  it("converts a kumidraw fenced code block into a kumidraw-diagram element", () => {
    const src = "# kumidraw v:1 grid:10\nbox (10, 10) (20, 20)";
    const tree = rootWith(src);
    const plugin = rehypeKumidraw();
    plugin(tree);

    expect(tree.children).toHaveLength(1);
    const el = tree.children[0] as Element;
    expect(el.type).toBe("element");
    expect(el.tagName).toBe("kumidraw-diagram");
    expect(el.properties["data-kumidraw"]).toBe(src);
  });

  it("leaves non-kumidraw code blocks untouched", () => {
    const tree: Root = {
      type: "root",
      children: [
        {
          type: "element",
          tagName: "pre",
          properties: {},
          children: [
            {
              type: "element",
              tagName: "code",
              properties: { className: ["language-csv"] },
              children: [{ type: "text", value: "a;b" }],
            },
          ],
        },
      ],
    };
    const plugin = rehypeKumidraw();
    plugin(tree);

    expect(tree.children).toHaveLength(1);
    const el = tree.children[0] as Element;
    expect(el.type).toBe("element");
    expect(el.tagName).toBe("pre");
  });

  it("handles a code block with no language class", () => {
    const tree: Root = {
      type: "root",
      children: [
        {
          type: "element",
          tagName: "pre",
          properties: {},
          children: [
            {
              type: "element",
              tagName: "code",
              properties: {},
              children: [{ type: "text", value: "plain" }],
            },
          ],
        },
      ],
    };
    const plugin = rehypeKumidraw();
    plugin(tree);
    const el = tree.children[0] as Element;
    expect(el.tagName).toBe("pre");
  });
});
