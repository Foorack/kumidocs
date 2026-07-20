import addOverlayToPdf from "@/components/editor/slides/pdf-overlay";
import { useCallback, useRef, useState } from "react";
import type { RefObject } from "react";

interface UsePagePdfExportReturn {
  exportPagePdf: () => Promise<void>;
  pdfContentRef: RefObject<HTMLDivElement | null>;
}

function usePagePdfExport(title: string): UsePagePdfExportReturn {
  const [isPdfExporting, setIsPdfExporting] = useState(false);
  const pdfContentRef = useRef<HTMLDivElement>(null);

  const exportPagePdf = useCallback(async () => {
    if (isPdfExporting) {
      return;
    }
    setIsPdfExporting(true);
    try {
      const el = pdfContentRef.current;
      if (!el) {
        return;
      }
      const { default: html2canvas } = await import("html2canvas-pro");
      const { jsPDF } = await import("jspdf");
      const RENDER_W = 800;
      const SCALE = 1.5;
      const PAGE_H_PX = Math.floor((RENDER_W * 297) / 210);
      const rootRect = el.getBoundingClientRect();
      const canvas = await html2canvas(el, {
        logging: false,
        scale: SCALE,
        useCORS: true,
        width: RENDER_W,
      });
      const pdf = new jsPDF({ format: [RENDER_W, PAGE_H_PX], orientation: "portrait", unit: "px" });
      const totalH = canvas.height;
      const scaledPageH = PAGE_H_PX * SCALE;
      let yOffset = 0;
      while (yOffset < totalH) {
        const sliceH = Math.min(scaledPageH, totalH - yOffset);
        const sliceCanvas = document.createElement("canvas");
        sliceCanvas.width = canvas.width;
        sliceCanvas.height = Math.ceil(sliceH);
        const ctx = sliceCanvas.getContext("2d");
        if (ctx) {
          ctx.drawImage(canvas, 0, -yOffset);
        }
        if (yOffset > 0) {
          pdf.addPage();
        }
        pdf.addImage(sliceCanvas.toDataURL("image/png"), "PNG", 0, 0, RENDER_W, sliceH / SCALE);
        yOffset += scaledPageH;
      }
      addOverlayToPdf(pdf, el, { pageHPx: PAGE_H_PX, rootRect });
      pdf.save(`${title}.pdf`);
    } finally {
      setIsPdfExporting(false);
    }
  }, [isPdfExporting, title]);

  return { exportPagePdf, pdfContentRef };
}

export default usePagePdfExport;
