"use client";

import { useCallback, useState } from "react";
import type { LoadState } from "@/lib/api";
import {
  getAnswers,
  getCleanDataset,
  getCorruptionLog,
  getMetrics,
  getPipelineSpec,
  getQuality,
  getReport,
  getTestSet,
} from "@/lib/api";
import {
  auditGate,
  byState,
  corruptionImpact,
  findConfidentlyWrong,
  findRetrievedButEmpty,
  readQualityReports,
  type ConfidentlyWrong,
  type ImpactGroup,
  type QualityReport,
  type SilentFailure,
} from "@/lib/derive";
import { formatDelta, formatInt, formatMetric } from "@/lib/format";
import { useArtifact } from "@/lib/use-artifact";
import {
  METRIC_KEYS,
  RUN_STATES,
  type AnswerRecord,
  type MetricKey,
  type QualityBundle,
  type RagasResult,
  type RunMetrics,
  type RunState,
} from "@/lib/types";
import { ArtifactBoundary } from "@/components/artifact-state";
import { ArrayCell } from "@/components/cells";
import {
  DeltaPill,
  Meters,
  SeriesLegend,
  SERIES,
  Verdict,
  type MeterRow,
} from "@/components/charts";
import { Clamp, Column, DataTable } from "@/components/data-table";
import { AnswerGrid, DamageBars, type VerdictRun } from "@/components/diagrams";
import { GenericJson } from "@/components/generic-json";
import { Markdown } from "@/components/markdown";
import {
  Badge,
  Collapsible,
  DetailDrawer,
  PageHeading,
  PageShell,
  ScrollShell,
  Section,
  StatTile,
  Takeaway,
} from "@/components/ui";

/** Plain-language names for the four headline metrics. Labels only — no values. */
const METRIC_LABEL: Record<MetricKey, string> = {
  retrieval_hit_rate: "Lấy đúng tài liệu",
  mean_token_f1: "Trùng khớp nội dung câu trả lời",
  judge_accuracy: "LLM judge chấm là đúng",
  mean_judge_score: "Điểm judge trung bình",
};

