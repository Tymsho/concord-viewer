/**
 * Capa de Acceso a Datos (Repositorio de Solo Lectura para `.concord/`).
 *
 * Decisiones Arquitectónicas (Primeros Principios):
 * 1. Modo Solo Lectura Estricto (`{ readonly: true, fileMustExist: true }`):
 *    El Dashboard jamás debe mutar `.concord/concord.db` ni crear un archivo vacío
 *    por accidente si `concord setup` no fue ejecutado.
 * 2. Ciclo de Vida Determinista (`try / finally { db.close() }`):
 *    En Windows, mantener descriptores abiertos sobre archivos `.db-wal` / `.db-shm`
 *    puede interferir con procesos externos. Abrir, consultar en menos de 1ms y cerrar
 *    en un bloque `finally` garantiza cero fugas de descriptores y lectura fresca del WAL.
 * 3. Manejo de Fallos por Unión Discriminada (`ConcordWorkspaceResult`):
 *    Si la base de datos no existe o devuelve `SQLITE_BUSY` / `SQLITE_LOCKED`,
 *    retornamos `{ status: "unavailable", reason: ... }` sin usar `any` ni typecasts.
 */

import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { detectScopeCollisions } from "@/lib/domain/collisions";
import {
  isRecord,
  parseAgentRow,
  parseEventJsonLine,
  parseHandoffRow,
  parseTaskRow,
  parseTaskUpdateRow,
} from "@/lib/domain/parsers";
import type {
  ConcordAgent,
  ConcordEventLogEntry,
  ConcordHandoff,
  ConcordTask,
  ConcordTaskUpdate,
  ConcordWorkspaceResult,
} from "@/lib/domain/types";

export interface ReadWorkspaceOptions {
  /** Ruta raíz del repositorio; por defecto `process.cwd()`. */
  readonly workspaceRoot?: string;
  /** Límite máximo de eventos cronológicos a retornar (por defecto 200). */
  readonly maxEvents?: number;
}

const AGENTS_QUERY = `
  SELECT
    a.agent_id,
    a.kind,
    a.owner,
    a.model,
    a.pid,
    a.cwd,
    a.worktree,
    a.branch,
    a.summary,
    a.status,
    a.first_seen,
    a.last_seen,
    ep.provider     AS endpoint_provider,
    ep.transport    AS endpoint_transport,
    ep.status       AS endpoint_status,
    ep.capabilities AS endpoint_capabilities
  FROM agents a
  LEFT JOIN agent_endpoints ep ON ep.agent_id = a.agent_id
  ORDER BY a.last_seen DESC
`;

const TASKS_QUERY = `
  SELECT
    project,
    task_id,
    parent_task_id,
    title,
    notes,
    status,
    owner,
    agent,
    agent_id,
    assigned_agent_id,
    branch,
    worktree,
    expected_files,
    modules,
    domains,
    risk_tags,
    version,
    created_at,
    updated_at,
    lease_expires_at
  FROM tasks
  ORDER BY
    CASE status
      WHEN 'active' THEN 0
      WHEN 'review_ready' THEN 1
      ELSE 2
    END ASC,
    updated_at DESC
`;

const TASK_UPDATES_QUERY = `
  SELECT
    id,
    project,
    task_id,
    kind,
    content,
    agent,
    created_at
  FROM task_updates
  ORDER BY created_at DESC, id DESC
  LIMIT 200
`;

const HANDOFFS_QUERY = `
  SELECT
    id,
    project,
    task_id,
    status,
    what_changed,
    changed_files,
    tests_run,
    known_risks,
    assumptions,
    decisions,
    guardrails_checked,
    next_steps,
    from_agent_id,
    to_agent_id,
    task_version,
    created_at
  FROM handoffs
  ORDER BY created_at DESC, id DESC
  LIMIT 100
`;

const EVENTS_TABLE_FALLBACK_QUERY = `
  SELECT
    id,
    task_id,
    tool,
    status,
    detail,
    created_at
  FROM events
  ORDER BY id DESC
  LIMIT ?
`;

function extractErrorDetails(error: unknown): {
  readonly code: string | null;
  readonly message: string;
} {
  if (isRecord(error)) {
    const code = typeof error["code"] === "string" ? error["code"] : null;
    const message =
      typeof error["message"] === "string"
        ? error["message"]
        : "Error desconocido al leer concord.db";
    return { code, message };
  }
  if (error instanceof Error) {
    return { code: null, message: error.message };
  }
  return { code: null, message: String(error) };
}

/**
 * Lee `.concord/events.jsonl` línea por línea y devuelve los eventos más recientes primero.
 */
