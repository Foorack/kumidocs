import type { FileType } from "./types";

const IMAGE_TYPES = new Set([".jpg", ".jpeg", ".png", ".gif", ".webp", ".svg"]);

const CODE_TYPES = new Set([
  ".txt",
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
  ".py",
  ".go",
  ".rs",
  ".java",
  ".c",
  ".cpp",
  ".h",
  ".hpp",
  ".sh",
  ".bash",
  ".zsh",
  ".fish",
  ".ps1",
  ".yaml",
  ".yml",
  ".toml",
  ".json",
  ".jsonc",
  ".html",
  ".htm",
  ".css",
  ".scss",
  ".sass",
  ".less",
  ".sql",
  ".graphql",
  ".gql",
  ".xml",
  ".svg",
  ".env",
  ".dockerfile",
  ".gitignore",
  ".gitattributes",
  ".editorconfig",
  ".prettierrc",
  ".eslintrc",
  ".tf",
  ".tfvars",
  ".hcl",
  ".rb",
  ".php",
  ".lua",
  ".vim",
  ".el",
  ".r",
  ".jl",
  ".scala",
  ".kt",
  ".kts",
  ".dart",
  ".swift",
  ".conf",
  ".ini",
  ".cfg",
  ".csv",
  ".mermaid",
]);

const NO_DOT = -1;
const AFTER_DOT = 1;

/** Extract lowercase extension from a path (e.g. "test.tsx" -> "tsx", "README.md" -> "md", "nodot" -> ""). */
const pathExtension = (path: string): string => {
  const dot = path.lastIndexOf(".");
  const slash = path.lastIndexOf("/");
  if (dot > slash && dot !== NO_DOT) {
    return path.slice(dot + AFTER_DOT).toLowerCase();
  }
  return "";
};

/**
 * Map file extension to FileType.
 *
 * Defaults to:
 *   - 'doc' for Markdown files (including extensionless paths, which are treated as Markdown)
 *   - 'code' for known code file extensions
 *   - 'image' for known image file extensions
 *   - 'other' for everything else
 */
const extensionToType = (inputExt: string): FileType => {
  let ext = inputExt.toLowerCase();
  if (!ext.startsWith(".")) {
    ext = `.${ext}`;
  }
  if (IMAGE_TYPES.has(ext)) {
    return "image";
  }
  if (ext === ".csv") {
    return "sheet";
  }
  if (ext === ".mermaid") {
    return "mermaid";
  }
  if (CODE_TYPES.has(ext)) {
    return "code";
  }
  if (ext === ".md" || ext === "") {
    return "doc";
  }
  return "other";
};

export { IMAGE_TYPES, CODE_TYPES, pathExtension, extensionToType };
