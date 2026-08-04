// oxlint-disable eslint/id-length, typescript/no-unnecessary-type-assertion, typescript/no-unnecessary-condition

/**
 * rehype plugin: transforms ```kumidraw fenced code blocks into
 * <kumidraw-diagram data-kumidraw="..."> elements.
 *
 * The streamdown component map renders these as the Kumidraw SVG diagram.
 * The raw source is carried in a data attribute so the component does not
 * depend on how the rehype tree passes children through.
 *
 * Example:
 *   ```kumidraw
 *   # kumidraw v:1 grid:10
 *   box (40, 40) (300, 180) dashed topleft "AWS"
 *   ```
 */

import type { Element, Root } from "hast";
import { visit } from "unist-util-visit";

function isKumidrawCodeBlock(node: Element): boolean {
  if (node.tagName !== "pre") {
    return false;
  }
  const code = node.children[0];
  if (code?.type !== "element" || code.tagName !== "code") {
    return false;
  }
  const className = code.properties?.className;
  return Array.isArray(className) && className.includes("language-kumidraw");
}

function sourceFromCodeBlock(pre: Element): string {
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion
  const code = pre.children[0] as unknown as Element;
  const text = code.children[0];
  // oxlint-disable-next-line typescript/no-unnecessary-condition
  return text?.type === "text" ? text.value : "";
}

function toKumidrawElement(pre: Element): Element {
  const source = sourceFromCodeBlock(pre);
  return {
    children: [],
    properties: { "data-kumidraw": source },
    tagName: "kumidraw-diagram",
    type: "element",
  };
}

// oxlint-disable-next-line import/prefer-default-export
export default function rehypeKumidraw(): (tree: Root) => void {
  return (tree: Root): void => {
    visit(tree, "element", (node, index, parent) => {
      if (parent && index !== undefined && isKumidrawCodeBlock(node)) {
        // oxlint-disable-next-line no-param-reassign
        parent.children[index] = toKumidrawElement(node);
      }
    });
  };
}
