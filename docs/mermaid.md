---
emoji: 📊
---

# Mermaid Diagrams

KumiDocs supports [Mermaid](https://mermaid.js.org) diagrams. Simply wrap any diagram definition in a ` ```mermaid ` fenced code block and it renders as an interactive diagram inline in your page.

## Overview

Mermaid is a JavaScript-based diagramming tool that lets you create diagrams and visualizations using text and code. KumiDocs bundles Mermaid v11.15.0 with support for **20+ diagram types**.

See [[AWS Architecture Examples]] for real-world architecture diagrams using Mermaid with Iconify icon packs.

Basic usage:

````markdown
```mermaid
flowchart LR
    A[Start] --> B[End]
```
````

Renders as:

```mermaid
flowchart LR
    A[Start] --> B[End]
```

## Diagram Types

### Flowchart

```mermaid
flowchart LR
    A[Write docs] --> B{Review?}
    B -->|Yes| C[Publish]
    B -->|No| D[Edit]
    D --> B
    C --> E[Git commit]
```

```mermaid
flowchart TD
    subgraph Frontend
        A[React SPA]
        B[Streamdown]
    end
    subgraph Backend
        C[Bun Server]
        D[Filestore]
    end
    A --> C
    C --> D
```

### Sequence Diagram

```mermaid
sequenceDiagram
    participant U as User
    participant K as KumiDocs
    participant G as Git

    U->>K: Edit page
    K->>K: Acquire edit lock
    U->>K: Save
    K->>G: Commit + push
    G-->>K: SHA confirmed
    K-->>U: Saved ✓
```

### Architecture Diagram (v11.1.0+)

Uses `architecture-beta` keyword with `group`, `service`, and edge `L/R/T/B` directions.

```mermaid
architecture-beta
    group api(cloud)[API Layer]
    group db(cloud)[Data Layer]

    service gateway(internet)[Gateway] in api
    service auth(server)[Auth Service] in api
    service docs(server)[Docs Service] in api
    service postgres(database)[PostgreSQL] in db
    service redis(database)[Redis Cache] in db

    gateway:R -- L:auth
    gateway:R -- L:docs
    auth:R -- L:postgres
    docs:R -- L:postgres
    docs:T -- B:redis
```

**Icons**: Use `logos:*` prefix for 200,000+ icons from Iconify:

```mermaid
architecture-beta
    group api(logos:aws-lambda)[API]
    service db(logos:aws-aurora)[Database] in api
    service server(logos:aws-ec2)[Server] in api
    db:R -- L:server
```

**Junctions** create split/merge points:

```mermaid
architecture-beta
    service left(disk)[Disk]
    service right(server)[Server]
    junction j
    left:R -- L:j
    j:R -- L:right
```

### Entity Relationship Diagram

```mermaid
erDiagram
    USER ||--o{ PAGE : creates
    PAGE ||--|{ IMAGE : contains
    PAGE {
        string path PK
        string title
        string emoji
    }
    USER {
        string email PK
        string display_name
    }
    IMAGE {
        string sha256 PK
        string url
    }
```

### Class Diagram

```mermaid
classDiagram
    class FileEntry {
        +String path
        +FileType type
        +String title
        +String emoji
    }
    class TreeNode {
        +String path
        +String name
        +String type
        +TreeNode[] children
    }
    TreeNode "1" --> "*" TreeNode
    TreeNode --> FileEntry
```

### State Diagram

```mermaid
stateDiagram-v2
    [*] --> Draft
    Draft --> Review
    Review --> Published
    Review --> Draft : Rejected
    Published --> Archived
    Archived --> Draft : Revise
```

### Gantt Chart

```mermaid
gantt
    title Project Timeline
    dateFormat  YYYY-MM-DD
    section Planning
    Requirements     :done, 2025-01-01, 14d
    Design           :done, 2025-01-15, 14d
    section Development
    Frontend         :active, 2025-02-01, 30d
    Backend          :2025-02-01, 30d
    section Launch
    Testing          :2025-03-01, 14d
    Deploy           :milestone, 2025-03-15, 0d
```

### Git Graph

```mermaid
gitGraph
    commit id: "Initial"
    branch feature
    checkout feature
    commit id: "Add auth"
    commit id: "Add editor"
    checkout main
    merge feature tag: "v1.0"
    commit id: "Mermaid"
```

### Pie Chart

```mermaid
pie title Content Distribution
    "Documentation" : 45
    "Slide Decks" : 25
    "Code Files" : 20
    "Images" : 10
```

### Mindmap

```mermaid
mindmap
  root((KumiDocs))
    Core
      Editor
      Git
      Search
    Features
      Slides
      Code Viewer
      PDF Export
    Deployment
      Docker
      SSO
```

### Timeline

```mermaid
timeline
    title KumiDocs Releases
    v0.1 : Foundation
    v0.2 : Editor
    v1.0 : Slides & Code
    v1.1 : Mermaid
```

### XY Chart

```mermaid
xychart-beta
    title "Performance"
    x-axis ["Jan", "Feb", "Mar", "Apr"]
    y-axis "ms" 0 --> 200
    bar [180, 120, 90, 60]
    line [180, 120, 90, 60]
```

### User Journey

```mermaid
journey
    title Onboarding flow
    section Setup
      Install Bun: 5: User
      Run kumidocs: 4: User
    section First use
      Open browser: 5: User
      Create page: 4: User
      Save: 5: User
```

## Configuration

Mermaid can be configured via frontmatter directives:

````markdown
```mermaid
%%{init: {"theme": "dark", "themeVariables": { "primaryColor": "#003087" }}}%%
flowchart LR
    A --> B
```
````

### Available themes

| Theme     | Description                       |
| --------- | --------------------------------- |
| `default` | Light theme                       |
| `dark`    | Dark theme                        |
| `forest`  | Green tones                       |
| `neutral` | Grey tones                        |
| `base`    | Fully custom via `themeVariables` |

## In Slide Decks

Mermaid diagrams work inside slide decks too:

````markdown
---
slides: true
theme: corporate
---

## Architecture

```mermaid
flowchart LR
    A[Client] --> B[API]
    B --> C[Database]
```
````

````

## Custom Icon Packs

Architecture diagrams support **icon packs** via the `prefix:icon-name` syntax. KumiDocs ships with **5 embedded icon packs**; no CDN required:

| Prefix | Pack | Example |
|--------|------|---------|
| `logos:*` | [Logos](https://github.com/gilbarbara/logos) | `logos:aws-s3`, `logos:github`, `logos:react` |
| `devicon:*` | [Devicon](https://devicon.dev) | `devicon:docker`, `devicon:postgresql` |
| `flag:*` | [Flag](https://github.com/iconify/icon-sets/tree/master/flag) | `flag:us`, `flag:gb-eng`, `flag:jp` |
| `fluent-color:*` | [Fluent Color](https://github.com/iconify/icon-sets/tree/master/fluent-color) | `fluent-color:cloud`, `fluent-color:database` |
| `glyphs-poly:*` | [Glyphs Poly](https://github.com/iconify/icon-sets/tree/master/glyphs-poly) | `glyphs-poly:server`, `glyphs-poly:shield` |

**Usage in architecture diagrams:**

```mermaid
architecture-beta
    group frontend(logos:react)[Frontend]
    group backend(logos:nodejs)[Backend]

    service spa(logos:typescript)[TypeScript] in frontend
    service api(logos:fastify)[API] in backend
    service db(devicon:postgresql)[PostgreSQL] in backend
    service cache(simple-icons:redis)[Redis] in backend

    spa:R -- L:api
    api:B -- T:db
    api:T -- B:cache
````

> Icons are bundled at build time; zero external network requests.

## Tips

- **Keep diagrams focused**: one concept per diagram
- **Use subgraphs** in flowcharts to group related nodes
- **Label edges clearly** with meaningful text
- **Architecture diagrams** benefit from icon prefixes for realistic service icons
- **Large diagrams** may take a moment to render; Mermaid runs entirely in the browser
