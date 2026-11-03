/**
 * Componente Presentacional: Detector de Colisiones (`CollisionBanner`).
 *
 * Responsabilidad única:
 * Renderizar el estado de integridad de los reclamos de alcance (scope claims).
 * Si `collisions.length === 0`, confirma visualmente que las tareas activas tienen
 * alcances disjuntos. Si existen colisiones, alerta qué archivos o módulos están
 * siendo reclamados simultáneamente y por qué tareas/agentes.
 */

import type { ScopeCollision } from "@/lib/domain/types";

export interface CollisionBannerProps {
  readonly collisions: readonly ScopeCollision[];
  readonly activeTaskCount: number;
}

export function CollisionBanner({
  collisions,
  activeTaskCount,
}: CollisionBannerProps) {
  if (collisions.length === 0) {
    return (
      <section
        aria-label="Estado de colisiones de alcance"
        className="rounded-xl border border-emerald-500/30 bg-emerald-950/25 px-4 py-3.5 text-emerald-200 shadow-sm"
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="relative flex h-3 w-3 shrink-0">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex h-3 w-3 rounded-full bg-emerald-500" />
            </span>
            <div>
              <h2 className="text-sm font-semibold tracking-tight text-emerald-100">
                Detector de Colisiones: Sin conflictos de alcance (0 overlaps)
              </h2>
              <p className="text-xs text-emerald-300/80">
                {activeTaskCount === 0
                  ? "No hay tareas activas reclamando archivos en este momento."
                  : `${activeTaskCount} tarea(s) activa(s) operando sobre conjuntos disjuntos de archivos y módulos.`}
              </p>
            </div>
          </div>
          <span className="rounded-full border border-emerald-500/40 bg-emerald-900/40 px-2.5 py-0.5 font-mono text-xs font-medium text-emerald-200">
            SAFE SCOPE
          </span>
        </div>
      </section>
    );
  }

  return (
    <section
      aria-label="Alerta de colisiones de alcance"
      className="rounded-xl border border-rose-500/50 bg-rose-950/35 p-4 text-rose-100 shadow-md"
    >
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-rose-500/30 pb-3">
        <div className="flex items-center gap-3">
          <span className="relative flex h-3.5 w-3.5 shrink-0">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-rose-400 opacity-80" />
            <span className="relative inline-flex h-3.5 w-3.5 rounded-full bg-rose-500" />
          </span>
          <div>
            <h2 className="text-sm font-bold uppercase tracking-wider text-rose-200">
              Alerta de Colisión Detectada ({collisions.length}{" "}
              {collisions.length === 1 ? "recurso en conflicto" : "recursos en conflicto"})
            </h2>
            <p className="text-xs text-rose-300/90">
              Dos o más tareas activas reclaman simultáneamente los mismos archivos o módulos.
              Resuelve el solapamiento con <code className="font-mono">start_work</code> o{" "}
              <code className="font-mono">transfer_work</code> antes de editar.
            </p>
          </div>
        </div>
        <span className="rounded-full border border-rose-400/50 bg-rose-900/60 px-2.5 py-0.5 font-mono text-xs font-semibold text-rose-100">
          OVERLAP WARNING
        </span>
      </div>

      <ul className="mt-3 grid gap-2.5 sm:grid-cols-2">
        {collisions.map((collision) => (
          <li
            key={`${collision.kind}:${collision.target}`}
            className="rounded-lg border border-rose-500/30 bg-slate-950/60 p-3"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="rounded bg-rose-500/20 px-1.5 py-0.5 font-mono text-[11px] font-semibold uppercase text-rose-300">
                {collision.kind === "file" ? "Archivo" : "Módulo"}
              </span>
              <span className="font-mono text-xs text-rose-300/80">
                {collision.conflictingTasks.length} tareas compitiendo
              </span>
            </div>
            <p className="mt-1.5 break-all font-mono text-xs font-semibold text-white">
              {collision.target}
            </p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {collision.conflictingTasks.map((taskRef) => (
                <span
                  key={taskRef.taskId}
                  className="inline-flex items-center gap-1.5 rounded border border-rose-500/40 bg-rose-950/60 px-2 py-0.5 text-xs text-rose-100"
                  title={taskRef.title}
                >
                  <span className="font-mono font-semibold">{taskRef.taskId}</span>
                  <span className="text-rose-300/80">
                    ({taskRef.agentId ?? taskRef.agentKind ?? "sin-agente"})
                  </span>
                </span>
              ))}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

