"use client";

import { useCallback } from "react";
import { getCleanDataset, getPipelineSpec, getQuality, getRawRecords } from "@/lib/api";
import {
  byState,
  contractGraph,
  readCleaningLogs,
  readQualityReports,
  type CleaningLog,
  type QualityReport,
} from "@/lib/derive";
import { formatInt } from "@/lib/format";
import {
  CHECK_COLUMN_HINTS,
  DERIVED_SOURCE_HINTS,
  EMBEDDED_COLUMN,
} from "@/lib/stage-map";
import { useArtifact } from "@/lib/use-artifact";
import { RUN_STATES, type CleanContract, type RunState } from "@/lib/types";
import { ArtifactBoundary } from "@/components/artifact-state";
import { Meters, SERIES, type MeterRow } from "@/components/charts";
import { CleanRowsTable } from "@/components/clean-rows-table";
import { ContractDiagram } from "@/components/diagrams";
import {
  Badge,
  Collapsible,
  DetailDrawer,
  Mono,
  PageHeading,
  PageShell,
  ScrollShell,
  Section,
  StatTile,
  Takeaway,
} from "@/components/ui";

/** Where a cleaning log keeps its summary-length statistics. */
const SUMMARY_SIGNAL = "summary_chars";

export default function CleanPage() {
  const spec = useArtifact(getPipelineSpec);
  const rawRecords = useArtifact(getRawRecords);
  const cleanRows = useArtifact(useCallback(() => getCleanDataset("clean"), []));
  const quality = useArtifact(getQuality);

  const logs: Map<string, CleaningLog> =
    quality.status === "ok"
      ? byState(readCleaningLogs(quality.data))
      : new Map<string, CleaningLog>();
  const baselineLog = logs.get("baseline") ?? null;

  const reports: Map<string, QualityReport> =
    quality.status === "ok"
      ? byState(readQualityReports(quality.data))
      : new Map<string, QualityReport>();
  const graph =
    spec.status === "ok"
      ? contractGraph(spec.data.clean_contract, reports.get("baseline") ?? null, {
          derivedSources: DERIVED_SOURCE_HINTS,
          checkColumns: CHECK_COLUMN_HINTS,
          embeddedColumn: EMBEDDED_COLUMN,
        })
      : null;

  const rowsIn = baselineLog?.rowsIn ?? (rawRecords.status === "ok" ? rawRecords.data.length : null);
  const rowsOut = baselineLog?.rowsOut ?? (cleanRows.status === "ok" ? cleanRows.data.length : null);

  return (
    <PageShell>
      <PageHeading
        eyebrow="Stage 2 · clean"
        title="Từ record thô thành dataset đủ điều kiện đi tiếp"
        lede="Một contract cột cố định, một bộ luật loại dòng, và một chuỗi text duy nhất được đưa vào model embedding."
      />

      <Takeaway>
        Chỉ một cột duy nhất được đưa vào model embedding. Cột đó hỏng thì retrieval hỏng.
      </Takeaway>

      <Funnel rowsIn={rowsIn} rowsOut={rowsOut} log={baselineLog} />

      <Section
        title="Contract nối vào đâu"
        subtitle="Cột từ source sinh ra cột derived, cột derived đi vào model embedding, và chỉ một phần nhỏ trong số đó có quality check theo dõi. Cột không có đường nối nào là cột không ai nhìn."
      >
        {graph ? (
          <ContractDiagram graph={graph} />
        ) : (
          <ArtifactBoundary state={spec} label="pipeline_spec.json">
            {() => null}
          </ArtifactBoundary>
        )}
      </Section>

      <Section
        title="Chuỗi thật sự được embed"
        subtitle="Chỉ cột text_for_embedding được đưa vào model. Trường nào trong công thức bị rỗng hoặc bị làm hỏng thì vector lệch theo — đây chính là chỗ data quality biến thành RAG quality."
      >
        <div className="flex flex-col gap-6">
          <ArtifactBoundary state={spec} label="pipeline_spec.json">
            {(data) => <EmbeddingRecipe contract={data.clean_contract} />}
          </ArtifactBoundary>

          {logs.size > 0 ? <SummaryLengths logs={logs} /> : null}
        </div>
      </Section>

      <Section
        title="Luật loại dòng"
        subtitle="Một dòng chỉ đi tiếp nếu vượt hết ngưỡng độ dài, parse được ngày, và không trùng dòng đã giữ. Số bên phải là số dòng thật sự bị loại ở lần chạy baseline."
      >
        <ArtifactBoundary state={spec} label="pipeline_spec.json">
          {(data) => <RejectRules contract={data.clean_contract} log={baselineLog} />}
        </ArtifactBoundary>
      </Section>

      <DetailDrawer>
        <Collapsible summary="Contract 16 cột" hint="pipeline_spec.clean_contract.columns">
          <ArtifactBoundary state={spec} label="pipeline_spec.json">
            {(data) => <ContractGrid contract={data.clean_contract} />}
          </ArtifactBoundary>
        </Collapsible>

        <Collapsible summary="Dataset đã làm sạch" hint="data/clean/papers_clean.json">
          <ArtifactBoundary state={cleanRows} label="papers_clean.json">
            {(rows, path) => (
              <CleanRowsTable
                rows={rows}
                contractColumns={
                  spec.status === "ok" ? spec.data.clean_contract.columns : undefined
                }
                derivedColumns={
                  spec.status === "ok" ? spec.data.clean_contract.derived_columns : undefined
                }
                footer={`${formatInt(rows.length)} dòng đọc từ ${path ?? "file"}.`}
              />
            )}
          </ArtifactBoundary>
        </Collapsible>

        <Collapsible summary="Cleaning log của cả ba lần chạy" hint="data/quality/cleaning_log*.json">
          {logs.size > 0 ? (
            <CleaningLogTable logs={logs} />
          ) : (
            <ArtifactBoundary state={quality} label="data/quality/*.json">
              {() => (
                <p className="text-base text-ink-faint">
                  Không có file nào trong data/quality mang hình dạng cleaning log.
                </p>
              )}
            </ArtifactBoundary>
          )}
        </Collapsible>
      </DetailDrawer>
    </PageShell>
  );
}

