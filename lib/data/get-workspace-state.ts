/**
 * Cargador de Servidor para Server Components (`getWorkspaceState`).
 *
 * Por qué existe este módulo (Primeros Principios en Next.js 16):
 * En `next.config.ts` está habilitado `cacheComponents: true` (Dynamic IO).
 * En este modo de Next.js 16:
 * - No se debe usar `export const dynamic = "force-dynamic"`.
 * - En su lugar, invocamos `await connection()` de `"next/server"`, lo que indica
 *   explícitamente al runtime de Next.js que la lectura depende de una petición
 *   entrante en tiempo real y nunca debe pre-renderizarse de forma estática en build.
 */

import { connection } from "next/server";
import {
  readConcordWorkspaceSnapshot,
  type ReadWorkspaceOptions,
} from "@/lib/data/concord-repository";
import type { ConcordWorkspaceResult } from "@/lib/domain/types";

/**
 * Obtiene el estado actual de `.concord/` desde un Server Component garantizando
 * ejecución dinámica por petición (sin caché estático).
 */
export async function getWorkspaceState(
  options: ReadWorkspaceOptions = {},
): Promise<ConcordWorkspaceResult> {
  await connection();
  return readConcordWorkspaceSnapshot(options);
}

