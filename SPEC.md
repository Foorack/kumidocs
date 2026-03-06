# KumiDocs — Specification v0.3

> Last updated: 2026-03-05 · Status: **FINALIZED — ready for implementation**

---

## 1. Overview

KumiDocs is a developer-focused wiki/docs platform inspired by **Docmost** (visual layout reference — sidebar-left, slim header, content-right), with zero database. All content is stored exclusively in a single Git repository.

- **One instance = one Git repo**
- Target users: developers, 3–20 concurrent users
- Primary content: Markdown pages (YAML frontmatter)
- Secondary content: Marp slide decks (`marp: true` frontmatter)
- Also supported: Code files (viewed/edited with syntax highlighting)

---

## 2. Tech Stack

| Layer           | Choice                                                 | Notes                                                                                                                                                                                    |
| --------------- | ------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Runtime         | **Bun**                                                | Server + build + git                                                                                                                                                                     |
| Frontend        | **React + TypeScript**                                 | SPA                                                                                                                                                                                      |
| Styling         | **Tailwind CSS + shadcn/ui + @tailwindcss/typography** |                                                                                                                                                                                          |
| Icons           | **@fluentui/react-icons**                              | No other Fluent/MS components                                                                                                                                                            |
| Markdown editor | **ByteMD** (`@bytemd/react`)                           | Split-pane, React-native, remark/rehype pipeline                                                                                                                                         |
| Markdown viewer | **streamdown**                                         | React component on remark/rehype. Renders md → React DOM for read-only view. Mounted inside a sandboxed same-origin `<iframe>` for CSS isolation. Built-in `rehype-harden` sanitisation. |
| Slides          | **@marp-team/marp-core**                               | Server-side render → HTML                                                                                                                                                                |
| Code editor     | **@uiw/react-codemirror**                              | With language packs                                                                                                                                                                      |
| Search          | **MiniSearch**                                         | In-memory, full-text, fuzzy, fast                                                                                                                                                        |
| Real-time       | **WebSocket** (Bun native)                             | Presence + live reload                                                                                                                                                                   |
| Deployment      | **Bun process + Docker volume**                        | Git repo mounted into container                                                                                                                                                          |

### Why ByteMD for editing?

ByteMD is a production-grade split-pane markdown editor (used at Juejin/ByteDance), actively maintained, with a plugin system covering GFM, KaTeX math, Mermaid, syntax highlighting, and more. It handles both editing and live preview internally. `@docmd/parser` is only used in the **read-only view mode** (not inside the editor).

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

Any `.md` with `marp: true` frontmatter is a slide deck.

### 4.1 Page Frontmatter

