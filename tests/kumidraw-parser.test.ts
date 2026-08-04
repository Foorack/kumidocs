import { describe, expect, it } from "bun:test";
import { parseKumidraw } from "@/lib/kumidraw/parser";
import type { KumidrawDoc } from "@/lib/kumidraw/types";

// oxlint-disable sort-keys -- tests assert exact object shapes, intentional ordering
// oxlint-disable eslint/require-unicode-regexp -- toMatch() patterns are plain ASCII substrings

const HEADER = "# kumidraw v:1 grid:10";

function parse(source: string): KumidrawDoc {
  return parseKumidraw(source);
}

function firstElement(doc: KumidrawDoc): KumidrawDoc["elements"][number] | undefined {
  return doc.elements[0];
}

describe("header", () => {
  it("parses a valid header", () => {
    const doc = parse(HEADER);
    expect(doc.header).toEqual({ version: 1, grid: 10, settings: { v: "1", grid: "10" } });
    expect(doc.errors).toEqual([]);
  });

  it("rejects a file with no header", () => {
    const doc = parse("box (10, 10) (20, 20)");
    expect(doc.header).toBeNull();
    expect(doc.elements).toEqual([]);
    expect(doc.errors).toHaveLength(1);
    expect(doc.errors[0]?.message).toMatch(/header/);
  });

  it("rejects an empty file", () => {
    const doc = parse("");
    expect(doc.header).toBeNull();
    expect(doc.errors[0]?.message).toMatch(/header/);
  });

  it("rejects an unknown version", () => {
    const doc = parse("# kumidraw v:2 grid:10");
    expect(doc.header).toBeNull();
    expect(doc.errors[0]?.message).toMatch(/version/);
  });

  it("rejects a non-numeric version", () => {
    const doc = parse("# kumidraw v:one grid:10");
    expect(doc.header).toBeNull();
    expect(doc.errors[0]?.message).toMatch(/version/);
  });

  it("rejects a missing version", () => {
    const doc = parse("# kumidraw grid:10");
    expect(doc.header).toBeNull();
    expect(doc.errors[0]?.message).toMatch(/version/);
  });

  it("rejects an unsupported grid", () => {
    const doc = parse("# kumidraw v:1 grid:20");
    expect(doc.header).toBeNull();
    expect(doc.errors[0]?.message).toMatch(/grid/);
  });

  it("rejects a non-numeric grid", () => {
    const doc = parse("# kumidraw v:1 grid:ten");
    expect(doc.header).toBeNull();
    expect(doc.errors[0]?.message).toMatch(/grid/);
  });

  it("rejects a missing grid", () => {
    const doc = parse("# kumidraw v:1");
    expect(doc.header).toBeNull();
    expect(doc.errors[0]?.message).toMatch(/grid/);
  });

  it("ignores unrecognized settings", () => {
    const doc = parse("# kumidraw v:1 grid:10 zoom:2");
    expect(doc.header?.version).toBe(1);
    expect(doc.header?.grid).toBe(10);
    expect(doc.header?.settings.zoom).toBe("2");
    expect(doc.errors).toEqual([]);
  });

  it("treats a non-first-line comment as a comment, not a second header", () => {
    const doc = parse(`${HEADER}\n# kumidraw v:1 grid:10`);
    expect(doc.header).not.toBeNull();
    expect(doc.errors).toEqual([]);
    expect(doc.elements).toEqual([]);
  });
});

describe("comments and blank lines", () => {
  it("ignores comment lines", () => {
    const doc = parse(`${HEADER}\n# a comment\nbox (10, 10) (20, 20)`);
    expect(doc.elements).toHaveLength(1);
    expect(doc.errors).toEqual([]);
  });

  it("ignores blank lines", () => {
    const doc = parse(`${HEADER}\n\n  \n\t\nbox (10, 10) (20, 20)`);
    expect(doc.elements).toHaveLength(1);
    expect(doc.errors).toEqual([]);
  });

  it("ignores trailing whitespace and leading indentation", () => {
    const doc = parse(`${HEADER}\n  box (10, 10) (20, 20)   `);
    expect(doc.elements).toHaveLength(1);
    expect(doc.errors).toEqual([]);
  });
});

