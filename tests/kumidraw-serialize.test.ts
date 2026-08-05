import { describe, expect, test } from "bun:test";
import { parseKumidraw } from "../src/lib/kumidraw/parser";
import { serializeKumidraw } from "../src/lib/kumidraw/serialize";

describe("serializeKumidraw", () => {
  test("round-trips a representative diagram", () => {
    const src = `# kumidraw v:1 grid:10

box (40, 40) (1800, 1000) dashed "Production VPC"
box (110, 110) (180, 80) #3498db :nginx "Web"
box (90, 260) (600, 200) fill #e1ff00 :kubernetes "Availability Zone A"
line (200, 190) (840, 150) #0094f0 dashed ->
line (100, 100) (300, 100) (300, 300) ortho <-> "elbow"
text (160, 300) "hello"
`;
    const doc = parseKumidraw(src);
    expect(doc.header).not.toBeNull();
    expect(doc.errors).toEqual([]);

    const out = serializeKumidraw(doc);
    const reparsed = parseKumidraw(out);
    expect(reparsed.header).not.toBeNull();
    expect(reparsed.errors).toEqual([]);
    expect(reparsed.elements.length).toBe(doc.elements.length);

    // Same statements, in the same order.
    for (let i = 0; i < doc.elements.length; i += 1) {
      expect(reparsed.elements[i]).toEqual(doc.elements[i]);
    }
  });

  test("parses and re-serializes identically (idempotent)", () => {
    const out1 = serializeKumidraw(parseKumidraw("line (0, 0) (100, 50) ->"));
    const out2 = serializeKumidraw(parseKumidraw(out1));
    expect(out2).toBe(out1);
  });
});
