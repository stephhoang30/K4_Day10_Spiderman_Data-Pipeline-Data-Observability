/**
 * Which logical artifacts belong to which pipeline stage.
 *
 * This is *structure*, not data: the artifact names are keys into
 * `pipeline_spec.artifacts`, and every path, description and command is read
 * from the spec / filesystem at request time. Nothing here duplicates a value
 * the Python side owns.
 *
 * `compare` is not a key in `pipeline_spec.stages` — it is the FE's roll-up
 * view over the three metrics files plus the comparison report, and is flagged
 * as derived so the UI can label it honestly.
 */

export const STAGE_ORDER = [
  "crawl",
  "clean",
  "index",
  "evaluate",
  "observe",
  "corrupt",
  "repair",
  "compare",
] as const;

export const STAGE_ARTIFACTS: Record<string, string[]> = {
  crawl: ["raw_api_response", "raw_records"],
  clean: ["clean_json", "clean_csv"],
  index: ["embeddings"],
  evaluate: ["test_set", "baseline_metrics", "baseline_answers"],
  observe: ["freshness_report", "baseline_report"],
  corrupt: [
    "corrupted_json",
    "corrupted_embeddings",
    "corruption_log",
    "corrupted_metrics",
    "corrupted_answers",
  ],
  repair: [
    "repaired_json",
    "repaired_embeddings",
    "repaired_metrics",
    "repaired_answers",
  ],
  compare: [
    "baseline_metrics",
    "corrupted_metrics",
    "repaired_metrics",
    "comparison_report",
  ],
};

/**
 * Nodes of the flow diagram on the overview page, and the logical artifacts each
 * one produces. Same contract as `STAGE_ARTIFACTS`: keys into
 * `pipeline_spec.artifacts`, so presence is read from disk, never assumed.
 */
export const FLOW_ARTIFACTS: Record<string, string[]> = {
  crawl: ["raw_api_response", "raw_records"],
  clean: ["clean_json", "clean_csv"],
  corrupt: ["corrupted_json", "corruption_log"],
  repair: ["repaired_json"],
  index_baseline: ["embeddings"],
  index_corrupted: ["corrupted_embeddings"],
  index_repaired: ["repaired_embeddings"],
  evaluate_baseline: ["test_set", "baseline_metrics", "baseline_answers"],
  evaluate_corrupted: ["corrupted_metrics", "corrupted_answers"],
  evaluate_repaired: ["repaired_metrics", "repaired_answers"],
  compare: ["comparison_report"],
};

/**
 * Naming hints for the clean-contract diagram.
 *
 * Most links are inferred from the artifact itself: a derived column named
 * `<source>_something` comes from `<source>`, `text_for_embedding` comes from
 * the fields listed in `clean_contract.text_for_embedding_template`, and a
 * quality check named `<column>_something` watches `<column>`. These two maps
 * cover only the cases where the names alone do not say it. They are names, not
 * values — no count, metric or row is declared here.
 */
export const DERIVED_SOURCE_HINTS: Record<string, string[]> = {
  age_days: ["published"],
};

export const CHECK_COLUMN_HINTS: Record<string, string[]> = {
  freshness: ["age_days"],
};

/** The one derived column that is handed to the embedding model. */
export const EMBEDDED_COLUMN = "text_for_embedding";

/** Stages that exist only as a FE view, with no entry in pipeline_spec.stages. */
export const DERIVED_STAGES = new Set<string>(["compare"]);

/** Which detail page, if any, explains a stage. */
export const STAGE_ROUTE: Record<string, string> = {
  crawl: "/crawl",
  clean: "/clean",
  corrupt: "/corrupt",
  repair: "/corrupt",
  compare: "/compare",
};

/**
 * Order the stage keys: spec order first (so new Python stages show up
 * automatically), then any FE-derived stages.
 */
export function orderedStages(specStageKeys: string[]): string[] {
  const known = STAGE_ORDER.filter(
    (stage) => specStageKeys.includes(stage) || DERIVED_STAGES.has(stage),
  );
  const extras = specStageKeys.filter(
    (stage) => !(STAGE_ORDER as readonly string[]).includes(stage),
  );
  return [...known, ...extras];
}
