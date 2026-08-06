"use client";

import Link from "next/link";
import { getArtifactIndex, getPipelineSpec } from "@/lib/api";
import { formatBytes, formatTimestamp } from "@/lib/format";
import {
  DERIVED_STAGES,
  orderedStages,
  STAGE_ARTIFACTS,
  STAGE_ROUTE,
} from "@/lib/stage-map";
import { useArtifact } from "@/lib/use-artifact";
import type { ArtifactStatus, PipelineSpec } from "@/lib/types";
import { ArtifactBoundary } from "@/components/artifact-state";
import { Column, DataTable } from "@/components/data-table";
import {
  Badge,
  CommandBlock,
  KeyValueList,
  Mono,
  PageHeading,
  PageShell,
  Panel,
  PathChip,
  StatTile,
} from "@/components/ui";

export default function OverviewPage() {
  const spec = useArtifact(getPipelineSpec);
  const index = useArtifact(getArtifactIndex);

  return (
    <PageShell>
      <PageHeading
        eyebrow="Overview"
        title="Pipeline map"
        lede="Toàn bộ luồng crawl → clean → index → evaluate → observe → corrupt → repair → compare. Trạng thái mỗi stage được suy ra từ việc artifact của nó đã tồn tại trên đĩa hay chưa — không phải từ một trạng thái ghi cứng nào."
      />

      <Panel
        title="Cấu hình pipeline"
        subtitle={
          <>
            Đọc từ <Mono>data/pipeline_spec.json</Mono>, file này do{" "}
            <Mono>script/export_pipeline_spec.py</Mono> sinh ra trực tiếp từ hằng số
            Python. Frontend không giữ bản sao của bất kỳ giá trị nào ở đây.
          </>
        }
      >
        <ArtifactBoundary state={spec} label="pipeline_spec.json">
          {(data) => <SpecSummary spec={data} />}
        </ArtifactBoundary>
      </Panel>

      <Panel
        title="Các stage của pipeline"
        subtitle="Mỗi stage liệt kê artifact mà nó sinh ra và lệnh tạo ra artifact đó. Mô tả stage lấy nguyên văn từ pipeline_spec.stages."
      >
        {spec.status === "ok" ? (
          <ArtifactBoundary state={index} label="chỉ mục artifact">
            {(indexData) => (
              <StageList spec={spec.data} artifacts={indexData.artifacts} />
            )}
          </ArtifactBoundary>
        ) : (
          <ArtifactBoundary state={spec} label="pipeline_spec.json">
            {() => null}
          </ArtifactBoundary>
        )}
      </Panel>

      <Panel
        title="Chỉ mục artifact"
        subtitle="Tồn tại / kích thước / thời điểm sửa đổi của từng đường dẫn khai báo trong pipeline_spec.artifacts, đọc bằng fs.stat lúc request."
        aside={
          index.status === "ok" ? (
            <Badge tone="blue">
              {index.data.artifacts.filter((a) => a.exists).length}/
              {index.data.artifacts.length} tồn tại
            </Badge>
          ) : null
        }
      >
        <ArtifactBoundary state={index} label="chỉ mục artifact">
          {(data) => <ArtifactTable index={data.artifacts} dataDir={data.data_dir} />}
        </ArtifactBoundary>
      </Panel>
    </PageShell>
  );
}

/* -------------------------------------------------------------------------- */

function SpecSummary({ spec }: { spec: PipelineSpec }) {
  return (
    <div className="flex flex-col gap-5">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label="Source API" value={spec.source.api} tone="blue" />
        <StatTile label="max_results" value={spec.source.max_results} />
        <StatTile label="top_k" value={spec.retrieval.top_k} />
        <StatTile
          label="freshness threshold"
          value={spec.freshness.threshold_days}
          hint="ngày"
        />
      </div>

      <KeyValueList
        items={[
          {
            label: "Spec sinh lúc",
            value: <span className="font-mono">{formatTimestamp(spec.generated_at)}</span>,
          },
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
              <span className="flex flex-wrap gap-1.5">
                {Object.entries(spec.retrieval.collections).map(([key, value]) => (
                  <span key={key} className="text-xs text-ink-soft">
                    <span className="text-ink-faint">{key}:</span> <Mono>{value}</Mono>
                  </span>
                ))}
              </span>
            ),
          },
        ]}
      />
    </div>
  );
}

/* -------------------------------------------------------------------------- */

