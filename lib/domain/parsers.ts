/**
 * Capa de Validación y Transformación en Runtime (Type Guards & Parsers).
 *
 * Por qué existe este módulo (Primeros Principios):
 * Las fronteras de I/O (filas de `better-sqlite3` y líneas de texto de `events.jsonl`)
 * devuelven tipos desconocidos (`unknown`) en tiempo de ejecución.
 * En lugar de engañar al compilador con `any` o `as MiTipo` (prohibidos en nuestras reglas),
 * usamos predicados de tipo (`value is T`) que estrechan el tipo de forma matemáticamente
 * comprobada por TypeScript.
 */

import type {
  AgentLiveness,
  ConcordAgent,
  ConcordEventLogEntry,
  ConcordHandoff,
  ConcordTask,
  ConcordTaskUpdate,
  EndpointTransportStatus,
  TaskUpdateKind,
} from "./types";

/**
 * Predicado base: comprueba que un valor `unknown` sea un objeto plano indexable por clave.
 */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Envuelve `JSON.parse` tipando el retorno como `unknown` para impedir que el `any`
 * de la librería estándar de TypeScript contamine el resto del código.
 */
export function safeJsonParse(raw: string): unknown {
  try {
    const parsed: unknown = JSON.parse(raw);
    return parsed;
  } catch {
    return undefined;
  }
}

/**
 * Deserializa de forma segura una columna SQLite `TEXT` que contiene un array JSON de strings
 * (ej. `expected_files`, `modules`, `domains`, `risk_tags`).
 */
export function parseJsonStringArray(raw: unknown): readonly string[] {
  if (typeof raw !== "string" || raw.trim() === "") {
    return [];
  }
  const parsed = safeJsonParse(raw);
  if (!Array.isArray(parsed)) {
    return [];
  }
  const result: string[] = [];
  for (const item of parsed) {
    if (typeof item === "string") {
      result.push(item);
    }
  }
  return result;
}

function readRequiredString(record: Record<string, unknown>, key: string): string | null {
  const value = record[key];
  return typeof value === "string" ? value : null;
}

function readNullableString(record: Record<string, unknown>, key: string): string | null {
  const value = record[key];
  return typeof value === "string" ? value : null;
}

