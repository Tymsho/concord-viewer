# Concord Web Viewer (`concord-viewer`)

A local-first, real-time web observability dashboard built with **Next.js 16 (App Router), strict TypeScript, Tailwind CSS v4, and `better-sqlite3`** to inspect multi-agent coordination state inside `.concord/`.

---

## 1. Overview

**Concord MCP** is a local-first coordination layer (built on the Model Context Protocol) that enables multiple AI coding agents (`claude-code`, `codex`, `cursor`, `antigravity`, `gemini`, `grok`) to collaborate inside the same repository without stepping on each other's files.

When `concord setup` runs in a workspace, it maintains:
- **`.concord/concord.db`**: A SQLite database in **WAL (Write-Ahead Logging)** mode storing registered agents, live endpoints, tasks, file/module scope claims, optimistic concurrency versions (`version` / `expected_version`), task context updates, and completion handoffs.
- **`.concord/events.jsonl`**: An immutable, append-only NDJSON event stream recording every MCP tool invocation.

**Concord Web Viewer** provides a live visual control plane over `.concord/`, allowing developers to monitor active agents, inspect claimed scopes, immediately spot file/module collisions, and audit technical decisions and handoff evidence in real time.

---

## 2. Key Features

- **Scope Collision Detector (`CollisionBanner`)**:
  - Computes an in-memory inverted index across all `active` tasks to detect overlapping claims on `expected_files` (with automatic Windows/POSIX path normalization) and `modules`.
  - Highlights conflicting file/module badges directly inside affected task cards.
- **Live Agent Presence & Heartbeat Telemetry (`AgentsPanel`)**:
  - Displays every registered agent (`agents` joined with `agent_endpoints`), its provider kind, current activity summary, endpoint capabilities (`pull`, `steer`, `busy`), and calculated liveness (`LIVE` $\le 120\text{s}$, `IDLE` $\le 600\text{s}$, `STALE` $> 600\text{s}$).
- **Tasks, Scope Claims & Evidence Board (`TasksBoard`)**:
  - Filterable view (`All`, `Active`, `Completed`) displaying each task's optimistic concurrency version (`v1`, `v2`, ...), claimed files (`expected_files`), logical modules (`modules`), progressive context logs recorded via `update_work` (`decision`, `finding`, `progress`, `blocker`), and completion evidence recorded via `finish_work` (`handoffs`).
- **Immutable Event Timeline (`EventsTimeline`)**:
  - Chronological feed parsed from `.concord/events.jsonl` (with automatic fallback to the SQLite `events` table) showing sequence numbers, tool names (`claim_work`, `update_task`, `complete_task`), associated tasks, and timestamps.
- **Resilient Live Polling & Non-Destructive Lock Recovery (`ConcordDashboard`)**:
  - Combines instant Server-Side Rendering (SSR) on initial page load with a toggleable 3-second polling loop (`GET /api/concord`).
  - If SQLite temporarily reports `SQLITE_BUSY` / `503 Service Unavailable` during a WAL checkpoint, the UI retains the last valid snapshot on screen and displays a non-intrusive sync warning until the next poll cycle succeeds.

---

## 3. Architecture & Engineering Principles

```text
concord-viewer/
├── app/
│   ├── api/concord/route.ts         # GET /api/concord (no-store + semantic 200/404/503/500 HTTP codes)
│   ├── layout.tsx                   # Root application shell & typography
│   └── page.tsx                     # Next.js 16 Dynamic IO Server Component with <Suspense>
├── components/dashboard/
│   ├── agents-panel.tsx             # Presentational: Agent presence & endpoint capabilities
│   ├── collision-banner.tsx         # Presentational: Scope overlap alert / safe-scope banner
│   ├── concord-dashboard.tsx        # Client Container: State hydration, live polling & lock resilience
│   ├── events-timeline.tsx          # Presentational: Chronological events.jsonl stream
│   └── tasks-board.tsx              # Presentational: Tasks, claims, updates & handoff evidence
├── lib/
│   ├── domain/
│   │   ├── types.ts                 # Immutable domain entities & discriminated unions
│   │   ├── parsers.ts               # Runtime type guards (value is T) & JSON array deserializers
│   │   └── collisions.ts            # Pure inverted-index collision detection engine
│   └── data/
│       ├── concord-repository.ts    # Read-only better-sqlite3 repository & JSONL reader
│       └── get-workspace-state.ts   # Dynamic Server Component loader using next/server connection()
└── docs/
    └── DATA_MODEL_ANALYSIS.md       # Complete relational analysis & ER diagram of .concord/concord.db
```