function StageList({
  spec,
  artifacts,
}: {
  spec: PipelineSpec;
  artifacts: ArtifactStatus[];
}) {
  const byName = new Map(artifacts.map((artifact) => [artifact.name, artifact]));
  const stages = orderedStages(Object.keys(spec.stages ?? {}));

  const resolved = stages.map((stage) => {
    const names = STAGE_ARTIFACTS[stage] ?? [];
    const entries = names
      .map((name) => byName.get(name))
      .filter((entry): entry is ArtifactStatus => Boolean(entry));
    const present = entries.filter((entry) => entry.exists).length;
    return {
      stage,
      entries,
      present,
      total: entries.length,
      done: entries.length > 0 && present === entries.length,
      description: spec.stages?.[stage] ?? null,
      commands: Array.from(new Set(entries.map((entry) => entry.command))),
    };
  });

  return (
    <div className="flex flex-col gap-5">
      <FlowStrip
        steps={resolved.map((item) => ({ stage: item.stage, done: item.done }))}
      />

      <ol className="flex flex-col gap-3">
        {resolved.map((item, position) => (
          <li
            key={item.stage}
            className="rounded-lg border border-line bg-surface p-4"
          >
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-blue text-[11px] font-semibold text-white">
                {position + 1}
              </span>
              <h3 className="font-mono text-sm font-semibold text-ink">{item.stage}</h3>
              <Badge tone={item.done ? "ok" : "muted"}>
                {item.done ? "done" : "pending"}
              </Badge>
              <span className="text-xs text-ink-faint">
                {item.present}/{item.total} artifact
              </span>
              {DERIVED_STAGES.has(item.stage) ? (
                <Badge tone="neutral">view suy ra</Badge>
              ) : null}
              {STAGE_ROUTE[item.stage] ? (
                <Link
                  href={STAGE_ROUTE[item.stage]}
                  className="ml-auto text-xs font-medium text-brand-blue underline underline-offset-2 hover:text-brand-blue-700"
                >
                  Xem chi tiết →
                </Link>
              ) : null}
            </div>

            <p className="mt-2 text-sm leading-relaxed text-ink-soft">
              {item.description ?? (
                <span className="text-ink-faint">
                  Không có mô tả trong <code className="font-mono">pipeline_spec.stages</code>{" "}
                  — stage này chỉ là view tổng hợp của frontend.
                </span>
              )}
            </p>

            {item.entries.length > 0 ? (
              <ul className="mt-3 flex flex-col gap-1.5">
                {item.entries.map((entry) => (
                  <li key={entry.name} className="flex flex-wrap items-center gap-2">
                    <span
                      aria-hidden
                      className={`inline-block h-1.5 w-1.5 rounded-full ${
                        entry.exists ? "bg-ok" : "bg-line"
                      }`}
                    />
                    <span className="font-mono text-xs text-ink-faint">
                      {entry.name}
                    </span>
                    <PathChip path={entry.path} />
                    {entry.exists ? null : (
                      <span className="text-[11px] uppercase tracking-wide text-ink-faint">
                        chưa có
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-3 text-xs text-ink-faint">
                Không có artifact nào được ánh xạ tới stage này.
              </p>
            )}

            {item.commands.length > 0 ? (
              <div className="mt-3 flex flex-col gap-1.5">
                {item.commands.map((command) => (
                  <CommandBlock key={command} command={command} />
                ))}
              </div>
            ) : null}
          </li>
        ))}
      </ol>
    </div>
  );
}

function FlowStrip({ steps }: { steps: { stage: string; done: boolean }[] }) {
  return (
    <div className="scroll-shell -mx-5 overflow-x-auto px-5">
      <ol className="flex min-w-max items-center gap-1">
        {steps.map((step, position) => (
          <li key={step.stage} className="flex items-center gap-1">
            <span
              className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-medium ${
                step.done
                  ? "border-ok-200 bg-ok-50 text-ok"
                  : "border-line bg-canvas text-ink-faint"
              }`}
            >
              <span
                aria-hidden
                className={`inline-block h-1.5 w-1.5 rounded-full ${
                  step.done ? "bg-ok" : "bg-line"
                }`}
              />
              <span className="font-mono">{step.stage}</span>
            </span>
            {position < steps.length - 1 ? (
              <span aria-hidden className="text-line">
                →
              </span>
            ) : null}
          </li>
        ))}
      </ol>
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