export default function ComparePage() {
  const spec = useArtifact(getPipelineSpec);
  const baseline = useArtifact(useCallback(() => getMetrics("baseline"), []));
  const corrupted = useArtifact(useCallback(() => getMetrics("corrupted"), []));
  const repaired = useArtifact(useCallback(() => getMetrics("repaired"), []));

  const baselineAnswers = useArtifact(useCallback(() => getAnswers("baseline"), []));
  const corruptedAnswers = useArtifact(useCallback(() => getAnswers("corrupted"), []));
  const repairedAnswers = useArtifact(useCallback(() => getAnswers("repaired"), []));
  const corruptedRows = useArtifact(useCallback(() => getCleanDataset("corrupted"), []));
  const log = useArtifact(getCorruptionLog);

  const quality = useArtifact(getQuality);
  const phase1Report = useArtifact(useCallback(() => getReport("phase1"), []));
  const corruptionReport = useArtifact(useCallback(() => getReport("corruption"), []));
  const testSet = useArtifact(getTestSet);

  const [answersState, setAnswersState] = useState<RunState>("corrupted");
  const answers = useArtifact(useCallback(() => getAnswers(answersState), [answersState]));

  const byRunState: Record<RunState, LoadState<RunMetrics>> = {
    baseline,
    corrupted,
    repaired,
  };
  const baselineMetrics = baseline.status === "ok" ? baseline.data : null;
  const present = RUN_STATES.filter((state) => byRunState[state].status === "ok");
  const reports: Map<string, QualityReport> =
    quality.status === "ok"
      ? byState(readQualityReports(quality.data))
      : new Map<string, QualityReport>();

  const impact =
    log.status === "ok" && corruptedAnswers.status === "ok"
      ? corruptionImpact(log.data, corruptedAnswers.data)
      : null;

  const gate =
    log.status === "ok" && corruptedRows.status === "ok" && reports.get("corrupted")
      ? auditGate({
          log: log.data,
          corruptedRows: corruptedRows.data,
          report: reports.get("corrupted")!,
          minSummaryChars:
            spec.status === "ok" ? spec.data.clean_contract.min_summary_chars : null,
          freshnessThresholdDays:
            spec.status === "ok" ? spec.data.freshness.threshold_days : null,
        })
      : null;

  const confidentlyWrong =
    baselineAnswers.status === "ok" &&
    corruptedAnswers.status === "ok" &&
    corruptedRows.status === "ok"
      ? findConfidentlyWrong(
          baselineAnswers.data,
          corruptedAnswers.data,
          corruptedRows.data,
          repairedAnswers.status === "ok" ? repairedAnswers.data : [],
        )
      : null;

  // one row per run, one cell per question, in a stable id order
  const verdictRuns: VerdictRun[] = (
    [
      ["baseline", baselineAnswers],
      ["corrupted", corruptedAnswers],
      ["repaired", repairedAnswers],
    ] as const
  ).flatMap(([state, entry]) =>
    entry.status === "ok"
      ? [
          {
            state,
            correct: [...entry.data]
              .sort((a, b) => (a.id ?? "").localeCompare(b.id ?? ""))
              .map((row) => row.judge?.correct === true),
          },
        ]
      : [],
  );

  const silentFailure =
    baselineAnswers.status === "ok" &&
    corruptedAnswers.status === "ok" &&
    corruptedRows.status === "ok"
      ? findRetrievedButEmpty(
          baselineAnswers.data,
          corruptedAnswers.data,
          corruptedRows.data,
          log.status === "ok" ? log.data : null,
        )
      : null;

  return (
    <PageShell>
      <PageHeading
        eyebrow="Stage 8 · compare"
        title="Data hỏng → câu trả lời hỏng → repair kéo lại toàn bộ"
        lede="Ba lần chạy trên đúng một bộ câu hỏi. Xanh là baseline, đỏ là corrupted, xanh lá là repaired — màu này giữ nguyên ý nghĩa ở mọi trang."
      />

      {present.length > 0 ? (
        <SeriesLegend
          states={[...present]}
          note={
            baselineMetrics?.samples
              ? `${formatInt(baselineMetrics.samples)} câu hỏi mỗi lần chạy`
              : undefined
          }
        />
      ) : null}

      <div className="grid gap-5 xl:grid-cols-2">
        {METRIC_KEYS.map((metric) => (
          <MetricCard
            key={metric}
            metric={metric}
            byRunState={byRunState}
            baselineMetrics={baselineMetrics}
          />
        ))}
      </div>

      <Section
        title="Từng câu hỏi một, ba lần chạy"
        subtitle="Cùng một bộ câu hỏi, xếp theo cùng thứ tự ở cả ba hàng. Chỗ thủng ở hàng giữa chính là số câu hỏi mà corruption làm hỏng."
      >
        {verdictRuns.length > 0 ? (
          <AnswerGrid runs={verdictRuns} />
        ) : (
          <PendingBlock
            states={[baselineAnswers, corruptedAnswers, repairedAnswers]}
            label="data/results/*_answers.json"
          />
        )}
      </Section>

      <VerdictRow reports={reports} quality={quality} />

      <Section
        title="Loại lỗi nào phá nhiều nhất"
        subtitle="Mỗi câu hỏi được gán vào nhóm theo paper mà nó hỏi. Nhóm control là những câu hỏi về paper không bị đụng vào — chúng vẫn hoàn hảo, nên phần sụt còn lại đúng là do corruption."
        tone="alert"
      >
        {impact ? (
          <ImpactChart impact={impact} gate={gate} />
        ) : (
          <PendingBlock
            states={[log, corruptedAnswers]}
            label="corruption_log.json + corrupted_answers.json"
          />
        )}
      </Section>

      <Section
        title="Agent không im lặng — nó trả lời sai một cách tự tin"
        subtitle="Cặp câu hỏi này lấy ra từ chính hai file answers: baseline trả đúng, corrupted trả một giá trị có thật nhưng của paper khác."
        tone="alert"
      >
        {confidentlyWrong ? (
          <ConfidentlyWrongExhibit item={confidentlyWrong} />
        ) : (
          <PendingBlock
            states={[baselineAnswers, corruptedAnswers, corruptedRows]}
            label="baseline_answers.json + corrupted_answers.json"
            emptyMessage="Không có câu nào thoả điều kiện baseline đúng / corrupted sai với câu trả lời khác rỗng."
          />
        )}
      </Section>

      <Section
        title="Lấy đúng tài liệu vẫn không đủ"
        subtitle="Retrieval trả về đúng paper cần tìm, nhưng trường mà câu trả lời cần đã bị corruption xoá rỗng từ trước."
        tone="alert"
      >
        {silentFailure ? (
          <SilentFailureExhibit item={silentFailure} />
        ) : (
          <PendingBlock
            states={[baselineAnswers, corruptedAnswers, corruptedRows]}
            label="corrupted_answers.json"
            emptyMessage="Không có câu nào retrieval_hit = true mà answer rỗng."
          />
        )}
      </Section>

      <DetailDrawer>
        <Collapsible summary="Bảng metrics đầy đủ" hint="data/results/*_metrics.json">
          {present.length > 0 ? (
            <MetricsTable byRunState={byRunState} baselineMetrics={baselineMetrics} />
          ) : (
            <PendingBlock
              states={RUN_STATES.map((state) => byRunState[state])}
              label="*_metrics.json"
            />
          )}
        </Collapsible>

        <Collapsible summary="RAGAS" hint="trường ragas trong mỗi file metrics">
          <div className="grid gap-3 lg:grid-cols-3">
            {RUN_STATES.map((state) => (
              <div key={state} className="rounded-lg border border-line bg-canvas p-4">
                <Badge
                  tone={
                    state === "baseline" ? "blue" : state === "corrupted" ? "red" : "ok"
                  }
                >
                  {state}
                </Badge>
                <div className="mt-3">
                  <RagasBody result={byRunState[state]} />
                </div>
              </div>
            ))}
          </div>
        </Collapsible>

        <Collapsible summary="Toàn bộ output data quality" hint="data/quality/*.json">
          <ArtifactBoundary state={quality} label="data/quality/*.json">
            {(data) => <QualityView bundle={data} />}
          </ArtifactBoundary>
        </Collapsible>

        <Collapsible summary="Phase 1 report" hint="data/reports/phase1_report.md">
          <ArtifactBoundary state={phase1Report} label="phase1_report.md">
            {(data) => <Markdown source={data.markdown} />}
          </ArtifactBoundary>
        </Collapsible>

        <Collapsible summary="Corruption report" hint="data/reports/corruption_report.md">
          <ArtifactBoundary state={corruptionReport} label="corruption_report.md">
            {(data) => <Markdown source={data.markdown} />}
          </ArtifactBoundary>
        </Collapsible>

        <Collapsible
          summary="Câu trả lời từng câu hỏi"
          hint="data/results/{state}_answers.json"
        >
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center gap-2">
              {testSet.status === "ok" ? (
                <Badge tone="neutral">test set {formatInt(testSet.data.length)}</Badge>
              ) : null}
              <div className="flex gap-1 rounded-md border border-line bg-canvas p-1">
                {RUN_STATES.map((state) => (
                  <button
                    key={state}
                    type="button"
                    onClick={() => setAnswersState(state)}
                    aria-pressed={answersState === state}
                    className={`rounded px-3 py-1 text-sm font-semibold transition-colors ${
                      answersState === state
                        ? "bg-brand-blue text-white"
                        : "text-ink-soft hover:text-brand-blue"
                    }`}
                  >
                    {state}
                  </button>
                ))}
              </div>
            </div>
            <ArtifactBoundary state={answers} label={`${answersState}_answers.json`}>
              {(rows) => <AnswersTable rows={rows} />}
            </ArtifactBoundary>
          </div>
        </Collapsible>
      </DetailDrawer>
    </PageShell>
  );
}

