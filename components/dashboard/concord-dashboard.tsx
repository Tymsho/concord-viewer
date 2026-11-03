"use client";

/**
 * Componente Contenedor Interactivo (`ConcordDashboard`).
 *
 * Decisiones Arquitectónicas (Primeros Principios):
 * 1. Hidratación Instantánea + Live Polling:
 *    Recibe `initialResult` desde el Server Component (`app/page.tsx`) para que el
 *    primer renderizado sea inmediato (SSR), y mantiene el estado sincronizado
 *    consultando `GET /api/concord` cada `pollIntervalMs` (3 segundos por defecto).
 * 2. Resiliencia ante Bloqueos Transitorios (`database_locked`):
 *    Si durante el polling SQLite devuelve `503 database_locked`, conservamos en
 *    pantalla el último `snapshot` válido y mostramos un indicador de advertencia
 *    no destructivo hasta el siguiente ciclo.
 * 3. Validación de Frontera de Red sin `any` ni `as`:
 *    El JSON recibido de `fetch("/api/concord")` se asigna a `unknown` y se valida
 *    mediante el predicado de tipo `isConcordWorkspaceResult`.
 */

import { useCallback, useEffect, useState } from "react";
import { AgentsPanel } from "@/components/dashboard/agents-panel";
import { CollisionBanner } from "@/components/dashboard/collision-banner";
import { EventsTimeline } from "@/components/dashboard/events-timeline";
import { TasksBoard } from "@/components/dashboard/tasks-board";
import { isRecord } from "@/lib/domain/parsers";
import type {
  ConcordWorkspaceResult,
  ConcordWorkspaceSnapshot,
  WorkspaceUnavailableReason,
} from "@/lib/domain/types";

export interface ConcordDashboardProps {
  readonly initialResult: ConcordWorkspaceResult;
  readonly pollIntervalMs?: number;
}

function isUnavailableReason(value: unknown): value is WorkspaceUnavailableReason {
  return (
    value === "missing_directory" ||
    value === "missing_database" ||
    value === "database_locked" ||
    value === "read_error"
  );
}

function isConcordWorkspaceSnapshot(
  value: unknown,
): value is ConcordWorkspaceSnapshot {
  if (!isRecord(value)) {
    return false;
  }
  return (
    typeof value["workspacePath"] === "string" &&
    typeof value["readAt"] === "string" &&
    Array.isArray(value["agents"]) &&
    Array.isArray(value["tasks"]) &&
    Array.isArray(value["taskUpdates"]) &&
    Array.isArray(value["handoffs"]) &&
    Array.isArray(value["events"]) &&
    Array.isArray(value["collisions"])
  );
}

function isConcordWorkspaceResult(
  value: unknown,
): value is ConcordWorkspaceResult {
  if (!isRecord(value)) {
    return false;
  }
  if (value["status"] === "ready") {
    return isConcordWorkspaceSnapshot(value["snapshot"]);
  }
  if (value["status"] === "unavailable") {
    return (
      isUnavailableReason(value["reason"]) &&
      typeof value["message"] === "string" &&
      typeof value["dbPath"] === "string"
    );
  }
  return false;
}