/* -------------------------------------------------------------------------- */

function Funnel({
  rowsIn,
  rowsOut,
  log,
}: {
  rowsIn: number | null;
  rowsOut: number | null;
  log: CleaningLog | null;
}) {
  if (rowsIn === null && rowsOut === null) {
    return (
      <p className="rounded-xl border border-dashed border-line bg-surface px-5 py-6 text-lg text-ink-faint">
        Row-count in/out sẽ hiện khi crawl và cleaning đã chạy.
      </p>
    );
  }
  const dropped =
    log?.rowsDropped ?? (rowsIn !== null && rowsOut !== null ? rowsIn - rowsOut : null);
  const max = Math.max(rowsIn ?? 0, rowsOut ?? 0, 1);

  return (
    <div className="rounded-2xl border border-line bg-surface p-6">
      <div className="flex flex-wrap items-end gap-x-10 gap-y-6">
        <FunnelStep
          label="record thô"
          value={rowsIn}
          max={max}
          color="var(--color-ink-faint)"
        />
        <span aria-hidden className="pb-6 text-4xl text-ink-faint">
          →
        </span>
        <FunnelStep
          label="dòng sạch"
          value={rowsOut}
          max={max}
          color={SERIES.baseline.fill}
        />
        <div className="pb-2">
          <p className="text-base font-semibold uppercase tracking-wide text-ink-faint">
            bị loại
          </p>
          <p
            className={`text-5xl font-semibold ${
              dropped && dropped > 0 ? "text-brand-red" : "text-ok"
            }`}
          >
            {dropped === null ? "—" : formatInt(dropped)}
          </p>
        </div>
      </div>
      {log ? (
        <p className="mt-5 text-base text-ink-soft">
          Đọc từ <Mono>{log.path}</Mono>.
        </p>
      ) : null}
    </div>
  );
}

function FunnelStep({
  label,
  value,
  max,
  color,
}: {
  label: string;
  value: number | null;
  max: number;
  color: string;
}) {
  const width = value === null ? 0 : Math.max((value / max) * 220, 8);
  return (
    <div>
      <p className="text-base font-semibold uppercase tracking-wide text-ink-faint">
        {label}
      </p>
      <p className="text-7xl font-semibold leading-none" style={{ color }}>
        {value === null ? "—" : formatInt(value)}
      </p>
      <span
        className="mt-3 block h-3 rounded-[4px]"
        style={{ width, backgroundColor: color }}
      />
    </div>
  );
}

