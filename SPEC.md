# KumiDocs — Specification v0.4

> Last updated: 2026-03-10 · Status: **FINALIZED — ready for implementation**

---

## 1. Overview

KumiDocs is a developer-focused wiki/docs platform inspired by **Docmost** (visual layout reference — sidebar-left, slim header, content-right), with zero database. All content is stored exclusively in a single Git repository.

- **One instance = one Git repo**
- Target users: developers, 3–20 concurrent users
- Primary content: Markdown pages (YAML frontmatter)
- Secondary content: Slide decks (`slides: true` frontmatter)
- Also supported: Code files (viewed/edited with syntax highlighting)

---

## 2. Tech Stack

| Layer           | Choice                                                 | Notes                                                                                                                                      |
| --------------- | ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Runtime         | **Bun**                                                | Server + build + git                                                                                                                       |
| Frontend        | **React + TypeScript**                                 | SPA                                                                                                                                        |
| Styling         | **Tailwind CSS + shadcn/ui + @tailwindcss/typography** |                                                                                                                                            |
| Icons           | **@fluentui/react-icons** + **lucide-react**           | Fluent icons for app chrome; lucide-react for SlideViewer controls. No other Fluent/MS components.                                         |
| Markdown editor | **Custom split-pane editor**                           | Bespoke React textarea editor with live Streamdown preview. Toolbar: heading selector, Bold, Italic, Blockquote, Cheatsheet. Ctrl+S saves. |
| Markdown viewer | **streamdown**                                         | React component on remark/rehype. Renders md → React DOM directly in the page. Built-in `rehype-harden` sanitisation.                      |
| Slides          | **Custom client-side SlideViewer**                     | React + MarkdownViewer, 16:9 canvas, CSS scale, no server involvement                                                                      |
| Code editor     | **@uiw/react-codemirror**                              | `@uiw/codemirror-extensions-langs` for language packs; `@uiw/codemirror-theme-github` for light/dark themes matching Shiki.                |
| Search          | **MiniSearch**                                         | In-memory, full-text, fuzzy, fast                                                                                                          |
| Real-time       | **WebSocket** (Bun native)                             | Presence + live reload                                                                                                                     |
| Deployment      | **Bun process + Docker volume**                        | Git repo mounted into container                                                                                                            |

---

## 3. Repository & Deployment

### 3.1 Mounting

- The git repo is **mounted as a Docker volume** into the container. KumiDocs does **not** clone it.
- Remote URL, auth, and branch come from the mounted repo's own `.git/config`.
- SSH key: mount into container + configure in SSH config.
- HTTP token: embed in remote URL or use `.netrc`.

### 3.2 Environment Variables

```
KUMIDOCS_REPO_PATH        (required)  Absolute path to the mounted git repo
KUMIDOCS_PORT             (default: 3000)
KUMIDOCS_AUTH_HEADER      (default: X-Auth-Request-User)  Header name for identity
KUMIDOCS_AUTO_SAVE_DELAY  (default: 5000)  ms debounce before auto-save commit
KUMIDOCS_INSTANCE_NAME    (default: KumiDocs)  Display name in UI
KUMIDOCS_PULL_INTERVAL    (default: 60000)  ms between background git pulls
```

### 3.3 Startup Sequence

1. Validate `KUMIDOCS_REPO_PATH` is a valid git repo — fail loudly if not.
2. `git pull --rebase` to sync with upstream.
3. Read `.kumidocs.json` (permissions config).
4. Read entire working tree into in-memory `Map<path, content>`.
5. Build MiniSearch index from all `.md` files.
6. Start HTTP + WebSocket server.
7. Schedule background pull loop (every `KUMIDOCS_PULL_INTERVAL` ms).

### 3.4 `compose.yaml`

Provided in the repo root. No Dockerfile, uses Bun's official image. Mounts the repo as a volume.

---

## 4. File Layout (inside the git repo)

