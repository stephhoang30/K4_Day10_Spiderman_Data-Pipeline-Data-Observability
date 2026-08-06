"use client";

import Link from "next/link";
import { useCallback, useState } from "react";
import {
  getCleanDataset,
  getCorruptionLog,
  getPipelineSpec,
  getQuality,
} from "@/lib/api";
import {
  auditGate,
  byState,
  describeCheckValue,
  driftedChecks,
  passLabelOf,
  readQualityReports,
  type Detectability,
  type DriftedCheck,
  type QualityReport,
} from "@/lib/derive";
import { formatFraction, formatInt, formatTimestamp } from "@/lib/format";
import { useArtifact } from "@/lib/use-artifact";
import {
  RUN_STATES,
  type CorruptionAction,
  type CorruptionLog,
  type CorruptionSpec,
  type DatasetState,
  type PipelineSpec,
} from "@/lib/types";
import { ArtifactBoundary } from "@/components/artifact-state";
import { BeforeAfter, Isotype, SERIES, Verdict } from "@/components/charts";
import { CleanRowsTable } from "@/components/clean-rows-table";
import { CorruptionRowDiagram, ObservabilityGap } from "@/components/diagrams";
import { Column, DataTable } from "@/components/data-table";
import {
  Badge,
  Collapsible,
  DetailDrawer,
  KeyValueList,
  Mono,
  PageHeading,
  PageShell,
  ScrollShell,
  Section,
  StatTile,
  Takeaway,
} from "@/components/ui";

const DATASET_TABS: { state: Exclude<DatasetState, "clean">; label: string }[] = [
  { state: "corrupted", label: "Corrupted" },
  { state: "repaired", label: "Repaired" },
];

