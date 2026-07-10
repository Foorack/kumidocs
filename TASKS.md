# Tasks

---

### 1. Bookmark Tickets

A user can bookmark a ticket (like starring / watching). Bookmarking is a per-user toggle: each user who bookmarks adds their email to a Set on the ticket. Unlike golden, bookmarking does NOT create timeline entries. Users must enter Edit mode and Save for the bookmark to persist.

**Approach**:

- Add `bookmarks?: string[]` field to `TicketData` / `TicketYamlData` in `src/lib/board.ts`
- Update serialization (`ticketToYaml`) to write `bookmarks:` as a YAML array
- In `TicketSidebar` (`src/pages/ticket/ticket-sidebar.tsx`), add a "Bookmark" toggle button below golden (styled like golden, using a bookmark icon from `@fluentui/react-icons`)
- The toggle adds/removes the current user's email from the local bookmarks array
- `canSave` must detect bookmark changes
- On save, serialize the updated bookmarks array
- On reload, parse bookmarks from the saved YAML

**Files to touch**:

- `src/lib/board.ts` -- add `bookmarks` to types + serialization
- `src/pages/ticket/ticket-sidebar.tsx` -- add bookmark toggle
- `src/pages/ticket/ticket-dialog.tsx` -- wire bookmark state, canSave check, save logic, reload logic

---

### 2. Homeboard (`/b/`)

The `/b/` route currently shows "Boards - coming soon". Replace it with a homeboard: a board-like view with built-in columns that aggregate tickets across ALL boards.

**Columns** (static, non-configurable):

| Column         | Filter logic                                   |
| -------------- | ---------------------------------------------- |
| Created by me  | `ticket.reporter === currentUserEmail`         |
| Assigned to me | `ticket.assignee === currentUserEmail`         |
| Bookmarked     | `ticket.bookmarks?.includes(currentUserEmail)` |

**Approach**:

- Rewrite `src/pages/board-list/page.tsx` to render a board-like kanban with these three columns
- Fetch all tickets from all boards by scanning the repo tree for `.yaml` files, parsing each
- The columns should look and behave like `BoardColumnView` from `src/pages/board/column.tsx` -- draggable cards (though dragging between homeboard columns should do nothing or be cosmetic-only since these aren't real columns)
- Cards link to their original board page (`/b/:slug/:ticketId`)
- Show the board name/icon on each card so users know which board the ticket belongs to

**Files to touch**:

- `src/pages/board-list/page.tsx` -- complete rewrite
- Possibly extract shared card rendering from `src/pages/board/card.tsx` if needed

---

### 3. User List (Scraped from Tickets)

There is no users endpoint. Instead, derive a list of known users by scanning all ticket YAML files for emails in reporter, assignee, timeline entries, bookmarkers, comments, and approvals. Deduplicate and sort.

This user list is used for:

- A dropdown suggestion list in the "Assign to" field (text-search-dropdown: type to filter)
- Similar for "Reporter" / "Created by" filter dropdowns

**Approach**:

- Create `src/lib/user-list.ts` with a function `scrapeUsers(tickets: TicketData[]): string[]` that extracts all unique emails from the ticket data
- The function should also return a `Map<email, displayName>` if display names can be derived from timeline comments (first seen name)
- Create a reusable `UserSearchDropdown` component (`src/components/ui/user-search-dropdown.tsx`) that:
  - Shows an `<Input>` field
  - As you type, filters the user list to matching emails/names
  - Shows results in a dropdown list below the input
  - Clicking a result fills the input
- Replace the plain `<Input>` in the ticket dialog's assignee field with this dropdown

**Files to touch**:

- New: `src/lib/user-list.ts`
- New: `src/components/ui/user-search-dropdown.tsx`
- `src/pages/ticket/ticket-dialog.tsx` -- replace assignee Input with UserSearchDropdown

---

### 4. Sidebar Ticket Filtering

Add filtering controls to the board sidebar so users can narrow down the ticket list.

**Filters**:

| Filter      | Type     | Options                                             |
| ----------- | -------- | --------------------------------------------------- |
| Status      | Toggle   | All / Open (not `final` column)                     |
| Created     | Sort     | Newest first / Oldest first                         |
| Updated     | Sort     | Newest first / Oldest first                         |
| Created by  | Dropdown | List of unique reporter emails from visible tickets |
| Assigned to | Dropdown | List of unique assignee emails from visible tickets |

**Approach**:

- Add filter state to `src/pages/board/page.tsx` (or a dedicated hook)
- The sidebar area already exists in `src/pages/board/page.tsx` (the column headers area)
- Add filter UI in a collapsible panel above/beside the columns
- Sorting and filtering should operate on the in-memory ticket list, not re-fetch
- Use the user list from Task 3 for the creator/assignee dropdowns

**Files to touch**:

- `src/pages/board/page.tsx` -- add filter state, UI, and filtering/sorting logic
- Possibly new: `src/pages/board/filter-bar.tsx` if the filter UI is substantial enough to extract

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

The search palette (`Ctrl+K`) now indexes both `.md` pages and `.yaml` ticket files. Ticket results appear in a separate "Tickets" group. The ticket ID field gets a higher search boost so searching for e.g. "42" finds ticket #42 quickly.

**Implementation**: dual MiniSearch indexes in `src/server/search.ts`, extended `SearchResult` type with `boardSlug`/`ticketId`, split rendering in search palette.

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