```yaml
---
emoji: 📄 # sidebar/tab icon (optional, defaults by type — see §6.2)
title: My Page # display title (optional, overrides filename-derived title)
description: ... # subtitle shown in search results
marp: true # marks file as a Marp slide deck
---
```

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
  (`max.faxalv@sony.com` → `Max Faxalv`, `max@foorack.com` → `Max`)
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
/slides/<path>     → Marp presentation for <path>.md
/code/<path>       → code file viewer/editor for <path>
```

### 6.2 Sidebar Navigation

- Sidebar is **auto-generated from the full file tree** (`/api/tree`) on startup and after every commit.
- No manual `_sidebar.md` curation — every file in the repo appears automatically.
- **Confluence-style hierarchy**: filesystem folders are never rendered as folders in the UI. A directory `foo/` and its sibling `foo.md` are merged into a single expandable page whose children are the files inside `foo/`.
- If a directory exists but `<dirname>.md` does not, a **virtual ghost page** is shown (italic, muted) — clicking it opens DocPage which shows "This page doesn't exist yet — Create it?".
- Sort order per level: `README.md` first, then alphabetically by page title.
- `_sidebar.md` (legacy file) is hidden. `.kumidocs.json` is always hidden.
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

### 7.1 Edit Mode — ByteMD

- Split-pane: markdown source left, live preview right (toggle to full-width editor or full-width preview).
- ByteMD plugin set:
    - `@bytemd/plugin-gfm` — tables, task lists, strikethrough
    - `@bytemd/plugin-highlight` — syntax highlighting in code blocks
    - `@bytemd/plugin-math-ssr` — KaTeX math
    - `@bytemd/plugin-mermaid` — diagrams
    - `@bytemd/plugin-frontmatter` — YAML frontmatter awareness
- Keyboard shortcut: **Ctrl+S** → save.
- Default page mode is **view**. User clicks "Edit" to enter edit mode (subject to edit-lock and editor permission).

### 7.2 View Mode — streamdown

- Read-only. Default for everyone on page load.
- `streamdown` renders markdown → React DOM via a remark/rehype pipeline.
- Rendered inside a same-origin `<iframe sandbox="allow-same-origin allow-scripts">` whose DOM is initialised with the host app's compiled Tailwind styles injected as a `<style>` tag. Provides CSS isolation — host layout styles cannot bleed in or out.
- XSS protection via Streamdown's built-in `rehype-harden` (strips all event handlers, dangerous attributes, and unsafe HTML before it reaches the DOM).
- Dark mode class synced into the iframe's `<html>` element to match app theme.
- `@tailwindcss/typography` (`prose prose-sm dark:prose-invert`) provides full typographic styles (headings, lists, code, tables, blockquotes).

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

Rename modal → `git mv` → updates `_sidebar.md` references → single commit.

### 7.8 Image Upload (drag-and-drop)

1. Drop image onto editor area.
2. Server computes SHA256 of file content.
3. Writes to `images/<sha256>.<ext>` in repo.
4. Commits the image file.
5. Inserts `![alt](images/<sha256>.<ext>)` at cursor.

- Max size: **25 MB**. Reject with user-visible toast if exceeded.
- Accepted types: `jpg`, `png`, `gif`, `webp`, `svg`.

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

- `@uiw/react-codemirror` with appropriate language extension.
- Same edit-lock, save, and commit flow as markdown files.
- No WYSIWYG toolbar — raw code only.
- Features: line numbers, word-wrap toggle, copy-to-clipboard.
- No LSP / autocomplete in v1.

---

## 11. Marp Slides

### 11.1 Detection

- File has `marp: true` in YAML frontmatter.
- Sidebar shows `FluentColorSlideTextSparkle` icon.
- Route: `/slides/<path>` for viewer, `/p/<path>` still works (shows editor).

### 11.2 Slide Viewer

- Server-side: `@marp-team/marp-core` renders `.md` → HTML.
- Rendered HTML served inside iframe (full-screen friendly).
- Navigation: prev/next (arrow keys + on-screen buttons), fullscreen via browser Fullscreen API.
- **"Present"** button in page header → enter fullscreen immediately.

### 11.3 Editing Slides

- Same ByteMD editor as markdown.
- Preview pane shows rendered slide output via Marp.

### 11.4 Export

- PDF export via `@marp-team/marp-core` + Playwright (headless Chromium).
- "Export PDF" button shown only if Chromium is available in container; hidden otherwise.
- PPTX export: deferred to v2.

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

> **NEVER render emoji as raw text or `<span>` elements. ALWAYS use `<KumiIcon emoji="..." size={N} />`.**

`KumiIcon` (`src/components/ui/KumiIcon.tsx`) is the single source of truth for all emoji and icon rendering:

- **`emoji` prop** → renders via `@lobehub/fluent-emoji` (crisp 3D Fluent style at any size)
- **`fileType` prop** → maps to the correct Fluent Color system icon
- **`icon` prop** → renders a raw Fluent React Icon component

Raw emoji in JSX (`🌙`, `☀️`, etc.) render as OS-font bitmaps — blurry, inconsistent across platforms. All emojis, including UI chrome (theme toggle, status indicators, etc.), must go through `KumiIcon`.

### 13.1 Overall Layout (Docmost-inspired)

```
┌──────────────────────────────────────────────────────────┐
│  [Logo/Name]   [Search Ctrl+K]            [User avatar]  │  ← slim top bar
├──────────────┬───────────────────────────────────────────┤
│              │  [emoji] Page Title    [Edit] [···] [⬤⬤]  │  ← page header
│   _sidebar   ├───────────────────────────────────────────┤
│  navigation  │                                           │
│   (left)     │   page content                            │
│              │   (view:  streamdown → sandboxed iframe)          │
│              │   (edit:  ByteMD split-pane)              │
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
- Right side: viewer `AvatarGroup`, "Edit"/"Done" button, "Present" (slides only), "···" overflow menu.
- Overflow menu: Delete page, Rename/Move, Copy link.

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
GET    /api/search?q=<query>            → search results
GET    /api/slides/render?path=<path>   → Marp-rendered HTML
GET    /api/slides/export?path=<path>   → PDF download (if Chromium available)
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
├── server/
│   ├── index.ts          ← Bun HTTP + WS server entry
│   ├── router.ts         ← request routing
│   ├── auth.ts           ← header parsing, JWT decode, permission check
│   ├── git.ts            ← commit, push, pull, rebase
│   ├── filestore.ts      ← in-memory file state, dirty tracking
│   ├── search.ts         ← MiniSearch index management
│   ├── websocket.ts      ← WS handler, presence, edit-lock
│   ├── slides.ts         ← Marp rendering + PDF export
│   └── api/
│       ├── files.ts
│       ├── search.ts
│       ├── upload.ts
│       └── slides.ts
├── client/
│   ├── main.tsx
│   ├── App.tsx
│   ├── router.tsx            ← SPA routing
│   ├── store/
│   │   ├── ws.ts             ← WebSocket client + reactive state
│   │   ├── user.ts           ← current user
│   │   └── theme.ts          ← dark mode
│   ├── components/
│   │   ├── layout/
│   │   │   ├── AppShell.tsx
│   │   │   ├── Sidebar.tsx
│   │   │   ├── TopBar.tsx
│   │   │   └── PageHeader.tsx
│   │   ├── editor/
│   │   │   ├── ByteMDEditor.tsx    ← ByteMD markdown editor
│   │   │   ├── DocViewer.tsx       ← @docmd/parser → iframe view
│   │   │   └── CodeEditor.tsx      ← @uiw/react-codemirror
│   │   ├── slides/
│   │   │   └── SlideViewer.tsx
│   │   ├── search/
│   │   │   └── SearchPalette.tsx
│   │   └── ui/                     ← shadcn/ui components
│   └── pages/
│       ├── DocPage.tsx
│       ├── CodePage.tsx
│       ├── SlidesPage.tsx
│       └── NotFound.tsx
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

