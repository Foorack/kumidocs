import { getFile } from "@/lib/api";
import { parseKumidraw } from "@/lib/kumidraw/parser";
import { KumidrawDiagram } from "@/lib/kumidraw/render";
import { Link, useOutletContext, useParams } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import useMountEffect from "@/hooks/use-mount-effect";
import { useMemo, useState } from "react";

interface OutletCtx {
  instanceName: string;
}

/** Extract ```kumidraw fenced code blocks from a markdown document. */
function extractKumidrawBlocks(markdown: string): string[] {
  const blocks: string[] = [];
  // oxlint-disable-next-line eslint/require-unicode-regexp
  const fence = /^```\s*kumidraw[ \t]*\r?\n(?<source>[\s\S]*?)^```[ \t]*$/gmu;
  let match: RegExpExecArray | null;
  while ((match = fence.exec(markdown)) !== null) {
    if (match.groups?.source !== undefined) {
      blocks.push(match.groups.source);
    }
  }
  return blocks;
}

const DEFAULT_SOURCE = `# kumidraw v:1 grid:10

box (40, 40) (700, 420) dashed #f4f6f8 topleft "Example diagram"
box (90, 110) (180, 80) #3498db :DesignIdeas24Color "Web"
box (320, 110) (180, 80) #2ecc71 :DesignIdeas24Color "API"
line (270, 150) (320, 150) ->
text (90, 320) "A Kumidraw diagram"
`;

/**
 * Full-page Kumidraw viewer. Loads a markdown file at /kd/:path, renders every
 * ```kumidraw block as a large centered diagram, and shows its diagnostics.
 */
const KumidrawPage = (): JSX.Element => {
  const { "*": rawPath = "" } = useParams();
  const { instanceName } = useOutletContext<OutletCtx>();
  const [source, setSource] = useState<string | undefined>();
  const [loadError, setLoadError] = useState<string | undefined>();
  const [blocks, setBlocks] = useState<string[]>([]);

  useMountEffect(() => {
    if (rawPath === "") {
      setBlocks([DEFAULT_SOURCE]);
      return;
    }
    const load = async (): Promise<void> => {
      try {
        const data = await getFile(rawPath);
        setSource(data.content);
        setBlocks(extractKumidrawBlocks(data.content));
      } catch (error: unknown) {
        setLoadError(error instanceof Error ? error.message : "Failed to load diagram");
      }
    };
    void load();
  });

  const docs = useMemo(() => blocks.map((b) => parseKumidraw(b)), [blocks]);

  const title = rawPath.split("/").pop()?.replace(/\.md$/u, "") ?? "Kumidraw";

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <header className="flex items-center gap-2 border-b bg-background px-4 py-2">
        {rawPath !== "" && (
          <Link
            to={`/p/${rawPath.replace(/\.md$/u, "")}`}
            className="flex items-center gap-1 text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
            <span className="text-sm">Back</span>
          </Link>
        )}
        <div className="flex-1" />
        <span className="text-xs text-muted-foreground">{instanceName}</span>
      </header>
      <div className="flex-1 overflow-auto bg-muted/30">
        {loadError !== undefined && (
          <div className="mx-auto max-w-2xl px-6 py-10 text-sm text-destructive">{loadError}</div>
        )}
        {docs.length === 0 && loadError === undefined && (
          <div className="mx-auto max-w-2xl px-6 py-10 text-sm text-muted-foreground">
            No Kumidraw diagrams found in this document.
          </div>
        )}
        {docs.map((doc, i) => (
          <section
            key={i}
            className="mx-auto my-6 max-w-4xl rounded-lg border bg-background p-6 shadow-sm"
          >
            <h2 className="mb-3 text-xs font-bold uppercase tracking-wide text-muted-foreground">
              Diagram {docs.length > 1 ? i + 1 : ""} ({title})
            </h2>
            <div className="overflow-auto">
              <KumidrawDiagram doc={doc} className="h-auto w-full" />
            </div>
            {doc.errors.length > 0 && (
              <ul className="mt-3 space-y-1 border-t pt-3 text-xs text-destructive">
                {doc.errors.map((e, j) => (
                  <li key={j}>
                    line {e.line}: {e.message}
                  </li>
                ))}
              </ul>
            )}
            {source !== undefined && (
              <details className="mt-3 text-xs text-muted-foreground">
                <summary className="cursor-pointer select-none">Source</summary>
                <pre className="mt-2 overflow-auto rounded bg-muted p-3">{blocks[i]}</pre>
              </details>
            )}
          </section>
        ))}
      </div>
    </div>
  );
};

export default KumidrawPage;
