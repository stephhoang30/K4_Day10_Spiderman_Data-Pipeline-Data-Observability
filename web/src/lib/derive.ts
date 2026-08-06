/**
 * Derivations computed *from artifacts the UI already fetched*.
 *
 * Nothing in here contains a metric, a paper id, a title or a count. Every
 * function takes real artifact bodies as arguments and returns a reshaping of
 * them. The only literals are *structural* — field names and check names that
 * exist inside the artifacts — the same class of thing `types.ts` and
 * `stage-map.ts` already declare.
 *
 * If an artifact is missing, the caller never reaches these functions: the
 * `ArtifactBoundary` renders the empty state instead.
 */

import type {
  AnswerRecord,
  CleanContract,
  CleanRow,
  CorruptionLog,
  QualityBundle,
} from "./types";

/* -------------------------------------------------------------------------- */
/* Tiny defensive readers                                                      */
/* -------------------------------------------------------------------------- */

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function num(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function str(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function bool(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

/* -------------------------------------------------------------------------- */
/* data/quality/*.json — classified by CONTENT, never by file name             */
/* -------------------------------------------------------------------------- */

export interface QualityCheck {
  key: string;
  status: string | null;
  passed: boolean | null;
  actual: unknown;
  expected: unknown;
  message: string | null;
}

export interface FreshnessSummary {
  status: string | null;
  isFresh: boolean | null;
  staleRows: number | null;
  totalRows: number | null;
  latestPublished: string | null;
  oldestPublished: string | null;
  thresholdDays: number | null;
}

export interface QualityReport {
  /** whatever `report_name` says — the artifact names its own run state */
  state: string;
  fileName: string;
  path: string;
  status: string | null;
  passed: boolean | null;
  totalChecks: number | null;
  passedChecks: number | null;
  failedChecks: number | null;
  checks: QualityCheck[];
  freshness: FreshnessSummary | null;
}

export interface CleaningLog {
  state: string;
  fileName: string;
  path: string;
  rowsIn: number | null;
  rowsOut: number | null;
  rowsDropped: number | null;
  rejects: { key: string; count: number }[];
  signals: Record<string, unknown> | null;
}

function readFreshness(value: unknown): FreshnessSummary | null {
  if (!isRecord(value)) return null;
  const looksLikeFreshness =
    "stale_rows" in value || "is_fresh" in value || "freshness_threshold_days" in value;
  if (!looksLikeFreshness) return null;
  return {
    status: str(value.status),
    isFresh: bool(value.is_fresh),
    staleRows: num(value.stale_rows),
    totalRows: num(value.total_rows),
    latestPublished: str(value.latest_published),
    oldestPublished: str(value.oldest_published),
    thresholdDays: num(value.freshness_threshold_days),
  };
}

/**
 * Quality reports are the files that carry a `checks` object plus the run state
 * they describe (`report_name`). Selecting on shape means a renamed file or a
 * fourth run state keeps working.
 */
export function readQualityReports(bundle: QualityBundle | null): QualityReport[] {
  if (!bundle?.files) return [];
  const reports: QualityReport[] = [];
  for (const file of bundle.files) {
    const data = file.data;
    if (!isRecord(data) || !isRecord(data.checks)) continue;
    const state = str(data.report_name);
    if (!state) continue;
    const checks: QualityCheck[] = Object.entries(data.checks).map(([key, raw]) => ({
      key,
      status: isRecord(raw) ? str(raw.status) : null,
      passed: isRecord(raw) ? bool(raw.passed) : null,
      actual: isRecord(raw) ? raw.actual : undefined,
      expected: isRecord(raw) ? raw.expected : undefined,
      message: isRecord(raw) ? str(raw.message) : null,
    }));
    reports.push({
      state,
      fileName: file.name,
      path: file.path,
      status: str(data.status),
      passed: bool(data.passed),
      totalChecks: num(data.total_checks) ?? checks.length,
      passedChecks: num(data.passed_checks),
      failedChecks: num(data.failed_checks),
      checks,
      freshness: readFreshness(data.freshness),
    });
  }
  return reports;
}

/** Cleaning logs are the files carrying `rows_in` plus the state they describe. */
export function readCleaningLogs(bundle: QualityBundle | null): CleaningLog[] {
  if (!bundle?.files) return [];
  const logs: CleaningLog[] = [];
  for (const file of bundle.files) {
    const data = file.data;
    if (!isRecord(data)) continue;
    const state = str(data.state);
    if (!state || num(data.rows_in) === null) continue;
    const rejects = isRecord(data.rejects)
      ? Object.entries(data.rejects).map(([key, value]) => ({
          key,
          count: num(value) ?? 0,
        }))
      : [];
    logs.push({
      state,
      fileName: file.name,
      path: file.path,
      rowsIn: num(data.rows_in),
      rowsOut: num(data.rows_out),
      rowsDropped: num(data.rows_dropped),
      rejects,
      signals: isRecord(data.signals) ? data.signals : null,
    });
  }
  return logs;
}

export function byState<T extends { state: string }>(items: T[]): Map<string, T> {
  return new Map(items.map((item) => [item.state, item]));
}

/**
 * The status string this report uses for a check that passed cleanly.
 *
 * Taken as the most common status among checks with `passed === true`, so a
 * check that passed under some *other* label (a warning, say) can be styled as
 * "passed, but noted" without the FE knowing which strings the Python side uses.
 */
export function passLabelOf(report: QualityReport | null): string | null {
  if (!report) return null;
  const counts = new Map<string, number>();
  for (const check of report.checks) {
    if (check.passed !== true || !check.status) continue;
    counts.set(check.status, (counts.get(check.status) ?? 0) + 1);
  }
  let best: string | null = null;
  let bestCount = 0;
  for (const [status, count] of counts) {
    if (count > bestCount) {
      best = status;
      bestCount = count;
    }
  }
  return best;
}

/** Flatten a check's `actual` / `expected` payload into one readable line. */
export function describeCheckValue(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "boolean") return String(value);
  if (typeof value === "number" || typeof value === "string") return String(value);
  if (Array.isArray(value)) return value.map(describeCheckValue).join(", ");
  if (isRecord(value)) {
    return Object.entries(value)
      .map(([key, entry]) => `${key} ${describeCheckValue(entry)}`)
      .join(" · ");
  }
  return String(value);
}

export interface DriftedCheck {
  key: string;
  before: unknown;
  after: unknown;
  expected: unknown;
  status: string | null;
  passed: boolean | null;
}

/**
 * Compare two quality reports check by check.
 *
 * `passedButMoved` is the interesting bucket: the measured value changed, so the
 * check *saw* the corruption — and its rule let it through anyway.
 */
export function driftedChecks(
  before: QualityReport,
  after: QualityReport,
): { passedButMoved: DriftedCheck[]; failed: DriftedCheck[]; steady: DriftedCheck[] } {
  const beforeByKey = new Map(before.checks.map((check) => [check.key, check]));
  const passedButMoved: DriftedCheck[] = [];
  const failed: DriftedCheck[] = [];
  const steady: DriftedCheck[] = [];

  for (const check of after.checks) {
    const previous = beforeByKey.get(check.key);
    const entry: DriftedCheck = {
      key: check.key,
      before: previous?.actual,
      after: check.actual,
      expected: check.expected,
      status: check.status,
      passed: check.passed,
    };
    if (check.passed === false) {
      failed.push(entry);
      continue;
    }
    const moved =
      previous !== undefined &&
      JSON.stringify(previous.actual ?? null) !== JSON.stringify(check.actual ?? null);
    if (moved) passedButMoved.push(entry);
    else steady.push(entry);
  }

  return { passedButMoved, failed, steady };
}

/* -------------------------------------------------------------------------- */
/* Per-corruption-type impact on answer quality                                */
/* -------------------------------------------------------------------------- */

export interface ImpactGroup {
  /** corruption type from the log, or `null` for the untouched control group */
  type: string | null;
  rowsAffected: number | null;
  questions: number;
  hitRate: number;
  tokenF1: number;
  judgeAccuracy: number;
  judgeScore: number;
}

export interface ImpactBreakdown {
  groups: ImpactGroup[];
  control: ImpactGroup | null;
  /** paper ids touched by more than one action — the groups are not fully disjoint */
  sharedPaperIds: string[];
  /** questions whose ground truth falls into more than one corruption group */
  multiGroupQuestions: number;
}

function summarise(type: string | null, rowsAffected: number | null, rows: AnswerRecord[]): ImpactGroup {
  const n = rows.length;
  const mean = (pick: (row: AnswerRecord) => number) =>
    n === 0 ? 0 : rows.reduce((total, row) => total + pick(row), 0) / n;
  return {
    type,
    rowsAffected,
    questions: n,
    hitRate: mean((row) => (row.retrieval_hit ? 1 : 0)),
    tokenF1: mean((row) => num(row.token_f1) ?? 0),
    judgeAccuracy: mean((row) => (row.judge?.correct ? 1 : 0)),
    judgeScore: mean((row) => num(row.judge?.score) ?? 0),
  };
}

/**
 * Attribute answer-quality damage to each corruption action.
 *
 * A question belongs to an action's group when its `ground_truth_doc_ids`
 * intersect that action's `paper_ids`. Questions touching no action form the
 * control group. Overlap between actions is reported rather than hidden.
 */
export function corruptionImpact(
  log: CorruptionLog,
  answers: AnswerRecord[],
): ImpactBreakdown {
  const actions = Array.isArray(log?.actions) ? log.actions : [];
  const idSets = actions.map((action) => ({
    type: action.type,
    rowsAffected: num(action.rows_affected),
    ids: new Set(Array.isArray(action.paper_ids) ? action.paper_ids : []),
  }));

  const seen = new Map<string, number>();
  for (const entry of idSets) {
    for (const id of entry.ids) seen.set(id, (seen.get(id) ?? 0) + 1);
  }
  const sharedPaperIds = [...seen.entries()]
    .filter(([, count]) => count > 1)
    .map(([id]) => id)
    .sort();

  const membership = (row: AnswerRecord) => {
    const truth = new Set(Array.isArray(row.ground_truth_doc_ids) ? row.ground_truth_doc_ids : []);
    return idSets.filter((entry) => [...truth].some((id) => entry.ids.has(id)));
  };

  const groups = idSets.map((entry) =>
    summarise(
      entry.type,
      entry.rowsAffected,
      answers.filter((row) => membership(row).some((hit) => hit.type === entry.type)),
    ),
  );

  const untouched = answers.filter((row) => membership(row).length === 0);
  const control = untouched.length > 0 ? summarise(null, null, untouched) : null;
  const multiGroupQuestions = answers.filter((row) => membership(row).length > 1).length;

  return { groups, control, sharedPaperIds, multiGroupQuestions };
}

/* -------------------------------------------------------------------------- */
/* Which corruption types the quality gate can actually see                    */
/* -------------------------------------------------------------------------- */

export interface Detectability {
  type: string;
  rowsAffected: number | null;
  /** how many of this action's paper ids still exist in the corrupted dataset */
  survivingRows: number;
  /** failing checks whose offending rows include one of this action's paper ids */
  caughtBy: string[];
  visible: boolean;
}

export interface GateAudit {
  items: Detectability[];
  /** failing checks that no single row can be blamed for (e.g. a dataset-level count) */
  datasetLevelFailures: string[];
  /** failing checks the FE cannot resolve to offending rows */
  unresolvedFailures: string[];
  visibleCount: number;
  invisibleCount: number;
}

/**
 * Re-derive which rows trip each named check, from the corrupted dataset plus
 * the parameters the check itself declares. Returns `null` for checks that are
 * evaluated over the dataset as a whole and therefore cannot be blamed on any
 * particular row.
 */
function offendingIds(
  check: QualityCheck,
  rows: CleanRow[],
  fallback: { minSummaryChars: number | null; freshnessThresholdDays: number | null },
): Set<string> | null {
  const actual = isRecord(check.actual) ? check.actual : null;
  const ids = new Set<string>();

  switch (check.key) {
    case "paper_id_unique": {
      const counts = new Map<string, number>();
      for (const row of rows) {
        const id = str(row?.paper_id);
        if (id) counts.set(id, (counts.get(id) ?? 0) + 1);
      }
      for (const [id, count] of counts) if (count > 1) ids.add(id);
      return ids;
    }
    case "summary_length": {
      const minimum = num(actual?.minimum_chars) ?? fallback.minSummaryChars;
      if (minimum === null) return null;
      for (const row of rows) {
        const chars = num(row?.summary_chars);
        const id = str(row?.paper_id);
        if (id && chars !== null && chars < minimum) ids.add(id);
      }
      return ids;
    }
    case "freshness": {
      const threshold = fallback.freshnessThresholdDays;
      if (threshold === null) return null;
      for (const row of rows) {
        const age = num(row?.age_days);
        const id = str(row?.paper_id);
        if (id && age !== null && age > threshold) ids.add(id);
      }
      return ids;
    }
    case "title_not_null": {
      for (const row of rows) {
        const id = str(row?.paper_id);
        if (id && !str(row?.title)) ids.add(id);
      }
      return ids;
    }
    case "paper_id_not_null": {
      for (const row of rows) if (!str(row?.paper_id)) ids.add("");
      return ids;
    }
    case "age_days_valid": {
      for (const row of rows) {
        const id = str(row?.paper_id);
        const age = num(row?.age_days);
        if (id && (age === null || age < 0)) ids.add(id);
      }
      return ids;
    }
    case "row_count":
      return null;
    default:
      return null;
  }
}

/**
 * For every corruption action, decide whether any failing quality check can be
 * traced back to one of the rows it touched.
 *
 * The blunt case matters most: an action that *deletes* rows leaves nothing for
 * a row-level check to look at, so it can never be caught this way.
 */
export function auditGate({
  log,
  corruptedRows,
  report,
  minSummaryChars,
  freshnessThresholdDays,
}: {
  log: CorruptionLog;
  corruptedRows: CleanRow[];
  report: QualityReport;
  minSummaryChars: number | null;
  freshnessThresholdDays: number | null;
}): GateAudit {
  const present = new Set(
    corruptedRows.map((row) => str(row?.paper_id)).filter((id): id is string => Boolean(id)),
  );
  const failing = report.checks.filter((check) => check.passed === false);
  const resolved = failing.map((check) => ({
    check,
    ids: offendingIds(check, corruptedRows, { minSummaryChars, freshnessThresholdDays }),
  }));

  const items: Detectability[] = (Array.isArray(log?.actions) ? log.actions : []).map((action) => {
    const paperIds = Array.isArray(action.paper_ids) ? action.paper_ids : [];
    const caughtBy = resolved
      .filter((entry) => entry.ids !== null && paperIds.some((id) => entry.ids!.has(id)))
      .map((entry) => entry.check.key);
    return {
      type: action.type,
      rowsAffected: num(action.rows_affected),
      survivingRows: paperIds.filter((id) => present.has(id)).length,
      caughtBy,
      visible: caughtBy.length > 0,
    };
  });

  const attributed = new Set(items.flatMap((item) => item.caughtBy));
  return {
    items,
    datasetLevelFailures: resolved
      .filter((entry) => entry.ids === null)
      .map((entry) => entry.check.key),
    unresolvedFailures: resolved
      .filter((entry) => entry.ids !== null && !attributed.has(entry.check.key))
      .map((entry) => entry.check.key),
    visibleCount: items.filter((item) => item.visible).length,
    invisibleCount: items.filter((item) => !item.visible).length,
  };
}

/* -------------------------------------------------------------------------- */
/* Two answer-level exhibits, both located in the real answers files           */
/* -------------------------------------------------------------------------- */

export interface AnswerPair {
  id: string;
  questionType: string;
  question: string;
  groundTruth: string;
  groundTruthDocIds: string[];
  baselineAnswer: string;
  corruptedAnswer: string;
  baselineScore: number | null;
  corruptedScore: number | null;
  baselineHit: boolean;
  corruptedHit: boolean;
  corruptedTokenF1: number | null;
  corruptedRetrievedDocIds: string[];
}

export interface ConfidentlyWrong extends AnswerPair {
  /** a different paper in the dataset carrying the exact value the agent answered */
  borrowedFrom: { paperId: string; field: string; title: string } | null;
  /** how many corrupted answers repeat this same wrong value */
  repeats: number;
  /** the same question answered by the repaired run, when that file exists */
  repaired: {
    answer: string;
    score: number | null;
    hit: boolean;
    correct: boolean | null;
  } | null;
}

export interface SilentFailure extends AnswerPair {
  /** which corruption action touched the paper this question is about */
  corruptionType: string | null;
  /** the corrupted row's own summary length, when the row still exists */
  summaryChars: number | null;
}

function pair(baseline: AnswerRecord, corrupted: AnswerRecord): AnswerPair {
  return {
    id: corrupted.id ?? "",
    questionType: corrupted.question_type ?? "",
    question: corrupted.question ?? "",
    groundTruth: corrupted.ground_truth ?? "",
    groundTruthDocIds: Array.isArray(corrupted.ground_truth_doc_ids)
      ? corrupted.ground_truth_doc_ids
      : [],
    baselineAnswer: baseline.answer ?? "",
    corruptedAnswer: corrupted.answer ?? "",
    baselineScore: num(baseline.judge?.score),
    corruptedScore: num(corrupted.judge?.score),
    baselineHit: Boolean(baseline.retrieval_hit),
    corruptedHit: Boolean(corrupted.retrieval_hit),
    corruptedTokenF1: num(corrupted.token_f1),
    corruptedRetrievedDocIds: Array.isArray(corrupted.retrieved_doc_ids)
      ? corrupted.retrieved_doc_ids
      : [],
  };
}

function indexById(rows: AnswerRecord[]): Map<string, AnswerRecord> {
  return new Map(rows.filter((row) => str(row?.id)).map((row) => [row.id, row]));
}

/** Short scalar fields only — long prose would match by accident. */
const MAX_BORROWED_FIELD_CHARS = 64;

/**
 * The agent did not go quiet on corrupted data — it answered, and it was wrong.
 *
 * A candidate is a question the baseline run got right and the corrupted run got
 * wrong *with a non-empty answer*. Candidates are ranked by whether the wrong
 * value can be found verbatim on a different paper in the dataset (proof it was
 * lifted from the wrong document), then by how often the same wrong value
 * recurs, then by id so the pick is stable.
 */
export function findConfidentlyWrong(
  baselineRows: AnswerRecord[],
  corruptedRows: AnswerRecord[],
  cleanRows: CleanRow[],
  repairedRows: AnswerRecord[] = [],
): ConfidentlyWrong | null {
  const baseline = indexById(baselineRows);
  const repairedById = indexById(repairedRows);

  const answerCounts = new Map<string, number>();
  for (const row of corruptedRows) {
    const value = (row.answer ?? "").trim();
    if (value) answerCounts.set(value, (answerCounts.get(value) ?? 0) + 1);
  }

  const candidates: ConfidentlyWrong[] = [];
  for (const corrupted of corruptedRows) {
    const base = baseline.get(corrupted.id);
    if (!base) continue;
    if (base.judge?.correct !== true) continue;
    if (corrupted.judge?.correct !== false) continue;
    const value = (corrupted.answer ?? "").trim();
    if (!value) continue;
    if (value === (corrupted.ground_truth ?? "").trim()) continue;

    const truth = new Set(
      Array.isArray(corrupted.ground_truth_doc_ids) ? corrupted.ground_truth_doc_ids : [],
    );
    let borrowedFrom: ConfidentlyWrong["borrowedFrom"] = null;
    for (const row of cleanRows) {
      const id = str(row?.paper_id);
      if (!id || truth.has(id)) continue;
      for (const [field, fieldValue] of Object.entries(
        row as unknown as Record<string, unknown>,
      )) {
        if (typeof fieldValue !== "string") continue;
        if (fieldValue.length === 0 || fieldValue.length > MAX_BORROWED_FIELD_CHARS) continue;
        if (fieldValue.trim() !== value) continue;
        borrowedFrom = { paperId: id, field, title: str(row?.title) ?? "" };
        break;
      }
      if (borrowedFrom) break;
    }

    const fixed = repairedById.get(corrupted.id);
    candidates.push({
      ...pair(base, corrupted),
      borrowedFrom,
      repeats: answerCounts.get(value) ?? 1,
      repaired: fixed
        ? {
            answer: fixed.answer ?? "",
            score: num(fixed.judge?.score),
            hit: Boolean(fixed.retrieval_hit),
            correct: bool(fixed.judge?.correct),
          }
        : null,
    });
  }

  candidates.sort((a, b) => {
    const borrowed = Number(Boolean(b.borrowedFrom)) - Number(Boolean(a.borrowedFrom));
    if (borrowed !== 0) return borrowed;
    if (b.repeats !== a.repeats) return b.repeats - a.repeats;
    return a.id.localeCompare(b.id);
  });

  return candidates[0] ?? null;
}

/**
 * Retrieval succeeded and the answer is still empty — the right document was
 * found, but the corruption had already emptied the field the answer needed.
 */
export function findRetrievedButEmpty(
  baselineRows: AnswerRecord[],
  corruptedRows: AnswerRecord[],
  corruptedDataset: CleanRow[],
  log: CorruptionLog | null,
): SilentFailure | null {
  const baseline = indexById(baselineRows);
  const actions = Array.isArray(log?.actions) ? log.actions : [];
  const rowById = new Map(
    corruptedDataset
      .filter((row) => str(row?.paper_id))
      .map((row) => [row.paper_id, row] as const),
  );

  const candidates = corruptedRows
    .filter((row) => row.retrieval_hit === true && (row.answer ?? "").trim().length === 0)
    .sort((a, b) => (a.id ?? "").localeCompare(b.id ?? ""));

  for (const corrupted of candidates) {
    const base = baseline.get(corrupted.id);
    if (!base) continue;
    const truth = Array.isArray(corrupted.ground_truth_doc_ids)
      ? corrupted.ground_truth_doc_ids
      : [];
    const action = actions.find((entry) =>
      (Array.isArray(entry.paper_ids) ? entry.paper_ids : []).some((id) => truth.includes(id)),
    );
    const row = truth.map((id) => rowById.get(id)).find(Boolean);
    return {
      ...pair(base, corrupted),
      corruptionType: action?.type ?? null,
      summaryChars: num(row?.summary_chars),
    };
  }
  return null;
}

/* -------------------------------------------------------------------------- */
/* The clean contract as a graph                                               */
/* -------------------------------------------------------------------------- */

export interface ContractGraph {
  sources: string[];
  derived: string[];
  /** which source column feeds which derived column */
  derivations: { source: string; derived: string }[];
  /** which quality check watches which column */
  watched: { column: string; check: string; passed: boolean | null }[];
  /** checks that look at the dataset as a whole rather than at a column */
  datasetChecks: { check: string; passed: boolean | null }[];
  /** the derived column handed to the embedding model, when it exists */
  embedded: string | null;
}

/**
 * Reads the contract's own naming to work out what feeds what, and joins it to
 * the quality report so the diagram can show which columns anybody downstream
 * actually looks at.
 */
export function contractGraph(
  contract: CleanContract,
  report: QualityReport | null,
  hints: {
    derivedSources: Record<string, string[]>;
    checkColumns: Record<string, string[]>;
    embeddedColumn: string;
  },
): ContractGraph {
  const derived = contract.derived_columns ?? [];
  const derivedSet = new Set(derived);
  const columns = contract.columns ?? [];
  const sources = columns.filter((column) => !derivedSet.has(column));

  const template = new Set(
    (contract.text_for_embedding_template ?? []).map((field) => field.toLowerCase()),
  );

  const derivations: { source: string; derived: string }[] = [];
  for (const target of derived) {
    const named = sources.filter((source) => target.startsWith(`${source}_`));
    const hinted = (hints.derivedSources[target] ?? []).filter((source) =>
      sources.includes(source),
    );
    const templated =
      target === hints.embeddedColumn
        ? sources.filter((source) => template.has(source.toLowerCase()))
        : [];
    const all = new Set([...named, ...hinted, ...templated]);
    for (const source of all) derivations.push({ source, derived: target });
  }

  const watched: ContractGraph["watched"] = [];
  const datasetChecks: ContractGraph["datasetChecks"] = [];
  for (const check of report?.checks ?? []) {
    const byName = columns
      .filter((column) => check.key === column || check.key.startsWith(`${column}_`))
      .sort((a, b) => b.length - a.length)
      .slice(0, 1);
    const hinted = (hints.checkColumns[check.key] ?? []).filter((column) =>
      columns.includes(column),
    );
    const targets = byName.length > 0 ? byName : hinted;
    if (targets.length === 0) {
      datasetChecks.push({ check: check.key, passed: check.passed });
      continue;
    }
    for (const column of targets) {
      watched.push({ column, check: check.key, passed: check.passed });
    }
  }

  return {
    sources,
    derived,
    derivations,
    watched,
    datasetChecks,
    embedded: derived.includes(hints.embeddedColumn) ? hints.embeddedColumn : null,
  };
}

/* -------------------------------------------------------------------------- */
/* Small shared shaping helpers                                                */
/* -------------------------------------------------------------------------- */

/** Count rows per calendar month of a date-ish field, oldest first. */
export function monthlyCounts(
  rows: { published?: string }[],
): { month: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const value = str(row?.published);
    if (!value) continue;
    const month = value.slice(0, 7);
    if (!/^\d{4}-\d{2}$/.test(month)) continue;
    counts.set(month, (counts.get(month) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([month, count]) => ({ month, count }))
    .sort((a, b) => a.month.localeCompare(b.month));
}
