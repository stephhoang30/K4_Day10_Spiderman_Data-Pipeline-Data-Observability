import {
  artifactPath,
  commandFor,
  errorJson,
  missingJson,
  readTextArtifact,
  SPEC_COMMAND,
  SPEC_PATH,
} from "@/lib/artifacts";
import type { ReportName } from "@/lib/types";

const ARTIFACT_BY_NAME: Record<ReportName, string> = {
  phase1: "baseline_report",
  corruption: "comparison_report",
};

/**
 * GET /api/reports/{phase1|corruption}
 *
 * Returns `{ path, markdown }`. The markdown is not rendered server-side;
 * the client renders it into React elements (no raw HTML injection).
 */
export async function GET(
  _request: Request,
  ctx: RouteContext<"/api/reports/[name]">,
): Promise<Response> {
  const { name } = await ctx.params;
  const artifact = ARTIFACT_BY_NAME[name as ReportName];
  if (!artifact) {
    return errorJson(
      `Unknown report "${name}". Expected one of: ${Object.keys(ARTIFACT_BY_NAME).join(", ")}.`,
      400,
    );
  }

  const relative = await artifactPath(artifact);
  if (!relative) {
    return missingJson(
      SPEC_PATH,
      `${SPEC_COMMAND}  # pipeline_spec.artifacts has no entry "${artifact}"`,
    );
  }

  return readTextArtifact(relative, commandFor(artifact), (markdown) => ({
    path: relative,
    markdown,
  }));
}