/* -------------------------------------------------------------------------- */

function EmbeddingRecipe({ contract }: { contract: CleanContract }) {
  const fields = contract.text_for_embedding_template;
  return (
    <div className="scroll-shell overflow-x-auto">
      <div className="flex min-w-max items-center gap-4">
        <ol className="flex flex-col gap-2">
          {fields.map((field) => (
            <li
              key={field}
              className="rounded-lg border-2 border-brand-blue-200 bg-brand-blue-50 px-5 py-2.5 text-center font-mono text-xl font-semibold text-brand-blue-700"
            >
              {field}
            </li>
          ))}
        </ol>
        <span aria-hidden className="text-4xl text-ink-faint">
          →
        </span>
        <div className="rounded-xl border-2 border-brand-blue bg-surface px-6 py-5 text-center">
          <p className="font-mono text-2xl font-bold text-ink">text_for_embedding</p>
          <p className="mt-1 text-base text-ink-soft">
            {fields.length} trường ghép lại thành một chuỗi
          </p>
        </div>
        <span aria-hidden className="text-4xl text-ink-faint">
          →
        </span>
        <div className="rounded-xl border border-line bg-canvas px-6 py-5 text-center">
          <p className="text-2xl font-bold text-ink">vector</p>
          <p className="mt-1 text-base text-ink-soft">thứ agent thật sự tìm kiếm trên</p>
        </div>
      </div>
    </div>
  );
}

function SummaryLengths({ logs }: { logs: Map<string, CleaningLog> }) {
  const rows: MeterRow[] = [];
  const values: number[] = [];

  for (const state of RUN_STATES) {
    const log = logs.get(state);
    const signal = log?.signals?.[SUMMARY_SIGNAL];
    if (!signal || typeof signal !== "object") continue;
    const record = signal as Record<string, unknown>;
    const mean = record.mean;
    const min = record.min;
    if (typeof mean !== "number") continue;
    values.push(mean);
    rows.push({
      key: state,
      name: state,
      value: mean,
      display: formatInt(Math.round(mean)),
      fill: SERIES[state as RunState].fill,
      track: SERIES[state as RunState].track,
      note:
        typeof min === "number" ? (
          <>
            ngắn nhất <span className="font-mono">{formatInt(min)}</span> ký tự
          </>
        ) : undefined,
    });
  }

  if (rows.length === 0) return null;
  const domainMax = Math.max(...values) * 1.05;

  return (
    <div className="rounded-2xl border border-line bg-canvas p-5">
      <h3 className="text-xl font-semibold text-ink">
        Độ dài summary trung bình của từng dataset
      </h3>
      <p className="mb-4 text-base text-ink-soft">
        Cùng một chỗ trong công thức embedding, đo từ{" "}
        <span className="font-mono">signals.{SUMMARY_SIGNAL}</span> của cleaning log.
      </p>
      <Meters rows={rows} domainMax={domainMax} labelWidth="7rem" valueClassName="text-xl" />
    </div>
  );
}

/* -------------------------------------------------------------------------- */

function RejectRules({
  contract,
  log,
}: {
  contract: CleanContract;
  log: CleaningLog | null;
}) {
  const counts = new Map((log?.rejects ?? []).map((entry) => [entry.key, entry.count]));
  const dedupe = contract.reject_reasons.filter((reason) =>
    reason.key.startsWith("duplicate_"),
  );
  const validation = contract.reject_reasons.filter(
    (reason) => !reason.key.startsWith("duplicate_"),
  );

  return (
    <div className="flex flex-col gap-5">
      <div className="grid gap-4 sm:grid-cols-3">
        <StatTile
          label="min_title_chars"
          value={contract.min_title_chars}
          hint="title ngắn hơn ngưỡng bị loại"
        />
        <StatTile
          label="min_summary_chars"
          value={contract.min_summary_chars}
          hint="summary ngắn hơn ngưỡng bị loại"
        />
        <StatTile label="số luật" value={contract.reject_reasons.length} tone="blue" />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <ReasonGroup
          title="Validation"
          description="Kiểm tra trên từng dòng độc lập."
          reasons={validation}
          counts={counts}
          hasLog={log !== null}
        />
        <ReasonGroup
          title="Dedupe"
          description="So dòng hiện tại với các dòng đã giữ; dòng đầu tiên thắng."
          reasons={dedupe}
          counts={counts}
          hasLog={log !== null}
          tone="alert"
        />
      </div>
    </div>
  );
}