### Design Highlights
1. **Strict Type Safety (Zero `any`, Zero Forced Typecasts `as`)**:
   - SQLite stores array columns (`expected_files`, `modules`, `capabilities`, etc.) as serialized JSON strings inside `TEXT` columns, and `JSON.parse()` / `response.json()` return `any` in standard TypeScript typings.
   - All I/O boundaries (`better-sqlite3` rows, `.concord/events.jsonl` lines, and HTTP JSON responses) are narrowed through explicit TypeScript type predicates (`value is T`) in [`lib/domain/parsers.ts`](./lib/domain/parsers.ts).
2. **Safe Concurrent SQLite WAL Reading**:
   - [`lib/data/concord-repository.ts`](./lib/data/concord-repository.ts) opens `.concord/concord.db` strictly with `{ readonly: true, fileMustExist: true, timeout: 3000 }` and closes the handle deterministically inside a `finally` block. This prevents accidental creation of empty database files and avoids holding open file descriptors over `-wal` / `-shm` files on Windows.
3. **Discriminated Union Error Modeling**:
   - Instead of throwing unhandled exceptions when `.concord/` is missing or locked, the data layer returns [`ConcordWorkspaceResult`](./lib/domain/types.ts) (`status: "ready" | "unavailable"` with typed reasons: `missing_directory`, `missing_database`, `database_locked`, `read_error`).

---

## 4. Getting Started

### Prerequisites
- **Node.js** `>= 20.x`
- A repository initialized with **Concord MCP** (`.concord/concord.db` present in the project root).
  - *Note: This repository already includes a real `.concord/` directory populated by dogfooding Concord MCP during its own construction.*

### 1. Install Dependencies
```bash
npm install
```

### 2. Run the Development Server
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) in your browser.

### 3. Type Check & Production Build
```bash
# Run strict TypeScript verification
npx tsc --noEmit

# Build and start for production
npm run build
npm start
```

---

## 5. How to Use the Dashboard

1. **Monitor Active Coordination**:
   - Keep [http://localhost:3000](http://localhost:3000) open while one or more AI agents work in the repository.
   - With **Live Polling (3s)** enabled in the top bar, the dashboard automatically reflects every `start_work`, `update_work`, `transfer_work`, and `finish_work` call in real time.
2. **Inspect Scope Overlaps**:
   - Check the **Collision Detector** banner at the top of the workspace. If two active tasks claim the same file or module, the banner turns red (`OVERLAP WARNING`), lists the disputed targets, and highlights the colliding file badges inside the **Tasks Board**.
3. **Filter Tasks & Review Evidence**:
   - Use the **Todas / Activas / Completadas** filter tabs in the center column to inspect active claims, read architectural decisions logged via `update_work`, and verify completion handoffs (`what_changed`, `decisions`, `changed_files`) recorded via `finish_work`.
4. **Query the HTTP API Directly**:
   - Endpoint: `GET /api/concord?maxEvents=200`
   - Status Codes:
     - `200 OK`: Snapshot ready (`status: "ready"`).
     - `404 Not Found`: `.concord/` directory or `concord.db` does not exist yet.
     - `503 Service Unavailable`: SQLite is temporarily locked (`Retry-After: 1`).
     - `500 Internal Server Error`: Unexpected read error.

---

## 6. Dogfooding History

This project was built end-to-end using **Concord MCP** to coordinate its own implementation phases:
- **`TASK-01`**: Live inspection of `.concord/concord.db` schema and documentation in [`docs/DATA_MODEL_ANALYSIS.md`](./docs/DATA_MODEL_ANALYSIS.md).
- **`TASK-02`**: Implementation of the pure domain model, runtime type guards, collision engine, and `better-sqlite3` read-only repository.
- **`TASK-03`**: Implementation of the Next.js 16 Dynamic IO Server Component loader and `GET /api/concord` route handler.
- **`TASK-04`**: Implementation of the Tailwind CSS observability dashboard components and live polling container.
- **`TASK-05`**: Authoring of the project documentation in `README.md`.
