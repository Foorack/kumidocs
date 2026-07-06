# AGENTS

KumiDocs: developer wiki/docs platform. Zero database, all content in Git. Bun + React + TypeScript.

## Critical Rules

### 1. Long-Term Over Short-Term

Everything is worth changing if it is for the long-term benefit. Always prioritize what's best long-term over short-term laziness.

- **Fix root causes, not symptoms**. Tech debt compounds. Do it right the first time.
- **No "not worth fixing"**. If it improves long-term health, it is worth doing.
- **Leave it better than you found it**. Every edit should leave the codebase cleaner.

### 2. Write Like a Human

All code comments, documentation, and this file itself must read as if written by a human Staff Engineer. Clear, direct, no AI writing tics.

- **No AI typography**: Do not use em dashes (---), fancy quotes, or symbols an engineer would not naturally type.
- **Keep it simple**: Short sentences, plain language. Simple is easier to maintain.
- **Write for humans**: Read everything back before saving. If it reads like it was generated, rewrite it.

### 3. AI Safety Boundaries

| Action                                   | AI allowed?             |
| ---------------------------------------- | ----------------------- |
| `bun run dev` / `bun run build`          | Yes                     |
| `bun run lint` / `bun run typecheck`     | Yes                     |
| `git commit` / `git push`                | Yes                     |
| `docker compose up -d`                   | Yes                     |
| Edit `.env.example`                      | Yes (placeholders only) |
| Edit `.env`                              | No (secrets live here)  |
| `docker compose down` / restart prod     | Ask first               |
| `npm publish` / `bun publish`            | Never                   |
| Modify CI/CD workflows                   | Ask first               |
| Delete data (files, images, git history) | Ask first               |

If the user asks the AI to deploy or publish, tell them to run it themselves and approve.

### 4. No Secrets in Code

- Never commit real credentials to `.env.example`. Use placeholders only.
- Real credentials go in `.env` (gitignored).
- Never log tokens, passwords, or API keys to stdout.
- Validate configs before restarting services.

---

## Architecture

### Stack

| Layer     | Choice                                             | Notes                                                        |
| --------- | -------------------------------------------------- | ------------------------------------------------------------ |
| Runtime   | **Bun**                                            | Server + build + git operations                              |
| Frontend  | **React + TypeScript**                             | SPA                                                          |
| Styling   | **Tailwind + shadcn/ui + @tailwindcss/typography** | Standard shadcn components in `src/components/ui/`           |
| Icons     | **@fluentui/react-icons** + **lucide-react**       | Fluent for app chrome, lucide for SlideViewer                |
| Markdown  | **streamdown**                                     | remark/rehype -> React DOM. `rehype-harden` for sanitization |
| Search    | **MiniSearch**                                     | In-memory, full-text, fuzzy                                  |
| Real-time | **WebSocket** (Bun native)                         | Presence + live reload                                       |

### Project Layout

```
src/
  index.ts               # Entry point
  server/                # HTTP/WS server, git, auth, search, config
  components/            # React components by domain
    ui/                  # shadcn components + emoji-icon.tsx
    editor/
    layout/
    search/
    dialogs/
  hooks/                 # Custom React hooks (use-mount-effect.ts)
  lib/                   # Utilities
  pages/                 # Page-level components
  store/                 # State management
scripts/
  build.ts               # Production build
docs/                    # User-facing documentation
compose.yaml             # Docker Compose (dev + prod)
SPEC.md                  # Technical spec
TASKS.md                 # Task backlog
```

### Ports

| Port | Service                         |
| ---- | ------------------------------- |
| 5864 | KumiDocs HTTP/WS server         |
| 5865 | oauth2-proxy (SSO, production)  |
| 5866 | oauth2-proxy (SSO, development) |

### Environment Variables

| Variable                   | Default               | Description             |
| -------------------------- | --------------------- | ----------------------- |
| `KUMIDOCS_REPO_PATH`       | `cwd`                 | Path to git repo        |
| `KUMIDOCS_PORT`            | `5864`                | HTTP/WS listen port     |
| `KUMIDOCS_AUTH_HEADER`     | `X-Auth-Request-User` | User identity header    |
| `KUMIDOCS_AUTO_SAVE_DELAY` | `5000`                | Auto-save debounce (ms) |
| `KUMIDOCS_INSTANCE_NAME`   | `KumiDocs`            | Display name            |
| `KUMIDOCS_PULL_INTERVAL`   | `60000`               | Git pull interval (ms)  |

