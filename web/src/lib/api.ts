/**
 * The single data-access module the UI imports.
 *
 * Every fetcher goes through `API_BASE`. Today that resolves to the Next.js
 * route handlers in `src/app/api/**`, which read the real artifact files from
 * the repo's `data/` directory. When the Python backend exposes HTTP, set
 * `NEXT_PUBLIC_API_BASE_URL` to its origin + prefix and nothing else changes.
 *
 * Nothing in here invents data. A fetcher either returns bytes that came from a
 * real file, reports that the file is missing, or reports a transport error.
 */

import type {
  AnswerRecord,
  ArtifactIndex,
  CleanRow,
  CorruptionLog,
  DatasetState,
  FreshnessReport,
  MarkdownReport,
  PaperRecord,
  PipelineSpec,
  QualityBundle,
  ReportName,
  RunMetrics,
  RunState,
  TestQuestion,
} from "./types";

export const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "/api";

/**
 * Discriminated result so callers can tell "artifact not produced yet" apart
 * from "the request failed". Fetchers never throw.
 */
export type ArtifactResult<T> =
  | { status: "ok"; data: T; path?: string }
  | { status: "missing"; path: string; hint: string }
  | { status: "error"; message: string };

/** `ok` plus the pre-response state the UI renders while a request is open. */
export type LoadState<T> = { status: "loading" } | ArtifactResult<T>;

function endpoint(pathname: string): string {
  return `${API_BASE.replace(/\/+$/, "")}${pathname}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Perform the request and normalise whatever comes back into `ArtifactResult`.
 *
 * Accepts both the envelope this app's route handlers return
 * (`{status, path, data}`) and a bare artifact body, so a future backend that
 * simply serves the raw JSON still works.
 */
async function request<T>(pathname: string): Promise<ArtifactResult<T>> {
  const url = endpoint(pathname);
  let response: Response;

  try {
    response = await fetch(url, {
      cache: "no-store",
      headers: { accept: "application/json" },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { status: "error", message: `Request to ${url} failed: ${message}` };
  }

  let body: unknown = null;
  const isJson = (response.headers.get("content-type") ?? "").includes("json");
  if (isJson) {
    try {
      body = await response.json();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { status: "error", message: `${url} returned invalid JSON: ${message}` };
    }
  }

  if (isRecord(body) && body.status === "missing") {
    return {
      status: "missing",
      path: typeof body.path === "string" ? body.path : url,
      hint: typeof body.hint === "string" ? body.hint : "",
    };
  }

  if (isRecord(body) && body.status === "error") {
    return {
      status: "error",
      message: typeof body.message === "string" ? body.message : `${url} failed`,
    };
  }

  if (!response.ok) {
    return {
      status: "error",
      message: `${url} responded ${response.status} ${response.statusText}`.trim(),
    };
  }

  if (isRecord(body) && body.status === "ok" && "data" in body) {
    return {
      status: "ok",
      data: body.data as T,
      path: typeof body.path === "string" ? body.path : undefined,
    };
  }

  // Bare artifact body (a future backend may not use the envelope).
  return { status: "ok", data: body as T };
}

/* -------------------------------------------------------------------------- */
/* Fetchers                                                                    */
/* -------------------------------------------------------------------------- */

/** `data/pipeline_spec.json` — source config, clean contract, corruption spec. */
export function getPipelineSpec(): Promise<ArtifactResult<PipelineSpec>> {
  return request<PipelineSpec>("/pipeline-spec");
}

/** Existence + size + mtime for every path declared in `pipeline_spec.artifacts`. */
export function getArtifactIndex(): Promise<ArtifactResult<ArtifactIndex>> {
  return request<ArtifactIndex>("/artifacts");
}

/** `data/raw/crossref_records.json` — parsed records from the Crossref crawl. */
export function getRawRecords(): Promise<ArtifactResult<PaperRecord[]>> {
  return request<PaperRecord[]>("/raw/records");
}

/** `data/raw/crossref_response.json` — the untouched API response. */
export function getRawResponse(): Promise<ArtifactResult<unknown>> {
  return request<unknown>("/raw/response");
}

/** `data/clean/papers_clean{,_corrupted,_repaired}.json`. */
export function getCleanDataset(
  state: DatasetState = "clean",
): Promise<ArtifactResult<CleanRow[]>> {
  return request<CleanRow[]>(`/clean/${state}`);
}

/** `data/results/corruption_log.json`. */
export function getCorruptionLog(): Promise<ArtifactResult<CorruptionLog>> {
  return request<CorruptionLog>("/corruption-log");
}

/** `data/results/{baseline,corrupted,repaired}_metrics.json`. */
export function getMetrics(state: RunState): Promise<ArtifactResult<RunMetrics>> {
  return request<RunMetrics>(`/metrics/${state}`);
}

/** `data/results/{baseline,corrupted,repaired}_answers.json`. */
export function getAnswers(state: RunState): Promise<ArtifactResult<AnswerRecord[]>> {
  return request<AnswerRecord[]>(`/answers/${state}`);
}

/** `data/eval/test_set.json`. */
export function getTestSet(): Promise<ArtifactResult<TestQuestion[]>> {
  return request<TestQuestion[]>("/test-set");
}

/** `data/quality/freshness_report.json` — shape not final, parsed defensively. */
export function getFreshness(): Promise<ArtifactResult<FreshnessReport>> {
  return request<FreshnessReport>("/freshness");
}

/** Every `*.json` found under `data/quality/`, returned verbatim. */
export function getQuality(): Promise<ArtifactResult<QualityBundle>> {
  return request<QualityBundle>("/quality");
}

/** `data/reports/phase1_report.md` (`phase1`) or `corruption_report.md` (`corruption`). */
export function getReport(name: ReportName): Promise<ArtifactResult<MarkdownReport>> {
  return request<MarkdownReport>(`/reports/${name}`);
}
