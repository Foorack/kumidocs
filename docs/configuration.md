---
emoji: ⚙️
---

# Configuration

KumiDocs is configured through environment variables and a `.kumidocs.json` file in your repo root.

## Environment Variables

| Variable                    | Default               | Description                                        |
| --------------------------- | --------------------- | -------------------------------------------------- |
| `KUMIDOCS_REPO_PATH`        | current directory     | Path to the git repository                         |
| `KUMIDOCS_PORT`             | `5864`                | HTTP/WS listen port                                |
| `KUMIDOCS_HOST`             | `0.0.0.0`             | Address to listen on (0.0.0.0 = every interface)   |
| `KUMIDOCS_AUTH_HEADER`      | `X-Auth-Request-User` | Header carrying the user identity (email or JWT)   |
| `KUMIDOCS_AUTO_SAVE_DELAY`  | `5000`                | Auto-save debounce in ms                           |
| `KUMIDOCS_PULL_INTERVAL`    | `60000`               | Background `git pull --rebase` interval in ms      |
| `KUMIDOCS_RATE_LIMIT`       | `30/10000`            | Write requests allowed per user: `count/window_ms` |
| `KUMIDOCS_READONLY`         | `false`               | Prevent all file edits and git changes             |
| `KUMIDOCS_DISABLE_GRAVATAR` | `false`               | Never contact Gravatar; avatars show initials only |
| `KUMIDOCS_JWKS_BASE64`      | _unset_               | Base64 JWKS for verifying JWTs in the auth header  |

Every variable also has a command-line flag (run `bunx kumidocs --help`). Unknown flags are rejected, so a typo cannot silently change behaviour. The instance name is not an environment variable; set `instanceName` in `.kumidocs.json`.

### KUMIDOCS_AUTH_HEADER

KumiDocs reads the user identity from this HTTP header on every request. The value can be:

- A plain email address: `alice@example.com`
- A JWT token with an `email` or `preferred_username` claim

If the header is missing or unparseable, KumiDocs returns HTTP 401.

In production, set this to whatever header your SSO proxy injects (e.g. `X-Auth-Request-User` for oauth2-proxy, `X-Forwarded-Email` for Authelia).

KumiDocs trusts this header, so the listen port must only be reachable through the proxy. Bind it to loopback with `KUMIDOCS_HOST=127.0.0.1` and publish only the proxy port. Anyone who can reach the app port directly can name any identity, including one from `editors`.

Set `KUMIDOCS_JWKS_BASE64` to require signed identities. With a JWKS configured, a bare email in the header is rejected and the `kumidocs_email` cookie is ignored; the only accepted value is a JWT that verifies against the key set.

See [[Getting Started]] for the Docker Compose SSO setup example.

## .kumidocs.json

Place this file in the root of your repository. KumiDocs re-reads it after every background pull; changes take effect without restarting.

```json
{
  "instanceName": "My Team Wiki",
  "editors": ["alice@example.com", "bob@example.com"],
  "slideThemes": {
    "my-brand": {
      "bg": "#0f172a",
      "fg": "#f8fafc"
    }
  }
}
```

| Key            | Type     | Description                                                                    |
| -------------- | -------- | ------------------------------------------------------------------------------ |
| `instanceName` | string   | Instance display name shown in the top bar                                     |
| `editors`      | string[] | Email addresses allowed to edit. All authenticated users can view.             |
| `slideThemes`  | object   | Custom slide theme definitions. See [Custom Themes](docs/slides/custom-themes) |

### editors

Any authenticated user can **view** pages. Only users listed in `editors` can **edit** pages, upload images, create pages, delete pages, or move pages.

```json
{
  "editors": ["alice@example.com", "bob@example.com"]
}
```

To allow all authenticated users to edit, set `editors` to an empty array `[]` or omit the key entirely.

## Docker Compose

### Basic Setup

```yaml
services:
  kumidocs:
    image: oven/bun:latest
    working_dir: /app
    command: bunx kumidocs
    environment:
      KUMIDOCS_REPO_PATH: /repo
    volumes:
      - /path/to/your/repo:/repo
      - /path/to/your/ssh:/root/.ssh:ro
    ports:
      - "5864:5864"
    restart: unless-stopped
```

Mount your SSH keys read-only so KumiDocs can push to a remote repository.

### With OAuth2 SSO Proxy

```yaml
services:
  kumidocs:
    image: oven/bun:latest
    working_dir: /app
    command: bunx kumidocs
    environment:
      KUMIDOCS_REPO_PATH: /repo
      KUMIDOCS_AUTH_HEADER: X-Auth-Request-User
    volumes:
      - /path/to/your/repo:/repo
      - /path/to/your/ssh:/root/.ssh:ro
    # No external port; only reachable via the proxy

  oauth2-proxy:
    image: quay.io/oauth2-proxy/oauth2-proxy:latest
    command:
      - --provider=github
      - --upstream=http://kumidocs:5864
      - --http-address=0.0.0.0:4180
      - --email-domain=yourcompany.com
    environment:
      OAUTH2_PROXY_CLIENT_ID: your-github-oauth-app-client-id
      OAUTH2_PROXY_CLIENT_SECRET: your-github-oauth-app-client-secret
      OAUTH2_PROXY_COOKIE_SECRET: a-random-32-char-secret
      OAUTH2_PROXY_COOKIE_DOMAIN: wiki.yourcompany.com
      OAUTH2_PROXY_COOKIE_SECURE: "true"
    ports:
      - "4180:4180"
```

Place a reverse proxy (nginx, Caddy, Traefik) in front of oauth2-proxy to terminate TLS.

## File Layout

KumiDocs manages these paths inside your repository:

```
README.md           → Home page (shown at /)
.kumidocs.json      → Config (never shown in sidebar, never served via API)
images/             → Uploaded images (SHA256.ext naming)
**/*.md             → Doc pages and slide decks
**/*.{ts,js,...}    → Code files (viewed at /code/<path>)
```

Files named `.kumidocs.json` and `_sidebar.md` are hidden from the sidebar. The `images/` directory is also hidden (accessible via the Image Library at `/images`).

## Git Remote

KumiDocs does not configure the Git remote; it uses whatever is already in `.git/config`. Make sure your repo has a remote configured and that the server process has credentials to push to it (SSH key or credential helper).

### SSH Keys

Mount your SSH key into the container:

```yaml
volumes:
  - ~/.ssh:/root/.ssh:ro
```

Ensure your SSH key is not passphrase-protected (or use `ssh-agent`), since KumiDocs pushes non-interactively.

### Personal Access Tokens

For HTTPS remotes, configure the credential helper before starting KumiDocs:

```bash
git -C /path/to/repo config credential.helper store
git -C /path/to/repo remote set-url origin https://token@github.com/org/repo.git
```

## Startup Sequence

1. Validate `KUMIDOCS_REPO_PATH` (must be a Git repo)
2. Run `git pull --rebase` (if remote configured)
3. Read `.kumidocs.json`
4. Load all files into in-memory state
5. Build MiniSearch full-text index
6. Start HTTP + WebSocket server
7. Schedule background pull loop (every `KUMIDOCS_PULL_INTERVAL` ms)
