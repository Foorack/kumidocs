import { useCallback, useRef } from "react";
import Editor from "react-simple-code-editor";
import Prism from "prismjs";
// oxlint-disable-next-line import/no-unassigned-import
import "prismjs/components/prism-yaml";
// oxlint-disable-next-line import/no-unassigned-import
import "prismjs/components/prism-json";
// oxlint-disable-next-line import/no-unassigned-import
import "prismjs/components/prism-typescript";
// oxlint-disable-next-line import/no-unassigned-import
import "prismjs/components/prism-javascript";
// oxlint-disable-next-line import/no-unassigned-import
import "prismjs/components/prism-css";
// oxlint-disable-next-line import/no-unassigned-import
import "prismjs/components/prism-scss";
// oxlint-disable-next-line import/no-unassigned-import
import "prismjs/components/prism-markup";
// oxlint-disable-next-line import/no-unassigned-import
import "prismjs/components/prism-bash";
// oxlint-disable-next-line import/no-unassigned-import
import "prismjs/components/prism-python";
// oxlint-disable-next-line import/no-unassigned-import
import "prismjs/components/prism-go";
// oxlint-disable-next-line import/no-unassigned-import
import "prismjs/components/prism-rust";
// oxlint-disable-next-line import/no-unassigned-import
import "prismjs/components/prism-markdown";
// oxlint-disable-next-line import/no-unassigned-import
import "prismjs/components/prism-c";
// oxlint-disable-next-line import/no-unassigned-import
import "prismjs/components/prism-cpp";
// oxlint-disable-next-line import/no-unassigned-import
import "prismjs/components/prism-toml";
// oxlint-disable-next-line import/no-unassigned-import
import "prismjs/components/prism-hcl";
// oxlint-disable-next-line import/no-unassigned-import
import "prismjs/themes/prism.css";
// oxlint-disable-next-line import/no-unassigned-import
import "prismjs/themes/prism-dark.css";
import { useTheme } from "@/store/theme";

interface CodeEditorProps {
  value: string;
  language: string;
  readOnly?: boolean;
  onChange?: (value: string) => void;
  onSave?: () => void;
}

const EXT_TO_LANG: Record<string, string> = {
  cjs: "js",
  fish: "bash",
  gql: "graphql",
  htm: "html",
  jsonc: "json",
  kt: "kotlin",
  kts: "kotlin",
  mjs: "js",
  scss: "scss",
  tf: "hcl",
  tfvars: "hcl",
  yml: "yaml",
};

/**
 * Prism language identifiers that differ from the file extension.
 */
const LANG_ALIAS: Record<string, string> = {
  css: "css",
  go: "go",
  html: "html",
  js: "javascript",
  json: "json",
  md: "markdown",
  py: "python",
  rb: "ruby",
  rs: "rust",
  sh: "bash",
  svg: "markup",
  ts: "typescript",
  xml: "markup",
  yaml: "yaml",
};

function resolvePrismLang(ext: string): string {
  const mapped = EXT_TO_LANG[ext] ?? ext;
  return LANG_ALIAS[mapped] ?? mapped;
}

const CodeEditor = (allProps: CodeEditorProps): JSX.Element => {
  const { value, language, readOnly = false, onChange, onSave } = allProps;
  const { theme } = useTheme();
  const isDark = theme === "dark";
  // Track latest value so the keydown handler sees it
  const valueRef = useRef(value);
  valueRef.current = value;

  const prismLang = resolvePrismLang(language);

  const highlight = useCallback(
    (code: string) => {
      const grammar = Prism.languages[prismLang];
      if (!grammar) {
        // HTML-escape and preserve newlines as a plain-text fallback.
        const escaped = code
          .replaceAll("&", "&amp;")
          .replaceAll("<", "&lt;")
          .replaceAll(">", "&gt;");
        return escaped.replaceAll("\n", "<br>");
      }
      return Prism.highlight(code, grammar, prismLang);
    },
    [prismLang],
  );

  const handleKeyDown = useCallback(
    (ev: React.KeyboardEvent) => {
      if (onSave && (ev.ctrlKey || ev.metaKey) && ev.key === "s") {
        ev.preventDefault();
        onSave();
      }
    },
    [onSave],
  );

  return (
    <div
      className={`not-prose h-full overflow-auto text-sm ${isDark ? "dark" : ""}`}
      onKeyDown={handleKeyDown}
    >
      <style>{`
        :not(pre) > code[class*="language-"],
        pre[class*="language-"] {
          text-shadow: none !important;
          background: none !important;
          box-shadow: none !important;
          border: none !important;
          padding: 0 !important;
        }
      `}</style>
      <div className="npm-deps-editor-wrapper h-full font-mono">
        <Editor
          value={value}
          onValueChange={(code) => {
            onChange?.(code);
          }}
          highlight={highlight}
          padding={16}
          readOnly={readOnly}
          textareaClassName="focus:outline-none"
          style={{
            fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace',
            fontSize: "0.875rem",
            lineHeight: "1.5",
            minHeight: "100%",
          }}
        />
      </div>
    </div>
  );
};

export default CodeEditor;
