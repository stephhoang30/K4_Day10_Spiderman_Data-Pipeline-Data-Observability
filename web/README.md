# Data Pipeline & Data Observability — Frontend

Next.js (App Router) dashboard for the K4 Day 10 lab. It explains and evidences the
pipeline `crawl → clean → index → evaluate → observe → corrupt → repair → compare`.

## The one rule

**No mock data.** Nothing in `web/` invents, hardcodes, seeds or fixtures a pipeline
value. Every number, paper, metric and table row rendered by the UI is read at request
time from a real artifact file. When an artifact does not exist yet, the UI renders an
empty state that names the missing file path and the exact command that produces it —
it never falls back to sample data.

Most artifacts do not exist yet (the Python pipeline is still being implemented), so
empty states are the expected default view.

## Run it

```bash
cd web
npm install
npm run dev            # http://localhost:3000
```

Other scripts:

```bash
npm run build          # production build (type-check + lint clean)
npm run start          # serve the production build
npm run lint           # eslint
```

The app reads the repo's `data/` directory directly — no Python server needs to be
running. Produce artifacts from the repository root:

```bash
uv run python script/export_pipeline_spec.py   # data/pipeline_spec.json
uv run python script/run_phase1.py             # crawl → clean → index → evaluate → observe
uv run python script/run_corruption_flow.py    # corrupt → repair → compare
```

Reload the page after a run; nothing is cached.

## Environment

See `.env.example`. Both variables are optional.

| Variable | Scope | Default | Purpose |
| --- | --- | --- | --- |
| `NEXT_PUBLIC_API_BASE_URL` | browser | `/api` | Prefix every fetcher in `src/lib/api.ts` uses. Point it at the Python backend when one exists. |
| `PIPELINE_DATA_DIR` | server | `path.join(process.cwd(), "..", "data")` | Absolute path of the artifact directory the route handlers read. |

## Architecture

```
UI pages  ──imports──▶  src/lib/api.ts  ──fetch(API_BASE + path)──▶  HTTP
                                                                      │
                                            ┌─────────────────────────┴──────────────────┐
                                            │ today: src/app/api/**/route.ts (fs reads)  │
                                            │ later: the Python backend                  │
                                            └────────────────────────────────────────────┘
```

| File | Role |
| --- | --- |
| `src/lib/types.ts` | TypeScript shapes for every artifact. Structure only — no artifact values. |
| `src/lib/api.ts` | The single data-access module the UI imports. Owns `API_BASE`. Never throws. |
| `src/lib/artifacts.ts` | **Server only.** Filesystem implementation used by the route handlers. |
| `src/app/api/**/route.ts` | The *current* implementation of the API contract below. |
| `src/lib/stage-map.ts` | Which logical artifacts belong to which stage (structure, not data). |
| `src/lib/use-artifact.ts` | Client hook that turns a fetcher into `loading / ok / missing / error`. |

Pages are Client Components that call `src/lib/api.ts` on mount. That is deliberate:
`NEXT_PUBLIC_API_BASE_URL` is a browser-visible variable, so a relative `/api` base and
an absolute backend origin both work with no server-side URL resolution and no
self-fetching during build.

### Result type

Every fetcher returns a discriminated result, so "artifact not produced yet" is
distinguishable from "the request failed". Missing artifacts never throw.

```ts
type ArtifactResult<T> =
  | { status: "ok";      data: T; path?: string }
  | { status: "missing"; path: string; hint: string }
  | { status: "error";   message: string };
```

`hint` is the **exact command** that produces the missing artifact, e.g.
`uv run python script/run_phase1.py`.

## API contract

All routes are `GET`, return `application/json`, and are never cached.

**Success — HTTP 200**

```json
{ "status": "ok", "path": "data/clean/papers_clean.json", "data": <artifact body> }
```

**Artifact missing — HTTP 404**

```json
{ "status": "missing", "path": "data/clean/papers_clean.json", "hint": "uv run python script/run_phase1.py" }
```

**Failure — HTTP 4xx/5xx**

```json
{ "status": "error", "message": "…" }
```

`src/lib/api.ts` also accepts a bare artifact body (no envelope) with HTTP 200, so a
backend that simply serves the raw JSON works without frontend changes.

