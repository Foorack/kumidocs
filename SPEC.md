# KumiDocs — Specification v0.6

> Last updated: 2026-03-14 · Status: **Phase 4 complete — Phase 5 pending**

---

## 1. Overview

Developer-focused wiki/docs platform. Zero database — all content in a single Git repo. Inspired by Docmost (layout reference). Target: developers, 3–20 concurrent users.

- Primary content: Markdown pages (YAML frontmatter)
- Secondary content: Slide decks (`slides: true`), Code files

---

## 2. Tech Stack

| Layer           | Choice                                                 | Notes                                                                                                              |
| --------------- | ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------ |
| Runtime         | **Bun**                                                | Server + build + git                                                                                               |
| Frontend        | **React + TypeScript**                                 | SPA                                                                                                                |
| Styling         | **Tailwind CSS + shadcn/ui + @tailwindcss/typography** |                                                                                                                    |
| Icons           | **@fluentui/react-icons** + **lucide-react**           | Fluent for app chrome; lucide for SlideViewer controls                                                             |
| Markdown editor | **Custom split-pane**                                  | Textarea + live Streamdown preview. Toolbar: heading selector, Bold, Italic, Blockquote, Cheatsheet. Ctrl+S saves. |
| Markdown viewer | **streamdown**                                         | remark/rehype → React DOM. Built-in `rehype-harden` sanitisation.                                                  |
| Slides          | **Custom SlideViewer**                                 | React, 960×540 canvas, CSS scale                                                                                   |
| Code editor     | **@uiw/react-codemirror**                              | `@uiw/codemirror-extensions-langs` + `@uiw/codemirror-theme-github`                                                |
| Search          | **MiniSearch**                                         | In-memory, full-text, fuzzy                                                                                        |
| Real-time       | **WebSocket** (Bun native)                             | Presence + live reload                                                                                             |
| Deployment      | **Bun process + Docker volume**                        |                                                                                                                    |

---

## 3. Repository & Deployment

Repo is **mounted as a Docker volume**. KumiDocs does not clone it. Remote/auth/branch come from `.git/config`.

**Env vars:**

```
KUMIDOCS_REPO_PATH        (required) Absolute path to mounted git repo
KUMIDOCS_PORT             (default: 3000)
KUMIDOCS_AUTH_HEADER      (default: X-Auth-Request-User)
KUMIDOCS_AUTO_SAVE_DELAY  (default: 5000) ms debounce
KUMIDOCS_INSTANCE_NAME    (default: KumiDocs)
KUMIDOCS_PULL_INTERVAL    (default: 60000) ms between background pulls
```

**Startup:** validate repo path → `git pull --rebase` → read `.kumidocs.json` → load file tree into memory → build MiniSearch index → start HTTP+WS server → schedule pull loop.

`compose.yaml` in repo root uses `oven/bun:latest` directly.

---

## 4. File Layout (inside the git repo)

```
README.md              → home page
.kumidocs.json         → config + permissions (never served, never shown in UI)
images/                → uploaded images (SHA256.ext naming)
**/*.md                → doc pages / slide decks
**/*.{ts,js,...}       → code files
```

### 4.1 Page Frontmatter

```yaml
---
emoji: 📄 # sidebar/tab icon (optional)
description: ... # shown in search results
slides: true # marks file as slide deck
theme: corporate # deck-level theme (built-in or .kumidocs.json key); default: 'default'
paginate: true # show N/total badge on each slide
---
```

**Title** = first `# ` heading in body. Fallback: filename with hyphens/underscores → spaces.

`theme` and `paginate` only affect slide decks.

### 4.2 `.kumidocs.json`

```json
{
	"instanceName": "KumiDocs",
	"editors": ["alice@example.com"],
	"slideThemes": {
		"my-corp": {
			/* SlideThemeDef */
		}
	}
}
```

- Any authenticated user can VIEW. Only `editors` can EDIT.
- Re-read after every background pull.
- `slideThemes` included in `/api/me` response — no extra round-trips needed.

---

## 5. Authentication & Authorization

Header value = email address or JWT (detected by exactly two `.` separators — no signature validation).

**JWT email resolution** (first non-empty wins):

1. `email` claim
2. `preferred_username` claim

If neither present → HTTP 401.

