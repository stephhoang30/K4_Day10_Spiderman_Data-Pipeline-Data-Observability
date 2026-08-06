import {
  commandFor,
  dataDir,
  errorJson,
  loadSpec,
  missingJson,
  okJson,
  SPEC_COMMAND,
  SPEC_PATH,
  statArtifact,
} from "@/lib/artifacts";
import type { ArtifactStatus } from "@/lib/types";

/**
 * GET /api/artifacts
 *
 * Presence index for every path declared in `pipeline_spec.artifacts`.
 * The overview page derives each stage's pending/done status from this.
 */
export async function GET(): Promise<Response> {
  let spec;
  try {
    spec = await loadSpec();
  } catch (error) {
    return errorJson(error instanceof Error ? error.message : String(error));
  }
  if (!spec) return missingJson(SPEC_PATH, SPEC_COMMAND);

  const entries = Object.entries(spec.artifacts ?? {});
  const artifacts: ArtifactStatus[] = await Promise.all(
    entries.map(async ([name, path]) => ({
      name,
      path,
      command: commandFor(name),
      ...(await statArtifact(path)),
    })),
  );

  return okJson({ data_dir: dataDir(), artifacts }, SPEC_PATH);
}