```
README.md              → default home page (shown on /)
_sidebar.md            → navigation (GitLab wiki format — nested markdown lists)
.kumidocs.json         → instance config + permissions (NOT in UI, NOT in file tree)
images/                → drag-and-drop image uploads (SHA256.ext naming)
**/*.md                → doc pages
**/*.{ts,js,py,...}    → code files
```

Any `.md` with `slides: true` frontmatter is a slide deck.

### 4.1 Page Frontmatter

```yaml
---
emoji: 📄 # sidebar/tab icon (optional, defaults by type — see §6.2)
description: ... # subtitle shown in search results
slides: true # marks file as a slide deck (client-side rendered)
---
```

**Title** is not stored in frontmatter. It is derived at runtime from the first `# ` heading in the document body. If no `# ` heading is found, the filename (with hyphens/underscores replaced by spaces) is used as a fallback.

### 4.2 `.kumidocs.json`

```json
{
	"instanceName": "KumiDocs",
	"editors": ["alice@example.com", "bob@example.com"]
}
```

- **Any authenticated user can VIEW.**
- **Only users in `editors` can EDIT.**
- Re-read from disk after every background pull (changes take effect within `KUMIDOCS_PULL_INTERVAL`).
- **Never served via API. Never shown in the file tree or UI.**

---

## 5. Authentication & Authorization

### 5.1 Header-Based SSO

Header name configured via `KUMIDOCS_AUTH_HEADER`. The header value **must always resolve to an email address**.

- **Plain string** → treated directly as the user's email (lowercased).
- **JWT** (detected by exactly two `.` separator characters) → Base64url-decode the payload, extract claims. **No signature validation.**

JWT email resolution (first non-empty value wins, `sub` is **never** used):

| Priority | Claim                | Notes                            |
| -------- | -------------------- | -------------------------------- |
| 1        | `email`              | Preferred — explicit email claim |
| 2        | `preferred_username` | Used when `email` is absent      |

If neither claim is present in the JWT → HTTP 401.

User object: `{ id, email, name, displayName, gravatarHash, canEdit }`

- `id` = lowercased email
- `displayName` = derived from email local part: split by `.`, capitalise each word
  (`max.faxalv@example.com` → `Max Faxalv`, `max@foorack.com` → `Max`)
- `gravatarHash` = MD5(lowercased email)

### 5.2 Avatar Color Convention

Avatars use a deterministic color from **`src/lib/avatar.ts`**:

| Function               | Rule                                                                                              |
| ---------------------- | ------------------------------------------------------------------------------------------------- |
| `avatarColor(name)`    | djb2 hash of name → HSL hue (0–359) → `hsl(hue, 60%, 42%)`. Same name always same color.          |
| `avatarInitials(name)` | Fallback when Gravatar unavailable. Multi-word → first+last initial. Single-word → first 2 chars. |

Gravatar is the primary avatar source (`gravatarHash` from `/api/me`). Initials are the fallback, computed client-side from `displayName` via `avatarInitials`.

### 5.3 Git Commit Identity

- Author name: `displayName` (fallback: `id`)
- Author email: `email` (fallback: `kumidocs@localhost`)

### 5.4 Authorization

- View: any authenticated user.
- Edit: only users in `.kumidocs.json` `editors` list.
- `.kumidocs.json`: no access via KumiDocs UI at all, ever.
- No per-page permissions in v1.

---

## 6. Navigation & Routing

### 6.1 URL Structure (client-side SPA)

```
/                  → README.md (home, instant)
/p/<path>          → doc page at <path>.md
/code/<path>       → code file viewer/editor for <path>
```

**Path convention for Markdown pages:**

- Sidebar links omit the `.md` extension (e.g. `/p/docs/setup`, not `/p/docs/setup.md`).
- `FilePage` re-appends `.md` at runtime: if `rawPath` contains no `.`, `.md` is appended to form the actual `filePath`. Paths that already contain a `.` (e.g. `README.md`, `index.ts`) are used as-is, which correctly handles both explicit `.md` links and non-Markdown file paths under `/p/`.

### 6.2 Sidebar Navigation