**User:** `{ id (= lowercased email), email, name, displayName, canEdit }`
`displayName` = email local part split by `.`, each word capitalised. (`max.foo@x.com` → `Max Foo`)

**Avatars:** `avatarColor(name)` — djb2 hash → HSL hue → `hsl(hue, 60%, 42%)`. Gravatar primary (SHA-256 proxied via `/api/avatar/:sha256hash`). `avatarInitials` fallback.

**Git commit identity:** `displayName` + `email`.

**Authorization:** View = any authenticated user. Edit = `editors` list only. No per-page permissions in v1.

---

## 6. Navigation & Routing

### 6.1 Routes

```
/                  → README.md
/p/<path>          → doc/slide page (.md appended if no extension in path)
/code/<path>       → code file viewer/editor
/images            → image library
/t                 → theme library
```

### 6.2 Sidebar

Auto-generated from `/api/tree`. Confluence-style: `foo/` + `foo.md` merge into one expandable node. Ghost pages for dirs without matching `.md`. Sort: `README.md` first, then alphabetical by title. Hidden: `.kumidocs.json`, `_sidebar.md`, `images/`.

Right-click context menu: Create subpage, Create alongside, Move/Rename.

Top `⋯` dropdown: **Image library** (`/images`), **Theme library** (`/t`).

**Page icons (default, overridable via `emoji` frontmatter):**

- Markdown: `FluentColorTextBulletListSquare`
- Slides: `FluentColorSlideTextSparkle`
- Code: language icon or generic fallback
- Being edited: small animated amber dot

---

## 7. Editor

### 7.1 Split-Pane Editor

Toolbar spanning both panes: heading selector, Bold, Italic, Blockquote (left) + Cheatsheet (right). Left = textarea. Right = live Streamdown preview. Ctrl+S saves. Default mode is **view** — click Edit to enter edit mode.

### 7.2 View Mode

Read-only Streamdown render → React DOM. XSS via `rehype-harden`. `prose prose-sm dark:prose-invert` typography.

**Image syntax:** `![alt](url){width=300px}` — `{key=value}` after image applies inline CSS. Keys: `width`, `height`, `max-width`, `min-width`, `max-height`, `min-height`. Via `rehypeImageAttrsPlugin`.

### 7.3 Save Behavior

Every save = git commit + immediate push.

| Trigger                 | Commit message                                           |
| ----------------------- | -------------------------------------------------------- |
| Ctrl+S                  | `docs(<path>): save by <displayName>`                    |
| Auto-save (5s debounce) | `docs(<path>): auto-save by <displayName>`               |
| WS disconnect           | `docs(<path>): auto-save on disconnect by <displayName>` |

Save status in page header: **Saved** (green check) / **Saving…** (spinner) / **Unsaved changes** (amber dot). Footer: `Last saved: <N>s ago · <SHA>`.

### 7.4 Page Management

**Create:** modal (type: Markdown / Slides, title, editable slug, path preview). Root via sidebar "+" button. Subpage/alongside via right-click. 409 if path exists.

**Delete:** confirmation modal → single commit.

**Move/Rename:** Parent combobox (searchable, filters by title; `(root)` for top-level) + Filename field. Moving `foo.md` also moves `foo/` subtree. Single commit.

**Duplicate:** available from sidebar context menu + DocPage overflow menu.

### 7.5 Image Upload

Drop onto editor or toolbar button → `POST /api/upload/image` (multipart) → SHA-256 of file → write `images/<sha256>.<ext>` → commit → insert `![alt text](/images/<sha256>.<ext>)`. Max 25 MB. Types: jpg, png, gif, webp, svg.

### 7.6 Image Library (`/images`)

Grid of all `images/*` files. Detail panel: preview, size, "Used in" links, direct URL. Delete (editors only): blocked if any `.md` references the SHA-256 hash (409). Accessible from sidebar `⋯` → "Image library".

### 7.7 Theme Library (`/t`)

Grid of all built-in + custom themes. Each card shows a real `ScaledSlide` thumbnail (title layout). Click opens a demo dialog (`SlideViewer`, 85vh) showing Title, Content, Section, Split layouts — plus any non-standard custom layout keys. Card size: 320px wide. Accessible from sidebar `⋯` → "Theme library".

### 7.8 PDF Export

