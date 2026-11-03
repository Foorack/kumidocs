# Tasks

---

### 1. Git Blame for Docs

A line-by-line annotation overlay when viewing a markdown file, showing who last changed each line and when. Uses `git blame` output parsed on the server.

**Approach**:

- New server endpoint `GET /api/blame/:path` that runs `git blame --line-porcelain <path>` and returns structured data
- New frontend component that fetches blame data and renders line annotations in a gutter alongside the `MarkdownViewer` content
- Toggle with a button in the file page header

**Files to touch**:

- `src/server/api-file.ts` -- add blame endpoint
- New: `src/components/editor/markdown/blame-gutter.tsx`
- `src/pages/file-page/header.tsx` -- add toggle button
- `src/pages/file-page/page.tsx` or viewer -- integrate blame gutter

---

### 2. Kumidraw Editor

Drag-drop editor for pleasant visual placement (the original motivation).

- Snap element positions to the grid (round half up to nearest 10)
- Drag to move boxes; click to add/edit lines and text
- Convert the edited element model back to Kumidraw source (a writer)

---

### 3. Clean Search Snippets

Search result snippets are cut from the raw file, so they show Markdown syntax
(code fences, table pipes, image links). Strip Markdown before building the
snippet, the same way the index content is stripped.

**Files to touch**:

- `src/server/search.ts` -- `buildSnippet()`

---

### 4. Shrink the Frontend Bundle

The main frontend chunk is about 16 MB. Find out what dominates (likely emoji,
icon packs, mermaid, shiki) and lazy-load what is not needed on first paint.

**Files to touch**:

- `scripts/build.ts` -- enable code splitting, check chunk sizes
- Large client-side imports -- move behind dynamic `import()`