/* -------------------------------------------------------------------------- */
/* Headline: one card per metric, three meters inside                          */
/* -------------------------------------------------------------------------- */

function MetricCard({
  metric,
  byRunState,
  baselineMetrics,
}: {
  metric: MetricKey;
  byRunState: Record<RunState, LoadState<RunMetrics>>;
  baselineMetrics: RunMetrics | null;
}) {
  const rows: MeterRow[] = [];
  const values: number[] = [];

  for (const state of RUN_STATES) {
    const entry = byRunState[state];
    if (entry.status !== "ok") continue;
    const value = entry.data?.[metric];
    if (typeof value !== "number" || !Number.isFinite(value)) continue;
    values.push(value);
    rows.push({
      key: state,
      name: state,
      value,
      display: formatMetric(value, 3),
      fill: SERIES[state].fill,
      track: SERIES[state].track,
      badge: (
        <DeltaPill
          delta={
            state === "baseline" ? null : formatDelta(value, baselineMetrics?.[metric], 3)
          }
        />
      ),
    });
  }

  if (rows.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-line bg-surface px-6 py-8">
        <h3 className="text-xl font-semibold text-ink">{METRIC_LABEL[metric]}</h3>
        <p className="mt-2 text-base text-ink-faint">
          Chưa có state nào có giá trị cho <span className="font-mono">{metric}</span>.
        </p>
      </div>
    );
  }

  const observedMax = Math.max(...values);
  const domainMax = observedMax <= 1 ? 1 : Math.ceil(observedMax);

  return (
    <div className="rounded-2xl border border-line bg-surface px-6 py-5">
      <h3 className="text-xl font-semibold tracking-tight text-ink sm:text-2xl">
        {METRIC_LABEL[metric]}
      </h3>
      <p className="mb-4 font-mono text-sm text-ink-faint">
        {metric} · trục 0 → {domainMax}
      </p>
      <Meters rows={rows} domainMax={domainMax} labelWidth="6.5rem" />
    </div>
  );
}

/* -------------------------------------------------------------------------- */