- Sidebar is **auto-generated from the full file tree** (`/api/tree`) on startup and after every commit.
- Sidebar links for Markdown pages **strip the `.md` extension** so URLs stay clean (e.g. `/p/docs/setup`). `FilePage` re-appends `.md` — see §6.1.
- No manual `_sidebar.md` curation — every file in the repo appears automatically.
- **Confluence-style hierarchy**: filesystem folders are never rendered as folders in the UI. A directory `foo/` and its sibling `foo.md` are merged into a single expandable page whose children are the files inside `foo/`.
- If a directory exists but `<dirname>.md` does not, a **virtual ghost page** is shown (italic, muted) — clicking it opens DocPage which shows "This page doesn't exist yet — Create it?".
- Sort order per level: `README.md` first, then alphabetically by page title.
- `_sidebar.md` (legacy file) is hidden. `.kumidocs.json` is always hidden. `images/` directory is always hidden (managed via the Image Library).
- Right-click a page for: **Create subpage**, **Create page alongside**, **Move / Rename**.

### 6.3 Sidebar Icons (default, overridable via `emoji` frontmatter)

| File type         | Icon                                   |
| ----------------- | -------------------------------------- |
| Markdown doc      | `FluentColorTextBulletListSquare`      |
| Marp slides       | `FluentColorSlideTextSparkle`          |
| Code file         | Language icon or generic file fallback |
| Page being edited | Small animated amber dot               |

### 6.4 Home Page

- Opens `README.md` immediately on load — no splash screen, no redirect.
- If `README.md` doesn't exist → "Create this page?" prompt.

---

## 7. Editor

### 7.1 Edit Mode — Custom Split-Pane Editor

- **Layout**: fixed toolbar spanning both panes; left pane = raw markdown `<textarea>`; right pane = live Streamdown preview (direct DOM render, not iframe — content is authored by the current user).
- **Toolbar** (left side): heading-size dropdown (Normal / H1–H6), Bold, Italic, Blockquote.
- **Toolbar** (right side): Cheatsheet button (modal with syntax reference).
- All toolbar actions are cursor-aware: wrapping selections (bold/italic) or toggling line prefixes (headings, blockquote).
- Keyboard shortcut: **Ctrl+S / Cmd+S** → save.
- Default page mode is **view**. User clicks "Edit" to enter edit mode (subject to edit-lock and editor permission).

### 7.2 View Mode — streamdown

- Read-only. Default for everyone on page load.
- `streamdown` renders markdown → React DOM via a remark/rehype pipeline, mounted directly in the page.
- XSS protection via Streamdown's built-in `rehype-harden` (strips all event handlers, dangerous attributes, and unsafe HTML before it reaches the DOM).
- `@tailwindcss/typography` (`prose prose-sm dark:prose-invert`) provides full typographic styles (headings, lists, code, tables, blockquotes).
- **Image attribute syntax**: `![alt](url){width=300px height=200px}` — a `{key=value ...}` block written directly after an image applies inline CSS. Supported keys: `width`, `height`, `max-width`, `min-width`, `max-height`, `min-height`. Values: any valid CSS length (`px`, `%`, `em`, `rem`, `vw`, `vh`, `auto`). Implemented via `rehypeImageAttrsPlugin`.

### 7.3 Save Behavior

Every save = **git commit + git push** (always push immediately — no batching).

| Trigger                 | Commit message                                           |
| ----------------------- | -------------------------------------------------------- |
| Ctrl+S                  | `docs(<path>): save by <displayName>`                    |
| Auto-save (5s debounce) | `docs(<path>): auto-save by <displayName>`               |
| WebSocket disconnect    | `docs(<path>): auto-save on disconnect by <displayName>` |

### 7.4 Save Status Indicator (page header)

- **Saved** (green check) — in sync with git HEAD.
- **Saving…** (spinner) — commit/push in progress.
- **Unsaved changes** (amber dot) — dirty, within debounce window.
- Footer: `Last saved: <N>s ago · <short SHA>`