---

## Development

### Commands

```bash
bun run dev           # Dev server with hot reload
bun run build         # Production build
bun run start         # Run production build
bun run lint          # oxlint
bun run format        # oxfmt
bun run typecheck     # tsgo --noEmit (TypeScript check without emit)
docker compose up -d  # Full stack (dev mode, host networking)
```

### Startup Flow

1. Validate repo path
2. `git pull --rebase`
3. Read `.kumidocs.json`
4. Load file tree into memory
5. Build MiniSearch index
6. Start HTTP + WebSocket server
7. Schedule background pull loop

---

## Project Model: Owner + Developer

This project uses a two-role model.

### Project Owner (User)

Strategic direction, requirements, acceptance. Decides what to build, UI/UX, auth provider, deployment strategy, third-party services.

### Lead Developer (AI Agent)

Implementation, technical execution, engineering best practices. Decides implementation details, library versions, code style, error handling, performance optimizations.

### Decision-Making Protocol

**Owner decides**: features, UI/UX, auth config, deployment, third-party services.
**Developer decides**: implementation details, libraries, code style, error handling, perf.
**Requires discussion**: breaking API changes, major architectural shifts, changes to data persistence or security.

**Communication guidelines**:

- Owner -> Developer: clear requirements, feedback on results.
- Developer -> Owner: deliver completed work, ask targeted questions only when blocked. Show your work. Present options with a recommendation instead of asking for decisions.

---

## Code Conventions

### Emoji Rendering (UI Only)

Never render emoji as raw JSX text or `<span>` elements (e.g. `, `).
Always use `<EmojiIcon emoji="..." size={N} />` from `src/components/ui/emoji-icon.tsx`.
This applies to all emojis in React components: theme toggles, status icons, page icons, everything.
Markdown documentation may use raw emoji freely.

### React useEffect

Do not call `useEffect` directly in components. For the rare case of syncing with an external system on mount, use `useMountEffect` from `src/hooks/use-mount-effect.ts`:

```ts
import useMountEffect from "@/hooks/use-mount-effect";

useMountEffect(() => {
  // DOM integration, third-party widgets, browser API subscriptions
});
```

For most cases, prefer these alternatives in order:

1. **Derive state inline**: never `useEffect(() => setX(f(y)), [y])`; compute in render
2. **Data-fetching libraries**: use React Query or similar; never fetch inside effects
3. **Event handlers**: if triggered by a user action, do the work in the handler
4. **`useMountEffect`**: for mount-only effects like DOM integration
5. **`key` prop for resets**: use `<Component key={id} />` for clean remounts instead of effect choreography

### Component Structure

- Prefer standard shadcn components (`Card`, `Badge`, `Separator`, etc.) over custom divs with excessive Tailwind classes.
- Text should be readable at default size with full contrast. No grey text or small text for content (`text-muted-foreground`, `text-xs`, `text-sm`).
- Version/status indicators can use color (amber/green) but at normal font weight and size.

### SPEC and TASKS Workflow

- Update `SPEC.md` with finalized technical decisions before starting implementation.
- Keep `TASKS.md` in sync: add tasks as discovered, mark done as completed.
- Significant deviations from the spec during implementation must be documented back into `SPEC.md`.

---

## Troubleshooting

| Symptom                | Likely cause                              | Fix                                                         |
| ---------------------- | ----------------------------------------- | ----------------------------------------------------------- |
| Server won't start     | Repo path invalid or missing `.git`       | Check `KUMIDOCS_REPO_PATH` points to a valid git repo       |
| SSO redirect loop      | OAuth callback URL mismatch               | Verify `SSO_PROXY_REDIRECT_URL` matches the provider config |
| Git push fails on save | No remote configured or permission denied | Check repo has a remote and the user has push access        |
| Hot reload not working | Port conflict                             | Check nothing else is on 5864/5865/5866                     |
| Search returns nothing | Index not built                           | Restart server; index builds on startup from file tree      |
| Build fails            | TypeScript errors or missing deps         | Run `bun run typecheck` and `bun install` first             |

---

## Resources

- User docs: `docs/` in repo root
- Technical spec: `SPEC.md`
- Task backlog: `TASKS.md`
- Deployment: `compose.yaml`