| Route | `data` shape | Source artifact |
| --- | --- | --- |
| `GET /api/pipeline-spec` | `PipelineSpec` | `data/pipeline_spec.json` |
| `GET /api/artifacts` | `ArtifactIndex` | derived: `fs.stat` over every path in `pipeline_spec.artifacts` |
| `GET /api/raw/records` | `PaperRecord[]` | `artifacts.raw_records` |
| `GET /api/raw/response` | `unknown` (verbatim) | `artifacts.raw_api_response` |
| `GET /api/clean/{clean\|corrupted\|repaired}` | `CleanRow[]` | `artifacts.clean_json` / `corrupted_json` / `repaired_json` |
| `GET /api/corruption-log` | `CorruptionLog` | `artifacts.corruption_log` |
| `GET /api/metrics/{baseline\|corrupted\|repaired}` | `RunMetrics` | `artifacts.{state}_metrics` |
| `GET /api/answers/{baseline\|corrupted\|repaired}` | `AnswerRecord[]` | `artifacts.{state}_answers` |
| `GET /api/test-set` | `TestQuestion[]` | `artifacts.test_set` |
| `GET /api/freshness` | `FreshnessReport` (verbatim) | `artifacts.freshness_report` |
| `GET /api/quality` | `QualityBundle` | every `*.json` in the freshness report's directory |
| `GET /api/reports/{phase1\|corruption}` | `MarkdownReport` = `{ path, markdown }` | `artifacts.baseline_report` / `comparison_report` |

Notes:

- Artifact paths are never hardcoded in the frontend. Routes look each path up by its
  logical name in `pipeline_spec.artifacts`, so renaming a file on the Python side only
  requires re-exporting the spec.
- `/api/freshness` and `/api/quality` return their file bodies **verbatim**. Those shapes
  are not final upstream, so the UI renders known keys when it recognises them and falls
  back to generic key/value rendering for everything else.
- An unknown `{state}` or `{name}` segment returns HTTP 400 with `status: "error"`.
- Paths that would resolve outside the data directory are refused.

## Pointing the frontend at a real backend

When the Python side exposes HTTP, no frontend code changes:

1. Implement the routes in the table above on the Python server, using the same
   response envelope (or serve the bare artifact body with HTTP 200 and a 404 for
   missing artifacts — `src/lib/api.ts` handles both). Keep `status: "missing"` 404s
   returning `path` and `hint` so empty states stay informative.
2. Enable CORS for the dashboard's origin if the backend runs on a different port.
3. Set the base URL and restart:

   ```bash
   echo 'NEXT_PUBLIC_API_BASE_URL=http://127.0.0.1:8000/api' >> web/.env.local
   npm run dev     # or: npm run build && npm run start
   ```

   `NEXT_PUBLIC_*` values are inlined at build time — a rebuild/restart is required.
4. Optional cleanup once the backend is authoritative: delete `src/app/api/**` and
   `src/lib/artifacts.ts`. Nothing else imports them.

If only the artifact *location* changes (not the transport), set `PIPELINE_DATA_DIR`
instead and keep using the built-in route handlers.

## Views

| Route | What it shows |
| --- | --- |
| `/` | Pipeline map. Stage status derived from artifact existence on disk, artifact paths, generating commands, and the full artifact index. |
| `/crawl` | Source API / query / Crossref filter / `max_results` from the spec; fetched `PaperRecord` table; collapsible raw API response. |
| `/clean` | The 16-column contract (derived vs source), reject + dedupe rules, `text_for_embedding` template, the cleaned dataset, and row-count in/out. |
| `/corrupt` | The six corruption kinds with pillar / fraction / detail, the fixed seed, the corruption log (rows and unique ids before/after, per-action rows and paper ids), and the corrupted / repaired datasets. |
| `/compare` | baseline vs corrupted vs repaired metrics with deltas and per-metric charts, RAGAS handling, freshness + data-quality output, and both markdown reports. |

## Constraints honoured

- Everything lives under `web/`. The only change outside it is three ignore lines
  appended to the repo `.gitignore`.
- Light appearance only — no dark mode, no theme toggle.
- Markdown reports are rendered into React elements, never via
  `dangerouslySetInnerHTML`.
- Wide tables scroll inside their own container; the page body never scrolls
  horizontally.
