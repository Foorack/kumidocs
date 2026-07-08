// Convert SVG Emojis as Outlook does not render "data:image/svg+xml"
function inlineEmojis(clone: HTMLElement): void {
  const emojiImages = clone.querySelectorAll<HTMLElement>('img[src^="data:image/svg+xml;base64"]');
  for (const img of emojiImages) {
    const alt = img.getAttribute("alt") ?? "";
    img.replaceWith(document.createTextNode(alt));
  }
}

// Strip internal attributes that are meaningless in email
function stripAttributes(clone: HTMLElement): void {
  for (const el of clone.querySelectorAll<HTMLElement>("[data-streamdown],[data-incomplete]")) {
    delete el.dataset.streamdown;
    delete el.dataset.incomplete;
  }
}

// Walk the entire tree and inline styles
function inlineStyles(el: HTMLElement): void {
  const tag = el.nodeName.toLowerCase();
  let style = el.getAttribute("style") ?? "";
  let inline = "";

  // Inline styles
  if (tag === "p") {
    inline += " margin: 0 0 1m;";
  }
  if (["h1", "h2", "h3", "h4", "h5", "h6"].includes(tag)) {
    inline += " margin: 0 0 8px;";
  }
  // Inline CSS from known utility classes
  const classStyles: Record<string, string> = {
    "bg-amber-50": "background-color:#fffbeb",
    "bg-blue-50": "background-color:#eff6ff",
    "bg-green-50": "background-color:#f0fdf4",
    "bg-purple-50": "background-color:#faf5ff",
    "bg-red-50": "background-color:#fef2f2",
    "border-amber-500": "border-color:#f59e0b",
    "border-blue-500": "border-color:#3b82f6",
    "border-green-500": "border-color:#22c55e",
    "border-purple-500": "border-color:#a855f7",
    "border-red-500": "border-color:#ef4444",
    "font-bold": "font-weight:700",
    "list-disc": "list-style-type:disc",
    "list-inside": "list-style-position:inside",
    "py-1": "padding-top:4px;padding-bottom:4px",
    "text-amber-800": "color:#92400e",
    "text-blue-800": "color:#1e40af",
    "text-green-800": "color:#166534",
    "text-purple-800": "color:#6b21a8",
    "text-red-800": "color:#991b1b",
  };
  for (const cls of el.classList) {
    const mapped = classStyles[cls];
    if (mapped === undefined) {
      continue;
    }
    const propName = mapped.split(":")[0];
    if (propName !== undefined && !style.includes(propName)) {
      inline += ` ${mapped};`;
    }
  }

  // Fallback-inline
  inline = inline.trim();
  if (!(inline + style).includes("box-sizing:")) {
    inline = `box-sizing: border-box; ${inline}`;
  }
  if (!(inline + style).includes("padding:")) {
    inline = `padding: 0; ${inline}`;
  }
  if (!(inline + style).includes("margin:")) {
    inline = `margin: 0; ${inline}`;
  }
  style = `${inline.trim()} ${style}`.trim();

  // Replace e.g. var(--border, #000000) with just the fallback value
  style = style.replaceAll(/var\(--[\w-]+,\s*(?<fallback>[^)]+)\)/gu, "$<fallback>");

  // Append ; if style already doesn't end with it
  if (style.length > 0 && style.at(-1) !== ";") {
    style += ";";
  }

  el.setAttribute("style", style);

  // Apply space-y-4: margin-bottom to every direct child except the last
  if (el.classList.contains("space-y-4")) {
    const children = el.children;
    for (let ci = 0; ci < children.length - 1; ci++) {
      const child = children[ci];
      if (!(child instanceof HTMLElement)) {
        continue;
      }
      const childStyle = child.getAttribute("style") ?? "";
      if (childStyle.includes("margin:") || childStyle.includes("margin-bottom:")) {
        continue;
      }
      const trimmed = childStyle.trim();
      child.setAttribute(
        "style",
        `${trimmed.length > 0 ? `${trimmed}; ` : ""}margin-bottom: 16px;`,
      );
    }
  }
}

// Walk the entire tree and inline attributes
function inlineAttr(el: HTMLElement): void {
  const tag = el.nodeName.toLowerCase();
  // Copy CSS height/width/align onto HTML attribute
  if (tag === "table" && el.style.width.length > 0 && el.style.width.endsWith("%")) {
    el.setAttribute("width", el.style.width);
  }
  if (tag === "table" && el.style.height.length > 0 && el.style.height.endsWith("%")) {
    el.setAttribute("height", el.style.height);
  }
  if (tag === "td" && el.style.width.length > 0 && el.style.width.endsWith("px")) {
    el.setAttribute("width", el.style.width.replaceAll("px", ""));
  }
  if (tag === "td" && el.style.height.length > 0 && el.style.height.endsWith("px")) {
    el.setAttribute("height", el.style.height.replaceAll("px", ""));
  }
  if (tag === "td" && el.style.textAlign.length > 0) {
    el.setAttribute("align", el.style.textAlign);
  }
  if (tag === "td" && el.style.verticalAlign.length > 0) {
    el.setAttribute("valign", el.style.verticalAlign);
  }
}

export default function inlineEmailHtml(clone: HTMLElement): string {
  inlineEmojis(clone);
  stripAttributes(clone);

  const allElements = [clone, ...clone.querySelectorAll<HTMLElement>("*")];
  for (const el of allElements) {
    inlineStyles(el);
    inlineAttr(el);
  }

  return `<!DOCTYPE html>
<html lang="en" style="margin: 0; padding: 0; box-sizing: border-box;">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="Content-Type" content="text/html; charset=utf-8">
    <meta name="color-scheme" content="light">
    <meta name="supported-color-schemes" content="light">
    <title>Page</title>
  </head>
  <body style="margin: 0; padding: 0; box-sizing: border-box;">
    ${clone.outerHTML}
  </body>
</html>`
    .replaceAll("  ", "") // Trim indent
    .replaceAll("\n", ""); // Trim newlines
}