**Markdown pages:** `html2canvas-pro` + `jspdf` (dynamic import). Offscreen `MarkdownViewer` at 800px width with `z-index: -9999` (not `opacity: 0`). A4 tiles stitched into multi-page PDF. Via `···` menu in view mode.

**Slide decks:** each 960×540 canvas captured individually (including overlays), one landscape page each. Via SlideViewer controls bar (`ImageDown` button).

---

## 8. Real-Time Collaboration

**Edit Lock:** one user per page. Acquired on "Edit". Released on "Done", navigate away, or WS disconnect (server auto-releases). Locked page shows "Being edited by `<Name>`" banner.

**WS Protocol:**

Client → server: `hello {pageId, userId}`, `editing_start {pageId}`, `editing_stop {pageId}`, `heartbeat`

Server → client: `presence_update {pageId, viewers[], editor|null}`, `page_changed {pageId, commitSha, changedBy, changedByName}`, `page_deleted {pageId}`, `page_created {pageId, path}`, `save_conflict_lost {pageId, message}`, `heartbeat_ack`

**Presence:** sidebar avatar stacks on viewed/edited pages. Page header `AvatarGroup`.

**Live reload:** `page_changed` received → no unsaved changes: silent reload; unsaved changes: conflict banner. `page_deleted` → redirect home + toast.

**Heartbeat:** client every 30s. Server clears presence+lock after 90s silence.

---

## 9. Git Operations

**Push strategy:** every commit immediately followed by `git push`.

**Conflict on push:** `git push` fails → `git fetch` → `git rebase origin/<branch>`. Success: `git push --force-with-lease`. Failure: `git rebase --abort` → local changes lost → reset in-memory state → `save_conflict_lost` → error toast.

**Background pull (every 60s):** `git fetch` → `git rebase` (only if working tree clean) → reload changed files → update search index → broadcast events.

**In-memory state:** full file tree in `Map<path, content>`. Dirty: `Map<path, {content, ownerId, timer}>`. SIGTERM/SIGINT: flush dirty state → commit + push → exit. Server restart = dirty state lost.

---

## 10. Code File Viewer/Editor

CodeMirror with language packs (by extension) + github light/dark themes. Same edit-lock, save, commit flow as Markdown. Features: syntax highlighting, line numbers, code folding, line wrap, Ctrl+S. No LSP/autocomplete in v1.

---

## 11. Slide Decks

### 11.1 SlideViewer

Fully client-side. Slides split on `---` (fence-aware). Canvas 960×540 (`SLIDE_W`/`SLIDE_H`), CSS `scale()` to fit container, calculated via `ResizeObserver`. Scale: `Math.min((w-192)/960, (h-96)/540)`.

**Viewing modes:**

- **Scroll** (default in editor): all slides vertical, smooth-scroll to active.
- **Paginate**: single slide + prev/next + progress bar.
- **Spotlight**: `fixed inset-0 z-[9999] bg-black`, requests browser fullscreen, click = next.
- **Standalone** (`standalone` prop): paginate-only, mode toggle hidden.

Navigation: ←↑ prev, →↓Space next (keyboard, all modes).

Controls bar: slide count / prev·counter·next; `Maximize`/`Minimize`, `Spotlight`, `ImageDown` (PDF export), `GalleryVertical`/`BookOpen` mode toggle (hidden in standalone).

### 11.2 Per-slide Directives

`<!-- key: value -->` — parsed and stripped before rendering.

| Directive               | Effect                                           |
| ----------------------- | ------------------------------------------------ |
| `<!-- class: title -->` | Apply layout class                               |
| `<!-- bg: #003087 -->`  | Override background (any CSS `background` value) |
| `<!-- color: white -->` | Override text colour                             |

### 11.3 Layout Classes

| Class     | Description                                                      |
| --------- | ---------------------------------------------------------------- |
| _(none)_  | Default: `px-8 py-6`, top-to-bottom flow                         |
| `title`   | Full-height flex centre, `text-center`, h1 = 3.5rem              |
| `section` | Full-height flex centre, `text-center`, h2 = 3.5rem / 800 weight |
| `center`  | Full-height flex centre, `text-center`, normal heading sizes     |
| `split`   | Two equal columns at second `##`, vertical divider               |
| `blank`   | `p-0` — full-bleed                                               |
| `invert`  | Swaps `--slide-bg` / `--slide-fg`                                |

### 11.4 Slide Themes

