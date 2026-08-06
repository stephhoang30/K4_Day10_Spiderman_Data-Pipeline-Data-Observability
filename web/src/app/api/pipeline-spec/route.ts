import { readJsonArtifact, SPEC_COMMAND, SPEC_PATH } from "@/lib/artifacts";

/** GET /api/pipeline-spec -> data/pipeline_spec.json */
export async function GET(): Promise<Response> {
  return readJsonArtifact(SPEC_PATH, SPEC_COMMAND);
}
