---
emoji: 🚀
---

# Getting Started

## Requirements

- [Bun](https://bun.sh) v1.0 or later
- A Git repository (can be empty)

## One-command Quickstart

The fastest way to run KumiDocs is with `bunx`:

```bash
KUMIDOCS_REPO_PATH=/path/to/your/repo bunx kumidocs
```

KumiDocs starts on port `5864` by default. Open [http://localhost:5864](http://localhost:5864).

> **Auth header required**: In production, KumiDocs reads the user identity from the `X-Auth-Request-User` header (set by your SSO proxy). In local development without a proxy you can pass any email directly.

## Running with Docker Compose

The recommended production setup uses Docker Compose with an OAuth2 SSO proxy in front:

```yaml
# compose.yaml
services:
  kumidocs:
    image: oven/bun:latest
    working_dir: /app
    command: bunx kumidocs
    environment:
      KUMIDOCS_REPO_PATH: /repo
    volumes:
      - /path/to/your/repo:/repo
    ports:
      - "5864:5864"
```

For SSO (OAuth2 proxy) configuration, see [[Configuration]].

See [[Collaboration]] for details on real-time editing and presence.

## Building from Source

```bash
git clone https://github.com/foorack/kumidocs
cd kumidocs
bun install
bun run dev     # development server with hot reload
bun run build   # production build
```

## Your First Page

1. Start KumiDocs pointing at a Git repo.
2. Open [http://localhost:5864](http://localhost:5864). You'll see `README.md` as the home page.
3. Click **Edit** to enter the split-pane editor.
4. Make changes, then press **Ctrl+S** to save. KumiDocs commits and pushes automatically.

### Creating Pages

- Click **+** in the sidebar header to create a top-level page.
- Right-click any page in the sidebar for options: **New Subpage**, **New Alongside**, **Move/Rename**, **Delete**.
- New pages get a slug derived from the title you enter. You can edit the slug before confirming.

### Page Titles

The page title is the first `# ` heading in the file body. If there is no `# ` heading, KumiDocs falls back to the filename (hyphens and underscores replaced with spaces).

## Next Steps

| What                         | Where                               |
| ---------------------------- | ----------------------------------- |
| Markdown syntax reference    | [Writing Pages](docs/writing)       |
| Build a slide deck           | [Slide Decks](docs/slides)          |
| Configure editors and themes | [Configuration](docs/configuration) |
| Real-time collaboration      | [Collaboration](docs/collaboration) |