describe("box", () => {
  it("parses a minimal box", () => {
    const doc = parse(`${HEADER}\nbox (110, 110) (180, 80)`);
    expect(firstElement(doc)).toEqual({
      kind: "box",
      x: 110,
      y: 110,
      w: 180,
      h: 80,
      dashed: false,
      noborder: false,
    });
    expect(doc.errors).toEqual([]);
  });

  it("accepts coordinates without a comma space", () => {
    const doc = parse(`${HEADER}\nbox (110,110) (180,80)`);
    expect(doc.errors).toEqual([]);
    expect(firstElement(doc)).toMatchObject({ x: 110, y: 110, w: 180, h: 80 });
  });

  it("parses a filled box with icon and label", () => {
    const doc = parse(`${HEADER}\nbox (110, 110) (180, 80) #3498db :gitlab "GitLab"`);
    expect(firstElement(doc)).toMatchObject({
      kind: "box",
      fill: "#3498db",
      icon: "gitlab",
      label: "GitLab",
    });
    expect(doc.errors).toEqual([]);
  });

  it("parses a dashed group with a label", () => {
    const doc = parse(`${HEADER}\nbox (40, 40) (1800, 1000) dashed #f4f6f8 "AWS Region"`);
    expect(firstElement(doc)).toMatchObject({
      dashed: true,
      fill: "#f4f6f8",
      label: "AWS Region",
    });
    expect(doc.errors).toEqual([]);
  });

  it("parses an icon-only box", () => {
    const doc = parse(`${HEADER}\nbox (110, 110) (180, 80) :nginx`);
    expect(firstElement(doc)).toMatchObject({ icon: "nginx" });
    expect(doc.errors).toEqual([]);
  });

  it("rejects anchor keywords as unknown decorations", () => {
    for (const word of ["topleft", "top", "topright", "left", "right", "bottom"]) {
      const doc = parse(`${HEADER}\nbox (1, 2) (3, 4) ${word}`);
      expect(doc.errors[0]?.message, word).toMatch(/unknown box decoration/);
    }
  });

  it("allows a label with spaces", () => {
    const doc = parse(`${HEADER}\nbox (1, 2) (3, 4) "subnet 1 10.0.0.0/24"`);
    expect(firstElement(doc)).toMatchObject({ label: "subnet 1 10.0.0.0/24" });
    expect(doc.errors).toEqual([]);
  });

  it("allows an icon and a label together", () => {
    const doc = parse(`${HEADER}\nbox (1, 2) (3, 4) :docker "Docker"`);
    expect(firstElement(doc)).toMatchObject({ icon: "docker", label: "Docker" });
    expect(doc.errors).toEqual([]);
  });

  it("reports a missing position", () => {
    const doc = parse(`${HEADER}\nbox (180, 80)`);
    expect(doc.elements).toEqual([]);
    expect(doc.errors[0]?.message).toMatch(/position/);
  });

  it("reports a missing size", () => {
    const doc = parse(`${HEADER}\nbox (10, 10)`);
    expect(doc.elements).toEqual([]);
    expect(doc.errors[0]?.message).toMatch(/size/);
  });

  it("reports an unknown decoration", () => {
    const doc = parse(`${HEADER}\nbox (10, 10) (20, 20) frobnicate`);
    expect(doc.elements).toHaveLength(1);
    expect(doc.errors[0]?.message).toMatch(/unknown box decoration/);
  });

  it("reports a duplicate icon", () => {
    const doc = parse(`${HEADER}\nbox (10, 10) (20, 20) :a :b`);
    expect(doc.elements).toHaveLength(1);
    expect(doc.errors[0]?.message).toMatch(/more than one icon/);
  });

  it("reports a zero size", () => {
    const doc = parse(`${HEADER}\nbox (10, 10) (0, 20)`);
    expect(doc.errors[0]?.message).toMatch(/positive/);
  });

  it("rejects a negative coordinate", () => {
    // The tokenizer only accepts digits inside '(a, b)', so a minus sign is
    // rejected at tokenize time and the box is dropped.
    const doc = parse(`${HEADER}\nbox (-10, 10) (20, 20)`);
    expect(doc.elements).toEqual([]);
    expect(doc.errors[0]?.message).toMatch(/number/);
  });
});

