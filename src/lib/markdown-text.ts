/**
 * Markdown to plain text, for the search index and search result snippets.
 *
 * Keeps every word a reader can see, including code, link text, image alt
 * text and wiki link labels, and drops the markup around them. Underscores
 * inside identifiers stay, so `file_path` still matches a search for it.
 */
function markdownToPlainText(markdown: string): string {
  return (
    markdown
      // HTML comments and tags
      .replaceAll(/<!--[\s\S]*?-->/gu, " ")
      .replaceAll(/<[^>]+>/gu, " ")
      // Code fence lines (keep the code itself)
      .replaceAll(/^\s*(?:```|~~~).*$/gmu, " ")
      // Images and links: keep alt text and link text
      .replaceAll(/!\[(?<alt>[^\]]*)\]\([^)]*\)/gu, "$<alt>")
      .replaceAll(/\[(?<text>[^\]]+)\]\([^)]*\)/gu, "$<text>")
      // Wiki links: [[target|label]] -> label, [[target]] -> target
      .replaceAll(/\[\[(?:[^\]|]+\|)?(?<label>[^\]]+)\]\]/gu, "$<label>")
      // Table separator rows like | --- | :-: |, and --- rules
      .replaceAll(/^\s*\|?\s*:?-+:?\s*(?:\|\s*:?-+:?\s*)*\|?\s*$/gmu, " ")
      // Line prefixes: headings, quotes, list bullets, numbers and task boxes
      .replaceAll(/^\s*#{1,6}\s+/gmu, "")
      .replaceAll(/^\s*>+\s?/gmu, "")
      .replaceAll(/^\s*(?:[-*+]|\d+[.)])\s+(?:\[[ xX]\]\s+)?/gmu, "")
      // Emphasis and strikethrough, but not underscores inside words
      .replaceAll(/[*~]+/gu, "")
      .replaceAll(/(?<![\p{L}\p{N}])_+|_+(?![\p{L}\p{N}])/gu, "")
      // Inline code ticks and table pipes
      .replaceAll(/[`|]/gu, " ")
      .replaceAll(/\s+/gu, " ")
      .trim()
  );
}

export default markdownToPlainText;
