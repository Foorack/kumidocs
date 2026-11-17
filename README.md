# KumiDocs

A wiki and docs platform for small dev teams. No database: all content is stored in Git.

## Try it now

```bash
cd /any/git/repo
bunx kumidocs
```

That's it. Open [http://localhost:5864](http://localhost:5864).

KumiDocs serves the current directory as its content store. Every save becomes a git commit. No setup, no config files required.

> **No Bun?** Install it with `curl -fsSL https://bun.sh/install | bash`

KumiDocs runs on Bun only. The server, the build, the unit tests and the browser suite all run in Bun, and no Node.js code path exists or is supported. `bun` is the one runtime you need.

## Features

- **Markdown editor**: live split-pane, frontmatter, full history
- **Slide decks**: set `slides: true` in frontmatter; scroll, paginate, spotlight, fullscreen
- **Code files**: syntax highlighting via CodeMirror with language auto-detection
- **Full-text search**: fuzzy, Ctrl+K palette
- **Real-time presence**: edit lock, viewer avatars, live reload via WebSocket
- **Image library**: drag-and-drop upload, usage tracking, safe delete
- **PDF export**: pages (A4) and slide decks (landscape)
- **SSO**: any reverse proxy that forwards an email header (oauth2-proxy, Authelia, etc.)

## Options

Point KumiDocs at a different repo or change the port:

```bash
bunx kumidocs --repo /path/to/repo --port 8080
```

All options are also available as environment variables:

| Flag                 | Env variable                | Default               | Description                                        |
| -------------------- | --------------------------- | --------------------- | -------------------------------------------------- |
| `--repo`             | `KUMIDOCS_REPO_PATH`        | `cwd`                 | Path to the git repository                         |
| `--port`, `-p`       | `KUMIDOCS_PORT`             | `5864`                | HTTP/WS listen port                                |
| `--auth-header`      | `KUMIDOCS_AUTH_HEADER`      | `X-Auth-Request-User` | Header carrying the user identity (email or JWT)   |
| `--auto-save-delay`  | `KUMIDOCS_AUTO_SAVE_DELAY`  | `5000`                | Auto-save debounce in ms                           |
| `--pull-interval`    | `KUMIDOCS_PULL_INTERVAL`    | `60000`               | Background `git pull --rebase` interval in ms      |
| `--rate-limit`       | `KUMIDOCS_RATE_LIMIT`       | `30/10000`            | Write requests allowed per user: `count/window_ms` |
| `--readonly`         | `KUMIDOCS_READONLY`         | `false`               | Prevent all file edits and git changes             |
| `--disable-gravatar` | `KUMIDOCS_DISABLE_GRAVATAR` | `false`               | Never contact Gravatar; avatars show initials only |
| `--jwks-base64`      | `KUMIDOCS_JWKS_BASE64`      | _unset_               | Base64 JWKS for verifying JWTs in the auth header  |

## Production (Docker Compose)

Copy `compose.yaml` to your server and set your OAuth credentials:

```bash
SSO_PROXY_CLIENT_ID=your_client_id
SSO_PROXY_CLIENT_SECRET=your_client_secret
SSO_PROXY_PROVIDER=github            # github | google | oidc | ...
SSO_PROXY_REDIRECT_URL=https://docs.example.com/oauth2/callback
SSO_PROXY_COOKIE_DOMAIN=example.com
SSO_PROXY_COOKIE_SECURE=true
```

Mount your content repo at `/repo`:

```yaml
volumes:
  - /path/to/your/content-repo:/repo
```

Then:

```bash
docker compose up -d
```

The stack runs KumiDocs on port `5864` (internal) behind oauth2-proxy on port `5865` (public).

## Repository layout

KumiDocs reads and writes directly to the git repo it's pointed at:

```
README.md              # home page
.kumidocs.json         # instance config (optional)
images/                # uploaded images
**/*.md                # doc pages and slide decks
**/*.{ts,js,...}       # code files (read-only viewer)
```

### `.kumidocs.json` (optional)

```json
{
  "instanceName": "MyDocs",
  "editors": ["alice@example.com", "bob@example.com"],
  "slideThemes": {
    "my-corp": {
      "bg": "#1a2744",
      "fg": "#e8edf8"
    }
  }
}
```

If `editors` is set, only those users can write. Everyone else is read-only. Omit the field to let all authenticated users edit.

### Page frontmatter

```yaml
---
emoji: 📄
description: Shown in search results
slides: true # treat as slide deck
theme: corporate # built-in or custom theme name
paginate: true # show slide N/total badge
---
```

## Building from source

```bash
bun install
bun run build   # outputs to dist/
bun start       # runs the production build
```