function ReasonGroup({
  title,
  description,
  reasons,
  counts,
  hasLog,
  tone = "default",
}: {
  title: string;
  description: string;
  reasons: { key: string; label: string }[];
  counts: Map<string, number>;
  hasLog: boolean;
  tone?: "default" | "alert";
}) {
  return (
    <div className="rounded-2xl border border-line bg-canvas p-5">
      <div className="flex items-center gap-3">
        <h3 className="text-xl font-semibold text-ink">{title}</h3>
        <Badge tone={tone === "alert" ? "red" : "blue"} size="md">
          {reasons.length}
        </Badge>
      </div>
      <p className="mt-1 text-base leading-relaxed text-ink-soft">{description}</p>
      <ul className="mt-4 flex flex-col gap-2">
        {reasons.map((reason) => {
          const count = counts.get(reason.key);
          return (
            <li
              key={reason.key}
              className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg border border-line bg-surface px-4 py-3"
            >
              <span className="min-w-0">
                <span className="break-anywhere block font-mono text-base text-brand-blue">
                  {reason.key}
                </span>
                <span className="block text-base text-ink-soft">{reason.label}</span>
              </span>
              <span className="ml-auto flex items-baseline gap-2">
                <span
                  className={`text-3xl font-semibold ${
                    count === undefined
                      ? "text-ink-faint"
                      : count > 0
                        ? "text-brand-red"
                        : "text-ok"
                  }`}
                >
                  {hasLog ? (count === undefined ? "—" : formatInt(count)) : "—"}
                </span>
                <span className="text-sm text-ink-faint">dòng</span>
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/* -------------------------------------------------------------------------- */

function ContractGrid({ contract }: { contract: CleanContract }) {
  const derived = new Set(contract.derived_columns);
  return (
    <ol className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
      {contract.columns.map((column, index) => (
        <li
          key={column}
          className={`flex items-center gap-2 rounded-md border px-3 py-2 ${
            derived.has(column)
              ? "border-brand-blue-200 bg-brand-blue-50"
              : "border-line bg-canvas"
          }`}
        >
          <span className="w-5 shrink-0 text-right font-mono text-xs text-ink-faint">
            {index + 1}
          </span>
          <span className="break-anywhere min-w-0 font-mono text-sm text-ink">{column}</span>
          <span className="ml-auto shrink-0">
            <Badge tone={derived.has(column) ? "blue" : "muted"}>
              {derived.has(column) ? "derived" : "source"}
            </Badge>
          </span>
        </li>
      ))}
    </ol>
  );
}

function CleaningLogTable({ logs }: { logs: Map<string, CleaningLog> }) {
  const ordered = RUN_STATES.map((state) => logs.get(state)).filter(
    (log): log is CleaningLog => Boolean(log),
  );
  const extras = [...logs.values()].filter(
    (log) => !(RUN_STATES as readonly string[]).includes(log.state),
  );
  const all = [...ordered, ...extras];

  return (
    <ScrollShell>
      <table className="w-full min-w-max border-collapse text-left text-sm">
        <thead className="bg-brand-blue-50">
          <tr>
            {["state", "rows_in", "rows_out", "rows_dropped", "file"].map((header) => (
              <th
                key={header}
                className="border-b border-line px-3 py-2 text-xs font-semibold uppercase tracking-wide text-brand-blue-700"
              >
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {all.map((log) => (
            <tr key={log.path} className="border-b border-line-soft last:border-b-0">
              <td className="px-3 py-2 font-mono">{log.state}</td>
              <td className="px-3 py-2 text-right font-mono tabular-nums">
                {log.rowsIn === null ? "—" : formatInt(log.rowsIn)}
              </td>
              <td className="px-3 py-2 text-right font-mono tabular-nums">
                {log.rowsOut === null ? "—" : formatInt(log.rowsOut)}
              </td>
              <td className="px-3 py-2 text-right font-mono tabular-nums">
                {log.rowsDropped === null ? "—" : formatInt(log.rowsDropped)}
              </td>
              <td className="break-anywhere px-3 py-2 font-mono text-xs text-ink-soft">
                {log.path}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </ScrollShell>
  );
}
