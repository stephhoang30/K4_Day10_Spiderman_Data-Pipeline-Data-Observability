import { readNamedJsonArtifact } from "@/lib/artifacts";

/** GET /api/test-set -> pipeline_spec.artifacts.test_set */
export async function GET(): Promise<Response> {
  return readNamedJsonArtifact("test_set");
}
