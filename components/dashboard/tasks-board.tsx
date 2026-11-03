"use client";

/**
 * Componente Presentacional con Filtro Local: Tablero de Tareas y Alcance (`TasksBoard`).
 *
 * Responsabilidad única:
 * Visualizar las tareas registradas en `tasks`, sus archivos reclamados (`expectedFiles`),
 * sus módulos (`modules`), versión optimista (`version`), historial de contexto
 * (`taskUpdates`) y evidencia de cierre (`handoffs`), resaltando en rojo cualquier
 * archivo o módulo que esté involucrado en una colisión activa.
 */

import { useState } from "react";
import { normalizeClaimPath } from "@/lib/domain/collisions";
import type {
  ConcordHandoff,
  ConcordTask,
  ConcordTaskUpdate,
  ScopeCollision,
  TaskUpdateKind,
} from "@/lib/domain/types";

export interface TasksBoardProps {
  readonly tasks: readonly ConcordTask[];
  readonly taskUpdates: readonly ConcordTaskUpdate[];
  readonly handoffs: readonly ConcordHandoff[];
  readonly collisions: readonly ScopeCollision[];
}

type StatusFilter = "all" | "active" | "complete";

function getTaskStatusStyle(status: string): {
  readonly badgeClass: string;
  readonly borderClass: string;
} {
  switch (status) {
    case "active":
      return {
        badgeClass:
          "border-sky-500/40 bg-sky-950/70 text-sky-300",
        borderClass: "border-sky-500/35",
      };
    case "review_ready":
      return {
        badgeClass:
          "border-amber-500/40 bg-amber-950/70 text-amber-300",
        borderClass: "border-amber-500/30",
      };
    case "complete":
      return {
        badgeClass:
          "border-emerald-500/40 bg-emerald-950/60 text-emerald-300",
        borderClass: "border-slate-800",
      };
    default:
      return {
        badgeClass:
          "border-slate-700 bg-slate-800 text-slate-300",
        borderClass: "border-slate-800",
      };
  }
}

function getUpdateKindBadge(kind: TaskUpdateKind): string {
  switch (kind) {
    case "decision":
      return "border-violet-500/40 bg-violet-950/60 text-violet-300";
    case "finding":
      return "border-cyan-500/40 bg-cyan-950/60 text-cyan-300";
    case "blocker":
      return "border-rose-500/40 bg-rose-950/60 text-rose-300";
    case "progress":
    case "intent":
    case "assumption":
    case "question":
    case "answer":
      return "border-slate-700 bg-slate-800/80 text-slate-300";
  }
}

