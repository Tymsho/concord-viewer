# Concord Web Viewer (`concord-viewer`)

Un panel web de observabilidad en tiempo real y *local-first* construido con **Next.js 16 (App Router), TypeScript estricto, Tailwind CSS v4 y `better-sqlite3`** para inspeccionar el estado de coordinación multi-agente dentro de `.concord/`.

---

## 1. Descripción General

**Concord MCP** es una capa de coordinación *local-first* (basada en Model Context Protocol) que permite que múltiples agentes de programación de IA (`claude-code`, `codex`, `cursor`, `antigravity`, `gemini`, `grok`) colaboren dentro del mismo repositorio sin pisarse los archivos entre sí.

Al ejecutar `concord setup` en un espacio de trabajo, Concord mantiene:
- **`.concord/concord.db`**: Una base de datos SQLite en modo **WAL (Write-Ahead Logging)** que almacena agentes registrados, endpoints activos, tareas, reclamos de alcance (*claims*) sobre archivos y módulos, versiones de concurrencia optimista (`version` / `expected_version`), actualizaciones de contexto de tareas y paquetes de cierre (*handoffs*).
- **`.concord/events.jsonl`**: Un flujo cronológico inmutable (*append-only*) en formato NDJSON que registra cada invocación de herramientas MCP.

**Concord Web Viewer** proporciona un plano de control visual en vivo sobre `.concord/`, permitiendo a los desarrolladores monitorear agentes activos, inspeccionar alcances reclamados, detectar de inmediato colisiones de archivos o módulos, y auditar decisiones técnicas y evidencias de cierre en tiempo real.

---

## 2. Características Principales

- **Detector de Colisiones de Alcance (`CollisionBanner`)**:
  - Calcula un índice invertido en memoria cruzando todas las tareas en estado `active` para detectar reclamos solapados sobre `expected_files` (con normalización automática de rutas Windows/POSIX) y `modules`.
  - Resalta en rojo los badges de archivos o módulos en conflicto directamente dentro de las tarjetas de las tareas afectadas.
- **Presencia de Agentes en Vivo y Telemetría de Latido (`AgentsPanel`)**:
  - Muestra cada agente registrado (`agents` unido mediante `LEFT JOIN` con `agent_endpoints`), su tipo de proveedor (`kind`), resumen de actividad actual, capacidades de su endpoint (`pull`, `steer`, `busy`) y vitalidad calculada (`LIVE` $\le 120\text{s}$, `IDLE` $\le 600\text{s}$, `STALE` $> 600\text{s}$).
- **Tablero de Tareas, Reclamos de Alcance y Evidencia (`TasksBoard`)**:
  - Vista filtrable (`Todas`, `Activas`, `Completadas`) que muestra la versión de concurrencia optimista de cada tarea (`v1`, `v2`, ...), archivos reclamados (`expected_files`), módulos lógicos (`modules`), bitácora progresiva registrada con `update_work` (`decision`, `finding`, `progress`, `blocker`) y evidencia de finalización registrada con `finish_work` (`handoffs`).
- **Línea de Tiempo Inmutable de Eventos (`EventsTimeline`)**:
  - Flujo cronológico parseado desde `.concord/events.jsonl` (con respaldo automático hacia la tabla `events` de SQLite) que muestra números de secuencia, nombres de herramientas (`claim_work`, `update_task`, `complete_task`), tareas asociadas y marcas de tiempo.
- **Polling en Vivo Resiliente y Recuperación No Destructiva ante Bloqueos (`ConcordDashboard`)**:
  - Combina renderizado inicial en servidor (SSR) con un ciclo de *polling* configurable cada 3 segundos (`GET /api/concord`).
  - Si SQLite reporta temporalmente `SQLITE_BUSY` / `503 Service Unavailable` durante un checkpoint del archivo WAL, la interfaz conserva en pantalla la última instantánea válida y muestra una advertencia de sincronización no intrusiva hasta el siguiente ciclo exitoso.

---

## 3. Arquitectura y Principios de Ingeniería

```text
concord-viewer/
├── app/
│   ├── api/concord/route.ts         # GET /api/concord (no-store + códigos HTTP semánticos 200/404/503/500)
│   ├── layout.tsx                   # Estructura raíz de la aplicación y tipografía
│   └── page.tsx                     # Server Component Dynamic IO de Next.js 16 con <Suspense>
├── components/dashboard/
│   ├── agents-panel.tsx             # Presentacional: Presencia de agentes y capacidades de endpoints
│   ├── collision-banner.tsx         # Presentacional: Alerta de colisiones de alcance / estado seguro
│   ├── concord-dashboard.tsx        # Contenedor Cliente: Hidratación, live polling y resiliencia a bloqueos
│   ├── events-timeline.tsx          # Presentacional: Flujo cronológico de events.jsonl
│   └── tasks-board.tsx              # Presentacional: Tareas, claims, actualizaciones y evidencia de handoffs
├── lib/
│   ├── domain/
│   │   ├── types.ts                 # Entidades de dominio inmutables y uniones discriminadas
│   │   ├── parsers.ts               # Type guards en runtime (value is T) y deserializadores de arrays JSON
│   │   └── collisions.ts            # Motor puro de detección de colisiones por índice invertido
│   └── data/
│       ├── concord-repository.ts    # Repositorio better-sqlite3 de solo lectura y lector JSONL
│       └── get-workspace-state.ts   # Cargador dinámico para Server Components usando connection() de next/server
└── docs/
    └── DATA_MODEL_ANALYSIS.md       # Análisis relacional completo y diagrama ER de .concord/concord.db
```

