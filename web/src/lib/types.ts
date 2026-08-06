/**
 * TypeScript shapes for every artifact the Python pipeline writes.
 *
 * These are *structural declarations only*. No values from any artifact are
 * duplicated here — the UI must read every number, string and row at request
 * time from the real files on disk (see `src/lib/api.ts`).
 */

/* -------------------------------------------------------------------------- */
/* data/pipeline_spec.json                                                     */
/* -------------------------------------------------------------------------- */

export interface PipelineSource {
  api: string;
  url: string;
  query: string;
  filter: string;
  max_results: number;
}

export interface PipelineRetrieval {
  embedding_model: string;
  top_k: number;
  collections: {
    baseline: string;
    corrupted: string;
    repaired: string;
  };
}

export interface PipelineLlm {
  provider: string;
  model: string;
}

/** stage key -> human description. Keys are whatever the Python spec exports. */
export type PipelineStages = Record<string, string>;

export interface RejectReason {
  key: string;
  label: string;
}

export interface CleanContract {
  columns: string[];
  derived_columns: string[];
  min_title_chars: number;
  min_summary_chars: number;
  reject_reasons: RejectReason[];
  text_for_embedding_template: string[];
}

export interface FreshnessSpec {
  threshold_days: number;
}

export interface CorruptionKind {
  type: string;
  pillar: string;
  fraction: number;
  detail: string;
}

export interface CorruptionSpec {
  seed: number;
  min_surviving_rows: number;
  kinds: CorruptionKind[];
}

/** logical artifact name -> repo-relative path, e.g. `data/raw/crossref_records.json` */
export type ArtifactPathMap = Record<string, string>;

export interface PipelineSpec {
  generated_at: string;
  source: PipelineSource;
  retrieval: PipelineRetrieval;
  llm: PipelineLlm;
  stages: PipelineStages;
  clean_contract: CleanContract;
  freshness: FreshnessSpec;
  corruption_spec: CorruptionSpec;
  artifacts: ArtifactPathMap;
}

/* -------------------------------------------------------------------------- */
/* Artifact presence index (derived server-side from pipeline_spec.artifacts)  */
/* -------------------------------------------------------------------------- */

export interface ArtifactStatus {
  /** logical name, i.e. the key inside pipeline_spec.artifacts */
  name: string;
  /** repo-relative path exactly as declared by pipeline_spec.artifacts */
  path: string;
  exists: boolean;
  size_bytes: number | null;
  modified_at: string | null;
  /** the command that produces this artifact */
  command: string;
}

export interface ArtifactIndex {
  /** absolute directory the route handler resolved artifacts against */
  data_dir: string;
  artifacts: ArtifactStatus[];
}

/* -------------------------------------------------------------------------- */
/* data/raw/crossref_records.json                                              */
/* -------------------------------------------------------------------------- */

export interface PaperRecord {
  paper_id: string;
  title: string;
  summary: string;
  authors: string[];
  categories: string[];
  primary_category: string;
  published: string;
  updated: string;
  abs_url: string;
  pdf_url: string;
  comment: string;
}

/* -------------------------------------------------------------------------- */
/* data/clean/papers_clean{,_corrupted,_repaired}.json                         */
/* -------------------------------------------------------------------------- */

export interface CleanRow extends PaperRecord {
  authors_joined: string;
  categories_joined: string;
  summary_chars: number;
  age_days: number;
  text_for_embedding: string;
}

/** Which variant of the clean dataset to read. */
export type DatasetState = "clean" | "corrupted" | "repaired";

/** Which pipeline run a metrics/answers file belongs to. */
export type RunState = "baseline" | "corrupted" | "repaired";

export const RUN_STATES: readonly RunState[] = ["baseline", "corrupted", "repaired"];

/* -------------------------------------------------------------------------- */
/* data/results/corruption_log.json                                            */
/* -------------------------------------------------------------------------- */

export interface CorruptionAction {
  type: string;
  target_pillar: string;
  rows_affected: number;
  paper_ids: string[];
  detail: string;
  examples?: unknown[];
}

export interface CorruptionLog {
  generated_at: string;
  seed: number;
  rows_before: number;
  rows_after: number;
  unique_paper_ids_before: number;
  unique_paper_ids_after: number;
  actions: CorruptionAction[];
  totals: Record<string, number>;
}

/* -------------------------------------------------------------------------- */
/* data/results/*_metrics.json                                                 */
/* -------------------------------------------------------------------------- */

/** `ragas` is either a skip marker, an error marker, or a metric object. */
export type RagasResult =
  | { skipped: string }
  | { error: string }
  | Record<string, unknown>;

export interface RunMetrics {
  samples: number;
  retrieval_hit_rate: number;
  mean_token_f1: number;
  judge_accuracy: number;
  mean_judge_score: number;
  ragas?: RagasResult | null;
}

/** The four headline metrics the compare view charts. */
export type MetricKey =
  | "retrieval_hit_rate"
  | "mean_token_f1"
  | "judge_accuracy"
  | "mean_judge_score";

export const METRIC_KEYS: readonly MetricKey[] = [
  "retrieval_hit_rate",
  "mean_token_f1",
  "judge_accuracy",
  "mean_judge_score",
];

/* -------------------------------------------------------------------------- */
/* data/eval/test_set.json and data/results/*_answers.json                     */
/* -------------------------------------------------------------------------- */

export interface TestQuestion {
  id: string;
  question_type: string;
  question: string;
  ground_truth: string;
  ground_truth_doc_ids: string[];
}

export interface JudgeVerdict {
  score: number;
  correct: boolean;
  reasoning: string;
}

export interface AnswerRecord extends TestQuestion {
  answer: string;
  retrieved_doc_ids: string[];
  retrieved_contexts: string[];
  retrieval_hit: boolean;
  token_f1: number;
  judge: JudgeVerdict;
}

/* -------------------------------------------------------------------------- */
/* data/quality/*.json — shape NOT final upstream, parse defensively           */
/* -------------------------------------------------------------------------- */

/**
 * Planned keys for `data/quality/freshness_report.json`. All optional: the
 * Python side has not implemented this yet, so the UI renders whichever known
 * keys are present and falls back to generic key/value rendering for the rest.
 */
export interface FreshnessReportKnownKeys {
  latest_published?: string;
  oldest_published?: string;
  stale_rows?: number;
  total_rows?: number;
  is_fresh?: boolean;
}

export type FreshnessReport = FreshnessReportKnownKeys & Record<string, unknown>;

/** One JSON file discovered under data/quality/. */
export interface QualityFile {
  name: string;
  path: string;
  data: unknown;
}

export interface QualityBundle {
  files: QualityFile[];
}

/* -------------------------------------------------------------------------- */
/* data/reports/*.md                                                           */
/* -------------------------------------------------------------------------- */

/** Logical report names accepted by `getReport()`. */
export type ReportName = "phase1" | "corruption";

export interface MarkdownReport {
  /** repo-relative path the markdown was read from */
  path: string;
  markdown: string;
}
