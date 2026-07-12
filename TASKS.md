# Tasks

---

### 1. Bookmark Tickets (DONE)

---

### 2. Homeboard (`/b/`) (DONE)

---

### 3. User List (DONE)

---

### 4. Sidebar Ticket Filtering (DONE)

---

### 5. Git Blame for Docs

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

### 6. Cross-Board Ticket Search (DONE)

---

### 7. Ticket Mentions / Activity Digest

When someone mentions a user in a comment (`@email`) or assigns a ticket to them, there is no way for that user to know. A simple notification system would fill the gap.

**Approach** (lightweight, no push):

- On the homeboard or a new `/notifications` page, show a list of tickets where the current user was recently mentioned or assigned
- Parse ticket comments for `@email` patterns at save time
- Store a `mentions` map on the ticket: `{ userEmail: timestamp[] }` -- updated whenever a comment containing `@userEmail` is saved
- The homeboard or a badge in the top bar shows the count of unread mentions/assignments
- "Read" state can be last-visit timestamp stored in localStorage

**Files to touch**:

- `src/lib/board.ts` -- add `mentions` field to `TicketData`
- `src/pages/board-list/page.tsx` or `src/components/layout/top-bar.tsx` -- notification indicator
- New: hook `src/hooks/use-mentions.ts` to aggregate mentions for the current user

---

### 8. CSV Export of Board

There is already a CSV utility at `src/lib/csv.ts`. Add a way to export all tickets in a board (or the filtered view) as a CSV file.

**Approach**:

- Add an "Export CSV" button to the board page header
- Generate CSV from the current (filtered) ticket list with columns: ID, Title, Column, Assignee, Reporter, Created, Updated, Golden, Bookmarks
- Trigger a file download via `URL.createObjectURL` + temporary `<a>` click

**Files to touch**:

- `src/pages/board/page.tsx` -- add export button + CSV generation logic