describe("line", () => {
  it("parses a straight two-point line", () => {
    const doc = parse(`${HEADER}\nline (200, 190) (840, 150)`);
    expect(firstElement(doc)).toEqual({
      kind: "line",
      points: [
        { x: 200, y: 190 },
        { x: 840, y: 150 },
      ],
    });
    expect(doc.errors).toEqual([]);
  });

  it("parses a straight line with an end arrow", () => {
    const doc = parse(`${HEADER}\nline (200, 190) (840, 150) ->`);
    expect(firstElement(doc)).toMatchObject({ arrows: "end" });
    expect(doc.errors).toEqual([]);
  });

  it("parses a start arrow", () => {
    const doc = parse(`${HEADER}\nline (200, 190) (840, 150) <-`);
    expect(firstElement(doc)).toMatchObject({ arrows: "start" });
  });

  it("parses a both-ends arrow", () => {
    const doc = parse(`${HEADER}\nline (200, 190) (840, 150) <->`);
    expect(firstElement(doc)).toMatchObject({ arrows: "both" });
  });

  it("parses a polyline through several points", () => {
    const doc = parse(`${HEADER}\nline (200, 190) (400, 300) (840, 150)`);
    expect(firstElement(doc)).toMatchObject({
      points: [
        { x: 200, y: 190 },
        { x: 400, y: 300 },
        { x: 840, y: 150 },
      ],
    });
  });

  it("parses ortho routing", () => {
    const doc = parse(`${HEADER}\nline (200, 190) (840, 150) ortho`);
    expect(firstElement(doc)).toMatchObject({ routing: "ortho" });
  });

  it("parses ortho-hv and ortho-vh routing", () => {
    const hv = parse(`${HEADER}\nline (1, 2) (3, 4) ortho-hv`);
    const vh = parse(`${HEADER}\nline (1, 2) (3, 4) ortho-vh`);
    expect(hv.errors).toEqual([]);
    expect(vh.errors).toEqual([]);
    expect(firstElement(hv)).toMatchObject({ routing: "ortho-hv" });
    expect(firstElement(vh)).toMatchObject({ routing: "ortho-vh" });
  });

  it("parses curve routing", () => {
    const doc = parse(`${HEADER}\nline (1, 2) (3, 4) curve`);
    expect(firstElement(doc)).toMatchObject({ routing: "curve" });
  });

  it("parses a routing with an arrow and a label", () => {
    const doc = parse(`${HEADER}\nline (200, 190) (400, 300) (840, 150) ortho-hv "route"`);
    expect(firstElement(doc)).toMatchObject({ routing: "ortho-hv", label: "route" });
    expect(doc.errors).toEqual([]);
  });

  it("parses curve with both arrows", () => {
    const doc = parse(`${HEADER}\nline (200, 190) (840, 150) curve <->`);
    expect(firstElement(doc)).toMatchObject({ routing: "curve", arrows: "both" });
  });

  it("reports a line with a single point", () => {
    const doc = parse(`${HEADER}\nline (200, 190)`);
    expect(doc.elements).toEqual([]);
    expect(doc.errors[0]?.message).toMatch(/at least two points/);
  });

  it("reports a duplicate routing", () => {
    const doc = parse(`${HEADER}\nline (1, 2) (3, 4) ortho curve`);
    expect(doc.errors[0]?.message).toMatch(/more than one routing/);
  });

  it("reports a duplicate arrowhead", () => {
    const doc = parse(`${HEADER}\nline (1, 2) (3, 4) -> ->`);
    expect(doc.errors[0]?.message).toMatch(/more than one arrowhead/);
  });

  it("reports a point after styling", () => {
    const doc = parse(`${HEADER}\nline (1, 2) (3, 4) ortho (5, 6)`);
    expect(doc.elements[0]).toMatchObject({
      points: [
        { x: 1, y: 2 },
        { x: 3, y: 4 },
      ],
    });
    expect(doc.errors[0]?.message).toMatch(/point after/);
  });

  it("reports an unknown line style", () => {
    const doc = parse(`${HEADER}\nline (1, 2) (3, 4) zigzag`);
    expect(doc.errors[0]?.message).toMatch(/unknown line style/);
  });
});