function readNullableNumber(record: Record<string, unknown>, key: string): number | null {
  const value = record[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

const VALID_UPDATE_KINDS: ReadonlySet<TaskUpdateKind> = new Set<TaskUpdateKind>([
  "intent",
  "progress",
  "assumption",
  "decision",
  "question",
  "answer",
  "blocker",
  "finding",
]);

function isTaskUpdateKind(value: string): value is TaskUpdateKind {
  for (const kind of VALID_UPDATE_KINDS) {
    if (kind === value) {
      return true;
    }
  }
  return false;
}

function isEndpointStatus(value: string | null): value is EndpointTransportStatus {
  return value === "connected" || value === "disconnected";
}

/**
 * Calcula la edad en segundos desde un timestamp ISO 8601 y clasifica la vitalidad del agente.
 */
export function computeAgentHeartbeat(
  lastSeenIso: string,
  nowMs: number = Date.now(),
): { readonly ageSeconds: number; readonly liveness: AgentLiveness } {
  const parsedMs = Date.parse(lastSeenIso);
  if (Number.isNaN(parsedMs)) {
    return { ageSeconds: 0, liveness: "stale" };
  }
  const ageSeconds = Math.max(0, Math.floor((nowMs - parsedMs) / 1000));
  if (ageSeconds <= 120) {
    return { ageSeconds, liveness: "live" };
  }
  if (ageSeconds <= 600) {
    return { ageSeconds, liveness: "idle" };
  }
  return { ageSeconds, liveness: "stale" };
}

/**
 * Transforma una fila cruda de `agents` (con `LEFT JOIN agent_endpoints`) en `ConcordAgent`.
 */
export function parseAgentRow(row: unknown, nowMs: number = Date.now()): ConcordAgent | null {
  if (!isRecord(row)) {
    return null;
  }
  const agentId = readRequiredString(row, "agent_id");
  const kind = readRequiredString(row, "kind");
  const status = readRequiredString(row, "status");
  const firstSeen = readRequiredString(row, "first_seen");
  const lastSeen = readRequiredString(row, "last_seen");

  if (
    agentId === null ||
    kind === null ||
    status === null ||
    firstSeen === null ||
    lastSeen === null
  ) {
    return null;
  }

  const endpointProvider = readNullableString(row, "endpoint_provider");
  const endpointTransport = readNullableString(row, "endpoint_transport");
  const endpointStatusRaw = readNullableString(row, "endpoint_status");

  const endpoint =
    endpointProvider !== null &&
    endpointTransport !== null &&
    isEndpointStatus(endpointStatusRaw)
      ? {
          provider: endpointProvider,
          transport: endpointTransport,
          status: endpointStatusRaw,
          capabilities: parseJsonStringArray(row["endpoint_capabilities"]),
        }
      : null;

  const { ageSeconds, liveness } = computeAgentHeartbeat(lastSeen, nowMs);

  return {
    agentId,
    kind,
    owner: readNullableString(row, "owner"),
    model: readNullableString(row, "model"),
    pid: readNullableNumber(row, "pid"),
    cwd: readNullableString(row, "cwd"),
    worktree: readNullableString(row, "worktree"),
    branch: readNullableString(row, "branch"),
    summary: readNullableString(row, "summary"),
    status,
    firstSeen,
    lastSeen,
    ageSeconds,
    liveness,
    endpoint,
  };
}

/**
 * Transforma una fila cruda de la tabla `tasks` en la entidad de dominio `ConcordTask`.
 */
export function parseTaskRow(row: unknown): ConcordTask | null {
  if (!isRecord(row)) {
    return null;
  }
  const taskId = readRequiredString(row, "task_id");
  const title = readRequiredString(row, "title");
  const status = readRequiredString(row, "status");
  const createdAt = readRequiredString(row, "created_at");
  const updatedAt = readRequiredString(row, "updated_at");
  const version = readNullableNumber(row, "version");

  if (
    taskId === null ||
    title === null ||
    status === null ||
    createdAt === null ||
    updatedAt === null ||
    version === null
  ) {
    return null;
  }

  return {
    project: readNullableString(row, "project") ?? "",
    taskId,
    parentTaskId: readNullableString(row, "parent_task_id"),
    title,
    notes: readNullableString(row, "notes"),
    status,
    owner: readNullableString(row, "owner"),
    agent: readNullableString(row, "agent"),
    agentId: readNullableString(row, "agent_id"),
    assignedAgentId: readNullableString(row, "assigned_agent_id"),
    branch: readNullableString(row, "branch"),
    worktree: readNullableString(row, "worktree"),
    expectedFiles: parseJsonStringArray(row["expected_files"]),
    modules: parseJsonStringArray(row["modules"]),
    domains: parseJsonStringArray(row["domains"]),
    riskTags: parseJsonStringArray(row["risk_tags"]),
    version,
    createdAt,
    updatedAt,
    leaseExpiresAt: readNullableString(row, "lease_expires_at"),
  };
}

/**
 * Transforma una fila cruda de la tabla `task_updates` en `ConcordTaskUpdate`.
 */
export function parseTaskUpdateRow(row: unknown): ConcordTaskUpdate | null {
  if (!isRecord(row)) {
    return null;
  }
  const id = readNullableNumber(row, "id");
  const taskId = readRequiredString(row, "task_id");
  const kindRaw = readRequiredString(row, "kind");
  const content = readRequiredString(row, "content");
  const createdAt = readRequiredString(row, "created_at");

  if (
    id === null ||
    taskId === null ||
    kindRaw === null ||
    content === null ||
    createdAt === null
  ) {
    return null;
  }

  const kind: TaskUpdateKind = isTaskUpdateKind(kindRaw) ? kindRaw : "progress";

  return {
    id,
    project: readNullableString(row, "project") ?? "",
    taskId,
    kind,
    content,
    agent: readNullableString(row, "agent"),
    createdAt,
  };
}

/**
 * Transforma una fila cruda de la tabla `handoffs` en `ConcordHandoff`.
 */
export function parseHandoffRow(row: unknown): ConcordHandoff | null {
  if (!isRecord(row)) {
    return null;
  }
  const id = readNullableNumber(row, "id");
  const taskId = readRequiredString(row, "task_id");
  const status = readRequiredString(row, "status");
  const whatChanged = readRequiredString(row, "what_changed");
  const createdAt = readRequiredString(row, "created_at");

  if (
    id === null ||
    taskId === null ||
    status === null ||
    whatChanged === null ||
    createdAt === null
  ) {
    return null;
  }

  return {
    id,
    project: readNullableString(row, "project") ?? "",
    taskId,
    status,
    whatChanged,
    changedFiles: parseJsonStringArray(row["changed_files"]),
    testsRun: parseJsonStringArray(row["tests_run"]),
    knownRisks: parseJsonStringArray(row["known_risks"]),
    assumptions: parseJsonStringArray(row["assumptions"]),
    decisions: parseJsonStringArray(row["decisions"]),
    guardrailsChecked: parseJsonStringArray(row["guardrails_checked"]),
    nextSteps: parseJsonStringArray(row["next_steps"]),
    fromAgentId: readNullableString(row, "from_agent_id"),
    toAgentId: readNullableString(row, "to_agent_id"),
    taskVersion: readNullableNumber(row, "task_version"),
    createdAt,
  };
}

/**
 * Parsea una línea individual de `.concord/events.jsonl` validando su estructura.
 */
export function parseEventJsonLine(line: string, index: number): ConcordEventLogEntry | null {
  const trimmed = line.trim();
  if (trimmed === "") {
    return null;
  }
  const parsed = safeJsonParse(trimmed);
  if (!isRecord(parsed)) {
    return null;
  }

  const tool = readRequiredString(parsed, "tool");
  const status = readRequiredString(parsed, "status");
  const createdAt = readRequiredString(parsed, "created_at");

  if (tool === null || status === null || createdAt === null) {
    return null;
  }

  return {
    index,
    taskId: readNullableString(parsed, "task_id"),
    tool,
    status,
    detail: readNullableString(parsed, "detail"),
    createdAt,
  };
}

