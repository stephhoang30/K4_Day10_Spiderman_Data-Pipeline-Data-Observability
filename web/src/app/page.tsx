"use client";

import Link from "next/link";
import { useCallback } from "react";
import type { LoadState } from "@/lib/api";
import {
  getArtifactIndex,
  getMetrics,
  getPipelineSpec,
  getQuality,
} from "@/lib/api";
import { byState, readQualityReports, type QualityReport } from "@/lib/derive";
import { formatBytes, formatMetric, formatTimestamp } from "@/lib/format";
import { FLOW_ARTIFACTS } from "@/lib/stage-map";
import { useArtifact } from "@/lib/use-artifact";
import {
  RUN_STATES,
  type ArtifactStatus,
  type PipelineSpec,
  type RunMetrics,
  type RunState,
} from "@/lib/types";
import { ArtifactBoundary } from "@/components/artifact-state";
import { SERIES, Verdict } from "@/components/charts";
import { Column, DataTable } from "@/components/data-table";
import { PipelineFlow, type FlowNode } from "@/components/pipeline-flow";
import {
  Badge,
  Collapsible,
  DetailDrawer,
  KeyValueList,
  Mono,
  PageHeading,
  PageShell,
  Section,
  StatTile,
  Takeaway,
} from "@/components/ui";

/** The metric the scoreboard leads with; the compare page charts all four. */
const HEADLINE_METRIC = "judge_accuracy" as const;

export default function OverviewPage() {
  const spec = useArtifact(getPipelineSpec);
  const index = useArtifact(getArtifactIndex);
  const quality = useArtifact(getQuality);
  const baseline = useArtifact(useCallback(() => getMetrics("baseline"), []));
  const corrupted = useArtifact(useCallback(() => getMetrics("corrupted"), []));
  const repaired = useArtifact(useCallback(() => getMetrics("repaired"), []));

  const metrics: Record<RunState, LoadState<RunMetrics>> = {
    baseline,
    corrupted,
    repaired,
  };
  const reports: Map<string, QualityReport> =
    quality.status === "ok"
      ? byState(readQualityReports(quality.data))
      : new Map<string, QualityReport>();

  return (
    <PageShell>
      <PageHeading
        eyebrow="VinUni · K4 Day 10 · Spiderman"
        title="Chất lượng dữ liệu quyết định chất lượng câu trả lời"
        lede="Cùng một agent, cùng một bộ câu hỏi. Thứ duy nhất thay đổi là chất lượng của dataset được index."
      />

      <Scoreboard metrics={metrics} reports={reports} />

      <Section
        title="Pipeline chạy như thế nào"
        subtitle="Crawl và clean một lần, rồi tách thành ba nhánh giống hệt nhau ở phía sau. Viền đứt nghĩa là artifact của node đó chưa có trên đĩa."
      >
        <ArtifactBoundary state={index} label="chỉ mục artifact">
          {(data) => (
            <PipelineFlow
              nodes={flowNodes(data.artifacts)}
              gates={[...reports.values()].map((report) => ({
                state: report.state,
                status: report.status,
                passed: report.passed,
              }))}
              contractColumns={
                spec.status === "ok" ? spec.data.clean_contract.columns.length : null
              }
            />
          )}
        </ArtifactBoundary>
      </Section>

      <Section
        title="Cấu hình"
        subtitle={
          <>
            Đọc từ <Mono>data/pipeline_spec.json</Mono> — file do Python export ra, frontend
            không giữ bản sao của bất kỳ giá trị nào.
          </>
        }
      >
        <ArtifactBoundary state={spec} label="pipeline_spec.json">
          {(data) => <SpecSummary spec={data} />}
        </ArtifactBoundary>
      </Section>

      <DetailDrawer>
        <Collapsible
          summary="Chỉ mục artifact"
          hint={index.status === "ok" ? index.data.data_dir : undefined}
        >
          <ArtifactBoundary state={index} label="chỉ mục artifact">
            {(data) => <ArtifactTable index={data.artifacts} dataDir={data.data_dir} />}
          </ArtifactBoundary>
        </Collapsible>
      </DetailDrawer>
    </PageShell>
  );
}

/* -------------------------------------------------------------------------- */

