import { parseKumidraw } from "@/lib/kumidraw/parser";
import { KumidrawDiagram } from "@/lib/kumidraw/render";
import { useMemo } from "react";

interface KumidrawDiagramComponentProps {
  "data-kumidraw"?: unknown;
  children?: unknown;
}

/**
 * Streamdown component for the <kumidraw-diagram> element, produced by
 * rehypeKumidraw from ```kumidraw fenced code blocks.
 *
 * Parses the raw source (passed in the data attribute by the rehype plugin)
 * and renders it as an SVG diagram. Width is fluid so it fits the prose column.
 */
const KumidrawDiagramComponent = (allProps: KumidrawDiagramComponentProps): JSX.Element => {
  const raw = allProps["data-kumidraw"];
  const source = typeof raw === "string" ? raw : "";
  const doc = useMemo(() => parseKumidraw(source), [source]);

  return (
    <div className="my-4 overflow-x-auto">
      <KumidrawDiagram
        doc={doc}
        className="h-auto w-full max-w-none"
        // Preserve the aspect ratio of the diagram regardless of container width.
      />
    </div>
  );
};

export default KumidrawDiagramComponent;
