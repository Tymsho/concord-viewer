/**
 * Página Principal (`app/page.tsx` — Server Component).
 *
 * Patrón de Renderizado (Next.js 16 con `cacheComponents: true`):
 * Envolvemos el Server Component dinámico (`WorkspaceServerLoader`) en un límite
 * `<Suspense>` para cumplir con el modelo Dynamic IO de Next.js 16 cuando se invoca
 * `await connection()`. El servidor lee `.concord/concord.db` y `.concord/events.jsonl`
 * en modo `readonly: true` y entrega el estado inicial hidratado a `ConcordDashboard`.
 */

import { Suspense } from "react";
import { ConcordDashboard } from "@/components/dashboard/concord-dashboard";
import { getWorkspaceState } from "@/lib/data/get-workspace-state";

async function WorkspaceServerLoader() {
  const initialResult = await getWorkspaceState();
  return <ConcordDashboard initialResult={initialResult} />;
}

function DashboardLoadingFallback() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-950 p-6 text-slate-300">
      <div className="flex items-center gap-3 rounded-xl border border-slate-800 bg-slate-900 px-5 py-3.5 text-sm">
        <span className="h-2.5 w-2.5 animate-ping rounded-full bg-indigo-400" />
        <span>Cargando estado de .concord/concord.db...</span>
      </div>
    </div>
  );
}

export default function HomePage() {
  return (
    <Suspense fallback={<DashboardLoadingFallback />}>
      <WorkspaceServerLoader />
    </Suspense>
  );
}
