import { readNamedJsonArtifact } from "@/lib/artifacts";

/**
 * GET /api/freshness -> pipeline_spec.artifacts.freshness_report
 *
 * The body is returned verbatim: the Python side has not settled this shape,
 * so the UI parses it defensively rather than the API normalising it here.
 */
export async function GET(): Promise<Response> {
  return readNamedJsonArtifact("freshness_report");
}
