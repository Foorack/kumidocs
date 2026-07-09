import { Streamdown } from "streamdown";
import { cjk } from "@streamdown/cjk";
import { code } from "@streamdown/code";
import { math } from "@streamdown/math";
import { memo } from "react";
import { mermaid } from "@streamdown/mermaid";
import { COMPONENTS_DOC, REHYPE_PLUGINS } from "./streamdown-components";
import cn from "@/lib/utils";

interface MarkdownViewerProps {
  className?: string;
  value: string;
}

const MarkdownViewerInner = (allProps: MarkdownViewerProps): JSX.Element => {
  const { className, value } = allProps;

  return (
    <div
      className={cn(
        "prose prose-table:my-0 prose-img:my-0 prose-pre:my-0 prose-pre:bg-transparent prose-pre:text-foreground dark:prose-invert max-w-none",
        className,
      )}
    >
      <Streamdown
        mode="streaming"
        plugins={{ cjk, code, math, mermaid }}
        shikiTheme={["github-light", "github-dark"]}
        linkSafety={{ enabled: false }}
        components={COMPONENTS_DOC}
        rehypePlugins={REHYPE_PLUGINS}
      >
        {value}
      </Streamdown>
    </div>
  );
};

const MarkdownViewer = memo(MarkdownViewerInner);

export default MarkdownViewer;
