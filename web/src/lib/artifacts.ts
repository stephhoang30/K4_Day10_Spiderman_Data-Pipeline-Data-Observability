/**
 * SERVER ONLY. Filesystem access for the route handlers under `src/app/api/**`.
 *
 * This module is the *current* implementation behind the API contract. When the
 * Python side grows an HTTP server, the route handlers (and this file) become
 * dead code: point `NEXT_PUBLIC_API_BASE_URL` at the real backend and the UI
 * keeps working unchanged, because the UI only ever talks to `src/lib/api.ts`.
 *
 * Never import this from a Client Component.
 */

import fs from "node:fs/promises";
import path from "node:path";
import type { PipelineSpec } from "./types";

/** Commands that produce the artifacts, as run from the repository root. */
export const SPEC_COMMAND = "uv run python script/export_pipeline_spec.py";
export const PHASE1_COMMAND = "uv run python script/run_phase1.py";
export const PHASE2_COMMAND = "uv run python script/run_corruption_flow.py";

/** Repo-relative path of the pipeline spec — the only artifact not listed inside itself. */
export const SPEC_PATH = "data/pipeline_spec.json";

/** Logical artifact names produced by phase 2 (`run_corruption_flow.py`). */
const PHASE2_ARTIFACTS = new Set([
  "corrupted_json",
  "corrupted_csv",
  "corrupted_embeddings",
  "repaired_json",
  "repaired_csv",
  "repaired_embeddings",
  "corruption_log",
  "corrupted_metrics",
  "corrupted_answers",
  "repaired_metrics",
  "repaired_answers",
  "comparison_report",
]);

/**
 * Absolute directory holding the pipeline artifacts.
 * Defaults to the repo's `data/` directory, one level up from `web/`.
 */
export function dataDir(): string {
  return process.env.PIPELINE_DATA_DIR ?? path.join(process.cwd(), "..", "data");
}

/**
 * Resolve a repo-relative artifact path (e.g. `data/raw/crossref_records.json`)
 * to an absolute path inside `dataDir()`. The leading `data/` segment is
 * stripped so that `PIPELINE_DATA_DIR` can point anywhere.
 */
export function absoluteFor(repoRelative: string): string {
  const normalized = repoRelative.replace(/\\/g, "/").replace(/^\.?\//, "");
  const withinData = normalized.startsWith("data/")
    ? normalized.slice("data/".length)
    : normalized;
  const root = path.resolve(/*turbopackIgnore: true*/ dataDir());
  const resolved = path.resolve(root, withinData);
  // Refuse anything that escapes the data directory.
  if (resolved !== root && !resolved.startsWith(root + path.sep)) {
    throw new Error(`Refusing to read outside the data directory: ${repoRelative}`);
  }
  return resolved;
}

/** The command a user must run to produce a given logical artifact. */
export function commandFor(artifactName: string): string {
  if (artifactName === "pipeline_spec") return SPEC_COMMAND;
  return PHASE2_ARTIFACTS.has(artifactName) ? PHASE2_COMMAND : PHASE1_COMMAND;
}

/* -------------------------------------------------------------------------- */
/* Response envelopes                                                          */
/* -------------------------------------------------------------------------- */

export function okJson(data: unknown, artifactPath: string): Response {
  return Response.json(
    { status: "ok", path: artifactPath, data },
    { headers: { "cache-control": "no-store" } },
  );
}

export function missingJson(artifactPath: string, hint: string): Response {
  return Response.json(
    { status: "missing", path: artifactPath, hint },
    { status: 404, headers: { "cache-control": "no-store" } },
  );
}

export function errorJson(message: string, status = 500): Response {
  return Response.json(
    { status: "error", message },
    { status, headers: { "cache-control": "no-store" } },
  );
}

/* -------------------------------------------------------------------------- */
/* Readers                                                                     */
/* -------------------------------------------------------------------------- */

function isNotFound(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: string }).code === "ENOENT"
  );
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Read + parse a JSON artifact, returning the standard envelope. */
export async function readJsonArtifact(
  repoRelative: string,
  hint: string,
): Promise<Response> {
  let absolute: string;
  try {
    absolute = absoluteFor(repoRelative);
  } catch (error) {
    return errorJson(describe(error), 400);
  }

  let text: string;
  try {
    text = await fs.readFile(/*turbopackIgnore: true*/ absolute, "utf8");
  } catch (error) {
    if (isNotFound(error)) return missingJson(repoRelative, hint);
    return errorJson(`Could not read ${repoRelative}: ${describe(error)}`);
  }

  try {
    return okJson(JSON.parse(text) as unknown, repoRelative);
  } catch (error) {
    return errorJson(`${repoRelative} is not valid JSON: ${describe(error)}`);
  }
}

/** Read a text artifact (markdown, CSV) and wrap it in the standard envelope. */
export async function readTextArtifact(
  repoRelative: string,
  hint: string,
  wrap: (text: string) => unknown,
): Promise<Response> {
  let absolute: string;
  try {
    absolute = absoluteFor(repoRelative);
  } catch (error) {
    return errorJson(describe(error), 400);
  }

  try {
    const text = await fs.readFile(/*turbopackIgnore: true*/ absolute, "utf8");
    return okJson(wrap(text), repoRelative);
  } catch (error) {
    if (isNotFound(error)) return missingJson(repoRelative, hint);
    return errorJson(`Could not read ${repoRelative}: ${describe(error)}`);
  }
}

/**
 * Load and parse `data/pipeline_spec.json`.
 * Returns `null` when the spec itself is absent, so callers can 404 cleanly.
 */
export async function loadSpec(): Promise<PipelineSpec | null> {
  try {
    const text = await fs.readFile(/*turbopackIgnore: true*/ absoluteFor(SPEC_PATH), "utf8");
    return JSON.parse(text) as PipelineSpec;
  } catch (error) {
    if (isNotFound(error)) return null;
    throw error;
  }
}

/**
 * Look up a repo-relative path from `pipeline_spec.artifacts`.
 * Everything the UI reads is addressed by logical name so the FE never
 * hardcodes a path the Python side owns.
 */
export async function artifactPath(name: string): Promise<string | null> {
  const spec = await loadSpec();
  if (!spec) return null;
  const value = spec.artifacts?.[name];
  return typeof value === "string" && value.length > 0 ? value : null;
}

/** Read a JSON artifact addressed by its logical name in the spec. */
export async function readNamedJsonArtifact(name: string): Promise<Response> {
  const relative = await artifactPath(name);
  if (!relative) {
    return missingJson(
      SPEC_PATH,
      `${SPEC_COMMAND}  # pipeline_spec.artifacts has no entry "${name}"`,
    );
  }
  return readJsonArtifact(relative, commandFor(name));
}

/** `fs.stat` that reports absence instead of throwing. */
export async function statArtifact(
  repoRelative: string,
): Promise<{ exists: boolean; size_bytes: number | null; modified_at: string | null }> {
  try {
    const stats = await fs.stat(/*turbopackIgnore: true*/ absoluteFor(repoRelative));
    return {
      exists: true,
      size_bytes: stats.size,
      modified_at: stats.mtime.toISOString(),
    };
  } catch {
    return { exists: false, size_bytes: null, modified_at: null };
  }
}

/** List `*.json` files directly under a repo-relative directory. */
export async function listJsonFiles(repoRelativeDir: string): Promise<string[]> {
  try {
    const entries = await fs.readdir(/*turbopackIgnore: true*/ absoluteFor(repoRelativeDir), {
      withFileTypes: true,
    });
    return entries
      .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".json"))
      .map((entry) => entry.name)
      .sort();
  } catch {
    return [];
  }
}
