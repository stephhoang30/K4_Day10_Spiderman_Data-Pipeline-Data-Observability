import { readNamedJsonArtifact } from "@/lib/artifacts";

/** GET /api/corruption-log -> pipeline_spec.artifacts.corruption_log */
export async function GET(): Promise<Response> {
  return readNamedJsonArtifact("corruption_log");
}
