---
emoji: 👥
---

# Collaboration

KumiDocs supports real-time collaboration for up to ~20 concurrent users. All coordination happens over a persistent WebSocket connection with no polling.

See [[Getting Started]] for installation instructions and [[Writing Pages]] for the Markdown editor reference.

## Edit Locking

Only one user can edit a page at a time. When you click **Edit**:

1. KumiDocs acquires an edit lock on that page.
2. Other users see a banner: _"Being edited by Alice"_.
3. The page icon in the sidebar gets an animated amber dot.

The lock is released when you click **Done**, navigate away, or disconnect.

If your browser closes unexpectedly, the server auto-releases the lock after 90 seconds of silence (no heartbeat).

## Presence

Sidebar and page header show avatar stacks of who is viewing each page.

- **Sidebar**: small avatars on the right of each page name.
- **Page header**: avatar group showing all viewers of the current page.

Avatars use a colour derived from the user's name (djb2 hash → HSL) with Gravatar as the primary source and initials as fallback. The server fetches Gravatar images on the browser's behalf and remembers misses for an hour. Set `KUMIDOCS_DISABLE_GRAVATAR=true` to never contact Gravatar, for example on a network without internet access.

## Live Reload

When another user saves a page you have open:

| Your state         | Behaviour                                           |
| ------------------ | --------------------------------------------------- |
| No unsaved changes | Silent reload: content updates automatically        |
| Unsaved changes    | Conflict banner appears; your changes are preserved |

The conflict banner lets you decide: discard your changes and reload, or continue editing and resolve the conflict manually.

### Page Deleted

If another user deletes a page you have open, you are redirected to the home page and shown a toast notification.

### Page Created

New pages appear in the sidebar immediately when any user creates them.

## Heartbeat

The client sends a heartbeat every 30 seconds. If the server doesn't receive a heartbeat for 90 seconds it removes the user's presence and releases any edit locks they held.

On reconnect, the client re-registers presence automatically.

## Git Operations

Every save immediately pushes to the Git remote.

| Trigger                  | Commit message                                            |
| ------------------------ | --------------------------------------------------------- |
| Ctrl+S                   | `docs(path/to/file.md): save by Alice`                    |
| Auto-save (5 s debounce) | `docs(path/to/file.md): auto-save by Alice`               |
| WebSocket disconnect     | `docs(path/to/file.md): auto-save on disconnect by Alice` |

### Push Conflict Resolution

If `git push` fails (another user pushed first), KumiDocs automatically:

1. Runs `git fetch`
2. Rebases local changes: `git rebase origin/<branch>`
3. If rebase succeeds: force-pushes with lease
4. If rebase fails: aborts the rebase, resets in-memory state to remote HEAD, and sends `save_conflict_lost`. You see an error toast and the page reloads to the latest remote version

This is a last resort. In practice, the edit lock prevents two users from writing the same file simultaneously.

### Background Pull

Every 60 seconds (configurable via `KUMIDOCS_PULL_INTERVAL`), KumiDocs:

1. Runs `git fetch`
2. If the working tree is clean, runs `git rebase`
3. Reloads any changed files into memory
4. Updates the MiniSearch index
5. Broadcasts `page_changed` / `page_created` / `page_deleted` events to connected clients

This keeps all clients in sync with changes made outside KumiDocs (e.g. direct Git pushes, CI commits).

## Dirty State on Shutdown

KumiDocs holds unsaved changes in memory. On `SIGTERM` or `SIGINT` (graceful shutdown):

1. All dirty pages are committed and pushed
2. The process exits

If the process is killed with `SIGKILL`, dirty state is lost.

## WebSocket Protocol

For reference, the full WebSocket message protocol:

### Client → Server

| Message         | Payload              | Description               |
| --------------- | -------------------- | ------------------------- |
| `hello`         | `{ pageId, userId }` | Register presence on page |
| `editing_start` | `{ pageId }`         | Acquire edit lock         |
| `editing_stop`  | `{ pageId }`         | Release edit lock         |
| `heartbeat`     | _(none)_             | Keep-alive                |

### Server → Client

| Message              | Payload                                           | Description                       |
| -------------------- | ------------------------------------------------- | --------------------------------- |
| `presence_update`    | `{ pageId, viewers[], editor }`                   | Presence changed on a page        |
| `page_changed`       | `{ pageId, commitSha, changedBy, changedByName }` | Page saved by another user        |
| `page_deleted`       | `{ pageId }`                                      | Page deleted                      |
| `page_created`       | `{ pageId, path }`                                | New page created                  |
| `save_conflict_lost` | `{ pageId, message }`                             | Rebase failed; local changes lost |
| `heartbeat_ack`      | _(none)_                                          | Heartbeat acknowledged            |

## Limits

KumiDocs is designed for teams of **3 to 20 concurrent users**. It is not designed for:

- Public wikis with hundreds of simultaneous viewers
- High-frequency concurrent edits to the same file
- Multi-branch workflows (all edits go to the checked-out branch)
