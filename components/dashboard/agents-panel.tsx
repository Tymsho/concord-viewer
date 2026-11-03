/**
 * Componente Presentacional: Panel de Presencia de Agentes (`AgentsPanel`).
 *
 * Responsabilidad única:
 * Mostrar los agentes registrados en la tabla `agents` junto con su estado de
 * vitalidad calculado (`live`, `idle`, `stale`) y capacidades de su endpoint
 * (`agent_endpoints`: `pull`, `steer`, `busy`).
 */

import type { AgentLiveness, ConcordAgent } from "@/lib/domain/types";

export interface AgentsPanelProps {
  readonly agents: readonly ConcordAgent[];
}

function getLivenessBadgeStyle(liveness: AgentLiveness): {
  readonly dotClass: string;
  readonly badgeClass: string;
  readonly label: string;
} {
  switch (liveness) {
    case "live":
      return {
        dotClass: "bg-emerald-400",
        badgeClass:
          "border-emerald-500/40 bg-emerald-950/60 text-emerald-300",
        label: "LIVE",
      };
    case "idle":
      return {
        dotClass: "bg-amber-400",
        badgeClass: "border-amber-500/40 bg-amber-950/60 text-amber-300",
        label: "IDLE",
      };
    case "stale":
      return {
        dotClass: "bg-slate-500",
        badgeClass: "border-slate-700 bg-slate-900 text-slate-400",
        label: "STALE",
      };
  }
}

function formatHeartbeatAge(ageSeconds: number): string {
  if (ageSeconds < 5) {
    return "ahora mismo";
  }
  if (ageSeconds < 60) {
    return `hace ${ageSeconds}s`;
  }
  const minutes = Math.floor(ageSeconds / 60);
  if (minutes < 60) {
    return `hace ${minutes}m`;
  }
  const hours = Math.floor(minutes / 60);
  return `hace ${hours}h ${minutes % 60}m`;
}

export function AgentsPanel({ agents }: AgentsPanelProps) {
  return (
    <section
      aria-label="Presencia de agentes"
      className="flex flex-col rounded-xl border border-slate-800 bg-slate-900/70 p-4 shadow-sm"
    >
      <div className="flex items-center justify-between border-b border-slate-800 pb-3">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-200">
            Agentes Registrados
          </h2>
          <p className="text-xs text-slate-400">
            Tabla <code className="font-mono text-slate-300">agents</code> +{" "}
            <code className="font-mono text-slate-300">agent_endpoints</code>
          </p>
        </div>
        <span className="rounded-full border border-slate-700 bg-slate-800 px-2.5 py-0.5 font-mono text-xs font-medium text-slate-200">
          {agents.length}
        </span>
      </div>

      {agents.length === 0 ? (
        <div className="py-8 text-center text-xs text-slate-400">
          No hay agentes registrados aún en este workspace.
        </div>
      ) : (
        <ul className="mt-3 space-y-3">
          {agents.map((agent) => {
            const livenessStyle = getLivenessBadgeStyle(agent.liveness);

            return (
              <li
                key={agent.agentId}
                className="rounded-lg border border-slate-800/90 bg-slate-950/70 p-3.5 transition-colors hover:border-slate-700"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span
                      className={`inline-block h-2.5 w-2.5 rounded-full ${livenessStyle.dotClass}`}
                    />
                    <span className="font-mono text-xs font-semibold text-slate-100">
                      {agent.agentId}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="rounded border border-indigo-500/30 bg-indigo-950/50 px-2 py-0.5 font-mono text-[11px] font-medium text-indigo-300">
                      {agent.kind}
                    </span>
                    <span
                      className={`rounded border px-2 py-0.5 font-mono text-[11px] font-semibold ${livenessStyle.badgeClass}`}
                    >
                      {livenessStyle.label}
                    </span>
                  </div>
                </div>

                {agent.summary !== null && agent.summary.trim() !== "" && (
                  <p className="mt-2 text-xs leading-relaxed text-slate-300">
                    {agent.summary}
                  </p>
                )}

                <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-slate-800/70 pt-2 text-[11px] text-slate-400">
                  <span>
                    Último latido:{" "}
                    <strong className="font-mono text-slate-200">
                      {formatHeartbeatAge(agent.ageSeconds)}
                    </strong>
                  </span>
                  {agent.endpoint !== null ? (
                    <div className="flex flex-wrap items-center gap-1">
                      <span className="font-mono text-slate-400">
                        {agent.endpoint.transport}:
                      </span>
                      {agent.endpoint.capabilities.map((cap) => (
                        <span
                          key={cap}
                          className="rounded bg-slate-800 px-1.5 py-0.5 font-mono text-[10px] text-slate-300"
                        >
                          {cap}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <span className="font-mono text-slate-500">sin endpoint</span>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

