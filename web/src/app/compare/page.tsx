"use client";

import { useCallback, useState } from "react";
import type { LoadState } from "@/lib/api";
import {
  getAnswers,
  getFreshness,
  getMetrics,
  getPipelineSpec,
  getQuality,
  getReport,
  getTestSet,
} from "@/lib/api";
import { formatDelta, formatInt, formatMetric } from "@/lib/format";
import { useArtifact } from "@/lib/use-artifact";
import {
  METRIC_KEYS,
  RUN_STATES,
  type AnswerRecord,
  type FreshnessReport,
  type MetricKey,
  type QualityBundle,
  type RagasResult,
  type RunMetrics,
  type RunState,
} from "@/lib/types";
import { ArtifactBoundary } from "@/components/artifact-state";
import { ArrayCell } from "@/components/cells";
import { Clamp, Column, DataTable } from "@/components/data-table";
import { GenericJson } from "@/components/generic-json";
import { Markdown } from "@/components/markdown";
import { MetricBars, StateLegend, type MetricSeries } from "@/components/metric-bars";
import {
  Badge,
  Collapsible,
  CommandBlock,
  Mono,
  Note,
  PageHeading,
  PageShell,
  Panel,
  ScrollShell,
  StatTile,
} from "@/components/ui";

const FRESHNESS_KNOWN_KEYS = [
  "latest_published",
  "oldest_published",
  "stale_rows",
  "total_rows",
  "is_fresh",
] as const;

