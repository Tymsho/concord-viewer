/**
 * Route Handler: `GET /api/concord`
 *
 * Propósito Arquitectónico:
 * Expone una instantánea en tiempo real de `.concord/concord.db` y `.concord/events.jsonl`
 * para que el cliente (Dashboard) pueda hacer polling sin recargar la página completa.
 *
 * Mapeo Semántico de Estados HTTP:
 * - `200 OK`: Lectura exitosa (`status: "ready"`).
 * - `404 Not Found`: `.concord/` o `concord.db` aún no existen (`missing_directory` | `missing_database`).
 * - `503 Service Unavailable`: SQLite reportó bloqueo temporal (`database_locked`), incluye `Retry-After: 1`.
 * - `500 Internal Server Error`: Error inesperado de lectura (`read_error`).
 */

import { connection, NextResponse, type NextRequest } from "next/server";
import { readConcordWorkspaceSnapshot } from "@/lib/data/concord-repository";
import type {
  ConcordWorkspaceResult,
  WorkspaceUnavailableReason,
} from "@/lib/domain/types";

const NO_STORE_HEADERS: Readonly<Record<string, string>> = {
  "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
  Pragma: "no-cache",
  Expires: "0",
};

function mapUnavailableReasonToHttpStatus(reason: WorkspaceUnavailableReason): number {
  switch (reason) {
    case "missing_directory":
    case "missing_database":
      return 404;
    case "database_locked":
      return 503;
    case "read_error":
      return 500;
  }
}

function parseMaxEventsParam(rawParam: string | null): number {
  if (rawParam === null) {
    return 200;
  }
  const parsed = Number.parseInt(rawParam, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 200;
  }
  return Math.min(parsed, 1000);
}

export async function GET(
  request: NextRequest,
): Promise<NextResponse<ConcordWorkspaceResult>> {
  await connection();

  const maxEvents = parseMaxEventsParam(
    request.nextUrl.searchParams.get("maxEvents"),
  );
  const result = readConcordWorkspaceSnapshot({ maxEvents });

  if (result.status === "ready") {
    return NextResponse.json(result, {
      status: 200,
      headers: NO_STORE_HEADERS,
    });
  }

  const httpStatus = mapUnavailableReasonToHttpStatus(result.reason);
  const headers: Record<string, string> = { ...NO_STORE_HEADERS };
  if (result.reason === "database_locked") {
    headers["Retry-After"] = "1";
  }

  return NextResponse.json(result, {
    status: httpStatus,
    headers,
  });
}

