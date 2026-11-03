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

### 3. Lazy-Load Mermaid and KaTeX

The frontend entry chunk is 2.9 MB (0.78 MB gzipped). The largest parts left
are Mermaid core and KaTeX, which most pages never use. They are imported
statically by the `@streamdown/mermaid` and `@streamdown/math` plugins, so
splitting them out means loading those plugins only for pages whose Markdown
contains a mermaid block or math.

**Files to touch**:

- `src/components/editor/markdown/viewer.tsx`, `src/components/editor/slides/streamdown.tsx`,
  `src/components/viewer/page-viewer.tsx` -- plugin setup

---

### 4. Lighter Icon and Emoji Galleries

`/icons` loads all five icon packs (19 MB of JSON) and `/emoji` the full emoji
set (39 MB of SVG text) just to list names. A Kumidraw diagram with any icon
also loads all five packs, because bare names are searched across every pack.
A small server-side name index (name -> pack, or emoji list) would let these
pages and diagrams fetch only what they show.

**Files to touch**:

- `src/server/api.ts` -- name index endpoint
- `src/client/kumidraw-icons.ts`, `src/pages/icons/page.tsx`, `src/pages/emoji/page.tsx`