- [x] ByteMD editor with plugin set (GFM, highlight, math, mermaid, frontmatter)
- [x] `streamdown` read-only view (sandboxed iframe, dark mode sync, rehype-harden XSS protection)
- [x] Save flow: Ctrl+S, auto-save debounce, save mutex (no 409 race)
- [x] Edit-lock via WebSocket
- [x] Dark mode (Tailwind + iframe sync)

### Phase 3 — UI Polish 🔄 In Progress

- [x] Sidebar auto-generated from `/api/tree` (Confluence-style hierarchy, no folder UI)
- [x] Virtual ghost pages for dirs without a matching `.md`
- [x] Page icons: FluentColor system icons + FluentEmoji page icons (`KumiIcon`)
- [x] Presence editing dot in sidebar (amber animated dot)
- [x] Search: MiniSearch index + Ctrl+K palette
- [x] Toast notifications (sonner)
- [x] Create page (modal, slug auto-derive, type: markdown / slides)
- [x] Create subpage / Create page alongside (right-click context menu)
- [x] Delete page (confirmation modal in DocPage)
- [x] Move / Rename page (sidebar context menu + DocPage overflow menu)
- [ ] Presence avatars in page header (`AvatarGroup`)
- [ ] Drag-and-drop image upload
- [ ] Resizable sidebar width (persisted in `localStorage`)

### Phase 4 — Slides & Code

- [ ] Marp server-side render
- [ ] Slide viewer (fullscreen, navigation, Present button)
- [ ] Code file editor (CodeMirror + language packs)
- [ ] Marp PDF export (Playwright, Chromium-gated)