function formatShortTimestamp(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return iso;
  }
  return date.toLocaleTimeString("es-AR", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

export function TasksBoard({
  tasks,
  taskUpdates,
  handoffs,
  collisions,
}: TasksBoardProps) {
  const [filter, setFilter] = useState<StatusFilter>("all");

  const collidingFiles = new Set<string>(
    collisions
      .filter((c) => c.kind === "file")
      .map((c) => c.target),
  );
  const collidingModules = new Set<string>(
    collisions
      .filter((c) => c.kind === "module")
      .map((c) => c.target),
  );

  const filteredTasks = tasks.filter((task) => {
    if (filter === "all") {
      return true;
    }
    if (filter === "active") {
      return task.status === "active" || task.status === "review_ready";
    }
    return task.status === "complete" || task.status === "closed";
  });

  return (
    <section
      aria-label="Tablero de tareas y claims"
      className="flex flex-col rounded-xl border border-slate-800 bg-slate-900/70 p-4 shadow-sm"
    >
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-3">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-200">
            Tareas, Scope Claims y Evidencia
          </h2>
          <p className="text-xs text-slate-400">
            Tablas <code className="font-mono text-slate-300">tasks</code>,{" "}
            <code className="font-mono text-slate-300">task_updates</code> y{" "}
            <code className="font-mono text-slate-300">handoffs</code>
          </p>
        </div>

        <div className="flex items-center gap-1 rounded-lg border border-slate-800 bg-slate-950 p-1 text-xs">
          <button
            type="button"
            onClick={() => setFilter("all")}
            className={`rounded-md px-2.5 py-1 font-medium transition-colors ${
              filter === "all"
                ? "bg-slate-800 text-white"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            Todas ({tasks.length})
          </button>
          <button
            type="button"
            onClick={() => setFilter("active")}
            className={`rounded-md px-2.5 py-1 font-medium transition-colors ${
              filter === "active"
                ? "bg-sky-950 text-sky-200"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            Activas ({tasks.filter((t) => t.status === "active").length})
          </button>
          <button
            type="button"
            onClick={() => setFilter("complete")}
            className={`rounded-md px-2.5 py-1 font-medium transition-colors ${
              filter === "complete"
                ? "bg-emerald-950 text-emerald-200"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            Completadas ({tasks.filter((t) => t.status === "complete").length})
          </button>
        </div>
      </div>

      {filteredTasks.length === 0 ? (
        <div className="py-10 text-center text-xs text-slate-400">
          No hay tareas que coincidan con el filtro seleccionado.
        </div>
      ) : (
        <div className="mt-4 space-y-4">
          {filteredTasks.map((task) => {
            const statusStyle = getTaskStatusStyle(task.status);
            const updatesForTask = taskUpdates.filter(
              (u) => u.taskId === task.taskId && u.project === task.project,
            );
            const latestHandoff = handoffs.find(
              (h) => h.taskId === task.taskId && h.project === task.project,
            );

            return (
              <article
                key={`${task.project}:${task.taskId}`}
                className={`rounded-xl border bg-slate-950/80 p-4 transition-colors ${statusStyle.borderClass}`}
              >
                {/* Encabezado de la Tarea */}
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded bg-slate-800 px-2 py-0.5 font-mono text-xs font-bold text-white">
                      {task.taskId}
                    </span>
                    <h3 className="text-sm font-semibold text-slate-100">
                      {task.title}
                    </h3>
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5">
                    <span
                      title="Versión de control de concurrencia optimista (expected_version)"
                      className="rounded border border-slate-700 bg-slate-900 px-2 py-0.5 font-mono text-[11px] text-slate-300"
                    >
                      v{task.version}
                    </span>
                    <span
                      className={`rounded border px-2 py-0.5 font-mono text-[11px] font-semibold uppercase ${statusStyle.badgeClass}`}
                    >
                      {task.status}
                    </span>
                  </div>
                </div>

                {/* Notas e Identidad del Agente */}
                {task.notes !== null && task.notes.trim() !== "" && (
                  <p className="mt-2 text-xs leading-relaxed text-slate-300">
                    {task.notes}
                  </p>
                )}

                <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-slate-400">
                  <span>
                    Agente:{" "}
                    <strong className="font-mono text-slate-200">
                      {task.agentId ?? task.agent ?? "sin asignar"}
                    </strong>
                  </span>
                  <span>
                    Actualizado:{" "}
                    <strong className="font-mono text-slate-300">
                      {formatShortTimestamp(task.updatedAt)}
                    </strong>
                  </span>
                </div>

                {/* Reclamos de Alcance (Archivos y Módulos) */}
                <div className="mt-3 grid gap-3 rounded-lg border border-slate-800/80 bg-slate-900/50 p-3 sm:grid-cols-2">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                      Archivos Reclamados (expected_files)
                    </p>
                    {task.expectedFiles.length === 0 ? (
                      <p className="mt-1 text-xs italic text-slate-500">
                        Sin archivos declarados
                      </p>
                    ) : (
                      <ul className="mt-1.5 flex flex-wrap gap-1.5">
                        {task.expectedFiles.map((file) => {
                          const normalized = normalizeClaimPath(file);
                          const isColliding =
                            task.status === "active" &&
                            collidingFiles.has(normalized);

                          return (
                            <li
                              key={file}
                              className={`rounded border px-2 py-0.5 font-mono text-[11px] ${
                                isColliding
                                  ? "border-rose-500/60 bg-rose-950/70 font-semibold text-rose-200"
                                  : "border-slate-700/80 bg-slate-950 text-slate-200"
                              }`}
                            >
                              {file}
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </div>

                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                      Módulos (modules)
                    </p>
                    {task.modules.length === 0 ? (
                      <p className="mt-1 text-xs italic text-slate-500">
                        Sin módulos declarados
                      </p>
                    ) : (
                      <ul className="mt-1.5 flex flex-wrap gap-1.5">
                        {task.modules.map((mod) => {
                          const isColliding =
                            task.status === "active" &&
                            collidingModules.has(mod.trim().toLowerCase());

                          return (
                            <li
                              key={mod}
                              className={`rounded border px-2 py-0.5 font-mono text-[11px] ${
                                isColliding
                                  ? "border-rose-500/60 bg-rose-950/70 font-semibold text-rose-200"
                                  : "border-indigo-500/30 bg-indigo-950/40 text-indigo-200"
                              }`}
                            >
                              {mod}
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </div>
                </div>

                {/* Actualizaciones de Contexto (update_work) */}
                {updatesForTask.length > 0 && (
                  <div className="mt-3 border-t border-slate-800/80 pt-3">
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                      Decisiones y Hallazgos ({updatesForTask.length})
                    </p>
                    <ul className="mt-2 space-y-2">
                      {updatesForTask.map((update) => (
                        <li
                          key={update.id}
                          className="rounded-lg border border-slate-800/90 bg-slate-900/60 p-2.5 text-xs"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span
                              className={`rounded border px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase ${getUpdateKindBadge(
                                update.kind,
                              )}`}
                            >
                              {update.kind}
                            </span>
                            <span className="font-mono text-[10px] text-slate-400">
                              {formatShortTimestamp(update.createdAt)}
                            </span>
                          </div>
                          <p className="mt-1.5 leading-relaxed text-slate-200">
                            {update.content}
                          </p>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Evidencia de Cierre (finish_work / handoff) */}
                {latestHandoff !== undefined && (
                  <div className="mt-3 rounded-lg border border-emerald-500/25 bg-emerald-950/15 p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-mono text-[11px] font-semibold uppercase tracking-wider text-emerald-300">
                        Evidencia de Cierre (finish_work)
                      </span>
                      <span className="font-mono text-[10px] text-emerald-400/80">
                        {formatShortTimestamp(latestHandoff.createdAt)}
                      </span>
                    </div>
                    <p className="mt-1.5 text-xs text-emerald-100">
                      {latestHandoff.whatChanged}
                    </p>
                    {latestHandoff.decisions.length > 0 && (
                      <ul className="mt-2 list-disc space-y-1 pl-4 text-[11px] text-slate-300">
                        {latestHandoff.decisions.map((decision) => (
                          <li key={decision}>{decision}</li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}