### Decisiones Técnicas Destacadas
1. **Tipado Estricto Total (Cero `any`, Cero Typecasts Forzados `as`)**:
   - SQLite almacena las listas (`expected_files`, `modules`, `capabilities`, etc.) como strings JSON dentro de columnas `TEXT`, mientras que `JSON.parse()` y `response.json()` devuelven `any` en las definiciones estándar de TypeScript.
   - Todas las fronteras de entrada/salida (filas de `better-sqlite3`, líneas de `.concord/events.jsonl` y respuestas HTTP JSON) se validan en tiempo de ejecución mediante predicados de tipo (`value is T`) en [`lib/domain/parsers.ts`](./lib/domain/parsers.ts).
2. **Lectura Concurrente Segura sobre SQLite en Modo WAL**:
   - [`lib/data/concord-repository.ts`](./lib/data/concord-repository.ts) abre `.concord/concord.db` estrictamente con `{ readonly: true, fileMustExist: true, timeout: 3000 }` y cierra la conexión de forma determinista dentro de un bloque `finally`. Esto impide crear archivos de base de datos vacíos por accidente y evita retener descriptores abiertos sobre los archivos `-wal` / `-shm` en Windows.
3. **Modelado de Errores mediante Uniones Discriminadas**:
   - En lugar de lanzar excepciones no controladas cuando `.concord/` no existe o está bloqueada, la capa de datos devuelve [`ConcordWorkspaceResult`](./lib/domain/types.ts) (`status: "ready" | "unavailable"` con razones tipadas: `missing_directory`, `missing_database`, `database_locked`, `read_error`).

---

## 4. Primeros Pasos e Instalación

### Requisitos Previos
- **Node.js** `>= 20.x`
- Un repositorio inicializado con **Concord MCP** (archivo `.concord/concord.db` presente en la raíz del proyecto).
  - *Nota: Este repositorio ya incluye una carpeta `.concord/` real poblada mediante dogfooding de Concord MCP durante su propia construcción.*

### 1. Instalar Dependencias
```bash
npm install
```

### 2. Iniciar el Servidor de Desarrollo
```bash
npm run dev
```
Abre [http://localhost:3000](http://localhost:3000) en tu navegador.

### 3. Verificación de Tipos y Build de Producción
```bash
# Ejecutar verificación estricta de TypeScript
npx tsc --noEmit

# Compilar e iniciar en modo producción
npm run build
npm start
```

---

## 5. Cómo Utilizar el Dashboard

1. **Monitorear la Coordinación Activa**:
   - Mantén abierto [http://localhost:3000](http://localhost:3000) mientras uno o más agentes de IA trabajan en el repositorio.
   - Con el botón **Live Polling (3s)** activado en la barra superior, el Dashboard refleja automáticamente cada llamada a `start_work`, `update_work`, `transfer_work` y `finish_work` en tiempo real.
2. **Inspeccionar Solapamientos de Alcance (Colisiones)**:
   - Observa el banner **Detector de Colisiones** en la parte superior. Si dos tareas activas reclaman el mismo archivo o módulo, el banner cambia a rojo (`OVERLAP WARNING`), lista los recursos en disputa y resalta los badges de archivos en conflicto dentro del **Tablero de Tareas**.
3. **Filtrar Tareas y Revisar Evidencia**:
   - Usa las pestañas **Todas / Activas / Completadas** en la columna central para inspeccionar reclamos activos, leer las decisiones arquitectónicas registradas mediante `update_work` y verificar la evidencia de cierre (`what_changed`, `decisions`, `changed_files`) registrada mediante `finish_work`.
4. **Consultar la API HTTP Directamente**:
   - Endpoint: `GET /api/concord?maxEvents=200`
   - Códigos de Estado HTTP:
     - `200 OK`: Instantánea lista (`status: "ready"`).
     - `404 Not Found`: El directorio `.concord/` o el archivo `concord.db` aún no existen.
     - `503 Service Unavailable`: SQLite está temporalmente bloqueada (`Retry-After: 1`).
     - `500 Internal Server Error`: Error inesperado de lectura.

---

## 6. Historial de Dogfooding con Concord MCP

Este proyecto fue construido de principio a fin utilizando **Concord MCP** para coordinar sus propias fases de desarrollo:
- **`TASK-01`**: Inspección en vivo del esquema de `.concord/concord.db` y documentación en [`docs/DATA_MODEL_ANALYSIS.md`](./docs/DATA_MODEL_ANALYSIS.md).
- **`TASK-02`**: Implementación del modelo de dominio puro, predicados de tipo en runtime, motor de colisiones y repositorio de solo lectura con `better-sqlite3`.
- **`TASK-03`**: Implementación del cargador dinámico para Server Components en Next.js 16 y el Route Handler `GET /api/concord`.
- **`TASK-04`**: Implementación de los componentes visuales del Dashboard en Tailwind CSS y el contenedor interactivo con *live polling*.
- **`TASK-05`**: Redacción de la documentación oficial en inglés en [`README.md`](./README.md).
- **`TASK-06`**: Traducción completa de la documentación al español en `README-Es.md`.