### 7.5 Creating Pages

- "New page" button (bottom of sidebar) → modal:
    - **Type**: Markdown (default) or Marp Slides.
    - **Title**: free text; filename slug is auto-derived and editable.
    - **Path preview**: shown as read-only `<parent>/<slug>.md`.
    - Press Enter or "Create" to confirm.
- **Root pages**: created in repository root (clicking the "New page" button).
- **Sub-pages (in a folder)**: right-click a folder → "New page in this folder"; right-click a file → "Create page alongside" → same modal, pre-scoped to that directory.
- Validates path is unique; returns 409 if file already exists.
- After creation, navigates directly to the new page.
- Sidebar auto-refreshes via WebSocket `page_created` broadcast.

### 7.6 Deleting Pages

Confirmation modal → deletes file → removes from `_sidebar.md` → single commit.

### 7.7 Renaming / Moving Pages

- Move modal has two fields: **Parent** (searchable combobox listing all pages by title, selecting one makes the moved page a sub-page of it; choose `(root)` for top-level) and **Filename** (slug without `.md`).
- The parent combobox filters by page title as user types; auto-focuses on open.
- Selecting a parent page `foo/bar.md` sets the destination directory to `foo/bar/`; the folder is created automatically if it doesn't exist.
- When a page has sub-pages (i.e. a matching directory `foo/` exists alongside `foo.md`), moving `foo.md` also moves the entire `foo/` subtree to the new location in the same commit.
- All moved files are staged in a single git commit + push.

### 7.8 Image Upload (drag-and-drop + toolbar button)

1. Drop image onto editor area **or** click the toolbar Image button.
2. File picker / dropped files are sent via `POST /api/upload/image` (multipart).
3. Server computes full SHA-256 of file content → writes `images/<sha256>.<ext>` in repo root.
4. Commits the image file.
5. Inserts `![alt text](/images/<sha256>.<ext>)` at cursor (absolute path — resolves to repo root on GitHub/GitLab too).

- Max size: **25 MB**. Reject with user-visible toast if exceeded.
- Accepted types: `jpg`, `png`, `gif`, `webp`, `svg`.
- Images are served at `/images/<filename>` with `Cache-Control: public, max-age=31536000, immutable`.

### 7.9 Image Library

- Route: `/images` (grid view) and `/images/:filename` (right-panel detail).
- Accessible from the **Pages** header `⋯` menu in the sidebar → "Image library".
- Grid of all `images/*` files in the repo: thumbnail, filename (SHA-256 hash), file size, usage badge.
- Selecting a thumbnail opens the detail panel: preview, size, "Used in" page links, direct URL.
- **Delete**: editors only; blocked (button disabled + 409 from server) if any `.md` file references the image's SHA-256 hash. Confirmed via modal.

---

## 8. Real-Time Collaboration & Presence

### 8.1 Edit Lock

- Only **one user** may hold the edit-lock for a given page at a time.
- Acquired on "Edit" click. Released on:
    - "Done" click / navigation away.
    - WebSocket disconnect (server auto-releases).
- If another user tries to edit a locked page → "This page is being edited by `<Name>`" banner, Edit button disabled.
- Lock is in-memory only; does not survive server restart.

### 8.2 WebSocket Protocol

**Client → Server:**

```json
{ "type": "hello",         "pageId": "...", "userId": "..." }
{ "type": "editing_start", "pageId": "..." }
{ "type": "editing_stop",  "pageId": "..." }
{ "type": "heartbeat" }
```

**Server → Client:**

```json
{ "type": "presence_update", "pageId": "...",
  "viewers": [{"id":"...","name":"...","initials":"..."}],
  "editor": {"id":"...","name":"...","initials":"..."} | null }
{ "type": "page_changed",  "pageId": "...", "commitSha": "...", "changedBy": "...", "changedByName": "..." }
{ "type": "page_deleted",  "pageId": "..." }
{ "type": "page_created",  "pageId": "...", "path": "..." }
{ "type": "save_conflict_lost", "pageId": "...", "message": "Your changes were lost due to a remote conflict." }
{ "type": "heartbeat_ack" }
```

