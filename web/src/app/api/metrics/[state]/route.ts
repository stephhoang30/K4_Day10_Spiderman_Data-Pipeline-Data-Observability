import { errorJson, readNamedJsonArtifact } from "@/lib/artifacts";
import type { RunState } from "@/lib/types";

const ARTIFACT_BY_STATE: Record<RunState, string> = {
  baseline: "baseline_metrics",
  corrupted: "corrupted_metrics",
  repaired: "repaired_metrics",
};

/** GET /api/metrics/{baseline|corrupted|repaired} */
export async function GET(
  _request: Request,
  ctx: RouteContext<"/api/metrics/[state]">,
): Promise<Response> {
  const { state } = await ctx.params;
  const artifact = ARTIFACT_BY_STATE[state as RunState];
  if (!artifact) {
    return errorJson(
      `Unknown run state "${state}". Expected one of: ${Object.keys(ARTIFACT_BY_STATE).join(", ")}.`,
      400,
    );
  }
  return readNamedJsonArtifact(artifact);
}
