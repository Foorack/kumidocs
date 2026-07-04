import { useCallback, useEffect, useRef, useState } from "react";
import { code } from "@streamdown/code";
import { useTheme } from "@/store/theme";

interface CodeEditorProps {
  value: string;
  language: string;
  readOnly?: boolean;
  onChange?: (value: string) => void;
  onSave?: () => void;
}

/**
 * Map file extensions to Shiki language identifiers.
 * Shiki uses the same names as VS Code's TextMate grammars.
 */
// oxlint-disable id-length
const LANG_MAP: Record<string, string> = {
  bash: "bash",
  c: "c",
  cjs: "javascript",
  cpp: "cpp",
  css: "css",
  dockerfile: "dockerfile",
  el: "elisp",
  fish: "bash",
  go: "go",
  graphql: "graphql",
  h: "c",
  hcl: "hcl",
  hpp: "cpp",
  htm: "html",
  html: "html",
  ini: "ini",
  java: "java",
  jl: "julia",
  js: "javascript",
  json: "json",
  jsonc: "json",
  jsx: "javascript",
  kt: "kotlin",
  kts: "kotlin",
  less: "less",
  lua: "lua",
  md: "markdown",
  mjs: "javascript",
  php: "php",
  ps1: "powershell",
  py: "python",
  r: "r",
  rb: "ruby",
  rs: "rust",
  scala: "scala",
  scss: "scss",
  sh: "bash",
  sql: "sql",
  swift: "swift",
  tf: "hcl",
  tfvars: "hcl",
  toml: "toml",
  ts: "typescript",
  tsx: "tsx",
  txt: "text",
  vim: "viml",
  xml: "xml",
  yaml: "yaml",
  yml: "yaml",
  zsh: "bash",
};
// oxlint-enable id-length

function shikiLang(ext: string): string {
  return LANG_MAP[ext] ?? ext;
}

/**
 * Parse combined Shiki bg/fg values like "#fff;--shiki-dark-bg:#24292e"
 * into separate light/dark values.
 */
function splitThemeValue(val: string | undefined): { dark: string; light: string } {
  const light = val?.split(";")[0] ?? "";
  const darkMatch = val?.match(/--shiki-dark(?:-bg)?:(?<darkColor>#?\w+)/u);
  // eslint-disable-next-line id-length
  const darkColor = darkMatch?.groups?.darkColor;
  return { dark: darkColor ?? light, light };
}

/** Parse the bg token value to extract the background hex. */
function extractBg(val: string | undefined): string {
  return val?.split(";")[0] ?? "";
}

// Types for the tokens returned by code.highlight()
interface HighlightToken {
  content: string;
  offset: number;
  htmlStyle?: Record<string, string>;
}
interface HighlightResult {
  tokens: HighlightToken[][];
  fg?: string;
  bg?: string;
}

const DEFAULT_THEMES = ["github-light", "github-dark"] as const;

function CodeViewer({ value, language }: { value: string; language: string }): JSX.Element {
  const [result, setResult] = useState<HighlightResult | undefined>(undefined);
  const { theme } = useTheme();
  const isDark = theme === "dark";
  const lang = shikiLang(language);

  useEffect(() => {
    let cancelled = false;
    setResult(undefined);

    // oxlint-disable-next-line typescript/no-unsafe-type-assertion
    const synced = code.highlight(
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion
      { code: value, language: lang as never, themes: DEFAULT_THEMES as never },
      (res: HighlightResult) => {
        if (!cancelled) {
          setResult(res);
        }
      },
    );
    // oxlint-disable-next-line typescript/no-unnecessary-condition
    if (synced && !cancelled) {
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion
      setResult(synced as never);
    }
    return (): void => {
      cancelled = true;
    };
  }, [value, lang]);

  const bg = result ? extractBg(result.bg) : undefined;
  const combinedFg = result?.fg;
  const fg =
    combinedFg !== undefined && combinedFg !== ""
      ? splitThemeValue(combinedFg)[isDark ? "dark" : "light"]
      : undefined;

  const lines = result?.tokens;
  const hasLines = lines !== undefined && lines.length > 0;

  return (
    <pre
      className="shiki-code h-full overflow-auto p-4 font-mono text-sm leading-relaxed"
      style={{ background: bg, color: fg }}
    >
      <code>
        {hasLines
          ? lines.map((line, lineIdx) => (
              <span key={lineIdx} className="line">
                {line.map((token, tokenIdx) => {
                  const style = token.htmlStyle;
                  return (
                    <span
                      key={tokenIdx}
                      style={{ color: isDark ? style?.["--shiki-dark"] : style?.color }}
                    >
                      {token.content}
                    </span>
                  );
                })}
                {lineIdx < lines.length - 1 ? "\n" : ""}
              </span>
            ))
          : value}
      </code>
    </pre>
  );
}

const CodeEditor = (allProps: CodeEditorProps): JSX.Element => {
  const { value, language, readOnly = false, onChange, onSave } = allProps;

  // All hooks at the top, before any conditional return
  const valueRef = useRef(value);
  valueRef.current = value;

  const handleKeyDown = useCallback(
    (ev: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (onSave && (ev.ctrlKey || ev.metaKey) && ev.key === "s") {
        ev.preventDefault();
        onSave();
      }
    },
    [onSave],
  );

  if (readOnly) {
    return <CodeViewer value={value} language={language} />;
  }

  // Edit mode: plain textarea, not recreated on every keystroke
  return (
    <div className="h-full">
      <textarea
        defaultValue={value}
        onChange={(ev) => {
          onChange?.(ev.target.value);
        }}
        onKeyDown={handleKeyDown}
        className="h-full w-full resize-none border-0 bg-transparent p-4 font-mono text-sm text-foreground focus:outline-none"
        spellCheck={false}
      />
    </div>
  );
};

export default CodeEditor;