describe("text", () => {
  it("parses a text element", () => {
    const doc = parse(`${HEADER}\ntext (840, 350) "Served over HTTPS"`);
    expect(firstElement(doc)).toEqual({ kind: "text", x: 840, y: 350, text: "Served over HTTPS" });
    expect(doc.errors).toEqual([]);
  });

  it("allows multiple text statements", () => {
    const doc = parse(`${HEADER}\ntext (1, 2) "a"\ntext (3, 4) "b"`);
    expect(doc.elements).toHaveLength(2);
    expect(doc.errors).toEqual([]);
  });

  it("reports a missing position", () => {
    const doc = parse(`${HEADER}\ntext "hello"`);
    expect(doc.elements).toEqual([]);
    expect(doc.errors[0]?.message).toMatch(/position/);
  });

  it("reports a missing string", () => {
    const doc = parse(`${HEADER}\ntext (10, 10)`);
    expect(doc.elements).toEqual([]);
    expect(doc.errors[0]?.message).toMatch(/quoted string/);
  });
});

describe("statement dispatch", () => {
  it("reports an unknown statement", () => {
    const doc = parse(`${HEADER}\ncircle (10, 10) (20, 20)`);
    expect(doc.elements).toEqual([]);
    expect(doc.errors[0]?.message).toMatch(/unknown statement/);
  });

  it("keeps valid elements even when a later line has an error", () => {
    const doc = parse(`${HEADER}\nbox (1, 2) (3, 4)\ngarbage`);
    expect(doc.elements).toHaveLength(1);
    expect(doc.errors).toHaveLength(1);
    expect(doc.errors[0]?.line).toBe(3);
  });
});

describe("error line numbers", () => {
  it("reports the correct line number", () => {
    const doc = parse(`${HEADER}\nbox (1, 2) (3, 4)\nbox (5, 6) frob`);
    expect(doc.errors[0]?.line).toBe(3);
  });
});

describe("spec example", () => {
  const example = `# kumidraw v:1 grid:10

# the network cage: dashed border, light fill, text top-left
box (40, 40) (1800, 1000) dashed #ff0000 "Production VPC"

# filled nodes with icons and labels top-left
box (110, 110) (180, 80) #3498db :nginx "Web"
box (330, 110) (180, 80) #3498db :gitlab "GitLab"
box (840, 110) (180, 80) #2ecc71 :docker "Docker"

# a color band: no border, light fill, icon and label top-left
box (90, 260) (600, 200) noborder #e1ff00 :kubernetes "Availability Zone A"

# a label tag: no border, no fill
box (110, 320) (260, 60) noborder "subnet 1 10.0.0.0/24"

# an elbow arrow with a label
line (200, 190) (840, 150) ortho "deploys"

# a straight polyline through three points
line (330, 190) (400, 300) (600, 100) (1100, 150)

# a straight polyline with an arrowhead
line (840, 250) (900, 300) (1100, 250) ->

text (840, 350) "Served over HTTPS"
`;

  it("parses the full spec example without errors", () => {
    const doc = parse(example);
    expect(doc.errors).toEqual([]);
    expect(doc.header).toEqual({ version: 1, grid: 10, settings: { v: "1", grid: "10" } });
    // 6 boxes + 3 lines + 1 text
    expect(doc.elements).toHaveLength(10);
  });

  it("returns elements in source order", () => {
    const doc = parse(example);
    const kinds = doc.elements.map((e) => e.kind);
    expect(kinds).toEqual([
      "box",
      "box",
      "box",
      "box",
      "box",
      "box",
      "line",
      "line",
      "line",
      "text",
    ]);
  });
});