### 8.3 Presence Display

- Sidebar: avatar stacks on items currently being viewed or edited.
- Edit-locked items show amber dot + editor name in tooltip.
- Page header: `AvatarGroup` of current viewers.

### 8.4 Live Reload on Remote Change

After a background pull that advances HEAD:

- Broadcast `page_changed` for every changed file.
- Receiver with **no unsaved changes** → auto-reload silently.
- Receiver with **unsaved changes** → banner: "Page updated remotely — your changes may conflict. Save or discard."
- Receiver of `page_deleted` → redirect to home + toast.

### 8.5 Heartbeat

- Client sends heartbeat every **30s**.
- Server clears presence + lock if no heartbeat for **90s**.

---

## 9. Git Operations

### 9.1 Push Strategy

Every commit is **immediately followed by `git push`**. This keeps the remote in sync at all times and prevents divergence when devs push directly to the repo.

### 9.2 Conflict on Push (remote diverged)

```
1. git push → fails (non-fast-forward)
2. git fetch
3. git rebase origin/<branch>
   ├── Success → git push --force-with-lease → done
   └── Failure → git rebase --abort
                 → LOCAL CHANGES ARE LOST
                 → Reset in-memory state to HEAD
                 → Send save_conflict_lost to affected client
                 → Show prominent error toast
```

### 9.3 Background Pull (every 60s)

1. `git fetch`
2. `git rebase origin/<branch>` (only if working tree is clean)
3. If working tree is dirty → skip, retry next cycle.
4. After successful pull: reload changed files into memory, update search index, broadcast `page_changed`/`page_deleted`/`page_created`.

### 9.4 In-Memory State

- On startup: entire working tree read into `Map<path, content>`.
- Dirty files tracked: `Map<path, { content, ownerId, timer }>`.
- **Server restart: in-memory dirty state is LOST** (no persistence to disk).
- **Shutdown** (SIGTERM/SIGINT): flush all dirty state → commit + push → exit.

### 9.5 Branch

- Single branch — whatever is currently checked out in the mounted repo.
- No branch switching in v1.

---

## 10. Code File Viewer / Editor

- **`@uiw/react-codemirror`** with `@uiw/codemirror-extensions-langs` (language detection by file extension) and `@uiw/codemirror-theme-github` (light/dark, matching the Shiki themes used in MarkdownViewer).
- Same edit-lock, save, and commit flow as markdown files.
- No WYSIWYG toolbar — raw code only.
- Features: syntax highlighting, line numbers, code folding, line wrapping, Ctrl+S saves.
- View mode: read-only CodeMirror (same component, `readOnly` prop). No separate viewer.
- No LSP / autocomplete in v1.

---

## 11. Slide Decks

### 11.1 Detection

- File has `slides: true` in YAML frontmatter.
- Sidebar shows `FluentColorSlideTextSparkle` icon.
- `/p/<path>` shows the inline viewer + editor.

### 11.2 Slide Viewer

- **Fully client-side** — server is unaware of slide format; it stores and serves `.md` files like any other.
- Slides are split on `---` separator lines (each line containing only `---`).
- Each slide is rendered via a shared `ScaledSlide` component wrapping `MarkdownViewer` (Streamdown pipeline — same components, dark mode, emoji, etc.).
- Slides are rendered at a fixed virtual canvas (960×540, 16:9) and CSS `transform: scale()` to fit the container, calculated via `ResizeObserver`. Scale formula: `Math.min((width - 192) / 960, (height - 96) / 540)` — identical across all modes.
- **Three viewing modes** (toggled via controls bar):
    - **Scroll mode** (default): all slides stacked vertically, center-aligned, smooth-scrolled to active slide on arrow-key navigation.
    - **Paginate mode**: single centered slide with prev/next buttons and slide counter (arrow keys + buttons).
    - **Spotlight mode**: bare fullscreen overlay (`fixed inset-0 z-[9999] bg-background`), requests browser fullscreen on entry, click advances to next slide. Exits when browser fullscreen is dismissed.
