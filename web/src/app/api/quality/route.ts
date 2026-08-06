import fs from "node:fs/promises";
import {
  absoluteFor,
  artifactPath,
  errorJson,
  listJsonFiles,
  missingJson,
  okJson,
  PHASE1_COMMAND,
} from "@/lib/artifacts";
import type { QualityFile } from "@/lib/types";

/**
 * GET /api/quality
 *
 * Lists every `*.json` sitting in the data-quality directory and returns each
 * body verbatim. The directory is derived from the freshness_report path in
 * pipeline_spec.artifacts, so the FE never hardcodes it.
 *
 * Data-quality output shapes are not final upstream, so nothing is normalised
 * here — the UI renders known keys when it recognises them and falls back to
 * generic key/value rendering otherwise.
 */
export async function GET(): Promise<Response> {
  const freshnessPath = (await artifactPath("freshness_report")) ?? "data/quality/freshness_report.json";
  const dir = freshnessPath.replace(/\\/g, "/").split("/").slice(0, -1).join("/") || "data/quality";

  let names: string[];
  try {
    names = await listJsonFiles(dir);
  } catch (error) {
    return errorJson(error instanceof Error ? error.message : String(error));
  }

  if (names.length === 0) {
    return missingJson(`${dir}/*.json`, PHASE1_COMMAND);
  }

  const files: QualityFile[] = [];
  for (const name of names) {
    const relative = `${dir}/${name}`;
    try {
      const text = await fs.readFile(/*turbopackIgnore: true*/ absoluteFor(relative), "utf8");
      files.push({ name, path: relative, data: JSON.parse(text) as unknown });
    } catch (error) {
      files.push({
        name,
        path: relative,
        data: { _read_error: error instanceof Error ? error.message : String(error) },
      });
    }
  }

  return okJson({ files }, dir);
}
