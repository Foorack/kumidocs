import type { jsPDF as JsPDF } from "jspdf";

interface OverlayOptions {
  /** When set, paginates text/link overlays across multi-page PDFs. */
  pageHPx?: number;
  /** Pre-computed root bounding rect. If omitted, computed from `root`. */
  rootRect?: DOMRect;
}

function applyTextOverlay(
  pdf: JsPDF,
  root: HTMLElement,
  rootRect: DOMRect,
  pageHPx: number | undefined,
): void {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const text = (node.textContent ?? "").replaceAll(/\s+/gu, " ").trim();
    if (!text || !node.parentElement) {
      continue;
    }
    // Skip text nodes inside SVG (rendered as vector paths, not text)
    let ancestor: Element | null = node.parentElement;
    let inSvg = false;
    while (ancestor) {
      if (ancestor.tagName.toLowerCase() === "svg") {
        inSvg = true;
        break;
      }
      ancestor = ancestor.parentElement;
    }
    if (inSvg) {
      continue;
    }
    const range = document.createRange();
    range.selectNode(node);
    const br = range.getBoundingClientRect();
    if (br.width <= 0 || br.height <= 0) {
      continue;
    }
    const yLocal = br.top - rootRect.top;
    if (pageHPx !== undefined) {
      const pageIdx = Math.floor(yLocal / pageHPx);
      pdf.setPage(pageIdx + 1);
    }
    const yOnPage =
      pageHPx === undefined ? yLocal : yLocal - Math.floor(yLocal / pageHPx) * pageHPx;
    const fsPx = Number(window.getComputedStyle(node.parentElement).fontSize);
    pdf.setFontSize(Number.isNaN(fsPx) ? 12 : fsPx);
    // Stretch/compress char spacing so the invisible text spans the same
    // pixel width as the actual DOM render, compensating for font differences.
    const pdfWidth = pdf.getTextWidth(text);
    const charSpace = text.length > 1 ? (br.width - pdfWidth) / (text.length - 1) : 0;
    pdf.setCharSpace(charSpace);
    pdf.text(text, br.left - rootRect.left, yOnPage, {
      baseline: "top",
      renderingMode: "invisible",
    });
    pdf.setCharSpace(0);
  }
}

function applyLinkOverlay(
  pdf: JsPDF,
  root: HTMLElement,
  rootRect: DOMRect,
  pageHPx: number | undefined,
): void {
  for (const anchor of root.querySelectorAll<HTMLAnchorElement>("a[href]")) {
    const rect = anchor.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) {
      continue;
    }
    const xPos = rect.left - rootRect.left;
    const yLocal = rect.top - rootRect.top;
    if (pageHPx === undefined) {
      if (xPos < 0 || yLocal < 0) {
        continue;
      }
      pdf.link(xPos, yLocal, rect.width, rect.height, { url: anchor.href });
    } else {
      const pageIdx = Math.floor(yLocal / pageHPx);
      const yOnPage = yLocal - pageIdx * pageHPx;
      if (xPos < 0 || yOnPage < 0) {
        continue;
      }
      pdf.setPage(pageIdx + 1);
      pdf.link(xPos, yOnPage, rect.width, rect.height, { url: anchor.href });
    }
  }
}

/**
 * Add invisible text and link overlays to a jsPDF document from a rendered
 * HTML element.
 *
 * Used by both the slide PDF export (single-page per slide) and the
 * document PDF export (multi-page paginated via `pageHPx`).
 */
export default function addOverlayToPdf(
  pdf: JsPDF,
  root: HTMLElement,
  options?: OverlayOptions,
): void {
  const { pageHPx, rootRect: precomputed } = options ?? {};
  const rootRect = precomputed ?? root.getBoundingClientRect();
  applyTextOverlay(pdf, root, rootRect, pageHPx);
  applyLinkOverlay(pdf, root, rootRect, pageHPx);
}
