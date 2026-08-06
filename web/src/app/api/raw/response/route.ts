import { readNamedJsonArtifact } from "@/lib/artifacts";

/** GET /api/raw/response -> pipeline_spec.artifacts.raw_api_response */
export async function GET(): Promise<Response> {
  return readNamedJsonArtifact("raw_api_response");
}
