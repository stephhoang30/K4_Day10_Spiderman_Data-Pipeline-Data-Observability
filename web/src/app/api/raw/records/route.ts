import { readNamedJsonArtifact } from "@/lib/artifacts";

/** GET /api/raw/records -> pipeline_spec.artifacts.raw_records */
export async function GET(): Promise<Response> {
  return readNamedJsonArtifact("raw_records");
}
