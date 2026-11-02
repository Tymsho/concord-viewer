/**
 * Capa de Dominio: Entidades inmutables y contratos de estado de Concord MCP.
 *
 * Diseño basado en Primeros Principios:
 * 1. Inmutabilidad (`readonly`): El Dashboard es un observador de `.concord/`.
 *    Ninguna capa superior debe mutar las estructuras devueltas por el repositorio.
 * 2. Desacoplamiento de SQLite: Mientras SQLite guarda listas como `TEXT` con JSON
 *    serializado (`expected_files: "[\".concord/concord.db\"]"`), el dominio expone
 *    colecciones nativas (`readonly string[]`) ya validadas.
 * 3. Uniones Discriminadas (`ConcordWorkspaceResult`): En lugar de lanzar excepciones
 *    cuando `.concord/concord.db` no existe o está bloqueada, modelamos el fallo
 *    como un estado explícito en el sistema de tipos.
 */

export type AgentLiveness = "live" | "idle" | "stale";

export type EndpointTransportStatus = "connected" | "disconnected";

export type TaskStatus = "active" | "review_ready" | "complete" | "closed" | string;

export type TaskUpdateKind =
  | "intent"
  | "progress"
  | "assumption"
  | "decision"
  | "question"
  | "answer"
  | "blocker"
  | "finding";

/**
 * Representa un agente registrado en la tabla `agents` enriquecido con su
 * estado de conectividad (`agent_endpoints`) y cálculo de latido (heartbeat).
 */
export interface ConcordAgent {
  readonly agentId: string;
  readonly kind: string;
  readonly owner: string | null;
  readonly model: string | null;
  readonly pid: number | null;
  readonly cwd: string | null;
  readonly worktree: string | null;
  readonly branch: string | null;
  readonly summary: string | null;
  readonly status: string;
  readonly firstSeen: string;
  readonly lastSeen: string;
  /** Segundos transcurridos desde `lastSeen` hasta el momento de la lectura. */
  readonly ageSeconds: number;
  /** Clasificación derivada del tiempo sin actividad (`live` <= 120s, `idle` <= 600s, `stale` > 600s). */
  readonly liveness: AgentLiveness;
  readonly endpoint: {
    readonly provider: string;
    readonly transport: string;
    readonly status: EndpointTransportStatus;
    readonly capabilities: readonly string[];
  } | null;
}

/**
 * Representa una tarea en `tasks` junto con su reclamo de alcance (scope/claims)
 * y su control de versiones optimista (`version`).
 */
export interface ConcordTask {
  readonly project: string;
  readonly taskId: string;
  readonly parentTaskId: string | null;
  readonly title: string;
  readonly notes: string | null;
  readonly status: TaskStatus;
  readonly owner: string | null;
  readonly agent: string | null;
  readonly agentId: string | null;
  readonly assignedAgentId: string | null;
  readonly branch: string | null;
  readonly worktree: string | null;
  /** Archivos reclamados por la tarea (deserializados de JSON en `expected_files`). */
  readonly expectedFiles: readonly string[];
  /** Módulos lógicos reclamados (deserializados de JSON en `modules`). */
  readonly modules: readonly string[];
  /** Dominios de producto tocados (deserializados de JSON en `domains`). */
  readonly domains: readonly string[];
  /** Etiquetas de riesgo (deserializadas de JSON en `risk_tags`). */
  readonly riskTags: readonly string[];
  /** Contador de versión para control de concurrencia optimista (`expected_version`). */
  readonly version: number;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly leaseExpiresAt: string | null;
}

/**
 * Entrada de bitácora registrada mediante `update_work` en la tabla `task_updates`.
 */
export interface ConcordTaskUpdate {
  readonly id: number;
  readonly project: string;
  readonly taskId: string;
  readonly kind: TaskUpdateKind;
  readonly content: string;
  readonly agent: string | null;
  readonly createdAt: string;
}

/**
 * Evidencia de cierre o handoff registrada mediante `finish_work` en la tabla `handoffs`.
 */
export interface ConcordHandoff {
  readonly id: number;
  readonly project: string;
  readonly taskId: string;
  readonly status: string;
  readonly whatChanged: string;
  readonly changedFiles: readonly string[];
  readonly testsRun: readonly string[];
  readonly knownRisks: readonly string[];
  readonly assumptions: readonly string[];
  readonly decisions: readonly string[];
  readonly guardrailsChecked: readonly string[];
  readonly nextSteps: readonly string[];
  readonly fromAgentId: string | null;
  readonly toAgentId: string | null;
  readonly taskVersion: number | null;
  readonly createdAt: string;
}

/**
 * Evento cronológico inmutable proveniente de `.concord/events.jsonl` (o tabla `events`).
 */
export interface ConcordEventLogEntry {
  readonly index: number;
  readonly taskId: string | null;
  readonly tool: string;
  readonly status: string;
  readonly detail: string | null;
  readonly createdAt: string;
}

/**
 * Representa un conflicto de alcance detectado cuando 2 o más tareas activas
 * reclaman simultáneamente el mismo archivo (`file`) o módulo (`module`).
 */
export type CollisionTargetKind = "file" | "module";

export interface ScopeCollisionTaskRef {
  readonly taskId: string;
  readonly title: string;
  readonly agentId: string | null;
  readonly agentKind: string | null;
}

export interface ScopeCollision {
  readonly kind: CollisionTargetKind;
  /** Ruta normalizada del archivo o nombre del módulo en conflicto. */
  readonly target: string;
  /** Lista de tareas activas que reclaman simultáneamente este recurso. */
  readonly conflictingTasks: readonly ScopeCollisionTaskRef[];
}

/**
 * Fotografía completa y consistente del estado de `.concord/` en un instante dado.
 */
export interface ConcordWorkspaceSnapshot {
  readonly workspacePath: string;
  readonly readAt: string;
  readonly agents: readonly ConcordAgent[];
  readonly tasks: readonly ConcordTask[];
  readonly taskUpdates: readonly ConcordTaskUpdate[];
  readonly handoffs: readonly ConcordHandoff[];
  readonly events: readonly ConcordEventLogEntry[];
  readonly collisions: readonly ScopeCollision[];
}

export type WorkspaceUnavailableReason =
  | "missing_directory"
  | "missing_database"
  | "database_locked"
  | "read_error";

/**
 * Unión discriminada para manejar errores de lectura/bloqueo sin excepciones no controladas.
 */
export type ConcordWorkspaceResult =
  | {
      readonly status: "ready";
      readonly snapshot: ConcordWorkspaceSnapshot;
    }
  | {
      readonly status: "unavailable";
      readonly reason: WorkspaceUnavailableReason;
      readonly message: string;
      readonly dbPath: string;
    };