function formatReadTimestamp(iso: string): string {
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

export function ConcordDashboard({
  initialResult,
  pollIntervalMs = 3000,
}: ConcordDashboardProps) {
  const [result, setResult] = useState<ConcordWorkspaceResult>(initialResult);
  const [lastValidSnapshot, setLastValidSnapshot] =
    useState<ConcordWorkspaceSnapshot | null>(
      initialResult.status === "ready" ? initialResult.snapshot : null,
    );
  const [autoRefresh, setAutoRefresh] = useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [transientWarning, setTransientWarning] = useState<string | null>(null);

  const fetchLatestState = useCallback(async () => {
    setIsRefreshing(true);
    try {
      const response = await fetch("/api/concord", {
        method: "GET",
        cache: "no-store",
      });
      const payload: unknown = await response.json();

      if (!isConcordWorkspaceResult(payload)) {
        setTransientWarning("Respuesta inesperada del endpoint /api/concord.");
        return;
      }

      setResult(payload);
      if (payload.status === "ready") {
        setLastValidSnapshot(payload.snapshot);
        setTransientWarning(null);
      } else if (payload.reason === "database_locked") {
        setTransientWarning(
          "SQLite temporalmente ocupada (WAL checkpoint en curso). Mostrando última lectura válida.",
        );
      } else {
        setTransientWarning(payload.message);
      }
    } catch {
      setTransientWarning(
        "No se pudo conectar con /api/concord. Reintentando en el próximo ciclo.",
      );
    } finally {
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    if (!autoRefresh) {
      return undefined;
    }
    const intervalId = window.setInterval(() => {
      void fetchLatestState();
    }, pollIntervalMs);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [autoRefresh, fetchLatestState, pollIntervalMs]);

  const activeSnapshot =
    result.status === "ready" ? result.snapshot : lastValidSnapshot;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      {/* Barra Superior de Observabilidad */}
      <header className="sticky top-0 z-20 border-b border-slate-800/90 bg-slate-950/90 backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-4 py-3.5 sm:px-6">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-indigo-500/40 bg-indigo-950/70 font-mono text-sm font-bold text-indigo-300">
              C
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-base font-bold tracking-tight text-white">
                  Concord MCP Viewer
                </h1>
                <span className="rounded border border-indigo-500/30 bg-indigo-950/60 px-2 py-0.5 font-mono text-[11px] font-medium text-indigo-300">
                  Local-First Observatory
                </span>
              </div>
              <p className="font-mono text-xs text-slate-400">
                {activeSnapshot !== null
                  ? activeSnapshot.workspacePath
                  : result.status === "unavailable"
                    ? result.dbPath
                    : ".concord/"}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 text-xs">
            {activeSnapshot !== null && (
              <span className="rounded-lg border border-slate-800 bg-slate-900 px-2.5 py-1.5 font-mono text-slate-300">
                Lectura:{" "}
                <strong className="text-white">
                  {formatReadTimestamp(activeSnapshot.readAt)}
                </strong>
              </span>
            )}

            <button
              type="button"
              onClick={() => setAutoRefresh((prev) => !prev)}
              className={`inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 font-medium transition-colors ${
                autoRefresh
                  ? "border-emerald-500/40 bg-emerald-950/50 text-emerald-200 hover:bg-emerald-950/80"
                  : "border-slate-700 bg-slate-900 text-slate-300 hover:bg-slate-800"
              }`}
            >
              <span
                className={`h-2 w-2 rounded-full ${
                  autoRefresh ? "bg-emerald-400" : "bg-slate-500"
                }`}
              />
              {autoRefresh ? "Live Polling (3s)" : "Polling Pausado"}
            </button>

            <button
              type="button"
              onClick={() => {
                void fetchLatestState();
              }}
              disabled={isRefreshing}
              className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 font-medium text-slate-100 transition-colors hover:bg-slate-700 disabled:opacity-50"
            >
              {isRefreshing ? "Sincronizando..." : "Refrescar ahora"}
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl space-y-6 px-4 py-6 sm:px-6">
        {/* Aviso no destructivo si ocurre un bloqueo transitorio durante el polling */}
        {transientWarning !== null && activeSnapshot !== null && (
          <div className="rounded-lg border border-amber-500/40 bg-amber-950/40 px-4 py-2.5 text-xs text-amber-200">
            <strong className="font-semibold">Aviso de sincronización:</strong>{" "}
            {transientWarning}
          </div>
        )}

        {/* Estado de error inicial si .concord/ no existe o nunca pudo leerse */}
        {activeSnapshot === null && result.status === "unavailable" ? (
          <section className="rounded-2xl border border-amber-500/40 bg-slate-900/80 p-8 text-center shadow-lg">
            <span className="inline-block rounded-full border border-amber-500/40 bg-amber-950/60 px-3 py-1 font-mono text-xs font-semibold uppercase text-amber-300">
              {result.reason}
            </span>
            <h2 className="mt-3 text-lg font-bold text-white">
              Estado de Concord MCP no disponible
            </h2>
            <p className="mx-auto mt-2 max-w-xl text-sm text-slate-300">
              {result.message}
            </p>
            <p className="mt-2 font-mono text-xs text-slate-400">
              Ruta inspeccionada: {result.dbPath}
            </p>
            <button
              type="button"
              onClick={() => {
                void fetchLatestState();
              }}
              className="mt-5 rounded-lg border border-indigo-500/40 bg-indigo-600 px-4 py-2 text-xs font-semibold text-white hover:bg-indigo-500"
            >
              Reintentar lectura
            </button>
          </section>
        ) : null}

        {activeSnapshot !== null && (
          <>
            {/* Métricas Rápidas de Cabecera */}
            <section
              aria-label="Resumen de métricas del workspace"
              className="grid grid-cols-2 gap-3 sm:grid-cols-4"
            >
              <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-3.5">
                <p className="text-xs text-slate-400">Agentes Activos</p>
                <p className="mt-1 font-mono text-2xl font-bold text-white">
                  {activeSnapshot.agents.length}
                </p>
              </div>
              <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-3.5">
                <p className="text-xs text-slate-400">Tareas en Curso</p>
                <p className="mt-1 font-mono text-2xl font-bold text-sky-400">
                  {
                    activeSnapshot.tasks.filter((t) => t.status === "active")
                      .length
                  }
                </p>
              </div>
              <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-3.5">
                <p className="text-xs text-slate-400">Colisiones Detectadas</p>
                <p
                  className={`mt-1 font-mono text-2xl font-bold ${
                    activeSnapshot.collisions.length > 0
                      ? "text-rose-400"
                      : "text-emerald-400"
                  }`}
                >
                  {activeSnapshot.collisions.length}
                </p>
              </div>
              <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-3.5">
                <p className="text-xs text-slate-400">Eventos Registrados</p>
                <p className="mt-1 font-mono text-2xl font-bold text-indigo-300">
                  {activeSnapshot.events.length}
                </p>
              </div>
            </section>

            {/* Detector de Colisiones */}
            <CollisionBanner
              collisions={activeSnapshot.collisions}
              activeTaskCount={
                activeSnapshot.tasks.filter((t) => t.status === "active").length
              }
            />

            {/* Grid Principal de 3 Columnas: Agentes | Tareas y Claims | Timeline */}
            <div className="grid gap-6 lg:grid-cols-12">
              <div className="lg:col-span-3">
                <AgentsPanel agents={activeSnapshot.agents} />
              </div>

              <div className="lg:col-span-6">
                <TasksBoard
                  tasks={activeSnapshot.tasks}
                  taskUpdates={activeSnapshot.taskUpdates}
                  handoffs={activeSnapshot.handoffs}
                  collisions={activeSnapshot.collisions}
                />
              </div>

              <div className="lg:col-span-3">
                <EventsTimeline events={activeSnapshot.events} />
              </div>
            </div>
          </>
        )}
      </main>
    </div>
  );
}