export default function ComparePage() {
  const spec = useArtifact(getPipelineSpec);
  const baseline = useArtifact(useCallback(() => getMetrics("baseline"), []));
  const corrupted = useArtifact(useCallback(() => getMetrics("corrupted"), []));
  const repaired = useArtifact(useCallback(() => getMetrics("repaired"), []));

  const freshness = useArtifact(getFreshness);
  const quality = useArtifact(getQuality);
  const phase1Report = useArtifact(useCallback(() => getReport("phase1"), []));
  const corruptionReport = useArtifact(useCallback(() => getReport("corruption"), []));
  const testSet = useArtifact(getTestSet);

  const [answersState, setAnswersState] = useState<RunState>("baseline");
  const answers = useArtifact(useCallback(() => getAnswers(answersState), [answersState]));

  const byState: Record<RunState, LoadState<RunMetrics>> = {
    baseline,
    corrupted,
    repaired,
  };
  const present = RUN_STATES.filter((state) => byState[state].status === "ok");
  const baselineMetrics = baseline.status === "ok" ? baseline.data : null;

  return (
    <PageShell>
      <PageHeading
        eyebrow="Stage 8 · compare"
        title="Data quality quyết định RAG quality"
        lede="Ba lần chạy trên cùng một test set, khác nhau duy nhất ở chất lượng dataset được index. Chỉ những state đã có file metrics mới xuất hiện — không có dòng nào được suy đoán."
      />

      <Panel
        title="Bảng metrics"
        subtitle={
          <>
            Từ <Mono>data/results/{"{baseline,corrupted,repaired}"}_metrics.json</Mono>.
            Delta tính so với baseline và chỉ hiện khi cả hai file cùng tồn tại.
          </>
        }
        aside={
          <Badge tone={present.length === RUN_STATES.length ? "ok" : "muted"}>
            {present.length}/{RUN_STATES.length} state
          </Badge>
        }
      >
        <div className="flex flex-col gap-4">
          {present.length > 0 ? (
            <MetricsTable byState={byState} baselineMetrics={baselineMetrics} />
          ) : null}
          <MissingStates byState={byState} />
        </div>
      </Panel>

      <Panel
        title="Biểu đồ so sánh"
        subtitle="Mỗi metric có trục riêng vì bốn metric không đảm bảo cùng thang đo. Thanh chỉ vẽ cho state đã có file."
      >
        {present.length === 0 ? (
          <p className="rounded-md border border-dashed border-line bg-canvas px-4 py-6 text-center text-sm text-ink-faint">
            Chưa có file metrics nào — biểu đồ sẽ xuất hiện ngay khi có ít nhất một state.
          </p>
        ) : (
          <div className="flex flex-col gap-4">
            <StateLegend />
            <div className="grid gap-3 lg:grid-cols-2">
              {METRIC_KEYS.map((metric) => (
                <MetricBars
                  key={metric}
                  metric={metric}
                  series={buildSeries(byState, metric)}
                  baseline={
                    baselineMetrics && typeof baselineMetrics[metric] === "number"
                      ? (baselineMetrics[metric] as number)
                      : null
                  }
                />
              ))}
            </div>
          </div>
        )}
      </Panel>

      <Panel
        title="RAGAS"
        subtitle="Trường ragas trong mỗi file metrics có thể là skip marker, error marker, hoặc object metric — cả ba trường hợp đều được hiển thị nguyên trạng."
      >
        <div className="grid gap-3 lg:grid-cols-3">
          {RUN_STATES.map((state) => (
            <RagasCard key={state} state={state} result={byState[state]} />
          ))}
        </div>
      </Panel>

      <Panel
        title="Freshness report"
        subtitle={
          <>
            Từ <Mono>data/quality/freshness_report.json</Mono>. Shape chưa chốt phía Python
            nên FE render key đã biết nếu có, và luôn đổ toàn bộ JSON thật ở dưới.
          </>
        }
        aside={
          spec.status === "ok" ? (
            <Badge tone="blue">
              threshold {spec.data.freshness.threshold_days} ngày
            </Badge>
          ) : null
        }
      >
        <ArtifactBoundary state={freshness} label="freshness_report.json">
          {(data) => <FreshnessView report={data} />}
        </ArtifactBoundary>
      </Panel>

      <Panel
        title="Data quality outputs"
        subtitle="Mọi file JSON tìm thấy trong thư mục data/quality, hiển thị nguyên trạng."
      >
        <ArtifactBoundary state={quality} label="data/quality/*.json">
          {(data) => <QualityView bundle={data} />}
        </ArtifactBoundary>
      </Panel>

      <Panel
        title="Phase 1 report"
        subtitle={
          <>
            Markdown từ <Mono>data/reports/phase1_report.md</Mono>.
          </>
        }
      >
        <ArtifactBoundary state={phase1Report} label="phase1_report.md">
          {(data) => <Markdown source={data.markdown} />}
        </ArtifactBoundary>
      </Panel>

      <Panel
        title="Corruption report"
        subtitle={
          <>
            Markdown từ <Mono>data/reports/corruption_report.md</Mono>.
          </>
        }
        tone="alert"
      >
        <ArtifactBoundary state={corruptionReport} label="corruption_report.md">
          {(data) => <Markdown source={data.markdown} />}
        </ArtifactBoundary>
      </Panel>

      <Panel
        title="Câu trả lời từng câu hỏi"
        subtitle={
          <>
            Từ <Mono>data/results/{"{state}"}_answers.json</Mono> — chỗ để xem chính xác câu
            nào hỏng khi dataset hỏng.
          </>
        }
        aside={
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
                  className={`rounded px-3 py-1 text-xs font-semibold transition-colors ${
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
        }
      >
        <ArtifactBoundary state={answers} label={`${answersState}_answers.json`}>
          {(rows) => <AnswersTable rows={rows} />}
        </ArtifactBoundary>
      </Panel>
    </PageShell>
  );
}

/* -------------------------------------------------------------------------- */

function buildSeries(
  byState: Record<RunState, LoadState<RunMetrics>>,
  metric: MetricKey,
): MetricSeries[] {
  return RUN_STATES.flatMap((state) => {
    const result = byState[state];
    if (result.status !== "ok") return [];
    const value = result.data?.[metric];
    if (typeof value !== "number" || !Number.isFinite(value)) return [];
    return [{ state, value }];
  });
}

function MetricsTable({
  byState,
  baselineMetrics,
}: {
  byState: Record<RunState, LoadState<RunMetrics>>;
  baselineMetrics: RunMetrics | null;
}) {
  const rows = RUN_STATES.flatMap((state) => {
    const result = byState[state];
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
          row.state === "baseline"
            ? null
            : formatDelta(value, baselineMetrics?.[metric]);
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

function MissingStates({
  byState,
}: {
  byState: Record<RunState, LoadState<RunMetrics>>;
}) {
  const missing = RUN_STATES.flatMap((state) => {
    const result = byState[state];
    if (result.status === "missing") {
      return [{ state, path: result.path, hint: result.hint }];
    }
    return [];
  });

  const loading = RUN_STATES.some((state) => byState[state].status === "loading");
  const errors = RUN_STATES.flatMap((state) => {
    const result = byState[state];
    return result.status === "error" ? [{ state, message: result.message }] : [];
  });

  if (loading && missing.length === 0 && errors.length === 0) {
    return <p className="text-sm text-ink-faint">Đang đọc file metrics…</p>;
  }

  if (missing.length === 0 && errors.length === 0) return null;

  const commands = Array.from(new Set(missing.map((item) => item.hint).filter(Boolean)));

  return (
    <div className="flex flex-col gap-3">
      {missing.length > 0 ? (
        <div className="rounded-lg border border-dashed border-brand-blue-200 bg-brand-blue-50/60 px-5 py-5">
          <span className="inline-flex items-center rounded-full border border-brand-blue-200 bg-surface px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-brand-blue">
            {missing.length} state chưa có metrics
          </span>
          <p className="mt-3 text-sm leading-relaxed text-ink-soft">
            Những state dưới đây không được vẽ vào bảng hay biểu đồ. Không có giá trị nào
            được điền thay.
          </p>
          <ul className="mt-3 flex flex-col gap-1.5">
            {missing.map((item) => (
              <li key={item.state} className="flex flex-wrap items-center gap-2">
                <Badge tone="muted">{item.state}</Badge>
                <span className="break-anywhere font-mono text-[12.5px] text-ink">
                  {item.path}
                </span>
              </li>
            ))}
          </ul>
          <div className="mt-3 flex flex-col gap-1.5">
            {commands.map((command) => (
              <CommandBlock key={command} command={command} />
            ))}
          </div>
        </div>
      ) : null}

      {errors.map((item) => (
        <p
          key={item.state}
          className="break-anywhere rounded-md border border-brand-red-200 bg-brand-red-50 px-3 py-2 text-sm text-brand-red-700"
        >
          <span className="font-semibold">{item.state}</span>: {item.message}
        </p>
      ))}
    </div>
  );
}

/* -------------------------------------------------------------------------- */

function RagasCard({
  state,
  result,
}: {
  state: RunState;
  result: LoadState<RunMetrics>;
}) {
  return (
    <div className="rounded-lg border border-line bg-canvas p-4">
      <div className="flex items-center gap-2">
        <Badge
          tone={state === "baseline" ? "blue" : state === "corrupted" ? "red" : "ok"}
        >
          {state}
        </Badge>
      </div>
      <div className="mt-3">
        <RagasBody result={result} />
      </div>
    </div>
  );
}

function RagasBody({ result }: { result: LoadState<RunMetrics> }) {
  if (result.status === "loading") {
    return <p className="text-xs text-ink-faint">Đang đọc…</p>;
  }
  if (result.status === "missing") {
    return (
      <p className="break-anywhere text-xs text-ink-faint">
        Chưa có <span className="font-mono">{result.path}</span>
      </p>
    );
  }
  if (result.status === "error") {
    return <p className="break-anywhere text-xs text-brand-red-700">{result.message}</p>;
  }

  const ragas: RagasResult | null | undefined = result.data?.ragas;
  if (ragas === null || ragas === undefined) {
    return (
      <p className="text-xs text-ink-faint">
        File metrics không có trường <span className="font-mono">ragas</span>.
      </p>
    );
  }
  if (typeof ragas !== "object") {
    return <p className="break-anywhere font-mono text-xs">{String(ragas)}</p>;
  }
  if ("skipped" in ragas && typeof ragas.skipped === "string") {
    return (
      <div className="flex flex-col gap-1.5">
        <Badge tone="muted">skipped</Badge>
        <p className="break-anywhere text-xs text-ink-soft">{ragas.skipped}</p>
      </div>
    );
  }
  if ("error" in ragas && typeof ragas.error === "string") {
    return (
      <div className="flex flex-col gap-1.5">
        <Badge tone="red">error</Badge>
        <p className="break-anywhere text-xs text-brand-red-700">{ragas.error}</p>
      </div>
    );
  }
  return <GenericJson value={ragas} />;
}

/* -------------------------------------------------------------------------- */

function FreshnessView({ report }: { report: FreshnessReport }) {
  const isObject =
    typeof report === "object" && report !== null && !Array.isArray(report);
  const known = isObject
    ? FRESHNESS_KNOWN_KEYS.filter((key) => key in report)
    : [];
  const record = isObject ? (report as Record<string, unknown>) : {};

  return (
    <div className="flex flex-col gap-4">
      {known.length > 0 ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {known.map((key) => {
            const value = record[key];
            const isFresh = key === "is_fresh" ? value === true : null;
            return (
              <StatTile
                key={key}
                label={key}
                value={
                  typeof value === "number"
                    ? formatInt(value)
                    : typeof value === "boolean"
                      ? String(value)
                      : typeof value === "string"
                        ? value
                        : "—"
                }
                tone={isFresh === null ? "neutral" : isFresh ? "ok" : "red"}
              />
            );
          })}
        </div>
      ) : (
        <Note>
          Không nhận ra key nào trong nhóm dự kiến (
          {FRESHNESS_KNOWN_KEYS.join(", ")}). Toàn bộ nội dung thật của file được đổ nguyên
          trạng bên dưới.
        </Note>
      )}

      <Collapsible summary="Toàn bộ nội dung file" hint="mọi key, kể cả key chưa biết">
        <GenericJson value={report} />
      </Collapsible>
    </div>
  );
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

/* -------------------------------------------------------------------------- */

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