export function readEventsJsonl(
  eventsFilePath: string,
  maxEvents: number = 200,
): readonly ConcordEventLogEntry[] {
  if (!fs.existsSync(eventsFilePath)) {
    return [];
  }

  try {
    const rawContent = fs.readFileSync(eventsFilePath, "utf-8");
    const lines = rawContent.split(/\r?\n/);
    const entries: ConcordEventLogEntry[] = [];

    for (let i = 0; i < lines.length; i += 1) {
      const entry = parseEventJsonLine(lines[i], i + 1);
      if (entry !== null) {
        entries.push(entry);
      }
    }

    return entries.reverse().slice(0, maxEvents);
  } catch {
    return [];
  }
}

function parseEventsFromTable(
  rawRows: readonly unknown[],
): readonly ConcordEventLogEntry[] {
  const entries: ConcordEventLogEntry[] = [];
  for (const row of rawRows) {
    if (!isRecord(row)) {
      continue;
    }
    const id = typeof row["id"] === "number" ? row["id"] : entries.length + 1;
    const tool = typeof row["tool"] === "string" ? row["tool"] : null;
    const status = typeof row["status"] === "string" ? row["status"] : null;
    const createdAt = typeof row["created_at"] === "string" ? row["created_at"] : null;

    if (tool === null || status === null || createdAt === null) {
      continue;
    }

    entries.push({
      index: id,
      taskId: typeof row["task_id"] === "string" ? row["task_id"] : null,
      tool,
      status,
      detail: typeof row["detail"] === "string" ? row["detail"] : null,
      createdAt,
    });
  }
  return entries;
}

/**
 * Consulta una instantánea completa y consistente del workspace Concord en modo solo lectura.
 */
export function readConcordWorkspaceSnapshot(
  options: ReadWorkspaceOptions = {},
): ConcordWorkspaceResult {
  const workspaceRoot = options.workspaceRoot ?? process.cwd();
  const maxEvents = options.maxEvents ?? 200;
  const concordDir = path.join(workspaceRoot, ".concord");
  const dbPath = path.join(concordDir, "concord.db");
  const eventsPath = path.join(concordDir, "events.jsonl");

  if (!fs.existsSync(concordDir)) {
    return {
      status: "unavailable",
      reason: "missing_directory",
      message: "No se encontró el directorio .concord/ en este repositorio. Ejecuta `concord setup` primero.",
      dbPath,
    };
  }

  if (!fs.existsSync(dbPath)) {
    return {
      status: "unavailable",
      reason: "missing_database",
      message: "No se encontró el archivo .concord/concord.db.",
      dbPath,
    };
  }

  let db: Database.Database | null = null;
  try {
    db = new Database(dbPath, {
      readonly: true,
      fileMustExist: true,
      timeout: 3000,
    });

    const nowMs = Date.now();
    const readAt = new Date(nowMs).toISOString();

    const rawAgents: unknown[] = db.prepare(AGENTS_QUERY).all();
    const rawTasks: unknown[] = db.prepare(TASKS_QUERY).all();
    const rawTaskUpdates: unknown[] = db.prepare(TASK_UPDATES_QUERY).all();
    const rawHandoffs: unknown[] = db.prepare(HANDOFFS_QUERY).all();

    const agents: ConcordAgent[] = [];
    for (const row of rawAgents) {
      const parsed = parseAgentRow(row, nowMs);
      if (parsed !== null) {
        agents.push(parsed);
      }
    }

    const tasks: ConcordTask[] = [];
    for (const row of rawTasks) {
      const parsed = parseTaskRow(row);
      if (parsed !== null) {
        tasks.push(parsed);
      }
    }

    const taskUpdates: ConcordTaskUpdate[] = [];
    for (const row of rawTaskUpdates) {
      const parsed = parseTaskUpdateRow(row);
      if (parsed !== null) {
        taskUpdates.push(parsed);
      }
    }

    const handoffs: ConcordHandoff[] = [];
    for (const row of rawHandoffs) {
      const parsed = parseHandoffRow(row);
      if (parsed !== null) {
        handoffs.push(parsed);
      }
    }

    const jsonlEvents = readEventsJsonl(eventsPath, maxEvents);
    const events =
      jsonlEvents.length > 0
        ? jsonlEvents
        : parseEventsFromTable(db.prepare(EVENTS_TABLE_FALLBACK_QUERY).all(maxEvents));

    const collisions = detectScopeCollisions(tasks);

    return {
      status: "ready",
      snapshot: {
        workspacePath: workspaceRoot,
        readAt,
        agents,
        tasks,
        taskUpdates,
        handoffs,
        events,
        collisions,
      },
    };
  } catch (error: unknown) {
    const { code, message } = extractErrorDetails(error);
    const isLocked =
      code === "SQLITE_BUSY" ||
      code === "SQLITE_LOCKED" ||
      message.toLowerCase().includes("database is locked");

    return {
      status: "unavailable",
      reason: isLocked ? "database_locked" : "read_error",
      message,
      dbPath,
    };
  } finally {
    if (db !== null) {
      db.close();
    }
  }
}

