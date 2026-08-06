"use client";

import { useCallback, useState } from "react";
import { getCleanDataset, getCorruptionLog, getPipelineSpec } from "@/lib/api";
import { formatFraction, formatInt, formatTimestamp } from "@/lib/format";
import { useArtifact } from "@/lib/use-artifact";
import type {
  CorruptionAction,
  CorruptionLog,
  CorruptionSpec,
  DatasetState,
} from "@/lib/types";
import { ArtifactBoundary } from "@/components/artifact-state";
import { CleanRowsTable } from "@/components/clean-rows-table";
import { Column, DataTable } from "@/components/data-table";
import {
  Badge,
  Collapsible,
  KeyValueList,
  Mono,
  Note,
  PageHeading,
  PageShell,
  Panel,
  StatTile,
} from "@/components/ui";

const DATASET_TABS: { state: Exclude<DatasetState, "clean">; label: string; artifact: string }[] =
  [
    { state: "corrupted", label: "Corrupted", artifact: "data/clean/papers_clean_corrupted.json" },
    { state: "repaired", label: "Repaired", artifact: "data/clean/papers_clean_repaired.json" },
  ];

export default function CorruptPage() {
  const spec = useArtifact(getPipelineSpec);
  const log = useArtifact(getCorruptionLog);

  const [dataset, setDataset] = useState<Exclude<DatasetState, "clean">>("corrupted");
  const rows = useArtifact(useCallback(() => getCleanDataset(dataset), [dataset]));

  return (
    <PageShell>
      <PageHeading
        eyebrow="Stage 6 · corrupt"
        title="Data bị làm xấu như nào"
        lede="Sáu dạng lỗi được cố ý bơm vào dataset sạch, mỗi dạng nhắm vào một trụ observability khác nhau. Toàn bộ được seed cố định để lần chạy nào cũng cho ra cùng một bộ dữ liệu hỏng."
      />

      <Panel
        title="Corruption spec"
        subtitle={
          <>
            Từ <Mono>pipeline_spec.corruption_spec</Mono>. Đây là ý định khai báo; phần
            thực sự đã xảy ra nằm ở <Mono>corruption_log.json</Mono> bên dưới.
          </>
        }
        tone="alert"
      >
        <ArtifactBoundary state={spec} label="pipeline_spec.json">
          {(data) => <CorruptionSpecView spec={data.corruption_spec} />}
        </ArtifactBoundary>
      </Panel>

      <Panel
        title="Corruption log"
        subtitle={
          <>
            Từ <Mono>data/results/corruption_log.json</Mono> — số dòng và paper_id thật sự
            bị tác động.
          </>
        }
        tone="alert"
        aside={
          log.status === "ok" ? (
            <Badge tone="red">seed {log.data.seed}</Badge>
          ) : null
        }
      >
        <ArtifactBoundary state={log} label="corruption_log.json">
          {(data) => (
            <CorruptionLogView
              log={data}
              spec={spec.status === "ok" ? spec.data.corruption_spec : null}
            />
          )}
        </ArtifactBoundary>
      </Panel>

      <Panel
        title="Dataset sau corrupt / repair"
        subtitle="Cùng contract 16 cột như dataset sạch, để so trực tiếp từng dòng."
        aside={
          <div className="flex gap-1 rounded-md border border-line bg-canvas p-1">
            {DATASET_TABS.map((tab) => (
              <button
                key={tab.state}
                type="button"
                onClick={() => setDataset(tab.state)}
                aria-pressed={dataset === tab.state}
                className={`rounded px-3 py-1 text-xs font-semibold transition-colors ${
                  dataset === tab.state
                    ? "bg-brand-blue text-white"
                    : "text-ink-soft hover:text-brand-blue"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        }
      >
        <div className="flex flex-col gap-3">
          <p className="text-xs text-ink-faint">
            Đang xem{" "}
            <span className="font-mono">
              {DATASET_TABS.find((tab) => tab.state === dataset)?.artifact}
            </span>
          </p>
          <ArtifactBoundary state={rows} label={`dataset ${dataset}`}>
            {(data) => (
              <CleanRowsTable
                rows={data}
                contractColumns={
                  spec.status === "ok" ? spec.data.clean_contract.columns : undefined
                }
                derivedColumns={
                  spec.status === "ok" ? spec.data.clean_contract.derived_columns : undefined
                }
              />
            )}
          </ArtifactBoundary>
        </div>
      </Panel>
    </PageShell>
  );
}

/* -------------------------------------------------------------------------- */

function CorruptionSpecView({ spec }: { spec: CorruptionSpec }) {
  return (
    <div className="flex flex-col gap-5">
      <div className="grid gap-3 sm:grid-cols-3">
        <StatTile label="seed" value={spec.seed} tone="red" hint="cố định" />
        <StatTile
          label="min_surviving_rows"
          value={spec.min_surviving_rows}
          hint="chặn dưới để dataset không bị xoá sạch"
        />
        <StatTile label="số dạng lỗi" value={spec.kinds.length} />
      </div>

      <Note tone="warn">
        Corruption dùng seed cố định (<Mono>{String(spec.seed)}</Mono>) nên cùng một dataset
        đầu vào sẽ luôn hỏng theo đúng cùng một cách. Nhờ vậy phép so baseline ↔ corrupted ↔
        repaired là tái lập được, và mọi chênh lệch metric quy về chất lượng dữ liệu chứ
        không phải nhiễu ngẫu nhiên.
      </Note>

      <ul className="grid gap-3 lg:grid-cols-2">
        {spec.kinds.map((kind, index) => (
          <li
            key={kind.type}
            className="flex flex-col gap-2 rounded-lg border border-brand-red-200 bg-brand-red-50/50 p-4"
          >
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-brand-red text-[11px] font-semibold text-white">
                {index + 1}
              </span>
              <span className="break-anywhere font-mono text-sm font-semibold text-ink">
                {kind.type}
              </span>
              <span className="ml-auto font-mono text-sm font-semibold tabular-nums text-brand-red-700">
                {formatFraction(kind.fraction)}
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[11px] uppercase tracking-wide text-ink-faint">
                pillar
              </span>
              {kind.pillar.split("+").map((pillar) => (
                <Badge key={pillar} tone="red">
                  {pillar}
                </Badge>
              ))}
            </div>
            <p className="text-[13px] leading-relaxed text-ink-soft">{kind.detail}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* -------------------------------------------------------------------------- */

function CorruptionLogView({
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
      render: (row) => <PaperIds ids={row.paper_ids} />,
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

  const rowsDelta = log.rows_after - log.rows_before;
  const idsDelta = log.unique_paper_ids_after - log.unique_paper_ids_before;

  return (
    <div className="flex flex-col gap-5">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label="rows_before" value={formatInt(log.rows_before)} />
        <StatTile
          label="rows_after"
          value={formatInt(log.rows_after)}
          hint={`${rowsDelta >= 0 ? "+" : "−"}${formatInt(Math.abs(rowsDelta))} so với before`}
          tone={rowsDelta === 0 ? "neutral" : "red"}
        />
        <StatTile
          label="unique_paper_ids_before"
          value={formatInt(log.unique_paper_ids_before)}
        />
        <StatTile
          label="unique_paper_ids_after"
          value={formatInt(log.unique_paper_ids_after)}
          hint={`${idsDelta >= 0 ? "+" : "−"}${formatInt(Math.abs(idsDelta))} so với before`}
          tone={idsDelta === 0 ? "neutral" : "red"}
        />
      </div>

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
                      className="rounded border border-line bg-canvas px-2 py-0.5 font-mono text-[12px] text-ink-soft"
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

function PaperIds({ ids }: { ids: string[] }) {
  if (!Array.isArray(ids) || ids.length === 0) {
    return <span className="text-ink-faint">—</span>;
  }
  const preview = ids.slice(0, 4);
  return (
    <div className="flex flex-col gap-1">
      <span className="flex flex-wrap gap-1">
        {preview.map((id, index) => (
          <span
            key={`${id}-${index}`}
            className="break-anywhere rounded bg-canvas px-1.5 py-0.5 font-mono text-[11px] text-ink-soft"
          >
            {id}
          </span>
        ))}
      </span>
      {ids.length > preview.length ? (
        <Collapsible summary={`Xem đủ ${ids.length} paper_id`}>
          <ul className="flex flex-wrap gap-1">
            {ids.map((id, index) => (
              <li
                key={`${id}-${index}`}
                className="break-anywhere rounded bg-canvas px-1.5 py-0.5 font-mono text-[11px] text-ink-soft"
              >
                {id}
              </li>
            ))}
          </ul>
        </Collapsible>
      ) : null}
    </div>
  );
}