function VerdictRow({
  reports,
  quality,
}: {
  reports: Map<string, QualityReport>;
  quality: LoadState<QualityBundle>;
}) {
  if (reports.size === 0) {
    return (
      <PendingBlock states={[quality]} label="data/quality/*.json" />
    );
  }
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      {RUN_STATES.map((state) => {
        const report = reports.get(state);
        if (!report) return null;
        const fresh = report.freshness;
        return (
          <div
            key={state}
            className="flex flex-col gap-3 rounded-2xl border border-line bg-surface px-5 py-4"
          >
            <div className="flex flex-wrap items-center gap-3">
              <span
                aria-hidden
                className="inline-block h-3.5 w-3.5 rounded-sm"
                style={{ backgroundColor: SERIES[state].fill }}
              />
              <span className="text-lg font-bold text-ink">{state}</span>
              <span className="ml-auto">
                <Verdict status={report.status} passed={report.passed} size="lg" />
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-x-6 gap-y-1 text-base text-ink-soft">
              <span>
                quality checks{" "}
                <span className="font-mono font-semibold text-ink">
                  {report.passedChecks ?? "—"}/{report.totalChecks ?? "—"}
                </span>
              </span>
              {fresh ? (
                <span className="flex items-center gap-2">
                  freshness
                  <Verdict status={fresh.status} passed={fresh.isFresh} size="sm" />
                  {typeof fresh.staleRows === "number" ? (
                    <span className="text-ink-faint">{fresh.staleRows} stale</span>
                  ) : null}
                </span>
              ) : null}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Per-corruption-type damage                                                  */
/* -------------------------------------------------------------------------- */

function ImpactChart({
  impact,
  gate,
}: {
  impact: ReturnType<typeof corruptionImpact>;
  gate: ReturnType<typeof auditGate> | null;
}) {
  const ordered = [...impact.groups].sort((a, b) => a.tokenF1 - b.tokenF1);
  const worst = ordered[0];
  const best = ordered[ordered.length - 1];

  return (
    <div className="flex flex-col gap-6">
      {worst && best && worst.type !== best.type ? (
        <Takeaway
          tone="red"
          figure={
            gate ? (
              <div className="text-right">
                <p className="text-6xl font-semibold leading-none text-brand-red">
                  {gate.invisibleCount}/{gate.items.length}
                </p>
                <p className="text-base text-ink-soft">dạng lỗi quality gate không thấy</p>
              </div>
            ) : undefined
          }
        >
          <span className="font-mono">{worst.type}</span> kéo token_f1 xuống{" "}
          <span className="text-brand-red">{formatMetric(worst.tokenF1, 3)}</span>, còn{" "}
          <span className="font-mono">{best.type}</span> gần như không gây thiệt hại gì (
          {formatMetric(best.tokenF1, 3)}).
        </Takeaway>
      ) : null}

      <DamageBars
        groups={impact.groups}
        control={impact.control}
        gateItems={gate?.items ?? []}
      />

      <GroupFacts impact={impact} gate={gate} />

      <p className="text-base text-ink-soft">
        {impact.sharedPaperIds.length > 0 ? (
          <>
            {impact.sharedPaperIds.length} paper bị nhiều hơn một dạng lỗi chạm vào, nên{" "}
            {impact.multiGroupQuestions} câu hỏi được tính ở hai nhóm.{" "}
          </>
        ) : null}
        {gate && gate.datasetLevelFailures.length > 0 ? (
          <>
            Check <span className="font-mono">{gate.datasetLevelFailures.join(", ")}</span>{" "}
            chạy trên cả dataset nên không quy được về dòng nào.
          </>
        ) : null}
      </p>
    </div>
  );
}

/** The same groups as the chart, with the numbers the bars do not carry. */
function GroupFacts({
  impact,
  gate,
}: {
  impact: ReturnType<typeof corruptionImpact>;
  gate: ReturnType<typeof auditGate> | null;
}) {
  const gateByType = new Map((gate?.items ?? []).map((item) => [item.type, item]));
  const ordered = [...impact.groups].sort((a, b) => a.tokenF1 - b.tokenF1);
  const all: ImpactGroup[] = impact.control ? [...ordered, impact.control] : ordered;

  return (
    <ScrollShell>
      <table className="w-full min-w-max border-collapse text-left">
        <thead>
          <tr className="border-b border-line">
            {["nhóm", "dòng", "câu hỏi", "hit rate", "token f1", "judge", "quality gate"].map(
              (header) => (
                <th
                  key={header}
                  className="px-3 py-2 text-sm font-semibold uppercase tracking-wide text-ink-faint"
                >
                  {header}
                </th>
              ),
            )}
          </tr>
        </thead>
        <tbody>
          {all.map((group) => {
            const detail = group.type ? gateByType.get(group.type) : undefined;
            return (
              <tr
                key={group.type ?? "__control__"}
                className="border-b border-line-soft last:border-b-0"
              >
                <th
                  scope="row"
                  className="whitespace-nowrap px-3 py-2 text-left font-mono text-base font-semibold text-ink"
                >
                  <span className="flex items-center gap-2">
                    <span
                      aria-hidden
                      className="inline-block h-3 w-3 rounded-sm"
                      style={{
                        backgroundColor:
                          group.type === null ? SERIES.baseline.fill : SERIES.corrupted.fill,
                      }}
                    />
                    {group.type ?? "không bị đụng"}
                  </span>
                </th>
                <td className="px-3 py-2 font-mono tabular-nums text-ink-soft">
                  {group.rowsAffected === null ? "—" : formatInt(group.rowsAffected)}
                </td>
                <td className="px-3 py-2 font-mono tabular-nums text-ink-soft">
                  {formatInt(group.questions)}
                </td>
                <td className="px-3 py-2 font-mono tabular-nums text-ink">
                  {formatMetric(group.hitRate, 3)}
                </td>
                <td className="px-3 py-2 font-mono tabular-nums text-ink">
                  {formatMetric(group.tokenF1, 3)}
                </td>
                <td className="px-3 py-2 font-mono tabular-nums text-ink">
                  {formatMetric(group.judgeAccuracy, 3)}
                </td>
                <td className="px-3 py-2">
                  {detail ? (
                    detail.visible ? (
                      <span className="whitespace-nowrap font-mono text-sm text-ok">
                        ✓ {detail.caughtBy.join(", ")}
                      </span>
                    ) : (
                      <span className="whitespace-nowrap text-sm font-bold text-brand-red-700">
                        không check nào bắt
                      </span>
                    )
                  ) : (
                    <span className="text-sm text-ink-faint">—</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </ScrollShell>
  );
}

/* -------------------------------------------------------------------------- */
/* Exhibit 1 — confidently wrong                                               */
/* -------------------------------------------------------------------------- */

function ConfidentlyWrongExhibit({ item }: { item: ConfidentlyWrong }) {
  return (
    <div className="flex flex-col gap-5">
      <div className="rounded-xl border border-line bg-canvas px-5 py-4">
        <p className="text-sm font-semibold uppercase tracking-wide text-ink-faint">
          Câu hỏi · <span className="font-mono normal-case">{item.id}</span>
        </p>
        <p className="mt-1 text-xl leading-snug text-ink">{item.question}</p>
        <p className="mt-2 text-base text-ink-soft">
          Đáp án đúng:{" "}
          <span className="font-mono text-lg font-semibold text-ink">
            {item.groundTruth}
          </span>
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <AnswerSide
          state="baseline"
          answer={item.baselineAnswer}
          score={item.baselineScore}
          hit={item.baselineHit}
          correct
        />
        <AnswerSide
          state="corrupted"
          answer={item.corruptedAnswer}
          score={item.corruptedScore}
          hit={item.corruptedHit}
          correct={false}
        />
        {item.repaired ? (
          <AnswerSide
            state="repaired"
            answer={item.repaired.answer}
            score={item.repaired.score}
            hit={item.repaired.hit}
            correct={item.repaired.correct}
          />
        ) : (
          <div className="rounded-xl border border-dashed border-line bg-canvas px-5 py-4 text-base text-ink-faint">
            Chưa có <span className="font-mono">repaired_answers.json</span>.
          </div>
        )}
      </div>

      {item.borrowedFrom ? (
        <div className="rounded-xl border-2 border-brand-red-200 bg-brand-red-50 px-5 py-4">
          <p className="text-xl font-semibold leading-snug text-ink">
            <span className="font-mono">{item.corruptedAnswer}</span> không phải con số bịa —
            nó là trường{" "}
            <span className="font-mono">{item.borrowedFrom.field}</span> của một paper khác
            trong chính dataset.
          </p>
          <p className="break-anywhere mt-2 font-mono text-base text-ink-soft">
            {item.borrowedFrom.paperId}
          </p>
          {item.borrowedFrom.title ? (
            <p className="mt-1 text-base text-ink-soft">{item.borrowedFrom.title}</p>
          ) : null}
          {item.repeats > 1 ? (
            <p className="mt-2 text-base font-semibold text-brand-red-700">
              Cùng giá trị sai này xuất hiện ở {item.repeats} câu trả lời khác nhau.
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

/**
 * One run's answer to the same question. The wrong one is meant to read as
 * wrong from the back of the room: red frame, red hatch, a struck-through value
 * and an ✕ verdict.
 */
function AnswerSide({
  state,
  answer,
  score,
  hit,
  correct,
}: {
  state: RunState;
  answer: string;
  score: number | null;
  hit: boolean;
  correct: boolean | null;
}) {
  const series = SERIES[state];
  const wrong = correct === false;
  return (
    <div
      className="relative flex flex-col gap-3 overflow-hidden rounded-xl border-2 px-5 py-4"
      style={{
        borderColor: wrong ? "var(--color-brand-red)" : series.fill,
        backgroundColor: wrong ? "var(--color-brand-red-50)" : "var(--color-surface)",
      }}
    >
      {wrong ? (
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            backgroundImage:
              "repeating-linear-gradient(135deg, transparent 0 10px, var(--color-brand-red-100) 10px 12px)",
          }}
        />
      ) : null}

      <div className="relative flex items-center gap-2.5">
        <span
          aria-hidden
          className="inline-block h-3.5 w-3.5 rounded-sm"
          style={{ backgroundColor: series.fill }}
        />
        <span className="text-lg font-bold text-ink">{state}</span>
        <span
          className={`ml-auto rounded-full border px-3 py-1 text-sm font-bold ${
            wrong
              ? "border-brand-red-200 bg-surface text-brand-red-700"
              : correct === true
                ? "border-ok-200 bg-surface text-ok"
                : "border-line bg-surface text-ink-faint"
          }`}
        >
          {wrong ? "✕ judge: sai" : correct === true ? "✓ judge: đúng" : "judge: —"}
        </span>
      </div>

      <p
        className="break-anywhere relative text-4xl font-semibold leading-tight"
        style={{
          color: wrong ? "var(--color-brand-red)" : series.fill,
          textDecoration: wrong ? "line-through" : undefined,
          textDecorationThickness: wrong ? 3 : undefined,
        }}
      >
        {answer || "(rỗng)"}
      </p>

      <p className="relative text-base text-ink-soft">
        judge score <span className="font-mono">{formatMetric(score, 1)}</span> · retrieval
        hit{" "}
        <span className={hit ? "font-semibold text-ok" : "font-semibold text-brand-red-700"}>
          {String(hit)}
        </span>
      </p>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Exhibit 2 — retrieved, but empty                                            */
/* -------------------------------------------------------------------------- */

function SilentFailureExhibit({ item }: { item: SilentFailure }) {
  return (
    <div className="flex flex-col gap-5">
      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-xl border-2 border-ok-200 bg-ok-50 px-5 py-4">
          <p className="text-base font-semibold uppercase tracking-wide text-ink-faint">
            retrieval_hit
          </p>
          <p className="mt-1 text-5xl font-semibold text-ok">true</p>
          <p className="mt-1 text-base text-ink-soft">đúng paper đã được lấy về</p>
        </div>
        <div className="rounded-xl border-2 border-brand-red-200 bg-brand-red-50 px-5 py-4">
          <p className="text-base font-semibold uppercase tracking-wide text-ink-faint">
            answer
          </p>
          <p className="mt-1 text-5xl font-semibold text-brand-red">
            {item.corruptedAnswer.trim() === "" ? "rỗng" : item.corruptedAnswer}
          </p>
          <p className="mt-1 text-base text-ink-soft">
            token_f1 {formatMetric(item.corruptedTokenF1, 3)} · judge{" "}
            {formatMetric(item.corruptedScore, 1)}
          </p>
        </div>
        <div className="rounded-xl border border-line bg-canvas px-5 py-4">
          <p className="text-base font-semibold uppercase tracking-wide text-ink-faint">
            summary_chars của paper đó
          </p>
          <p className="mt-1 text-5xl font-semibold text-ink">
            {item.summaryChars === null ? "—" : formatInt(item.summaryChars)}
          </p>
          {item.corruptionType ? (
            <p className="mt-1 break-anywhere font-mono text-base text-brand-red-700">
              {item.corruptionType}
            </p>
          ) : null}
        </div>
      </div>

      <div className="rounded-xl border border-line bg-canvas px-5 py-4">
        <p className="text-sm font-semibold uppercase tracking-wide text-ink-faint">
          Câu hỏi · <span className="font-mono normal-case">{item.id}</span>
        </p>
        <p className="mt-1 text-xl leading-snug text-ink">{item.question}</p>
        <div className="mt-3 grid gap-4 lg:grid-cols-2">
          <div>
            <p className="text-sm font-semibold uppercase tracking-wide text-brand-blue">
              baseline trả lời
            </p>
            <p className="break-anywhere mt-1 text-base leading-relaxed text-ink">
              {item.baselineAnswer || "(rỗng)"}
            </p>
          </div>
          <div>
            <p className="text-sm font-semibold uppercase tracking-wide text-brand-red-700">
              corrupted trả lời
            </p>
            <p className="break-anywhere mt-1 text-base leading-relaxed text-ink">
              {item.corruptedAnswer || "(rỗng)"}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Shared empty / pending block                                                */
/* -------------------------------------------------------------------------- */

function PendingBlock({
  states,
  label,
  emptyMessage,
}: {
  states: LoadState<unknown>[];
  label: string;
  emptyMessage?: string;
}) {
  const missing = states.filter((state) => state.status === "missing");
  const errors = states.filter((state) => state.status === "error");
  const loading = states.some((state) => state.status === "loading");

  if (loading && missing.length === 0 && errors.length === 0) {
    return <p className="text-lg text-ink-faint">Đang đọc {label}…</p>;
  }
  if (missing.length > 0) {
    return (
      <div className="rounded-xl border border-dashed border-brand-blue-200 bg-brand-blue-50/60 px-5 py-5">
        <p className="text-lg text-ink-soft">
          Chưa có artifact cần thiết. Không có giá trị nào được điền thay.
        </p>
        <ul className="mt-3 flex flex-col gap-1">
          {missing.map((state) => (
            <li
              key={state.status === "missing" ? state.path : ""}
              className="break-anywhere font-mono text-base text-ink"
            >
              {state.status === "missing" ? state.path : null}
            </li>
          ))}
        </ul>
      </div>
    );
  }
  if (errors.length > 0) {
    return (
      <div className="flex flex-col gap-2">
        {errors.map((state, index) => (
          <p
            key={index}
            className="break-anywhere rounded-md border border-brand-red-200 bg-brand-red-50 px-3 py-2 text-base text-brand-red-700"
          >
            {state.status === "error" ? state.message : null}
          </p>
        ))}
      </div>
    );
  }
  return (
    <p className="rounded-xl border border-dashed border-line bg-canvas px-5 py-6 text-center text-lg text-ink-faint">
      {emptyMessage ?? `Không tìm thấy dữ liệu phù hợp trong ${label}.`}
    </p>
  );
}

/* -------------------------------------------------------------------------- */
/* Demoted detail                                                              */
/* -------------------------------------------------------------------------- */

function MetricsTable({
  byRunState,
  baselineMetrics,
}: {
  byRunState: Record<RunState, LoadState<RunMetrics>>;
  baselineMetrics: RunMetrics | null;
}) {
  const rows = RUN_STATES.flatMap((state) => {
    const result = byRunState[state];
    return result.status === "ok" ? [{ state, metrics: result.data }] : [];
  });

  const columns: Column<{ state: RunState; metrics: RunMetrics }>[] = [
    {
      key: "state",
      header: "state",
      cellClassName: "whitespace-nowrap",
      render: (row) => (
        <Badge
          tone={row.state === "baseline" ? "blue" : row.state === "corrupted" ? "red" : "ok"}
        >
          {row.state}
        </Badge>
      ),
    },
    {
      key: "samples",
      header: "samples",
      cellClassName: "whitespace-nowrap text-right font-mono tabular-nums",
      headerClassName: "text-right",
      render: (row) =>
        typeof row.metrics?.samples === "number" ? formatInt(row.metrics.samples) : "—",
    },
    ...METRIC_KEYS.map<Column<{ state: RunState; metrics: RunMetrics }>>((metric) => ({
      key: metric,
      header: metric,
      cellClassName: "whitespace-nowrap text-right",
      headerClassName: "text-right",
      render: (row) => {
        const value = row.metrics?.[metric];
        const delta =
          row.state === "baseline" ? null : formatDelta(value, baselineMetrics?.[metric]);
        return (
          <span className="flex flex-col items-end">
            <span className="font-mono tabular-nums text-ink">{formatMetric(value)}</span>
            {delta ? (
              <span
                className={`font-mono text-[11px] tabular-nums ${
                  delta.startsWith("−")
                    ? "text-brand-red-700"
                    : delta.startsWith("+")
                      ? "text-ok"
                      : "text-ink-faint"
                }`}
              >
                {delta}
              </span>
            ) : null}
          </span>
        );
      },
    })),
  ];

  return (
    <DataTable
      columns={columns}
      rows={rows}
      rowKey={(row) => row.state}
      footer="Dòng phụ nhỏ dưới mỗi ô là delta so với baseline."
    />
  );
}

function RagasBody({ result }: { result: LoadState<RunMetrics> }) {
  if (result.status === "loading") {
    return <p className="text-sm text-ink-faint">Đang đọc…</p>;
  }
  if (result.status === "missing") {
    return (
      <p className="break-anywhere text-sm text-ink-faint">
        Chưa có <span className="font-mono">{result.path}</span>
      </p>
    );
  }
  if (result.status === "error") {
    return <p className="break-anywhere text-sm text-brand-red-700">{result.message}</p>;
  }

  const ragas: RagasResult | null | undefined = result.data?.ragas;
  if (ragas === null || ragas === undefined) {
    return (
      <p className="text-sm text-ink-faint">
        File metrics không có trường <span className="font-mono">ragas</span>.
      </p>
    );
  }
  if (typeof ragas !== "object") {
    return <p className="break-anywhere font-mono text-sm">{String(ragas)}</p>;
  }
  if ("skipped" in ragas && typeof ragas.skipped === "string") {
    return (
      <div className="flex flex-col gap-1.5">
        <Badge tone="muted">skipped</Badge>
        <p className="break-anywhere text-sm text-ink-soft">{ragas.skipped}</p>
      </div>
    );
  }
  if ("error" in ragas && typeof ragas.error === "string") {
    return (
      <div className="flex flex-col gap-1.5">
        <Badge tone="red">error</Badge>
        <p className="break-anywhere text-sm text-brand-red-700">{ragas.error}</p>
      </div>
    );
  }
  return <GenericJson value={ragas} />;
}

function QualityView({ bundle }: { bundle: QualityBundle }) {
  if (!bundle?.files || bundle.files.length === 0) {
    return (
      <p className="rounded-md border border-dashed border-line bg-canvas px-4 py-6 text-center text-sm text-ink-faint">
        Thư mục data/quality không có file JSON nào.
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-2">
      {bundle.files.map((file) => (
        <Collapsible key={file.path} summary={file.name} hint={file.path}>
          <GenericJson value={file.data} />
        </Collapsible>
      ))}
    </div>
  );
}

function AnswersTable({ rows }: { rows: AnswerRecord[] }) {
  const columns: Column<AnswerRecord>[] = [
    {
      key: "id",
      header: "id",
      cellClassName: "whitespace-nowrap font-mono text-xs",
      render: (row) => row.id || "—",
    },
    {
      key: "question_type",
      header: "question_type",
      cellClassName: "whitespace-nowrap text-xs",
      render: (row) => row.question_type || "—",
    },
    {
      key: "question",
      header: "question",
      cellClassName: "min-w-[18rem] max-w-[26rem] text-xs",
      render: (row) => <Clamp text={row.question} lines={2} />,
    },
    {
      key: "retrieval_hit",
      header: "retrieval_hit",
      cellClassName: "whitespace-nowrap",
      render: (row) => (
        <Badge tone={row.retrieval_hit ? "ok" : "red"}>
          {String(Boolean(row.retrieval_hit))}
        </Badge>
      ),
    },
    {
      key: "token_f1",
      header: "token_f1",
      cellClassName: "whitespace-nowrap text-right font-mono tabular-nums",
      headerClassName: "text-right",
      render: (row) => formatMetric(row.token_f1),
    },
    {
      key: "judge_score",
      header: "judge.score",
      cellClassName: "whitespace-nowrap text-right font-mono tabular-nums",
      headerClassName: "text-right",
      render: (row) =>
        typeof row.judge?.score === "number" ? formatMetric(row.judge.score, 2) : "—",
    },
    {
      key: "judge_correct",
      header: "judge.correct",
      cellClassName: "whitespace-nowrap",
      render: (row) =>
        typeof row.judge?.correct === "boolean" ? (
          <Badge tone={row.judge.correct ? "ok" : "red"}>{String(row.judge.correct)}</Badge>
        ) : (
          <span className="text-ink-faint">—</span>
        ),
    },
    {
      key: "retrieved",
      header: "retrieved_doc_ids",
      cellClassName: "min-w-[12rem] max-w-[18rem] text-xs",
      render: (row) => <ArrayCell values={row.retrieved_doc_ids} />,
    },
    {
      key: "detail",
      header: "chi tiết",
      cellClassName: "min-w-[10rem] text-xs",
      render: (row) => <AnswerDetail row={row} />,
    },
  ];

  const hits = rows.filter((row) => row.retrieval_hit).length;

  return (
    <div className="flex flex-col gap-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <StatTile label="Số câu hỏi" value={formatInt(rows.length)} />
        <StatTile
          label="retrieval_hit = true"
          value={`${formatInt(hits)} / ${formatInt(rows.length)}`}
          tone={rows.length > 0 && hits === rows.length ? "ok" : "neutral"}
          hint="đếm trực tiếp từ file answers"
        />
      </div>
      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(row, index) => `${row.id || "q"}-${index}`}
        maxHeightClass="max-h-[36rem]"
        footer={`${formatInt(rows.length)} câu đọc từ file.`}
      />
    </div>
  );
}

function AnswerDetail({ row }: { row: AnswerRecord }) {
  return (
    <details className="text-xs">
      <summary className="cursor-pointer text-brand-blue">Mở</summary>
      <div className="mt-2 flex w-[22rem] flex-col gap-2">
        <Field label="answer" value={row.answer} />
        <Field label="ground_truth" value={row.ground_truth} />
        <Field
          label="ground_truth_doc_ids"
          value={
            Array.isArray(row.ground_truth_doc_ids)
              ? row.ground_truth_doc_ids.join(", ")
              : ""
          }
        />
        <Field label="judge.reasoning" value={row.judge?.reasoning ?? ""} />
        {Array.isArray(row.retrieved_contexts) && row.retrieved_contexts.length > 0 ? (
          <div>
            <p className="font-mono text-[11px] text-ink-faint">retrieved_contexts</p>
            <ScrollShell>
              <ol className="mt-1 flex flex-col gap-1">
                {row.retrieved_contexts.map((context, index) => (
                  <li
                    key={index}
                    className="break-anywhere rounded border border-line bg-canvas px-2 py-1 text-[11.5px] text-ink-soft"
                  >
                    {context}
                  </li>
                ))}
              </ol>
            </ScrollShell>
          </div>
        ) : null}
      </div>
    </details>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="font-mono text-[11px] text-ink-faint">{label}</p>
      <p className="break-anywhere whitespace-pre-wrap text-[12px] text-ink">
        {value || "—"}
      </p>
    </div>
  );
}