**Built-in** (CSS class `.slide-theme-{name}` on canvas):

| Name        | Background                       | Foreground             |
| ----------- | -------------------------------- | ---------------------- |
| `default`   | App bg (follows site light/dark) | App fg                 |
| `dark`      | `oklch(0.13 0 0)`                | `oklch(0.93 0 0)`      |
| `corporate` | Navy `#1a2744`                   | `#e8edf8`              |
| `minimal`   | `oklch(0.96 0.005 240)`          | `oklch(0.18 0.01 240)` |
| `gradient`  | Indigo→violet→pink diagonal      | White                  |

**Dark/light isolation:** `ScaledSlide` always stamps `.dark` or `.light` on `.slide-canvas`. Logic: custom theme → `isBgDark(bg)` (from `src/lib/slide.ts`); built-in → `DARK_BUILT_IN_THEMES.has(theme)` or `(theme==='default' && siteTheme==='dark')`. `.light {}` CSS block mirrors `:root` light-mode vars. This fully isolates slide tokens from site dark mode.

**Custom themes** (`.kumidocs.json` → `slideThemes` → `SlideThemeDef`):

```typescript
interface SlideThemeDef {
	bg?: string; // CSS background value
	fg?: string; // sets --slide-fg
	contentPadding?: { top?: number; right?: number; bottom?: number; left?: number }; // px on 960×540
	elements?: SlideThemeElement[]; // overlay elements, in z-order
	layouts?: Record<string, Omit<SlideThemeDef, 'layouts'>>; // per-layout FULL overrides
}

type SlideThemeElement =
	| {
			type: 'rect';
			fill: string;
			left?: number;
			right?: number;
			width?: number;
			top?: number;
			bottom?: number;
			height?: number;
	  }
	| {
			type: 'text';
			content: string;
			color?: string;
			fontSize?: number;
			bold?: boolean;
			align?: 'left' | 'center' | 'right';
			left?: number;
			right?: number;
			centerX?: boolean;
			top?: number;
			bottom?: number;
			centerY?: boolean;
	  }
	| {
			type: 'image';
			src: string;
			opacity?: number;
			left?: number;
			right?: number;
			width?: number;
			centerX?: boolean;
			top?: number;
			bottom?: number;
			height?: number;
			centerY?: boolean;
	  };
```

**Positioning:** all px on 960×540. Left/right/top/bottom = distance from edge. `centerX/centerY = true` centres. Setting both edges (e.g. `left:0, right:0`) spans full axis.

**Template variables** in `text.content`: `{{slideNum}}`, `{{slideTotal}}`, `{{date}}`, `{{date:FORMAT}}`, `{{title}}` (first `#` heading on slide).

**`layouts` key:** each entry COMPLETELY REPLACES base theme for that layout class. `"default"` key matches slides with no `<!-- class -->`.

### 11.5 Slide Typography (`SlideMarkdownViewer`)

Body/lists: 1.2rem · h3: 1.5rem · h2: 2rem · h1: 2.75rem · title-h1: 3.5rem · section-h2: 3.5rem/800.
All headings/body: `color: inherit`. Prose forced to `var(--slide-fg)` on canvas. No `dark:prose-invert`.

---

## 12. Search

MiniSearch, server-side index. Fields: `title`, `path`, `content` (md stripped), `description`. Updated after every commit. `GET /api/search?q=` → `[{path, title, emoji, snippet, score}]`. Ctrl+K palette.

---

## 13. UI

### 13.1 Emoji Rendering Rule

> **NEVER render emoji as raw text/`<span>`. ALWAYS use `<EmojiIcon emoji="..." size={N} />`.**

`EmojiIcon` (`src/components/ui/EmojiIcon.tsx`): `emoji` prop → `@lobehub/fluent-emoji`; `fileType` prop → Fluent Color system icon; `icon` prop → raw Fluent icon.

### 13.2 Layout

Slim top bar (Logo, Search Ctrl+K, User avatar) + left sidebar + main content. Page header: emoji + title, Edit/Done button, `···` overflow menu, viewer `AvatarGroup`. Page footer: `Last saved: <N>s ago · <SHA>`.

**`···` overflow menu (`PageMenuItems` component):**

- Open in new tab / Copy link / Export as PDF (doc view mode only) / Move / Delete
- New subpage, New alongside, Duplicate — shown only in sidebar menus (not FilePage header)