export default function CorruptPage() {
  const spec = useArtifact(getPipelineSpec);
  const log = useArtifact(getCorruptionLog);
  const quality = useArtifact(getQuality);
  const corruptedRows = useArtifact(useCallback(() => getCleanDataset("corrupted"), []));

  const [dataset, setDataset] = useState<Exclude<DatasetState, "clean">>("corrupted");
  const rows = useArtifact(useCallback(() => getCleanDataset(dataset), [dataset]));

  const reports: Map<string, QualityReport> =
    quality.status === "ok"
      ? byState(readQualityReports(quality.data))
      : new Map<string, QualityReport>();

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

  const baselineReport = reports.get("baseline");
  const corruptedReport = reports.get("corrupted");
  const drift =
    baselineReport && corruptedReport
      ? driftedChecks(baselineReport, corruptedReport)
      : null;

  const gateByType = new Map((gate?.items ?? []).map((item) => [item.type, item]));
  const declaredByType = new Map(
    (spec.status === "ok" ? spec.data.corruption_spec.kinds : []).map(
      (kind) => [kind.type, kind] as const,
    ),
  );

  return (
    <PageShell>
      <PageHeading
        eyebrow="Stage 6 · corrupt"
        title="Sáu cách làm hỏng dữ liệu"
        lede="Mỗi dạng lỗi nhắm vào một trụ observability khác nhau, seed cố định nên lần chạy nào cũng hỏng y hệt."
      />

      <ArtifactBoundary state={log} label="corruption_log.json">
        {(data) => <LossHeadline log={data} />}
      </ArtifactBoundary>

      <Section
        title="Mỗi dạng lỗi biến đổi một record như thế nào"
        subtitle="Bên trái là một record nguyên vẹn, bên phải là chính nó sau khi bị làm hỏng — chỉ trường bị đụng vào mới chuyển sang đỏ. Mỗi ô vuông là một dòng thật bị tác động; ô nét đứt nghĩa là dòng đó đã bị xoá hẳn."
        tone="alert"
      >
        <ArtifactBoundary state={log} label="corruption_log.json">
          {(data) => (
            <ul className="grid gap-5 xl:grid-cols-2">
              {[...(data.actions ?? [])]
                .sort((a, b) => (b.rows_affected ?? 0) - (a.rows_affected ?? 0))
                .map((action, index) => (
                  <li
                    key={action.type}
                    className="flex flex-col gap-3 rounded-2xl border-2 border-brand-red-200 bg-brand-red-50/30 p-5"
                  >
                    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                      <span className="text-lg font-semibold text-ink-faint">
                        {index + 1}.
                      </span>
                      <span className="break-anywhere font-mono text-2xl font-bold text-ink">
                        {action.type}
                      </span>
                      <span className="ml-auto whitespace-nowrap text-3xl font-semibold text-brand-red">
                        {formatInt(action.rows_affected)}
                        <span className="ml-1 text-base font-medium text-ink-soft">dòng</span>
                      </span>
                    </div>

                    <CorruptionRowDiagram action={action} />

                    <Isotype
                      count={action.rows_affected}
                      fill="var(--color-brand-red)"
                      hollow={gateByType.get(action.type)?.survivingRows === 0}
                      size={20}
                    />

                    <p className="text-base leading-relaxed text-ink-soft">
                      {action.detail}
                    </p>

                    <div className="mt-auto flex flex-wrap items-center gap-2 border-t border-brand-red-200 pt-3">
                      {action.target_pillar.split("+").map((pillar) => (
                        <Badge key={pillar} tone="red" size="md">
                          {pillar}
                        </Badge>
                      ))}
                      {declaredByType.has(action.type) ? (
                        <span className="text-sm text-ink-faint">
                          spec {formatFraction(declaredByType.get(action.type)!.fraction)}
                        </span>
                      ) : null}
                      <span className="ml-auto">
                        <GateBadge detail={gateByType.get(action.type)} />
                      </span>
                    </div>
                  </li>
                ))}
            </ul>
          )}
        </ArtifactBoundary>
      </Section>

      <Section
        title="Quality gate nhìn thấy được bao nhiêu"
        subtitle="Cùng một bộ check chạy trên cả ba dataset. So sánh theo cột để thấy check nào thật sự phản ứng với corruption."
        tone="alert"
      >
        {reports.size > 0 ? (
          <div className="flex flex-col gap-6">
            {gate ? (
              <Takeaway
                tone="red"
                figure={
                  <div className="text-right">
                    <p className="text-6xl font-semibold leading-none text-brand-red">
                      {gate.invisibleCount}/{gate.items.length}
                    </p>
                    <p className="text-base text-ink-soft">dạng lỗi không check nào bắt</p>
                  </div>
                }
              >
                Lỗi tệ nhất là lỗi observability không nhìn thấy.
              </Takeaway>
            ) : null}

            {gate && corruptedReport ? (
              <ObservabilityGap
                items={gate.items}
                checks={corruptedReport.checks.map((check) => ({
                  key: check.key,
                  status: check.status,
                  passed: check.passed,
                }))}
              />
            ) : null}

            <CheckMatrix reports={reports} />

            {drift && drift.passedButMoved.length > 0 ? (
              <DriftPanel
                drift={drift.passedButMoved}
                passLabel={passLabelOf(corruptedReport ?? null)}
              />
            ) : null}

            <p className="text-base text-ink-soft">
              Một dạng lỗi được coi là &ldquo;bắt được&rdquo; khi ít nhất một paper_id của nó
              nằm trong tập dòng vi phạm của một check đang FAIL — tính lại trực tiếp từ
              dataset corrupted và ngưỡng khai báo trong spec.{" "}
              <Link
                href="/compare"
                className="font-semibold text-brand-blue underline underline-offset-4"
              >
                Xem thiệt hại thật lên câu trả lời →
              </Link>
            </p>
          </div>
        ) : (
          <ArtifactBoundary state={quality} label="data/quality/*.json">
            {() => null}
          </ArtifactBoundary>
        )}
      </Section>

      <DetailDrawer>
        <Collapsible summary="Corruption spec khai báo" hint="pipeline_spec.corruption_spec">
          <ArtifactBoundary state={spec} label="pipeline_spec.json">
            {(data) => <SpecTable spec={data} />}
          </ArtifactBoundary>
        </Collapsible>

        <Collapsible summary="Corruption log đầy đủ" hint="data/results/corruption_log.json">
          <ArtifactBoundary state={log} label="corruption_log.json">
            {(data) => (
              <CorruptionLogTable
                log={data}
                spec={spec.status === "ok" ? spec.data.corruption_spec : null}
              />
            )}
          </ArtifactBoundary>
        </Collapsible>

        <Collapsible summary="Dataset sau corrupt / repair" hint="cùng contract với dataset sạch">
          <div className="flex flex-col gap-3">
            <div className="flex gap-1 rounded-md border border-line bg-canvas p-1 w-fit">
              {DATASET_TABS.map((tab) => (
                <button
                  key={tab.state}
                  type="button"
                  onClick={() => setDataset(tab.state)}
                  aria-pressed={dataset === tab.state}
                  className={`rounded px-3 py-1 text-sm font-semibold transition-colors ${
                    dataset === tab.state
                      ? "bg-brand-blue text-white"
                      : "text-ink-soft hover:text-brand-blue"
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
            <ArtifactBoundary state={rows} label={`dataset ${dataset}`}>
              {(data, path) => (
                <CleanRowsTable
                  rows={data}
                  contractColumns={
                    spec.status === "ok" ? spec.data.clean_contract.columns : undefined
                  }
                  derivedColumns={
                    spec.status === "ok"
                      ? spec.data.clean_contract.derived_columns
                      : undefined
                  }
                  footer={`${formatInt(data.length)} dòng đọc từ ${path ?? "file"}.`}
                />
              )}
            </ArtifactBoundary>
          </div>
        </Collapsible>
      </DetailDrawer>
    </PageShell>
  );
}

/* -------------------------------------------------------------------------- */

/** Whether any failing quality check can be traced back to this corruption. */
function GateBadge({ detail }: { detail?: Detectability }) {
  if (!detail) return null;
  if (detail.visible) {
    return (
      <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border border-ok-200 bg-ok-50 px-3 py-1 text-sm font-bold text-ok">
        <span aria-hidden>✓</span> {detail.caughtBy.join(", ")}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border-2 border-brand-red-200 bg-surface px-3 py-1 text-sm font-bold text-brand-red-700">
      <span aria-hidden>👁</span> gate không thấy
    </span>
  );
}

/* -------------------------------------------------------------------------- */

function LossHeadline({ log }: { log: CorruptionLog }) {
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <BeforeAfter
        label="Số dòng trong dataset"
        before={log.rows_before}
        after={log.rows_after}
        beforeLabel="trước"
        afterLabel="sau"
      />
      <BeforeAfter
        label="paper_id duy nhất"
        before={log.unique_paper_ids_before}
        after={log.unique_paper_ids_after}
        beforeLabel="trước"
        afterLabel="sau"
      />
      <div className="rounded-xl border border-line bg-surface p-5">
        <p className="text-base font-semibold uppercase tracking-wide text-ink-faint">
          Seed corruption
        </p>
        <p className="mt-4 font-mono text-5xl font-semibold text-brand-red">{log.seed}</p>
        <p className="mt-3 text-base leading-relaxed text-ink-soft">
          Cố định, nên baseline ↔ corrupted ↔ repaired là phép so tái lập được: chênh lệch
          metric quy về chất lượng dữ liệu chứ không phải nhiễu ngẫu nhiên.
        </p>
        <p className="mt-2 font-mono text-sm text-ink-faint">
          {formatTimestamp(log.generated_at)}
        </p>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */

/* -------------------------------------------------------------------------- */

function CheckMatrix({ reports }: { reports: Map<string, QualityReport> }) {
  const states = RUN_STATES.filter((state) => reports.has(state));
  const keys: string[] = [];
  for (const state of states) {
    for (const check of reports.get(state)!.checks) {
      if (!keys.includes(check.key)) keys.push(check.key);
    }
  }

  return (
    <ScrollShell>
      <table className="w-full min-w-max border-collapse text-left">
        <thead>
          <tr>
            <th className="border-b border-line px-3 py-3 text-base font-semibold uppercase tracking-wide text-ink-faint">
              check
            </th>
            {states.map((state) => (
              <th
                key={state}
                className="border-b border-line px-4 py-3 text-center text-lg font-bold text-ink"
              >
                <span className="inline-flex items-center gap-2">
                  <span
                    aria-hidden
                    className="inline-block h-3 w-3 rounded-sm"
                    style={{ backgroundColor: SERIES[state].fill }}
                  />
                  {state}
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {keys.map((key) => (
            <tr key={key} className="border-b border-line-soft last:border-b-0">
              <th
                scope="row"
                className="whitespace-nowrap py-3 pr-6 pl-3 text-left font-mono text-lg font-medium text-ink"
              >
                {key}
              </th>
              {states.map((state) => {
                const report = reports.get(state)!;
                const check = report.checks.find((item) => item.key === key);
                return (
                  <td key={state} className="px-4 py-3 text-center align-middle">
                    {check ? (
                      <span className="inline-flex flex-col items-center gap-1">
                        <Verdict
                          status={check.status}
                          passed={check.passed}
                          passLabel={passLabelOf(report)}
                        />
                        <span className="font-mono text-sm text-ink-faint">
                          {describeCheckValue(check.actual)}
                        </span>
                      </span>
                    ) : (
                      <span className="text-ink-faint">—</span>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </ScrollShell>
  );
}

function DriftPanel({
  drift,
  passLabel,
}: {
  drift: DriftedCheck[];
  passLabel: string | null;
}) {
  return (
    <div className="rounded-2xl border-2 border-brand-red-200 bg-brand-red-50 p-6">
      <div className="flex flex-wrap items-baseline gap-3">
        <span className="text-6xl font-semibold leading-none text-brand-red">
          {drift.length}
        </span>
        <h3 className="text-2xl font-semibold text-ink">
          check đã đổi giá trị đo — mà không hề FAIL
        </h3>
      </div>
      <p className="mt-2 max-w-4xl text-lg leading-relaxed text-ink-soft">
        Tín hiệu có ở đó. Luật thì không quan tâm.
      </p>
      <ul className="mt-5 flex flex-col gap-3">
        {drift.map((check) => (
          <li
            key={check.key}
            className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border border-brand-red-200 bg-surface px-5 py-4"
          >
            <span className="font-mono text-xl font-semibold text-ink">{check.key}</span>
            <span className="flex items-center gap-3">
              <span className="font-mono text-2xl font-semibold text-brand-blue">
                {describeCheckValue(check.before)}
              </span>
              <span aria-hidden className="text-xl text-ink-faint">
                →
              </span>
              <span className="font-mono text-2xl font-semibold text-brand-red">
                {describeCheckValue(check.after)}
              </span>
            </span>
            <span className="ml-auto flex items-center gap-3">
              <span className="text-base text-ink-soft">
                luật:{" "}
                <span className="font-mono font-semibold text-ink">
                  {describeCheckValue(check.expected)}
                </span>
              </span>
              <Verdict
                status={check.status}
                passed={check.passed}
                passLabel={passLabel}
              />
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Demoted detail                                                              */
/* -------------------------------------------------------------------------- */

function SpecTable({ spec }: { spec: PipelineSpec }) {
  const corruption = spec.corruption_spec;
  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <StatTile label="seed" value={corruption.seed} tone="red" />
        <StatTile
          label="min_surviving_rows"
          value={corruption.min_surviving_rows}
          hint="chặn dưới để dataset không bị xoá sạch"
        />
        <StatTile label="số dạng lỗi" value={corruption.kinds.length} />
      </div>
      <DataTable
        columns={[
          {
            key: "type",
            header: "type",
            cellClassName: "whitespace-nowrap font-mono text-xs font-semibold",
            render: (row) => row.type,
          },
          {
            key: "pillar",
            header: "pillar",
            cellClassName: "whitespace-nowrap text-xs",
            render: (row) => row.pillar,
          },
          {
            key: "fraction",
            header: "fraction",
            cellClassName: "whitespace-nowrap text-right font-mono tabular-nums text-xs",
            headerClassName: "text-right",
            render: (row) => formatFraction(row.fraction),
          },
          {
            key: "detail",
            header: "detail",
            cellClassName: "min-w-[18rem] text-xs",
            render: (row) => row.detail,
          },
        ]}
        rows={corruption.kinds}
        rowKey={(row) => row.type}
      />
    </div>
  );
}

function CorruptionLogTable({
  log,
  spec,
}: {
  log: CorruptionLog;
  spec: CorruptionSpec | null;
}) {
  const declaredByType = new Map(
    (spec?.kinds ?? []).map((kind) => [kind.type, kind] as const),
  );

  const columns: Column<CorruptionAction>[] = [
    {
      key: "type",
      header: "type",
      cellClassName: "whitespace-nowrap font-mono text-xs font-semibold",
      render: (row) => row.type,
    },
    {
      key: "pillar",
      header: "target_pillar",
      cellClassName: "whitespace-nowrap text-xs",
      render: (row) => <Badge tone="red">{row.target_pillar}</Badge>,
    },
    {
      key: "declared",
      header: "fraction (spec)",
      cellClassName: "whitespace-nowrap text-right font-mono tabular-nums text-xs",
      headerClassName: "text-right",
      render: (row) => {
        const declared = declaredByType.get(row.type);
        return declared ? formatFraction(declared.fraction) : "—";
      },
    },
    {
      key: "rows",
      header: "rows_affected",
      cellClassName: "whitespace-nowrap text-right font-mono tabular-nums",
      headerClassName: "text-right",
      render: (row) => formatInt(row.rows_affected),
    },
    {
      key: "ids",
      header: "paper_ids",
      cellClassName: "min-w-[18rem] max-w-[28rem] text-xs",
      render: (row) => (
        <span className="flex flex-wrap gap-1">
          {(row.paper_ids ?? []).map((id, index) => (
            <span
              key={`${id}-${index}`}
              className="break-anywhere rounded bg-canvas px-1.5 py-0.5 font-mono text-[11px] text-ink-soft"
            >
              {id}
            </span>
          ))}
        </span>
      ),
    },
    {
      key: "detail",
      header: "detail",
      cellClassName: "min-w-[16rem] max-w-[24rem] text-xs",
      render: (row) => row.detail || "—",
    },
    {
      key: "examples",
      header: "examples",
      cellClassName: "min-w-[8rem] text-xs",
      render: (row) =>
        row.examples && row.examples.length > 0 ? (
          <details>
            <summary className="cursor-pointer text-brand-blue">
              {row.examples.length} ví dụ
            </summary>
            <pre className="scroll-shell mt-1 max-h-64 max-w-[24rem] overflow-auto rounded border border-line bg-canvas p-2 font-mono text-[11px] text-ink">
              <code>{JSON.stringify(row.examples, null, 2)}</code>
            </pre>
          </details>
        ) : (
          <span className="text-ink-faint">—</span>
        ),
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      <KeyValueList
        items={[
          { label: "Sinh lúc", value: <Mono>{formatTimestamp(log.generated_at)}</Mono> },
          { label: "Seed", value: <Mono>{String(log.seed)}</Mono> },
          {
            label: "Totals",
            value:
              log.totals && Object.keys(log.totals).length > 0 ? (
                <span className="flex flex-wrap gap-1.5">
                  {Object.entries(log.totals).map(([type, count]) => (
                    <span
                      key={type}
                      className="rounded border border-line bg-canvas px-2 py-0.5 font-mono text-sm text-ink-soft"
                    >
                      {type}: <span className="text-ink">{formatInt(count)}</span>
                    </span>
                  ))}
                </span>
              ) : (
                <span className="text-ink-faint">—</span>
              ),
          },
        ]}
      />
      <DataTable
        columns={columns}
        rows={log.actions ?? []}
        rowKey={(row, index) => `${row.type}-${index}`}
        footer={`${formatInt((log.actions ?? []).length)} action ghi trong log.`}
        emptyMessage="Log tồn tại nhưng mảng actions rỗng."
      />
    </div>
  );
}
