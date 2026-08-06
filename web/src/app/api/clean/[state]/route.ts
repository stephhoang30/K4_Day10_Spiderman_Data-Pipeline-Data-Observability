import { errorJson, readNamedJsonArtifact } from "@/lib/artifacts";
import type { DatasetState } from "@/lib/types";

/** state -> logical artifact name in pipeline_spec.artifacts */
const ARTIFACT_BY_STATE: Record<DatasetState, string> = {
  clean: "clean_json",
  corrupted: "corrupted_json",
  repaired: "repaired_json",
};

/** GET /api/clean/{clean|corrupted|repaired} */
export async function GET(
  _request: Request,
  ctx: RouteContext<"/api/clean/[state]">,
): Promise<Response> {
  const { state } = await ctx.params;
  const artifact = ARTIFACT_BY_STATE[state as DatasetState];
  if (!artifact) {
    return errorJson(
      `Unknown dataset state "${state}". Expected one of: ${Object.keys(ARTIFACT_BY_STATE).join(", ")}.`,
      400,
    );
  }
  return readNamedJsonArtifact(artifact);
}
