/**
 * Motor Puro de Detección de Colisiones de Alcance (Scope Collisions).
 *
 * Principio de Diseño (Domain-Driven Design):
 * Esta lógica pertenece al Dominio Puro (sin dependencias de SQLite ni de Node `fs`).
 * Recibe una colección inmutable de `ConcordTask` y calcula un índice invertido
 * (`recurso -> tareas activas que lo reclaman`). Cualquier recurso con >= 2 tareas
 * activas distintas representa una colisión en vivo.
 */

import type {
  CollisionTargetKind,
  ConcordTask,
  ScopeCollision,
  ScopeCollisionTaskRef,
} from "./types";

/**
 * Normaliza rutas de archivos para que `"src\\lib\\db.ts"`, `"./src/lib/db.ts"` y
 * `"src/lib/db.ts"` colisionen correctamente en entornos Windows/POSIX.
 */
export function normalizeClaimPath(rawPath: string): string {
  return rawPath
    .trim()
    .replace(/\\/g, "/")
    .replace(/^\.\//, "")
    .replace(/\/+/g, "/");
}

function collectCollisionsByKind(
  activeTasks: readonly ConcordTask[],
  kind: CollisionTargetKind,
  extractor: (task: ConcordTask) => readonly string[],
  normalizer: (target: string) => string,
): ScopeCollision[] {
  const claimsByTarget = new Map<string, Map<string, ScopeCollisionTaskRef>>();

  for (const task of activeTasks) {
    const rawTargets = extractor(task);
    for (const rawTarget of rawTargets) {
      const target = normalizer(rawTarget);
      if (target === "") {
        continue;
      }

      let taskMap = claimsByTarget.get(target);
      if (taskMap === undefined) {
        taskMap = new Map<string, ScopeCollisionTaskRef>();
        claimsByTarget.set(target, taskMap);
      }

      if (!taskMap.has(task.taskId)) {
        taskMap.set(task.taskId, {
          taskId: task.taskId,
          title: task.title,
          agentId: task.agentId,
          agentKind: task.agent,
        });
      }
    }
  }

  const collisions: ScopeCollision[] = [];
  for (const [target, taskMap] of claimsByTarget.entries()) {
    if (taskMap.size >= 2) {
      collisions.push({
        kind,
        target,
        conflictingTasks: Array.from(taskMap.values()),
      });
    }
  }

  return collisions.sort((a, b) => a.target.localeCompare(b.target));
}

/**
 * Detecta todas las colisiones de archivos (`expectedFiles`) y módulos (`modules`)
 * entre las tareas que se encuentran actualmente en estado `"active"`.
 */
export function detectScopeCollisions(
  tasks: readonly ConcordTask[],
): readonly ScopeCollision[] {
  const activeTasks = tasks.filter((task) => task.status === "active");
  if (activeTasks.length < 2) {
    return [];
  }

  const fileCollisions = collectCollisionsByKind(
    activeTasks,
    "file",
    (task) => task.expectedFiles,
    normalizeClaimPath,
  );

  const moduleCollisions = collectCollisionsByKind(
    activeTasks,
    "module",
    (task) => task.modules,
    (mod) => mod.trim().toLowerCase(),
  );

  return [...fileCollisions, ...moduleCollisions];
}

