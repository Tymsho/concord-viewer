/**
 * Componente Presentacional: Línea de Tiempo de Eventos (`EventsTimeline`).
 *
 * Responsabilidad única:
 * Renderizar el flujo cronológico inmutable leído desde `.concord/events.jsonl`
 * (o la tabla `events` de respaldo), mostrando qué herramienta MCP se ejecutó,
 * sobre qué tarea (`taskId`), con qué estado (`status`) y su marca de tiempo.
 */

import type { ConcordEventLogEntry } from "@/lib/domain/types";

export interface EventsTimelineProps {
  readonly events: readonly ConcordEventLogEntry[];
}

function getToolBadgeStyle(tool: string): string {
  if (tool.includes("claim") || tool.includes("start")) {
    return "border-sky-500/40 bg-sky-950/60 text-sky-300";
  }
  if (tool.includes("update")) {
    return "border-violet-500/40 bg-violet-950/60 text-violet-300";
  }
  if (tool.includes("complete") || tool.includes("finish")) {
    return "border-emerald-500/40 bg-emerald-950/60 text-emerald-300";
  }
  return "border-slate-700 bg-slate-800 text-slate-300";
}

function formatEventTime(iso: string): string {
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

export function EventsTimeline({ events }: EventsTimelineProps) {
  return (
    <section
      aria-label="Línea de tiempo de events.jsonl"
      className="flex flex-col rounded-xl border border-slate-800 bg-slate-900/70 p-4 shadow-sm"
    >
      <div className="flex items-center justify-between border-b border-slate-800 pb-3">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-200">
            Timeline de Eventos
          </h2>
          <p className="text-xs text-slate-400">
            Historial inmutable en{" "}
            <code className="font-mono text-slate-300">.concord/events.jsonl</code>
          </p>
        </div>
        <span className="rounded-full border border-slate-700 bg-slate-800 px-2.5 py-0.5 font-mono text-xs font-medium text-slate-200">
          {events.length}
        </span>
      </div>

      {events.length === 0 ? (
        <div className="py-8 text-center text-xs text-slate-400">
          Aún no se registraron eventos en <code className="font-mono">events.jsonl</code>.
        </div>
      ) : (
        <ol className="relative mt-4 ml-2 border-l border-slate-800 space-y-3.5">
          {events.map((event) => {
            const isSuccess = event.status === "success" || event.status === "ok";

            return (
              <li
                key={`${event.index}:${event.createdAt}:${event.tool}`}
                className="ml-4 rounded-lg border border-slate-800/90 bg-slate-950/75 p-3"
              >
                <span
                  className={`absolute -left-1.5 mt-1.5 h-3 w-3 rounded-full border border-slate-950 ${
                    isSuccess ? "bg-emerald-400" : "bg-rose-500"
                  }`}
                />

                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="font-mono text-[10px] text-slate-500">
                      #{event.index}
                    </span>
                    <span
                      className={`rounded border px-2 py-0.5 font-mono text-[11px] font-semibold ${getToolBadgeStyle(
                        event.tool,
                      )}`}
                    >
                      {event.tool}
                    </span>
                    {event.taskId !== null && (
                      <span className="rounded bg-slate-800 px-1.5 py-0.5 font-mono text-[11px] font-medium text-slate-200">
                        {event.taskId}
                      </span>
                    )}
                  </div>

                  <span className="font-mono text-[11px] text-slate-400">
                    {formatEventTime(event.createdAt)}
                  </span>
                </div>

                <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs">
                  <span className="text-slate-300">
                    Detalle:{" "}
                    <code className="font-mono text-slate-200">
                      {event.detail ?? "—"}
                    </code>
                  </span>
                  <span
                    className={`font-mono text-[11px] font-medium ${
                      isSuccess ? "text-emerald-400" : "text-rose-400"
                    }`}
                  >
                    {event.status}
                  </span>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}