- **Standalone mode** (`standalone` prop on `SlideViewer`): paginate-only, scroll/paginate toggle hidden.
- Controls bar: scroll mode shows total slide count; paginate mode shows prev/counter/next; both show fullscreen (`Maximize`/`Minimize`) and spotlight (`Spotlight`) icon buttons. Mode toggle (`GalleryVertical` / `BookOpen`) hidden in standalone mode.
- Navigation: arrow keys (←↑ = prev, →↓Space = next) work in all modes; in scroll mode the active slide is also scrolled into view.
- No **Present** button in the FilePage header — presentation is launched entirely from within the embedded `SlideViewer`.

### 11.3 Editing Slides

- Same custom split-pane editor as markdown.
- Preview pane shows live Streamdown preview of the raw markdown (not slide-split).

### 11.4 Export

- **Markdown pages**: client-side PDF export via `html2canvas-pro` + `jspdf` (dynamically imported). Triggered from the "···" page menu ("Export as PDF" item, visible in view mode only). An offscreen `MarkdownViewer` renders the document at 800 px width with `z-index: -9999` (not `opacity: 0` — html2canvas-pro inherits and propagates opacity, causing blank output). Pages are sliced into A4 tiles and stitched into a multi-page PDF, saved as `<title>.pdf`.
- **Slide decks**: client-side PDF export via `html2canvas-pro` + `jspdf`, triggered from the SlideViewer controls bar (`ImageDown` button). Each 960×540 slide is captured individually and placed on its own A4 landscape page.
- Marp/server-side PDF export (Playwright, Chromium-gated): deferred to v2.

---

## 12. Search

- **MiniSearch** — in-memory, fast, fuzzy, ~8 kB.
- Index built server-side at startup from all `.md` files.
- Updated incrementally after every commit.
- Indexed fields: `title`, `path`, `content` (markdown stripped), `description`.
- API: `GET /api/search?q=<query>` → `[{ path, title, emoji, snippet, score }]`
- Global shortcut: **Ctrl+K / Cmd+K** → floating search palette.
- Search also covers code filenames (by path).
- 500 files is well within MiniSearch's comfortable range.

---

## 13. UI Layout & Design

### 13.0 Icon & Emoji Rendering Rule

> **NEVER render emoji as raw text or `<span>` elements. ALWAYS use `<EmojiIcon emoji="..." size={N} />`.**

`EmojiIcon` (`src/components/ui/EmojiIcon.tsx`) is the single source of truth for all emoji and icon rendering:

- **`emoji` prop** → renders via `@lobehub/fluent-emoji` (crisp 3D Fluent style at any size)
- **`fileType` prop** → maps to the correct Fluent Color system icon
- **`icon` prop** → renders a raw Fluent React Icon component

Raw emoji in JSX (`🌙`, `☀️`, etc.) render as OS-font bitmaps — blurry, inconsistent across platforms. All emojis, including UI chrome (theme toggle, status indicators, etc.), must go through `EmojiIcon`.

### 13.1 Overall Layout (Docmost-inspired)

```
┌──────────────────────────────────────────────────────────┐
│  [Logo/Name]   [Search Ctrl+K]            [User avatar]  │  ← slim top bar
├──────────────┬───────────────────────────────────────────┤
│              │  [emoji] Page Title    [Edit] [···] [⬤⬤]  │  ← page header
│   _sidebar   ├───────────────────────────────────────────┤
│  navigation  │                                           │
│   (left)     │   page content                            │
│              │   (view:  streamdown → direct render)              │
│              │   (edit:  custom split-pane editor)        │
│              │                                           │
│              ├───────────────────────────────────────────┤
│              │  Last saved: 2m ago · abc1234             │  ← page footer
└──────────────┴───────────────────────────────────────────┘
```

### 13.2 Sidebar