### 13.3 Dark Mode

Browser `prefers-color-scheme` default. Toggle in top bar; preference in `localStorage`. Tailwind `dark:` for app shell. Slide canvases use `.dark`/`.light` stamping (independent of site mode). Global CSS: `button { cursor: pointer }` in `@layer base`.

### 13.4 Other UI

- Breadcrumbs: derived from file path, above title.
- Not found → "Create this page?" prompt pre-filled from URL.
- Toasts: top-right stack (success/warning/error/info).
- Sidebar resizable width (persisted `localStorage`).

---

## 14. API Surface

All routes require valid auth header.

```
GET    /api/me                   → user info + slideThemes
GET    /api/tree                 → file tree {path, type, emoji, title}
GET    /api/file?path=           → content + metadata
PUT    /api/file?path=           → write (editors only)
POST   /api/file/create          → create {path, content}
DELETE /api/file?path=           → delete (editors only)
POST   /api/file/rename          → {from, to}
POST   /api/upload/image         → multipart → {url, path}
GET    /api/images               → [{filename, path, url, size, usedIn[]}]
DELETE /api/images/:filename     → delete (editors; 409 if referenced)
GET    /images/:filename         → serve image (Cache-Control: immutable)
GET    /api/avatar/:sha256hash   → proxy Gravatar
GET    /api/search?q=            → search results
WS     /ws                       → WebSocket
```

---

## 15. Source Structure

```
src/
├── index.ts              ← Bun HTTP+WS server entry
├── frontend.tsx          ← React SPA entry
├── App.tsx               ← routing
├── server/
│   ├── api.ts / auth.ts / config.ts / filestore.ts / git.ts / search.ts / websocket.ts
├── components/
│   ├── dialogs/NewPageDialog.tsx
│   ├── editor/
│   │   ├── MarkdownEditor.tsx / MarkdownViewer.tsx
│   │   ├── SlideViewer.tsx          ← exports ScaledSlide, SLIDE_W, SLIDE_H, SlideViewer
│   │   ├── SlideMarkdownViewer.tsx / SlideOverlay.tsx
│   │   └── rehypeEmojiPlugin.ts / rehypeHeadingIdsPlugin.ts / rehypeImageAttrsPlugin.ts
│   ├── layout/AppShell.tsx / PageInfoPanel.tsx / Sidebar.tsx / TopBar.tsx
│   ├── search/SearchPalette.tsx
│   └── ui/ (EmojiIcon, EmojiPicker, EmojiPickerPopover, PageMenuItems, shadcn primitives)
├── hooks/usePageActions.tsx
├── lib/
│   ├── avatar.ts / filetypes.ts / frontmatter.ts / types.ts / utils.ts
│   └── slide.ts   ← parseSlideDirectives(), resolveCustomTheme(), isBgDark(), SlideThemeDef/Map
├── pages/
│   ├── FilePage.tsx / WelcomePage.tsx / NotFound.tsx
│   ├── ImageLibraryPage.tsx
│   └── ThemeLibraryPage.tsx   ← /t route, ScaledSlide thumbnails + demo dialog
└── store/theme.tsx / user.tsx / ws.ts
styles/globals.css
```

---

## 16. Implementation Phases

### ✅ Phase 1 — Foundation

Bun server, git ops, in-memory filestore, WebSocket presence, REST API, React SPA shell.

### ✅ Phase 2 — Editor Core

Custom split-pane editor, Streamdown view, save flow, edit-lock, dark mode.

### ✅ Phase 3 — UI Polish

Sidebar (auto-gen, Confluence hierarchy, ghost pages, icons, presence dots), search palette, toasts, create/delete/move/duplicate pages, PDF export (markdown), presence avatars, drag-drop images, image library, resizable sidebar.

### ✅ Phase 4 — Slides & Code

Slide viewer (scroll/paginate/spotlight/fullscreen), PDF export (slides), CodeMirror code editor, slide directive/layout/theme system (5 built-in themes + custom via `.kumidocs.json`), overlay element renderer, layout overrides, template variables, `contentPadding`, `.dark`/`.light` canvas isolation, Theme Library page.

### 🔲 Phase 5 — TBD

- Marp/server-side PDF export (Playwright) — deferred to v2
- LSP / autocomplete in code editor — deferred to v2

---
