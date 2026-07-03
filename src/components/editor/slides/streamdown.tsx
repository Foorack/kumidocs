import { Streamdown } from "streamdown";
import { cjk } from "@streamdown/cjk";
import { code } from "@streamdown/code";
import { math } from "@streamdown/math";
import { mermaid } from "@streamdown/mermaid";
import {
  COMPONENTS_SLIDE,
  REHYPE_PLUGINS,
} from "@/components/editor/markdown/streamdown-components";

interface SlideStreamdownProps {
  value: string;
}

const SlideStreamdown = (allProps: SlideStreamdownProps): JSX.Element => {
  const { value } = allProps;

  return (
    <Streamdown
      mode="static"
      plugins={{ cjk, code, math, mermaid }}
      shikiTheme={["github-light", "github-dark"]}
      linkSafety={{ enabled: false }}
      components={COMPONENTS_SLIDE}
      rehypePlugins={REHYPE_PLUGINS}
    >
      {value}
    </Streamdown>
  );
};

export default SlideStreamdown;