- Rendered from `_sidebar.md` (nested list → tree).
- Items: emoji/icon + page title.
- Active page highlighted.
- Presence dots on active/edited pages.
- "+" button → new page flow.
- Collapsible groups (nested lists).
- Resizable width (persisted in `localStorage`).

### 13.3 Dark Mode

- Default: read from browser (`prefers-color-scheme`).
- Toggle button in top bar; preference saved in `localStorage`.
- Tailwind `dark:` classes for app shell.
- Dark class injected into `<iframe srcdoc>` body for view/slide iframes.

### 13.4 Page Header

- `emoji` + title (inline-editable in edit mode).
- Right side: viewer `AvatarGroup`, "Edit"/"Done" button, "···" overflow menu.
- **Overflow menu** (`PageMenuItems` component, shared with the sidebar's dropdown and context menus):
    - _New subpage_ / _New page_ + _Duplicate_ — shown only in sidebar menus (directory context available); omitted in the FilePage header
    - ─────
    - _Open in new tab_
    - _Copy link_
    - _Export as PDF_ — shown only for doc pages in view mode
    - ─────
    - _Move_
    - _Delete_
- Virtual (ghost) pages show only a _Create this page_ link.

### 13.5 Breadcrumbs

Derived from file path, shown above title in small muted text.  
e.g. `docs / api / authentication`

### 13.6 "Page Not Found" Flow

Navigate to non-existent path → "Create this page?" prompt, pre-filled with path and title from URL.

### 13.7 Toast Notifications

Top-right toast stack: `success` (green), `warning` (amber), `error` (red), `info` (blue).

---

## 14. API Surface (HTTP)

All routes require valid auth header. JSON responses.

```
GET    /api/me                          → current user info
GET    /api/tree                        → full file tree { path, type, emoji, title }
GET    /api/file?path=<path>            → file content + metadata
PUT    /api/file?path=<path>            → write file (editors only)
POST   /api/file/create                 → create new file { path, content }
DELETE /api/file?path=<path>            → delete file (editors only)
POST   /api/file/rename                 → rename/move { from, to }
POST   /api/upload/image                → multipart image upload → { url, path }
GET    /api/images                      → list all images { filename, path, url, size, usedIn[] }
DELETE /api/images/:filename            → delete image (editors; 409 if referenced)
GET    /images/:filename                → serve image file (Cache-Control: immutable)
GET    /api/search?q=<query>            → search results
WS     /ws                              → WebSocket connection
```

---

## 15. WebSocket Connection Lifecycle

1. Client connects to `/ws`.
2. Server reads auth header from the WS upgrade request → validates.
3. Client sends `hello { pageId, userId }`.
4. Server adds client to presence map for that `pageId`.
5. Server broadcasts `presence_update` to all clients watching that `pageId`.
6. On disconnect:
    - Remove from presence map.
    - Release any edit-lock held by this client.
    - Flush dirty in-memory content for this client → commit + push.
    - Broadcast `presence_update` + `page_changed` as needed.

---

## 16. Source Code Structure

```
src/
├── index.ts              ← Bun HTTP + WS server entry
├── frontend.tsx          ← React SPA entry
├── index.html
├── index.css
├── App.tsx               ← SPA routing (react-router-dom)
├── server/
│   ├── api.ts            ← REST route handlers
│   ├── auth.ts           ← header parsing, JWT decode, permission check
│   ├── config.ts         ← env var loading + validation
│   ├── filestore.ts      ← in-memory file state, dirty tracking
│   ├── git.ts            ← commit, push, pull, rebase
│   ├── search.ts         ← MiniSearch index management
│   └── websocket.ts      ← WS handler, presence, edit-lock
├── components/
│   ├── dialogs/
│   │   └── NewPageDialog.tsx
│   ├── editor/
│   │   ├── MarkdownEditor.tsx   ← custom split-pane markdown editor
│   │   ├── MarkdownViewer.tsx   ← streamdown → direct DOM render
│   │   ├── SlideViewer.tsx      ← client-side slide viewer + PDF export
│   │   ├── rehypeEmojiPlugin.ts
│   │   └── rehypeHeadingIdsPlugin.ts
│   ├── layout/
│   │   ├── AppShell.tsx
│   │   ├── PageInfoPanel.tsx
│   │   ├── Sidebar.tsx
│   │   └── TopBar.tsx
│   ├── search/
│   │   └── SearchPalette.tsx
│   └── ui/                      ← shadcn/ui components + custom
│       ├── EmojiIcon.tsx
│       ├── EmojiPicker.tsx
│       ├── EmojiPickerPopover.tsx
│       ├── PageMenuItems.tsx     ← shared page-action menu items (dropdown + context)
│       └── ... (shadcn primitives)
├── hooks/
│   └── usePageActions.tsx       ← move/delete dialog orchestration
├── lib/
│   ├── avatar.ts
│   ├── filetypes.ts
│   ├── types.ts
│   └── utils.ts
├── pages/
│   ├── FilePage.tsx             ← doc / slides / code page
│   ├── WelcomePage.tsx
│   └── NotFound.tsx
└── store/
    ├── theme.tsx
    ├── user.tsx
    └── ws.ts                    ← WebSocket client + reactive state
styles/
└── globals.css
compose.yaml
package.json
tsconfig.json
SPEC.md
```

---

## 17. Implementation Phases

### Phase 1 — Foundation ✅ Complete

- [x] Bun server: HTTP routing, static serving, auth middleware
- [x] Git operations: read tree, read file, commit, push, pull, rebase
- [x] In-memory filestore + dirty tracking
- [x] WebSocket: connect, hello, presence, disconnect/flush
- [x] REST API: `/api/me`, `/api/tree`, `/api/file`
- [x] React SPA: basic routing + AppShell

### Phase 2 — Editor Core ✅ Complete

- [x] Custom split-pane editor (textarea + Streamdown live preview, toolbar: heading selector / Bold / Italic / Blockquote / Cheatsheet, Ctrl+S save)
- [x] `streamdown` read-only view (direct render, rehype-harden XSS protection)
- [x] Save flow: Ctrl+S, auto-save debounce, save mutex (no 409 race)
- [x] Edit-lock via WebSocket
- [x] Dark mode (Tailwind + iframe sync)

### Phase 3 — UI Polish 🔄 In Progress

- [x] Sidebar auto-generated from `/api/tree` (Confluence-style hierarchy, no folder UI)
- [x] Virtual ghost pages for dirs without a matching `.md`
- [x] Page icons: FluentColor system icons + FluentEmoji page icons (`EmojiIcon`)
- [x] Presence editing dot in sidebar (amber animated dot)
- [x] Search: MiniSearch index + Ctrl+K palette
- [x] Toast notifications (sonner)
- [x] Create page (modal, slug auto-derive, type: markdown / slides)
- [x] Create subpage / Create page alongside (right-click context menu)
- [x] Delete page (confirmation modal in DocPage)
- [x] Move / Rename page (sidebar context menu + DocPage overflow menu)
- [x] Duplicate page (sidebar context menu + DocPage overflow menu)
- [x] Client-side PDF export for markdown pages (html2canvas-pro + jspdf, via page menu in view mode)
- [x] Presence avatars in page header (`AvatarGroup`)
- [x] Drag-and-drop image upload + toolbar Image button (SHA-256 naming, `/images/` serving)
- [x] Image library page (`/images`, `/images/:filename`) with thumbnail grid, detail panel, and delete guard
- [x] Resizable sidebar width (persisted in `localStorage`)

### Phase 4 — Slides & Code

- [x] Slide viewer (scroll/paginate/spotlight modes, fullscreen, arrow-key navigation, standalone presentation route)
- [x] Client-side PDF export for slide decks (html2canvas-pro + jspdf, via SlideViewer controls bar)
- [x] Code file editor (CodeMirror + language packs, `@uiw/codemirror-extensions-langs`, `@uiw/codemirror-theme-github`)