function flowNodes(artifacts: ArtifactStatus[]): Record<string, FlowNode> {
  const byName = new Map(artifacts.map((artifact) => [artifact.name, artifact]));
  const nodes: Record<string, FlowNode> = {};
  for (const [node, names] of Object.entries(FLOW_ARTIFACTS)) {
    const entries = names
      .map((name) => byName.get(name))
      .filter((entry): entry is ArtifactStatus => Boolean(entry));
    const present = entries.filter((entry) => entry.exists).length;
    nodes[node] = {
      present,
      total: entries.length,
      done: entries.length > 0 && present === entries.length,
    };
  }
  return nodes;
}

/* -------------------------------------------------------------------------- */

function Scoreboard({
  metrics,
  reports,
}: {
  metrics: Record<RunState, LoadState<RunMetrics>>;
  reports: Map<string, QualityReport>;
}) {
  const anyLoaded = RUN_STATES.some((state) => metrics[state].status === "ok");
  const samples = RUN_STATES.map((state) => {
    const entry = metrics[state];
    return entry.status === "ok" ? entry.data?.samples : null;
  }).find((value) => typeof value === "number");

  return (
    <div className="flex flex-col gap-4">
      <Takeaway>
        Dữ liệu hỏng không làm agent im lặng — nó làm agent trả lời sai một cách tự tin.
      </Takeaway>

      <div className="grid gap-4 lg:grid-cols-3">
        {RUN_STATES.map((state) => (
          <ScoreCard
            key={state}
            state={state}
            entry={metrics[state]}
            report={reports.get(state) ?? null}
          />
        ))}
      </div>

      {anyLoaded ? (
        <p className="text-base text-ink-soft">
          <span className="font-mono">{HEADLINE_METRIC}</span> — tỉ lệ câu trả lời được LLM
          judge chấm là đúng
          {typeof samples === "number" ? `, trên ${samples} câu hỏi giống nhau` : null}. Số
          đọc trực tiếp từ <Mono>data/results/*_metrics.json</Mono>.{" "}
          <Link
            href="/compare"
            className="font-semibold text-brand-blue underline underline-offset-4"
          >
            Xem đủ 4 metric →
          </Link>
        </p>
      ) : null}
    </div>
  );
}

function ScoreCard({
  state,
  entry,
  report,
}: {
  state: RunState;
  entry: LoadState<RunMetrics>;
  report: QualityReport | null;
}) {
  const series = SERIES[state];
  const tone =
    state === "baseline" ? "border-brand-blue-200" : state === "corrupted" ? "border-brand-red-200" : "border-ok-200";

  return (
    <div className={`flex flex-col gap-3 rounded-2xl border-2 bg-surface px-6 py-5 ${tone}`}>
      <div className="flex items-center gap-2.5">
        <span
          aria-hidden
          className="inline-block h-4 w-4 rounded-sm"
          style={{ backgroundColor: series.fill }}
        />
        <span className="text-xl font-bold tracking-tight text-ink">{state}</span>
      </div>

      {entry.status === "ok" ? (
        <>
          <p
            className="text-7xl font-semibold leading-none"
            style={{ color: series.fill }}
          >
            {formatMetric(entry.data?.[HEADLINE_METRIC], 3)}
          </p>
          <dl className="flex flex-wrap gap-x-6 gap-y-1 text-base text-ink-soft">
            <div className="flex gap-2">
              <dt className="text-ink-faint">hit rate</dt>
              <dd className="font-mono tabular-nums">
                {formatMetric(entry.data?.retrieval_hit_rate, 3)}
              </dd>
            </div>
            <div className="flex gap-2">
              <dt className="text-ink-faint">token f1</dt>
              <dd className="font-mono tabular-nums">
                {formatMetric(entry.data?.mean_token_f1, 3)}
              </dd>
            </div>
          </dl>
        </>
      ) : entry.status === "loading" ? (
        <p className="py-8 text-lg text-ink-faint">Đang đọc metrics…</p>
      ) : entry.status === "missing" ? (
        <p className="break-anywhere py-8 text-base text-ink-faint">
          Chưa có <span className="font-mono">{entry.path}</span>
        </p>
      ) : (
        <p className="break-anywhere py-8 text-base text-brand-red-700">{entry.message}</p>
      )}

      <div className="mt-auto flex flex-wrap items-center gap-2 border-t border-line-soft pt-3">
        <span className="text-sm font-semibold uppercase tracking-wide text-ink-faint">
          data quality
        </span>
        {report ? (
          <Verdict status={report.status} passed={report.passed} />
        ) : (
          <span className="text-base text-ink-faint">chưa có report</span>
        )}
        {report?.freshness ? (
          <span className="text-base text-ink-soft">
            freshness{" "}
            <span
              className={
                report.freshness.isFresh === false
                  ? "font-semibold text-brand-red-700"
                  : "font-semibold text-ok"
              }
            >
              {report.freshness.status ?? "—"}
            </span>
            {typeof report.freshness.staleRows === "number" ? (
              <span className="text-ink-faint"> · {report.freshness.staleRows} stale</span>
            ) : null}
          </span>
        ) : null}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */

function SpecSummary({ spec }: { spec: PipelineSpec }) {
  return (
    <div className="flex flex-col gap-5">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label="Nguồn" value={spec.source.api} tone="blue" />
        <StatTile label="max_results" value={spec.source.max_results} hint="record mỗi lần crawl" />
        <StatTile label="top_k" value={spec.retrieval.top_k} hint="số document agent lấy về" />
        <StatTile
          label="freshness threshold"
          value={spec.freshness.threshold_days}
          hint="ngày"
        />
      </div>

      <KeyValueList
        items={[
          {
            label: "Embedding",
            value: <Mono>{spec.retrieval.embedding_model}</Mono>,
          },
          {
            label: "LLM",
            value: (
              <span>
                <Mono>{spec.llm.provider}</Mono> · <Mono>{spec.llm.model}</Mono>
              </span>
            ),
          },
          {
            label: "Collections",
            value: (
              <span className="flex flex-wrap gap-3">
                {Object.entries(spec.retrieval.collections).map(([key, value]) => (
                  <span key={key} className="text-base text-ink-soft">
                    <span className="text-ink-faint">{key}:</span> <Mono>{value}</Mono>
                  </span>
                ))}
              </span>
            ),
          },
          {
            label: "Spec sinh lúc",
            value: (
              <span className="font-mono text-base">{formatTimestamp(spec.generated_at)}</span>
            ),
          },
        ]}
      />
    </div>
  );
}

/* -------------------------------------------------------------------------- */

function ArtifactTable({
  index,
  dataDir,
}: {
  index: ArtifactStatus[];
  dataDir: string;
}) {
  const columns: Column<ArtifactStatus>[] = [
    {
      key: "status",
      header: "",
      cellClassName: "whitespace-nowrap",
      render: (row) => (
        <Badge tone={row.exists ? "ok" : "muted"}>{row.exists ? "có" : "thiếu"}</Badge>
      ),
    },
    {
      key: "name",
      header: "Tên logic",
      cellClassName: "whitespace-nowrap font-mono text-xs",
      render: (row) => row.name,
    },
    {
      key: "path",
      header: "Đường dẫn",
      cellClassName: "whitespace-nowrap font-mono text-xs text-ink-soft",
      render: (row) => row.path,
    },
    {
      key: "size",
      header: "Kích thước",
      cellClassName: "whitespace-nowrap text-right tabular-nums",
      headerClassName: "text-right",
      render: (row) => formatBytes(row.size_bytes),
    },
    {
      key: "modified",
      header: "Sửa lúc",
      cellClassName: "whitespace-nowrap font-mono text-xs text-ink-soft",
      render: (row) => (row.modified_at ? formatTimestamp(row.modified_at) : "—"),
    },
    {
      key: "command",
      header: "Lệnh tạo",
      cellClassName: "whitespace-nowrap font-mono text-xs text-ink-soft",
      render: (row) => row.command,
    },
  ];

  return (
    <DataTable
      columns={columns}
      rows={index}
      rowKey={(row) => row.name}
      footer={
        <>
          Đọc từ thư mục <span className="font-mono">{dataDir}</span> (đổi bằng biến môi
          trường <span className="font-mono">PIPELINE_DATA_DIR</span>).
        </>
      }
    />
  );
}
